import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  createModelProviderClient,
  publicModelProviderStatus,
  readModelProviderConfig,
} from './model-provider.mjs'

const schemaUrl = new URL('../src/schema/lesson-plan.schema.json', import.meta.url)
export const lessonPlanSchema = JSON.parse(readFileSync(schemaUrl, 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: true })
const validatePlanSchema = ajv.compile(lessonPlanSchema)
const TOOL_NAME = 'emit_lesson_plan'
export const GENERATION_API_VERSION = 'lesson-plan-1.4'

function finiteNumberFromString(value) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return value
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : value
}

function expressionStringFromNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : value
}

function normalizeExpressionValue(value) {
  const converted = expressionStringFromNumber(value)
  if (typeof converted !== 'string') return converted
  let normalized = converted.trim()
    .replace(/^\$([\s\S]*)\$$/, '$1')
    .replaceAll('−', '-')
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('（', '(')
    .replaceAll('）', ')')
    .replaceAll('，', ',')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
  if (/^[+-]?0(?:\.0+)?\s*\([^()]{1,40}\)$/.test(normalized)) {
    normalized = normalized.match(/^[+-]?0(?:\.0+)?/)?.[0] ?? normalized
  }
  return normalized
}

function replaceIdentifier(expression, identifier, replacement) {
  return expression.replace(
    new RegExp(`(^|[^A-Za-z0-9_])${identifier}(?=$|[^A-Za-z0-9_])`, 'g'),
    (_, prefix) => `${prefix}${replacement}`,
  )
}

function mapTimeExperimentExpressions(spec, transform) {
  for (const name of ['durationExpression', 'xExpression', 'yExpression']) {
    if (typeof spec[name] === 'string') spec[name] = transform(spec[name])
  }
  for (const body of spec.additionalBodies ?? []) {
    for (const name of ['xExpression', 'yExpression']) {
      if (typeof body?.[name] === 'string') body[name] = transform(body[name])
    }
  }
  for (const metric of spec.metrics ?? []) {
    if (typeof metric?.expression === 'string') metric.expression = transform(metric.expression)
  }
  for (const vector of spec.vectors ?? []) {
    for (const name of ['xExpression', 'yExpression']) {
      if (typeof vector?.[name] === 'string') vector[name] = transform(vector[name])
    }
  }
  for (const constraint of spec.constraints ?? []) {
    for (const name of ['anchorXExpression', 'anchorYExpression', 'restLengthExpression']) {
      if (typeof constraint?.[name] === 'string') constraint[name] = transform(constraint[name])
    }
  }
}

function normalizeTimeExperimentIdentifierCase(spec) {
  const declared = [
    't', 'pi', 'e', ...SAFE_FUNCTION_NAMES,
    ...(spec.parameters ?? []).map((parameter) => parameter?.id),
    ...(spec.metrics ?? []).map((metric) => metric?.id),
  ].filter((identifier) => typeof identifier === 'string')
  const exact = new Set(declared)
  const aliases = new Map()
  for (const identifier of declared) {
    const key = identifier.toLowerCase()
    if (!aliases.has(key)) aliases.set(key, identifier)
    else if (aliases.get(key) !== identifier) aliases.set(key, null)
  }
  mapTimeExperimentExpressions(spec, (expression) => expression.replace(
    /[A-Za-z_][A-Za-z0-9_]*/g,
    (identifier) => exact.has(identifier) ? identifier : (aliases.get(identifier.toLowerCase()) ?? identifier),
  ))
}

/**
 * A suspension height only translates a pendulum vertically, so an omitted H/H1/H2
 * can be replaced without changing its motion. Prefer the rope's declared anchor
 * height; otherwise use zero. Other unknown identifiers remain hard errors.
 */
function repairMissingPendulumSupportHeights(spec) {
  const known = new Set([
    't', 'pi', 'e', ...SAFE_FUNCTION_NAMES,
    ...(spec.parameters ?? []).map((parameter) => parameter?.id),
    ...(spec.metrics ?? []).map((metric) => metric?.id),
  ])
  const primaryId = spec.bodyId ?? 'primary'
  const bodies = new Map([[primaryId, spec], ...(spec.additionalBodies ?? []).map((body) => [body.id, body])])
  const unknownHeights = (expression) => [...new Set(
    (expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])
      .filter((identifier) => /^H\d*$/i.test(identifier) && !known.has(identifier)),
  )]
  const hasUnknown = (expression) => (expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])
    .some((identifier) => !known.has(identifier))

  for (const constraint of spec.constraints ?? []) {
    if (constraint?.type !== 'rope' || typeof constraint.anchorYExpression !== 'string') continue
    const body = bodies.get(constraint.bodyId)
    if (!body || typeof body.yExpression !== 'string') continue
    const missing = [...new Set([
      ...unknownHeights(constraint.anchorYExpression),
      ...unknownHeights(body.yExpression),
    ])]
    if (missing.length === 0) continue
    const replacement = hasUnknown(constraint.anchorYExpression)
      ? '0'
      : `(${constraint.anchorYExpression})`
    for (const identifier of missing) {
      constraint.anchorYExpression = replaceIdentifier(constraint.anchorYExpression, identifier, replacement)
      body.yExpression = replaceIdentifier(body.yExpression, identifier, replacement)
    }
  }
}

export function readMinimaxConfig(environment = process.env) {
  return readModelProviderConfig(environment)
}

export function publicModelStatus(environment = process.env) {
  return publicModelProviderStatus(environment)
}

function parseJsonText(value) {
  const withoutFence = value.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('大模型未返回 LessonPlan 工具调用或 JSON 对象。')
  return JSON.parse(withoutFence.slice(start, end + 1))
}

export function extractPlanFromModelResponse(response) {
  const toolUse = response?.content?.find(
    (block) => block?.type === 'tool_use' && block?.name === TOOL_NAME,
  )
  if (toolUse?.input && typeof toolUse.input === 'object') return toolUse.input

  const text = (response?.content ?? [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
  return parseJsonText(text)
}

/** Only repair JSON type conversions that are unambiguous. */
export function normalizeGeneratedPlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const plan = structuredClone(value)
  if (plan.schemaVersion === 0.1) plan.schemaVersion = '0.1'
  if (!Object.hasOwn(plan, 'parameterOverrides')) plan.parameterOverrides = {}
  if (plan.parameterOverrides && typeof plan.parameterOverrides === 'object') {
    for (const name of ['majorAxis', 'minorAxis', 'coefficientA', 'vertexH', 'vertexK']) {
      if (!Object.hasOwn(plan.parameterOverrides, name)) continue
      const candidate = plan.parameterOverrides[name]
      plan.parameterOverrides[name] = finiteNumberFromString(candidate)
    }
  }
  if (plan.functionSpec && typeof plan.functionSpec === 'object') {
    if (Object.hasOwn(plan.functionSpec, 'expression')) {
      plan.functionSpec.expression = normalizeExpressionValue(plan.functionSpec.expression)
    }
    for (const name of ['xMin', 'xMax']) {
      if (!Object.hasOwn(plan.functionSpec, name)) continue
      const candidate = plan.functionSpec[name]
      plan.functionSpec[name] = finiteNumberFromString(candidate)
    }
    if (Array.isArray(plan.functionSpec.parameters)) {
      for (const parameter of plan.functionSpec.parameters) {
        if (!parameter || typeof parameter !== 'object') continue
        for (const name of ['value', 'min', 'max', 'step']) {
          if (!Object.hasOwn(parameter, name)) continue
          const candidate = parameter[name]
          parameter[name] = finiteNumberFromString(candidate)
        }
      }
    }
  }
  if (plan.relationSpec && typeof plan.relationSpec === 'object') {
    for (const name of ['xMin', 'xMax', 'yMin', 'yMax', 'variableMin', 'variableMax']) {
      if (Object.hasOwn(plan.relationSpec, name)) plan.relationSpec[name] = finiteNumberFromString(plan.relationSpec[name])
    }
    for (const name of ['xExpression', 'yExpression', 'radialExpression', 'implicitExpression']) {
      if (Object.hasOwn(plan.relationSpec, name)) plan.relationSpec[name] = normalizeExpressionValue(plan.relationSpec[name])
    }
    if (Array.isArray(plan.relationSpec.parameters)) {
      for (const parameter of plan.relationSpec.parameters) {
        if (!parameter || typeof parameter !== 'object') continue
        for (const name of ['value', 'min', 'max', 'step']) {
          if (Object.hasOwn(parameter, name)) parameter[name] = finiteNumberFromString(parameter[name])
        }
      }
    }
  }
  if (plan.geometrySpec && typeof plan.geometrySpec === 'object') {
    for (const name of ['connections', 'arcs', 'polygons', 'measurements', 'loci']) {
      if (!Object.hasOwn(plan.geometrySpec, name)) plan.geometrySpec[name] = []
    }
    if (Array.isArray(plan.geometrySpec.parameters)) {
      for (const parameter of plan.geometrySpec.parameters) {
        if (!parameter || typeof parameter !== 'object') continue
        for (const name of ['value', 'min', 'max', 'step']) {
          if (Object.hasOwn(parameter, name)) parameter[name] = finiteNumberFromString(parameter[name])
        }
      }
    }
    if (Array.isArray(plan.geometrySpec.points)) {
      for (const point of plan.geometrySpec.points) {
        if (!point || typeof point !== 'object') continue
        for (const name of ['xExpression', 'yExpression']) {
          if (Object.hasOwn(point, name)) point[name] = normalizeExpressionValue(point[name])
        }
        if (point.construction && typeof point.construction === 'object') {
          for (const name of ['dxExpression', 'dyExpression', 'angleExpression', 'scaleExpression']) {
            if (Object.hasOwn(point.construction, name)) point.construction[name] = normalizeExpressionValue(point.construction[name])
          }
        }
        if (point.constraint && typeof point.constraint === 'object' && Object.hasOwn(point.constraint, 'radiusExpression')) {
          point.constraint.radiusExpression = normalizeExpressionValue(point.constraint.radiusExpression)
        }
      }
    }
    if (Array.isArray(plan.geometrySpec.measurements)) {
      for (const measurement of plan.geometrySpec.measurements) {
        if (measurement?.kind === 'expression' && Object.hasOwn(measurement, 'expression')) {
          measurement.expression = normalizeExpressionValue(measurement.expression)
        }
      }
    }
    if (Array.isArray(plan.geometrySpec.loci)) {
      for (const locus of plan.geometrySpec.loci) {
        if (!locus || typeof locus !== 'object') continue
        for (const name of ['min', 'max']) if (Object.hasOwn(locus, name)) locus[name] = finiteNumberFromString(locus[name])
      }
    }
  }
  if (plan.experimentSpec && typeof plan.experimentSpec === 'object') {
    if (!Object.hasOwn(plan.experimentSpec, 'vectors')) plan.experimentSpec.vectors = []
    if (!Object.hasOwn(plan.experimentSpec, 'additionalBodies')) plan.experimentSpec.additionalBodies = []
    if (!Object.hasOwn(plan.experimentSpec, 'constraints')) plan.experimentSpec.constraints = []
    if (!Object.hasOwn(plan.experimentSpec, 'bodyId')) plan.experimentSpec.bodyId = 'primary'
    if (!Object.hasOwn(plan.experimentSpec, 'bodyLabel')) plan.experimentSpec.bodyLabel = '运动物体'
    for (const name of ['durationExpression', 'xExpression', 'yExpression']) {
      if (!Object.hasOwn(plan.experimentSpec, name)) continue
      plan.experimentSpec[name] = normalizeExpressionValue(plan.experimentSpec[name])
    }
    if (Array.isArray(plan.experimentSpec.parameters)) {
      for (const parameter of plan.experimentSpec.parameters) {
        if (!parameter || typeof parameter !== 'object') continue
        for (const name of ['value', 'min', 'max', 'step']) {
          if (!Object.hasOwn(parameter, name)) continue
          parameter[name] = finiteNumberFromString(parameter[name])
        }
      }
    }
    if (Array.isArray(plan.experimentSpec.metrics)) {
      for (const metric of plan.experimentSpec.metrics) {
        if (!metric || typeof metric !== 'object' || !Object.hasOwn(metric, 'expression')) continue
        metric.expression = normalizeExpressionValue(metric.expression)
      }
    }
    if (Array.isArray(plan.experimentSpec.vectors)) {
      for (const vector of plan.experimentSpec.vectors) {
        if (!vector || typeof vector !== 'object') continue
        if (!Object.hasOwn(vector, 'bodyId')) vector.bodyId = plan.experimentSpec.bodyId
        for (const name of ['xExpression', 'yExpression']) {
          if (Object.hasOwn(vector, name)) vector[name] = normalizeExpressionValue(vector[name])
        }
        if (Object.hasOwn(vector, 'scale')) vector.scale = finiteNumberFromString(vector.scale)
      }
    }
    if (Array.isArray(plan.experimentSpec.additionalBodies)) {
      for (const body of plan.experimentSpec.additionalBodies) {
        if (!body || typeof body !== 'object') continue
        for (const name of ['xExpression', 'yExpression']) {
          if (Object.hasOwn(body, name)) body[name] = normalizeExpressionValue(body[name])
        }
      }
    }
    if (Array.isArray(plan.experimentSpec.constraints)) {
      for (const constraint of plan.experimentSpec.constraints) {
        if (!constraint || typeof constraint !== 'object') continue
        for (const name of ['anchorXExpression', 'anchorYExpression', 'restLengthExpression']) {
          if (Object.hasOwn(constraint, name)) constraint[name] = normalizeExpressionValue(constraint[name])
        }
      }
    }
    normalizeTimeExperimentIdentifierCase(plan.experimentSpec)
    repairMissingPendulumSupportHeights(plan.experimentSpec)
    const collisionTime = Array.isArray(plan.experimentSpec.metrics)
      ? plan.experimentSpec.metrics.find((metric) => metric?.id === 'tc')
      : undefined
    if (
      plan.experimentSpec.additionalBodies.length > 0 &&
      typeof collisionTime?.expression === 'string' &&
      plan.experimentSpec.durationExpression === collisionTime.expression &&
      plan.experimentSpec.durationExpression.length <= 235
    ) {
      plan.experimentSpec.durationExpression = `(${plan.experimentSpec.durationExpression})+3`
    }
  }
  if (plan.collisionSpec && typeof plan.collisionSpec === 'object') {
    for (const name of ['durationExpression', 'gravityXExpression', 'gravityYExpression', 'restitutionExpression']) {
      if (Object.hasOwn(plan.collisionSpec, name)) {
        plan.collisionSpec[name] = normalizeExpressionValue(plan.collisionSpec[name])
      }
    }
    if (Array.isArray(plan.collisionSpec.parameters)) {
      for (const parameter of plan.collisionSpec.parameters) {
        if (!parameter || typeof parameter !== 'object') continue
        for (const name of ['value', 'min', 'max', 'step']) {
          if (Object.hasOwn(parameter, name)) parameter[name] = finiteNumberFromString(parameter[name])
        }
      }
    }
    if (plan.collisionSpec.bounds && typeof plan.collisionSpec.bounds === 'object') {
      for (const name of ['xMinExpression', 'xMaxExpression', 'yMinExpression', 'yMaxExpression']) {
        if (Object.hasOwn(plan.collisionSpec.bounds, name)) {
          plan.collisionSpec.bounds[name] = normalizeExpressionValue(plan.collisionSpec.bounds[name])
        }
      }
    }
    if (Array.isArray(plan.collisionSpec.bodies)) {
      for (const body of plan.collisionSpec.bodies) {
        if (!body || typeof body !== 'object') continue
        for (const name of ['xExpression', 'yExpression', 'vxExpression', 'vyExpression', 'radiusExpression', 'massExpression']) {
          if (Object.hasOwn(body, name)) body[name] = normalizeExpressionValue(body[name])
        }
      }
    }
  }
  if (plan.dataChartSpec && typeof plan.dataChartSpec === 'object' && Array.isArray(plan.dataChartSpec.series)) {
    for (const series of plan.dataChartSpec.series) {
      if (!series || typeof series !== 'object') continue
      if (Array.isArray(series.values)) {
        series.values = series.values.map(finiteNumberFromString)
      }
      if (Array.isArray(series.points)) {
        for (const point of series.points) {
          if (!point || typeof point !== 'object') continue
          if (Object.hasOwn(point, 'x')) point.x = finiteNumberFromString(point.x)
          if (Object.hasOwn(point, 'y')) point.y = finiteNumberFromString(point.y)
        }
      }
    }
  }
  return plan
}

const SAFE_FUNCTION_NAMES = new Set(['sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'log', 'ln', 'min', 'max', 'pow', 'step'])
const RESERVED_PARAMETER_NAMES = new Set(['x', 'pi', 'e', ...SAFE_FUNCTION_NAMES])

function validateGenericFunctionSpec(spec) {
  if (spec.xMin >= spec.xMax) throw new Error('通用函数定义域下界必须小于上界。')
  const parameterNames = new Set()
  for (const parameter of spec.parameters) {
    if (RESERVED_PARAMETER_NAMES.has(parameter.id)) throw new Error(`通用函数参数与保留名称冲突：${parameter.id}`)
    if (parameterNames.has(parameter.id)) throw new Error(`通用函数参数 ID 重复：${parameter.id}`)
    parameterNames.add(parameter.id)
    if (parameter.min >= parameter.max || parameter.value < parameter.min || parameter.value > parameter.max) {
      throw new Error(`通用函数参数范围无效：${parameter.label}`)
    }
  }
  const identifiers = spec.expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
  for (const identifier of identifiers) {
    if (!RESERVED_PARAMETER_NAMES.has(identifier) && !parameterNames.has(identifier)) {
      throw new Error(`通用函数表达式包含未知标识符：${identifier}`)
    }
  }
}

function validateRelationSpec(spec) {
  if (!['parametric', 'polar', 'implicit'].includes(spec.mode)) throw new Error('二维关系曲线类型无效。')
  if (spec.xMin >= spec.xMax || spec.yMin >= spec.yMax) throw new Error('二维关系曲线视口上下界无效。')
  const reserved = new Set(['x', 'y', 't', 'theta', 'pi', 'e', ...SAFE_FUNCTION_NAMES])
  const parameterNames = new Set()
  for (const parameter of spec.parameters) {
    if (reserved.has(parameter.id)) throw new Error(`二维关系曲线参数与保留名称冲突：${parameter.id}`)
    if (parameterNames.has(parameter.id)) throw new Error(`二维关系曲线参数 ID 重复：${parameter.id}`)
    parameterNames.add(parameter.id)
    if (parameter.min >= parameter.max || parameter.value < parameter.min || parameter.value > parameter.max) {
      throw new Error(`二维关系曲线参数范围无效：${parameter.label}`)
    }
  }
  const inspect = (expression, variable) => {
    const identifiers = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
    for (const identifier of identifiers) {
      if (identifier === variable || parameterNames.has(identifier) || identifier === 'pi' || identifier === 'e' || SAFE_FUNCTION_NAMES.has(identifier)) continue
      throw new Error(`二维关系曲线表达式包含未知标识符：${identifier}`)
    }
  }
  if (spec.mode === 'parametric') {
    if (!Number.isFinite(spec.variableMin) || !Number.isFinite(spec.variableMax) || spec.variableMin >= spec.variableMax) throw new Error('参数曲线变量区间无效。')
    if (typeof spec.xExpression !== 'string' || typeof spec.yExpression !== 'string') throw new Error('参数曲线缺少 x(t) 或 y(t)。')
    if (spec.radialExpression !== undefined || spec.implicitExpression !== undefined) throw new Error('参数曲线包含其他模式的表达式。')
    inspect(spec.xExpression, 't'); inspect(spec.yExpression, 't')
  } else if (spec.mode === 'polar') {
    if (!Number.isFinite(spec.variableMin) || !Number.isFinite(spec.variableMax) || spec.variableMin >= spec.variableMax || spec.variableMin < -Math.PI * 20 || spec.variableMax > Math.PI * 20) throw new Error('极坐标角度区间无效。')
    if (typeof spec.radialExpression !== 'string') throw new Error('极坐标曲线缺少 r(theta)。')
    if (spec.xExpression !== undefined || spec.yExpression !== undefined || spec.implicitExpression !== undefined) throw new Error('极坐标曲线包含其他模式的表达式。')
    inspect(spec.radialExpression, 'theta')
  } else {
    if (typeof spec.implicitExpression !== 'string') throw new Error('隐函数曲线缺少 F(x,y)。')
    if (spec.variableMin !== undefined || spec.variableMax !== undefined || spec.xExpression !== undefined || spec.yExpression !== undefined || spec.radialExpression !== undefined) throw new Error('隐函数曲线包含其他模式的字段。')
    const identifiers = spec.implicitExpression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
    for (const identifier of identifiers) {
      if (identifier === 'x' || identifier === 'y' || parameterNames.has(identifier) || identifier === 'pi' || identifier === 'e' || SAFE_FUNCTION_NAMES.has(identifier)) continue
      throw new Error(`二维关系曲线表达式包含未知标识符：${identifier}`)
    }
  }
}

function validateTimeExperimentSpec(spec) {
  const primaryBodyId = spec.bodyId ?? 'primary'
  const additionalBodies = spec.additionalBodies ?? []
  const constraints = spec.constraints ?? []
  const parameterNames = new Set()
  for (const parameter of spec.parameters) {
    if (RESERVED_PARAMETER_NAMES.has(parameter.id) || parameter.id === 't') {
      throw new Error(`时间实验参数与保留名称冲突：${parameter.id}`)
    }
    if (parameterNames.has(parameter.id)) throw new Error(`时间实验参数 ID 重复：${parameter.id}`)
    parameterNames.add(parameter.id)
    if (parameter.min >= parameter.max || parameter.value < parameter.min || parameter.value > parameter.max) {
      throw new Error(`时间实验参数范围无效：${parameter.label}`)
    }
  }
  const metricNames = new Set()
  for (const metric of spec.metrics) {
    if (metricNames.has(metric.id)) throw new Error(`时间实验测量量 ID 重复：${metric.id}`)
    if (parameterNames.has(metric.id) || RESERVED_PARAMETER_NAMES.has(metric.id) || metric.id === 't') {
      throw new Error(`时间实验测量量 ID 与参数或保留名称冲突：${metric.id}`)
    }
    metricNames.add(metric.id)
  }
  const bodyNames = new Set([primaryBodyId])
  for (const body of additionalBodies) {
    if (bodyNames.has(body.id)) throw new Error(`时间实验运动物体 ID 重复：${body.id}`)
    bodyNames.add(body.id)
  }
  const vectorNames = new Set()
  for (const vector of spec.vectors) {
    if (vectorNames.has(vector.id)) throw new Error(`时间实验矢量 ID 重复：${vector.id}`)
    vectorNames.add(vector.id)
    if (vector.scale < 0.01 || vector.scale > 20) throw new Error(`时间实验矢量显示比例无效：${vector.label}`)
    const vectorBodyId = vector.bodyId ?? primaryBodyId
    if (!bodyNames.has(vectorBodyId)) throw new Error(`时间实验矢量绑定了不存在的运动物体：${vectorBodyId}`)
  }
  const constraintNames = new Set()
  for (const constraint of constraints) {
    if (constraintNames.has(constraint.id)) throw new Error(`时间实验约束 ID 重复：${constraint.id}`)
    constraintNames.add(constraint.id)
    if (!bodyNames.has(constraint.bodyId)) throw new Error(`时间实验约束绑定了不存在的运动物体：${constraint.bodyId}`)
  }
  const inspect = (expression, allowTime, allowMetrics = true) => {
    const identifiers = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
    for (const identifier of identifiers) {
      if (identifier === 't' && allowTime) continue
      if (!RESERVED_PARAMETER_NAMES.has(identifier) && !parameterNames.has(identifier) && !(allowMetrics && metricNames.has(identifier))) {
        throw new Error(`时间实验表达式包含未知标识符：${identifier}`)
      }
      if (identifier === 't' && !allowTime) throw new Error('持续时间表达式不能引用 t。')
    }
  }
  inspect(spec.durationExpression, false, false)
  inspect(spec.xExpression, true)
  inspect(spec.yExpression, true)
  for (const body of additionalBodies) {
    inspect(body.xExpression, true)
    inspect(body.yExpression, true)
  }
  for (const metric of spec.metrics) inspect(metric.expression, true)
  for (const vector of spec.vectors) {
    inspect(vector.xExpression, true)
    inspect(vector.yExpression, true)
  }
  for (const constraint of constraints) {
    inspect(constraint.anchorXExpression, true)
    inspect(constraint.anchorYExpression, true)
    inspect(constraint.restLengthExpression, true)
  }
  const metricGraph = new Map(spec.metrics.map((metric) => [
    metric.id,
    (metric.expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).filter((id) => metricNames.has(id)),
  ]))
  const visiting = new Set()
  const visited = new Set()
  const visitMetric = (id) => {
    if (visiting.has(id)) throw new Error('时间实验测量量之间存在循环依赖。')
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of metricGraph.get(id) ?? []) visitMetric(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of metricNames) visitMetric(id)
}

function validateGeometrySpec(spec) {
  const uniqueIds = (items, noun) => {
    const ids = new Set()
    for (const item of items) {
      if (ids.has(item.id)) throw new Error(`二维几何${noun} ID 重复：${item.id}`)
      ids.add(item.id)
    }
    return ids
  }
  const parameterNames = uniqueIds(spec.parameters, '参数')
  const geometryReserved = new Set(['pi', 'e', ...SAFE_FUNCTION_NAMES])
  for (const parameter of spec.parameters) {
    if (geometryReserved.has(parameter.id)) throw new Error(`二维几何参数与保留名称冲突：${parameter.id}`)
    if (parameter.min >= parameter.max || parameter.step <= 0 || parameter.value < parameter.min || parameter.value > parameter.max) {
      throw new Error(`二维几何参数范围无效：${parameter.label}`)
    }
  }
  const inspect = (expression, noun) => {
    const identifiers = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
    for (const identifier of identifiers) {
      if (!geometryReserved.has(identifier) && !parameterNames.has(identifier)) {
        throw new Error(`${noun}包含未知标识符：${identifier}`)
      }
    }
  }
  const pointNames = uniqueIds(spec.points, '点')
  const constructionDependencies = new Map()
  for (const point of spec.points) {
    if (point.construction) {
      const construction = point.construction
      let references = []
      if (construction.kind === 'midpoint') references = [construction.pointAId, construction.pointBId]
      else if (construction.kind === 'translation') {
        references = [construction.sourcePointId]
        inspect(construction.dxExpression, `构造点 ${point.label} 的水平平移量`)
        inspect(construction.dyExpression, `构造点 ${point.label} 的竖直平移量`)
      } else if (construction.kind === 'rotation') {
        references = [construction.sourcePointId, construction.centerPointId]
        inspect(construction.angleExpression, `构造点 ${point.label} 的旋转角`)
      } else if (construction.kind === 'dilation') {
        references = [construction.sourcePointId, construction.centerPointId]
        inspect(construction.scaleExpression, `构造点 ${point.label} 的位似比`)
      } else references = [construction.sourcePointId, construction.linePointAId, construction.linePointBId]
      if (references.some((id) => !pointNames.has(id) || id === point.id)) throw new Error(`构造点 ${point.label} 的点引用无效。`)
      constructionDependencies.set(point.id, references)
    } else {
      inspect(point.xExpression, `点 ${point.label} 的 x 表达式`)
      inspect(point.yExpression, `点 ${point.label} 的 y 表达式`)
      if (point.draggable && (!parameterNames.has(point.xExpression) || !parameterNames.has(point.yExpression))) {
        throw new Error(`可拖动点 ${point.label} 的坐标表达式必须分别是参数 ID。`)
      }
    }
    if (point.constraint) {
      const constraint = point.constraint
      const references = constraint.kind === 'circle'
        ? [constraint.centerPointId]
        : [constraint.pointAId, constraint.pointBId]
      if (references.some((id) => !pointNames.has(id) || id === point.id)) throw new Error(`约束点 ${point.label} 的点引用无效。`)
      if (constraint.kind === 'circle') inspect(constraint.radiusExpression, `约束点 ${point.label} 的圆半径`)
      constructionDependencies.set(point.id, [...(constructionDependencies.get(point.id) ?? []), ...references])
    }
  }
  const visiting = new Set()
  const visited = new Set()
  const visitPoint = (id) => {
    if (visiting.has(id)) throw new Error(`二维几何构造存在循环引用：${id}`)
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of constructionDependencies.get(id) ?? []) visitPoint(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of pointNames) visitPoint(id)
  uniqueIds(spec.connections, '连线')
  for (const connection of spec.connections) {
    if (!pointNames.has(connection.fromPointId) || !pointNames.has(connection.toPointId) || connection.fromPointId === connection.toPointId) {
      throw new Error(`二维几何连线 ${connection.label} 的端点引用无效。`)
    }
  }
  uniqueIds(spec.arcs, '圆弧')
  for (const arc of spec.arcs) {
    if (![arc.centerPointId, arc.startPointId, arc.endPointId].every((id) => pointNames.has(id))) {
      throw new Error(`二维几何圆弧 ${arc.label} 引用了不存在的点。`)
    }
  }
  uniqueIds(spec.polygons, '多边形')
  for (const polygon of spec.polygons) {
    if (new Set(polygon.pointIds).size !== polygon.pointIds.length || !polygon.pointIds.every((id) => pointNames.has(id))) {
      throw new Error(`二维几何多边形 ${polygon.label} 包含重复或不存在的点。`)
    }
  }
  uniqueIds(spec.measurements, '测量量')
  for (const measurement of spec.measurements) {
    if (!measurement.pointIds.every((id) => pointNames.has(id))) throw new Error(`二维几何测量量 ${measurement.label} 引用了不存在的点。`)
    const required = measurement.kind === 'distance' ? 2 : measurement.kind === 'angle' ? 3 : measurement.kind === 'area' ? 3 : 0
    if (measurement.kind === 'area' ? measurement.pointIds.length < required : measurement.kind !== 'expression' && measurement.pointIds.length !== required) {
      throw new Error(`二维几何测量量 ${measurement.label} 的点数量不正确。`)
    }
    if (measurement.kind === 'expression') {
      if (!measurement.expression) throw new Error(`二维几何测量量 ${measurement.label} 缺少表达式。`)
      inspect(measurement.expression, `测量量 ${measurement.label} 的表达式`)
    } else if (measurement.expression !== undefined) {
      throw new Error(`自动测量量 ${measurement.label} 不应包含表达式。`)
    }
  }
  uniqueIds(spec.loci ?? [], '轨迹')
  for (const locus of spec.loci ?? []) {
    if (!pointNames.has(locus.pointId)) throw new Error(`二维几何轨迹 ${locus.label} 引用了不存在的点。`)
    const parameter = spec.parameters.find((candidate) => candidate.id === locus.parameterId)
    if (!parameter) throw new Error(`二维几何轨迹 ${locus.label} 缺少驱动参数。`)
    if ((locus.min === undefined) !== (locus.max === undefined)) throw new Error(`二维几何轨迹 ${locus.label} 必须同时提供采样上下界。`)
    const minimum = locus.min ?? parameter.min
    const maximum = locus.max ?? parameter.max
    if (minimum >= maximum || minimum < parameter.min || maximum > parameter.max) throw new Error(`二维几何轨迹 ${locus.label} 的采样范围无效。`)
  }
}

function validateCollisionSpec(spec) {
  const parameterNames = new Set()
  for (const parameter of spec.parameters) {
    if (RESERVED_PARAMETER_NAMES.has(parameter.id) || parameter.id === 't') {
      throw new Error(`二维碰撞参数与保留名称冲突：${parameter.id}`)
    }
    if (parameterNames.has(parameter.id)) throw new Error(`二维碰撞参数 ID 重复：${parameter.id}`)
    parameterNames.add(parameter.id)
    if (parameter.min >= parameter.max || parameter.step <= 0 || parameter.value < parameter.min || parameter.value > parameter.max) {
      throw new Error(`二维碰撞参数范围无效：${parameter.label}`)
    }
  }
  const inspect = (expression, noun) => {
    const identifiers = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
    for (const identifier of identifiers) {
      if (!RESERVED_PARAMETER_NAMES.has(identifier) && !parameterNames.has(identifier)) {
        throw new Error(`${noun}包含未知标识符：${identifier}`)
      }
    }
  }
  inspect(spec.durationExpression, '实验时长表达式')
  inspect(spec.gravityXExpression, '水平重力表达式')
  inspect(spec.gravityYExpression, '竖直重力表达式')
  inspect(spec.restitutionExpression, '恢复系数表达式')
  for (const [name, expression] of Object.entries(spec.bounds)) inspect(expression, `碰撞边界 ${name} 表达式`)
  const bodyNames = new Set()
  for (const body of spec.bodies) {
    if (bodyNames.has(body.id)) throw new Error(`二维碰撞物体 ID 重复：${body.id}`)
    bodyNames.add(body.id)
    for (const [name, expression] of Object.entries(body)) {
      if (name.endsWith('Expression')) inspect(expression, `碰撞物体 ${body.label} 的 ${name}`)
    }
  }
}

function validateDataChartSpec(spec) {
  if (!['table', 'bar', 'line', 'scatter'].includes(spec.mode)) throw new Error('数据图表类型无效。')
  if (!Array.isArray(spec.series) || spec.series.length < 1 || spec.series.length > 4) throw new Error('数据图表必须包含 1–4 个系列。')
  const ids = new Set()
  for (const series of spec.series) {
    if (ids.has(series.id)) throw new Error(`数据系列 ID 重复：${series.id}`)
    ids.add(series.id)
  }
  const finite = (value) => Number.isFinite(value) && Math.abs(value) <= 1e9
  if (spec.mode === 'scatter') {
    if (spec.categories !== undefined) throw new Error('散点图不能包含类别数组。')
    for (const series of spec.series) {
      if (series.values !== undefined || !Array.isArray(series.points) || series.points.length < 1 || series.points.length > 60) {
        throw new Error(`散点系列 ${series.label} 必须且只能包含 1–60 个 points。`)
      }
      if (series.points.some((point) => !finite(point.x) || !finite(point.y))) throw new Error(`散点系列 ${series.label} 包含无效坐标。`)
    }
    return
  }
  if (!Array.isArray(spec.categories) || spec.categories.length < 1 || spec.categories.length > 24) throw new Error('表格、柱状图和折线图必须包含 1–24 个类别。')
  if (new Set(spec.categories).size !== spec.categories.length) throw new Error('数据图表类别名称不能重复。')
  if (spec.mode === 'line' && spec.categories.length < 2) throw new Error('折线图至少需要两个类别。')
  for (const series of spec.series) {
    if (series.points !== undefined || !Array.isArray(series.values) || series.values.length !== spec.categories.length) {
      throw new Error(`数据系列 ${series.label} 的 values 数量必须与类别数量一致。`)
    }
    if (series.values.some((value) => !finite(value))) throw new Error(`数据系列 ${series.label} 包含无效数值。`)
  }
}

export function validateGeneratedPlan(plan) {
  if (!validatePlanSchema(plan)) {
    const details = (validatePlanSchema.errors ?? [])
      .slice(0, 8)
      .map((error) => `${error.instancePath || '/'} ${error.message ?? '格式错误'}`)
      .join('；')
    throw new Error(`大模型返回的规划未通过 LessonPlan Schema：${details}`)
  }
  if (plan.status === 'matched' && plan.templateId === 'unsupported') {
    throw new Error('大模型返回的规划状态与模板不一致。')
  }
  if (plan.status === 'unsupported' && plan.templateId !== 'unsupported') {
    throw new Error('大模型返回的规划状态与模板不一致。')
  }
  if (plan.templateId === 'math.conic.ellipse-focus-sum') {
    if (plan.subject !== 'math') throw new Error('椭圆模板必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).some((name) => !['majorAxis', 'minorAxis'].includes(name))) {
      throw new Error('椭圆模板包含不适用的参数覆盖。')
    }
    const major = plan.parameterOverrides.majorAxis ?? 10
    const minor = plan.parameterOverrides.minorAxis ?? 6
    if (major < minor) throw new Error('大模型规划的长轴全长不能小于短轴全长。')
  }
  if (plan.templateId === 'math.function.quadratic-vertex') {
    if (plan.subject !== 'math') throw new Error('二次函数模板必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).some((name) => !['coefficientA', 'vertexH', 'vertexK'].includes(name))) {
      throw new Error('二次函数模板包含不适用的参数覆盖。')
    }
    const coefficientA = plan.parameterOverrides.coefficientA ?? 1
    if (Math.abs(coefficientA) < 0.1) throw new Error('大模型规划的二次项系数 a 不能为 0。')
  }
  if (plan.templateId === 'math.function.generic-2d') {
    if (plan.subject !== 'math') throw new Error('通用函数场景必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).length > 0) throw new Error('通用函数场景不能包含模板参数覆盖。')
    if (!plan.functionSpec) throw new Error('通用函数场景缺少函数规格。')
    validateGenericFunctionSpec(plan.functionSpec)
  } else if (plan.functionSpec !== undefined) {
    throw new Error('非通用函数计划不能包含函数规格。')
  }
  if (plan.templateId === 'math.curve.relation-2d') {
    if (plan.subject !== 'math') throw new Error('二维关系曲线必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).length > 0) throw new Error('二维关系曲线不能包含模板参数覆盖。')
    if (!plan.relationSpec) throw new Error('二维关系曲线缺少关系曲线规格。')
    validateRelationSpec(plan.relationSpec)
  } else if (plan.relationSpec !== undefined) {
    throw new Error('非二维关系曲线计划不能包含关系曲线规格。')
  }
  if (plan.templateId === 'math.geometry.primitives-2d') {
    if (plan.subject !== 'math') throw new Error('二维几何场景必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).length > 0) throw new Error('二维几何场景不能包含模板参数覆盖。')
    if (!plan.geometrySpec) throw new Error('二维几何场景缺少几何规格。')
    validateGeometrySpec(plan.geometrySpec)
  } else if (plan.geometrySpec !== undefined) {
    throw new Error('非二维几何计划不能包含几何规格。')
  }
  if (plan.templateId === 'experiment.motion.point-2d') {
    if (plan.subject !== 'physics' && plan.subject !== 'math') {
      throw new Error('二维参数轨迹运行时只支持数学或物理。')
    }
    if (Object.keys(plan.parameterOverrides).length > 0) throw new Error('时间实验不能包含模板参数覆盖。')
    if (!plan.experimentSpec) throw new Error('时间实验缺少实验规格。')
    validateTimeExperimentSpec(plan.experimentSpec)
  } else if (plan.experimentSpec !== undefined) {
    throw new Error('非时间实验计划不能包含实验规格。')
  }
  if (plan.templateId === 'physics.collision.discs-2d') {
    if (plan.subject !== 'physics') throw new Error('二维碰撞场景必须归类为物理。')
    if (Object.keys(plan.parameterOverrides).length > 0) throw new Error('二维碰撞场景不能包含模板参数覆盖。')
    if (!plan.collisionSpec) throw new Error('二维碰撞场景缺少碰撞规格。')
    validateCollisionSpec(plan.collisionSpec)
  } else if (plan.collisionSpec !== undefined) {
    throw new Error('非二维碰撞计划不能包含碰撞规格。')
  }
  if (plan.templateId === 'math.data.chart-2d') {
    if (plan.subject !== 'math') throw new Error('数据图表必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).length > 0) throw new Error('数据图表不能包含模板参数覆盖。')
    if (!plan.dataChartSpec) throw new Error('数据图表缺少图表规格。')
    validateDataChartSpec(plan.dataChartSpec)
  } else if (plan.dataChartSpec !== undefined) {
    throw new Error('非数据图表计划不能包含图表规格。')
  }
  if (plan.status === 'unsupported' && Object.keys(plan.parameterOverrides).length > 0) {
    throw new Error('不支持的计划不能包含参数覆盖。')
  }
  return plan
}

function assertContextualEditPlan(basePlan, editedPlan) {
  if (editedPlan.status !== 'matched') {
    throw new Error('二次编辑不能把当前可用场景改为不支持状态。')
  }
  if (editedPlan.templateId !== basePlan.templateId) {
    throw new Error('二次编辑不能更换当前场景的运行模板。')
  }
  if (editedPlan.subject !== basePlan.subject) {
    throw new Error('二次编辑不能改变当前场景的学科分类。')
  }
  return editedPlan
}

function contextualEditSchema(basePlan) {
  const schema = structuredClone(lessonPlanSchema)
  schema.properties.status = { const: 'matched' }
  schema.properties.subject = { const: basePlan.subject }
  schema.properties.templateId = { const: basePlan.templateId }
  if (basePlan.templateId === 'experiment.motion.point-2d') {
    schema.required = [...new Set([...schema.required, 'experimentSpec'])]
    delete schema.properties.functionSpec
    delete schema.properties.geometrySpec
    delete schema.properties.collisionSpec
    delete schema.properties.relationSpec
    delete schema.properties.dataChartSpec
  } else if (basePlan.templateId === 'math.function.generic-2d') {
    schema.required = [...new Set([...schema.required, 'functionSpec'])]
    delete schema.properties.experimentSpec
    delete schema.properties.geometrySpec
    delete schema.properties.collisionSpec
    delete schema.properties.relationSpec
    delete schema.properties.dataChartSpec
  } else if (basePlan.templateId === 'math.curve.relation-2d') {
    schema.required = [...new Set([...schema.required, 'relationSpec'])]
    delete schema.properties.functionSpec
    delete schema.properties.geometrySpec
    delete schema.properties.experimentSpec
    delete schema.properties.collisionSpec
    delete schema.properties.dataChartSpec
  } else if (basePlan.templateId === 'math.geometry.primitives-2d') {
    schema.required = [...new Set([...schema.required, 'geometrySpec'])]
    delete schema.properties.functionSpec
    delete schema.properties.experimentSpec
    delete schema.properties.collisionSpec
    delete schema.properties.relationSpec
    delete schema.properties.dataChartSpec
  } else if (basePlan.templateId === 'physics.collision.discs-2d') {
    schema.required = [...new Set([...schema.required, 'collisionSpec'])]
    delete schema.properties.functionSpec
    delete schema.properties.geometrySpec
    delete schema.properties.experimentSpec
    delete schema.properties.relationSpec
    delete schema.properties.dataChartSpec
  } else if (basePlan.templateId === 'math.data.chart-2d') {
    schema.required = [...new Set([...schema.required, 'dataChartSpec'])]
    delete schema.properties.functionSpec
    delete schema.properties.geometrySpec
    delete schema.properties.experimentSpec
    delete schema.properties.collisionSpec
    delete schema.properties.relationSpec
  } else {
    delete schema.properties.functionSpec
    delete schema.properties.experimentSpec
    delete schema.properties.geometrySpec
    delete schema.properties.collisionSpec
    delete schema.properties.relationSpec
    delete schema.properties.dataChartSpec
  }
  return schema
}

const GENERATION_CAPABILITY_TARGETS = Object.freeze({
  'math.curve.relation-2d': {
    subject: 'math', templateId: 'math.curve.relation-2d', spec: 'relationSpec',
  },
  'math.geometry.primitives-2d': {
    subject: 'math', templateId: 'math.geometry.primitives-2d', spec: 'geometrySpec',
  },
  'math.function.explicit-2d': {
    subject: 'math', templateId: 'math.function.generic-2d', spec: 'functionSpec',
  },
  'math.data.chart-2d': {
    subject: 'math', templateId: 'math.data.chart-2d', spec: 'dataChartSpec',
  },
  'math.geometry.parametric-trace-2d': {
    subject: 'math', templateId: 'experiment.motion.point-2d', spec: 'experimentSpec',
  },
  'physics.motion.point-2d': {
    subject: 'physics', templateId: 'experiment.motion.point-2d', spec: 'experimentSpec',
  },
  'physics.collision.discs-2d': {
    subject: 'physics', templateId: 'physics.collision.discs-2d', spec: 'collisionSpec',
  },
})

function generationCapabilityTarget(capabilityId) {
  if (capabilityId === undefined) return undefined
  if (typeof capabilityId !== 'string' || !Object.hasOwn(GENERATION_CAPABILITY_TARGETS, capabilityId)) {
    throw new Error(`生成请求包含未知能力 ID：${String(capabilityId)}`)
  }
  return { id: capabilityId, ...GENERATION_CAPABILITY_TARGETS[capabilityId] }
}

export function generationSchemaForCapability(capabilityId) {
  const target = generationCapabilityTarget(capabilityId)
  if (!target) return lessonPlanSchema
  const schema = structuredClone(lessonPlanSchema)
  schema.properties.status = { const: 'matched' }
  schema.properties.subject = { const: target.subject }
  schema.properties.templateId = { const: target.templateId }
  schema.properties.parameterOverrides = {
    type: 'object', additionalProperties: false, maxProperties: 0,
  }
  schema.required = [...new Set([...schema.required, target.spec])]
  for (const specName of ['functionSpec', 'relationSpec', 'geometrySpec', 'experimentSpec', 'collisionSpec', 'dataChartSpec']) {
    if (specName !== target.spec) delete schema.properties[specName]
  }
  return schema
}

function assertGenerationCapabilityPlan(target, plan) {
  if (!target) return plan
  if (
    plan.status !== 'matched' || plan.subject !== target.subject
    || plan.templateId !== target.templateId || !plan[target.spec]
  ) {
    throw new Error(`大模型规划超出已选能力 ${target.id} 的学科或运行时范围。`)
  }
  return plan
}

function contextualEditGuidance(basePlan) {
  if (basePlan.templateId === 'experiment.motion.point-2d') {
    return [
      '当前是 experiment.motion.point-2d 参数轨迹；必须完整保留并修改 experimentSpec，绝不能改用或返回 functionSpec。',
      'bodyLabel 和 additionalBodies[].label 是坐标前的短名称，画布会自动追加 (x,y)；要显示 P(x,y) 或 Q(x,y)，标签只写 P 或 Q。',
      'vectors[].labelMode 可为 full 或 value。full 显示“标签 数值 单位”；value 只显示数值，适合把“PF1 5.20 长度单位”简化为“5.20”。',
      '用户说“函数图像中的文字”仍指当前参数轨迹的标签，不代表要切换成 math.function.generic-2d。不得把 formula 或 conclusion 清空。',
    ].join('\n')
  }
  if (basePlan.templateId === 'math.function.generic-2d') {
    return '当前是 math.function.generic-2d；必须完整保留并修改 functionSpec，绝不能返回 experimentSpec，formula 不得为空。'
  }
  if (basePlan.templateId === 'math.curve.relation-2d') {
    return '当前是 math.curve.relation-2d；必须完整保留并修改 relationSpec。mode 为 parametric、polar 或 implicit；只保留当前模式适用的表达式字段，不得返回采样点、SVG 路径或其他规格。'
  }
  if (basePlan.templateId === 'math.geometry.primitives-2d') {
    return '当前是 math.geometry.primitives-2d；必须完整保留并修改 geometrySpec。点可以使用坐标表达式，或使用 midpoint、translation、rotation、reflection、dilation、projection 之一构造；坐标点可附加 line、segment、circle 拖动约束。loci 只声明目标点、驱动参数和可选范围，不得返回采样点或 SVG 路径。所有引用必须使用已声明 ID；不要返回 functionSpec 或 experimentSpec。'
  }
  if (basePlan.templateId === 'physics.collision.discs-2d') {
    return '当前是 physics.collision.discs-2d；必须完整保留并修改 collisionSpec。只能调整参数、圆盘初态、质量、半径、边界、重力、恢复系数和教学说明，不得返回代码或其他规格。'
  }
  if (basePlan.templateId === 'math.data.chart-2d') {
    return '当前是 math.data.chart-2d；必须完整保留并修改 dataChartSpec。table、bar、line 使用 categories 和每个系列的 values；scatter 不含 categories，每个系列只使用 points。不得返回 SVG、绘图代码或其他规格。'
  }
  return '当前是审核模板，只能修改该模板允许的参数覆盖和教学说明，不得增加 functionSpec、relationSpec、geometrySpec、experimentSpec、collisionSpec 或 dataChartSpec。'
}

function systemPrompt() {
  return [
    '你是 Word2HTML 的 K12 教学场景规划器，只负责选择已安装模板或填写其紧凑声明式规格，不生成 HTML、JavaScript 或其他代码。',
    '已安装模板之一是 math.conic.ellipse-focus-sum，用于演示椭圆上一点到两个焦点的距离之和不变。',
    '另一个已安装模板是 math.function.quadratic-vertex，用顶点式 y=a(x-h)^2+k 演示二次函数的开口、宽窄、顶点和对称轴变化。',
    '对于不能命中上述模板、但能写成单变量显式函数 y=f(x) 的数学内容，使用 math.function.generic-2d 并填写 functionSpec。',
    '通用表达式只能使用 x、参数 ID、数字、括号、+ - * / ^，以及 sin cos tan sqrt abs exp log ln min max pow step 和常量 pi e。step(z) 在 z>=0 时为 1，否则为 0。乘法必须显式写 *，不能写 2x。',
    '通用函数定义域必须在 [-50,50] 内且 xMin<xMax；parameters 最多 6 个，ID 使用 ASCII 字母开头，给出合理且有限的 value/min/max/step。无可调参数时返回空数组。',
    '对最多 4 个点随参数 t 变化的数学轨迹，或最多 4 个质点随时间运动且没有真实接触求解的物理实验（自由落体、抛体、单摆、水平弹簧振子等），使用 experiment.motion.point-2d 并填写 experimentSpec。主物体使用 bodyId/bodyLabel/xExpression/yExpression；其他物体放入 additionalBodies。',
    '实验表达式遵循同一数学白名单，可额外使用时间变量 t。durationExpression 只能引用参数且结果应为 0.2 到 60 秒；位置、测量量和矢量表达式可以引用 t、参数以及已声明的 metrics.id。可把碰撞时刻 tc、碰后速度等公共子表达式放入 metrics 并复用，但不得循环引用。',
    '所有表达式字段都必须是 JSON 字符串；常量表达式也要写成 "0"，不能写成数字 0。JSON 字符串的内容本身不能再带首尾引号，例如值应为 "L*sin(theta)"，不能让内容变成 L*sin(theta) 后面又多一个引号字符。',
    '实验必须返回 additionalBodies、vectors 和 constraints 数组；没有时返回空数组。每个矢量包含 id、label、xExpression、yExpression、scale、unit、bodyId，bodyId 必须绑定已声明物体；scale 只把物理量换算为坐标长度。display 可选 arrow 或 distance：力学量使用 arrow；几何距离使用 distance、scale=1，并令分量等于目标点坐标减起点坐标。labelMode 可选 full 或 value：full 显示标签、数值和单位，value 只显示数值。运动物体、矢量、约束均最多 4 个。',
    'constraints 用于可视化绳或弹簧，每项包含 id、label、type（rope 或 spring）、bodyId、anchorXExpression、anchorYExpression、restLengthExpression。三个长度/锚点表达式可引用 t、参数和 metrics。rope 的物体到锚点距离必须在整个运行区间等于 restLengthExpression；spring 的 restLengthExpression 表示自然长度，不要求当前长度恒定。',
    '自由落体建议使用 durationExpression="sqrt(2*h0/g)"、xExpression="0"、yExpression="max(0,h0-0.5*g*t^2)"，提供高度与速度测量量，并返回速度矢量 vx="0"、vy="0-g*t"、scale=0.1、unit="m/s"，以及重力加速度矢量 ax="0"、ay="0-g"、scale=0.15、unit="m/s^2"。parameters 最多 6 个、metrics 最多 4 个。',
    '一维弹性碰撞可令 tc=(x2-x1)/(u1-u2)，碰后速度 v1=((m1-m2)*u1+2*m2*u2)/(m1+m2)、v2=(2*m1*u1+(m2-m1)*u2)/(m1+m2)；位置用 min(t,tc) 与 max(0,t-tc) 分段，速度矢量用 step(t-tc) 切换。durationExpression 必须比 tc 至少多 2 秒，以展示碰后运动。参数范围尽量保证 u1>u2、x2>x1，运行时会拒绝除零组合。',
    '小角度单摆可把 theta=theta0*cos(sqrt(g/L)*t) 放入 metrics，物体位置写成 x=L*sin(theta)、y=H-L*cos(theta)，durationExpression="4*pi*sqrt(L/g)" 以展示两个周期，锚点为 (0,H)，rope 的自然长度写成 L；theta0 建议使用弧度且范围不超过 0.35。未要求速度等矢量时不要自行添加；若要求单摆速度，必须把 thetaDot=0-theta0*sqrt(g/L)*sin(sqrt(g/L)*t) 也声明为 metric，再使用 vx=L*cos(theta)*thetaDot、vy=L*sin(theta)*thetaDot。水平弹簧振子可写 x=A*cos(w*t)、y=0，固定点放在运动范围左侧，spring 自然长度为固定点到平衡位置的距离。',
    '两个独立钟摆不要使用 H1/H2 高度参数，避免浪费 6 个参数的额度。推荐共享 g，并声明 L1、L2、theta01、theta02 共 5 个可调参数；metrics 使用 theta1=theta01*cos(sqrt(g/L1)*t)、theta2=theta02*cos(sqrt(g/L2)*t)，两个摆球位置分别为 x=-2+L1*sin(theta1), y=0-L1*cos(theta1) 和 x=2+L2*sin(theta2), y=0-L2*cos(theta2)，两个 rope 固定点分别为 (-2,0)、(2,0)，自然长度为 L1、L2；durationExpression="4*pi*sqrt(max(L1,L2)/g)"。',
    '参数轨迹的 parameterOverrides 必须为空；数学轨迹的 subject 为 math，物理运动的 subject 为 physics。化学、地理以及超出当前已安装运行时边界的内容返回 unsupported。',
    '椭圆模板的 majorAxis 和 minorAxis 表示长轴全长与短轴全长；没有明确数值时省略对应覆盖项，使用本地默认值。',
    '二次函数模板的 coefficientA、vertexH、vertexK 对应 a、h、k；a 不能为 0，没有明确数值时省略。',
    '二维几何构造、变换和轨迹使用 math.geometry.primitives-2d 并填写 geometrySpec；点可直接使用 xExpression/yExpression，也可通过 construction 声明中点、平移、旋转、轴对称、位似或垂足。坐标点可通过 constraint 约束在圆、直线或线段上。loci 只声明目标点、驱动参数和可选范围，浏览器固定采样 241 点；绝不能返回采样点、SVG 路径或代码。所有引用必须指向已声明 ID。',
    '参数方程、极坐标方程或隐函数等值线使用 math.curve.relation-2d 并填写 relationSpec。parametric 只填写 t 区间及 xExpression/yExpression；polar 只填写 theta 区间及 radialExpression；implicit 只填写 implicitExpression 和二维视口。不要返回采样点或 SVG 路径。',
    '需要圆形物体之间及其与矩形边界真实接触、反弹或多体碰撞时，使用 physics.collision.discs-2d 并填写 collisionSpec；运行时会本地求解冲量和穿透修正，不要在 experimentSpec 中手写分段碰撞。',
    '数据表、统计表、柱状图、折线图或散点图使用 math.data.chart-2d 并填写 dataChartSpec。table、bar、line 必须提供 categories，每个系列只提供与类别等长的 values；scatter 不提供 categories，每个系列只提供 points。系列最多 4 个、类别最多 24 个、每个散点系列最多 60 个点；不得返回 SVG 或绘图代码。',
    '椭圆或二次函数模板不填写任何动态规格；通用函数只填写 functionSpec；关系曲线只填写 relationSpec；二维几何只填写 geometrySpec；数据图表只填写 dataChartSpec；时间实验只填写 experimentSpec；二维碰撞只填写 collisionSpec。schemaVersion 必须是字符串 "0.1"。',
    '只调用 emit_lesson_plan 工具，不要另外解释。',
  ].join('\n')
}

function focusedSystemPrompt(target) {
  if (!target) return systemPrompt()
  const common = [
    '你是 Word2HTML 的 K12 教学场景规划器。只返回已指定运行时的紧凑 LessonPlan，不生成 HTML、JavaScript、URL 或其他代码。',
    `已由本地能力注册表确定：能力 ${target.id}，subject=${target.subject}，templateId=${target.templateId}。不得改变这三个选择，也不得返回 unsupported。`,
    `schemaVersion 必须是字符串 "0.1"。${target.spec === 'parameterOverrides' ? '只修改模板允许的 parameterOverrides。' : 'parameterOverrides 必须为空对象。'}只调用 emit_lesson_plan 工具，不要另外解释。`,
  ]
  if (target.spec === 'parameterOverrides') {
    return [...common,
      target.templateId === 'math.conic.ellipse-focus-sum'
        ? '椭圆模板只允许 majorAxis 和 minorAxis，二者分别表示长轴全长与短轴全长，且长轴不得小于短轴。'
        : '二次函数模板只允许 coefficientA、vertexH 和 vertexK；coefficientA 不能为 0。',
      '不要返回 functionSpec、relationSpec、geometrySpec、experimentSpec、collisionSpec 或 dataChartSpec。',
    ].join('\n')
  }
  if (target.spec === 'functionSpec') {
    return [...common,
      '填写完整 functionSpec。表达式是单变量显函数 y=f(x)，只能使用 x、参数 ID、数字、括号、+ - * / ^、sin cos tan sqrt abs exp log ln min max pow step 和常量 pi e；乘法必须显式写 *。',
      '定义域必须在 [-50,50] 内且 xMin<xMax。parameters 最多 6 个，ID 使用 ASCII 字母开头；每项给出有限且合理的 value、min、max、step。formula 不得为空。',
      '不要返回 experimentSpec，也不要增加白名单外字段。',
    ].join('\n')
  }
  if (target.spec === 'relationSpec') {
    return [...common,
      '填写完整 relationSpec 的公共字段：mode、formula、conclusion、parameters、xMin、xMax、yMin、yMax。parameters 最多 8 个，ID 不得使用 x、y、t、theta 或数学函数名。视口边界位于 [-100,100] 且上下界递增。',
      'mode="parametric" 时额外且只填写 variableMin、variableMax、xExpression、yExpression，表达式变量为 t。mode="polar" 时额外且只填写 variableMin、variableMax、radialExpression，表达式变量为 theta，角度使用弧度。mode="implicit" 时额外且只填写 implicitExpression，内容表示 F(x,y)=0。',
      '表达式只能使用当前模式变量、参数 ID、数字、括号、+ - * / ^、sin cos tan sqrt abs exp log ln min max pow step 和常量 pi e；乘法必须显式写 *。不要返回绘制点、SVG 路径、HTML、JavaScript 或其他规格。',
    ].join('\n')
  }
  if (target.spec === 'geometrySpec') {
    return [...common,
      '填写完整 geometrySpec：formula、conclusion、parameters、points、connections、arcs、polygons、measurements、loci 均必须存在；空集合返回空数组。',
      '每个点必须且只能采用一种定义：直接提供 xExpression/yExpression；或提供 construction。construction.kind 可为 midpoint(pointAId,pointBId)、translation(sourcePointId,dxExpression,dyExpression)、rotation(sourcePointId,centerPointId,angleExpression)、reflection(sourcePointId,linePointAId,linePointBId)、dilation(sourcePointId,centerPointId,scaleExpression)、projection(sourcePointId,linePointAId,linePointBId)。旋转角使用弧度；构造引用不得循环。',
      '只有坐标点可 draggable；可拖动点必须令 xExpression、yExpression 分别直接等于两个坐标参数 ID。坐标点可选 constraint：line/segment 使用 pointAId、pointBId，circle 使用 centerPointId、radiusExpression。构造点不可再附加 constraint。',
      'loci 每项只声明 id、label、pointId、parameterId，以及可同时省略的 min/max。parameterId 必须是已有参数；浏览器按范围固定采样 241 点。绝不能返回采样点、SVG 路径或逐帧数据。参数最多 12 个，点 1–12 个，轨迹 4 条，连线 16 条，圆弧 6 条，多边形 4 个，测量量 6 项。',
      'connections.kind 只能是 segment、ray、vector。圆弧引用中心、起点方向和终点方向。distance 恰好引用 2 点，angle 恰好引用 3 点且中间点是顶点，area 至少引用 3 点；仅 expression 测量填写 expression。',
      '不要返回 functionSpec 或 experimentSpec，也不要增加 HTML、JavaScript 或白名单外字段。',
    ].join('\n')
  }
  if (target.spec === 'collisionSpec') {
    return [...common,
      '填写完整 collisionSpec：durationExpression、gravityXExpression、gravityYExpression、restitutionExpression、formula、conclusion、parameters、bounds、bodies 均必须存在。',
      '表达式只能引用 parameters 中的 ID 和安全数学函数，且常量也必须写成字符串。parameters 最多 12 个；bodies 必须为 2–8 个圆盘，每个圆盘声明初始 x/y、vx/vy、radius 和 mass 表达式。',
      '用户要求某个圆盘的质量或速度可调时，必须为该圆盘的 mass、vx、vy 分别建立明确的独立参数并在对应表达式中引用；多个圆盘均可调时不得只给第一个圆盘参数。',
      '时长应为 0.2–20 秒，恢复系数为 0–1，矩形边界宽高为 2–100，半径至少 0.2 且不超过短边四分之一，质量为 0.05–1000。初始圆盘不得重叠或越界，预计速度要温和。',
      'bounds 的四个表达式分别是 xMinExpression、xMaxExpression、yMinExpression、yMaxExpression。不要返回逐帧轨迹、碰撞时刻、HTML、JavaScript、experimentSpec 或其他白名单外字段。',
    ].join('\n')
  }
  if (target.spec === 'dataChartSpec') {
    return [...common,
      '填写完整 dataChartSpec：mode、formula、conclusion、xLabel、yLabel、unit、series 必须存在。mode 只能为 table、bar、line 或 scatter。',
      'table、bar、line 必须提供 1–24 个不重复 categories；每个系列只提供 values，数量必须与 categories 相同。line 至少两个类别。',
      'scatter 不得提供 categories；每个系列只提供 1–60 个 {x,y} points。所有数据必须是绝对值不超过 1e9 的有限 JSON 数字。系列为 1–4 个，ID 使用 ASCII 字母开头。',
      '只表达用户给出的数据；不要捏造额外样本、回归结果或统计结论，不要返回 SVG、HTML、JavaScript、采样路径或其他规格。',
    ].join('\n')
  }
  const experiment = [
    ...common,
    '填写完整 experimentSpec。主物体使用 bodyId、bodyLabel、xExpression、yExpression，其他物体放入 additionalBodies；总运动物体最多 4 个。',
    '所有表达式字段必须是 JSON 字符串；可使用 t、已声明参数和 metrics，以及 sin cos tan sqrt abs exp log ln min max pow step、pi、e。durationExpression 不得引用 t，结果必须为 0.2–60 秒。',
    'parameters 最多 6 个、metrics 最多 4 个、vectors 最多 4 个、constraints 最多 4 个。additionalBodies、vectors、constraints 没有内容时也返回空数组。所有 bodyId 和表达式标识符必须引用已声明 ID。',
    'distance 矢量使用 display="distance"、scale=1；普通力学矢量使用 display="arrow"。labelMode 可为 full 或 value。绳和弹簧约束只使用 rope 或 spring。',
  ]
  if (target.subject === 'math') {
    experiment.push('当前是数学参数轨迹。用参数 t 表示动点和轨迹，可用 distance 矢量连接几何点并用 metrics 表示距离或不变量；不得写物理实验说明。')
  } else {
    experiment.push(
      '当前是物理质点实验。自由落体、抛体、单摆、弹簧振子和解析式一维运动均用声明式轨迹、矢量与约束表达；真实二维接触碰撞应使用专用 collisionSpec，不得在这里伪造接触求解器或刚体原语。',
      '单摆用 theta=theta0*cos(sqrt(g/L)*t)，rope 长度应与 L 一致；多个独立单摆优先共享 g，避免无必要的高度参数。碰撞公共表达式可放入 metrics，但不得循环引用。',
    )
  }
  return experiment.join('\n')
}

export async function generateLessonPlan(prompt, options = {}) {
  const config = options.config ?? readMinimaxConfig(options.environment)
  if (!config.configured) throw new Error('模型服务未配置：请设置统一模型配置或 MINIMAX_API_KEY。')

  const client = options.client ?? createModelProviderClient(config, { fetchImpl: options.fetchImpl })

  const capabilityTarget = generationCapabilityTarget(options.capabilityId)
  const tool = {
    name: TOOL_NAME,
    description: '返回紧凑的 Word2HTML LessonPlan 0.1。',
    input_schema: generationSchemaForCapability(options.capabilityId),
  }
  const userMessage = { role: 'user', content: [{ type: 'text', text: prompt }] }
  const request = (messages) => client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    thinking: { type: 'disabled' },
    system: focusedSystemPrompt(capabilityTarget),
    messages,
    tools: [tool],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  })

  const responses = [await request([userMessage])]
  let plan
  let firstValidationError
  try {
    plan = assertGenerationCapabilityPlan(capabilityTarget, validateGeneratedPlan(
      normalizeGeneratedPlan(extractPlanFromModelResponse(responses[0])),
    ))
  } catch (error) {
    firstValidationError = error instanceof Error ? error.message : '首次规划校验失败。'
    const feedback = [
      '上一次 LessonPlan 未通过本地校验。请保持用户原始教学目标，只修正规划，不要解释。',
      `校验错误：${firstValidationError.slice(0, 1800)}`,
      '所有引用必须指向已声明 ID；不得增加 HTML、JavaScript、URL 或白名单外表达式。',
    ].join('\n')
    const toolUse = responses[0]?.content?.find(
      (block) => block?.type === 'tool_use' && block?.name === TOOL_NAME && typeof block.id === 'string',
    )
    const repairMessages = toolUse
      ? [
          userMessage,
          { role: 'assistant', content: responses[0].content },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: feedback }],
          },
        ]
      : [{
          role: 'user',
          content: [{ type: 'text', text: `${prompt}\n\n${feedback}` }],
        }]
    responses.push(await request(repairMessages))
    try {
      plan = assertGenerationCapabilityPlan(capabilityTarget, validateGeneratedPlan(
        normalizeGeneratedPlan(extractPlanFromModelResponse(responses[1])),
      ))
    } catch (error) {
      const repairError = error instanceof Error ? error.message : '纠错规划校验失败。'
      throw new Error(`大模型自动纠错后规划仍无效：${repairError}（首次错误：${firstValidationError}）`)
    }
  }

  const totalUsage = (name) => {
    const values = responses
      .map((response) => response.usage?.[name])
      .filter((value) => Number.isFinite(value))
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : undefined
  }
  const finalResponse = responses.at(-1)
  return {
    apiVersion: GENERATION_API_VERSION,
    plan,
    usage: {
      inputTokens: totalUsage('input_tokens'),
      cachedInputTokens: totalUsage('cache_read_input_tokens'),
      outputTokens: totalUsage('output_tokens'),
      modelCalls: responses.length,
      repaired: responses.length > 1,
    },
    provider: { name: config.provider, model: finalResponse?.model ?? config.model },
  }
}

export async function editLessonPlan(instruction, basePlan, options = {}) {
  const config = options.config ?? readMinimaxConfig(options.environment)
  if (!config.configured) throw new Error('模型服务未配置：请设置统一模型配置或 MINIMAX_API_KEY。')
  let normalizedBase
  try {
    normalizedBase = validateGeneratedPlan(normalizeGeneratedPlan(basePlan))
  } catch {
    throw new Error('二次编辑请求中的当前 LessonPlan 无效。')
  }
  if (normalizedBase.status !== 'matched') throw new Error('只有可运行场景可以进行二次编辑。')

  const client = options.client ?? createModelProviderClient(config, { fetchImpl: options.fetchImpl })
  const tool = {
    name: TOOL_NAME,
    description: '返回基于当前场景修改后的完整 Word2HTML LessonPlan 0.1。',
    input_schema: contextualEditSchema(normalizedBase),
  }
  const editText = [
    '任务类型：基于当前场景进行二次编辑。',
    `当前 LessonPlan：${JSON.stringify(normalizedBase)}`,
    `用户修改要求：${instruction}`,
    '返回修改后的完整 LessonPlan，不要只返回补丁。保留用户未要求修改的字段、对象 ID、参数和教学含义。',
    '不得改变 templateId、subject 或 status；如要求超出当前模板能力，也应尽量保持当前计划，不得伪造代码或新渲染器。',
    '参数数值和纯外观设置应由应用本地面板处理；这里仅处理表达式、对象、测量量、矢量、约束、公式和说明等结构修改。',
    contextualEditGuidance(normalizedBase),
  ].join('\n')
  const userMessage = { role: 'user', content: [{ type: 'text', text: editText }] }
  const request = (messages) => client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    thinking: { type: 'disabled' },
    system: focusedSystemPrompt({
      id: `context:${normalizedBase.templateId}`,
      subject: normalizedBase.subject,
      templateId: normalizedBase.templateId,
      spec: normalizedBase.templateId === 'math.function.generic-2d' ? 'functionSpec'
        : normalizedBase.templateId === 'math.curve.relation-2d' ? 'relationSpec'
        : normalizedBase.templateId === 'math.geometry.primitives-2d' ? 'geometrySpec'
        : normalizedBase.templateId === 'experiment.motion.point-2d' ? 'experimentSpec'
        : normalizedBase.templateId === 'physics.collision.discs-2d' ? 'collisionSpec'
        : normalizedBase.templateId === 'math.data.chart-2d' ? 'dataChartSpec' : 'parameterOverrides',
    }),
    messages,
    tools: [tool],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  })

  const responses = [await request([userMessage])]
  let plan
  let firstValidationError
  try {
    plan = assertContextualEditPlan(
      normalizedBase,
      validateGeneratedPlan(normalizeGeneratedPlan(extractPlanFromModelResponse(responses[0]))),
    )
  } catch (error) {
    firstValidationError = error instanceof Error ? error.message : '首次二次编辑校验失败。'
    const feedback = [
      '上一次二次编辑结果未通过本地校验。只修正错误，不要解释。',
      `校验错误：${firstValidationError.slice(0, 1800)}`,
      '必须保持当前 templateId、subject 和 matched 状态；所有引用必须指向已声明 ID。',
    ].join('\n')
    const toolUse = responses[0]?.content?.find(
      (block) => block?.type === 'tool_use' && block?.name === TOOL_NAME && typeof block.id === 'string',
    )
    const repairMessages = toolUse
      ? [
          userMessage,
          { role: 'assistant', content: responses[0].content },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: feedback }],
          },
        ]
      : [{ role: 'user', content: [{ type: 'text', text: `${editText}\n\n${feedback}` }] }]
    responses.push(await request(repairMessages))
    try {
      plan = assertContextualEditPlan(
        normalizedBase,
        validateGeneratedPlan(normalizeGeneratedPlan(extractPlanFromModelResponse(responses[1]))),
      )
    } catch (error) {
      const repairError = error instanceof Error ? error.message : '二次编辑纠错校验失败。'
      throw new Error(`大模型自动纠错后二次编辑仍无效：${repairError}（首次错误：${firstValidationError}）`)
    }
  }

  const totalUsage = (name) => {
    const values = responses
      .map((response) => response.usage?.[name])
      .filter((value) => Number.isFinite(value))
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : undefined
  }
  const finalResponse = responses.at(-1)
  return {
    apiVersion: GENERATION_API_VERSION,
    plan,
    usage: {
      inputTokens: totalUsage('input_tokens'),
      cachedInputTokens: totalUsage('cache_read_input_tokens'),
      outputTokens: totalUsage('output_tokens'),
      modelCalls: responses.length,
      repaired: responses.length > 1,
    },
    provider: { name: config.provider, model: finalResponse?.model ?? config.model },
  }
}

export async function repairLessonPlan(prompt, previousPlan, validationError, options = {}) {
  const config = options.config ?? readMinimaxConfig(options.environment)
  if (!config.configured) throw new Error('模型服务未配置：请设置统一模型配置或 MINIMAX_API_KEY。')
  if (typeof validationError !== 'string' || !validationError.trim() || validationError.length > 2400) {
    throw new Error('自动纠错请求缺少有效的本地校验错误。')
  }
  let normalizedPrevious
  try {
    normalizedPrevious = validateGeneratedPlan(normalizeGeneratedPlan(previousPlan))
  } catch {
    throw new Error('自动纠错请求中的上一版 LessonPlan 无效。')
  }
  let normalizedBase
  if (options.basePlan !== undefined) {
    try {
      normalizedBase = validateGeneratedPlan(normalizeGeneratedPlan(options.basePlan))
    } catch {
      throw new Error('二次编辑纠错请求中的当前 LessonPlan 无效。')
    }
  }
  const capabilityTarget = normalizedBase ? undefined : generationCapabilityTarget(options.capabilityId)
  const client = options.client ?? createModelProviderClient(config, { fetchImpl: options.fetchImpl })
  const feedback = [
    normalizedBase ? '任务类型：修正基于当前场景的二次编辑结果。' : '任务类型：修正首次场景规划结果。',
    normalizedBase ? `编辑前 LessonPlan：${JSON.stringify(normalizedBase)}` : null,
    `用户${normalizedBase ? '修改要求' : '原始教学目标'}：${prompt}`,
    `上一版 LessonPlan：${JSON.stringify(normalizedPrevious)}`,
    `浏览器本地校验错误：${validationError.trim()}`,
    normalizedBase
      ? '请保持编辑要求及未要求修改的字段，只修正导致校验失败的字段；不得改变 templateId、subject 或 matched 状态。不要解释，不要生成代码。'
      : '请保持原始目标，只修正导致校验失败的字段。不要解释，不要生成代码。',
  ].filter(Boolean).join('\n')
  const response = await client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    thinking: { type: 'disabled' },
    system: normalizedBase ? focusedSystemPrompt({
      id: `context:${normalizedBase.templateId}`,
      subject: normalizedBase.subject,
      templateId: normalizedBase.templateId,
      spec: normalizedBase.templateId === 'math.function.generic-2d' ? 'functionSpec'
        : normalizedBase.templateId === 'math.curve.relation-2d' ? 'relationSpec'
        : normalizedBase.templateId === 'math.geometry.primitives-2d' ? 'geometrySpec'
        : normalizedBase.templateId === 'experiment.motion.point-2d' ? 'experimentSpec'
        : normalizedBase.templateId === 'physics.collision.discs-2d' ? 'collisionSpec'
        : normalizedBase.templateId === 'math.data.chart-2d' ? 'dataChartSpec' : 'parameterOverrides',
    }) : focusedSystemPrompt(capabilityTarget),
    messages: [{ role: 'user', content: [{ type: 'text', text: feedback }] }],
    tools: [{
      name: TOOL_NAME,
      description: '返回修正后的紧凑 Word2HTML LessonPlan 0.1。',
      input_schema: normalizedBase
        ? contextualEditSchema(normalizedBase)
        : generationSchemaForCapability(options.capabilityId),
    }],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  })
  let plan
  try {
    plan = assertGenerationCapabilityPlan(capabilityTarget, validateGeneratedPlan(
      normalizeGeneratedPlan(extractPlanFromModelResponse(response)),
    ))
    if (normalizedBase) plan = assertContextualEditPlan(normalizedBase, plan)
  } catch (error) {
    const message = error instanceof Error ? error.message : '纠错规划校验失败。'
    throw new Error(`大模型自动纠错后规划仍无效：${message}`)
  }
  return {
    apiVersion: GENERATION_API_VERSION,
    plan,
    usage: {
      inputTokens: response.usage?.input_tokens,
      cachedInputTokens: response.usage?.cache_read_input_tokens,
      outputTokens: response.usage?.output_tokens,
      modelCalls: 1,
      repaired: true,
    },
    provider: { name: config.provider, model: response.model ?? config.model },
  }
}
