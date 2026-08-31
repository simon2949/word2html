import { connectAcceptanceBrowser } from './browser-acceptance-client.mjs'

const adminToken = process.env.WORD2HTML_ADMIN_TOKEN?.trim()
if (!adminToken) throw new Error('请通过 WORD2HTML_ADMIN_TOKEN 环境变量传入验收用管理员令牌。')

const { evaluate, close, pageOrigin } = await connectAcceptanceBrowser()
const origin = new URL(pageOrigin).origin

const created = await evaluate(`(async function () {
  const wait = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))
  const waitFor = async (selector, attempts = 80) => {
    for (let index = 0; index < attempts; index += 1) {
      const element = document.querySelector(selector)
      if (element) return element
      await wait(100)
    }
    throw new Error('等待页面元素超时：' + selector)
  }
  const setInput = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const adminInput = await waitFor('.admin-token-field input')
  setInput(adminInput, ${JSON.stringify(adminToken)})
  adminInput.closest('form').requestSubmit()
  await waitFor('.admin-users-workspace')
  const form = document.querySelector('.admin-users-intro form')
  const fields = form.querySelectorAll('input')
  setInput(fields[0], '浏览器验收用户')
  setInput(fields[1], '7')
  setInput(fields[2], '12000')
  form.requestSubmit()
  const invite = await waitFor('[data-admin-invite-result]')
  const code = invite.querySelector('code')?.textContent?.trim()
  const card = await waitFor('[data-admin-user-id]')
  if (!code) throw new Error('管理员页面没有返回一次性登录码。')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (value) => { window.__word2htmlCopiedCode = value } },
  })
  invite.querySelector('button')?.click()
  const copyDialog = await waitFor('[data-copy-result="success"]')
  const copyPopup = copyDialog.textContent?.includes('已复制') && window.__word2htmlCopiedCode === code
  copyDialog.querySelector('button')?.click()
  return {
    code,
    userId: card.getAttribute('data-admin-user-id'),
    inviteVisible: code.startsWith('w2h-login-'),
    copyPopup,
    adminHasUserNavigation: Boolean(document.querySelector('a[href="/admin/users"]')),
  }
}())`)

await evaluate(`location.href = ${JSON.stringify(origin + '/')}; true`)
await new Promise((resolve) => setTimeout(resolve, 1400))
const loggedIn = await evaluate(`(async function () {
  const wait = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))
  const waitFor = async (selector, attempts = 60) => {
    for (let index = 0; index < attempts; index += 1) {
      const element = document.querySelector(selector)
      if (element) return element
      await wait(100)
    }
    throw new Error('等待页面元素超时：' + selector)
  }
  const loginButton = await waitFor('.user-account-button')
  loginButton.click()
  const input = await waitFor('.user-account-dialog input')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, ${JSON.stringify(created.code)})
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.closest('form').requestSubmit()
  const signedIn = await waitFor('.user-account-button.signed-in')
  const sessionResponse = await fetch('/api/user/session', { headers: { Accept: 'application/json' } })
  const session = await sessionResponse.json()
  const reusedResponse = await fetch('/api/user/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode: ${JSON.stringify(created.code)} }),
  })
  const csrfResponse = await fetch('/api/library/submissions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })
  return {
    label: signedIn.textContent?.trim(),
    sessionStatus: sessionResponse.status,
    quota: session.user?.quota,
    userId: session.user?.id,
    oneTimeReuseStatus: reusedResponse.status,
    missingCsrfStatus: csrfResponse.status,
    httpOnlyCookieHidden: !document.cookie.includes('word2html_user_session'),
    codeAbsentFromStorage: ![
      ...Object.keys(localStorage).map((key) => localStorage.getItem(key) || ''),
      ...Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key) || ''),
    ].join('|').includes(${JSON.stringify(created.code)}),
  }
}())`)

await evaluate('location.reload(); true')
await new Promise((resolve) => setTimeout(resolve, 1400))
const persisted = await evaluate(`(async function () {
  for (let index = 0; index < 60; index += 1) {
    const button = document.querySelector('.user-account-button.signed-in')
    if (button) return { signedIn: true, label: button.textContent?.trim() }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return { signedIn: false }
}())`)

const paused = await evaluate(`(async function () {
  const adminSessionResponse = await fetch('/api/admin/session', { headers: { Accept: 'application/json' } })
  const adminSession = await adminSessionResponse.json()
  const updateResponse = await fetch('/api/admin/users/${encodeURIComponent(created.userId)}', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json',
      'X-CSRF-Token': adminSession.csrfToken,
    },
    body: JSON.stringify({ displayName: '浏览器验收用户', status: 'paused', dailyCalls: 7, dailyTokens: 12000 }),
  })
  const userSessionResponse = await fetch('/api/user/session', { headers: { Accept: 'application/json' } })
  const userSession = await userSessionResponse.json()
  return {
    adminSessionStatus: adminSessionResponse.status,
    updateStatus: updateResponse.status,
    userSessionStatus: userSessionResponse.status,
    userSessionCode: userSession.code,
  }
}())`)
close()

const result = { created: { ...created, code: '[redacted]' }, loggedIn, persisted, paused }
const assert = (condition, detail) => {
  if (!condition) throw new Error(`轻量用户会话浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
}
assert(created?.inviteVisible && created.userId, '管理员没有成功创建用户和一次性登录码。')
assert(created?.copyPopup, '复制登录码成功后没有显示“已复制”弹窗。')
assert(loggedIn?.sessionStatus === 200 && loggedIn.userId === created.userId, '普通用户登录会话未建立。')
assert(loggedIn?.quota?.dailyCalls === 7 && loggedIn.quota?.dailyTokens === 12000, '用户额度没有进入会话。')
assert(loggedIn?.oneTimeReuseStatus === 401, '一次性登录码可以被重复使用。')
assert(loggedIn?.missingCsrfStatus === 403, '登录用户的额度写操作没有校验 CSRF Token。')
assert(loggedIn?.httpOnlyCookieHidden && loggedIn.codeAbsentFromStorage, '登录凭据暴露给脚本或浏览器存储。')
assert(persisted?.signedIn, '签名用户会话没有跨刷新恢复。')
assert(paused?.adminSessionStatus === 200 && paused.updateStatus === 200, '管理员无法暂停账号。')
assert(paused?.userSessionStatus === 403 && paused.userSessionCode === 'user-paused', '暂停账号后用户会话仍然有效。')

console.log(JSON.stringify(result, null, 2))
