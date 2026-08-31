import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectAcceptanceBrowser } from './browser-acceptance-client.mjs'
import { loadEnvironmentSecretFiles } from '../server/environment-secrets.mjs'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const image = process.env.WORD2HTML_IMAGE || 'word2html:local'
const secretsDirectory = resolve(process.env.WORD2HTML_SECRETS_DIR || 'deploy/secrets')
const adminTokenFile = resolve(process.env.WORD2HTML_ADMIN_TOKEN_FILE || `${secretsDirectory}/admin-token`)
const secretEnvironment = { ...process.env, WORD2HTML_ADMIN_TOKEN_FILE: adminTokenFile }
loadEnvironmentSecretFiles(secretEnvironment)
const adminToken = secretEnvironment.WORD2HTML_ADMIN_TOKEN?.trim()
if (!adminToken) throw new Error('容器运行验收缺少管理员令牌文件。')

const debugPort = Number(process.argv[2] ?? 19333)
if (!Number.isInteger(debugPort) || debugPort < 1024 || debugPort > 65_535) {
  throw new Error('Chrome 调试端口必须是 1024–65535 之间的整数。')
}

const suffix = `${process.pid}-${randomBytes(4).toString('hex')}`
const containerName = `word2html-runtime-browser-${suffix}`
const dataVolume = `word2html-runtime-browser-data-${suffix}`
let containerCreated = false
let volumeCreated = false
let browser
let report
let failure
const cleanupFailures = []

function docker(argumentsList, { tolerateFailure = false } = {}) {
  const result = spawnSync('docker', argumentsList, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error && !tolerateFailure) throw new Error('无法执行 Docker 生产运行验收。', { cause: result.error })
  if (result.status !== 0 && !tolerateFailure) {
    throw new Error(`Docker 生产运行验收命令失败：${result.stderr.trim() || result.stdout.trim() || '未知错误'}`)
  }
  return result
}

function assert(condition, detail) {
  if (!condition) throw new Error(`生产镜像浏览器验收失败：${detail}`)
}

async function waitForHealth(origin) {
  let lastError
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health`)
      if (response.ok) return response.json()
      lastError = new Error(`健康检查返回 HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error('临时生产容器没有按时通过健康检查。', { cause: lastError })
}

try {
  docker(['image', 'inspect', image])
  docker(['volume', 'create', '--label', 'word2html.acceptance=runtime-browser', dataVolume])
  volumeCreated = true
  docker([
    'run', '--detach', '--name', containerName,
    '--init', '--user', 'node', '--read-only',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--pids-limit', '256',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=67108864',
    '--mount', `type=volume,source=${dataVolume},target=/var/lib/word2html-volume`,
    '--mount', `type=bind,source=${secretsDirectory},target=/run/secrets,readonly`,
    '--publish', '127.0.0.1::5173',
    '--env', 'NODE_ENV=production', '--env', 'HOST=0.0.0.0', '--env', 'PORT=5173',
    '--env', 'WORD2HTML_MODEL_API_KEY_FILE=/run/secrets/model-api-key',
    '--env', 'WORD2HTML_ADMIN_TOKEN_FILE=/run/secrets/admin-token',
    '--env', 'WORD2HTML_USER_SESSION_SECRET_FILE=/run/secrets/user-session-secret',
    '--env', 'WORD2HTML_MODEL_USAGE_HASH_SECRET_FILE=/run/secrets/model-usage-hash-secret',
    '--env', 'WORD2HTML_SECURE_COOKIES=false', '--env', 'WORD2HTML_TRUST_PROXY=false',
    '--env', 'WORD2HTML_STORAGE_BACKEND=json', '--env', 'WORD2HTML_MAINTENANCE_MODE=false',
    '--env', 'WORD2HTML_USER_DIRECTORY_FILE=/var/lib/word2html-volume/data/users.json',
    '--env', 'WORD2HTML_LIBRARY_FILE=/var/lib/word2html-volume/data/lesson-directory.json',
    '--env', 'WORD2HTML_CAPABILITY_REVIEWS_FILE=/var/lib/word2html-volume/data/capability-subject-reviews.json',
    '--env', 'WORD2HTML_MODEL_SETTINGS_FILE=/var/lib/word2html-volume/data/model-settings.json',
    image,
  ])
  containerCreated = true

  const portResult = docker(['port', containerName, '5173/tcp']).stdout.trim()
  const portMatch = portResult.match(/127[.]0[.]0[.]1:(\d+)$/m)
  if (!portMatch) throw new Error('无法确定临时生产容器的本机端口。')
  const origin = `http://127.0.0.1:${portMatch[1]}`
  const health = await waitForHealth(origin)

  browser = await connectAcceptanceBrowser({ debugPort, rawPageOrigin: origin })
  const { evaluate } = browser
  await evaluate(`location.href = ${JSON.stringify(`${origin}/admin/models`)}; true`)
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1400))

  const admin = await evaluate(`(async function () {
    const wait = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))
    const waitFor = async (selector, attempts = 80) => {
      for (let index = 0; index < attempts; index += 1) {
        const element = document.querySelector(selector)
        if (element) return element
        await wait()
      }
      throw new Error('等待管理员页面元素超时：' + selector)
    }
    const input = await waitFor('.admin-token-field input')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(adminToken)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.closest('form').requestSubmit()
    await waitFor('.model-settings-workspace')
    await waitFor('[data-operational-alerts]')
    const [healthResponse, readyResponse, usageResponse, operationalResponse] = await Promise.all([
      fetch('/api/health', { headers: { Accept: 'application/json' } }),
      fetch('/api/ready', { headers: { Accept: 'application/json' } }),
      fetch('/api/admin/model-usage', { headers: { Accept: 'application/json' } }),
      fetch('/api/admin/operational-events', { headers: { Accept: 'application/json' } }),
    ])
    const [healthBody, readyBody, usageBody, operationalBody] = await Promise.all([
      healthResponse.json(), readyResponse.json(), usageResponse.json(), operationalResponse.json(),
    ])
    const operationalText = JSON.stringify(operationalBody)
    const storedValues = [
      ...Object.keys(localStorage).map((key) => localStorage.getItem(key) || ''),
      ...Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key) || ''),
    ].join('|')
    return {
      healthStatus: healthResponse.status,
      readyStatus: readyResponse.status,
      ready: readyBody.ok,
      modelConfigured: healthBody.model?.configured,
      usageStatus: usageResponse.status,
      calls: usageBody.status?.usage?.calls,
      totalTokens: usageBody.status?.usage?.totalTokens,
      operationalStatus: operationalResponse.status,
      operationalState: operationalBody.status?.status,
      operationalSafe: !/apiKey|authorization|cookie|csrf|prompt|body|payload|accessCode|databaseFile|dataFile|digest|w2h-login/i.test(operationalText)
        && !operationalText.includes('/home/') && !operationalText.includes('/tmp/'),
      alertCardVisible: Boolean(document.querySelector('[data-operational-alerts]')),
      tokenHiddenFromCookie: !document.cookie.includes(${JSON.stringify(adminToken)}),
      tokenAbsentFromStorage: !storedValues.includes(${JSON.stringify(adminToken)}),
    }
  }())`)

  await evaluate(`localStorage.removeItem('word2html.lesson-scene.draft.v0.1'); location.href = ${JSON.stringify(`${origin}/`)}; true`)
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1400))

  const officialScene = await evaluate(`(async function () {
    const wait = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))
    const waitFor = async (selector, attempts = 80) => {
      for (let index = 0; index < attempts; index += 1) {
        const element = document.querySelector(selector)
        if (element) return element
        await wait()
      }
      throw new Error('等待官方场景元素超时：' + selector)
    }
    const libraryButton = await waitFor('.library-button')
    libraryButton.click()
    await waitFor('.library-dialog')
    const cards = [...document.querySelectorAll('.library-card')]
    const ellipseCard = cards.find((card) => card.querySelector('h3')?.textContent?.trim() === '椭圆的焦点距离和')
    if (!ellipseCard) throw new Error('官方库缺少椭圆焦点距离和场景。')
    const officialBadge = ellipseCard.querySelector('.review-badge')?.textContent?.trim()
    ellipseCard.querySelector('.primary-button')?.click()
    const canvas = await waitFor('svg.ellipse-canvas')
    await wait(350)
    const formula = document.querySelector('.formula-card--above')
    const title = document.querySelector('.stage-heading h2')?.textContent?.trim()
    const statusTitle = document.querySelector('.result-card strong')?.textContent?.trim()
    const beforeSum = Number.parseFloat(document.querySelector('.metric-card--sum strong')?.textContent || 'NaN')
    const parameter = document.querySelector('input[aria-label="长轴全长数值"]')
    if (!(parameter instanceof HTMLInputElement)) throw new Error('找不到长轴参数输入框。')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(parameter, '12')
    parameter.dispatchEvent(new Event('input', { bubbles: true }))
    parameter.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(450)
    const afterSum = Number.parseFloat(document.querySelector('.metric-card--sum strong')?.textContent || 'NaN')
    const usageResponse = await fetch('/api/admin/model-usage', { headers: { Accept: 'application/json' } })
    const usageBody = await usageResponse.json()
    return {
      officialCount: cards.length,
      officialBadge,
      title,
      statusTitle,
      viewBox: canvas.getAttribute('viewBox'),
      formulaBeforeCanvas: Boolean(formula && (formula.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING)),
      focusCount: canvas.querySelectorAll('[data-scene-object-id="focusLeft"], [data-scene-object-id="focusRight"]').length,
      distanceLineCount: canvas.querySelectorAll('[data-scene-object-id="distanceLeft"], [data-scene-object-id="distanceRight"]').length,
      valid: document.querySelector('.validation-badge')?.textContent?.includes('场景有效'),
      beforeSum,
      afterSum,
      usageStatus: usageResponse.status,
      calls: usageBody.status?.usage?.calls,
      totalTokens: usageBody.status?.usage?.totalTokens,
      productionAssetsOnly: [...document.scripts].every((script) => !script.src || !new URL(script.src).pathname.startsWith('/src/')),
    }
  }())`)

  assert(health.ok === true && admin.healthStatus === 200 && admin.readyStatus === 200 && admin.ready, '健康或就绪检查失败。')
  assert(admin.modelConfigured === true, '生产容器没有从密钥文件读取模型配置。')
  assert(admin.usageStatus === 200 && admin.operationalStatus === 200 && admin.alertCardVisible, '管理员用量或运行告警页面不可用。')
  assert(['healthy', 'attention', 'critical'].includes(admin.operationalState), '运行告警状态无效。')
  assert(admin.operationalSafe && admin.tokenHiddenFromCookie && admin.tokenAbsentFromStorage, '管理员响应或浏览器存储暴露了敏感信息。')
  assert(officialScene.officialCount > 0 && officialScene.officialBadge === '官方审核', '官方库或审核标识没有显示。')
  assert(officialScene.title === '椭圆的焦点距离和' && officialScene.statusTitle === '已从官方库打开场景', '没有通过官方库打开目标场景。')
  assert(officialScene.viewBox === '0 0 900 590' && officialScene.formulaBeforeCanvas, '官方场景画布或公式布局错误。')
  assert(officialScene.focusCount === 2 && officialScene.distanceLineCount === 2 && officialScene.valid, '官方椭圆的焦点、距离线或校验状态错误。')
  assert(Math.abs(officialScene.beforeSum - 10) < 0.01 && Math.abs(officialScene.afterSum - 12) < 0.01, '本地参数修改没有更新距离和。')
  assert(officialScene.usageStatus === 200 && officialScene.calls === admin.calls && officialScene.totalTokens === admin.totalTokens, '打开官方场景或修改参数产生了模型用量。')
  assert(officialScene.productionAssetsOnly, '生产页面仍依赖 Vite 源码入口。')

  report = {
    format: 'word2html.container-runtime-browser-acceptance',
    formatVersion: '0.1',
    passed: true,
    image,
    health: { ok: health.ok, ready: admin.ready },
    admin: {
      login: true,
      operationalState: admin.operationalState,
      sensitiveValuesHidden: true,
    },
    officialScene: {
      title: officialScene.title,
      focusCount: officialScene.focusCount,
      distanceLineCount: officialScene.distanceLineCount,
      distanceSumBefore: officialScene.beforeSum,
      distanceSumAfter: officialScene.afterSum,
      modelCallsAdded: officialScene.calls - admin.calls,
      modelTokensAdded: officialScene.totalTokens - admin.totalTokens,
    },
  }
} catch (error) {
  failure = error
} finally {
  try { browser?.close() } catch { /* Continue exact Docker cleanup. */ }
  if (containerCreated) {
    const result = docker(['rm', '--force', containerName], { tolerateFailure: true })
    if (result.error || result.status !== 0) cleanupFailures.push(containerName)
  }
  if (volumeCreated) {
    const result = docker(['volume', 'rm', '--force', dataVolume], { tolerateFailure: true })
    if (result.error || result.status !== 0) cleanupFailures.push(dataVolume)
  }
}

if (failure) throw failure
if (cleanupFailures.length > 0) throw new Error(`验收通过但临时资源清理失败：${cleanupFailures.join(', ')}`)

console.log(JSON.stringify({
  ...report,
  temporaryContainerRemoved: true,
  temporaryVolumeRemoved: true,
}, null, 2))
