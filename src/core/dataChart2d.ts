import type { LessonScene } from '../types/lessonScene'

export const DATA_CHART_2D_TEMPLATE_ID = 'math.data.chart-2d'

export type DataChartMode = 'table' | 'bar' | 'line' | 'scatter'

export interface DataChartPointSpec {
  x: number
  y: number
}

export interface DataChartSeriesSpec {
  id: string
  label: string
  values?: number[]
  points?: DataChartPointSpec[]
}

export interface DataChart2DSpec {
  mode: DataChartMode
  formula: string
  conclusion: string
  xLabel: string
  yLabel: string
  unit: string
  categories?: string[]
  series: DataChartSeriesSpec[]
}

export interface DataChartRange {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface DataChartCategoryLabelLayout {
  rows: 1 | 2
  stride: number
  slotWidth: number
  estimatedMaxLabelWidth: number
}

export function dataChartCategoryPositions(
  mode: 'bar' | 'line',
  categoryCount: number,
  xOffset: number,
  contentWidth: number,
): number[] {
  if (categoryCount <= 0) return []
  if (mode === 'bar') {
    const slotWidth = contentWidth / categoryCount
    return Array.from({ length: categoryCount }, (_, index) => xOffset + slotWidth * (index + 0.5))
  }
  if (categoryCount === 1) return [xOffset + contentWidth / 2]
  return Array.from({ length: categoryCount }, (_, index) => xOffset + contentWidth * index / (categoryCount - 1))
}

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
const VALUE_LIMIT = 1e9
const SERIES_LIMIT = 4
const CATEGORY_LIMIT = 24
const SCATTER_POINT_LIMIT = 60

function estimatedLabelWidth(label: string, fontSize: number): number {
  return [...label].reduce((width, character) => width + (/^[\x00-\x7F]$/.test(character) ? fontSize * 0.62 : fontSize), 0)
}

export function dataChartCategoryLabelLayout(
  categories: readonly string[],
  contentWidth: number,
  fontSize: number,
): DataChartCategoryLabelLayout {
  const count = Math.max(1, categories.length)
  const slotWidth = contentWidth / Math.max(1, count - 1)
  const estimatedMaxLabelWidth = Math.max(fontSize, ...categories.map((label) => estimatedLabelWidth(label, fontSize)))
  const rows: 1 | 2 = count > 8 || estimatedMaxLabelWidth > slotWidth * 0.82 ? 2 : 1
  const stride = Math.max(1, Math.ceil((estimatedMaxLabelWidth + 12) / (slotWidth * rows)))
  return { rows, stride, slotWidth, estimatedMaxLabelWidth }
}

function finiteChartValue(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= VALUE_LIMIT
}

export function validateDataChart2DSpec(spec: DataChart2DSpec): string | null {
  if (!['table', 'bar', 'line', 'scatter'].includes(spec.mode)) return '数据图表类型不合法。'
  if (!spec.formula || spec.formula.length > 200) return '图表说明标题长度必须在 1–200 个字符之间。'
  if (!spec.conclusion || spec.conclusion.length > 400) return '图表观察结论长度必须在 1–400 个字符之间。'
  if (!spec.xLabel || spec.xLabel.length > 40 || !spec.yLabel || spec.yLabel.length > 40) return '图表横轴和纵轴名称长度必须在 1–40 个字符之间。'
  if (spec.unit.length > 16) return '图表数值单位不能超过 16 个字符。'
  if (spec.series.length < 1 || spec.series.length > SERIES_LIMIT) return `数据图表必须包含 1–${SERIES_LIMIT} 个系列。`

  const ids = new Set<string>()
  for (const series of spec.series) {
    if (!ID_PATTERN.test(series.id) || ids.has(series.id)) return `数据系列 ID 不合法或重复：${series.id}`
    if (!series.label || series.label.length > 40) return `数据系列 ${series.id} 的名称长度必须在 1–40 个字符之间。`
    ids.add(series.id)
  }

  if (spec.mode === 'scatter') {
    if (spec.categories !== undefined) return '散点图不能包含类别数组。'
    for (const series of spec.series) {
      if (series.values !== undefined) return `散点系列 ${series.label} 不能包含 values。`
      if (!series.points || series.points.length < 1 || series.points.length > SCATTER_POINT_LIMIT) return `散点系列 ${series.label} 必须包含 1–${SCATTER_POINT_LIMIT} 个点。`
      if (series.points.some((point) => !finiteChartValue(point.x) || !finiteChartValue(point.y))) return `散点系列 ${series.label} 包含无效或过大的坐标。`
    }
    return null
  }

  if (!spec.categories || spec.categories.length < 1 || spec.categories.length > CATEGORY_LIMIT) return `表格、柱状图和折线图必须包含 1–${CATEGORY_LIMIT} 个类别。`
  if (spec.mode === 'line' && spec.categories.length < 2) return '折线图至少需要两个类别。'
  if (new Set(spec.categories).size !== spec.categories.length) return '图表类别名称不能重复。'
  if (spec.categories.some((category) => !category.trim() || category.length > 40)) return '每个类别名称长度必须在 1–40 个字符之间。'
  for (const series of spec.series) {
    if (series.points !== undefined) return `数据系列 ${series.label} 不能包含散点 points。`
    if (!series.values || series.values.length !== spec.categories.length) return `数据系列 ${series.label} 的数值数量必须与类别数量一致。`
    if (series.values.some((value) => !finiteChartValue(value))) return `数据系列 ${series.label} 包含无效或过大的数值。`
  }
  return null
}

function parseNumberList(value: string | undefined): number[] {
  if (!value) return []
  return value.split(',').map(Number)
}

export function getDataChart2DSpec(scene: LessonScene): DataChart2DSpec {
  if (scene.templateRef.id !== DATA_CHART_2D_TEMPLATE_ID) throw new Error('当前场景不是数据图表。')
  const chart = scene.objects.find((object) => object.kind === 'data-chart')
  const xAxis = scene.objects.find((object) => object.id === 'chart.xAxis')
  const yAxis = scene.objects.find((object) => object.id === 'chart.yAxis')
  if (!chart || !xAxis?.label || !yAxis?.label) throw new Error('数据图表缺少图表或坐标轴规格。')
  const mode = chart.bindings.mode as DataChartMode
  const categories = scene.objects
    .filter((object) => object.kind === 'data-category')
    .sort((first, second) => Number(first.bindings.index) - Number(second.bindings.index))
    .map((object) => object.label ?? '')
  const series = scene.objects
    .filter((object) => ['chart-bar-series', 'chart-line-series', 'chart-scatter-series', 'chart-table-series'].includes(object.kind))
    .map((object): DataChartSeriesSpec => {
      const common = { id: object.id.replace(/^chart[.]series[.]/, ''), label: object.label ?? object.id }
      if (mode === 'scatter') {
        const xs = parseNumberList(object.bindings.xValues)
        const ys = parseNumberList(object.bindings.yValues)
        return { ...common, points: xs.map((x, index) => ({ x, y: ys[index]! })) }
      }
      return { ...common, values: parseNumberList(object.bindings.values) }
    })
  return {
    mode,
    formula: scene.annotations.formula,
    conclusion: scene.annotations.conclusion,
    xLabel: xAxis.label,
    yLabel: yAxis.label,
    unit: yAxis.unit ?? '',
    ...(mode === 'scatter' ? {} : { categories }),
    series,
  }
}

export function validateDataChart2DScene(scene: LessonScene): string | null {
  try {
    return validateDataChart2DSpec(getDataChart2DSpec(scene))
  } catch (error) {
    return error instanceof Error ? error.message : '数据图表场景无效。'
  }
}

export function dataChartRange(spec: DataChart2DSpec): DataChartRange {
  const values = spec.mode === 'scatter'
    ? spec.series.flatMap((series) => (series.points ?? []).map((point) => point.y))
    : spec.series.flatMap((series) => series.values ?? [])
  const xs = spec.mode === 'scatter'
    ? spec.series.flatMap((series) => (series.points ?? []).map((point) => point.x))
    : (spec.categories ?? []).map((_, index) => index)
  const minY = Math.min(0, ...values)
  const maxY = Math.max(0, ...values)
  const minX = spec.mode === 'scatter' ? Math.min(...xs) : -0.5
  const maxX = spec.mode === 'scatter' ? Math.max(...xs) : Math.max(0.5, xs.length - 0.5)
  const xSpan = Math.max(1, maxX - minX)
  const ySpan = Math.max(1, maxY - minY)
  return {
    xMin: minX - xSpan * 0.08,
    xMax: maxX + xSpan * 0.08,
    yMin: minY - ySpan * 0.12,
    yMax: maxY + ySpan * 0.16,
  }
}

export function formatDataChartValue(value: number, unit = ''): string {
  const absolute = Math.abs(value)
  const text = absolute >= 1e6 || (absolute > 0 && absolute < 0.001)
    ? value.toExponential(2)
    : String(Number(value.toFixed(3)))
  return `${text}${unit}`
}

export function resetDataChartScene(scene: LessonScene): LessonScene {
  const next = structuredClone(scene)
  next.appearance = {
    ...next.appearance,
    theme: 'light', showAxes: true, showGrid: true, showPointLabel: true,
    showFormula: true, curveColor: '#5B5BD6', pointColor: '#087E8B', helperColor: '#F3A712',
    lineWidth: 3, pointRadius: 7, lineStyle: 'solid', pointStyle: 'outlined',
    helperLineStyle: 'dashed', helperLineWidth: 2, fontScale: 1,
  }
  delete next.appearance.objectStyles
  next.lineage.updatedAt = new Date().toISOString()
  return next
}
