const debugPort = Number(process.argv[2] ?? 9333)
const pageOrigin = process.argv[3] ?? 'http://127.0.0.1:5181'
const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()
const page = targets.find((target) => target.type === 'page' && target.url.startsWith(pageOrigin))
if (!page?.webSocketDebuggerUrl) throw new Error(`找不到 ${pageOrigin} 对应的 Chrome 页面。`)

const browserExpression = `
(async function () {
  const waitForRender = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  const changeInput = (input, value) => {
    if (!(input instanceof HTMLInputElement)) throw new Error('找不到对象属性输入控件。')
    inputValueSetter?.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  await waitForRender()
  const focus = document.querySelector('[data-scene-object-id="focusLeft"]')
  if (!focus) throw new Error('找不到左焦点场景对象。')
  focus.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await waitForRender()

  const inspector = document.querySelector('[data-selected-object-id="focusLeft"]')
  const objectTab = [...document.querySelectorAll('[role="tab"]')]
    .find((element) => element.textContent?.trim() === '对象')
  if (!inspector || objectTab?.getAttribute('aria-selected') !== 'true') {
    throw new Error('点击画布对象后没有打开对应属性面板。')
  }

  changeInput(inspector.querySelector('input[type="color"]'), '#2244aa')
  await waitForRender()
  changeInput(document.getElementById('object-point-radius'), 14)
  await waitForRender()
  const shadowButton = [...document.querySelectorAll('.object-choice-grid button')]
    .find((element) => element.textContent?.trim() === '投影')
  if (!shadowButton) throw new Error('找不到对象投影样式。')
  shadowButton.click()
  await waitForRender()

  const styledFocus = document.querySelector('[data-scene-object-id="focusLeft"]')
  const siblingFocus = document.querySelector('[data-scene-object-id="focusRight"]')
  const styled = {
    selected: styledFocus?.getAttribute('data-scene-selected'),
    radius: styledFocus?.getAttribute('r'),
    fill: styledFocus?.getAttribute('fill'),
    filter: styledFocus?.getAttribute('filter'),
    siblingRadius: siblingFocus?.getAttribute('r'),
    siblingFill: siblingFocus?.getAttribute('fill')
  }

  document.querySelector('button[title="撤销"]')?.click()
  await waitForRender()
  const afterUndo = document.querySelector('[data-scene-object-id="focusLeft"]')?.getAttribute('filter') ?? null
  document.querySelector('button[title="重做"]')?.click()
  await waitForRender()
  const afterRedo = document.querySelector('[data-scene-object-id="focusLeft"]')?.getAttribute('filter') ?? null

  let visibilityInput = document.querySelector('.object-visible-toggle input')
  visibilityInput?.click()
  await waitForRender()
  const hidden = document.querySelector('[data-scene-object-id="focusLeft"]') === null
  visibilityInput = document.querySelector('.object-visible-toggle input')
  visibilityInput?.click()
  await new Promise((resolve) => setTimeout(resolve, 420))
  const shownAgain = document.querySelector('[data-scene-object-id="focusLeft"]') !== null

  const draft = JSON.parse(localStorage.getItem('word2html.lesson-scene.draft.v0.1') || 'null')
  const exportModule = await import('/src/core/exportHtml.ts')
  const html = exportModule.exportSceneAsStandaloneHtml(draft)
  const frame = document.createElement('iframe')
  const loaded = new Promise((resolve, reject) => {
    frame.addEventListener('load', resolve, { once: true })
    frame.addEventListener('error', reject, { once: true })
  })
  frame.srcdoc = html
  document.body.append(frame)
  await loaded
  await new Promise((resolve) => setTimeout(resolve, 80))
  const exportedFocus = frame.contentDocument?.querySelector('[data-scene-object-id="focusLeft"]')
  const standalone = {
    radius: exportedFocus?.getAttribute('r'),
    fill: exportedFocus?.getAttribute('fill'),
    hasShadow: exportedFocus?.getAttribute('style')?.includes('drop-shadow') ?? false
  }
  frame.remove()

  return {
    panel: {
      selectedId: inspector.getAttribute('data-selected-object-id'),
      objectTabSelected: objectTab?.getAttribute('aria-selected')
    },
    styled,
    undoRedo: { afterUndo, afterRedo },
    visibility: { hidden, shownAgain },
    draft: {
      override: draft?.appearance?.objectStyles?.focusLeft,
      selectionPersisted: Object.prototype.hasOwnProperty.call(draft || {}, 'selectedObjectId')
    },
    standalone
  }
}())`

const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
socket.send(JSON.stringify({
  id: 1,
  method: 'Runtime.evaluate',
  params: { expression: browserExpression, awaitPromise: true, returnByValue: true },
}))
const message = await new Promise((resolve, reject) => {
  const handleMessage = (event) => {
    const parsed = JSON.parse(event.data)
    if (parsed.id !== 1) return
    socket.removeEventListener('message', handleMessage)
    resolve(parsed)
  }
  socket.addEventListener('message', handleMessage)
  socket.addEventListener('error', reject, { once: true })
})
socket.close()

if (message.result?.exceptionDetails) {
  throw new Error(message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text)
}
const result = message.result?.result?.value
const assert = (condition, detail) => {
  if (!condition) throw new Error(`对象编辑浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
}

assert(result?.panel?.selectedId === 'focusLeft' && result.panel.objectTabSelected === 'true', '对象选择或面板联动无效。')
assert(result?.styled?.selected === 'true', '画布没有高亮选中对象。')
assert(result?.styled?.radius === '13' && result.styled.fill === '#2244aa', '左焦点大小或颜色覆盖无效。')
assert(result?.styled?.filter === 'url(#ellipse-point-shadow)', '左焦点投影覆盖无效。')
assert(result?.styled?.siblingRadius === '6' && result.styled.siblingFill === '#E15C48', '局部修改错误影响了右焦点。')
assert(result?.undoRedo?.afterUndo === null && result.undoRedo.afterRedo === 'url(#ellipse-point-shadow)', '对象样式没有进入撤销重做。')
assert(result?.visibility?.hidden && result.visibility.shownAgain, '对象隐藏或重新显示无效。')
assert(result?.draft?.override?.pointRadius === 14 && result.draft.override.pointStyle === 'shadow', '草稿没有保存对象覆盖。')
assert(result?.draft?.selectionPersisted === false, '运行时选择状态不应写入场景。')
assert(result?.standalone?.radius === '13' && result.standalone.fill === '#2244aa' && result.standalone.hasShadow, '独立 HTML 没有保留对象覆盖。')

console.log(JSON.stringify(result, null, 2))
