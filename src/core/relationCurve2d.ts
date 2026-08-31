import type { LessonScene, NumberParameter } from '../types/lessonScene'
import { isNumberParameter } from '../types/lessonScene'
import type { GenericFunctionParameterSpec } from './genericFunction'
import { compileMathExpression, SAFE_MATH_CONSTANTS, SAFE_MATH_FUNCTIONS } from './mathExpression'

export const RELATION_CURVE_2D_TEMPLATE_ID = 'math.curve.relation-2d'

export type RelationCurveMode = 'parametric' | 'polar' | 'implicit'

export interface RelationCurve2DSpec {
  mode: RelationCurveMode
  formula: string
  conclusion: string
  parameters: GenericFunctionParameterSpec[]
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  variableMin?: number
  variableMax?: number
  xExpression?: string
  yExpression?: string
  radialExpression?: string
  implicitExpression?: string
}

export interface RelationCurvePoint {
  x: number
  y: number
}

export interface RelationCurveSample {
  paths: RelationCurvePoint[][]
  pointCount: number
}

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
const RESERVED = new Set([
  'x', 'y', 't', 'theta',
  ...SAFE_MATH_FUNCTIONS,
  ...SAFE_MATH_CONSTANTS,
])
const PARAMETRIC_SAMPLES = 801
const IMPLICIT_GRID_SIZE = 96

function parameterScope(spec: RelationCurve2DSpec): Record<string, number> {
  return Object.fromEntries(spec.parameters.map((parameter) => [parameter.id, parameter.value]))
}

function validBounds(spec: RelationCurve2DSpec): string | null {
  const values = [spec.xMin, spec.xMax, spec.yMin, spec.yMax]
  if (!values.every(Number.isFinite)) return '曲线视口边界必须是有限数。'
  if (values.some((value) => value < -100 || value > 100)) return '曲线视口边界必须位于 -100 到 100 之间。'
  if (spec.xMax - spec.xMin < 0.2 || spec.yMax - spec.yMin < 0.2) return '曲线视口宽高必须至少为 0.2。'
  return null
}

function expressionError(expression: string | undefined, variables: Iterable<string>, label: string): string | null {
  if (!expression) return `${label}不能为空。`
  try {
    compileMathExpression(expression, variables)
    return null
  } catch (error) {
    return error instanceof Error ? `${label}：${error.message}` : `${label}无效。`
  }
}

function finiteVariableRange(spec: RelationCurve2DSpec): string | null {
  if (!Number.isFinite(spec.variableMin) || !Number.isFinite(spec.variableMax)) return '曲线参数区间必须是有限数。'
  const minimum = spec.variableMin!
  const maximum = spec.variableMax!
  const absoluteLimit = spec.mode === 'polar' ? Math.PI * 20 : 100
  if (minimum >= maximum || minimum < -absoluteLimit || maximum > absoluteLimit) {
    return spec.mode === 'polar'
      ? '极角区间必须递增且位于 -20π 到 20π 之间。'
      : '参数区间必须递增且位于 -100 到 100 之间。'
  }
  return null
}

function pointInsideViewport(point: RelationCurvePoint, spec: RelationCurve2DSpec): boolean {
  return point.x >= spec.xMin && point.x <= spec.xMax && point.y >= spec.yMin && point.y <= spec.yMax
}

function segmentIntersectsViewport(first: RelationCurvePoint, second: RelationCurvePoint, spec: RelationCurve2DSpec): boolean {
  if (pointInsideViewport(first, spec) || pointInsideViewport(second, spec)) return true
  const dx = second.x - first.x
  const dy = second.y - first.y
  let minimum = 0
  let maximum = 1
  for (const [direction, distance] of [
    [-dx, first.x - spec.xMin],
    [dx, spec.xMax - first.x],
    [-dy, first.y - spec.yMin],
    [dy, spec.yMax - first.y],
  ] as const) {
    if (Math.abs(direction) < 1e-12) {
      if (distance < 0) return false
      continue
    }
    const ratio = distance / direction
    if (direction < 0) minimum = Math.max(minimum, ratio)
    else maximum = Math.min(maximum, ratio)
    if (minimum > maximum) return false
  }
  return true
}

export function relationCurveVisiblePointCount(sample: RelationCurveSample, spec: RelationCurve2DSpec): number {
  return sample.paths.flat().filter((point) => pointInsideViewport(point, spec)).length
}

function sampleIntersectsViewport(sample: RelationCurveSample, spec: RelationCurve2DSpec): boolean {
  if (relationCurveVisiblePointCount(sample, spec) > 0) return true
  return sample.paths.some((path) => path.some((point, index) => index > 0 && segmentIntersectsViewport(path[index - 1]!, point, spec)))
}

export function validateRelationCurve2DSpec(spec: RelationCurve2DSpec): string | null {
  if (!['parametric', 'polar', 'implicit'].includes(spec.mode)) return '二维关系曲线类型不合法。'
  if (!spec.formula || spec.formula.length > 200) return '曲线公式长度必须在 1–200 个字符之间。'
  if (!spec.conclusion || spec.conclusion.length > 400) return '曲线说明长度必须在 1–400 个字符之间。'
  if (spec.parameters.length > 8) return '二维关系曲线最多支持 8 个可调参数。'
  const boundsError = validBounds(spec)
  if (boundsError) return boundsError

  const parameterIds = new Set<string>()
  for (const parameter of spec.parameters) {
    if (!ID_PATTERN.test(parameter.id) || parameterIds.has(parameter.id)) return `曲线参数 ID 不合法或重复：${parameter.id}`
    if (RESERVED.has(parameter.id)) return `曲线参数 ID 与保留名称冲突：${parameter.id}`
    if (!parameter.label || parameter.label.length > 40) return `参数 ${parameter.id} 的名称不合法。`
    if (![parameter.value, parameter.min, parameter.max, parameter.step].every(Number.isFinite)) return `参数 ${parameter.label} 包含无效数字。`
    if (parameter.min >= parameter.max || parameter.step <= 0 || parameter.value < parameter.min || parameter.value > parameter.max) return `参数 ${parameter.label} 的范围、步长或初值无效。`
    parameterIds.add(parameter.id)
  }

  if (spec.mode === 'parametric') {
    const rangeError = finiteVariableRange(spec)
    if (rangeError) return rangeError
    const xError = expressionError(spec.xExpression, ['t', ...parameterIds], '参数曲线 x(t)')
    if (xError) return xError
    const yError = expressionError(spec.yExpression, ['t', ...parameterIds], '参数曲线 y(t)')
    if (yError) return yError
    if (spec.radialExpression !== undefined || spec.implicitExpression !== undefined) return '参数曲线不能包含极坐标或隐函数表达式。'
  } else if (spec.mode === 'polar') {
    const rangeError = finiteVariableRange(spec)
    if (rangeError) return rangeError
    const radialError = expressionError(spec.radialExpression, ['theta', ...parameterIds], '极坐标 r(θ)')
    if (radialError) return radialError
    if (spec.xExpression !== undefined || spec.yExpression !== undefined || spec.implicitExpression !== undefined) return '极坐标曲线不能包含参数或隐函数表达式。'
  } else {
    const implicitError = expressionError(spec.implicitExpression, ['x', 'y', ...parameterIds], '隐函数 F(x,y)')
    if (implicitError) return implicitError
    if (spec.variableMin !== undefined || spec.variableMax !== undefined || spec.xExpression !== undefined || spec.yExpression !== undefined || spec.radialExpression !== undefined) {
      return '隐函数曲线只能包含 F(x,y) 表达式和二维视口。'
    }
  }

  try {
    const sample = sampleRelationCurveUnchecked(spec)
    if (sample.pointCount < 2 || sample.paths.length === 0) return '当前参数和范围内没有可绘制的曲线。'
    if (!sampleIntersectsViewport(sample, spec)) return '当前参数下曲线没有进入所设置的二维视口。'
  } catch (error) {
    return error instanceof Error ? error.message : '二维关系曲线无法计算。'
  }
  return null
}

function splitSampledPath(points: Array<RelationCurvePoint | null>, spec: RelationCurve2DSpec): RelationCurvePoint[][] {
  const paths: RelationCurvePoint[][] = []
  let current: RelationCurvePoint[] = []
  const jumpLimit = Math.max(spec.xMax - spec.xMin, spec.yMax - spec.yMin) * 0.45
  for (const point of points) {
    const previous = current[current.length - 1]
    const valid = point && Number.isFinite(point.x) && Number.isFinite(point.y) && Math.abs(point.x) <= 1e6 && Math.abs(point.y) <= 1e6
    if (!valid || (previous && Math.hypot(point!.x - previous.x, point!.y - previous.y) > jumpLimit)) {
      if (current.length >= 2) paths.push(current)
      current = valid ? [point!] : []
    } else current.push(point!)
  }
  if (current.length >= 2) paths.push(current)
  return paths
}

function sampledParametricCurve(spec: RelationCurve2DSpec): RelationCurveSample {
  const scope = parameterScope(spec)
  const ids = Object.keys(scope)
  const minimum = spec.variableMin!
  const maximum = spec.variableMax!
  let evaluatePoint: (variable: number) => RelationCurvePoint
  if (spec.mode === 'parametric') {
    const x = compileMathExpression(spec.xExpression!, ['t', ...ids])
    const y = compileMathExpression(spec.yExpression!, ['t', ...ids])
    evaluatePoint = (t) => ({ x: x.evaluate({ ...scope, t }), y: y.evaluate({ ...scope, t }) })
  } else {
    const radial = compileMathExpression(spec.radialExpression!, ['theta', ...ids])
    evaluatePoint = (theta) => {
      const radius = radial.evaluate({ ...scope, theta })
      return { x: radius * Math.cos(theta), y: radius * Math.sin(theta) }
    }
  }
  const values: Array<RelationCurvePoint | null> = []
  for (let index = 0; index < PARAMETRIC_SAMPLES; index += 1) {
    const variable = minimum + (maximum - minimum) * index / (PARAMETRIC_SAMPLES - 1)
    try { values.push(evaluatePoint(variable)) } catch { values.push(null) }
  }
  const paths = splitSampledPath(values, spec)
  return { paths, pointCount: paths.reduce((sum, path) => sum + path.length, 0) }
}

interface ImplicitNode extends RelationCurvePoint { value: number }

function interpolateImplicitEdge(first: ImplicitNode, second: ImplicitNode): RelationCurvePoint {
  const denominator = first.value - second.value
  const ratio = Math.abs(denominator) < 1e-12 ? 0.5 : Math.max(0, Math.min(1, first.value / denominator))
  return { x: first.x + (second.x - first.x) * ratio, y: first.y + (second.y - first.y) * ratio }
}

function sampledImplicitCurve(spec: RelationCurve2DSpec): RelationCurveSample {
  const scope = parameterScope(spec)
  const compiled = compileMathExpression(spec.implicitExpression!, ['x', 'y', ...Object.keys(scope)])
  const nodes: ImplicitNode[][] = []
  for (let row = 0; row <= IMPLICIT_GRID_SIZE; row += 1) {
    const y = spec.yMin + (spec.yMax - spec.yMin) * row / IMPLICIT_GRID_SIZE
    const line: ImplicitNode[] = []
    for (let column = 0; column <= IMPLICIT_GRID_SIZE; column += 1) {
      const x = spec.xMin + (spec.xMax - spec.xMin) * column / IMPLICIT_GRID_SIZE
      let value = Number.NaN
      try { value = compiled.evaluate({ ...scope, x, y }) } catch { /* keep NaN */ }
      line.push({ x, y, value })
    }
    nodes.push(line)
  }

  const paths: RelationCurvePoint[][] = []
  const crosses = (first: ImplicitNode, second: ImplicitNode) => Number.isFinite(first.value) && Number.isFinite(second.value)
    && ((first.value <= 0 && second.value > 0) || (first.value > 0 && second.value <= 0))
  for (let row = 0; row < IMPLICIT_GRID_SIZE; row += 1) {
    for (let column = 0; column < IMPLICIT_GRID_SIZE; column += 1) {
      const corners = [nodes[row]![column]!, nodes[row]![column + 1]!, nodes[row + 1]![column + 1]!, nodes[row + 1]![column]!] as const
      const pairs = [[0, 1], [1, 2], [2, 3], [3, 0]] as const
      const intersections = pairs.map(([first, second], edge) => crosses(corners[first], corners[second])
        ? { edge, point: interpolateImplicitEdge(corners[first], corners[second]) } : null).filter((item): item is { edge: number; point: RelationCurvePoint } => Boolean(item))
      if (intersections.length === 2) paths.push([intersections[0]!.point, intersections[1]!.point])
      else if (intersections.length === 4) {
        const centerX = (corners[0].x + corners[2].x) / 2
        const centerY = (corners[0].y + corners[2].y) / 2
        let centerValue = Number.NaN
        try { centerValue = compiled.evaluate({ ...scope, x: centerX, y: centerY }) } catch { /* keep NaN */ }
        const byEdge = new Map(intersections.map((item) => [item.edge, item.point]))
        const sameAsFirst = Number.isFinite(centerValue) && (centerValue <= 0) === (corners[0].value <= 0)
        const edgePairs: Array<readonly [number, number]> = sameAsFirst ? [[0, 3], [1, 2]] : [[0, 1], [2, 3]]
        for (const [first, second] of edgePairs) paths.push([byEdge.get(first)!, byEdge.get(second)!])
      }
    }
  }
  return { paths, pointCount: paths.length * 2 }
}

function sampleRelationCurveUnchecked(spec: RelationCurve2DSpec): RelationCurveSample {
  return spec.mode === 'implicit' ? sampledImplicitCurve(spec) : sampledParametricCurve(spec)
}

export function sampleRelationCurve(spec: RelationCurve2DSpec): RelationCurveSample {
  const error = validateRelationCurve2DSpec(spec)
  if (error) throw new Error(error)
  return sampleRelationCurveUnchecked(spec)
}

export function getRelationCurve2DSpec(scene: LessonScene): RelationCurve2DSpec {
  if (scene.templateRef.id !== RELATION_CURVE_2D_TEMPLATE_ID) throw new Error('当前场景不是二维关系曲线场景。')
  const curve = scene.objects.find((object) => object.kind === 'relation-curve')
  if (!curve) throw new Error('二维关系曲线场景缺少曲线对象。')
  const number = (name: string) => Number(curve.bindings[name])
  const optionalNumber = (name: string) => curve.bindings[name] === undefined ? undefined : number(name)
  const optionalExpression = (name: string) => curve.bindings[name]
  return {
    mode: curve.bindings.mode as RelationCurveMode,
    formula: scene.annotations.formula,
    conclusion: scene.annotations.conclusion,
    parameters: Object.entries(scene.parameters)
      .filter((entry): entry is [string, NumberParameter] => isNumberParameter(entry[1]))
      .map(([id, parameter]) => ({ id, label: parameter.label, value: parameter.value, min: parameter.min, max: parameter.max, step: parameter.step })),
    xMin: number('xMin'), xMax: number('xMax'), yMin: number('yMin'), yMax: number('yMax'),
    variableMin: optionalNumber('variableMin'), variableMax: optionalNumber('variableMax'),
    xExpression: optionalExpression('xExpression'), yExpression: optionalExpression('yExpression'),
    radialExpression: optionalExpression('radialExpression'), implicitExpression: optionalExpression('implicitExpression'),
  }
}

export function validateRelationCurve2DScene(scene: LessonScene): string | null {
  try { return validateRelationCurve2DSpec(getRelationCurve2DSpec(scene)) } catch (error) {
    return error instanceof Error ? error.message : '二维关系曲线场景无效。'
  }
}

export function relationCurveViewport(spec: RelationCurve2DSpec): LessonScene['viewport'] {
  return { xMin: spec.xMin, xMax: spec.xMax, yMin: spec.yMin, yMax: spec.yMax, allowZoom: true }
}

export function updateRelationCurveParameter(scene: LessonScene, id: string, value: number): LessonScene {
  const parameter = scene.parameters[id]
  if (!isNumberParameter(parameter)) throw new Error(`二维关系曲线缺少参数：${id}`)
  if (!Number.isFinite(value) || value < parameter.min || value > parameter.max) throw new Error(`${parameter.label}必须在 ${parameter.min} 到 ${parameter.max} 之间。`)
  const next = structuredClone(scene)
  ;(next.parameters[id] as NumberParameter).value = value
  const error = validateRelationCurve2DScene(next)
  if (error) throw new Error(error)
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function resetRelationCurveScene(scene: LessonScene): LessonScene {
  const next = structuredClone(scene)
  for (const parameter of Object.values(next.parameters)) if (isNumberParameter(parameter)) parameter.value = parameter.default
  delete next.appearance.objectStyles
  next.lineage.updatedAt = new Date().toISOString()
  return next
}
