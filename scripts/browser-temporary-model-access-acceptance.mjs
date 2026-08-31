import { connectAcceptanceBrowser } from './browser-acceptance-client.mjs'

const { evaluate, close } = await connectAcceptanceBrowser()
const acceptanceSecret = 'acceptance-user-key-do-not-store'

const applied = await evaluate(`(async function () {
  const wait = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))
  const waitFor = async (selector, attempts = 60) => {
    for (let index = 0; index < attempts; index += 1) {
      const element = document.querySelector(selector)
      if (element) return element
      await wait(100)
    }
    throw new Error('等待页面元素超时：' + selector)
  }
  const panel = await waitFor('.model-access-panel')
  panel.open = true
  const select = await waitFor('.model-access-content select')
  const keyInput = await waitFor('.model-access-content input[type="password"]')
  const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  inputSetter.call(keyInput, ${JSON.stringify(acceptanceSecret)})
  keyInput.dispatchEvent(new Event('input', { bubbles: true }))
  keyInput.dispatchEvent(new Event('change', { bubbles: true }))
  keyInput.closest('form').requestSubmit()
  for (let index = 0; index < 40 && !panel.classList.contains('using-user-key'); index += 1) await wait(50)

  const optionsResponse = await fetch('/api/model-options', { headers: { Accept: 'application/json' } })
  const options = await optionsResponse.json()
  const storedValues = [
    ...Object.keys(localStorage).map((key) => localStorage.getItem(key) || ''),
    ...Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key) || ''),
  ].join('|')
  return {
    optionCount: select.options.length,
    active: panel.classList.contains('using-user-key'),
    badge: panel.querySelector('summary b')?.textContent?.trim(),
    keyInputCleared: keyInput.value === '',
    secretAbsentFromPageText: !(document.body.textContent || '').includes(${JSON.stringify(acceptanceSecret)}),
    secretAbsentFromStorage: !storedValues.includes(${JSON.stringify(acceptanceSecret)}),
    optionsStatus: optionsResponse.status,
    optionsApiVersion: options.apiVersion,
    optionsDoNotExposePrivateConfig: !JSON.stringify(options).includes('apiKeyEnv') && !JSON.stringify(options).includes('baseURL'),
  }
}())`)

await evaluate('location.reload(); true')
await new Promise((resolve) => setTimeout(resolve, 1400))
const afterReload = await evaluate(`(async function () {
  for (let index = 0; index < 50; index += 1) {
    const panel = document.querySelector('.model-access-panel')
    if (panel) return {
      active: panel.classList.contains('using-user-key'),
      summary: panel.querySelector('summary small')?.textContent?.trim(),
      secretAbsentFromStorage: ![
        ...Object.keys(localStorage).map((key) => localStorage.getItem(key) || ''),
        ...Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key) || ''),
      ].join('|').includes(${JSON.stringify(acceptanceSecret)}),
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('刷新后找不到临时模型设置。')
}())`)
close()

const result = { applied, afterReload }
const assert = (condition, detail) => {
  if (!condition) throw new Error(`临时 API Key 浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
}
assert(applied?.optionCount >= 1 && applied.optionsStatus === 200, '可信模型选项未加载。')
assert(applied?.active && applied.badge === '本页临时', '临时 Key 没有在当前页面启用。')
assert(applied?.keyInputCleared && applied.secretAbsentFromPageText, '应用后页面仍显示临时 Key。')
assert(applied?.secretAbsentFromStorage && afterReload?.secretAbsentFromStorage, '临时 Key 被写入浏览器存储。')
assert(applied?.optionsDoNotExposePrivateConfig, '公共模型目录暴露了私有配置。')
assert(afterReload?.active === false && afterReload.summary?.includes('平台'), '刷新页面后临时 Key 没有自动清除。')

console.log(JSON.stringify(result, null, 2))
