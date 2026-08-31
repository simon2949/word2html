import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GENERATION_API_VERSION,
  editLessonPlan,
  generateLessonPlan,
  repairLessonPlan,
} from './minimax.mjs'
import {
  createLessonDirectory,
  createSubmissionRateLimiter,
} from './lesson-directory.mjs'
import { createAdminSessionManager } from './admin-session.mjs'
import { createCapabilitySubjectReviewStore } from './capability-subject-reviews.mjs'
import {
  LESSON_REVIEW_STANDARD_VERSION,
  reviewLessonPackage,
} from './lesson-pre-review.mjs'
import { testModelProviderConnection } from './model-provider.mjs'
import { createModelSettingsStore } from './model-settings.mjs'
import {
  ModelUsageLimitError,
  createModelUsageGuard,
  modelAccountKey,
  modelClientKey,
  requestFingerprint,
  requestIdempotencyKey,
} from './model-usage-guard.mjs'
import {
  TemporaryModelAccessError,
  applyTemporaryModelCredential,
  readTemporaryModelCredential,
} from './temporary-model-access.mjs'
import { createUserDirectory } from './user-directory.mjs'
import { createUserSessionManager } from './user-session.mjs'
import { checkOperationalReadiness, securityHeaders } from './operational-readiness.mjs'
import { createOperationalEventStore } from './operational-events.mjs'
import { loadEnvironmentSecretFiles } from './environment-secrets.mjs'
import { requestClientAddress as resolveRequestClientAddress } from './request-client-address.mjs'
import {
  createConfiguredStorageBackend,
  SQLITE_MAINTENANCE_MODE,
} from './storage-backend.mjs'

loadEnvironmentSecretFiles(process.env)

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const production = process.argv.includes('--production')

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const host = argument('--host', process.env.HOST || '127.0.0.1')
const port = Number(argument('--port', process.env.PORT || '5173'))
const maintenanceMode = process.env.WORD2HTML_MAINTENANCE_MODE === 'true'
const trustProxy = process.env.WORD2HTML_TRUST_PROXY === 'true'
const storageBackendName = process.env.WORD2HTML_STORAGE_BACKEND?.trim() || 'json'
const sqliteMode = process.env.WORD2HTML_SQLITE_MODE?.trim() || SQLITE_MAINTENANCE_MODE
const sqliteActivationConfirmation = process.env.WORD2HTML_SQLITE_ACTIVATION_CONFIRM?.trim() || ''
const maxBodyBytes = 128 * 1024
const operationalEvents = createOperationalEventStore({
  maxEvents: Number(process.env.WORD2HTML_OPERATIONAL_EVENT_LIMIT) || 200,
})
const libraryDataFile = resolve(
  projectRoot,
  argument('--library-file', process.env.WORD2HTML_LIBRARY_FILE || '.word2html-data/lesson-directory.json'),
)
const capabilityReviewDataFile = resolve(
  projectRoot,
  argument(
    '--capability-review-file',
    process.env.WORD2HTML_CAPABILITY_REVIEWS_FILE || '.word2html-data/capability-subject-reviews.json',
  ),
)
const modelSettingsDataFile = resolve(
  projectRoot,
  argument('--model-settings-file', process.env.WORD2HTML_MODEL_SETTINGS_FILE || '.word2html-data/model-settings.json'),
)
const userDirectoryDataFile = resolve(
  projectRoot,
  argument('--user-directory-file', process.env.WORD2HTML_USER_DIRECTORY_FILE || '.word2html-data/users.json'),
)
const sqliteShadowDataFile = process.env.WORD2HTML_SQLITE_SHADOW_FILE?.trim()
  ? resolve(projectRoot, process.env.WORD2HTML_SQLITE_SHADOW_FILE.trim())
  : ''
const sqliteRuntimeDataFile = process.env.WORD2HTML_SQLITE_RUNTIME_FILE?.trim()
  ? resolve(projectRoot, process.env.WORD2HTML_SQLITE_RUNTIME_FILE.trim())
  : ''
const libraryAdminToken = process.env.WORD2HTML_ADMIN_TOKEN?.trim() ?? ''
const defaultDailyCalls = Math.min(10_000, Math.max(1, Number(process.env.WORD2HTML_USER_DAILY_CALLS) || 20))
const defaultDailyTokens = Math.min(100_000_000, Math.max(1000, Number(process.env.WORD2HTML_USER_DAILY_TOKENS) || 100_000))
const jsonStores = {
  lessons: createLessonDirectory({ dataFile: libraryDataFile }),
  capabilityReviews: createCapabilitySubjectReviewStore({ dataFile: capabilityReviewDataFile }),
  modelSettings: createModelSettingsStore({ dataFile: modelSettingsDataFile }),
  users: createUserDirectory({
  dataFile: userDirectoryDataFile,
    defaultDailyCalls,
    defaultDailyTokens,
  }),
}
let storageBackend
try {
  storageBackend = await createConfiguredStorageBackend({
    name: storageBackendName,
    jsonStores,
    sqliteRuntimeFile: sqliteRuntimeDataFile,
    environment: process.env,
    maintenanceMode,
    sqliteMode,
    activationConfirmation: sqliteActivationConfirmation,
    userDefaults: { defaultDailyCalls, defaultDailyTokens },
  })
} catch {
  operationalEvents.record({
    severity: 'critical',
    category: 'storage',
    code: 'storage-initialization-failed',
    summary: '存储后端初始化失败，服务未启动。',
    context: { backend: storageBackendName, mode: sqliteMode },
  })
  throw new Error('存储后端初始化失败，详情见结构化运行日志。')
}
const lessonDirectory = storageBackend.lessons
const capabilitySubjectReviews = storageBackend.capabilityReviews
const modelSettings = storageBackend.modelSettings
const userDirectory = storageBackend.users
const modelUsageGuard = createModelUsageGuard()
const modelUsageHashSecret = process.env.WORD2HTML_MODEL_USAGE_HASH_SECRET?.trim()
  || libraryAdminToken
  || 'word2html-model-usage'
const userSessionSecret = createHash('sha256')
  .update(process.env.WORD2HTML_USER_SESSION_SECRET?.trim() || `${modelUsageHashSecret}|user-session`)
  .digest('hex')
const submissionLimit = Math.min(200, Math.max(1, Number(process.env.WORD2HTML_SUBMISSION_LIMIT) || 20))
const submissionRateLimiter = createSubmissionRateLimiter({ limit: submissionLimit })
const adminLoginRateLimiter = createSubmissionRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 })
const userLoginRateLimiter = createSubmissionRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 })
const adminSessions = createAdminSessionManager({
  configuredToken: libraryAdminToken,
  secure: process.env.WORD2HTML_SECURE_COOKIES === 'true',
})
const userSessions = createUserSessionManager({
  secret: userSessionSecret,
  secure: process.env.WORD2HTML_SECURE_COOKIES === 'true',
})
let readinessUnavailable = false

const requestClientAddress = (req) => resolveRequestClientAddress(req, { trustProxy })

function usageForReplay(value, replayed) {
  if (!value || typeof value !== 'object') return value
  if (!replayed) return value
  return {
    ...value,
    usage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      modelCalls: 0,
      repaired: false,
      deduplicated: true,
    },
  }
}

function userUsageIdentity(user) {
  return {
    accountId: user.id,
    limits: {
      dailyCalls: user.quota.dailyCalls,
      dailyTokens: user.quota.dailyTokens,
      concurrency: 1,
    },
  }
}

async function controlledModelCall(req, scope, body, config, operation, options = {}) {
  const credentialMode = options.credentialMode ?? 'platform'
  const usageIdentity = options.usageIdentity
  const fingerprint = requestFingerprint({
    request: body,
    modelId: config.catalogId,
    credentialMode,
  })
  const controlled = await modelUsageGuard.run({
    scope,
    clientKey: usageIdentity
      ? modelAccountKey(usageIdentity.accountId, modelUsageHashSecret)
      : modelClientKey(req, modelUsageHashSecret, requestClientAddress(req)),
    idempotencyKey: requestIdempotencyKey(req, fingerprint),
    fingerprint,
    costRates: {
      inputCostPerMillion: credentialMode === 'platform' ? config.inputCostPerMillion : 0,
      outputCostPerMillion: credentialMode === 'platform' ? config.outputCostPerMillion : 0,
    },
    ...(usageIdentity ? { clientLimits: usageIdentity.limits } : {}),
  }, operation)
  operationalEvents.resolve({ category: 'model', code: 'model-platform-limit-reached' })
  return usageForReplay(controlled.value, controlled.replayed)
}

function isPlatformModelLimit(error) {
  return error instanceof ModelUsageLimitError && (
    error.code.startsWith('platform-') || error.code === 'global-concurrency'
  )
}

function recordPlatformModelLimit(error) {
  if (!isPlatformModelLimit(error)) return
  operationalEvents.record({
    severity: 'warning',
    category: 'model',
    code: 'model-platform-limit-reached',
    summary: '平台模型用量或并发保护已触发。',
    context: { limitCode: error.code },
  })
}

function modelLimitResponse(res, error) {
  recordPlatformModelLimit(error)
  json(res, error.status, {
    error: error.message,
    code: error.code,
    retryAfterSeconds: error.retryAfterSeconds,
  }, { 'Retry-After': String(error.retryAfterSeconds) })
}

async function runAndStorePreReview(id, lessonPackage, req, usageIdentity) {
  try {
    const config = await modelSettings.config('review')
    const review = await controlledModelCall(
      req,
      'pre-review',
      { id, lessonPackage },
      config,
      () => reviewLessonPackage(lessonPackage, { config }),
      usageIdentity ? { usageIdentity } : undefined,
    )
    operationalEvents.resolve({ category: 'model', code: 'lesson-pre-review-failed' })
    return await lessonDirectory.completePreReview(id, review)
  } catch (error) {
    if (isPlatformModelLimit(error)) recordPlatformModelLimit(error)
    else if (!(error instanceof ModelUsageLimitError)) {
      operationalEvents.record({
        severity: 'warning',
        category: 'model',
        code: 'lesson-pre-review-failed',
        summary: '第三方场景 AI 预审失败。',
        context: { operation: 'pre-review' },
      })
    }
    return lessonDirectory.failPreReview(id, error)
  }
}

async function storageShadowStatus() {
  if (storageBackend.name === 'sqlite') {
    try {
      return storageBackend.adminStatus()
    } catch {
      operationalEvents.record({
        severity: 'error',
        category: 'storage',
        code: 'sqlite-runtime-status-failed',
        summary: 'SQLite 运行库状态检查失败。',
        context: { mode: storageBackend.active ? 'active' : 'pilot' },
      })
      return {
        status: 'unavailable',
        checkedAt: new Date().toISOString(),
        mode: storageBackend.active ? 'sqlite-single-instance-active' : 'sqlite-maintenance-pilot',
        checks: [],
      }
    }
  }
  if (!sqliteShadowDataFile) {
    return { status: 'not-configured', mode: 'json-primary', checks: [] }
  }
  let shadow
  try {
    const { compareJsonAndSqliteStores, createSqliteShadowStore } = await import('./sqlite-shadow-store.mjs')
    shadow = createSqliteShadowStore({ databaseFile: sqliteShadowDataFile })
    return await compareJsonAndSqliteStores({
      jsonStores: {
        users: jsonStores.users,
        lessons: jsonStores.lessons,
        capabilityReviews: jsonStores.capabilityReviews,
        modelSettings: jsonStores.modelSettings,
      },
      sqliteStore: shadow,
    })
  } catch {
    operationalEvents.record({
      severity: 'warning',
      category: 'storage',
      code: 'sqlite-shadow-comparison-failed',
      summary: 'SQLite 影子数据对比失败。',
      context: { mode: 'read-only-shadow' },
    })
    return {
      status: 'unavailable',
      checkedAt: new Date().toISOString(),
      mode: 'json-primary-sqlite-read-only',
      checks: [],
    }
  } finally {
    shadow?.close()
  }
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...securityHeaders(),
    ...headers,
  })
  res.end(JSON.stringify(body))
}

function requireAdmin(req, res, { csrf = false } = {}) {
  if (!libraryAdminToken) {
    json(res, 503, { error: '管理员审核接口尚未配置 WORD2HTML_ADMIN_TOKEN。' })
    return undefined
  }
  const authorization = adminSessions.authorize(req.headers, { requireCsrf: csrf })
  if (!authorization.authorized) {
    json(
      res,
      authorization.reason === 'csrf' ? 403 : 401,
      { error: authorization.reason === 'csrf' ? '管理员会话安全校验失败，请刷新页面后重试。' : '管理员登录已失效或令牌无效。' },
    )
    return undefined
  }
  return authorization
}

async function requireUser(req, res, { csrf = false } = {}) {
  const authorization = userSessions.authorize(req.headers, { requireCsrf: csrf })
  if (!authorization.authorized) {
    json(res, authorization.reason === 'csrf' ? 403 : 401, {
      error: authorization.reason === 'csrf' ? '用户会话安全校验失败，请刷新后重试。' : '此操作需要登录。',
      code: authorization.reason === 'csrf' ? 'user-csrf' : 'login-required',
    })
    return undefined
  }
  const user = await userDirectory.get(authorization.userId)
  if (!user || user.status !== 'active') {
    json(res, 403, { error: '账号已暂停或不存在。', code: 'user-paused' }, { 'Set-Cookie': userSessions.end() })
    return undefined
  }
  return { user, authorization }
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBodyBytes) throw new Error('请求内容过大。')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return JSON.parse(text || '{}')
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/ready' && req.method === 'GET') {
    const readiness = await checkOperationalReadiness({
      storageBackend: () => storageBackend.verify(),
      lessonDirectory: () => lessonDirectory.listForAdmin(),
      capabilityReviews: () => capabilitySubjectReviews.list(),
      modelSettings: () => modelSettings.get(),
      userDirectory: () => userDirectory.list(),
    })
    if (!readiness.ok) {
      readinessUnavailable = true
      operationalEvents.record({
        severity: 'error',
        category: 'storage',
        code: 'service-readiness-failed',
        summary: '服务就绪检查未通过。',
        context: {
          checks: Object.entries(readiness.checks)
            .filter(([, status]) => status !== 'ready')
            .map(([name]) => name),
        },
      })
    } else if (readinessUnavailable) {
      readinessUnavailable = false
      operationalEvents.resolve({ category: 'storage', code: 'service-readiness-failed' })
      operationalEvents.record({
        severity: 'info',
        category: 'storage',
        code: 'service-readiness-restored',
        summary: '服务就绪检查已恢复。',
      })
    }
    const ready = readiness.ok && !maintenanceMode
    json(res, ready ? 200 : 503, {
      apiVersion: GENERATION_API_VERSION,
      ...readiness,
      ok: ready,
      maintenanceMode,
      storage: storageBackend.publicStatus(),
    })
    return true
  }

  const maintenanceSessionAccess = url.pathname === '/api/admin/session' && ['POST', 'DELETE'].includes(req.method ?? '')
  if (maintenanceMode && !['GET', 'HEAD'].includes(req.method ?? 'GET') && !maintenanceSessionAccess) {
    json(res, 503, {
      error: '服务正在维护，暂时不接受写操作。',
      code: 'maintenance-mode',
    }, { 'Retry-After': '60' })
    return true
  }

  if (url.pathname === '/api/health' && req.method === 'GET') {
    json(res, 200, {
      ok: true,
      maintenanceMode,
      storage: storageBackend.publicStatus(),
      operations: operationalEvents.publicStatus(),
      storageShadow: { configured: Boolean(sqliteShadowDataFile) },
      apiVersion: GENERATION_API_VERSION,
      capabilities: [
        'reviewed-templates',
        'generic-function-2d',
        'geometry-primitives-2d',
        'relation-curve-2d',
        'collision-discs-2d',
        'time-experiment-point-2d',
        'time-experiment-vectors',
        'time-experiment-distance-lines',
        'time-experiment-label-modes',
        'time-experiment-multi-body',
        'time-experiment-constraints',
        'derived-metric-reuse',
        'contextual-scene-edit',
        'shared-lesson-directory',
        'ai-lesson-pre-review',
        'visual-admin-review',
        'admin-review-history',
        'capability-subject-review-workspace',
        'model-provider-profiles',
        'anthropic-compatible-models',
        'openai-compatible-models',
        'admin-model-settings',
        'admin-storage-shadow-comparison',
        'admin-operational-alerts',
        'structured-redacted-logs',
        'sqlite-maintenance-pilot',
        'sqlite-single-instance-active',
        'model-usage-guard',
        'model-daily-fuse',
        'model-request-idempotency',
        'temporary-user-api-key',
        'lightweight-user-session',
        'admin-user-quotas',
      ],
      lessonPreReview: { standardVersion: LESSON_REVIEW_STANDARD_VERSION },
      model: await modelSettings.publicStatus('generation'),
    })
    return true
  }

  if (url.pathname === '/api/model-options' && req.method === 'GET') {
    json(res, 200, {
      apiVersion: GENERATION_API_VERSION,
      ...(await modelSettings.publicOptions()),
    })
    return true
  }

  if (url.pathname === '/api/user/session' && req.method === 'POST') {
    const rate = userLoginRateLimiter.check(requestClientAddress(req))
    if (!rate.allowed) {
      json(res, 429, { error: `登录尝试过于频繁，请在约 ${rate.retryAfterSeconds} 秒后重试。` })
      return true
    }
    try {
      const body = await readJsonBody(req)
      const user = await userDirectory.consumeInvite(body.accessCode)
      if (!user) {
        json(res, 401, { error: '登录码无效、已使用或已过期。', code: 'invalid-access-code' })
        return true
      }
      const session = userSessions.start(user.id)
      json(res, 200, {
        authenticated: true,
        user,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
      }, { 'Set-Cookie': session.setCookie })
    } catch (error) {
      const message = error instanceof Error ? error.message : '用户登录失败。'
      json(res, 400, { error: message })
    }
    return true
  }

  if (url.pathname === '/api/user/session' && req.method === 'GET') {
    const current = await requireUser(req, res)
    if (!current) return true
    json(res, 200, {
      authenticated: true,
      user: current.user,
      csrfToken: current.authorization.csrfToken,
      expiresAt: current.authorization.expiresAt,
    })
    return true
  }

  if (url.pathname === '/api/user/session' && req.method === 'DELETE') {
    const current = await requireUser(req, res, { csrf: true })
    if (!current) return true
    json(res, 200, { authenticated: false }, { 'Set-Cookie': userSessions.end() })
    return true
  }

  if (url.pathname === '/api/library/entries' && req.method === 'GET') {
    json(res, 200, {
      apiVersion: GENERATION_API_VERSION,
      entries: await lessonDirectory.listPublic(),
    })
    return true
  }

  if (url.pathname === '/api/library/submissions' && req.method === 'POST') {
    const currentUser = await requireUser(req, res, { csrf: true })
    if (!currentUser) return true
    const rate = submissionRateLimiter.check(requestClientAddress(req))
    if (!rate.allowed) {
      json(res, 429, { error: `提交过于频繁，请在约 ${rate.retryAfterSeconds} 秒后重试。` })
      return true
    }
    try {
      const body = await readJsonBody(req)
      const result = await lessonDirectory.submit(
        body.lessonPackage,
        body.sourceFilename,
        body.revisionParentId,
      )
      const entry = result.shouldPreReview
        ? await runAndStorePreReview(
            result.entry.id,
            body.lessonPackage,
            req,
            userUsageIdentity(currentUser.user),
          )
        : result.entry
      json(res, result.duplicate ? 200 : 201, { duplicate: result.duplicate, entry })
    } catch (error) {
      const message = error instanceof Error ? error.message : '场景包提交失败。'
      json(res, 400, { error: message })
    }
    return true
  }

  if (url.pathname === '/api/library/submission-status' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const entry = await lessonDirectory.statusForSubmitter(body.lessonPackage)
      json(res, 200, { entry })
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法查询共享审核状态。'
      json(res, 400, { error: message })
    }
    return true
  }

  if (url.pathname === '/api/admin/session' && req.method === 'POST') {
    if (!libraryAdminToken) {
      json(res, 503, { error: '管理员审核页面尚未配置 WORD2HTML_ADMIN_TOKEN。' })
      return true
    }
    const rate = adminLoginRateLimiter.check(requestClientAddress(req))
    if (!rate.allowed) {
      json(res, 429, { error: `登录尝试过于频繁，请在约 ${rate.retryAfterSeconds} 秒后重试。` })
      return true
    }
    try {
      const body = await readJsonBody(req)
      const session = adminSessions.start(body.token)
      if (!session) {
        json(res, 401, { error: '管理员令牌无效。' })
        return true
      }
      json(res, 200, {
        authenticated: true,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
      }, { 'Set-Cookie': session.setCookie })
    } catch (error) {
      const message = error instanceof Error ? error.message : '管理员登录失败。'
      json(res, 400, { error: message })
    }
    return true
  }

  if (url.pathname === '/api/admin/session' && req.method === 'GET') {
    const authorization = requireAdmin(req, res)
    if (!authorization) return true
    json(res, 200, {
      authenticated: true,
      csrfToken: authorization.csrfToken,
      expiresAt: authorization.expiresAt,
      method: authorization.method,
    })
    return true
  }

  if (url.pathname === '/api/admin/session' && req.method === 'DELETE') {
    const authorization = requireAdmin(req, res, { csrf: true })
    if (!authorization) return true
    json(res, 200, { authenticated: false }, { 'Set-Cookie': adminSessions.end(req.headers) })
    return true
  }

  if (url.pathname === '/api/admin/library/submissions' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return true
    json(res, 200, { entries: await lessonDirectory.listForAdmin() })
    return true
  }

  if (url.pathname === '/api/admin/model-settings' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return true
    json(res, 200, { settings: await modelSettings.get() })
    return true
  }

  if (url.pathname === '/api/admin/model-settings' && req.method === 'PATCH') {
    if (!requireAdmin(req, res, { csrf: true })) return true
    try {
      const body = await readJsonBody(req)
      json(res, 200, { settings: await modelSettings.update(body) })
    } catch (error) {
      const message = error instanceof Error ? error.message : '模型设置保存失败。'
      json(res, 400, { error: message })
    }
    return true
  }

  if (url.pathname === '/api/admin/model-settings/test' && req.method === 'POST') {
    if (!requireAdmin(req, res, { csrf: true })) return true
    try {
      const body = await readJsonBody(req)
      const profile = body.profile === 'review' ? 'review' : 'generation'
      const modelId = typeof body.modelId === 'string' ? body.modelId : undefined
      const config = await modelSettings.config(profile, modelId)
      if (!config.configured) throw new Error('该模型未配置 API Key。')
      const result = await controlledModelCall(
        req,
        'connection-test',
        { profile, modelId: config.catalogId },
        config,
        () => testModelProviderConnection(config),
      )
      operationalEvents.resolve({ category: 'model', code: 'model-connection-test-failed' })
      json(res, 200, { result: { ...result, profile, modelId: config.catalogId } })
    } catch (error) {
      if (error instanceof ModelUsageLimitError) {
        modelLimitResponse(res, error)
        return true
      }
      const message = error instanceof Error ? error.message : '模型连接测试失败。'
      const missingConfig = message.includes('未配置') || message.includes('API Key')
      if (!missingConfig) {
        operationalEvents.record({
          severity: 'warning',
          category: 'model',
          code: 'model-connection-test-failed',
          summary: '模型连接测试失败。',
          context: { operation: 'connection-test' },
        })
      }
      json(res, missingConfig ? 400 : 502, { error: message })
    }
    return true
  }

  if (url.pathname === '/api/admin/model-usage' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return true
    json(res, 200, { status: modelUsageGuard.status() })
    return true
  }

  if (url.pathname === '/api/admin/operational-events' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return true
    json(res, 200, { status: operationalEvents.snapshot() })
    return true
  }

  if (url.pathname === '/api/admin/storage-shadow' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return true
    json(res, 200, { status: await storageShadowStatus() })
    return true
  }

  if (url.pathname === '/api/admin/users' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return true
    const users = (await userDirectory.list()).map((user) => ({
      ...user,
      usage: modelUsageGuard.clientStatus(modelAccountKey(user.id, modelUsageHashSecret)),
    }))
    json(res, 200, { users })
    return true
  }

  if (url.pathname === '/api/admin/users' && req.method === 'POST') {
    if (!requireAdmin(req, res, { csrf: true })) return true
    try {
      const body = await readJsonBody(req)
      json(res, 201, await userDirectory.create(body))
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : '用户创建失败。' })
    }
    return true
  }

  const userInviteMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/invite$/)
  if (userInviteMatch && req.method === 'POST') {
    if (!requireAdmin(req, res, { csrf: true })) return true
    try {
      json(res, 200, await userDirectory.issueInvite(decodeURIComponent(userInviteMatch[1])))
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : '登录码签发失败。' })
    }
    return true
  }

  const userUpdateMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/)
  if (userUpdateMatch && req.method === 'PATCH') {
    if (!requireAdmin(req, res, { csrf: true })) return true
    try {
      const body = await readJsonBody(req)
      const user = await userDirectory.update(decodeURIComponent(userUpdateMatch[1]), body)
      json(res, 200, { user })
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : '用户设置保存失败。' })
    }
    return true
  }

  if (url.pathname === '/api/admin/capability-reviews' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return true
    json(res, 200, { records: await capabilitySubjectReviews.list() })
    return true
  }

  const capabilityReviewMatch = url.pathname.match(/^\/api\/admin\/capability-reviews\/([^/]+)$/)
  if (capabilityReviewMatch && req.method === 'PATCH') {
    if (!requireAdmin(req, res, { csrf: true })) return true
    try {
      const body = await readJsonBody(req)
      const capabilityId = decodeURIComponent(capabilityReviewMatch[1])
      const record = await capabilitySubjectReviews.update(capabilityId, body)
      json(res, 200, { record })
    } catch (error) {
      const message = error instanceof Error ? error.message : '能力学科复核记录更新失败。'
      json(res, 400, { error: message })
    }
    return true
  }

  const moderationMatch = url.pathname.match(/^\/api\/admin\/library\/submissions\/([^/]+)$/)
  const preReviewRetryMatch = url.pathname.match(/^\/api\/admin\/library\/submissions\/([^/]+)\/pre-review$/)
  if (preReviewRetryMatch && req.method === 'POST') {
    if (!requireAdmin(req, res, { csrf: true })) return true
    try {
      const id = decodeURIComponent(preReviewRetryMatch[1])
      const existing = await lessonDirectory.getForAdmin(id)
      await lessonDirectory.queuePreReview(id)
      await runAndStorePreReview(id, existing.lessonPackage, req)
      const entry = await lessonDirectory.getForAdmin(id)
      json(res, 200, { entry })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 预审重试失败。'
      json(res, 400, { error: message })
    }
    return true
  }

  if (moderationMatch && req.method === 'PATCH') {
    if (!requireAdmin(req, res, { csrf: true })) return true
    try {
      const body = await readJsonBody(req)
      const id = decodeURIComponent(moderationMatch[1])
      const entry = await lessonDirectory.moderate(id, body.reviewStatus, body.reviewNote)
      json(res, 200, { entry })
    } catch (error) {
      const message = error instanceof Error ? error.message : '审核状态更新失败。'
      json(res, 400, { error: message })
    }
    return true
  }

  if (url.pathname === '/api/generate' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
      if (!prompt) {
        json(res, 400, { error: '请输入教学内容描述。' })
        return true
      }
      if (prompt.length > 12000) {
        json(res, 400, { error: '教学内容描述不能超过 12000 个字符。' })
        return true
      }
      const correction = body.correction
      const edit = body.edit
      const temporaryCredential = readTemporaryModelCredential(req.headers)
      let configuredModel
      try {
        configuredModel = await modelSettings.config('generation', temporaryCredential?.modelId)
      } catch (error) {
        if (!temporaryCredential) throw error
        throw new TemporaryModelAccessError('所选临时模型已停用或不在可信目录中。')
      }
      const { config, credentialMode } = applyTemporaryModelCredential(configuredModel, temporaryCredential)
      const currentUser = credentialMode === 'platform'
        ? await requireUser(req, res, { csrf: true })
        : undefined
      if (credentialMode === 'platform' && !currentUser) return true
      const scope = correction !== undefined ? 'correction' : edit !== undefined ? 'edit' : 'generation'
      const result = await controlledModelCall(req, scope, body, config, () => (
        correction !== undefined
          ? repairLessonPlan(
              prompt,
              correction && typeof correction === 'object' ? correction.previousPlan : undefined,
              correction && typeof correction === 'object' ? correction.validationError : undefined,
              {
                basePlan: correction && typeof correction === 'object'
                  ? correction.basePlan
                  : undefined,
                capabilityId: typeof body.capabilityId === 'string' ? body.capabilityId : undefined,
                config,
              },
            )
          : edit !== undefined
            ? editLessonPlan(
                prompt,
                edit && typeof edit === 'object' ? edit.basePlan : undefined,
                { config },
              )
            : generateLessonPlan(prompt, {
                capabilityId: typeof body.capabilityId === 'string' ? body.capabilityId : undefined,
                config,
              })
      ), {
        credentialMode,
        ...(currentUser ? { usageIdentity: userUsageIdentity(currentUser.user) } : {}),
      })
      operationalEvents.resolve({ category: 'model', code: 'model-request-failed' })
      operationalEvents.resolve({ category: 'model', code: 'model-configuration-missing' })
      json(res, 200, result)
    } catch (error) {
      if (error instanceof ModelUsageLimitError) {
        modelLimitResponse(res, error)
        return true
      }
      if (error instanceof TemporaryModelAccessError) {
        json(res, error.status, { error: error.message, code: 'temporary-model-access' })
        return true
      }
      const message = error instanceof Error ? error.message : '大模型生成失败。'
      const missingConfig = message.includes('未配置') || message.includes('API Key')
      operationalEvents.record({
        severity: 'warning',
        category: 'model',
        code: missingConfig ? 'model-configuration-missing' : 'model-request-failed',
        summary: missingConfig ? '平台生成模型尚未正确配置。' : '模型生成或编辑请求失败。',
        context: { operation: 'generation' },
      })
      json(res, missingConfig ? 503 : 502, { error: message })
    }
    return true
  }

  if (url.pathname.startsWith('/api/')) {
    json(res, 404, { error: 'API 路径不存在。' })
    return true
  }
  return false
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

async function serveProductionFile(req, res, url) {
  const distRoot = resolve(projectRoot, 'dist')
  const pathname = decodeURIComponent(url.pathname)
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  let filePath = resolve(distRoot, requested)
  if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${sep}`)) {
    json(res, 403, { error: '禁止访问该路径。' })
    return
  }

  try {
    if (!(await stat(filePath)).isFile()) throw new Error('not a file')
  } catch {
    filePath = resolve(distRoot, 'index.html')
  }

  try {
    const content = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
      ...securityHeaders({ html: extname(filePath) === '.html' }),
    })
    if (req.method === 'HEAD') res.end()
    else res.end(content)
  } catch {
    operationalEvents.record({
      severity: 'error',
      category: 'http',
      code: 'production-asset-read-failed',
      summary: '生产静态资源读取失败。',
      context: { resource: extname(filePath) || 'html' },
    })
    json(res, 500, { error: '请先运行 npm run build。' })
  }
}

function operationalRouteGroup(pathname) {
  if (pathname.startsWith('/api/admin/')) return 'admin-api'
  if (pathname.startsWith('/api/user/')) return 'user-api'
  if (pathname.startsWith('/api/library/')) return 'library-api'
  if (pathname === '/api/generate') return 'generation-api'
  if (pathname.startsWith('/api/')) return 'public-api'
  return 'page'
}

let vite
if (!production) {
  const { createServer: createViteServer } = await import('vite')
  vite = await createViteServer({
    root: projectRoot,
    server: { middlewareMode: true },
    appType: 'spa',
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  try {
    if (await handleApi(req, res, url)) return
    if (vite) {
      vite.middlewares(req, res, (error) => {
        if (error) {
          vite.ssrFixStacktrace(error)
          operationalEvents.record({
            severity: 'error',
            category: 'http',
            code: 'development-render-failed',
            summary: '开发服务器渲染失败。',
            context: { routeGroup: operationalRouteGroup(url.pathname) },
          })
          if (!res.headersSent) json(res, 500, { error: '开发服务器渲染失败。' })
          else res.destroy()
        }
      })
      return
    }
    await serveProductionFile(req, res, url)
  } catch {
    operationalEvents.record({
      severity: 'error',
      category: 'http',
      code: 'unhandled-http-error',
      summary: '服务器处理请求时发生未捕获错误。',
      context: { method: req.method ?? 'UNKNOWN', routeGroup: operationalRouteGroup(url.pathname) },
    })
    if (!res.headersSent) json(res, 500, { error: '服务器处理请求时发生错误。' })
    else res.destroy()
  }
})

server.listen(port, host, async () => {
  operationalEvents.record({
    severity: 'info',
    category: 'process',
    code: 'server-started',
    summary: `Word2HTML ${production ? '生产' : '开发'}服务已启动。`,
    context: { environment: production ? 'production' : 'development', host, port },
  })
  operationalEvents.record({
    severity: 'info',
    category: 'storage',
    code: 'storage-backend-selected',
    summary: '服务存储后端已选定。',
    context: {
      backend: storageBackend.name,
      mode: storageBackend.pilot ? 'maintenance-pilot' : storageBackend.active ? 'single-instance-active' : 'primary',
    },
  })
  try {
    const model = await modelSettings.publicStatus('generation')
    operationalEvents.record({
      severity: model.configured ? 'info' : 'warning',
      category: 'model',
      code: model.configured ? 'generation-model-ready' : 'generation-model-not-configured',
      summary: model.configured ? '平台生成模型已就绪。' : '平台生成模型尚未配置。',
      context: model.configured ? { provider: model.provider, model: model.model } : {},
    })
  } catch {
    operationalEvents.record({
      severity: 'error',
      category: 'model',
      code: 'generation-model-status-failed',
      summary: '无法读取平台生成模型状态。',
    })
  }
  if (maintenanceMode) {
    operationalEvents.record({
      severity: 'info',
      category: 'maintenance',
      code: 'maintenance-mode-enabled',
      summary: '服务处于维护模式，业务写入已禁用。',
    })
  }
})

server.on('error', () => {
  operationalEvents.record({
    severity: 'critical',
    category: 'process',
    code: 'server-listen-failed',
    summary: 'HTTP 服务监听失败。',
    context: { port },
  })
  void shutdown(1)
})

let shuttingDown = false
async function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  operationalEvents.record({
    severity: 'info',
    category: 'process',
    code: 'server-stopping',
    summary: 'Word2HTML 服务正在停止。',
    context: { exitCode },
  })
  try {
    await vite?.close()
  } catch {
    operationalEvents.record({
      severity: 'warning',
      category: 'process',
      code: 'development-server-close-failed',
      summary: '开发服务器关闭时发生错误。',
    })
  }
  const finish = () => {
    try { storageBackend.close() } catch { /* The process is already stopping. */ }
    process.exit(exitCode)
  }
  if (server.listening) server.close(finish)
  else finish()
}

process.on('SIGINT', () => void shutdown(0))
process.on('SIGTERM', () => void shutdown(0))
process.on('uncaughtException', (error) => {
  operationalEvents.record({
    severity: 'critical',
    category: 'process',
    code: 'uncaught-process-error',
    summary: '进程发生未捕获异常，将安全停止。',
    context: { errorType: error instanceof Error ? error.name : typeof error },
  })
  void shutdown(1)
})
process.on('unhandledRejection', (reason) => {
  operationalEvents.record({
    severity: 'critical',
    category: 'process',
    code: 'unhandled-process-rejection',
    summary: '进程发生未处理的异步拒绝，将安全停止。',
    context: { errorType: reason instanceof Error ? reason.name : typeof reason },
  })
  void shutdown(1)
})
