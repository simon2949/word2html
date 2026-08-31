import type { LessonScene } from '../types/lessonScene'
import {
  RELATION_CURVE_2D_TEMPLATE_ID,
  relationCurveViewport,
  validateRelationCurve2DSpec,
  type RelationCurve2DSpec,
} from '../core/relationCurve2d'

export function createRelationCurve2DScene(
  spec: RelationCurve2DSpec,
  metadata: { title: string; topic: string; summary: string },
): LessonScene {
  const error = validateRelationCurve2DSpec(spec)
  if (error) throw new Error(error)
  const bindings: Record<string, string> = {
    mode: spec.mode,
    xMin: String(spec.xMin), xMax: String(spec.xMax), yMin: String(spec.yMin), yMax: String(spec.yMax),
  }
  for (const [name, value] of Object.entries({
    variableMin: spec.variableMin, variableMax: spec.variableMax,
    xExpression: spec.xExpression, yExpression: spec.yExpression,
    radialExpression: spec.radialExpression, implicitExpression: spec.implicitExpression,
  })) if (value !== undefined) bindings[name] = String(value)

  return {
    schemaVersion: '0.1', id: `scene.relation-curve.${Date.now()}`,
    templateRef: { id: RELATION_CURVE_2D_TEMPLATE_ID, version: 1 },
    metadata: {
      title: metadata.title, subject: 'math', topic: metadata.topic,
      gradeRange: 'K12', locale: 'zh-CN', summary: metadata.summary,
    },
    viewport: relationCurveViewport(spec),
    parameters: Object.fromEntries(spec.parameters.map((parameter) => [parameter.id, {
      type: 'number' as const, label: parameter.label, description: `调节曲线参数 ${parameter.label}`,
      value: parameter.value, default: parameter.value, min: parameter.min, max: parameter.max,
      step: parameter.step, unit: '', editable: true,
    }])),
    derivedValues: [],
    objects: [
      { id: 'grid', kind: 'grid', role: '背景网格', bindings: { step: '1' }, visibleWhen: 'showGrid' },
      { id: 'axes', kind: 'axes', role: '坐标轴', bindings: {}, visibleWhen: 'showAxes' },
      { id: 'relationCurve', kind: 'relation-curve', role: '二维关系曲线', label: metadata.title, bindings },
    ],
    controls: spec.parameters.map((parameter) => ({ id: `control.${parameter.id}`, label: parameter.label, type: 'slider' as const, target: parameter.id })),
    interactions: [{ id: 'resetRelationCurve', trigger: 'reset', target: 'relationCurve', action: 'reset' }],
    annotations: { formula: spec.formula, conclusion: spec.conclusion },
    invariants: [{
      id: 'drawableRelationCurve', label: '当前范围内存在有限可绘制曲线',
      expression: '0', expectedExpression: '0', tolerance: 1e-8, severity: 'error',
    }],
    appearance: {
      theme: 'light', showAxes: true, showGrid: true, showFocusLabels: false,
      showPointLabel: false, showHelperLines: false, showIndividualDistances: false,
      showDistanceSum: false, showFormula: true, showTrail: false,
      curveColor: '#5B5BD6', focusColor: '#E15C48', pointColor: '#087E8B', helperColor: '#F3A712',
      lineWidth: 3, pointRadius: 7, lineStyle: 'solid', helperLineStyle: 'dashed',
      helperLineWidth: 2, pointStyle: 'outlined', fontScale: 1, animationSpeed: 0.55,
    },
    lineage: {
      source: 'model', matchLevel: 'new',
      fingerprint: `relation-curve|${spec.mode}|${spec.formula}|v1`.slice(0, 200),
      updatedAt: new Date().toISOString(),
    },
  }
}
