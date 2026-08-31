const debugPort = Number(process.argv[2] ?? 9333)
const pageOrigin = process.argv[3] ?? 'http://127.0.0.1:5173'
const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()
const page = targets.find((target) => target.type === 'page' && target.url.startsWith(pageOrigin))
if (!page?.webSocketDebuggerUrl) throw new Error(`找不到 ${pageOrigin} 对应的 Chrome 页面。`)

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
  const entry = library.getOfficialLibraryEntries().find((item) => item.id === 'official.polar-rose')
  if (!entry) throw new Error('找不到极坐标玫瑰线官方场景。')
  localStorage.setItem('word2html.lesson-scene.draft.v0.1', JSON.stringify(entry.scene))
  return true
}())`)
await evaluate('location.reload(); true')
await new Promise((resolve) => setTimeout(resolve, 1400))

const result = await evaluate(`(async function () {
  const waitForRender = () => new Promise((resolve) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      resolve()
    }
    requestAnimationFrame(() => requestAnimationFrame(finish))
    setTimeout(finish, 300)
  })
  await waitForRender()
  const svg = document.querySelector('svg.relation-curve-2d-canvas')
  const path = document.querySelector('[data-scene-object-id="relationCurve"]')
  const formula = document.querySelector('.formula-card--above')
  if (!(svg instanceof SVGElement) || !(path instanceof SVGPathElement)) throw new Error('二维关系曲线画布未显示。')
  const before = path.getAttribute('d') || ''
  const formulaBeforeCanvas = Boolean(formula && (formula.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING))

  const parameterTab = [...document.querySelectorAll('[role="tab"]')]
    .find((element) => element.textContent?.trim() === '参数')
  parameterTab?.click()
  await waitForRender()
  const scaleInput = document.querySelector('input[aria-label="尺度 a数值"]')
  if (!(scaleInput instanceof HTMLInputElement)) throw new Error('找不到尺度参数输入框。')
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(scaleInput, '4')
  scaleInput.dispatchEvent(new Event('input', { bubbles: true }))
  scaleInput.dispatchEvent(new Event('change', { bubbles: true }))
  await waitForRender()
  const changedPath = document.querySelector('[data-scene-object-id="relationCurve"]')
  const after = changedPath?.getAttribute('d') || ''

  changedPath?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await waitForRender()
  const dashed = [...document.querySelectorAll('[role="radio"]')]
    .find((element) => element.textContent?.trim() === '虚线')
  if (!(dashed instanceof HTMLButtonElement)) throw new Error('找不到对象级虚线选项。')
  dashed.click()
  await waitForRender()
  const styledPath = document.querySelector('[data-scene-object-id="relationCurve"]')
  await new Promise((resolve) => setTimeout(resolve, 360))
  const draft = JSON.parse(localStorage.getItem('word2html.lesson-scene.draft.v0.1') || 'null')

  const exportModule = await import('/src/core/exportHtml.ts')
  const html = exportModule.exportSceneAsStandaloneHtml(draft)
  return {
    mode: svg.getAttribute('data-curve-mode'),
    viewBox: svg.getAttribute('viewBox'),
    formulaBeforeCanvas,
    beforeLength: before.length,
    afterLength: after.length,
    pathChanged: before !== after,
    parameterValue: draft?.parameters?.a?.value,
    lineStyle: draft?.appearance?.objectStyles?.relationCurve?.lineStyle,
    dashArray: styledPath?.getAttribute('stroke-dasharray') || '',
    selected: styledPath?.getAttribute('data-scene-selected'),
    standalone: {
      hasRuntime: html.includes('2D RELATION CURVE') && html.includes('function paths()'),
      hasControls: html.includes('视图缩放') && html.includes('曲线颜色'),
      hasNetworkDependency: /<script[^>]+src=|<link[^>]+href=/i.test(html),
    },
  }
}())`)
socket.close()

const assert = (condition, detail) => {
  if (!condition) throw new Error(`二维关系曲线浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
}
assert(result?.mode === 'polar' && result.viewBox === '0 0 900 590', '官方场景没有以极坐标模式完整显示。')
assert(result?.formulaBeforeCanvas, '公式说明没有位于曲线画布上方。')
assert(result?.beforeLength > 1000 && result.pathChanged, '参数修改后曲线路径没有重新采样。')
assert(result?.parameterValue === 4, '参数修改没有写入本地草稿。')
assert(result?.lineStyle === 'dashed' && result.dashArray && result.selected === 'true', '曲线对象选择或局部虚线样式没有生效。')
assert(result?.standalone?.hasRuntime && result.standalone.hasControls && !result.standalone.hasNetworkDependency, '独立 HTML 缺少运行时、控件或包含网络依赖。')

console.log(JSON.stringify(result, null, 2))
