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
    const cleanup = () => {
      clearTimeout(timeout)
      socket.removeEventListener('message', handleMessage)
      socket.removeEventListener('error', handleError)
    }
    const handleMessage = (event) => {
      const parsed = JSON.parse(event.data)
      if (parsed.id !== id) return
      cleanup()
      resolve(parsed)
    }
    const handleError = (error) => {
      cleanup()
      reject(error)
    }
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`等待 Chrome 执行第 ${id} 个验收步骤超时（20 秒）。`))
    }, 20_000)
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('error', handleError, { once: true })
  })
  if (message.result?.exceptionDetails) throw new Error(message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text)
  return message.result?.result?.value
}

await evaluate(`(async function () {
  const library = await import('/src/core/lessonLibrary.ts')
  const entry = library.getOfficialLibraryEntries().find((item) => item.id === 'official.geometry-rotation-locus')
  if (!entry) throw new Error('找不到旋转轨迹官方场景。')
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
  const svg = document.querySelector('svg.geometry-2d-canvas')
  const initialLocus = document.querySelector('[data-scene-object-id="locus.rotationCircle"]')
  const formula = document.querySelector('.formula-card--above')
  if (!(svg instanceof SVGElement) || !(initialLocus instanceof SVGPathElement)) throw new Error('几何变换画布或轨迹未显示。')
  const beforePath = initialLocus.getAttribute('d') || ''
  const formulaBeforeCanvas = Boolean(formula && (formula.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING))

  const parameterTab = [...document.querySelectorAll('[role="tab"]')].find((element) => element.textContent?.trim() === '参数')
  parameterTab?.click()
  await waitForRender()
  const angleInput = document.querySelector('input[aria-label="旋转角 θ（弧度）数值"]')
  if (!(angleInput instanceof HTMLInputElement)) throw new Error('找不到旋转角参数输入框。')
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(angleInput, '1.4')
  angleInput.dispatchEvent(new Event('input', { bubbles: true }))
  angleInput.dispatchEvent(new Event('change', { bubbles: true }))
  await waitForRender()
  const rotatedPoint = document.querySelector('[data-scene-object-id="point.R"]')
  const angleValueAfterSlider = JSON.parse(localStorage.getItem('word2html.lesson-scene.draft.v0.1') || 'null')?.parameters?.theta?.value

  const appearanceTab = [...document.querySelectorAll('[role="tab"]')].find((element) => element.textContent?.trim() === '显示效果')
  if (!(appearanceTab instanceof HTMLButtonElement)) throw new Error('找不到“显示效果”页签。')
  appearanceTab.click()
  await waitForRender()
  const locusToggleLabel = [...document.querySelectorAll('label')].find((label) => label.textContent?.trim() === '几何轨迹')
  const locusToggle = locusToggleLabel?.querySelector('input[type="checkbox"]')
  if (!(locusToggle instanceof HTMLInputElement)) {
    const tabs = [...document.querySelectorAll('[role="tab"]')].map((element) => (element.textContent?.trim() || '') + ':' + element.getAttribute('aria-selected')).join('，')
    throw new Error('找不到几何轨迹开关。当前页签状态：' + tabs)
  }
  locusToggle.click()
  await waitForRender()
  const hiddenAfterToggle = !document.querySelector('[data-scene-object-id="locus.rotationCircle"]')
  locusToggle.click()
  await waitForRender()

  const locus = document.querySelector('[data-scene-object-id="locus.rotationCircle"]')
  locus?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await waitForRender()
  const dashed = [...document.querySelectorAll('[role="radio"]')].find((element) => element.textContent?.trim() === '虚线')
  if (!(dashed instanceof HTMLButtonElement)) throw new Error('找不到对象级虚线选项。')
  dashed.click()
  await waitForRender()
  const locusSelectedAfterStyle = document.querySelector('[data-scene-object-id="locus.rotationCircle"]')?.getAttribute('data-scene-selected')

  const pointP = document.querySelector('[data-scene-object-id="point.P"]')
  if (!(pointP instanceof SVGCircleElement)) throw new Error('找不到圆约束点 P。')
  svg.setPointerCapture = () => {}
  svg.releasePointerCapture = () => {}
  const initialRect = svg.getBoundingClientRect()
  pointP.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 17, clientX: initialRect.left + initialRect.width * 0.65, clientY: initialRect.top + initialRect.height * 0.45 }))
  await waitForRender()
  const dragSvg = document.querySelector('svg.geometry-2d-canvas')
  if (!(dragSvg instanceof SVGElement)) throw new Error('开始拖动后几何画布消失。')
  dragSvg.setPointerCapture = () => {}
  dragSvg.releasePointerCapture = () => {}
  const rect = dragSvg.getBoundingClientRect()
  dragSvg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 17, buttons: 1, clientX: rect.left + rect.width * 0.56, clientY: rect.top + rect.height * 0.20 }))
  await waitForRender()
  const releaseSvg = document.querySelector('svg.geometry-2d-canvas')
  if (!(releaseSvg instanceof SVGElement)) throw new Error('拖动过程中几何画布消失。')
  releaseSvg.releasePointerCapture = () => {}
  releaseSvg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 17, clientX: rect.left + rect.width * 0.56, clientY: rect.top + rect.height * 0.20 }))
  await waitForRender()

  const draft = JSON.parse(localStorage.getItem('word2html.lesson-scene.draft.v0.1') || 'null')
  const geometry = await import('/src/core/geometry2d.ts')
  const snapshot = geometry.evaluateGeometry2D(geometry.getGeometry2DSpec(draft))
  const constrained = snapshot.points.find((point) => point.id === 'P')
  const locusAfter = document.querySelector('[data-scene-object-id="locus.rotationCircle"]')
  const exportModule = await import('/src/core/exportHtml.ts')
  const html = exportModule.exportSceneAsStandaloneHtml(draft)
  return {
    viewBox: svg.getAttribute('viewBox'),
    formulaBeforeCanvas,
    beforePathLength: beforePath.length,
    locusPointCount: (locusAfter?.getAttribute('d') || '').split(' L ').length,
    hiddenAfterToggle,
    angleValueAfterSlider,
    rotatedPoint: [rotatedPoint?.getAttribute('cx'), rotatedPoint?.getAttribute('cy')],
    constraintRadius: constrained ? Math.hypot(constrained.x, constrained.y) : null,
    constraintParametersChanged: draft?.parameters?.Px?.value !== 2.2 || draft?.parameters?.Py?.value !== 1.8,
    locusStyle: draft?.appearance?.objectStyles?.['locus.rotationCircle']?.lineStyle,
    locusDashArray: locusAfter?.getAttribute('stroke-dasharray') || '',
    locusSelectedAfterStyle,
    draggedPointSelected: document.querySelector('[data-scene-object-id="point.P"]')?.getAttribute('data-scene-selected'),
    standalone: {
      hasConstructionRuntime: html.includes('constructionKind') && html.includes('function sampleLoci()'),
      hasTrailControl: html.includes('几何轨迹'),
      hasNetworkDependency: /<script[^>]+src=|<link[^>]+href=/i.test(html),
    },
  }
}())`)
socket.close()

const assert = (condition, detail) => {
  if (!condition) throw new Error(`几何约束与变换浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
}
assert(result?.viewBox === '0 0 900 590' && result.formulaBeforeCanvas, '画布或公式区域布局不正确。')
assert(result?.beforePathLength > 1000 && result.locusPointCount === 241, '旋转轨迹未按固定 241 点完整显示。')
assert(result?.hiddenAfterToggle && result.angleValueAfterSlider === 1.4, '轨迹开关或旋转角参数未生效。')
assert(result?.constraintParametersChanged && Math.abs(result.constraintRadius - 3) < 1e-8, '拖动点没有投影回圆约束。')
assert(result?.locusStyle === 'dashed' && result.locusDashArray && result.locusSelectedAfterStyle === 'true', '轨迹对象选择或局部虚线样式未生效。')
assert(result?.draggedPointSelected === 'true', '拖动点后没有切换到对应对象。')
assert(result?.standalone?.hasConstructionRuntime && result.standalone.hasTrailControl && !result.standalone.hasNetworkDependency, '独立 HTML 缺少构造运行时、轨迹控件或包含网络依赖。')

console.log(JSON.stringify(result, null, 2))
