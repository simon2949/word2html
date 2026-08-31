import { connectAcceptanceBrowser } from './browser-acceptance-client.mjs'

const { evaluate, close } = await connectAcceptanceBrowser()

try {
  await evaluate(`(async function () {
    const library = await import('/src/core/lessonLibrary.ts')
    const entry = library.getOfficialLibraryEntries().find((item) => item.id === 'official.sine-parameters')
    if (!entry) throw new Error('找不到正弦函数参数官方场景。')
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
    const svg = document.querySelector('svg.generic-function-canvas')
    const formula = document.querySelector('.formula-card--above')
    const shell = svg?.closest('.canvas-shell')
    if (!(svg instanceof SVGElement) || !(shell instanceof HTMLElement)) throw new Error('通用显函数画布未显示。')
    const formulaBeforeCanvas = Boolean(formula && (formula.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING))
    const initialPath = svg.querySelector('[data-scene-object-id="functionCurve"]')?.getAttribute('d') || ''
    const initialParameters = metricText('当前参数')
    const functionText = metricText('函数')
    const grid = svg.querySelector('g[aria-hidden="true"]')
    const vertical = [...(grid?.querySelectorAll('line') || [])].filter((line) => line.getAttribute('x1') === line.getAttribute('x2'))
    const horizontal = [...(grid?.querySelectorAll('line') || [])].filter((line) => line.getAttribute('y1') === line.getAttribute('y2'))
    const gridDx = Math.abs(Number(vertical[1]?.getAttribute('x1')) - Number(vertical[0]?.getAttribute('x1')))
    const gridDy = Math.abs(Number(horizontal[1]?.getAttribute('y1')) - Number(horizontal[0]?.getAttribute('y1')))

    await setNumber('振幅 A', 4)
    await setNumber('频率 B', 2)
    const changedPath = document.querySelector('[data-scene-object-id="functionCurve"]')?.getAttribute('d') || ''
    const changedParameters = metricText('当前参数')

    const curve = document.querySelector('[data-scene-object-id="functionCurve"]')
    if (!(curve instanceof SVGPathElement)) throw new Error('找不到函数曲线对象。')
    curve.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitForRender()
    const dashed = [...document.querySelectorAll('[role="radio"]')]
      .find((element) => element.textContent?.trim() === '虚线')
    if (!(dashed instanceof HTMLButtonElement)) throw new Error('找不到函数曲线对象级虚线选项。')
    dashed.click()
    await waitForRender(420)
    const styledCurve = document.querySelector('[data-scene-object-id="functionCurve"]')

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
      initialPathLength: initialPath.length,
      functionText, initialParameters,
      pathChanged: changedPath !== initialPath,
      changedParameters,
      parameters: { A: draft?.parameters?.A?.value, B: draft?.parameters?.B?.value },
      selected: styledCurve?.getAttribute('data-scene-selected'),
      lineStyle: draft?.appearance?.objectStyles?.functionCurve?.lineStyle,
      dashArray: styledCurve?.getAttribute('stroke-dasharray') || '',
      zoomBefore, zoomAfter,
      standalone: {
        hasRuntime: html.includes('通用函数交互图') && html.includes('A*sin(B*x)'),
        hasObject: html.includes('data-scene-object-id="functionCurve"'),
        validScript: Boolean(runtime),
        hasNetworkDependency: /<script[^>]+src=|<link[^>]+href=/i.test(html),
      },
    }
  }())`)

  const assert = (condition, detail) => {
    if (!condition) throw new Error(`二维显函数浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
  }
  assert(result?.viewBox === '0 0 900 590' && result.formulaBeforeCanvas && result.canvasFillsShell, '画布尺寸、铺满方式或公式位置不正确。')
  assert(result?.gridDx > 0 && Math.abs(result.gridDx - result.gridDy) < 0.05, '横纵网格没有保持相同像素间距。')
  assert(result?.initialPathLength > 1000 && result.functionText.includes('A') && result.initialParameters.includes('A=2') && result.initialParameters.includes('B=1'), '默认正弦图像、公式或参数指标不正确。')
  assert(result?.pathChanged && result.changedParameters.includes('A=4') && result.changedParameters.includes('B=2'), '修改 A、B 后曲线或参数指标没有更新。')
  assert(result?.parameters?.A === 4 && result.parameters.B === 2, '参数没有写入本地草稿。')
  assert(result?.selected === 'true' && result.lineStyle === 'dashed' && result.dashArray, '函数曲线选择或对象级虚线样式没有生效。')
  assert(result?.zoomBefore === '100%' && result.zoomAfter === '110%', '画布缩放控制没有生效。')
  assert(result?.standalone?.hasRuntime && result.standalone.hasObject && result.standalone.validScript && !result.standalone.hasNetworkDependency, '独立 HTML 缺少安全运行时、对象或包含网络依赖。')

  console.log(JSON.stringify(result, null, 2))
} finally {
  close()
}
