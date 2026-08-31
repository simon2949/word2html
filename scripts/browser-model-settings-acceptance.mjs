import { connectAcceptanceBrowser } from './browser-acceptance-client.mjs'

const adminToken = process.env.WORD2HTML_ADMIN_TOKEN?.trim()
if (!adminToken) throw new Error('请通过 WORD2HTML_ADMIN_TOKEN 环境变量传入验收用管理员令牌。')

const { evaluate, close } = await connectAcceptanceBrowser()

const result = await evaluate(`(async function () {
  const wait = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))
  const waitFor = async (selector, attempts = 40) => {
    for (let index = 0; index < attempts; index += 1) {
      const element = document.querySelector(selector)
      if (element) return element
      await wait(100)
    }
    throw new Error('等待页面元素超时：' + selector)
  }

  const tokenInput = await waitFor('.admin-token-field input')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(tokenInput, ${JSON.stringify(adminToken)})
  tokenInput.dispatchEvent(new Event('input', { bubbles: true }))
  tokenInput.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await waitFor('.model-settings-workspace')

  let cards = []
  let selectors = []
  let saveButton
  let usageCard
  let operationalAlertCard
  let storageShadowCard
  let loadFailure = ''
  for (let index = 0; index < 80; index += 1) {
    cards = [...document.querySelectorAll('.model-profile-card')]
    selectors = [...document.querySelectorAll('.model-assignment-grid select')]
    saveButton = [...document.querySelectorAll('.model-settings-actions button')]
      .find((button) => button.textContent.includes('保存模型设置'))
    usageCard = document.querySelector('[data-model-usage-status]')
    operationalAlertCard = document.querySelector('[data-operational-alerts]')
    storageShadowCard = document.querySelector('[data-storage-shadow-status]')
    if (cards.length >= 1 && selectors.length === 2 && saveButton instanceof HTMLButtonElement && usageCard && operationalAlertCard && storageShadowCard) break
    const loadingText = document.querySelector('.model-settings-loading')?.textContent?.trim() || ''
    if (loadingText && !loadingText.includes('正在读取')) {
      loadFailure = loadingText
      break
    }
    await wait(100)
  }

  if (cards.length < 1 || selectors.length !== 2 || !(saveButton instanceof HTMLButtonElement) || !usageCard || !operationalAlertCard || !storageShadowCard) {
    const [healthResponse, settingsResponse, usageResponse, operationalResponse, storageResponse] = await Promise.all([
      fetch('/api/health', { headers: { Accept: 'application/json' } }),
      fetch('/api/admin/model-settings', { headers: { Accept: 'application/json' } }),
      fetch('/api/admin/model-usage', { headers: { Accept: 'application/json' } }),
      fetch('/api/admin/operational-events', { headers: { Accept: 'application/json' } }),
      fetch('/api/admin/storage-shadow', { headers: { Accept: 'application/json' } }),
    ])
    const health = await healthResponse.json().catch(() => ({}))
    const settingsBody = await settingsResponse.json().catch(() => ({}))
    const oldServer = settingsResponse.status === 404
      || !health?.capabilities?.includes('admin-model-settings')
    throw new Error(JSON.stringify({
      message: oldServer
        ? '当前 Node 服务仍是旧版本。请停止后重新执行 npm run dev，再重试验收。'
        : '可信模型卡片或默认分工控件未完整显示。',
      pageMessage: loadFailure || document.querySelector('.model-settings-loading')?.textContent?.trim(),
      healthStatus: healthResponse.status,
      apiVersion: health?.apiVersion,
      modelSettingsCapability: health?.capabilities?.includes('admin-model-settings') ?? false,
      settingsStatus: settingsResponse.status,
      usageStatus: usageResponse.status,
      storageStatus: storageResponse.status,
      settingsError: settingsBody?.error,
      cardCount: cards.length,
      assignmentCount: selectors.length,
      hasUsageCard: Boolean(usageCard),
      hasOperationalAlertCard: Boolean(operationalAlertCard),
      hasStorageShadowCard: Boolean(storageShadowCard),
      operationalStatus: operationalResponse.status,
    }, null, 2))
  }

  let savedChange = false
  if (cards.length > 1) {
    const secondToggle = cards[1].querySelector('input[type="checkbox"]')
    if (!(secondToggle instanceof HTMLInputElement)) throw new Error('找不到第二个模型启用开关。')
    secondToggle.click()
    for (let index = 0; index < 30 && saveButton.disabled; index += 1) await wait(50)
    if (saveButton.disabled) throw new Error('修改模型启用状态后，保存按钮仍不可用。')
    saveButton.click()
    for (let index = 0; index < 60; index += 1) {
      const actionText = document.querySelector('.model-settings-message')?.textContent || ''
      if (actionText.includes('已保存')) { savedChange = true; break }
      if (actionText && !actionText.includes('正在')) break
      await wait(100)
    }
  }

  const [response, usageResponse, operationalResponse, storageResponse] = await Promise.all([
    fetch('/api/admin/model-settings', { headers: { Accept: 'application/json' } }),
    fetch('/api/admin/model-usage', { headers: { Accept: 'application/json' } }),
    fetch('/api/admin/operational-events', { headers: { Accept: 'application/json' } }),
    fetch('/api/admin/storage-shadow', { headers: { Accept: 'application/json' } }),
  ])
  const [body, usageBody, operationalBody, storageBody] = await Promise.all([
    response.json(), usageResponse.json(), operationalResponse.json(), storageResponse.json(),
  ])
  const serialized = JSON.stringify(body)
  const text = document.body.textContent || ''
  const introFontSize = Number.parseFloat(getComputedStyle(document.querySelector('.model-settings-intro p')).fontSize)
  const cardFontSize = Number.parseFloat(getComputedStyle(document.querySelector('.model-profile-card dd')).fontSize)
  return {
    cardCount: cards.length,
    assignmentCount: selectors.length,
    enabledCount: document.querySelectorAll('.model-profile-card.enabled').length,
    hasGenerationTest: text.includes('测试生成连接'),
    hasReviewTest: text.includes('测试预审连接'),
    hasTokenCostWarning: text.includes('可能产生少量 token'),
    hasUsageStatus: Boolean(document.querySelector('[data-model-usage-status]')),
    hasFuseStatus: text.includes('调用熔断') && text.includes('Token 熔断') && text.includes('费用熔断'),
    hasOperationalAlerts: Boolean(document.querySelector('[data-operational-alerts]')),
    operationalState: operationalBody.status?.status,
    operationalApiStatus: operationalResponse.status,
    operationalResponseIsSafe: !/apiKey|authorization|cookie|csrf|prompt|body|payload|accessCode|databaseFile|dataFile|digest|w2h-login/i.test(JSON.stringify(operationalBody)) && !JSON.stringify(operationalBody).includes('/home/') && !JSON.stringify(operationalBody).includes('/tmp/'),
    hasOperationalPrivacyCopy: text.includes('不显示请求正文') && text.includes('服务重启后内存事件会清空'),
    hasStorageShadowStatus: Boolean(document.querySelector('[data-storage-shadow-status]')),
    storageShadowStatus: storageBody.status?.status,
    hasRuntimePilotCopy: text.includes('维护试运行已就绪') && text.includes('维护模式会拒绝全部业务写操作'),
    hasRuntimeActiveCopy: text.includes('SQLite 正在承接业务读写') && text.includes('当前为单实例活动模式'),
    storageShadowApiStatus: storageResponse.status,
    storageResponseIsSafe: !/databaseFile|dataFile|payload|digest|[.]sqlite/.test(JSON.stringify(storageBody)),
    hasAdminNavigation: Boolean(document.querySelector('a[href="/admin/reviews"]') && document.querySelector('a[href="/admin/capabilities"]')),
    keyNotExposed: !serialized.includes('apiKey') && !serialized.includes('API_KEY') && !text.includes('acceptance-secret'),
    apiStatus: response.status,
    usageApiStatus: usageResponse.status,
    usageDay: usageBody.status?.day,
    apiVersion: body.settings?.formatVersion,
    savedChange,
    introFontSize,
    cardFontSize,
  }
}())`)
close()

const assert = (condition, detail) => {
  if (!condition) throw new Error(`模型设置浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
}
assert(result?.cardCount >= 1 && result.assignmentCount === 2, '可信目录或生成/预审分工未显示。')
assert(result?.enabledCount >= 1, '界面允许停用所有模型。')
assert(result?.hasGenerationTest && result.hasReviewTest && result.hasTokenCostWarning, '连接测试或 token 费用提示缺失。')
assert(result?.hasUsageStatus && result.hasFuseStatus && result.usageApiStatus === 200, '模型用量或熔断状态未显示。')
assert(result?.hasOperationalAlerts && result.operationalApiStatus === 200, '运行告警状态未显示。')
assert(['healthy', 'attention', 'critical'].includes(result?.operationalState), '运行告警状态值无效。')
assert(result?.operationalResponseIsSafe && result.hasOperationalPrivacyCopy, '运行告警响应或隐私说明不安全。')
assert(result?.hasStorageShadowStatus && result.storageShadowApiStatus === 200, '存储影子状态未显示。')
assert(['not-configured', 'matched', 'diverged', 'unavailable', 'runtime-pilot', 'runtime-active'].includes(result?.storageShadowStatus), '存储影子状态值无效。')
assert(result?.storageShadowStatus !== 'runtime-pilot' || result.hasRuntimePilotCopy, 'SQLite 维护试运行说明未完整显示。')
assert(result?.storageShadowStatus !== 'runtime-active' || result.hasRuntimeActiveCopy, 'SQLite 单实例活动状态说明未完整显示。')
assert(result?.storageResponseIsSafe, '存储影子响应泄露了路径、摘要或业务内容。')
assert(result?.hasAdminNavigation, '管理员页面导航不完整。')
assert(result?.apiStatus === 200 && result.keyNotExposed, '公开设置响应可能泄露密钥字段。')
assert(result?.cardCount === 1 || result.savedChange, '多模型启用状态未能保存。')
assert(result?.introFontSize >= 12 && result.cardFontSize >= 10, '模型设置主要文字过小。')

console.log(JSON.stringify(result, null, 2))
