import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import Ajv2020 from 'ajv/dist/2020.js'

const schemaUrl = new URL('../src/schema/lesson-plan.schema.json', import.meta.url)
export const lessonPlanSchema = JSON.parse(readFileSync(schemaUrl, 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: true })
const validatePlanSchema = ajv.compile(lessonPlanSchema)
const TOOL_NAME = 'emit_lesson_plan'
export const GENERATION_API_VERSION = 'lesson-plan-0.9'

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
  const maxTokens = Number(environment.MINIMAX_MAX_TOKENS ?? 2048)
  const timeout = Number(environment.MINIMAX_TIMEOUT_MS ?? 120000)
  const temperature = Number(environment.MINIMAX_TEMPERATURE ?? 1)
  return {
    apiKey: environment.MINIMAX_API_KEY?.trim() ?? '',
    baseURL: (environment.MINIMAX_BASE_URL?.trim() || 'https://api.minimaxi.com/anthropic').replace(/\/+$/, ''),
    model: environment.MINIMAX_MODEL?.trim() || 'MiniMax-M3',
    maxTokens: Number.isFinite(maxTokens) ? Math.min(4096, Math.max(256, maxTokens)) : 2048,
    timeout: Number.isFinite(timeout) ? Math.min(600000, Math.max(10000, timeout)) : 120000,
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : 1,
  }
}

export function publicModelStatus(environment = process.env) {
  const config = readMinimaxConfig(environment)
  return {
    configured: Boolean(config.apiKey),
    provider: 'MiniMax',
    model: config.model,
    baseURL: config.baseURL,
  }
}

function parseJsonText(value) {
  const withoutFence = value.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('MiniMax 未返回 LessonPlan 工具调用或 JSON 对象。')
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

export function validateGeneratedPlan(plan) {
  if (!validatePlanSchema(plan)) {
    const details = (validatePlanSchema.errors ?? [])
      .slice(0, 8)
      .map((error) => `${error.instancePath || '/'} ${error.message ?? '格式错误'}`)
      .join('；')
    throw new Error(`MiniMax 返回的规划未通过 LessonPlan Schema：${details}`)
  }
  if (plan.status === 'matched' && plan.templateId === 'unsupported') {
    throw new Error('MiniMax 返回的规划状态与模板不一致。')
  }
  if (plan.status === 'unsupported' && plan.templateId !== 'unsupported') {
    throw new Error('MiniMax 返回的规划状态与模板不一致。')
  }
  if (plan.templateId === 'math.conic.ellipse-focus-sum') {
    if (plan.subject !== 'math') throw new Error('椭圆模板必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).some((name) => !['majorAxis', 'minorAxis'].includes(name))) {
      throw new Error('椭圆模板包含不适用的参数覆盖。')
    }
    const major = plan.parameterOverrides.majorAxis ?? 10
    const minor = plan.parameterOverrides.minorAxis ?? 6
    if (major < minor) throw new Error('MiniMax 规划的长轴全长不能小于短轴全长。')
  }
  if (plan.templateId === 'math.function.quadratic-vertex') {
    if (plan.subject !== 'math') throw new Error('二次函数模板必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).some((name) => !['coefficientA', 'vertexH', 'vertexK'].includes(name))) {
      throw new Error('二次函数模板包含不适用的参数覆盖。')
    }
    const coefficientA = plan.parameterOverrides.coefficientA ?? 1
    if (Math.abs(coefficientA) < 0.1) throw new Error('MiniMax 规划的二次项系数 a 不能为 0。')
  }
  if (plan.templateId === 'math.function.generic-2d') {
    if (plan.subject !== 'math') throw new Error('通用函数场景必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).length > 0) throw new Error('通用函数场景不能包含模板参数覆盖。')
    if (!plan.functionSpec) throw new Error('通用函数场景缺少函数规格。')
    validateGenericFunctionSpec(plan.functionSpec)
  } else if (plan.functionSpec !== undefined) {
    throw new Error('非通用函数计划不能包含函数规格。')
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
  } else if (basePlan.templateId === 'math.function.generic-2d') {
    schema.required = [...new Set([...schema.required, 'functionSpec'])]
    delete schema.properties.experimentSpec
  } else {
    delete schema.properties.functionSpec
    delete schema.properties.experimentSpec
  }
  return schema
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
  return '当前是审核模板，只能修改该模板允许的参数覆盖和教学说明，不得增加 functionSpec 或 experimentSpec。'
}

function systemPrompt() {
  return [
    '你是 Word2HTML 的 K12 教学场景规划器，只负责选择模板或描述安全的二维显式函数，不生成 HTML、JavaScript 或其他代码。',
    '已安装模板之一是 math.conic.ellipse-focus-sum，用于演示椭圆上一点到两个焦点的距离之和不变。',
    '另一个已安装模板是 math.function.quadratic-vertex，用顶点式 y=a(x-h)^2+k 演示二次函数的开口、宽窄、顶点和对称轴变化。',
    '对于不能命中上述模板、但能写成单变量显式函数 y=f(x) 的数学内容，使用 math.function.generic-2d 并填写 functionSpec。',
    '通用表达式只能使用 x、参数 ID、数字、括号、+ - * / ^，以及 sin cos tan sqrt abs exp log ln min max pow step 和常量 pi e。step(z) 在 z>=0 时为 1，否则为 0。乘法必须显式写 *，不能写 2x。',
    '通用函数定义域必须在 [-50,50] 内且 xMin<xMax；parameters 最多 6 个，ID 使用 ASCII 字母开头，给出合理且有限的 value/min/max/step。无可调参数时返回空数组。',
    '对最多 4 个点随参数 t 变化的数学轨迹，或最多 4 个质点随时间运动的物理实验（自由落体、抛体、碰撞、单摆、水平弹簧振子等），使用 experiment.motion.point-2d 并填写 experimentSpec。主物体使用 bodyId/bodyLabel/xExpression/yExpression；其他物体放入 additionalBodies。',
    '实验表达式遵循同一数学白名单，可额外使用时间变量 t。durationExpression 只能引用参数且结果应为 0.2 到 60 秒；位置、测量量和矢量表达式可以引用 t、参数以及已声明的 metrics.id。可把碰撞时刻 tc、碰后速度等公共子表达式放入 metrics 并复用，但不得循环引用。',
    '所有表达式字段都必须是 JSON 字符串；常量表达式也要写成 "0"，不能写成数字 0。JSON 字符串的内容本身不能再带首尾引号，例如值应为 "L*sin(theta)"，不能让内容变成 L*sin(theta) 后面又多一个引号字符。',
    '实验必须返回 additionalBodies、vectors 和 constraints 数组；没有时返回空数组。每个矢量包含 id、label、xExpression、yExpression、scale、unit、bodyId，bodyId 必须绑定已声明物体；scale 只把物理量换算为坐标长度。display 可选 arrow 或 distance：力学量使用 arrow；几何距离使用 distance、scale=1，并令分量等于目标点坐标减起点坐标。labelMode 可选 full 或 value：full 显示标签、数值和单位，value 只显示数值。运动物体、矢量、约束均最多 4 个。',
    'constraints 用于可视化绳或弹簧，每项包含 id、label、type（rope 或 spring）、bodyId、anchorXExpression、anchorYExpression、restLengthExpression。三个长度/锚点表达式可引用 t、参数和 metrics。rope 的物体到锚点距离必须在整个运行区间等于 restLengthExpression；spring 的 restLengthExpression 表示自然长度，不要求当前长度恒定。',
    '自由落体建议使用 durationExpression="sqrt(2*h0/g)"、xExpression="0"、yExpression="max(0,h0-0.5*g*t^2)"，提供高度与速度测量量，并返回速度矢量 vx="0"、vy="0-g*t"、scale=0.1、unit="m/s"，以及重力加速度矢量 ax="0"、ay="0-g"、scale=0.15、unit="m/s^2"。parameters 最多 6 个、metrics 最多 4 个。',
    '一维弹性碰撞可令 tc=(x2-x1)/(u1-u2)，碰后速度 v1=((m1-m2)*u1+2*m2*u2)/(m1+m2)、v2=(2*m1*u1+(m2-m1)*u2)/(m1+m2)；位置用 min(t,tc) 与 max(0,t-tc) 分段，速度矢量用 step(t-tc) 切换。durationExpression 必须比 tc 至少多 2 秒，以展示碰后运动。参数范围尽量保证 u1>u2、x2>x1，运行时会拒绝除零组合。',
    '小角度单摆可把 theta=theta0*cos(sqrt(g/L)*t) 放入 metrics，物体位置写成 x=L*sin(theta)、y=H-L*cos(theta)，durationExpression="4*pi*sqrt(L/g)" 以展示两个周期，锚点为 (0,H)，rope 的自然长度写成 L；theta0 建议使用弧度且范围不超过 0.35。未要求速度等矢量时不要自行添加；若要求单摆速度，必须把 thetaDot=0-theta0*sqrt(g/L)*sin(sqrt(g/L)*t) 也声明为 metric，再使用 vx=L*cos(theta)*thetaDot、vy=L*sin(theta)*thetaDot。水平弹簧振子可写 x=A*cos(w*t)、y=0，固定点放在运动范围左侧，spring 自然长度为固定点到平衡位置的距离。',
    '两个独立钟摆不要使用 H1/H2 高度参数，避免浪费 6 个参数的额度。推荐共享 g，并声明 L1、L2、theta01、theta02 共 5 个可调参数；metrics 使用 theta1=theta01*cos(sqrt(g/L1)*t)、theta2=theta02*cos(sqrt(g/L2)*t)，两个摆球位置分别为 x=-2+L1*sin(theta1), y=0-L1*cos(theta1) 和 x=2+L2*sin(theta2), y=0-L2*cos(theta2)，两个 rope 固定点分别为 (-2,0)、(2,0)，自然长度为 L1、L2；durationExpression="4*pi*sqrt(max(L1,L2)/g)"。',
    '参数轨迹的 parameterOverrides 必须为空；数学轨迹的 subject 为 math，物理运动的 subject 为 physics。化学、地理以及无法表达为最多 4 个点轨迹的实验仍返回 unsupported。',
    '椭圆模板的 majorAxis 和 minorAxis 表示长轴全长与短轴全长；没有明确数值时省略对应覆盖项，使用本地默认值。',
    '二次函数模板的 coefficientA、vertexH、vertexK 对应 a、h、k；a 不能为 0，没有明确数值时省略。',
    '椭圆或二次函数模板不填写 functionSpec/experimentSpec；通用函数不填写 experimentSpec；时间实验不填写 functionSpec。schemaVersion 必须是字符串 "0.1"。',
    '只调用 emit_lesson_plan 工具，不要另外解释。',
  ].join('\n')
}

export async function generateLessonPlan(prompt, options = {}) {
  const config = readMinimaxConfig(options.environment)
  if (!config.apiKey) throw new Error('MiniMax-M3 未配置：请设置 MINIMAX_API_KEY。')

  const client = options.client ?? new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.timeout,
    maxRetries: 2,
  })

  const tool = {
    name: TOOL_NAME,
    description: '返回紧凑的 Word2HTML LessonPlan 0.1。',
    input_schema: lessonPlanSchema,
  }
  const userMessage = { role: 'user', content: [{ type: 'text', text: prompt }] }
  const request = (messages) => client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    thinking: { type: 'disabled' },
    system: systemPrompt(),
    messages,
    tools: [tool],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  })

  const responses = [await request([userMessage])]
  let plan
  let firstValidationError
  try {
    plan = validateGeneratedPlan(
      normalizeGeneratedPlan(extractPlanFromModelResponse(responses[0])),
    )
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
      plan = validateGeneratedPlan(
        normalizeGeneratedPlan(extractPlanFromModelResponse(responses[1])),
      )
    } catch (error) {
      const repairError = error instanceof Error ? error.message : '纠错规划校验失败。'
      throw new Error(`MiniMax 自动纠错后规划仍无效：${repairError}（首次错误：${firstValidationError}）`)
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
    provider: { name: 'MiniMax', model: finalResponse?.model ?? config.model },
  }
}

export async function editLessonPlan(instruction, basePlan, options = {}) {
  const config = readMinimaxConfig(options.environment)
  if (!config.apiKey) throw new Error('MiniMax-M3 未配置：请设置 MINIMAX_API_KEY。')
  let normalizedBase
  try {
    normalizedBase = validateGeneratedPlan(normalizeGeneratedPlan(basePlan))
  } catch {
    throw new Error('二次编辑请求中的当前 LessonPlan 无效。')
  }
  if (normalizedBase.status !== 'matched') throw new Error('只有可运行场景可以进行二次编辑。')

  const client = options.client ?? new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.timeout,
    maxRetries: 2,
  })
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
    system: systemPrompt(),
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
      throw new Error(`MiniMax 自动纠错后二次编辑仍无效：${repairError}（首次错误：${firstValidationError}）`)
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
    provider: { name: 'MiniMax', model: finalResponse?.model ?? config.model },
  }
}

export async function repairLessonPlan(prompt, previousPlan, validationError, options = {}) {
  const config = readMinimaxConfig(options.environment)
  if (!config.apiKey) throw new Error('MiniMax-M3 未配置：请设置 MINIMAX_API_KEY。')
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
  const client = options.client ?? new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.timeout,
    maxRetries: 2,
  })
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
    system: systemPrompt(),
    messages: [{ role: 'user', content: [{ type: 'text', text: feedback }] }],
    tools: [{
      name: TOOL_NAME,
      description: '返回修正后的紧凑 Word2HTML LessonPlan 0.1。',
      input_schema: normalizedBase ? contextualEditSchema(normalizedBase) : lessonPlanSchema,
    }],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  })
  let plan
  try {
    plan = validateGeneratedPlan(
      normalizeGeneratedPlan(extractPlanFromModelResponse(response)),
    )
    if (normalizedBase) plan = assertContextualEditPlan(normalizedBase, plan)
  } catch (error) {
    const message = error instanceof Error ? error.message : '纠错规划校验失败。'
    throw new Error(`MiniMax 自动纠错后规划仍无效：${message}`)
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
    provider: { name: 'MiniMax', model: response.model ?? config.model },
  }
}
