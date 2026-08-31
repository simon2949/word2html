import type { LessonScene, SceneObject, SceneObjectKind } from '../types/lessonScene'
import {
  DATA_CHART_2D_TEMPLATE_ID,
  dataChartRange,
  validateDataChart2DSpec,
  type DataChart2DSpec,
} from '../core/dataChart2d'

function seriesKind(mode: DataChart2DSpec['mode']): SceneObjectKind {
  if (mode === 'bar') return 'chart-bar-series'
  if (mode === 'line') return 'chart-line-series'
  if (mode === 'scatter') return 'chart-scatter-series'
  return 'chart-table-series'
}

function dataSeriesObjects(spec: DataChart2DSpec): SceneObject[] {
  return spec.series.map((series) => {
    const bindings: Record<string, string> = spec.mode === 'scatter'
      ? {
          xValues: (series.points ?? []).map((point) => String(point.x)).join(','),
          yValues: (series.points ?? []).map((point) => String(point.y)).join(','),
        }
      : { values: (series.values ?? []).map(String).join(',') }
    return {
      id: `chart.series.${series.id}`,
      kind: seriesKind(spec.mode),
      role: '数据系列',
      label: series.label,
      ...(spec.unit ? { unit: spec.unit } : {}),
      bindings,
    }
  })
}

export function createDataChart2DScene(
  spec: DataChart2DSpec,
  metadata: { title: string; topic: string; summary: string },
): LessonScene {
  const error = validateDataChart2DSpec(spec)
  if (error) throw new Error(error)
  const viewport = dataChartRange(spec)
  const categories: SceneObject[] = (spec.categories ?? []).map((label, index) => ({
    id: `chart.category.${index + 1}`,
    kind: 'data-category',
    role: '数据类别',
    label,
    bindings: { index: String(index) },
  }))
  return {
    schemaVersion: '0.1',
    id: `scene.data-chart.${Date.now()}`,
    templateRef: { id: DATA_CHART_2D_TEMPLATE_ID, version: 1 },
    metadata: {
      title: metadata.title, subject: 'math', topic: metadata.topic,
      gradeRange: 'K12', locale: 'zh-CN', summary: metadata.summary,
    },
    viewport: { ...viewport, allowZoom: true },
    parameters: {},
    derivedValues: [],
    objects: [
      { id: 'grid', kind: 'grid', role: '图表网格', bindings: {}, visibleWhen: 'showGrid' },
      { id: 'axes', kind: 'axes', role: '图表坐标轴', bindings: {}, visibleWhen: 'showAxes' },
      { id: 'chart', kind: 'data-chart', role: '数据图表', label: metadata.title, bindings: { mode: spec.mode } },
      { id: 'chart.xAxis', kind: 'chart-axis', role: '图表横轴', label: spec.xLabel, bindings: {} },
      { id: 'chart.yAxis', kind: 'chart-axis', role: '图表纵轴', label: spec.yLabel, ...(spec.unit ? { unit: spec.unit } : {}), bindings: {} },
      ...categories,
      ...dataSeriesObjects(spec),
    ],
    controls: [],
    interactions: [{ id: 'resetDataChart', trigger: 'reset', target: 'chart', action: 'reset' }],
    annotations: { formula: spec.formula, conclusion: spec.conclusion },
    invariants: [{
      id: 'finiteChartData', label: '全部图表数据为有限数', expression: '0',
      expectedExpression: '0', tolerance: 1e-8, severity: 'error',
    }],
    appearance: {
      theme: 'light', showAxes: spec.mode !== 'table', showGrid: spec.mode !== 'table',
      showFocusLabels: false, showPointLabel: true, showHelperLines: false,
      showIndividualDistances: false, showDistanceSum: false, showFormula: true, showTrail: false,
      curveColor: '#5B5BD6', focusColor: '#E15C48', pointColor: '#087E8B', helperColor: '#F3A712',
      lineWidth: 3, pointRadius: 7, lineStyle: 'solid', helperLineStyle: 'dashed',
      helperLineWidth: 2, pointStyle: 'outlined', fontScale: 1, animationSpeed: 0.55,
    },
    lineage: {
      source: 'model', matchLevel: 'new',
      fingerprint: `data-chart|${spec.mode}|${spec.series.length}|${spec.categories?.length ?? spec.series.reduce((sum, series) => sum + (series.points?.length ?? 0), 0)}|v1`.slice(0, 200),
      updatedAt: new Date().toISOString(),
    },
  }
}
