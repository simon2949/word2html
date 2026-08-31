import type { LessonScene, NumberParameter } from '../types/lessonScene'

export const QUADRATIC_TEMPLATE_ID = 'math.function.quadratic-vertex'
export type QuadraticParameterId = 'coefficientA' | 'vertexH' | 'vertexK'

export interface QuadraticSnapshot {
  a: number
  h: number
  k: number
  vertex: { x: number; y: number }
  yIntercept: number
  roots: number[]
  opensUpward: boolean
  invariantError: number
}

function requiredNumber(scene: LessonScene, id: QuadraticParameterId): NumberParameter {
  const parameter = scene.parameters[id]
  if (parameter?.type !== 'number') throw new Error(`场景缺少数值参数：${id}`)
  return parameter
}

export function evaluateQuadratic(a: number, h: number, k: number, x: number): number {
  return a * (x - h) ** 2 + k
}

export function fittedQuadraticViewport(a: number, h: number, k: number): LessonScene['viewport'] {
  const radius = 6
  const xMin = Math.min(-1, h - radius)
  const xMax = Math.max(1, h + radius)
  const yMin = a > 0 ? Math.min(-2, k - 3) : Math.min(-8, k - 12)
  const yMax = a > 0 ? Math.max(8, k + 12) : Math.max(2, k + 3)
  return { xMin, xMax, yMin, yMax, allowZoom: true }
}

export function getQuadraticSnapshot(scene: LessonScene): QuadraticSnapshot {
  const a = requiredNumber(scene, 'coefficientA').value
  const h = requiredNumber(scene, 'vertexH').value
  const k = requiredNumber(scene, 'vertexK').value
  const rootTerm = -k / a
  const roots = rootTerm < 0
    ? []
    : rootTerm === 0
      ? [h]
      : [h - Math.sqrt(rootTerm), h + Math.sqrt(rootTerm)]
  return {
    a,
    h,
    k,
    vertex: { x: h, y: k },
    yIntercept: evaluateQuadratic(a, h, k, 0),
    roots,
    opensUpward: a > 0,
    invariantError: Math.abs(evaluateQuadratic(a, h, k, h) - k),
  }
}

export function validateQuadraticValues(
  scene: LessonScene,
  values: Record<QuadraticParameterId, number>,
): string | null {
  for (const id of ['coefficientA', 'vertexH', 'vertexK'] as const) {
    const parameter = requiredNumber(scene, id)
    const value = values[id]
    if (!Number.isFinite(value)) return `${parameter.label}必须是有效数字。`
    if (value < parameter.min || value > parameter.max) {
      return `${parameter.label}必须在 ${parameter.min} 到 ${parameter.max} 之间。`
    }
  }
  if (Math.abs(values.coefficientA) < 0.1) return '二次项系数 a 不能为 0。'
  return null
}

export function updateQuadraticParameter(
  scene: LessonScene,
  id: QuadraticParameterId,
  value: number,
): LessonScene {
  const next = structuredClone(scene)
  requiredNumber(next, id).value = value
  const snapshot = getQuadraticSnapshot(next)
  next.viewport = fittedQuadraticViewport(snapshot.a, snapshot.h, snapshot.k)
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function resetQuadraticScene(scene: LessonScene): LessonScene {
  const next = structuredClone(scene)
  for (const parameter of Object.values(next.parameters)) parameter.value = parameter.default
  next.appearance = {
    ...next.appearance,
    theme: 'light',
    showAxes: true,
    showGrid: true,
    showPointLabel: true,
    showHelperLines: true,
    showFormula: true,
    showTrail: false,
    curveColor: '#5B5BD6',
    pointColor: '#087E8B',
    helperColor: '#F3A712',
    lineWidth: 3,
    pointRadius: 7,
    lineStyle: 'solid',
    helperLineStyle: 'dashed',
    helperLineWidth: 2,
    pointStyle: 'outlined',
    objectStyles: {},
    fontScale: 1,
  }
  const snapshot = getQuadraticSnapshot(next)
  next.viewport = fittedQuadraticViewport(snapshot.a, snapshot.h, snapshot.k)
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function sampleQuadraticInvariant(
  scene: LessonScene,
  sampleCount = 100,
): { passed: boolean; maxError: number } {
  const { a, h, k } = getQuadraticSnapshot(scene)
  let maxError = Math.abs(evaluateQuadratic(a, h, k, h) - k)
  for (let index = 0; index < sampleCount; index += 1) {
    const delta = ((index + 1) / sampleCount) * 8
    const symmetryError = Math.abs(
      evaluateQuadratic(a, h, k, h - delta) - evaluateQuadratic(a, h, k, h + delta),
    )
    maxError = Math.max(maxError, symmetryError)
  }
  return { passed: maxError <= 1e-10, maxError }
}
