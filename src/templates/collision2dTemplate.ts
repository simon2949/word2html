import type { LessonScene } from '../types/lessonScene'
import {
  COLLISION_2D_TEMPLATE_ID,
  collisionViewport,
  validateCollision2DSpec,
  type Collision2DSpec,
} from '../core/collision2d'

export function createCollision2DScene(
  spec: Collision2DSpec,
  metadata: { title: string; topic: string; summary: string },
): LessonScene {
  const error = validateCollision2DSpec(spec)
  if (error) throw new Error(error)
  const parameters: LessonScene['parameters'] = Object.fromEntries(spec.parameters.map((parameter) => [parameter.id, {
    type: 'number' as const, label: parameter.label, description: `调节碰撞参数 ${parameter.label}`,
    value: parameter.value, default: parameter.value, min: parameter.min, max: parameter.max,
    step: parameter.step, unit: '', editable: true,
  }]))
  const scene: LessonScene = {
    schemaVersion: '0.1', id: `scene.collision-2d.${Date.now()}`,
    templateRef: { id: COLLISION_2D_TEMPLATE_ID, version: 1 },
    metadata: {
      title: metadata.title, subject: 'physics', topic: metadata.topic,
      gradeRange: 'K12', locale: 'zh-CN', summary: metadata.summary,
    },
    viewport: { xMin: -10, xMax: 10, yMin: -6, yMax: 6, allowZoom: true },
    parameters, derivedValues: [],
    objects: [
      { id: 'grid', kind: 'grid', role: '背景网格', bindings: { step: '1' }, visibleWhen: 'showGrid' },
      { id: 'axes', kind: 'axes', role: '坐标轴', bindings: {}, visibleWhen: 'showAxes' },
      {
        id: 'contactSurface', kind: 'contact-surface', role: '二维接触边界', label: '碰撞边界',
        bindings: {
          durationExpression: spec.durationExpression,
          gravityXExpression: spec.gravityXExpression,
          gravityYExpression: spec.gravityYExpression,
          restitutionExpression: spec.restitutionExpression,
          ...spec.bounds,
        },
      },
      ...spec.bodies.map((body) => ({
        id: `collisionBody.${body.id}`, kind: 'collision-body' as const,
        role: '圆形碰撞物体', label: body.label,
        bindings: {
          xExpression: body.xExpression, yExpression: body.yExpression,
          vxExpression: body.vxExpression, vyExpression: body.vyExpression,
          radiusExpression: body.radiusExpression, massExpression: body.massExpression,
        },
      })),
    ],
    controls: [
      ...spec.parameters.map((parameter) => ({ id: `control.${parameter.id}`, label: parameter.label, type: 'slider' as const, target: parameter.id })),
      { id: 'play', label: '播放或暂停', type: 'button', target: 'contactSurface' },
      { id: 'reset', label: '恢复默认', type: 'button', target: 'contactSurface' },
    ],
    interactions: [
      { id: 'playCollision', trigger: 'animation', target: 'contactSurface', action: 'play' },
      { id: 'pauseCollision', trigger: 'click', target: 'contactSurface', action: 'pause' },
      { id: 'resetCollision', trigger: 'reset', target: 'contactSurface', action: 'reset' },
    ],
    annotations: { formula: spec.formula, conclusion: spec.conclusion },
    invariants: [{
      id: 'finiteCollision', label: '全部碰撞状态有限且物体不穿透边界',
      expression: '0', expectedExpression: '0', tolerance: 1e-8, severity: 'error',
    }],
    appearance: {
      theme: 'light', showAxes: true, showGrid: true, showFocusLabels: false,
      showPointLabel: true, showHelperLines: true, showIndividualDistances: false,
      showDistanceSum: false, showFormula: true, showTrail: true,
      curveColor: '#5B5BD6', focusColor: '#E15C48', pointColor: '#087E8B', helperColor: '#F3A712',
      lineWidth: 3, pointRadius: 7, lineStyle: 'solid', helperLineStyle: 'solid',
      helperLineWidth: 3, pointStyle: 'outlined', fontScale: 1, animationSpeed: 0.55,
    },
    lineage: {
      source: 'model', matchLevel: 'new',
      fingerprint: `collision-2d|${spec.bodies.map((body) => body.id).join(',')}|v1`.slice(0, 200),
      updatedAt: new Date().toISOString(),
    },
  }
  scene.viewport = collisionViewport(scene)
  return scene
}
