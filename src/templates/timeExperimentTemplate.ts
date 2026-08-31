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
  const primaryBodyId = spec.bodyId ?? 'primary'
  const primaryBodyLabel = spec.bodyLabel ?? '运动物体'
  const primaryObjectId = `body.${primaryBodyId}`
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
    templateRef: { id: TIME_EXPERIMENT_TEMPLATE_ID, version: 4 },
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
        id: primaryObjectId, kind: 'time-point', role: '随时间运动的对象', label: primaryBodyLabel,
        bindings: {
          durationExpression: spec.durationExpression,
          xExpression: spec.xExpression,
          yExpression: spec.yExpression,
        },
      },
      {
        id: `trail.${primaryBodyId}`, kind: 'trail', role: '运动轨迹', label: primaryBodyLabel,
        anchorId: primaryObjectId,
        bindings: { xExpression: spec.xExpression, yExpression: spec.yExpression },
        visibleWhen: 'showTrail',
      },
      ...(spec.additionalBodies ?? []).flatMap((body) => {
        const objectId = `body.${body.id}`
        return [{
          id: objectId, kind: 'time-point' as const, role: '附加运动对象', label: body.label,
          bindings: { xExpression: body.xExpression, yExpression: body.yExpression },
        }, {
          id: `trail.${body.id}`, kind: 'trail' as const, role: '运动轨迹', label: body.label,
          anchorId: objectId,
          bindings: { xExpression: body.xExpression, yExpression: body.yExpression },
          visibleWhen: 'showTrail' as const,
        }]
      }),
      ...spec.vectors.map((vector) => ({
        id: `vector.${vector.id}`,
        kind: 'vector' as const,
        role: vector.display === 'distance' ? '几何距离' : '力学矢量',
        label: vector.label,
        unit: vector.unit,
        anchorId: `body.${vector.bodyId ?? primaryBodyId}`,
        bindings: {
          xExpression: vector.xExpression,
          yExpression: vector.yExpression,
          scale: String(vector.scale),
          labelMode: vector.labelMode ?? 'full',
        },
        visibleWhen: 'showHelperLines' as const,
      })),
      ...(spec.constraints ?? []).map((constraint) => ({
        id: `constraint.${constraint.id}`,
        kind: 'constraint' as const,
        role: '物理约束',
        label: constraint.label,
        constraintType: constraint.type,
        anchorId: `body.${constraint.bodyId}`,
        bindings: {
          anchorXExpression: constraint.anchorXExpression,
          anchorYExpression: constraint.anchorYExpression,
          restLengthExpression: constraint.restLengthExpression,
        },
        visibleWhen: 'showHelperLines' as const,
      })),
    ],
    controls: [
      ...spec.parameters.map((parameter) => ({
        id: `control.${parameter.id}`, label: parameter.label,
        type: 'slider' as const, target: parameter.id,
      })),
      { id: 'play', label: '播放或暂停', type: 'button', target: primaryObjectId },
      { id: 'reset', label: '恢复默认', type: 'button', target: primaryObjectId },
    ],
    interactions: [
      { id: 'animateBody', trigger: 'animation', target: primaryObjectId, action: 'play' },
      { id: 'resetBody', trigger: 'reset', target: primaryObjectId, action: 'reset' },
    ],
    annotations: { formula: spec.formula, conclusion: spec.conclusion },
    invariants: [{
      id: 'finiteMotion', label: '整个运行区间内位置和测量量保持有限',
      expression: '0', expectedExpression: '0', tolerance: 1e-10, severity: 'error',
    }],
    appearance: {
      theme: 'light', showAxes: true, showGrid: true, showFocusLabels: false,
      showPointLabel: true, showHelperLines: spec.vectors.length > 0 || (spec.constraints?.length ?? 0) > 0, showIndividualDistances: false,
      showDistanceSum: false, showFormula: true, showTrail: true,
      curveColor: '#5B5BD6', focusColor: '#E15C48', pointColor: '#E15C48',
      helperColor: '#64748B', lineWidth: 3, pointRadius: 8,
      lineStyle: 'solid', helperLineStyle: 'solid', helperLineWidth: 3,
      pointStyle: 'shadow', fontScale: 1,
      animationSpeed: 0.55,
    },
    lineage: {
      source: 'model', matchLevel: 'new',
      fingerprint: `time-point|${spec.xExpression}|${spec.yExpression}|${spec.durationExpression}|${spec.parameters.map((item) => item.id).join(',')}|${(spec.additionalBodies ?? []).map((item) => item.id).join(',')}|${spec.vectors.map((item) => item.id).join(',')}|${(spec.constraints ?? []).map((item) => item.id).join(',')}|v4`.slice(0, 200),
      updatedAt: new Date().toISOString(),
    },
  }
  scene.viewport = estimateTimeExperimentViewport(scene)
  return scene
}
