import {
  estimateGenericFunctionViewport,
  GENERIC_FUNCTION_TEMPLATE_ID,
  validateGenericFunctionSpec,
  type GenericFunctionSpec,
} from '../core/genericFunction'
import type { LessonScene } from '../types/lessonScene'

export function createGenericFunctionScene(
  spec: GenericFunctionSpec,
  metadata: { title: string; topic: string; summary: string },
): LessonScene {
  const error = validateGenericFunctionSpec(spec)
  if (error) throw new Error(error)
  const parameters: LessonScene['parameters'] = {}
  for (const parameter of spec.parameters) {
    parameters[parameter.id] = {
      type: 'number', label: parameter.label, description: `调节函数参数 ${parameter.label}`,
      value: parameter.value, default: parameter.value, min: parameter.min, max: parameter.max,
      step: parameter.step, unit: '', editable: true,
    }
  }
  return {
    schemaVersion: '0.1',
    id: `scene.generic-function.${Date.now()}`,
    templateRef: { id: GENERIC_FUNCTION_TEMPLATE_ID, version: 1 },
    metadata: {
      title: metadata.title,
      subject: 'math',
      topic: metadata.topic,
      gradeRange: 'K12',
      locale: 'zh-CN',
      summary: metadata.summary,
    },
    viewport: estimateGenericFunctionViewport(spec),
    parameters,
    derivedValues: [],
    objects: [
      { id: 'grid', kind: 'grid', role: '背景网格', bindings: { step: '1' }, visibleWhen: 'showGrid' },
      { id: 'axes', kind: 'axes', role: '坐标轴', bindings: {}, visibleWhen: 'showAxes' },
      {
        id: 'functionCurve', kind: 'function-curve', role: '通用函数曲线',
        bindings: { expression: spec.expression, xMin: String(spec.xMin), xMax: String(spec.xMax) },
      },
    ],
    controls: [
      ...spec.parameters.map((parameter) => ({
        id: `control.${parameter.id}`,
        label: parameter.label,
        type: 'slider' as const,
        target: parameter.id,
      })),
      { id: 'reset', label: '恢复默认', type: 'button', target: 'functionCurve' },
    ],
    interactions: [{ id: 'resetFunction', trigger: 'reset', target: 'functionCurve', action: 'reset' }],
    annotations: {
      formula: spec.formula,
      conclusion: '拖动参数滑块，观察函数图像如何连续变化。该场景由安全通用函数运行时生成。',
    },
    invariants: [{
      id: 'finiteSamples', label: '定义域内存在可绘制样本',
      expression: '0', expectedExpression: '0', tolerance: 1e-10, severity: 'error',
    }],
    appearance: {
      theme: 'light', showAxes: true, showGrid: true, showFocusLabels: false,
      showPointLabel: false, showHelperLines: false, showIndividualDistances: false,
      showDistanceSum: false, showFormula: true, showTrail: false,
      curveColor: '#5B5BD6', focusColor: '#E15C48', pointColor: '#087E8B',
      helperColor: '#F3A712', lineWidth: 3, pointRadius: 7,
      lineStyle: 'solid', helperLineStyle: 'solid', helperLineWidth: 2,
      pointStyle: 'outlined', fontScale: 1,
      animationSpeed: 0.55,
    },
    lineage: {
      source: 'model', matchLevel: 'new',
      fingerprint: `generic-function|${spec.expression}|${spec.xMin}:${spec.xMax}|${spec.parameters.map((item) => item.id).join(',')}|v1`.slice(0, 200),
      updatedAt: new Date().toISOString(),
    },
  }
}
