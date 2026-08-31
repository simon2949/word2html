import type { LessonScene, NumberParameter, SceneAppearance } from '../types/lessonScene'
import { isNumberParameter } from '../types/lessonScene'

export interface Point2D {
  x: number
  y: number
}

export interface EllipseGeometry {
  majorAxis: number
  minorAxis: number
  a: number
  b: number
  c: number
  focusLeft: Point2D
  focusRight: Point2D
}

export interface EllipseSnapshot extends EllipseGeometry {
  point: Point2D
  distanceLeft: number
  distanceRight: number
  distanceSum: number
  invariantError: number
}

export type AxisParameterId = 'majorAxis' | 'minorAxis'

function requiredNumber(scene: LessonScene, id: string): NumberParameter {
  const parameter = scene.parameters[id]
  if (!isNumberParameter(parameter)) {
    throw new Error(`场景缺少数值参数：${id}`)
  }
  return parameter
}

export function getEllipseGeometry(scene: LessonScene): EllipseGeometry {
  const majorAxis = requiredNumber(scene, 'majorAxis').value
  const minorAxis = requiredNumber(scene, 'minorAxis').value
  const a = majorAxis / 2
  const b = minorAxis / 2
  const c = Math.sqrt(Math.max(0, a * a - b * b))

  return {
    majorAxis,
    minorAxis,
    a,
    b,
    c,
    focusLeft: { x: -c, y: 0 },
    focusRight: { x: c, y: 0 },
  }
}

export function pointOnEllipse(geometry: EllipseGeometry, angle: number): Point2D {
  return {
    x: geometry.a * Math.cos(angle),
    y: geometry.b * Math.sin(angle),
  }
}

export function ellipseAngleFromPoint(
  geometry: EllipseGeometry,
  point: Point2D,
): number {
  if (geometry.a === 0 || geometry.b === 0) return 0
  return normalizeAngle(Math.atan2(point.y / geometry.b, point.x / geometry.a))
}

export function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2
  return ((angle % fullTurn) + fullTurn) % fullTurn
}

function distance(first: Point2D, second: Point2D): number {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

export function getEllipseSnapshot(scene: LessonScene, angle: number): EllipseSnapshot {
  const geometry = getEllipseGeometry(scene)
  const point = pointOnEllipse(geometry, angle)
  const distanceLeft = distance(point, geometry.focusLeft)
  const distanceRight = distance(point, geometry.focusRight)
  const distanceSum = distanceLeft + distanceRight

  return {
    ...geometry,
    point,
    distanceLeft,
    distanceRight,
    distanceSum,
    invariantError: Math.abs(distanceSum - geometry.majorAxis),
  }
}

function fittedViewport(majorAxis: number, minorAxis: number): LessonScene['viewport'] {
  const a = majorAxis / 2
  const b = minorAxis / 2
  const horizontal = Math.max(6, a * 1.35)
  const vertical = Math.max(4.25, b * 1.65)
  return {
    xMin: -horizontal,
    xMax: horizontal,
    yMin: -vertical,
    yMax: vertical,
    allowZoom: true,
  }
}

export function updateAxisParameter(
  scene: LessonScene,
  id: AxisParameterId,
  value: number,
): LessonScene {
  const next = structuredClone(scene)
  const parameter = requiredNumber(next, id)
  parameter.value = value

  const major = requiredNumber(next, 'majorAxis').value
  const minor = requiredNumber(next, 'minorAxis').value
  next.viewport = fittedViewport(major, minor)
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function updateAppearance<K extends keyof SceneAppearance>(
  scene: LessonScene,
  key: K,
  value: SceneAppearance[K],
): LessonScene {
  const next = structuredClone(scene)
  next.appearance[key] = value
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function resetSceneValues(scene: LessonScene): LessonScene {
  const next = structuredClone(scene)
  for (const parameter of Object.values(next.parameters)) {
    parameter.value = parameter.default
  }
  next.appearance = {
    ...next.appearance,
    theme: 'light',
    showAxes: true,
    showGrid: true,
    showFocusLabels: true,
    showPointLabel: true,
    showHelperLines: true,
    showIndividualDistances: true,
    showDistanceSum: true,
    showFormula: true,
    showTrail: false,
    curveColor: '#5B5BD6',
    focusColor: '#E15C48',
    pointColor: '#087E8B',
    helperColor: '#F3A712',
    lineWidth: 3,
    pointRadius: 7,
    lineStyle: 'solid',
    helperLineStyle: 'dashed',
    helperLineWidth: 2.25,
    pointStyle: 'outlined',
    objectStyles: {},
    fontScale: 1,
    animationSpeed: 0.55,
  }
  const major = requiredNumber(next, 'majorAxis').value
  const minor = requiredNumber(next, 'minorAxis').value
  next.viewport = fittedViewport(major, minor)
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function validateAxisValues(
  scene: LessonScene,
  majorAxis: number,
  minorAxis: number,
): string | null {
  const major = requiredNumber(scene, 'majorAxis')
  const minor = requiredNumber(scene, 'minorAxis')

  if (!Number.isFinite(majorAxis) || !Number.isFinite(minorAxis)) {
    return '轴长必须是有效数字。'
  }
  if (majorAxis <= 0 || minorAxis <= 0) {
    return '长轴全长和短轴全长都必须大于 0。'
  }
  if (majorAxis < major.min || majorAxis > major.max) {
    return `长轴全长必须在 ${major.min} 到 ${major.max} 之间。`
  }
  if (minorAxis < minor.min || minorAxis > minor.max) {
    return `短轴全长必须在 ${minor.min} 到 ${minor.max} 之间。`
  }
  if (minorAxis > majorAxis) {
    return '短轴全长不能大于长轴全长。'
  }
  return null
}

export function sampleEllipseInvariant(
  scene: LessonScene,
  sampleCount = 100,
): { passed: boolean; maxError: number } {
  let maxError = 0
  for (let index = 0; index < sampleCount; index += 1) {
    const angle = (index / sampleCount) * Math.PI * 2
    maxError = Math.max(maxError, getEllipseSnapshot(scene, angle).invariantError)
  }
  const majorAxis = getEllipseGeometry(scene).majorAxis
  const tolerance = Math.max(1e-8, majorAxis * 1e-8)
  return { passed: maxError <= tolerance, maxError }
}
