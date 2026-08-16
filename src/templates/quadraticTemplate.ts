import type { LessonScene } from '../types/lessonScene'
import { QUADRATIC_TEMPLATE_ID } from '../core/quadratic'

const quadraticTemplate: LessonScene = {
  schemaVersion: '0.1',
  id: 'scene.quadratic-vertex.default',
  templateRef: { id: QUADRATIC_TEMPLATE_ID, version: 1 },
  metadata: {
    title: '二次函数的顶点与开口',
    subject: 'math',
    topic: '二次函数顶点式与图像变换',
    gradeRange: '初中至高中',
    locale: 'zh-CN',
    summary: '调节 a、h、k，观察抛物线的开口方向、宽窄和顶点位置如何变化。',
  },
  viewport: { xMin: -6, xMax: 6, yMin: -3, yMax: 12, allowZoom: true },
  parameters: {
    coefficientA: {
      type: 'number', label: '二次项系数 a', description: '控制开口方向和宽窄',
      value: 1, default: 1, min: -3, max: 3, step: 0.1, unit: '', editable: true,
    },
    vertexH: {
      type: 'number', label: '顶点横坐标 h', description: '控制抛物线左右平移',
      value: 0, default: 0, min: -8, max: 8, step: 0.25, unit: '', editable: true,
    },
    vertexK: {
      type: 'number', label: '顶点纵坐标 k', description: '控制抛物线上下平移',
      value: 0, default: 0, min: -6, max: 6, step: 0.25, unit: '', editable: true,
    },
  },
  derivedValues: [
    { id: 'vertexX', label: '顶点横坐标', expression: 'vertexH', unit: '' },
    { id: 'vertexY', label: '顶点纵坐标', expression: 'vertexK', unit: '' },
    { id: 'yIntercept', label: 'y 轴截距', expression: 'coefficientA * vertexH * vertexH + vertexK', unit: '' },
  ],
  objects: [
    { id: 'grid', kind: 'grid', role: '背景网格', bindings: { step: '1' }, visibleWhen: 'showGrid' },
    { id: 'axes', kind: 'axes', role: '坐标轴', bindings: {}, visibleWhen: 'showAxes' },
    { id: 'parabola', kind: 'parabola', role: '二次函数图像', bindings: { a: 'coefficientA', h: 'vertexH', k: 'vertexK' } },
    { id: 'symmetryAxis', kind: 'segment', role: '对称轴', bindings: { x1: 'vertexH', y1: '0 - 20', x2: 'vertexH', y2: '20' }, visibleWhen: 'showHelperLines' },
    { id: 'vertex', kind: 'point', role: '顶点', bindings: { x: 'vertexH', y: 'vertexK' } },
    { id: 'vertexLabel', kind: 'label', role: '顶点标签', bindings: { x: 'vertexH', y: 'vertexK' }, visibleWhen: 'showPointLabel' },
  ],
  controls: [
    { id: 'controlA', label: '二次项系数 a', type: 'slider', target: 'coefficientA' },
    { id: 'controlH', label: '顶点横坐标 h', type: 'slider', target: 'vertexH' },
    { id: 'controlK', label: '顶点纵坐标 k', type: 'slider', target: 'vertexK' },
    { id: 'reset', label: '恢复默认', type: 'button', target: 'parabola' },
  ],
  interactions: [
    { id: 'resetQuadratic', trigger: 'reset', target: 'parabola', action: 'reset' },
  ],
  annotations: {
    formula: 'y = a(x − h)² + k',
    conclusion: '顶点恒为 (h, k)；a > 0 时开口向上，a < 0 时开口向下，|a| 越大图像越窄。',
  },
  invariants: [
    {
      id: 'vertexInvariant', label: '代入 x = h 时函数值等于 k',
      expression: 'coefficientA * (vertexH - vertexH) * (vertexH - vertexH) + vertexK',
      expectedExpression: 'vertexK', tolerance: 1e-10, severity: 'error',
    },
  ],
  appearance: {
    theme: 'light', showAxes: true, showGrid: true, showFocusLabels: false,
    showPointLabel: true, showHelperLines: true, showIndividualDistances: false,
    showDistanceSum: false, showFormula: true, showTrail: false,
    curveColor: '#5B5BD6', focusColor: '#E15C48', pointColor: '#087E8B',
    helperColor: '#F3A712', lineWidth: 3, pointRadius: 7, fontScale: 1,
    animationSpeed: 0.55,
  },
  lineage: {
    source: 'built-in', matchLevel: 'template',
    fingerprint: 'math|quadratic|vertex-form|parameter-controls|zh-CN|v1',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
}

export function createQuadraticScene(): LessonScene {
  return structuredClone(quadraticTemplate)
}
