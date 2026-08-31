import { connectAcceptanceBrowser } from './browser-acceptance-client.mjs'

const { evaluate, close } = await connectAcceptanceBrowser()

await evaluate(`(async function () {
  const library = await import('/src/core/lessonLibrary.ts')
  const entry = library.getOfficialLibraryEntries().find((item) => item.id === 'official.monthly-temperature-chart')
  if (!entry) throw new Error('找不到月平均气温官方图表。')
  localStorage.setItem('word2html.lesson-scene.draft.v0.1', JSON.stringify(entry.scene))
  return true
}())`)
await evaluate('location.reload(); true')
await new Promise((resolve) => setTimeout(resolve, 1400))

const result = await evaluate(`(async function () {
  const waitForRender = () => new Promise((resolve) => {
    let finished = false
    const finish = () => { if (!finished) { finished = true; resolve() } }
    requestAnimationFrame(() => requestAnimationFrame(finish))
    setTimeout(finish, 300)
  })
  await waitForRender()
  const svg = document.querySelector('svg.data-chart-2d-canvas')
  const series = document.querySelector('[data-scene-object-id="chart.series.placeA"]')
  const formula = document.querySelector('.formula-card--above')
  if (!(svg instanceof SVGElement) || !(series instanceof SVGElement)) throw new Error('数据图表画布或数据系列未显示。')
  const formulaBeforeCanvas = Boolean(formula && (formula.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING))
  const initialPath = series.querySelector('path')?.getAttribute('d') || ''
  const categoryLayout = svg.querySelector('[data-category-label-layout]')
  const categoryLabels = [...svg.querySelectorAll('[data-category-label="true"]')]
  const categoryLabelRows = new Set(categoryLabels.map((label) => label.getAttribute('data-category-label-row'))).size
  const categoryLabelXs = categoryLabels.map((label) => Number(label.getAttribute('x')))
  const categoryAxisSpan = categoryLabelXs.length > 1 ? categoryLabelXs.at(-1) - categoryLabelXs[0] : 0
  const minimumCategorySpacing = categoryLabelXs.length > 1
    ? Math.min(...categoryLabelXs.slice(1).map((x, index) => x - categoryLabelXs[index]))
    : 0
  const categoryPointXs = [...series.querySelectorAll('circle[data-category-index]')].map((point) => Number(point.getAttribute('cx')))
  const categoryPointsAligned = categoryPointXs.length === categoryLabelXs.length
    && categoryPointXs.every((x, index) => Math.abs(x - categoryLabelXs[index]) < 0.01)
  const categoryRects = categoryLabels.map((label) => label.getBoundingClientRect())
  const categoryLabelsNonOverlapping = categoryRects.every((first, index) => categoryRects.slice(index + 1)
    .every((second) => first.right <= second.left + 0.5 || second.right <= first.left + 0.5 || first.bottom <= second.top + 0.5 || second.bottom <= first.top + 0.5))

  series.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await waitForRender()
  const dashed = [...document.querySelectorAll('[role="radio"]')].find((element) => element.textContent?.trim() === '虚线')
  if (!(dashed instanceof HTMLButtonElement)) throw new Error('找不到数据系列对象级虚线选项。')
  dashed.click()
  await waitForRender()
  const styledSeries = document.querySelector('[data-scene-object-id="chart.series.placeA"]')
  const dashArray = styledSeries?.querySelector('path')?.getAttribute('stroke-dasharray') || ''

  const appearanceTab = [...document.querySelectorAll('[role="tab"]')].find((element) => element.textContent?.trim() === '显示效果')
  if (!(appearanceTab instanceof HTMLButtonElement)) throw new Error('找不到显示效果页签。')
  appearanceTab.click()
  await waitForRender()
  const visibleLabels = [...document.querySelectorAll('label')].map((label) => label.textContent?.trim() || '')
  const valueLabel = [...document.querySelectorAll('label')].find((label) => label.textContent?.trim() === '数据值标签')
  const valueToggle = valueLabel?.querySelector('input[type="checkbox"]')
  if (!(valueToggle instanceof HTMLInputElement)) throw new Error('找不到数据值标签开关。')
  valueToggle.click()
  await waitForRender()
  const labelsAfterToggle = document.querySelectorAll('svg.data-chart-2d-canvas text').length

  const zoomButtons = document.querySelectorAll('.zoom-controls button')
  const zoomBefore = document.querySelector('.zoom-value')?.textContent?.trim()
  ;(zoomButtons[2])?.click()
  await waitForRender()
  const zoomAfter = document.querySelector('.zoom-value')?.textContent?.trim()

  await new Promise((resolve) => setTimeout(resolve, 360))
  const draft = JSON.parse(localStorage.getItem('word2html.lesson-scene.draft.v0.1') || 'null')
  const categorySourceCount = draft?.objects?.filter((object) => object.kind === 'data-category').length || 0
  const exportModule = await import('/src/core/exportHtml.ts')
  const html = exportModule.exportSceneAsStandaloneHtml(draft)
  const runtime = [...html.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/g)].at(-1)?.[1] || ''
  return {
    mode: svg.getAttribute('data-chart-mode'),
    viewBox: svg.getAttribute('viewBox'),
    formulaBeforeCanvas,
    initialPathLength: initialPath.length,
    categoryLabelLayout: categoryLayout?.getAttribute('data-category-label-layout'),
    categoryLabelStride: Number(categoryLayout?.getAttribute('data-category-label-stride')),
    categoryLabelCount: categoryLabels.length,
    categoryLabelRows,
    categoryScale: svg.getAttribute('data-category-scale'),
    categorySpacing: Number(categoryLayout?.getAttribute('data-category-spacing')),
    categoryAxisSpan,
    minimumCategorySpacing,
    categoryGuideCount: svg.querySelectorAll('[data-category-guide="true"]').length,
    categoryPointsAligned,
    categorySourceCount,
    categoryLabelsNonOverlapping,
    selected: styledSeries?.getAttribute('data-scene-selected'),
    lineStyle: draft?.appearance?.objectStyles?.['chart.series.placeA']?.lineStyle,
    dashArray,
    valueLabelsDisabled: draft?.appearance?.showPointLabel === false,
    labelsAfterToggle,
    globalHasDuplicateLineStyle: visibleLabels.includes('线样式') || visibleLabels.includes('线粗细'),
    zoomBefore, zoomAfter,
    standalone: {
      hasRuntime: html.includes('DATA EXPLORER') && html.includes("spec.mode==='line'"),
      hasAdaptiveCategoryLabels: html.includes('function categoryLabelLayout(') && html.includes('data-category-label-layout='),
      hasDistributedCategoryScale: html.includes('function categoryPositions(') && html.includes('data-category-scale="distributed"') && html.includes('data-category-spacing='),
      validScript: Boolean(runtime),
      hasNetworkDependency: /<script[^>]+src=|<link[^>]+href=/i.test(html),
    },
  }
}())`)
close()

const assert = (condition, detail) => {
  if (!condition) throw new Error(`数据图表浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
}
assert(result?.mode === 'line' && result.viewBox === '0 0 900 590', '官方折线图没有完整显示。')
assert(result?.formulaBeforeCanvas && result.initialPathLength > 30, '公式位置或折线路径不正确。')
assert(result?.categoryScale === 'distributed'
  && result.categoryLabelLayout === 'single-row'
  && result.categoryLabelStride === 1
  && result.categoryLabelRows === 1
  && result.categoryLabelCount === result.categorySourceCount
  && result.categoryAxisSpan >= 700
  && result.minimumCategorySpacing >= 120
  && Math.abs(result.categorySpacing - result.minimumCategorySpacing) < 0.01
  && result.categoryGuideCount === result.categorySourceCount
  && result.categoryPointsAligned
  && result.categoryLabelsNonOverlapping,
'月份横轴没有铺满绘图区、间距不足、数据点未与标签对齐或仍存在重叠。')
assert(result?.selected === 'true' && result.lineStyle === 'dashed' && result.dashArray, '数据系列选择或对象级线型没有生效。')
assert(result?.valueLabelsDisabled && result.labelsAfterToggle > 0, '数据值标签开关没有生效或误删坐标标签。')
assert(!result?.globalHasDuplicateLineStyle, '显示效果页签仍重复提供对象级线宽或线型。')
assert(result?.zoomBefore === '100%' && result.zoomAfter === '110%', '图表缩放控制没有生效。')
assert(result?.standalone?.hasRuntime && result.standalone.hasAdaptiveCategoryLabels && result.standalone.hasDistributedCategoryScale && result.standalone.validScript && !result.standalone.hasNetworkDependency, '独立 HTML 缺少图表运行时、分布式类别轴或包含网络依赖。')

console.log(JSON.stringify(result, null, 2))
