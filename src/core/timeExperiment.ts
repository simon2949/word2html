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

export interface TimeExperimentVectorSpec {
  id: string
  label: string
  xExpression: string
  yExpression: string
  scale: number
  unit: string
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
}

export interface TimeExperimentSnapshot {
  time: number
  duration: number
  x: number
  y: number
  metrics: Array<TimeExperimentMetricSpec & { value: number }>
  vectors: Array<TimeExperimentVectorSpec & { x: number; y: number; magnitude: number }>
}

export interface TimeExperimentRuntime {
  duration: number
  snapshot: (requestedTime: number) => TimeExperimentSnapshot
  sample: (endTime?: number, count?: number) => Array<{ x: number; y: number; t: number }>
}

const RESERVED_IDENTIFIERS = new Set([
  't', 'pi', 'e', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'log', 'ln', 'min', 'max', 'pow',
])

function parameterScope(spec: TimeExperimentSpec): Record<string, number> {
  return Object.fromEntries(spec.parameters.map((parameter) => [parameter.id, parameter.value]))
}

export function validateTimeExperimentSpec(spec: TimeExperimentSpec): string | null {
  if (!spec.formula || spec.formula.length > 200) return '实验公式长度必须在 1 到 200 个字符之间。'
  if (!spec.conclusion || spec.conclusion.length > 400) return '实验结论长度必须在 1 到 400 个字符之间。'
  if (spec.parameters.length > 6) return '时间实验最多支持 6 个可调参数。'
  if (spec.metrics.length > 4) return '时间实验最多支持 4 个测量量。'
  if (spec.vectors.length > 4) return '时间实验最多支持 4 个力学矢量。'

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
    if (!metric.label || metric.label.length > 40 || metric.unit.length > 16) return `测量量 ${metric.id} 的标签或单位不合法。`
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
  }

  try {
    const variables = ['t', ...parameterIds]
    const scope = parameterScope(spec)
    const duration = compileMathExpression(spec.durationExpression, parameterIds).evaluate(scope)
    if (!Number.isFinite(duration) || duration < 0.2 || duration > 60) {
      return '实验持续时间必须在 0.2 到 60 秒之间。'
    }
    const x = compileMathExpression(spec.xExpression, variables)
    const y = compileMathExpression(spec.yExpression, variables)
    const metrics = spec.metrics.map((metric) => compileMathExpression(metric.expression, variables))
    const vectors = spec.vectors.map((vector) => ({
      x: compileMathExpression(vector.xExpression, variables),
      y: compileMathExpression(vector.yExpression, variables),
    }))
    for (let index = 0; index <= 120; index += 1) {
      const t = duration * index / 120
      const local = { ...scope, t }
      const values = [
        x.evaluate(local), y.evaluate(local),
        ...metrics.map((metric) => metric.evaluate(local)),
        ...vectors.flatMap((vector) => [vector.x.evaluate(local), vector.y.evaluate(local)]),
      ]
      if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e6)) {
        return '实验表达式在运行区间内产生了无效或过大的数值。'
      }
    }
  } catch (error) {
    return error instanceof Error ? error.message : '实验表达式无效。'
  }
  return null
}

export function getTimeExperimentSpec(scene: LessonScene): TimeExperimentSpec {
  const body = scene.objects.find((object) => object.kind === 'time-point')
  if (!body) throw new Error('时间实验场景缺少运动对象。')
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
  const evaluateX = compileMathExpression(spec.xExpression, variables)
  const evaluateY = compileMathExpression(spec.yExpression, variables)
  const evaluateMetrics = spec.metrics.map((metric) => compileMathExpression(metric.expression, variables))
  const evaluateVectors = spec.vectors.map((vector) => ({
    x: compileMathExpression(vector.xExpression, variables),
    y: compileMathExpression(vector.yExpression, variables),
  }))

  const snapshot = (requestedTime: number): TimeExperimentSnapshot => {
    const time = Math.min(duration, Math.max(0, requestedTime))
    const local = { ...scope, t: time }
    return {
      time,
      duration,
      x: evaluateX.evaluate(local),
      y: evaluateY.evaluate(local),
      metrics: spec.metrics.map((metric, index) => ({
        ...metric,
        value: evaluateMetrics[index]!.evaluate(local),
      })),
      vectors: spec.vectors.map((vector, index) => {
        const x = evaluateVectors[index]!.x.evaluate(local)
        const y = evaluateVectors[index]!.y.evaluate(local)
        return { ...vector, x, y, magnitude: Math.hypot(x, y) }
      }),
    }
  }

  const sample = (endTime = duration, count = 181) => {
    const end = Math.min(duration, Math.max(0, endTime))
    const samples: Array<{ x: number; y: number; t: number }> = []
    for (let index = 0; index < count; index += 1) {
      const t = count === 1 ? end : end * index / (count - 1)
      const local = { ...scope, t }
      samples.push({ x: evaluateX.evaluate(local), y: evaluateY.evaluate(local), t })
    }
    return samples
  }

  return {
    duration,
    snapshot,
    sample,
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
    snapshot.x,
    ...snapshot.vectors.map((vector) => snapshot.x + vector.x * vector.scale),
  ])
  const ys = snapshots.flatMap((snapshot) => [
    snapshot.y,
    ...snapshot.vectors.map((vector) => snapshot.y + vector.y * vector.scale),
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
    showHelperLines: next.objects.some((object) => object.kind === 'vector'),
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
