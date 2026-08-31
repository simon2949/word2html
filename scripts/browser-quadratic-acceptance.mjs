import { connectAcceptanceBrowser } from './browser-acceptance-client.mjs'

const { evaluate, close } = await connectAcceptanceBrowser()

try {
  await evaluate(`(async function () {
    const library = await import('/src/core/lessonLibrary.ts')
    const entry = library.getOfficialLibraryEntries().find((item) => item.id === 'official.quadratic-vertex')
    if (!entry) throw new Error('找不到二次函数顶点式官方场景。')
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
    const metricText = (label) => {
      const card = [...document.querySelectorAll('.metric-card')]
        .find((element) => element.querySelector('span')?.textContent?.trim() === label)
      return card?.querySelector('strong')?.textContent?.trim() || ''
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

    await waitForRender()
    const svg = document.querySelector('svg.quadratic-canvas')
    const formula = document.querySelector('.formula-card--above')
    const shell = svg?.closest('.canvas-shell')
    if (!(svg instanceof SVGElement) || !(shell instanceof HTMLElement)) throw new Error('二次函数画布未显示。')
    const formulaBeforeCanvas = Boolean(formula && (formula.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING))
    const initialPath = svg.querySelector('[data-scene-object-id="parabola"]')?.getAttribute('d') || ''
    const initialOpening = metricText('开口')
    const initialVertex = metricText('顶点 (h, k)')
    const grid = svg.querySelector('g[aria-hidden="true"]')
    const vertical = [...(grid?.querySelectorAll('line') || [])].filter((line) => line.getAttribute('x1') === line.getAttribute('x2'))
    const horizontal = [...(grid?.querySelectorAll('line') || [])].filter((line) => line.getAttribute('y1') === line.getAttribute('y2'))
    const gridDx = Math.abs(Number(vertical[1]?.getAttribute('x1')) - Number(vertical[0]?.getAttribute('x1')))
    const gridDy = Math.abs(Number(horizontal[1]?.getAttribute('y1')) - Number(horizontal[0]?.getAttribute('y1')))

    await setNumber('二次项系数 a', -2)
    await setNumber('顶点横坐标 h', 2)
    await setNumber('顶点纵坐标 k', 3)
    const changedSvg = document.querySelector('svg.quadratic-canvas')
    const changedPath = changedSvg?.querySelector('[data-scene-object-id="parabola"]')?.getAttribute('d') || ''
    const changedOpening = metricText('开口')
    const changedVertex = metricText('顶点 (h, k)')
    const roots = metricText('与 x 轴交点')
    const symmetry = changedSvg?.querySelector('[data-scene-object-id="symmetryAxis"]')
    const vertex = changedSvg?.querySelector('[data-scene-object-id="vertex"]')
    const symmetryAligned = Math.abs(Number(symmetry?.getAttribute('x1')) - Number(vertex?.getAttribute('cx'))) < 0.01

    const parabola = changedSvg?.querySelector('[data-scene-object-id="parabola"]')
    if (!(parabola instanceof SVGPathElement)) throw new Error('找不到抛物线对象。')
    parabola.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitForRender()
    const dashDot = [...document.querySelectorAll('[role="radio"]')]
      .find((element) => element.textContent?.trim() === '点划线')
    if (!(dashDot instanceof HTMLButtonElement)) throw new Error('找不到抛物线对象级点划线选项。')
    dashDot.click()
    await waitForRender(420)
    const styledCurve = document.querySelector('[data-scene-object-id="parabola"]')

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
      viewBox: svg.getAttribute('viewBox'),
      formulaBeforeCanvas,
      canvasFillsShell: Math.abs(svg.getBoundingClientRect().width - (shell.getBoundingClientRect().width - 2)) < 0.5,
      gridDx, gridDy,
      initialPathLength: initialPath.length, initialOpening, initialVertex,
      pathChanged: changedPath !== initialPath, changedOpening, changedVertex, roots, symmetryAligned,
      parameters: {
        a: draft?.parameters?.coefficientA?.value,
        h: draft?.parameters?.vertexH?.value,
        k: draft?.parameters?.vertexK?.value,
      },
      selected: styledCurve?.getAttribute('data-scene-selected'),
      lineStyle: draft?.appearance?.objectStyles?.parabola?.lineStyle,
      dashArray: styledCurve?.getAttribute('stroke-dasharray') || '',
      zoomBefore, zoomAfter,
      standalone: {
        hasRuntime: html.includes('二次函数顶点式交互图') && html.includes('coefficientA'),
        hasObjects: html.includes('data-scene-object-id="parabola"') && html.includes('data-scene-object-id="vertex"'),
        validScript: Boolean(runtime),
        hasNetworkDependency: /<script[^>]+src=|<link[^>]+href=/i.test(html),
      },
    }
  }())`)

  const assert = (condition, detail) => {
    if (!condition) throw new Error(`二次函数浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
  }
  assert(result?.viewBox === '0 0 900 590' && result.formulaBeforeCanvas && result.canvasFillsShell, '画布尺寸、铺满方式或公式位置不正确。')
  assert(result?.gridDx > 0 && Math.abs(result.gridDx - result.gridDy) < 0.05, '横纵网格没有保持相同像素间距。')
  assert(result?.initialPathLength > 1000 && result.initialOpening === '向上' && result.initialVertex === '(0.00, 0.00)', '默认抛物线或指标不正确。')
  assert(result?.pathChanged && result.changedOpening === '向下' && result.changedVertex === '(2.00, 3.00)' && result.roots.includes('，'), '修改 a、h、k 后曲线、顶点、开口或零点没有正确更新。')
  assert(result?.symmetryAligned, '对称轴没有经过顶点。')
  assert(result?.parameters?.a === -2 && result.parameters.h === 2 && result.parameters.k === 3, '参数没有写入本地草稿。')
  assert(result?.selected === 'true' && result.lineStyle === 'dash-dot' && result.dashArray, '抛物线选择或对象级点划线样式没有生效。')
  assert(result?.zoomBefore === '100%' && result.zoomAfter === '110%', '画布缩放控制没有生效。')
  assert(result?.standalone?.hasRuntime && result.standalone.hasObjects && result.standalone.validScript && !result.standalone.hasNetworkDependency, '独立 HTML 缺少运行时、对象或包含网络依赖。')

  console.log(JSON.stringify(result, null, 2))
} finally {
  close()
}
