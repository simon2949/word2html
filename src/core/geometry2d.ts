import type { LessonScene, NumberParameter } from '../types/lessonScene'
import { isNumberParameter } from '../types/lessonScene'
import type { GenericFunctionParameterSpec } from './genericFunction'
import { compileMathExpression } from './mathExpression'

export const GEOMETRY_2D_TEMPLATE_ID = 'math.geometry.primitives-2d'

export type GeometryPointConstructionSpec =
  | { kind: 'midpoint'; pointAId: string; pointBId: string }
  | { kind: 'translation'; sourcePointId: string; dxExpression: string; dyExpression: string }
  | { kind: 'rotation'; sourcePointId: string; centerPointId: string; angleExpression: string }
  | { kind: 'reflection'; sourcePointId: string; linePointAId: string; linePointBId: string }
  | { kind: 'dilation'; sourcePointId: string; centerPointId: string; scaleExpression: string }
  | { kind: 'projection'; sourcePointId: string; linePointAId: string; linePointBId: string }

export type GeometryPointConstraintSpec =
  | { kind: 'line' | 'segment'; pointAId: string; pointBId: string }
  | { kind: 'circle'; centerPointId: string; radiusExpression: string }

export interface GeometryPointSpec {
  id: string
  label: string
  xExpression?: string
  yExpression?: string
  draggable?: boolean
  construction?: GeometryPointConstructionSpec
  constraint?: GeometryPointConstraintSpec
}

export interface GeometryConnectionSpec {
  id: string
  label: string
  kind: 'segment' | 'ray' | 'vector'
  fromPointId: string
  toPointId: string
}

export interface GeometryArcSpec {
  id: string
  label: string
  centerPointId: string
  startPointId: string
  endPointId: string
  clockwise?: boolean
}

export interface GeometryPolygonSpec {
  id: string
  label: string
  pointIds: string[]
  filled?: boolean
}

export interface GeometryMeasurementSpec {
  id: string
  label: string
  kind: 'distance' | 'angle' | 'area' | 'expression'
  pointIds: string[]
  expression?: string
  unit: string
}

export interface GeometryLocusSpec {
  id: string
  label: string
  pointId: string
  parameterId: string
  min?: number
  max?: number
}

export interface Geometry2DSpec {
  formula: string
  conclusion: string
  parameters: GenericFunctionParameterSpec[]
  points: GeometryPointSpec[]
  connections: GeometryConnectionSpec[]
  arcs: GeometryArcSpec[]
  polygons: GeometryPolygonSpec[]
  measurements: GeometryMeasurementSpec[]
  loci?: GeometryLocusSpec[]
}

export interface GeometryPointState extends GeometryPointSpec { x: number; y: number }
export interface GeometryMeasurementState extends GeometryMeasurementSpec { value: number }
export interface Geometry2DSnapshot { points: GeometryPointState[]; measurements: GeometryMeasurementState[] }
export interface GeometryLocusState extends GeometryLocusSpec { points: Array<{ x: number; y: number }> }

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
const RESERVED = new Set(['pi', 'e', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'log', 'ln', 'min', 'max', 'pow', 'step'])
const LOCUS_SAMPLE_COUNT = 241

function parameterScope(spec: Geometry2DSpec): Record<string, number> {
  return Object.fromEntries(spec.parameters.map((parameter) => [parameter.id, parameter.value]))
}

function uniqueIds<T extends { id: string }>(items: T[], noun: string): string | null {
  const ids = new Set<string>()
  for (const item of items) {
    if (!ID_PATTERN.test(item.id)) return `${noun} ID 不合法：${item.id}`
    if (ids.has(item.id)) return `${noun} ID 重复：${item.id}`
    ids.add(item.id)
  }
  return null
}

function expressionError(expression: string | undefined, parameterIds: Set<string>, label: string): string | null {
  if (!expression) return `${label}不能为空。`
  try { compileMathExpression(expression, parameterIds); return null } catch (error) {
    return error instanceof Error ? `${label}：${error.message}` : `${label}无效。`
  }
}

function constructionReferences(construction: GeometryPointConstructionSpec): string[] {
  if (construction.kind === 'midpoint') return [construction.pointAId, construction.pointBId]
  if (construction.kind === 'translation') return [construction.sourcePointId]
  if (construction.kind === 'rotation' || construction.kind === 'dilation') return [construction.sourcePointId, construction.centerPointId]
  return [construction.sourcePointId, construction.linePointAId, construction.linePointBId]
}

function constraintReferences(constraint: GeometryPointConstraintSpec): string[] {
  return constraint.kind === 'circle' ? [constraint.centerPointId] : [constraint.pointAId, constraint.pointBId]
}

function validateConstruction(point: GeometryPointSpec, pointIds: Set<string>, parameterIds: Set<string>): string | null {
  const construction = point.construction!
  if (!['midpoint', 'translation', 'rotation', 'reflection', 'dilation', 'projection'].includes(construction.kind)) return `构造点 ${point.label} 的构造类型不受支持。`
  const references = constructionReferences(construction)
  if (references.some((id) => !pointIds.has(id))) return `构造点 ${point.label} 引用了不存在的点。`
  if (references.includes(point.id)) return `构造点 ${point.label} 不能直接引用自身。`
  if ((construction.kind === 'midpoint' && construction.pointAId === construction.pointBId)
    || ((construction.kind === 'reflection' || construction.kind === 'projection') && construction.linePointAId === construction.linePointBId)) {
    return `构造点 ${point.label} 的基准点不能相同。`
  }
  if (construction.kind === 'translation') {
    return expressionError(construction.dxExpression, parameterIds, `构造点 ${point.label} 的水平平移量`)
      ?? expressionError(construction.dyExpression, parameterIds, `构造点 ${point.label} 的竖直平移量`)
  }
  if (construction.kind === 'rotation') return expressionError(construction.angleExpression, parameterIds, `构造点 ${point.label} 的旋转角`)
  if (construction.kind === 'dilation') return expressionError(construction.scaleExpression, parameterIds, `构造点 ${point.label} 的位似比`)
  return null
}

function validateConstraint(point: GeometryPointSpec, pointIds: Set<string>, parameterIds: Set<string>): string | null {
  const constraint = point.constraint!
  if (!['line', 'segment', 'circle'].includes(constraint.kind)) return `约束点 ${point.label} 的约束类型不受支持。`
  const references = constraintReferences(constraint)
  if (references.some((id) => !pointIds.has(id))) return `约束点 ${point.label} 引用了不存在的点。`
  if (references.includes(point.id)) return `约束点 ${point.label} 不能用自身定义约束。`
  if (constraint.kind !== 'circle' && constraint.pointAId === constraint.pointBId) return `约束点 ${point.label} 的直线基准点不能相同。`
  if (constraint.kind === 'circle') return expressionError(constraint.radiusExpression, parameterIds, `约束点 ${point.label} 的圆半径`)
  return null
}

export function validateGeometry2DSpec(spec: Geometry2DSpec): string | null {
  if (!spec.formula || spec.formula.length > 200) return '几何公式长度必须在 1 到 200 个字符之间。'
  if (!spec.conclusion || spec.conclusion.length > 400) return '几何结论长度必须在 1 到 400 个字符之间。'
  if (spec.parameters.length > 12) return '二维几何场景最多支持 12 个可调参数。'
  if (spec.points.length < 1 || spec.points.length > 12) return '二维几何场景必须包含 1–12 个点。'
  if (spec.connections.length > 16) return '二维几何场景最多支持 16 条线段、射线或向量。'
  if (spec.arcs.length > 6) return '二维几何场景最多支持 6 条圆弧。'
  if (spec.polygons.length > 4) return '二维几何场景最多支持 4 个多边形。'
  if (spec.measurements.length > 6) return '二维几何场景最多支持 6 个测量标注。'
  if ((spec.loci?.length ?? 0) > 4) return '二维几何场景最多支持 4 条轨迹。'

  const parameterError = uniqueIds(spec.parameters, '参数')
  if (parameterError) return parameterError
  const parameterIds = new Set<string>()
  for (const parameter of spec.parameters) {
    parameterIds.add(parameter.id)
    if (RESERVED.has(parameter.id)) return `参数 ID 与保留名称冲突：${parameter.id}`
    if (!parameter.label || parameter.label.length > 40) return `参数 ${parameter.id} 的名称不合法。`
    if (![parameter.value, parameter.min, parameter.max, parameter.step].every(Number.isFinite)) return `参数 ${parameter.label} 包含无效数字。`
    if (parameter.min >= parameter.max || parameter.step <= 0) return `参数 ${parameter.label} 的范围或步长无效。`
    if (parameter.value < parameter.min || parameter.value > parameter.max) return `参数 ${parameter.label} 的初始值超出范围。`
  }

  const pointError = uniqueIds(spec.points, '点')
  if (pointError) return pointError
  const pointIds = new Set(spec.points.map((point) => point.id))
  for (const point of spec.points) {
    if (!point.label || point.label.length > 20) return `点 ${point.id} 的标签不合法。`
    const hasCoordinates = point.xExpression !== undefined || point.yExpression !== undefined
    const hasConstruction = point.construction !== undefined
    if (hasCoordinates === hasConstruction) return `点 ${point.label} 必须且只能使用坐标表达式或一种构造方式。`
    if (hasCoordinates) {
      const coordinateError = expressionError(point.xExpression, parameterIds, `点 ${point.label} 的 x 坐标`)
        ?? expressionError(point.yExpression, parameterIds, `点 ${point.label} 的 y 坐标`)
      if (coordinateError) return coordinateError
      if (point.draggable && (!parameterIds.has(point.xExpression!) || !parameterIds.has(point.yExpression!))) return `可拖动点 ${point.label} 的 x、y 表达式必须分别是可调参数 ID。`
    } else {
      if (point.draggable) return `构造点 ${point.label} 不能直接拖动；请拖动它引用的基础点或调整参数。`
      if (point.constraint) return `构造点 ${point.label} 不能再附加拖点约束。`
      const constructionError = validateConstruction(point, pointIds, parameterIds)
      if (constructionError) return constructionError
    }
    if (point.constraint) {
      const constraintError = validateConstraint(point, pointIds, parameterIds)
      if (constraintError) return constraintError
    }
  }

  const connectionError = uniqueIds(spec.connections, '连线')
  if (connectionError) return connectionError
  for (const connection of spec.connections) {
    if (!pointIds.has(connection.fromPointId) || !pointIds.has(connection.toPointId)) return `连线 ${connection.label} 引用了不存在的点。`
    if (connection.fromPointId === connection.toPointId) return `连线 ${connection.label} 的两个端点不能相同。`
  }

  const arcError = uniqueIds(spec.arcs, '圆弧')
  if (arcError) return arcError
  for (const arc of spec.arcs) {
    if (![arc.centerPointId, arc.startPointId, arc.endPointId].every((id) => pointIds.has(id))) return `圆弧 ${arc.label} 引用了不存在的点。`
    if (arc.startPointId === arc.endPointId) return `圆弧 ${arc.label} 的起点和终点不能相同。`
  }

  const polygonError = uniqueIds(spec.polygons, '多边形')
  if (polygonError) return polygonError
  for (const polygon of spec.polygons) {
    if (polygon.pointIds.length < 3 || polygon.pointIds.length > 12) return `多边形 ${polygon.label} 必须包含 3–12 个顶点。`
    if (new Set(polygon.pointIds).size !== polygon.pointIds.length || !polygon.pointIds.every((id) => pointIds.has(id))) return `多边形 ${polygon.label} 包含重复或不存在的点。`
  }

  const measurementError = uniqueIds(spec.measurements, '测量量')
  if (measurementError) return measurementError
  for (const measurement of spec.measurements) {
    if (measurement.unit.length > 16) return `测量量 ${measurement.label} 的单位过长。`
    if (!measurement.pointIds.every((id) => pointIds.has(id))) return `测量量 ${measurement.label} 引用了不存在的点。`
    const requiredCount = measurement.kind === 'distance' ? 2 : measurement.kind === 'angle' ? 3 : measurement.kind === 'area' ? 3 : 0
    if (measurement.kind === 'area' ? measurement.pointIds.length < requiredCount : measurement.pointIds.length !== requiredCount) return `测量量 ${measurement.label} 的点数量不正确。`
    if (measurement.kind === 'expression') {
      const measurementExpressionError = expressionError(measurement.expression, parameterIds, `测量量 ${measurement.label}`)
      if (measurementExpressionError) return measurementExpressionError
    } else if (measurement.expression !== undefined) return `自动测量量 ${measurement.label} 不应包含表达式。`
  }

  const locusError = uniqueIds(spec.loci ?? [], '轨迹')
  if (locusError) return locusError
  for (const locus of spec.loci ?? []) {
    if (!locus.label || locus.label.length > 40) return `轨迹 ${locus.id} 的标签不合法。`
    if (!pointIds.has(locus.pointId)) return `轨迹 ${locus.label} 引用了不存在的点。`
    const parameter = spec.parameters.find((candidate) => candidate.id === locus.parameterId)
    if (!parameter) return `轨迹 ${locus.label} 引用了不存在的驱动参数。`
    if ((locus.min === undefined) !== (locus.max === undefined)) return `轨迹 ${locus.label} 必须同时提供或同时省略采样上下界。`
    const minimum = locus.min ?? parameter.min
    const maximum = locus.max ?? parameter.max
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum || minimum < parameter.min || maximum > parameter.max) return `轨迹 ${locus.label} 的采样范围必须递增且位于驱动参数范围内。`
  }

  try {
    const snapshot = evaluateGeometry2D(spec)
    if (snapshot.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1e4 || Math.abs(point.y) > 1e4)) return '几何点坐标必须是绝对值不超过 10000 的有限数。'
    if (snapshot.measurements.some((measurement) => !Number.isFinite(measurement.value))) return '几何测量结果必须是有限数。'
    const loci = sampleGeometryLoci(spec)
    if (loci.some((locus) => locus.points.length < 2 || locus.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1e4 || Math.abs(point.y) > 1e4))) return '几何轨迹必须包含有限且绝对值不超过 10000 的点。'
  } catch (error) {
    return error instanceof Error ? error.message : '二维几何场景无法计算。'
  }
  return null
}

function distance(left: GeometryPointState, right: GeometryPointState): number { return Math.hypot(right.x - left.x, right.y - left.y) }

function polygonArea(points: GeometryPointState[]): number {
  let doubled = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    doubled += current.x * next.y - next.x * current.y
  }
  return Math.abs(doubled) / 2
}

function lineProjection(point: { x: number; y: number }, first: { x: number; y: number }, second: { x: number; y: number }, segment = false): { x: number; y: number } {
  const dx = second.x - first.x
  const dy = second.y - first.y
  const squaredLength = dx * dx + dy * dy
  if (squaredLength < 1e-12) throw new Error('几何直线或线段的两个基准点重合。')
  let ratio = ((point.x - first.x) * dx + (point.y - first.y) * dy) / squaredLength
  if (segment) ratio = Math.max(0, Math.min(1, ratio))
  return { x: first.x + ratio * dx, y: first.y + ratio * dy }
}

function evaluateGeometryPoints(spec: Geometry2DSpec): GeometryPointState[] {
  const scope = parameterScope(spec)
  const parameterIds = Object.keys(scope)
  const pointSpecs = new Map(spec.points.map((point) => [point.id, point]))
  const resolved = new Map<string, GeometryPointState>()
  const visiting = new Set<string>()
  const expression = (value: string) => compileMathExpression(value, parameterIds).evaluate(scope)
  const resolvePoint = (id: string): GeometryPointState => {
    const existing = resolved.get(id)
    if (existing) return existing
    const point = pointSpecs.get(id)
    if (!point) throw new Error(`几何点不存在：${id}`)
    if (visiting.has(id)) throw new Error(`几何点构造或约束存在循环引用：${id}`)
    visiting.add(id)
    let coordinates: { x: number; y: number }
    if (point.construction) {
      const construction = point.construction
      if (construction.kind === 'midpoint') {
        const first = resolvePoint(construction.pointAId)
        const second = resolvePoint(construction.pointBId)
        coordinates = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      } else if (construction.kind === 'translation') {
        const source = resolvePoint(construction.sourcePointId)
        coordinates = { x: source.x + expression(construction.dxExpression), y: source.y + expression(construction.dyExpression) }
      } else if (construction.kind === 'rotation') {
        const source = resolvePoint(construction.sourcePointId)
        const center = resolvePoint(construction.centerPointId)
        const angle = expression(construction.angleExpression)
        const cosine = Math.cos(angle)
        const sine = Math.sin(angle)
        const dx = source.x - center.x
        const dy = source.y - center.y
        coordinates = { x: center.x + dx * cosine - dy * sine, y: center.y + dx * sine + dy * cosine }
      } else if (construction.kind === 'dilation') {
        const source = resolvePoint(construction.sourcePointId)
        const center = resolvePoint(construction.centerPointId)
        const scale = expression(construction.scaleExpression)
        coordinates = { x: center.x + (source.x - center.x) * scale, y: center.y + (source.y - center.y) * scale }
      } else {
        const source = resolvePoint(construction.sourcePointId)
        const first = resolvePoint(construction.linePointAId)
        const second = resolvePoint(construction.linePointBId)
        const projected = lineProjection(source, first, second)
        coordinates = construction.kind === 'projection' ? projected : { x: projected.x * 2 - source.x, y: projected.y * 2 - source.y }
      }
    } else {
      coordinates = { x: expression(point.xExpression!), y: expression(point.yExpression!) }
      if (point.constraint) {
        const constraint = point.constraint
        if (constraint.kind === 'circle') {
          const center = resolvePoint(constraint.centerPointId)
          const radius = expression(constraint.radiusExpression)
          if (!Number.isFinite(radius) || radius <= 1e-6 || radius > 1e4) throw new Error(`约束点 ${point.label} 的圆半径必须位于 0 到 10000 之间。`)
          const dx = coordinates.x - center.x
          const dy = coordinates.y - center.y
          const magnitude = Math.hypot(dx, dy)
          coordinates = magnitude < 1e-10 ? { x: center.x + radius, y: center.y } : { x: center.x + dx / magnitude * radius, y: center.y + dy / magnitude * radius }
        } else {
          const first = resolvePoint(constraint.pointAId)
          const second = resolvePoint(constraint.pointBId)
          coordinates = lineProjection(coordinates, first, second, constraint.kind === 'segment')
        }
      }
    }
    if (![coordinates.x, coordinates.y].every(Number.isFinite)) throw new Error(`点 ${point.label} 的构造结果不是有限数。`)
    const state = { ...point, ...coordinates }
    visiting.delete(id)
    resolved.set(id, state)
    return state
  }
  return spec.points.map((point) => resolvePoint(point.id))
}

export function evaluateGeometry2D(spec: Geometry2DSpec): Geometry2DSnapshot {
  const scope = parameterScope(spec)
  const parameterIds = Object.keys(scope)
  const points = evaluateGeometryPoints(spec)
  const byId = new Map(points.map((point) => [point.id, point]))
  const measurements = spec.measurements.map((measurement) => {
    const selected = measurement.pointIds.map((id) => byId.get(id)!)
    let value = 0
    if (measurement.kind === 'distance') value = distance(selected[0]!, selected[1]!)
    else if (measurement.kind === 'angle') {
      const [a, b, c] = selected
      const first = Math.atan2(a!.y - b!.y, a!.x - b!.x)
      const second = Math.atan2(c!.y - b!.y, c!.x - b!.x)
      let radians = Math.abs(second - first)
      if (radians > Math.PI) radians = Math.PI * 2 - radians
      value = radians * 180 / Math.PI
    } else if (measurement.kind === 'area') value = polygonArea(selected)
    else value = compileMathExpression(measurement.expression!, parameterIds).evaluate(scope)
    return { ...measurement, value }
  })
  return { points, measurements }
}

export function sampleGeometryLoci(spec: Geometry2DSpec, sampleCount = LOCUS_SAMPLE_COUNT): GeometryLocusState[] {
  return (spec.loci ?? []).map((locus) => {
    const parameter = spec.parameters.find((candidate) => candidate.id === locus.parameterId)
    if (!parameter) throw new Error(`轨迹 ${locus.label} 缺少驱动参数。`)
    const minimum = locus.min ?? parameter.min
    const maximum = locus.max ?? parameter.max
    const points: Array<{ x: number; y: number }> = []
    for (let index = 0; index < sampleCount; index += 1) {
      const value = minimum + (maximum - minimum) * index / Math.max(1, sampleCount - 1)
      const candidate: Geometry2DSpec = { ...spec, parameters: spec.parameters.map((item) => item.id === locus.parameterId ? { ...item, value } : item), loci: [] }
      const point = evaluateGeometry2D(candidate).points.find((item) => item.id === locus.pointId)
      if (!point) throw new Error(`轨迹 ${locus.label} 找不到目标点。`)
      points.push({ x: point.x, y: point.y })
    }
    return { ...locus, points }
  })
}

function constructionBindings(construction: GeometryPointConstructionSpec): Record<string, string> {
  const bindings: Record<string, string> = { constructionKind: construction.kind }
  if (construction.kind === 'midpoint') return { ...bindings, constructionPointAId: construction.pointAId, constructionPointBId: construction.pointBId }
  if (construction.kind === 'translation') return { ...bindings, constructionSourcePointId: construction.sourcePointId, constructionDxExpression: construction.dxExpression, constructionDyExpression: construction.dyExpression }
  if (construction.kind === 'rotation') return { ...bindings, constructionSourcePointId: construction.sourcePointId, constructionCenterPointId: construction.centerPointId, constructionAngleExpression: construction.angleExpression }
  if (construction.kind === 'dilation') return { ...bindings, constructionSourcePointId: construction.sourcePointId, constructionCenterPointId: construction.centerPointId, constructionScaleExpression: construction.scaleExpression }
  return { ...bindings, constructionSourcePointId: construction.sourcePointId, constructionLinePointAId: construction.linePointAId, constructionLinePointBId: construction.linePointBId }
}

function constraintBindings(constraint: GeometryPointConstraintSpec): Record<string, string> {
  const bindings: Record<string, string> = { pointConstraintKind: constraint.kind }
  return constraint.kind === 'circle'
    ? { ...bindings, constraintCenterPointId: constraint.centerPointId, constraintRadiusExpression: constraint.radiusExpression }
    : { ...bindings, constraintPointAId: constraint.pointAId, constraintPointBId: constraint.pointBId }
}

export function geometryPointBindings(point: GeometryPointSpec): Record<string, string> {
  return { ...(point.construction ? constructionBindings(point.construction) : { xExpression: point.xExpression!, yExpression: point.yExpression! }), ...(point.constraint ? constraintBindings(point.constraint) : {}) }
}

function constructionFromBindings(bindings: Record<string, string>): GeometryPointConstructionSpec | undefined {
  const kind = bindings.constructionKind as GeometryPointConstructionSpec['kind'] | undefined
  if (!kind) return undefined
  if (kind === 'midpoint') return { kind, pointAId: bindings.constructionPointAId ?? '', pointBId: bindings.constructionPointBId ?? '' }
  if (kind === 'translation') return { kind, sourcePointId: bindings.constructionSourcePointId ?? '', dxExpression: bindings.constructionDxExpression ?? '', dyExpression: bindings.constructionDyExpression ?? '' }
  if (kind === 'rotation') return { kind, sourcePointId: bindings.constructionSourcePointId ?? '', centerPointId: bindings.constructionCenterPointId ?? '', angleExpression: bindings.constructionAngleExpression ?? '' }
  if (kind === 'dilation') return { kind, sourcePointId: bindings.constructionSourcePointId ?? '', centerPointId: bindings.constructionCenterPointId ?? '', scaleExpression: bindings.constructionScaleExpression ?? '' }
  return { kind, sourcePointId: bindings.constructionSourcePointId ?? '', linePointAId: bindings.constructionLinePointAId ?? '', linePointBId: bindings.constructionLinePointBId ?? '' }
}

function constraintFromBindings(bindings: Record<string, string>): GeometryPointConstraintSpec | undefined {
  const kind = bindings.pointConstraintKind as GeometryPointConstraintSpec['kind'] | undefined
  if (!kind) return undefined
  if (kind === 'circle') return { kind, centerPointId: bindings.constraintCenterPointId ?? '', radiusExpression: bindings.constraintRadiusExpression ?? '' }
  return { kind, pointAId: bindings.constraintPointAId ?? '', pointBId: bindings.constraintPointBId ?? '' }
}

function parameterSpecs(scene: LessonScene): GenericFunctionParameterSpec[] {
  return Object.entries(scene.parameters).filter((entry): entry is [string, NumberParameter] => entry[1].type === 'number').map(([id, parameter]) => ({ id, label: parameter.label, value: parameter.value, min: parameter.min, max: parameter.max, step: parameter.step }))
}

export function getGeometry2DSpec(scene: LessonScene): Geometry2DSpec {
  if (scene.templateRef.id !== GEOMETRY_2D_TEMPLATE_ID) throw new Error('当前场景不是二维几何原语场景。')
  const points: GeometryPointSpec[] = scene.objects.filter((object) => object.kind === 'point' && object.role === '几何点').map((object) => {
    const construction = constructionFromBindings(object.bindings)
    const constraint = constraintFromBindings(object.bindings)
    return {
      id: object.id.replace(/^point\./, ''), label: object.label ?? object.id,
      ...(construction ? { construction } : { xExpression: object.bindings.xExpression ?? '', yExpression: object.bindings.yExpression ?? '' }),
      ...(object.interactive !== undefined ? { draggable: object.interactive } : {}),
      ...(constraint ? { constraint } : {}),
    }
  })
  const connections: GeometryConnectionSpec[] = scene.objects.filter((object) => ['segment', 'ray', 'vector'].includes(object.kind) && object.role === '几何连线').map((object) => ({ id: object.id.replace(/^connection\./, ''), label: object.label ?? object.id, kind: object.kind as GeometryConnectionSpec['kind'], fromPointId: object.bindings.fromPointId ?? '', toPointId: object.bindings.toPointId ?? '' }))
  const arcs: GeometryArcSpec[] = scene.objects.filter((object) => object.kind === 'arc').map((object) => ({ id: object.id.replace(/^arc\./, ''), label: object.label ?? object.id, centerPointId: object.bindings.centerPointId ?? '', startPointId: object.bindings.startPointId ?? '', endPointId: object.bindings.endPointId ?? '', ...(object.bindings.clockwise === '1' ? { clockwise: true } : {}) }))
  const polygons: GeometryPolygonSpec[] = scene.objects.filter((object) => object.kind === 'polygon').map((object) => ({ id: object.id.replace(/^polygon\./, ''), label: object.label ?? object.id, pointIds: (object.bindings.pointIds ?? '').split(',').filter(Boolean), ...(object.bindings.filled === '1' ? { filled: true } : {}) }))
  const measurements: GeometryMeasurementSpec[] = scene.objects.filter((object) => object.kind === 'label' && object.role === '几何测量').map((object) => ({ id: object.id.replace(/^measurement\./, ''), label: object.label ?? object.id, kind: object.bindings.measurementKind as GeometryMeasurementSpec['kind'], pointIds: (object.bindings.pointIds ?? '').split(',').filter(Boolean), ...(object.bindings.expression ? { expression: object.bindings.expression } : {}), unit: object.unit ?? '' }))
  const loci: GeometryLocusSpec[] = scene.objects.filter((object) => object.kind === 'locus' && object.role === '几何轨迹').map((object) => ({ id: object.id.replace(/^locus\./, ''), label: object.label ?? object.id, pointId: object.bindings.pointId ?? '', parameterId: object.bindings.parameterId ?? '', ...(object.bindings.min !== undefined ? { min: Number(object.bindings.min) } : {}), ...(object.bindings.max !== undefined ? { max: Number(object.bindings.max) } : {}) }))
  return { formula: scene.annotations.formula, conclusion: scene.annotations.conclusion, parameters: parameterSpecs(scene), points, connections, arcs, polygons, measurements, loci }
}

export function validateGeometry2DScene(scene: LessonScene): string | null {
  try { return validateGeometry2DSpec(getGeometry2DSpec(scene)) } catch (error) { return error instanceof Error ? error.message : '二维几何场景无效。' }
}

export function estimateGeometry2DViewport(spec: Geometry2DSpec): LessonScene['viewport'] {
  const points = evaluateGeometry2D(spec).points
  const locusPoints = sampleGeometryLoci(spec).flatMap((locus) => locus.points)
  const xs = [...points, ...locusPoints].map((point) => point.x)
  const ys = [...points, ...locusPoints].map((point) => point.y)
  const xMin = Math.min(0, ...xs); const xMax = Math.max(0, ...xs); const yMin = Math.min(0, ...ys); const yMax = Math.max(0, ...ys)
  const xMargin = Math.max(1.5, (xMax - xMin) * 0.18); const yMargin = Math.max(1.5, (yMax - yMin) * 0.18)
  return { xMin: xMin - xMargin, xMax: xMax + xMargin, yMin: yMin - yMargin, yMax: yMax + yMargin, allowZoom: true }
}

export function updateGeometryParameter(scene: LessonScene, id: string, value: number): LessonScene {
  const parameter = scene.parameters[id]
  if (!isNumberParameter(parameter)) throw new Error(`二维几何场景缺少参数：${id}`)
  if (!Number.isFinite(value) || value < parameter.min || value > parameter.max) throw new Error(`${parameter.label}必须在 ${parameter.min} 到 ${parameter.max} 之间。`)
  const next = structuredClone(scene); (next.parameters[id] as NumberParameter).value = value
  const error = validateGeometry2DScene(next); if (error) throw new Error(error)
  next.viewport = estimateGeometry2DViewport(getGeometry2DSpec(next)); next.lineage.updatedAt = new Date().toISOString(); return next
}

function clampedParameterValue(parameter: NumberParameter, value: number): number {
  if (!Number.isFinite(value)) throw new Error(`${parameter.label}必须是有限数。`)
  return Math.min(parameter.max, Math.max(parameter.min, value))
}

export function updateGeometryPoint(scene: LessonScene, pointId: string, x: number, y: number): LessonScene {
  const spec = getGeometry2DSpec(scene); const point = spec.points.find((candidate) => candidate.id === pointId)
  if (!point?.draggable || !point.xExpression || !point.yExpression) throw new Error(`点 ${pointId} 不支持拖动。`)
  const xParameter = scene.parameters[point.xExpression]; const yParameter = scene.parameters[point.yExpression]
  if (!isNumberParameter(xParameter) || !isNumberParameter(yParameter)) throw new Error(`点 ${point.label} 缺少可编辑的坐标参数。`)
  const next = structuredClone(scene)
  ;(next.parameters[point.xExpression] as NumberParameter).value = clampedParameterValue(xParameter, x)
  ;(next.parameters[point.yExpression] as NumberParameter).value = clampedParameterValue(yParameter, y)
  if (point.constraint) {
    const projected = evaluateGeometry2D(getGeometry2DSpec(next)).points.find((candidate) => candidate.id === pointId)!
    ;(next.parameters[point.xExpression] as NumberParameter).value = clampedParameterValue(xParameter, projected.x)
    ;(next.parameters[point.yExpression] as NumberParameter).value = clampedParameterValue(yParameter, projected.y)
  }
  const error = validateGeometry2DScene(next); if (error) throw new Error(error)
  next.viewport = estimateGeometry2DViewport(getGeometry2DSpec(next)); next.lineage.updatedAt = new Date().toISOString(); return next
}

export type GeometryAxisLock = 'none' | 'x' | 'y'
export type GeometrySnapStep = 0 | 0.1 | 0.5 | 1

export function applyGeometryDragAssists(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  snapStep: GeometrySnapStep,
  axisLock: GeometryAxisLock,
): { x: number; y: number } {
  const snap = (value: number) => snapStep === 0
    ? value
    : Number((Math.round(value / snapStep) * snapStep).toFixed(10))
  return {
    x: axisLock === 'x' ? origin.x : snap(point.x),
    y: axisLock === 'y' ? origin.y : snap(point.y),
  }
}

export function resetGeometryScene(scene: LessonScene): LessonScene {
  const next = structuredClone(scene)
  for (const parameter of Object.values(next.parameters)) if (isNumberParameter(parameter)) parameter.value = parameter.default
  delete next.appearance.objectStyles; next.viewport = estimateGeometry2DViewport(getGeometry2DSpec(next)); next.lineage.updatedAt = new Date().toISOString(); return next
}
