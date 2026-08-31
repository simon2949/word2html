import { connectAcceptanceBrowser } from './browser-acceptance-client.mjs'

const { evaluate, close } = await connectAcceptanceBrowser()

await evaluate(`(async function () {
  const library = await import('/src/core/lessonLibrary.ts')
  const entry = library.getOfficialLibraryEntries().find((item) => item.id === 'official.hyperbola-focus-difference')
  if (!entry) throw new Error('找不到双曲线焦点距离差官方场景。')
  localStorage.setItem('word2html.lesson-scene.draft.v0.1', JSON.stringify(entry.scene))
  return true
}())`)
await evaluate('location.reload(); true')
await new Promise((resolve) => setTimeout(resolve, 1400))

const result = await evaluate(`(async function () {
  const waitForRender = (delay = 320) => new Promise((resolve) => {
    let finished = false
    const finish = () => { if (!finished) { finished = true; resolve() } }
    requestAnimationFrame(() => requestAnimationFrame(finish))
    setTimeout(finish, delay)
  })
  const metricValue = (label) => {
    const card = [...document.querySelectorAll('.experiment-metrics .metric-card')]
      .find((element) => element.querySelector('span')?.textContent?.trim() === label)
    return Number.parseFloat(card?.querySelector('strong')?.textContent || 'NaN')
  }
  const setSelect = async (label, value) => {
    const select = document.querySelector('select[aria-label="' + label + '"]')
    if (!(select instanceof HTMLSelectElement)) throw new Error('找不到选择框：' + label)
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    setter?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await waitForRender()
  }
  await waitForRender()
  const svg = document.querySelector('svg.time-experiment-canvas')
  const formula = document.querySelector('.formula-card--above')
  if (!(svg instanceof SVGElement)) throw new Error('数学参数轨迹画布未显示。')
  const formulaBeforeCanvas = Boolean(formula && (formula.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING))
  const initialBodyIds = [...svg.querySelectorAll('[data-body-id]')].map((element) => element.getAttribute('data-body-id'))
  const initialDistanceLines = svg.querySelectorAll('[data-vector-display="distance"] line')
  const initialDifference = metricValue('距离差绝对值')
  const initialExpected = metricValue('理论常量 2a')

  const play = [...document.querySelectorAll('button')].find((element) => element.textContent?.includes('播放'))
  if (!(play instanceof HTMLButtonElement)) throw new Error('找不到参数轨迹播放按钮。')
  play.click()
  await new Promise((resolve) => setTimeout(resolve, 720))
  const pause = [...document.querySelectorAll('button')].find((element) => element.textContent?.includes('暂停'))
  pause?.click()
  await waitForRender()
  const elapsed = Number.parseFloat(document.querySelector('.experiment-metrics .metric-card--sum strong')?.textContent || '0')
  const rightTrail = svg.querySelector('[data-scene-object-id="trail.hyperbolaRight"]')?.getAttribute('points') || ''
  const leftTrail = svg.querySelector('[data-scene-object-id="trail.hyperbolaLeft"]')?.getAttribute('points') || ''

  await setSelect('轨迹坐标吸附', '1')
  const beforeDragTime = Number.parseFloat(document.querySelector('.experiment-metrics .metric-card--sum strong')?.textContent || '0')
  const rightBody = document.querySelector('[data-body-id="hyperbolaRight"]')
  const leftBody = document.querySelector('[data-body-id="hyperbolaLeft"]')
  const focusRight = document.querySelector('[data-body-id="focusRight"]')
  const dragSvg = document.querySelector('svg.time-experiment-canvas')
  if (!(rightBody instanceof SVGCircleElement) || !(leftBody instanceof SVGCircleElement) || !(dragSvg instanceof SVGElement)) throw new Error('找不到可拖动的双曲线动点。')
  const beforeDrag = {
    rightX: Number(rightBody.getAttribute('cx')), rightY: Number(rightBody.getAttribute('cy')),
    leftX: Number(leftBody.getAttribute('cx')), leftY: Number(leftBody.getAttribute('cy')),
  }
  dragSvg.setPointerCapture = () => {}
  dragSvg.releasePointerCapture = () => {}
  const rightRect = rightBody.getBoundingClientRect()
  rightBody.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, pointerId: 31,
    clientX: rightRect.left + rightRect.width / 2,
    clientY: rightRect.top + rightRect.height / 2,
  }))
  await waitForRender()
  const movingSvg = document.querySelector('svg.time-experiment-canvas')
  if (!(movingSvg instanceof SVGElement)) throw new Error('开始拖动后参数轨迹画布消失。')
  movingSvg.setPointerCapture = () => {}
  movingSvg.releasePointerCapture = () => {}
  const moveRect = movingSvg.getBoundingClientRect()
  movingSvg.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, pointerId: 31, buttons: 1,
    clientX: moveRect.left + moveRect.width * 0.60,
    clientY: moveRect.top + moveRect.height * 0.45,
  }))
  await waitForRender(520)
  const releaseSvg = document.querySelector('svg.time-experiment-canvas')
  if (!(releaseSvg instanceof SVGElement)) throw new Error('拖动过程中参数轨迹画布消失。')
  releaseSvg.releasePointerCapture = () => {}
  releaseSvg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 31 }))
  await waitForRender()
  const rightAfter = document.querySelector('[data-body-id="hyperbolaRight"]')
  const leftAfter = document.querySelector('[data-body-id="hyperbolaLeft"]')
  const afterDragTime = Number.parseFloat(document.querySelector('.experiment-metrics .metric-card--sum strong')?.textContent || '0')
  const afterDrag = {
    rightX: Number(rightAfter?.getAttribute('cx')), rightY: Number(rightAfter?.getAttribute('cy')),
    leftX: Number(leftAfter?.getAttribute('cx')), leftY: Number(leftAfter?.getAttribute('cy')),
    worldX: Number(rightAfter?.getAttribute('data-world-x')),
    worldY: Number(rightAfter?.getAttribute('data-world-y')),
    selected: rightAfter?.getAttribute('data-scene-selected'),
    distanceDifference: metricValue('距离差绝对值'),
  }
  const dragAssists = {
    snapStep: releaseSvg.getAttribute('data-time-trace-snap-step'),
    snapAxis: releaseSvg.getAttribute('data-time-trace-snap-axis'),
    rightDraggable: rightAfter?.getAttribute('data-trace-draggable'),
    focusDraggable: focusRight?.getAttribute('data-trace-draggable'),
  }

  const parameterTab = [...document.querySelectorAll('[role="tab"]')]
    .find((element) => element.textContent?.trim() === '参数')
  parameterTab?.click()
  await waitForRender()
  const aInput = document.querySelector('input[aria-label="半实轴 a数值"]')
  if (!(aInput instanceof HTMLInputElement)) throw new Error('找不到半实轴参数输入框。')
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(aInput, '4')
  aInput.dispatchEvent(new Event('input', { bubbles: true }))
  aInput.dispatchEvent(new Event('change', { bubbles: true }))
  await waitForRender(420)
  const changedDifference = metricValue('距离差绝对值')
  const changedExpected = metricValue('理论常量 2a')

  const distanceLine = document.querySelector('[data-scene-object-id="vector.toLeftFocus"]')
  if (!(distanceLine instanceof SVGLineElement)) throw new Error('找不到动点到左焦点的距离线。')
  distanceLine.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await waitForRender()
  const dashed = [...document.querySelectorAll('[role="radio"]')]
    .find((element) => element.textContent?.trim() === '虚线')
  if (!(dashed instanceof HTMLButtonElement)) throw new Error('找不到距离线对象级虚线选项。')
  dashed.click()
  await waitForRender(420)
  const styledLine = document.querySelector('[data-scene-object-id="vector.toLeftFocus"]')

  const zoomBefore = document.querySelector('.zoom-value')?.textContent?.trim()
  const zoomIn = document.querySelector('button[aria-label="放大画布"]')
  zoomIn?.click()
  await waitForRender()
  const zoomAfter = document.querySelector('.zoom-value')?.textContent?.trim()

  await new Promise((resolve) => setTimeout(resolve, 360))
  const draft = JSON.parse(localStorage.getItem('word2html.lesson-scene.draft.v0.1') || 'null')
  const exportModule = await import('/src/core/exportHtml.ts')
  const html = exportModule.exportSceneAsStandaloneHtml(draft)
  const runtime = [...html.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/g)].at(-1)?.[1] || ''
  const frame = document.createElement('iframe')
  frame.style.width = '900px'
  const frameLoaded = new Promise((resolve, reject) => {
    frame.addEventListener('load', resolve, { once: true })
    frame.addEventListener('error', reject, { once: true })
  })
  frame.srcdoc = html
  document.body.append(frame)
  await frameLoaded
  await new Promise((resolve) => setTimeout(resolve, 160))
  const standaloneDocument = frame.contentDocument
  const standaloneWindow = frame.contentWindow
  const standaloneSelect = standaloneDocument?.querySelector('#trace-snap-step')
  if (!standaloneSelect || standaloneSelect.tagName !== 'SELECT' || !standaloneWindow) throw new Error('独立 HTML 缺少轨迹坐标吸附控件。')
  standaloneSelect.value = '1'
  standaloneSelect.dispatchEvent(new standaloneWindow.Event('change', { bubbles: true }))
  const standaloneBody = standaloneDocument.querySelector('[data-body-id$="hyperbolaRight"]')
  const standaloneSvg = standaloneDocument.querySelector('#plot')
  if (!standaloneBody || standaloneBody.tagName !== 'circle' || !standaloneSvg || standaloneSvg.tagName !== 'svg') throw new Error('独立 HTML 缺少可拖动轨迹点。')
  standaloneSvg.setPointerCapture = () => {}
  standaloneSvg.releasePointerCapture = () => {}
  const standaloneBodyRect = standaloneBody.getBoundingClientRect()
  standaloneBody.dispatchEvent(new standaloneWindow.PointerEvent('pointerdown', {
    bubbles: true, pointerId: 41,
    clientX: standaloneBodyRect.left + standaloneBodyRect.width / 2,
    clientY: standaloneBodyRect.top + standaloneBodyRect.height / 2,
  }))
  const standaloneRect = standaloneSvg.getBoundingClientRect()
  standaloneSvg.dispatchEvent(new standaloneWindow.PointerEvent('pointermove', {
    bubbles: true, pointerId: 41, buttons: 1,
    clientX: standaloneRect.left + standaloneRect.width * 0.60,
    clientY: standaloneRect.top + standaloneRect.height * 0.45,
  }))
  standaloneSvg.dispatchEvent(new standaloneWindow.PointerEvent('pointerup', { bubbles: true, pointerId: 41 }))
  const standaloneAfter = standaloneDocument.querySelector('[data-body-id$="hyperbolaRight"]')
  const standaloneLive = {
    snapStep: standaloneSvg.getAttribute('data-time-trace-snap-step'),
    snapAxis: standaloneSvg.getAttribute('data-time-trace-snap-axis'),
    worldX: Number(standaloneAfter?.getAttribute('data-world-x')),
    worldY: Number(standaloneAfter?.getAttribute('data-world-y')),
  }
  frame.remove()
  return {
    viewBox: svg.getAttribute('viewBox'), formulaBeforeCanvas, initialBodyIds,
    initialDistanceLineCount: initialDistanceLines.length,
    initialDifference, initialExpected, elapsed,
    rightTrailLength: rightTrail.length, leftTrailLength: leftTrail.length,
    beforeDragTime, afterDragTime, beforeDrag, afterDrag, dragAssists,
    changedDifference, changedExpected,
    parameterValue: draft?.parameters?.a?.value,
    selected: styledLine?.getAttribute('data-scene-selected'),
    lineStyle: draft?.appearance?.objectStyles?.['vector.toLeftFocus']?.lineStyle,
    dashArray: styledLine?.getAttribute('stroke-dasharray') || '',
    zoomBefore, zoomAfter,
    standalone: {
      hasRuntime: html.includes('INTERACTIVE EXPERIMENT') && html.includes('data-vector-display'),
      hasHyperbola: html.includes('双曲线的焦点距离差') && html.includes('distanceDifference'),
      hasTraceDragging: html.includes('id="trace-snap-step"') && html.includes('function nearestTraceTime(') && html.includes('function rootsFor(') && html.includes('data-trace-draggable='),
      hasCoordinateSnapEvidence: html.includes('data-time-trace-snap-axis') && html.includes('data-world-x=') && html.includes('data-world-y='),
      validScript: Boolean(runtime),
      hasNetworkDependency: /<script[^>]+src=|<link[^>]+href=/i.test(html),
    },
    standaloneLive,
  }
}())`)
close()

const assert = (condition, detail) => {
  if (!condition) throw new Error(`数学参数轨迹浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
}
assert(result?.viewBox === '0 0 900 590' && result.formulaBeforeCanvas, '画布尺寸或公式位置不正确。')
assert(['hyperbolaRight', 'hyperbolaLeft', 'focusRight', 'focusLeft'].every((id) => result?.initialBodyIds?.includes(id)), '两支动点或两个焦点没有完整显示。')
assert(result?.initialDistanceLineCount === 2, '动点没有通过两条直线连接两个焦点。')
assert(Math.abs(result?.initialDifference - 6) < 0.011 && Math.abs(result.initialDifference - result.initialExpected) < 0.011, '默认距离差不等于 2a。')
assert(result?.elapsed > 0 && result.rightTrailLength > 100 && result.leftTrailLength > 100, '播放后没有同步描出双曲线两支轨迹。')
assert(Math.abs(result?.afterDragTime - result.beforeDragTime) > 0.05
  && Math.hypot(result.afterDrag.rightX - result.beforeDrag.rightX, result.afterDrag.rightY - result.beforeDrag.rightY) > 2
  && Math.hypot(result.afterDrag.leftX - result.beforeDrag.leftX, result.afterDrag.leftY - result.beforeDrag.leftY) > 2
  && result.afterDrag.selected === 'true'
  && Math.abs(result.afterDrag.distanceDifference - 6) < 0.011,
'拖动右支动点后没有沿共同轨迹同步更新两支或保持距离差不变量。')
assert(result?.dragAssists?.snapStep === '1' && result.dragAssists.rightDraggable === 'true' && result.dragAssists.focusDraggable === 'false', '轨迹坐标吸附或动点/固定焦点的可拖动识别不正确。')
assert(['x', 'y'].includes(result?.dragAssists?.snapAxis)
  && Number.isFinite(result?.afterDrag?.worldX)
  && Number.isFinite(result?.afterDrag?.worldY)
  && Math.abs(result.afterDrag[result.dragAssists.snapAxis === 'x' ? 'worldX' : 'worldY']
    - Math.round(result.afterDrag[result.dragAssists.snapAxis === 'x' ? 'worldX' : 'worldY'])) < 1e-6,
'步长为 1 时，拖动后的动点 x 或 y 坐标没有真正吸附到整数网格。')
assert(result?.parameterValue === 4 && Math.abs(result.changedDifference - 8) < 0.011 && Math.abs(result.changedDifference - result.changedExpected) < 0.011, '修改半实轴后没有在本地重新计算距离差。')
assert(result?.selected === 'true' && result.lineStyle === 'dashed' && result.dashArray, '距离线选择或对象级虚线样式没有生效。')
assert(result?.zoomBefore === '100%' && result.zoomAfter === '110%', '画布缩放控制没有生效。')
assert(result?.standalone?.hasRuntime && result.standalone.hasHyperbola && result.standalone.hasTraceDragging && result.standalone.hasCoordinateSnapEvidence && result.standalone.validScript && !result.standalone.hasNetworkDependency, '独立 HTML 缺少参数轨迹运行时、最终点坐标吸附证据、场景数据或包含网络依赖。')
assert(result?.standaloneLive?.snapStep === '1'
  && ['x', 'y'].includes(result.standaloneLive.snapAxis)
  && Math.abs(result.standaloneLive[result.standaloneLive.snapAxis === 'x' ? 'worldX' : 'worldY']
    - Math.round(result.standaloneLive[result.standaloneLive.snapAxis === 'x' ? 'worldX' : 'worldY'])) < 1e-6,
'独立 HTML 中拖动后的动点坐标没有按整数网格吸附。')

console.log(JSON.stringify(result, null, 2))
