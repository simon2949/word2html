const debugPort = Number(process.argv[2] ?? 9333)
const pageOrigin = process.argv[3] ?? 'http://127.0.0.1:5173'
const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()
const page = targets.find((target) => target.type === 'page' && target.url.startsWith(pageOrigin))
if (!page?.webSocketDebuggerUrl) throw new Error(`找不到 ${pageOrigin} 对应的 Chrome 页面。`)

const browserExpression = `
(async function () {
  const waitForRender = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  await waitForRender()

  const focus = document.querySelector('[data-scene-object-id="focusLeft"]')
  if (!focus) throw new Error('找不到左焦点。')
  focus.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await waitForRender()
  const colorInput = document.querySelector('[data-selected-object-id="focusLeft"] input[type="color"]')
  if (!(colorInput instanceof HTMLInputElement)) throw new Error('找不到对象颜色控件。')
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(colorInput, '#2244aa')
  colorInput.dispatchEvent(new Event('input', { bubbles: true }))
  colorInput.dispatchEvent(new Event('change', { bubbles: true }))
  await waitForRender()

  const displayTab = [...document.querySelectorAll('[role="tab"]')]
    .find((element) => element.textContent?.trim() === '显示效果')
  if (!displayTab) throw new Error('找不到显示效果标签页。')
  displayTab.click()
  await waitForRender()

  const styleButtons = [...document.querySelectorAll('[data-style-preset-id]')]
  const layoutButtons = [...document.querySelectorAll('[data-layout-preset-id]')]
  const darkButton = document.querySelector('[data-style-preset-id="dark-presentation"]')
  if (!(darkButton instanceof HTMLButtonElement)) throw new Error('找不到深色演示预设。')
  darkButton.click()
  await waitForRender()
  const beforeApply = {
    theme: document.querySelector('.ellipse-canvas')?.closest('[data-theme]')?.getAttribute('data-theme'),
    selectedPreview: darkButton.getAttribute('aria-pressed')
  }
  const styleApply = [...document.querySelectorAll('.preset-apply-button')]
    .find((element) => element.textContent?.includes('深色演示'))
  if (!(styleApply instanceof HTMLButtonElement)) throw new Error('找不到样式应用按钮。')
  styleApply.click()
  await waitForRender()

  const styled = {
    theme: document.querySelector('.ellipse-canvas')?.closest('[data-theme]')?.getAttribute('data-theme'),
    curve: document.querySelector('[data-scene-object-id="ellipse"]')?.getAttribute('stroke'),
    focusOverride: document.querySelector('[data-scene-object-id="focusLeft"]')?.getAttribute('fill'),
    active: document.querySelector('.appearance-presets')?.getAttribute('data-active-style-preset')
  }

  document.querySelector('button[title="撤销"]')?.click()
  await waitForRender()
  const undoTheme = document.querySelector('.ellipse-canvas')?.closest('[data-theme]')?.getAttribute('data-theme')
  document.querySelector('button[title="重做"]')?.click()
  await waitForRender()
  const redoTheme = document.querySelector('.ellipse-canvas')?.closest('[data-theme]')?.getAttribute('data-theme')

  const centeredButton = document.querySelector('[data-layout-preset-id="centered"]')
  if (!(centeredButton instanceof HTMLButtonElement)) throw new Error('找不到图像居中布局。')
  centeredButton.click()
  await waitForRender()
  const layoutApply = [...document.querySelectorAll('.layout-apply-button')]
    .find((element) => element.textContent?.includes('图像居中'))
  if (!(layoutApply instanceof HTMLButtonElement)) throw new Error('找不到布局应用按钮。')
  layoutApply.click()
  await new Promise((resolve) => setTimeout(resolve, 420))

  const metricRow = document.querySelector('.canvas-stack > .metric-row')
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
  const frameDocument = frame.contentDocument
  const standalone = {
    theme: frameDocument?.body.dataset.theme,
    layout: frameDocument?.body.dataset.layoutPreset,
    asideDisplay: frameDocument && frame.contentWindow ? frame.contentWindow.getComputedStyle(frameDocument.querySelector('aside')).display : null,
    metricDisplay: frameDocument && frame.contentWindow ? frame.contentWindow.getComputedStyle(frameDocument.querySelector('.metrics')).display : null,
    canvasBackground: frameDocument?.querySelector('#plot rect')?.getAttribute('fill'),
    focusOverride: frameDocument?.querySelector('[data-scene-object-id="focusLeft"]')?.getAttribute('fill')
  }
  frame.remove()

  return {
    presetCounts: { style: styleButtons.length, layout: layoutButtons.length },
    beforeApply,
    styled,
    undoRedo: { undoTheme, redoTheme },
    layout: {
      active: document.querySelector('.preview-stage')?.getAttribute('data-layout-preset'),
      metricDisplay: metricRow ? getComputedStyle(metricRow).display : null
    },
    draft: {
      theme: draft?.appearance?.theme,
      layout: draft?.appearance?.layoutPreset,
      focusOverride: draft?.appearance?.objectStyles?.focusLeft?.color
    },
    standalone
  }
}())`

const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let requestId = 0
async function evaluate(expression) {
  requestId += 1
  const id = requestId
  socket.send(JSON.stringify({
    id,
    method: 'Runtime.evaluate',
    params: { expression, awaitPromise: true, returnByValue: true },
  }))
  const message = await new Promise((resolve, reject) => {
    const handleMessage = (event) => {
      const parsed = JSON.parse(event.data)
      if (parsed.id !== id) return
      socket.removeEventListener('message', handleMessage)
      resolve(parsed)
    }
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('error', reject, { once: true })
  })
  if (message.result?.exceptionDetails) {
    throw new Error(message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text)
  }
  return message.result?.result?.value
}

await evaluate(`(async function () {
  const library = await import('/src/core/lessonLibrary.ts')
  const entry = library.getOfficialLibraryEntries().find((item) => item.id === 'official.ellipse-focus-sum')
  if (!entry) throw new Error('找不到官方椭圆场景。')
  localStorage.setItem('word2html.lesson-scene.draft.v0.1', JSON.stringify(entry.scene))
  return true
}())`)
await evaluate('location.reload(); true')
await new Promise((resolve) => setTimeout(resolve, 1400))
const result = await evaluate(browserExpression)
socket.close()
const assert = (condition, detail) => {
  if (!condition) throw new Error(`预设浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
}

assert(result?.presetCounts?.style === 5 && result.presetCounts.layout === 4, '预设数量不正确。')
assert(result?.beforeApply?.theme === 'light' && result.beforeApply.selectedPreview === 'true', '预览不应在应用前修改场景。')
assert(result?.styled?.theme === 'dark' && result.styled.curve === '#A9A7FF', '深色预设未应用到画布。')
assert(result?.styled?.focusOverride === '#2244aa', '应用预设错误清除了对象局部样式。')
assert(result?.undoRedo?.undoTheme === 'light' && result.undoRedo.redoTheme === 'dark', '预设没有进入撤销重做。')
assert(result?.layout?.active === 'centered' && result.layout.metricDisplay === 'none', '图像居中布局未生效。')
assert(result?.draft?.theme === 'dark' && result.draft.layout === 'centered' && result.draft.focusOverride === '#2244aa', '草稿没有保存预设或对象覆盖。')
assert(result?.standalone?.theme === 'dark' && result.standalone.layout === 'centered', '独立 HTML 没有保留预设。')
assert(result?.standalone?.asideDisplay === 'none' && result.standalone.metricDisplay === 'none', '独立 HTML 布局未生效。')
assert(result?.standalone?.canvasBackground === '#17212b' && result.standalone.focusOverride === '#2244aa', '独立 HTML 深色画布或对象覆盖不正确。')

console.log(JSON.stringify(result, null, 2))
