import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { restoreDataBackup, validateWord2HtmlDataDirectory } from './data-restore.mjs'
import {
  exportRuntimeSqliteToJsonBackup,
  verifyRuntimeJsonExport,
} from './sqlite-runtime-export.mjs'
import { verifyRuntimeSqliteDatabase } from './sqlite-runtime-store.mjs'
import {
  SQLITE_ACTIVATION_CONFIRMATION,
  SQLITE_ACTIVE_MODE,
} from './storage-backend.mjs'

export const SQLITE_ACTIVE_HTTP_ACCEPTANCE_FORMAT = 'word2html.sqlite-active-http-acceptance'
export const SQLITE_ACTIVE_HTTP_ACCEPTANCE_VERSION = '0.1'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function timestamp(now) {
  const value = now()
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error('SQLite active HTTP 验收时钟无效。')
  return value.toISOString()
}

async function freePort() {
  const server = createServer()
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolvePromise) => server.close(resolvePromise))
  if (!port) throw new Error('无法分配 SQLite active HTTP 验收端口。')
  return port
}

function cookieFrom(response) {
  return response.headers.get('set-cookie')?.split(';', 1)[0] ?? ''
}

async function api(origin, path, {
  method = 'GET',
  body,
  cookie,
  csrf,
} = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (cookie) headers.Cookie = cookie
  if (csrf) headers['X-CSRF-Token'] = csrf
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let value = {}
  try { value = text ? JSON.parse(text) : {} } catch { throw new Error(`HTTP ${response.status} 返回了无效 JSON。`) }
  return { status: response.status, value, cookie: cookieFrom(response) }
}

function assertStatus(result, expected, label) {
  if (result.status !== expected) {
    const message = typeof result.value?.error === 'string' ? result.value.error : '无公开错误信息'
    throw new Error(`${label}返回 HTTP ${result.status}，预期 ${expected}：${message}`)
  }
  return result
}

function childEnvironment({ runtimeFile, adminToken, sessionSecret, jsonDirectory }) {
  const modelCatalog = [{
    id: 'sqlite-http-acceptance', label: 'SQLite HTTP 验收模型', provider: 'Acceptance',
    protocol: 'openai-compatible', baseURL: 'https://models.example.edu/v1',
    model: 'acceptance-model', apiKeyEnv: 'SQLITE_HTTP_ACCEPTANCE_MODEL_KEY',
  }]
  return {
    ...process.env,
    MINIMAX_API_KEY: '',
    WORD2HTML_ADMIN_TOKEN: adminToken,
    WORD2HTML_USER_SESSION_SECRET: sessionSecret,
    WORD2HTML_MODEL_CATALOG_JSON: JSON.stringify(modelCatalog),
    SQLITE_HTTP_ACCEPTANCE_MODEL_KEY: 'acceptance-key-never-exported',
    WORD2HTML_STORAGE_BACKEND: 'sqlite',
    WORD2HTML_MAINTENANCE_MODE: 'false',
    WORD2HTML_SQLITE_RUNTIME_FILE: runtimeFile,
    WORD2HTML_SQLITE_MODE: SQLITE_ACTIVE_MODE,
    WORD2HTML_SQLITE_ACTIVATION_CONFIRM: SQLITE_ACTIVATION_CONFIRMATION,
    WORD2HTML_USER_DIRECTORY_FILE: join(jsonDirectory, 'users.json'),
    WORD2HTML_LIBRARY_FILE: join(jsonDirectory, 'lesson-directory.json'),
    WORD2HTML_CAPABILITY_REVIEWS_FILE: join(jsonDirectory, 'capability-subject-reviews.json'),
    WORD2HTML_MODEL_SETTINGS_FILE: join(jsonDirectory, 'model-settings.json'),
    WORD2HTML_SECURE_COOKIES: 'false',
  }
}

function startApplication(environment, port) {
  const child = spawn(process.execPath, [
    'server/index.mjs', '--production', '--host', '127.0.0.1', '--port', String(port),
  ], {
    cwd: projectRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const append = (chunk) => { output = `${output}${chunk}`.slice(-8000) }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  return { child, output: () => output }
}

async function waitForApplication(processHandle, origin) {
  let lastError
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (processHandle.child.exitCode !== null) {
      throw new Error(`SQLite active HTTP 验收服务提前退出。\n${processHandle.output()}`)
    }
    try {
      const result = await api(origin, '/api/health')
      if (result.status === 200) return result
      lastError = new Error(`健康检查返回 HTTP ${result.status}`)
    } catch (error) { lastError = error }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }
  throw new Error(`等待 SQLite active HTTP 验收服务超时。`, { cause: lastError })
}

async function stopApplication(processHandle) {
  if (!processHandle || processHandle.child.exitCode !== null) return
  const exited = new Promise((resolvePromise) => processHandle.child.once('exit', resolvePromise))
  processHandle.child.kill('SIGTERM')
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolvePromise) => setTimeout(() => resolvePromise(false), 5000)),
  ])
  if (!stopped && processHandle.child.exitCode === null) {
    processHandle.child.kill('SIGKILL')
    await exited
  }
}

async function pathExists(path) {
  try { await lstat(path); return true } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false
    throw error
  }
}

async function writeReport(reportFile, report) {
  if (!reportFile) return undefined
  const file = resolve(reportFile)
  if (!file.endsWith('.json')) throw new Error('SQLite active HTTP 验收报告必须使用 .json 扩展名。')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  const stored = JSON.parse(await readFile(file, 'utf8'))
  if (stored.format !== SQLITE_ACTIVE_HTTP_ACCEPTANCE_FORMAT || stored.passed !== true) {
    throw new Error('SQLite active HTTP 验收报告写入后复验失败。')
  }
  return file
}

export async function runSqliteActiveHttpAcceptance({
  databaseFile,
  reportFile,
  now = () => new Date(),
  temporaryRoot = tmpdir(),
} = {}) {
  if (!databaseFile) throw new Error('请提供 SQLite active HTTP 验收用候选运行库。')
  const sourceFile = resolve(databaseFile)
  const sourceDigest = sha256(await readFile(sourceFile))
  const source = verifyRuntimeSqliteDatabase(sourceFile)
  const parent = resolve(temporaryRoot)
  await mkdir(parent, { recursive: true })
  const workspace = await mkdtemp(join(parent, 'word2html-sqlite-active-http-'))
  const runtimeCopy = join(workspace, 'runtime-copy.sqlite')
  const jsonSentinel = join(workspace, 'json-must-not-be-used')
  const adminToken = `sqlite-http-admin-${randomBytes(18).toString('base64url')}`
  const sessionSecret = randomBytes(32).toString('base64url')
  const checks = [{ id: 'source-runtime-verified', passed: true }]
  let activeProcess
  let rollbackProcess

  try {
    await copyFile(sourceFile, runtimeCopy)
    await chmod(runtimeCopy, 0o600)
    const before = verifyRuntimeSqliteDatabase(runtimeCopy)
    const port = await freePort()
    const origin = `http://127.0.0.1:${port}`
    const activeEnvironment = childEnvironment({
      runtimeFile: runtimeCopy,
      adminToken,
      sessionSecret,
      jsonDirectory: jsonSentinel,
    })
    activeProcess = startApplication(activeEnvironment, port)
    const health = await waitForApplication(activeProcess, origin)
    if (
      health.value?.storage?.backend !== 'sqlite' ||
      health.value?.storage?.active !== true ||
      health.value?.storage?.mode !== SQLITE_ACTIVE_MODE ||
      health.value?.maintenanceMode !== false
    ) throw new Error('SQLite active 健康状态不完整。')
    checks.push({ id: 'active-service-started', passed: true })

    const ready = assertStatus(await api(origin, '/api/ready'), 200, 'SQLite active 就绪检查')
    if (ready.value?.ok !== true || Object.values(ready.value?.checks ?? {}).some((value) => value !== 'ready')) {
      throw new Error('SQLite active 就绪检查没有全部通过。')
    }
    checks.push({ id: 'active-service-ready', passed: true })

    const adminLogin = assertStatus(await api(origin, '/api/admin/session', {
      method: 'POST', body: { token: adminToken },
    }), 200, '管理员登录')
    const adminCookie = adminLogin.cookie
    const adminCsrf = adminLogin.value?.csrfToken
    if (!adminCookie || typeof adminCsrf !== 'string') throw new Error('管理员 HTTP 会话不完整。')
    checks.push({ id: 'admin-session-established', passed: true })

    const operationalStatus = assertStatus(await api(origin, '/api/admin/operational-events', {
      cookie: adminCookie,
    }), 200, '读取运行告警').value.status
    if (
      !['healthy', 'attention', 'critical'].includes(operationalStatus?.status) ||
      !Array.isArray(operationalStatus?.events)
    ) throw new Error('运行告警接口响应不完整。')
    if (/apiKey|authorization|cookie|csrf|prompt|body|payload|accessCode|databaseFile|dataFile|digest|\/home\/|\/tmp\/|w2h-login/i.test(JSON.stringify(operationalStatus))) {
      throw new Error('运行告警接口泄露了敏感字段或本机路径。')
    }
    checks.push({ id: 'operational-alert-status-safe', passed: true })

    const settings = assertStatus(await api(origin, '/api/admin/model-settings', {
      cookie: adminCookie,
    }), 200, '读取模型设置').value.settings
    const modelId = settings?.catalog?.[0]?.id
    if (typeof modelId !== 'string') throw new Error('SQLite active 验收没有可用可信模型。')
    assertStatus(await api(origin, '/api/admin/model-settings', {
      method: 'PATCH', cookie: adminCookie, csrf: adminCsrf,
      body: { enabledIds: [modelId], generationId: modelId, reviewId: modelId },
    }), 200, '保存模型设置')
    checks.push({ id: 'model-settings-http-write', passed: true })

    const created = assertStatus(await api(origin, '/api/admin/users', {
      method: 'POST', cookie: adminCookie, csrf: adminCsrf,
      body: { displayName: 'SQLite active HTTP 验收账号', dailyCalls: 6, dailyTokens: 6000 },
    }), 201, '创建用户')
    const accessCode = created.value?.accessCode
    if (typeof accessCode !== 'string' || !accessCode.startsWith('w2h-login-')) {
      throw new Error('SQLite active 用户创建没有返回一次性登录码。')
    }
    const userLogin = assertStatus(await api(origin, '/api/user/session', {
      method: 'POST', body: { accessCode },
    }), 200, '用户登录')
    const userCookie = userLogin.cookie
    const userCsrf = userLogin.value?.csrfToken
    if (!userCookie || typeof userCsrf !== 'string') throw new Error('用户 HTTP 会话不完整。')
    checks.push({ id: 'user-create-and-login-http-write', passed: true })

    const submissions = assertStatus(await api(origin, '/api/admin/library/submissions', {
      cookie: adminCookie,
    }), 200, '读取审核队列').value.entries
    const lesson = Array.isArray(submissions) ? submissions[0] : undefined
    if (!lesson?.id || !lesson.lessonPackage) throw new Error('SQLite active HTTP 验收需要至少一个已有共享实验。')
    const duplicate = assertStatus(await api(origin, '/api/library/submissions', {
      method: 'POST', cookie: userCookie, csrf: userCsrf,
      body: { lessonPackage: lesson.lessonPackage, sourceFilename: 'sqlite-http-duplicate.json' },
    }), 200, '登录用户重复提交')
    if (duplicate.value?.duplicate !== true) throw new Error('登录用户重复提交没有命中既有内容。')
    checks.push({ id: 'authenticated-shared-submission', passed: true })

    assertStatus(await api(origin, `/api/admin/library/submissions/${encodeURIComponent(lesson.id)}`, {
      method: 'PATCH', cookie: adminCookie, csrf: adminCsrf,
      body: { reviewStatus: 'needs-changes', reviewNote: 'SQLite active HTTP 隔离验收意见。' },
    }), 200, '管理员审核写入')
    checks.push({ id: 'lesson-moderation-http-write', passed: true })

    assertStatus(await api(origin, '/api/admin/capability-reviews/math.function.explicit-2d', {
      method: 'PATCH', cookie: adminCookie, csrf: adminCsrf,
      body: {
        status: 'needs-changes', reviewer: 'SQLite active 验收', reviewerRole: '自动化隔离验收',
        reviewedVersion: 'sqlite-active-http-0.1', reviewComment: '验证活动后端事务写入。',
        checks: { accuracy: false },
      },
    }), 200, '能力审核写入')
    checks.push({ id: 'capability-review-http-write', passed: true })

    const storageStatus = assertStatus(await api(origin, '/api/admin/storage-shadow', {
      cookie: adminCookie,
    }), 200, '活动存储状态').value.status
    if (storageStatus?.status !== 'runtime-active' || storageStatus?.mode !== 'sqlite-single-instance-active') {
      throw new Error('管理员页面接口没有返回 SQLite active 状态。')
    }
    checks.push({ id: 'active-admin-status-safe', passed: true })

    await stopApplication(activeProcess)
    activeProcess = undefined
    if (await pathExists(jsonSentinel)) throw new Error('SQLite active 验收期间意外写入了 JSON 数据目录。')
    const after = verifyRuntimeSqliteDatabase(runtimeCopy)
    const expectedWrites = 5
    if (after.runtimeRevision !== before.runtimeRevision + expectedWrites) {
      throw new Error(`SQLite active HTTP 写入修订号应增加 ${expectedWrites}，实际增加 ${after.runtimeRevision - before.runtimeRevision}。`)
    }
    if ((await readFile(runtimeCopy)).toString('latin1').includes(accessCode)) {
      throw new Error('SQLite active 运行库包含一次性登录码原文。')
    }
    checks.push({
      id: 'http-write-revisions-accounted', passed: true,
      revisionBefore: before.runtimeRevision,
      revisionAfter: after.runtimeRevision,
    })

    const exported = await exportRuntimeSqliteToJsonBackup({
      databaseFile: runtimeCopy,
      backupRoot: join(workspace, 'exports'),
      environment: activeEnvironment,
      now,
    })
    await verifyRuntimeJsonExport({
      databaseFile: runtimeCopy,
      backupDirectory: exported.backupDirectory,
      environment: activeEnvironment,
    })
    const restoredDirectory = join(workspace, 'restored-json')
    await restoreDataBackup({
      backupDirectory: exported.backupDirectory,
      targetDirectory: restoredDirectory,
      rollbackBackupRoot: join(workspace, 'restore-rollbacks'),
      maintenanceConfirmed: true,
      environment: activeEnvironment,
    })
    await validateWord2HtmlDataDirectory(restoredDirectory, { environment: activeEnvironment })
    checks.push({ id: 'active-runtime-export-and-restore', passed: true })

    const rollbackPort = await freePort()
    const rollbackOrigin = `http://127.0.0.1:${rollbackPort}`
    const rollbackEnvironment = {
      ...activeEnvironment,
      WORD2HTML_STORAGE_BACKEND: 'json',
      WORD2HTML_SQLITE_RUNTIME_FILE: '',
      WORD2HTML_SQLITE_MODE: '',
      WORD2HTML_SQLITE_ACTIVATION_CONFIRM: '',
      WORD2HTML_USER_DIRECTORY_FILE: join(restoredDirectory, 'users.json'),
      WORD2HTML_LIBRARY_FILE: join(restoredDirectory, 'lesson-directory.json'),
      WORD2HTML_CAPABILITY_REVIEWS_FILE: join(restoredDirectory, 'capability-subject-reviews.json'),
      WORD2HTML_MODEL_SETTINGS_FILE: join(restoredDirectory, 'model-settings.json'),
    }
    rollbackProcess = startApplication(rollbackEnvironment, rollbackPort)
    const rollbackHealth = await waitForApplication(rollbackProcess, rollbackOrigin)
    if (rollbackHealth.value?.storage?.backend !== 'json') throw new Error('JSON 回退服务没有使用 JSON 主存储。')
    assertStatus(await api(rollbackOrigin, '/api/ready'), 200, 'JSON 回退服务就绪检查')
    const rollbackAdmin = assertStatus(await api(rollbackOrigin, '/api/admin/session', {
      method: 'POST', body: { token: adminToken },
    }), 200, 'JSON 回退管理员登录')
    const restoredUsers = assertStatus(await api(rollbackOrigin, '/api/admin/users', {
      cookie: rollbackAdmin.cookie,
    }), 200, 'JSON 回退用户读取').value.users
    if (!Array.isArray(restoredUsers) || !restoredUsers.some((user) => user.displayName === 'SQLite active HTTP 验收账号')) {
      throw new Error('JSON 回退服务没有读取到 SQLite active 阶段创建的用户。')
    }
    checks.push({ id: 'json-rollback-service-ready', passed: true })
    await stopApplication(rollbackProcess)
    rollbackProcess = undefined

    if (sha256(await readFile(sourceFile)) !== sourceDigest) {
      throw new Error('SQLite active HTTP 验收意外修改了源候选运行库。')
    }
    checks.push({ id: 'source-runtime-unchanged', passed: true })

    const report = {
      format: SQLITE_ACTIVE_HTTP_ACCEPTANCE_FORMAT,
      formatVersion: SQLITE_ACTIVE_HTTP_ACCEPTANCE_VERSION,
      createdAt: timestamp(now),
      source: {
        fileName: basename(sourceFile),
        schemaVersion: source.schemaVersion,
        runtimeRevision: source.runtimeRevision,
      },
      isolated: {
        runtimeRevisionBefore: before.runtimeRevision,
        runtimeRevisionAfter: after.runtimeRevision,
        committedWrites: expectedWrites,
        restoredUsers: restoredUsers.length,
      },
      checks,
      passed: checks.every((check) => check.passed),
      sourceRuntimeChanged: false,
      productionTrafficChanged: false,
    }
    const storedReportFile = await writeReport(reportFile, report)
    return { ...report, reportFile: storedReportFile }
  } finally {
    await stopApplication(activeProcess)
    await stopApplication(rollbackProcess)
    await rm(workspace, { recursive: true, force: true })
  }
}
