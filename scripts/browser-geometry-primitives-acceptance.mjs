import { connectAcceptanceBrowser } from './browser-acceptance-client.mjs'

const { evaluate, close } = await connectAcceptanceBrowser()

try {
  await evaluate(`(async function () {
    const library = await import('/src/core/lessonLibrary.ts')
    const entry = library.getOfficialLibraryEntries().find((item) => item.id === 'official.geometry-triangle')
    if (!entry) throw new Error('找不到可拖动三角形官方场景。')
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
    const setNumber = async (label, value) => {
      const input = document.querySelector('input[aria-label="' + label + '数值"]')
      if (!(input instanceof HTMLInputElement)) throw new Error('找不到参数输入框：' + label)
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, String(value))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await waitForRender(420)
    }
    const currentParameter = (label) => Number(document.querySelector('input[aria-label="' + label + '数值"]')?.value)
    const setSelect = async (label, value) => {
      const select = document.querySelector('select[aria-label="' + label + '"]')
      if (!(select instanceof HTMLSelectElement)) throw new Error('找不到选择框：' + label)
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
      setter?.call(select, value)
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await waitForRender()
    }

    await waitForRender()
    const svg = document.querySelector('svg.geometry-2d-canvas')
    const shell = svg?.closest('.canvas-shell')
    const formula = document.querySelector('.formula-card--above')
    if (!(svg instanceof SVGElement) || !(shell instanceof HTMLElement)) throw new Error('二维几何画布未显示。')
    const formulaBeforeCanvas = Boolean(formula && (formula.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING))
    const grid = svg.querySelector('g[aria-hidden="true"]')
    const vertical = [...(grid?.querySelectorAll('line') || [])].filter((line) => line.getAttribute('x1') === line.getAttribute('x2'))
    const horizontal = [...(grid?.querySelectorAll('line') || [])].filter((line) => line.getAttribute('y1') === line.getAttribute('y2'))
    const gridDx = Math.abs(Number(vertical[1]?.getAttribute('x1')) - Number(vertical[0]?.getAttribute('x1')))
    const gridDy = Math.abs(Number(horizontal[1]?.getAttribute('y1')) - Number(horizontal[0]?.getAttribute('y1')))
    const initial = {
      pointIds: [...svg.querySelectorAll('[data-scene-object-id^="point."]')].map((item) => item.getAttribute('data-scene-object-id')),
      polygonCount: svg.querySelectorAll('[data-scene-object-id^="polygon."]').length,
      arcCount: svg.querySelectorAll('[data-scene-object-id^="arc."]').length,
      connectionCount: svg.querySelectorAll('[data-scene-object-id^="connection."]').length,
      measurementCount: svg.querySelectorAll('[data-scene-object-id^="measurement."]').length,
      metricCount: document.querySelectorAll('.experiment-metrics .metric-card').length,
      lengthAB: metricValue('AB'), angleABC: metricValue('∠ABC'), areaABC: metricValue('面积'),
      rayMarker: svg.querySelector('[data-scene-object-id="connection.AC"]')?.getAttribute('marker-end'),
      vectorMarker: svg.querySelector('[data-scene-object-id="connection.BC"]')?.getAttribute('marker-end'),
      segmentMarker: svg.querySelector('[data-scene-object-id="connection.AB"]')?.getAttribute('marker-end'),
      arcPath: svg.querySelector('[data-scene-object-id="arc.angleB"]')?.getAttribute('d') || '',
      polygonPoints: svg.querySelector('[data-scene-object-id="polygon.triangleABC"]')?.getAttribute('points') || '',
    }
    const measurementLabelRects = [...svg.querySelectorAll('[data-measurement-label="true"]')]
      .map((label) => label.getBoundingClientRect())
    const measurementLabelsNonOverlapping = measurementLabelRects.every((first, index) => measurementLabelRects.slice(index + 1)
      .every((second) => first.right <= second.left + 0.5 || second.right <= first.left + 0.5 || first.bottom <= second.top + 0.5 || second.bottom <= first.top + 0.5))

    await setNumber('C 点横坐标', 8)
    await setNumber('C 点纵坐标', 6)
    const extremeSvg = document.querySelector('svg.geometry-2d-canvas')
    const extremePointPositions = [...(extremeSvg?.querySelectorAll('[data-scene-object-id^="point."]') || [])]
      .map((point) => [Number(point.getAttribute('cx')), Number(point.getAttribute('cy'))])
    const extremeInsideViewport = extremePointPositions.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 24 && x <= 876 && y >= 24 && y <= 566)
    const extremeHasInvalidPath = [...(extremeSvg?.querySelectorAll('path, polygon, line') || [])]
      .some((element) => /NaN|Infinity/.test([...element.attributes].map((attribute) => attribute.value).join(' ')))

    const reset = document.querySelector('.reset-button')
    if (!(reset instanceof HTMLButtonElement)) throw new Error('找不到几何场景重置按钮。')
    reset.click()
    await waitForRender(420)
    const restored = {
      Cx: currentParameter('C 点横坐标'), Cy: currentParameter('C 点纵坐标'),
      area: metricValue('面积'),
    }

    const polygon = document.querySelector('[data-scene-object-id="polygon.triangleABC"]')
    if (!(polygon instanceof SVGPolygonElement)) throw new Error('找不到三角形多边形对象。')
    polygon.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitForRender()
    const dashDot = [...document.querySelectorAll('[role="radio"]')]
      .find((element) => element.textContent?.trim() === '点划线')
    if (!(dashDot instanceof HTMLButtonElement)) throw new Error('找不到多边形对象级点划线选项。')
    dashDot.click()
    await waitForRender(420)

    const pointA = document.querySelector('[data-scene-object-id="point.A"]')
    if (!(pointA instanceof SVGCircleElement)) throw new Error('找不到可拖动点 A。')
    pointA.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitForRender()
    const shadow = [...document.querySelectorAll('[role="radio"]')]
      .find((element) => element.textContent?.trim() === '投影')
    if (!(shadow instanceof HTMLButtonElement)) throw new Error('找不到点对象级投影样式选项。')
    shadow.click()
    await waitForRender()
    const pointRadiusInput = document.querySelector('#object-point-radius')
    if (!(pointRadiusInput instanceof HTMLInputElement)) throw new Error('找不到点对象级大小控件。')
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    valueSetter?.call(pointRadiusInput, '12')
    pointRadiusInput.dispatchEvent(new Event('input', { bubbles: true }))
    pointRadiusInput.dispatchEvent(new Event('change', { bubbles: true }))
    await waitForRender(420)

    await setSelect('坐标吸附', '1')
    await setSelect('坐标锁定', 'y')
    const beforeDragArea = metricValue('面积')
    const beforeDragAngle = metricValue('∠ABC')
    const pointC = document.querySelector('[data-scene-object-id="point.C"]')
    const dragSvg = document.querySelector('svg.geometry-2d-canvas')
    if (!(pointC instanceof SVGCircleElement) || !(dragSvg instanceof SVGElement)) throw new Error('找不到拖点 C 或几何画布。')
    dragSvg.setPointerCapture = () => {}
    dragSvg.releasePointerCapture = () => {}
    const startRect = dragSvg.getBoundingClientRect()
    pointC.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 23,
      clientX: startRect.left + startRect.width * 0.60,
      clientY: startRect.top + startRect.height * 0.30,
    }))
    await waitForRender()
    const movingSvg = document.querySelector('svg.geometry-2d-canvas')
    if (!(movingSvg instanceof SVGElement)) throw new Error('开始拖动后几何画布消失。')
    movingSvg.setPointerCapture = () => {}
    movingSvg.releasePointerCapture = () => {}
    const moveRect = movingSvg.getBoundingClientRect()
    movingSvg.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerId: 23, buttons: 1,
      clientX: moveRect.left + moveRect.width * 0.72,
      clientY: moveRect.top + moveRect.height * 0.22,
    }))
    await waitForRender(420)
    const releaseSvg = document.querySelector('svg.geometry-2d-canvas')
    if (!(releaseSvg instanceof SVGElement)) throw new Error('拖动过程中几何画布消失。')
    releaseSvg.releasePointerCapture = () => {}
    releaseSvg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 23 }))
    await waitForRender()
    const parameterTab = [...document.querySelectorAll('[role="tab"]')]
      .find((element) => element.textContent?.trim() === '参数')
    if (!(parameterTab instanceof HTMLButtonElement)) throw new Error('找不到参数页签。')
    parameterTab.click()
    await waitForRender()
    const afterDrag = {
      Cx: currentParameter('C 点横坐标'), Cy: currentParameter('C 点纵坐标'),
      area: metricValue('面积'),
      angleABC: metricValue('∠ABC'),
      selected: document.querySelector('[data-scene-object-id="point.C"]')?.getAttribute('data-scene-selected'),
    }

    const undo = document.querySelector('button[title="撤销"]')
    const redo = document.querySelector('button[title="重做"]')
    if (!(undo instanceof HTMLButtonElement) || !(redo instanceof HTMLButtonElement)) throw new Error('找不到撤销或重做按钮。')
    undo.click()
    await waitForRender(420)
    const afterUndo = { Cx: currentParameter('C 点横坐标'), Cy: currentParameter('C 点纵坐标') }
    redo.click()
    await waitForRender(420)
    const afterRedo = { Cx: currentParameter('C 点横坐标'), Cy: currentParameter('C 点纵坐标') }

    const zoomBefore = document.querySelector('.zoom-value')?.textContent?.trim()
    document.querySelector('button[aria-label="放大画布"]')?.click()
    await waitForRender()
    const zoomAfter = document.querySelector('.zoom-value')?.textContent?.trim()

    await new Promise((resolve) => setTimeout(resolve, 360))
    const draft = JSON.parse(localStorage.getItem('word2html.lesson-scene.draft.v0.1') || 'null')
    const exportModule = await import('/src/core/exportHtml.ts')
    const html = exportModule.exportSceneAsStandaloneHtml(draft)
    const runtime = [...html.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/g)].at(-1)?.[1] || ''
    return {
      viewBox: svg.getAttribute('viewBox'), formulaBeforeCanvas,
      canvasFillsShell: Math.abs(svg.getBoundingClientRect().width - (shell.getBoundingClientRect().width - 2)) < 0.5,
      gridDx, gridDy, initial,
      measurementLabelsNonOverlapping,
      extremeInsideViewport, extremeHasInvalidPath, restored,
      polygonStyle: draft?.appearance?.objectStyles?.['polygon.triangleABC']?.lineStyle,
      polygonDashArray: document.querySelector('[data-scene-object-id="polygon.triangleABC"]')?.getAttribute('stroke-dasharray') || '',
      pointAStyle: draft?.appearance?.objectStyles?.['point.A']?.pointStyle,
      pointARadius: draft?.appearance?.objectStyles?.['point.A']?.pointRadius,
      pointAFilter: document.querySelector('[data-scene-object-id="point.A"]')?.getAttribute('filter') || '',
      beforeDragArea, beforeDragAngle, afterDrag, afterUndo, afterRedo,
      dragAssists: {
        snapStep: document.querySelector('svg.geometry-2d-canvas')?.getAttribute('data-geometry-snap-step'),
        axisLock: document.querySelector('svg.geometry-2d-canvas')?.getAttribute('data-geometry-axis-lock'),
      },
      parameters: { Cx: draft?.parameters?.Cx?.value, Cy: draft?.parameters?.Cy?.value },
      zoomBefore, zoomAfter,
      standalone: {
        hasRuntime: html.includes('INTERACTIVE GEOMETRY') && html.includes('function state('),
        hasPrimitives: html.includes('compiled.polygons') && html.includes('compiled.arcs') && html.includes('compiled.connections'),
        hasMeasurements: html.includes('measurement.value') && html.includes('面积'),
        hasDrag: html.includes("plot.addEventListener('pointermove'") && html.includes('data-point-id'),
        hasDragAssists: html.includes('id="snap-step"') && html.includes('id="axis-lock"') && html.includes("axisLock==='y'"),
        hasLabelLayout: html.includes('function layoutLabels(') && html.includes('data-measurement-label='),
        hasArrow: html.includes('marker id="arrow"'),
        validScript: Boolean(runtime),
        hasDynamicCode: /\\beval\\s*\\(|\\bnew\\s+Function\\b/.test(runtime),
        hasNetworkDependency: /<script[^>]+src=|<link[^>]+href=/i.test(html),
      },
    }
  }())`)

  const assert = (condition, detail) => {
    if (!condition) throw new Error(`基础二维几何浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
  }
  assert(result?.viewBox === '0 0 900 590' && result.formulaBeforeCanvas && result.canvasFillsShell, '画布尺寸、铺满方式或公式位置不正确。')
  assert(result?.gridDx > 0 && Math.abs(result.gridDx - result.gridDy) < 0.05, '横纵网格没有保持相同像素间距。')
  assert(['point.A', 'point.B', 'point.C'].every((id) => result?.initial?.pointIds?.includes(id)), '三个可拖动顶点没有完整显示。')
  assert(result?.initial?.polygonCount === 1 && result.initial.arcCount === 1 && result.initial.connectionCount === 3, '多边形、角弧或三类连线没有完整显示。')
  assert(result?.initial?.measurementCount === 3 && result.initial.metricCount === 3, '画布测量标注或指标卡没有完整显示。')
  assert(result?.measurementLabelsNonOverlapping, '几何测量标注之间仍有遮挡。')
  assert(Math.abs(result?.initial?.lengthAB - 6) < 0.001 && Math.abs(result.initial.areaABC - 15) < 0.001 && Math.abs(result.initial.angleABC - 68.199) < 0.01, '默认距离、角度或面积计算不正确。')
  assert(result?.initial?.rayMarker && result.initial.vectorMarker && !result.initial.segmentMarker && result.initial.arcPath.includes(' A ') && result.initial.polygonPoints.split(' ').length === 3, '射线/向量箭头、角弧或三角形绘制不正确。')
  assert(result?.extremeInsideViewport && !result.extremeHasInvalidPath, '参数极值下对象移出画布或出现非有限绘制数据。')
  assert(result?.restored?.Cx === 1 && result.restored.Cy === 3 && Math.abs(result.restored.area - 15) < 0.001, '重置没有恢复官方默认三角形。')
  assert(result?.polygonStyle === 'dash-dot' && result.polygonDashArray, '多边形对象级点划线没有生效。')
  assert(result?.pointAStyle === 'shadow' && result.pointARadius === 12 && result.pointAFilter, '点 A 的对象级大小或投影样式没有生效。')
  assert(result?.afterDrag?.selected === 'true'
    && result.afterDrag.Cx !== result.restored.Cx
    && Math.abs(result.afterDrag.angleABC - result.beforeDragAngle) > 0.01,
  '拖动点 C 后对象选择、坐标或角度测量没有更新。')
  assert(Number.isInteger(result?.afterDrag?.Cx) && result.afterDrag.Cy === 3 && result.dragAssists.snapStep === '1' && result.dragAssists.axisLock === 'y', '坐标吸附或纵坐标锁定没有按设置生效。')
  assert(result?.afterUndo?.Cx === 1 && result.afterUndo.Cy === 3, '撤销没有恢复拖动前坐标。')
  assert(Math.abs(result?.afterRedo?.Cx - result.afterDrag.Cx) < 1e-9 && Math.abs(result.afterRedo.Cy - result.afterDrag.Cy) < 1e-9, '重做没有恢复拖动后的坐标。')
  assert(Math.abs(result?.parameters?.Cx - result.afterDrag.Cx) < 1e-9 && Math.abs(result.parameters.Cy - result.afterDrag.Cy) < 1e-9, '拖动坐标没有写入本地草稿。')
  assert(result?.zoomBefore === '100%' && result.zoomAfter === '110%', '画布缩放控制没有生效。')
  assert(result?.standalone?.hasRuntime && result.standalone.hasPrimitives && result.standalone.hasMeasurements && result.standalone.hasDrag && result.standalone.hasDragAssists && result.standalone.hasLabelLayout && result.standalone.hasArrow && result.standalone.validScript && !result.standalone.hasDynamicCode && !result.standalone.hasNetworkDependency, '独立 HTML 的几何原语、拖动辅助、标注避让、安全性或离线能力不完整。')

  console.log(JSON.stringify(result, null, 2))
} finally {
  close()
}
