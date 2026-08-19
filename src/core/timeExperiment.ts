import { compileMathExpression } from './mathExpression'
import type { GenericFunctionParameterSpec } from './genericFunction'
import type { LessonScene, NumberParameter } from '../types/lessonScene'

export const TIME_EXPERIMENT_TEMPLATE_ID = 'experiment.motion.point-2d'

export interface TimeExperimentMetricSpec {
  id: string
  label: string
  expression: string
  unit: string
}

export interface TimeExperimentBodySpec {
  id: string
  label: string
  xExpression: string
  yExpression: string
}

export interface TimeExperimentVectorSpec {
  id: string
  label: string
  xExpression: string
  yExpression: string
  scale: number
  unit: string
  bodyId?: string
  display?: 'arrow' | 'distance'
  labelMode?: 'full' | 'value'
}

export interface TimeExperimentConstraintSpec {
  id: string
  label: string
  type: 'rope' | 'spring'
  bodyId: string
  anchorXExpression: string
  anchorYExpression: string
  restLengthExpression: string
}

export interface TimeExperimentSpec {
  durationExpression: string
  xExpression: string
  yExpression: string
  formula: string
  conclusion: string
  parameters: GenericFunctionParameterSpec[]
  metrics: TimeExperimentMetricSpec[]
  vectors: TimeExperimentVectorSpec[]
  bodyId?: string
  bodyLabel?: string
  additionalBodies?: TimeExperimentBodySpec[]
  constraints?: TimeExperimentConstraintSpec[]
}

export interface TimeExperimentSnapshot {
  time: number
  duration: number
  x: number
  y: number
  bodies: Array<TimeExperimentBodySpec & { x: number; y: number }>
  metrics: Array<TimeExperimentMetricSpec & { value: number }>
  vectors: Array<TimeExperimentVectorSpec & { bodyId: string; x: number; y: number; magnitude: number }>
  constraints: Array<TimeExperimentConstraintSpec & {
    anchorX: number
    anchorY: number
    bodyX: number
    bodyY: number
    restLength: number
    currentLength: number
    error: number
  }>
}

export interface TimeExperimentRuntime {
  duration: number
  snapshot: (requestedTime: number) => TimeExperimentSnapshot
  sample: (endTime?: number, count?: number) => Array<{ x: number; y: number; t: number }>
  sampleBodies: (endTime?: number, count?: number) => Array<{
    t: number
    bodies: Array<TimeExperimentBodySpec & { x: number; y: number }>
  }>
}

const RESERVED_IDENTIFIERS = new Set([
  't', 'pi', 'e', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'log', 'ln', 'min', 'max', 'pow', 'step',
])

function parameterScope(spec: TimeExperimentSpec): Record<string, number> {
  return Object.fromEntries(spec.parameters.map((parameter) => [parameter.id, parameter.value]))
}

function bodySpecs(spec: TimeExperimentSpec): TimeExperimentBodySpec[] {
  return [{
    id: spec.bodyId ?? 'primary',
    label: spec.bodyLabel ?? '运动物体',
    xExpression: spec.xExpression,
    yExpression: spec.yExpression,
  }, ...(spec.additionalBodies ?? [])]
}

function metricDependencies(metric: TimeExperimentMetricSpec, metricIds: Set<string>): string[] {
  return (metric.expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])
    .filter((identifier) => metricIds.has(identifier))
}

function compileMetrics(spec: TimeExperimentSpec, variables: Iterable<string>) {
  const metricIds = new Set(spec.metrics.map((metric) => metric.id))
  const allowed = [...variables, ...metricIds]
  return spec.metrics.map((metric) => ({
    compiled: compileMathExpression(metric.expression, allowed),
    dependencies: metricDependencies(metric, metricIds),
  }))
}

function evaluateMetrics(
  spec: TimeExperimentSpec,
  compiledMetrics: ReturnType<typeof compileMetrics>,
  baseScope: Record<string, number>,
): { values: number[]; scope: Record<string, number> } {
  const scope = { ...baseScope }
  const pending = new Set(spec.metrics.map((_, index) => index))
  while (pending.size > 0) {
    let progressed = false
    for (const index of [...pending]) {
      const metric = spec.metrics[index]!
      const definition = compiledMetrics[index]!
      if (definition.dependencies.some((dependency) => !Object.hasOwn(scope, dependency))) continue
      scope[metric.id] = definition.compiled.evaluate(scope)
      pending.delete(index)
      progressed = true
    }
    if (!progressed) throw new Error('时间实验测量量之间存在循环依赖。')
  }
  return { values: spec.metrics.map((metric) => scope[metric.id]!), scope }
}

export function validateTimeExperimentSpec(spec: TimeExperimentSpec): string | null {
  if (!spec.formula || spec.formula.length > 200) return '实验公式长度必须在 1 到 200 个字符之间。'
  if (!spec.conclusion || spec.conclusion.length > 400) return '实验结论长度必须在 1 到 400 个字符之间。'
  if (spec.parameters.length > 6) return '时间实验最多支持 6 个可调参数。'
  if (spec.metrics.length > 4) return '时间实验最多支持 4 个测量量。'
  if (spec.vectors.length > 4) return '时间实验最多支持 4 个力学矢量。'
  if ((spec.constraints?.length ?? 0) > 4) return '时间实验最多支持 4 个绳或弹簧约束。'
  if ((spec.additionalBodies?.length ?? 0) > 3) return '时间实验最多支持 4 个运动物体。'

  const parameterIds = new Set<string>()
  for (const parameter of spec.parameters) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(parameter.id)) return `参数 ID 不合法：${parameter.id}`
    if (RESERVED_IDENTIFIERS.has(parameter.id)) return `参数 ID 与保留名称冲突：${parameter.id}`
    if (parameterIds.has(parameter.id)) return `参数 ID 重复：${parameter.id}`
    parameterIds.add(parameter.id)
    if (!parameter.label || parameter.label.length > 40) return `参数 ${parameter.id} 的名称不合法。`
    if (![parameter.value, parameter.min, parameter.max, parameter.step].every(Number.isFinite)) {
      return `参数 ${parameter.label} 包含无效数字。`
    }
    if (parameter.min >= parameter.max || parameter.step <= 0) return `参数 ${parameter.label} 的范围或步长无效。`
    if (parameter.value < parameter.min || parameter.value > parameter.max) return `参数 ${parameter.label} 的初始值超出范围。`
  }

  const metricIds = new Set<string>()
  for (const metric of spec.metrics) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(metric.id)) return `测量量 ID 不合法：${metric.id}`
    if (metricIds.has(metric.id)) return `测量量 ID 重复：${metric.id}`
    metricIds.add(metric.id)
    if (parameterIds.has(metric.id) || RESERVED_IDENTIFIERS.has(metric.id)) return `测量量 ID 与参数或保留名称冲突：${metric.id}`
    if (!metric.label || metric.label.length > 40 || metric.unit.length > 16) return `测量量 ${metric.id} 的标签或单位不合法。`
  }

  const bodies = bodySpecs(spec)
  const bodyIds = new Set<string>()
  for (const body of bodies) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(body.id)) return `运动物体 ID 不合法：${body.id}`
    if (bodyIds.has(body.id)) return `运动物体 ID 重复：${body.id}`
    bodyIds.add(body.id)
    if (!body.label || body.label.length > 40) return `运动物体 ${body.id} 的名称不合法。`
  }

  const vectorIds = new Set<string>()
  for (const vector of spec.vectors) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(vector.id)) return `矢量 ID 不合法：${vector.id}`
    if (vectorIds.has(vector.id)) return `矢量 ID 重复：${vector.id}`
    vectorIds.add(vector.id)
    if (!vector.label || vector.label.length > 40 || !vector.unit || vector.unit.length > 16) {
      return `矢量 ${vector.id} 的标签或单位不合法。`
    }
    if (!Number.isFinite(vector.scale) || vector.scale < 0.01 || vector.scale > 20) {
      return `矢量 ${vector.label} 的显示比例必须在 0.01 到 20 之间。`
    }
    if (vector.display !== undefined && vector.display !== 'arrow' && vector.display !== 'distance') {
      return `矢量 ${vector.label} 的显示模式不合法。`
    }
    if (vector.labelMode !== undefined && vector.labelMode !== 'full' && vector.labelMode !== 'value') {
      return `矢量 ${vector.label} 的标签模式不合法。`
    }
    if (!bodyIds.has(vector.bodyId ?? bodies[0]!.id)) return `矢量 ${vector.label} 绑定了不存在的运动物体。`
  }

  const constraintIds = new Set<string>()
  for (const constraint of spec.constraints ?? []) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(constraint.id)) return `约束 ID 不合法：${constraint.id}`
    if (constraintIds.has(constraint.id)) return `约束 ID 重复：${constraint.id}`
    constraintIds.add(constraint.id)
    if (!constraint.label || constraint.label.length > 40) return `约束 ${constraint.id} 的名称不合法。`
    if (constraint.type !== 'rope' && constraint.type !== 'spring') return `约束 ${constraint.label} 的类型不合法。`
    if (!bodyIds.has(constraint.bodyId)) return `约束 ${constraint.label} 绑定了不存在的运动物体。`
  }

  try {
    const variables = ['t', ...parameterIds]
    const expressionVariables = [...variables, ...metricIds]
    const scope = parameterScope(spec)
    const duration = compileMathExpression(spec.durationExpression, parameterIds).evaluate(scope)
    if (!Number.isFinite(duration) || duration < 0.2 || duration > 60) {
      return '实验持续时间必须在 0.2 到 60 秒之间。'
    }
    const positions = bodies.map((body) => ({
      x: compileMathExpression(body.xExpression, expressionVariables),
      y: compileMathExpression(body.yExpression, expressionVariables),
    }))
    const metrics = compileMetrics(spec, variables)
    const vectors = spec.vectors.map((vector) => ({
      x: compileMathExpression(vector.xExpression, expressionVariables),
      y: compileMathExpression(vector.yExpression, expressionVariables),
    }))
    const constraints = (spec.constraints ?? []).map((constraint) => ({
      anchorX: compileMathExpression(constraint.anchorXExpression, expressionVariables),
      anchorY: compileMathExpression(constraint.anchorYExpression, expressionVariables),
      restLength: compileMathExpression(constraint.restLengthExpression, expressionVariables),
    }))
    for (let index = 0; index <= 120; index += 1) {
      const t = duration * index / 120
      const local = { ...scope, t }
      const metricState = evaluateMetrics(spec, metrics, local)
      const bodyValues = positions.map((position) => ({
        x: position.x.evaluate(metricState.scope),
        y: position.y.evaluate(metricState.scope),
      }))
      const constraintValues = constraints.map((constraint, constraintIndex) => {
        const specConstraint = spec.constraints![constraintIndex]!
        const anchorX = constraint.anchorX.evaluate(metricState.scope)
        const anchorY = constraint.anchorY.evaluate(metricState.scope)
        const restLength = constraint.restLength.evaluate(metricState.scope)
        const bodyIndex = bodies.findIndex((body) => body.id === specConstraint.bodyId)
        const body = bodyValues[bodyIndex]!
        const currentLength = Math.hypot(body.x - anchorX, body.y - anchorY)
        return { spec: specConstraint, anchorX, anchorY, restLength, currentLength }
      })
      const values = [
        ...bodyValues.flatMap((position) => [position.x, position.y]),
        ...metricState.values,
        ...vectors.flatMap((vector) => [vector.x.evaluate(metricState.scope), vector.y.evaluate(metricState.scope)]),
        ...constraintValues.flatMap((constraint) => [constraint.anchorX, constraint.anchorY, constraint.restLength, constraint.currentLength]),
      ]
      if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e6)) {
        return '实验表达式在运行区间内产生了无效或过大的数值。'
      }
      for (const constraint of constraintValues) {
        if (constraint.restLength <= 0) return `约束 ${constraint.spec.label} 的自然长度必须大于 0。`
        const tolerance = Math.max(1e-6, constraint.restLength * 1e-4)
        if (constraint.spec.type === 'rope' && Math.abs(constraint.currentLength - constraint.restLength) > tolerance) {
          return `绳约束 ${constraint.spec.label} 在运行区间内未保持长度不变。`
        }
      }
    }
  } catch (error) {
    return error instanceof Error ? error.message : '实验表达式无效。'
  }
  return null
}

export function getTimeExperimentSpec(scene: LessonScene): TimeExperimentSpec {
  const body = scene.objects.find(
    (object) => object.kind === 'time-point' && object.bindings.durationExpression,
  ) ?? scene.objects.find((object) => object.kind === 'time-point')
  if (!body) throw new Error('时间实验场景缺少运动对象。')
  const bodyId = body.id.replace(/^body\./, '') === body.id ? 'primary' : body.id.replace(/^body\./, '')
  const additionalBodies = scene.objects
    .filter((object) => object.kind === 'time-point' && object.id !== body.id)
    .map((object) => ({
      id: object.id.replace(/^body\./, ''),
      label: object.label ?? object.role,
      xExpression: object.bindings.xExpression ?? '',
      yExpression: object.bindings.yExpression ?? '',
    }))
  const parameters = Object.entries(scene.parameters)
    .filter((entry): entry is [string, NumberParameter] => entry[1].type === 'number')
    .map(([id, parameter]) => ({
      id, label: parameter.label, value: parameter.value,
      min: parameter.min, max: parameter.max, step: parameter.step,
    }))
  return {
    durationExpression: body.bindings.durationExpression ?? '',
    xExpression: body.bindings.xExpression ?? '',
    yExpression: body.bindings.yExpression ?? '',
    bodyId,
    bodyLabel: body.label ?? body.role,
    additionalBodies,
    formula: scene.annotations.formula,
    conclusion: scene.annotations.conclusion,
    parameters,
    metrics: scene.derivedValues.map((metric) => ({
      id: metric.id, label: metric.label, expression: metric.expression, unit: metric.unit,
    })),
    vectors: scene.objects
      .filter((object) => object.kind === 'vector')
      .map((vector) => ({
        id: vector.id.replace(/^vector\./, ''),
        label: vector.label ?? vector.role,
        xExpression: vector.bindings.xExpression ?? '',
        yExpression: vector.bindings.yExpression ?? '',
        scale: Number(vector.bindings.scale),
        unit: vector.unit ?? '',
        bodyId: vector.anchorId?.replace(/^body\./, '') ?? bodyId,
        display: vector.role === '几何距离' ? 'distance' : 'arrow',
        labelMode: vector.bindings.labelMode === 'value' ? 'value' : 'full',
      })),
    constraints: scene.objects
      .filter((object) => object.kind === 'constraint')
      .map((constraint) => ({
        id: constraint.id.replace(/^constraint\./, ''),
        label: constraint.label ?? constraint.role,
        type: constraint.constraintType ?? 'rope',
        bodyId: constraint.anchorId?.replace(/^body\./, '') ?? bodyId,
        anchorXExpression: constraint.bindings.anchorXExpression ?? '',
        anchorYExpression: constraint.bindings.anchorYExpression ?? '',
        restLengthExpression: constraint.bindings.restLengthExpression ?? '',
      })),
  }
}

export function getTimeExperimentSnapshot(scene: LessonScene, requestedTime: number): TimeExperimentSnapshot {
  return createTimeExperimentRuntime(scene).snapshot(requestedTime)
}

export function createTimeExperimentRuntime(scene: LessonScene): TimeExperimentRuntime {
  const spec = getTimeExperimentSpec(scene)
  const error = validateTimeExperimentSpec(spec)
  if (error) throw new Error(error)
  const scope = parameterScope(spec)
  const parameterIds = spec.parameters.map((parameter) => parameter.id)
  const duration = compileMathExpression(spec.durationExpression, parameterIds).evaluate(scope)
  const variables = ['t', ...parameterIds]
  const metricIds = spec.metrics.map((metric) => metric.id)
  const expressionVariables = [...variables, ...metricIds]
  const bodies = bodySpecs(spec)
  const evaluateBodies = bodies.map((body) => ({
    x: compileMathExpression(body.xExpression, expressionVariables),
    y: compileMathExpression(body.yExpression, expressionVariables),
  }))
  const compiledMetrics = compileMetrics(spec, variables)
  const evaluateVectors = spec.vectors.map((vector) => ({
    x: compileMathExpression(vector.xExpression, expressionVariables),
    y: compileMathExpression(vector.yExpression, expressionVariables),
  }))
  const evaluateConstraints = (spec.constraints ?? []).map((constraint) => ({
    anchorX: compileMathExpression(constraint.anchorXExpression, expressionVariables),
    anchorY: compileMathExpression(constraint.anchorYExpression, expressionVariables),
    restLength: compileMathExpression(constraint.restLengthExpression, expressionVariables),
  }))

  const snapshot = (requestedTime: number): TimeExperimentSnapshot => {
    const time = Math.min(duration, Math.max(0, requestedTime))
    const local = { ...scope, t: time }
    const metricState = evaluateMetrics(spec, compiledMetrics, local)
    const bodyStates = bodies.map((body, index) => ({
      ...body,
      x: evaluateBodies[index]!.x.evaluate(metricState.scope),
      y: evaluateBodies[index]!.y.evaluate(metricState.scope),
    }))
    return {
      time,
      duration,
      x: bodyStates[0]!.x,
      y: bodyStates[0]!.y,
      bodies: bodyStates,
      metrics: spec.metrics.map((metric, index) => ({
        ...metric,
        value: metricState.values[index]!,
      })),
      vectors: spec.vectors.map((vector, index) => {
        const x = evaluateVectors[index]!.x.evaluate(metricState.scope)
        const y = evaluateVectors[index]!.y.evaluate(metricState.scope)
        return { ...vector, bodyId: vector.bodyId ?? bodies[0]!.id, x, y, magnitude: Math.hypot(x, y) }
      }),
      constraints: (spec.constraints ?? []).map((constraint, index) => {
        const anchorX = evaluateConstraints[index]!.anchorX.evaluate(metricState.scope)
        const anchorY = evaluateConstraints[index]!.anchorY.evaluate(metricState.scope)
        const restLength = evaluateConstraints[index]!.restLength.evaluate(metricState.scope)
        const body = bodyStates.find((candidate) => candidate.id === constraint.bodyId)!
        const currentLength = Math.hypot(body.x - anchorX, body.y - anchorY)
        return {
          ...constraint,
          anchorX,
          anchorY,
          bodyX: body.x,
          bodyY: body.y,
          restLength,
          currentLength,
          error: currentLength - restLength,
        }
      }),
    }
  }

  const sample = (endTime = duration, count = 181) => {
    const end = Math.min(duration, Math.max(0, endTime))
    const samples: Array<{ x: number; y: number; t: number }> = []
    for (let index = 0; index < count; index += 1) {
      const t = count === 1 ? end : end * index / (count - 1)
      const state = snapshot(t)
      samples.push({ x: state.x, y: state.y, t })
    }
    return samples
  }

  const sampleBodies = (endTime = duration, count = 181) => {
    const end = Math.min(duration, Math.max(0, endTime))
    return Array.from({ length: count }, (_, index) => {
      const t = count === 1 ? end : end * index / (count - 1)
      const state = snapshot(t)
      return { t, bodies: state.bodies }
    })
  }

  return {
    duration,
    snapshot,
    sample,
    sampleBodies,
  }
}

export function sampleTimeExperiment(scene: LessonScene, endTime?: number, count = 181): Array<{ x: number; y: number; t: number }> {
  return createTimeExperimentRuntime(scene).sample(endTime, count)
}

export function estimateTimeExperimentViewport(scene: LessonScene): LessonScene['viewport'] {
  const runtime = createTimeExperimentRuntime(scene)
  const samples = runtime.sample(undefined, 121)
  const snapshots = samples.map((sample) => runtime.snapshot(sample.t))
  const xs = snapshots.flatMap((snapshot) => [
    ...snapshot.bodies.map((body) => body.x),
    ...snapshot.vectors.map((vector) => {
      const anchor = snapshot.bodies.find((body) => body.id === vector.bodyId) ?? snapshot.bodies[0]!
      return anchor.x + vector.x * vector.scale
    }),
    ...snapshot.constraints.map((constraint) => constraint.anchorX),
  ])
  const ys = snapshots.flatMap((snapshot) => [
    ...snapshot.bodies.map((body) => body.y),
    ...snapshot.vectors.map((vector) => {
      const anchor = snapshot.bodies.find((body) => body.id === vector.bodyId) ?? snapshot.bodies[0]!
      return anchor.y + vector.y * vector.scale
    }),
    ...snapshot.constraints.map((constraint) => constraint.anchorY),
  ])
  let xMin = Math.min(0, ...xs)
  let xMax = Math.max(0, ...xs)
  let yMin = Math.min(0, ...ys)
  let yMax = Math.max(0, ...ys)
  const xMargin = Math.max(2, (xMax - xMin) * 0.15)
  const yMargin = Math.max(1, (yMax - yMin) * 0.1)
  xMin -= xMargin
  xMax += xMargin
  yMin -= yMargin * 0.35
  yMax += yMargin
  if (yMax - yMin < 4) {
    const center = (yMin + yMax) / 2
    yMin = center - 2
    yMax = center + 2
  }
  return { xMin, xMax, yMin, yMax, allowZoom: true }
}

export function updateTimeExperimentParameter(scene: LessonScene, id: string, value: number): LessonScene {
  const next = structuredClone(scene)
  const parameter = next.parameters[id]
  if (parameter?.type !== 'number') throw new Error(`场景缺少数值参数：${id}`)
  if (!Number.isFinite(value) || value < parameter.min || value > parameter.max) {
    throw new Error(`${parameter.label}必须在 ${parameter.min} 到 ${parameter.max} 之间。`)
  }
  parameter.value = value
  const error = validateTimeExperimentSpec(getTimeExperimentSpec(next))
  if (error) throw new Error(error)
  next.viewport = estimateTimeExperimentViewport(next)
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function resetTimeExperimentScene(scene: LessonScene): LessonScene {
  const next = structuredClone(scene)
  for (const parameter of Object.values(next.parameters)) parameter.value = parameter.default
  next.appearance = {
    ...next.appearance,
    theme: 'light', showAxes: true, showGrid: true, showPointLabel: true,
    showHelperLines: next.objects.some((object) => object.kind === 'vector' || object.kind === 'constraint'),
    showFormula: true, showTrail: true, curveColor: '#5B5BD6',
    pointColor: '#E15C48', helperColor: '#64748B', lineWidth: 3,
    pointRadius: 8, fontScale: 1, animationSpeed: 0.55,
  }
  next.viewport = estimateTimeExperimentViewport(next)
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function validateTimeExperimentScene(scene: LessonScene): string | null {
  try {
    return validateTimeExperimentSpec(getTimeExperimentSpec(scene))
  } catch (error) {
    return error instanceof Error ? error.message : '时间实验场景无效。'
  }
}
