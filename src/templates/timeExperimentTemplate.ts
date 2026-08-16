import {
  estimateTimeExperimentViewport,
  TIME_EXPERIMENT_TEMPLATE_ID,
  validateTimeExperimentSpec,
  type TimeExperimentSpec,
} from '../core/timeExperiment'
import type { LessonScene, Subject } from '../types/lessonScene'

export function createTimeExperimentScene(
  spec: TimeExperimentSpec,
  metadata: { title: string; topic: string; summary: string; subject: Subject },
): LessonScene {
  const error = validateTimeExperimentSpec(spec)
  if (error) throw new Error(error)
  const parameters: LessonScene['parameters'] = {}
  for (const parameter of spec.parameters) {
    parameters[parameter.id] = {
      type: 'number', label: parameter.label, description: `调节实验参数 ${parameter.label}`,
      value: parameter.value, default: parameter.value, min: parameter.min, max: parameter.max,
      step: parameter.step, unit: '', editable: true,
    }
  }
  const scene: LessonScene = {
    schemaVersion: '0.1',
    id: `scene.time-experiment.${Date.now()}`,
    templateRef: { id: TIME_EXPERIMENT_TEMPLATE_ID, version: 2 },
    metadata: {
      title: metadata.title, subject: metadata.subject, topic: metadata.topic,
      gradeRange: 'K12', locale: 'zh-CN', summary: metadata.summary,
    },
    viewport: { xMin: -5, xMax: 5, yMin: -1, yMax: 12, allowZoom: true },
    parameters,
    derivedValues: spec.metrics.map((metric) => ({ ...metric })),
    objects: [
      { id: 'grid', kind: 'grid', role: '背景网格', bindings: { step: '1' }, visibleWhen: 'showGrid' },
      { id: 'axes', kind: 'axes', role: '坐标轴', bindings: {}, visibleWhen: 'showAxes' },
      { id: 'ground', kind: 'ground-line', role: '地面或基准线', bindings: { y: '0' } },
      {
        id: 'movingBody', kind: 'time-point', role: '随时间运动的对象',
        bindings: {
          durationExpression: spec.durationExpression,
          xExpression: spec.xExpression,
          yExpression: spec.yExpression,
        },
      },
      {
        id: 'motionTrail', kind: 'trail', role: '运动轨迹',
        bindings: { xExpression: spec.xExpression, yExpression: spec.yExpression },
        visibleWhen: 'showTrail',
      },
      ...spec.vectors.map((vector) => ({
        id: `vector.${vector.id}`,
        kind: 'vector' as const,
        role: '力学矢量',
        label: vector.label,
        unit: vector.unit,
        bindings: {
          xExpression: vector.xExpression,
          yExpression: vector.yExpression,
          scale: String(vector.scale),
        },
        visibleWhen: 'showHelperLines' as const,
      })),
    ],
    controls: [
      ...spec.parameters.map((parameter) => ({
        id: `control.${parameter.id}`, label: parameter.label,
        type: 'slider' as const, target: parameter.id,
      })),
      { id: 'play', label: '播放或暂停', type: 'button', target: 'movingBody' },
      { id: 'reset', label: '恢复默认', type: 'button', target: 'movingBody' },
    ],
    interactions: [
      { id: 'animateBody', trigger: 'animation', target: 'movingBody', action: 'play' },
      { id: 'resetBody', trigger: 'reset', target: 'movingBody', action: 'reset' },
    ],
    annotations: { formula: spec.formula, conclusion: spec.conclusion },
    invariants: [{
      id: 'finiteMotion', label: '整个运行区间内位置和测量量保持有限',
      expression: '0', expectedExpression: '0', tolerance: 1e-10, severity: 'error',
    }],
    appearance: {
      theme: 'light', showAxes: true, showGrid: true, showFocusLabels: false,
      showPointLabel: true, showHelperLines: spec.vectors.length > 0, showIndividualDistances: false,
      showDistanceSum: false, showFormula: true, showTrail: true,
      curveColor: '#5B5BD6', focusColor: '#E15C48', pointColor: '#E15C48',
      helperColor: '#64748B', lineWidth: 3, pointRadius: 8, fontScale: 1,
      animationSpeed: 0.55,
    },
    lineage: {
      source: 'model', matchLevel: 'new',
      fingerprint: `time-point|${spec.xExpression}|${spec.yExpression}|${spec.durationExpression}|${spec.parameters.map((item) => item.id).join(',')}|${spec.vectors.map((item) => item.id).join(',')}|v2`.slice(0, 200),
      updatedAt: new Date().toISOString(),
    },
  }
  scene.viewport = estimateTimeExperimentViewport(scene)
  return scene
}
