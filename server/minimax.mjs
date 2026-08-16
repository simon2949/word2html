import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import Ajv2020 from 'ajv/dist/2020.js'

const schemaUrl = new URL('../src/schema/lesson-plan.schema.json', import.meta.url)
export const lessonPlanSchema = JSON.parse(readFileSync(schemaUrl, 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: true })
const validatePlanSchema = ajv.compile(lessonPlanSchema)
const TOOL_NAME = 'emit_lesson_plan'
export const GENERATION_API_VERSION = 'lesson-plan-0.3'

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

export function readMinimaxConfig(environment = process.env) {
  const maxTokens = Number(environment.MINIMAX_MAX_TOKENS ?? 1024)
  const timeout = Number(environment.MINIMAX_TIMEOUT_MS ?? 120000)
  const temperature = Number(environment.MINIMAX_TEMPERATURE ?? 1)
  return {
    apiKey: environment.MINIMAX_API_KEY?.trim() ?? '',
    baseURL: (environment.MINIMAX_BASE_URL?.trim() || 'https://api.minimaxi.com/anthropic').replace(/\/+$/, ''),
    model: environment.MINIMAX_MODEL?.trim() || 'MiniMax-M3',
    maxTokens: Number.isFinite(maxTokens) ? Math.min(4096, Math.max(256, maxTokens)) : 1024,
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
  if (plan.parameterOverrides && typeof plan.parameterOverrides === 'object') {
    for (const name of ['majorAxis', 'minorAxis', 'coefficientA', 'vertexH', 'vertexK']) {
      if (!Object.hasOwn(plan.parameterOverrides, name)) continue
      const candidate = plan.parameterOverrides[name]
      plan.parameterOverrides[name] = finiteNumberFromString(candidate)
    }
  }
  if (plan.functionSpec && typeof plan.functionSpec === 'object') {
    if (Object.hasOwn(plan.functionSpec, 'expression')) {
      plan.functionSpec.expression = expressionStringFromNumber(plan.functionSpec.expression)
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
    for (const name of ['durationExpression', 'xExpression', 'yExpression']) {
      if (!Object.hasOwn(plan.experimentSpec, name)) continue
      plan.experimentSpec[name] = expressionStringFromNumber(plan.experimentSpec[name])
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
        metric.expression = expressionStringFromNumber(metric.expression)
      }
    }
    if (Array.isArray(plan.experimentSpec.vectors)) {
      for (const vector of plan.experimentSpec.vectors) {
        if (!vector || typeof vector !== 'object') continue
        for (const name of ['xExpression', 'yExpression']) {
          if (Object.hasOwn(vector, name)) vector[name] = expressionStringFromNumber(vector[name])
        }
        if (Object.hasOwn(vector, 'scale')) vector.scale = finiteNumberFromString(vector.scale)
      }
    }
  }
  return plan
}

const SAFE_FUNCTION_NAMES = new Set(['sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'log', 'ln', 'min', 'max', 'pow'])
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
    metricNames.add(metric.id)
  }
  const vectorNames = new Set()
  for (const vector of spec.vectors) {
    if (vectorNames.has(vector.id)) throw new Error(`时间实验矢量 ID 重复：${vector.id}`)
    vectorNames.add(vector.id)
    if (vector.scale < 0.01 || vector.scale > 20) throw new Error(`时间实验矢量显示比例无效：${vector.label}`)
  }
  const inspect = (expression, allowTime) => {
    const identifiers = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
    for (const identifier of identifiers) {
      if (identifier === 't' && allowTime) continue
      if (!RESERVED_PARAMETER_NAMES.has(identifier) && !parameterNames.has(identifier)) {
        throw new Error(`时间实验表达式包含未知标识符：${identifier}`)
      }
      if (identifier === 't' && !allowTime) throw new Error('持续时间表达式不能引用 t。')
    }
  }
  inspect(spec.durationExpression, false)
  inspect(spec.xExpression, true)
  inspect(spec.yExpression, true)
  for (const metric of spec.metrics) inspect(metric.expression, true)
  for (const vector of spec.vectors) {
    inspect(vector.xExpression, true)
    inspect(vector.yExpression, true)
  }
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
    if (plan.subject !== 'physics') throw new Error('二维点运动实验必须归类为物理。')
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

function systemPrompt() {
  return [
    '你是 Word2HTML 的 K12 教学场景规划器，只负责选择模板或描述安全的二维显式函数，不生成 HTML、JavaScript 或其他代码。',
    '已安装模板之一是 math.conic.ellipse-focus-sum，用于演示椭圆上一点到两个焦点的距离之和不变。',
    '另一个已安装模板是 math.function.quadratic-vertex，用顶点式 y=a(x-h)^2+k 演示二次函数的开口、宽窄、顶点和对称轴变化。',
    '对于不能命中上述模板、但能写成单变量显式函数 y=f(x) 的数学内容，使用 math.function.generic-2d 并填写 functionSpec。',
    '通用表达式只能使用 x、参数 ID、数字、括号、+ - * / ^，以及 sin cos tan sqrt abs exp log ln min max pow 和常量 pi e。乘法必须显式写 *，不能写 2x。',
    '通用函数定义域必须在 [-50,50] 内且 xMin<xMax；parameters 最多 6 个，ID 使用 ASCII 字母开头，给出合理且有限的 value/min/max/step。无可调参数时返回空数组。',
    '对单个质点随时间运动的物理实验（自由落体、竖直上抛、匀速或匀加速直线运动、抛体运动），使用 experiment.motion.point-2d 并填写 experimentSpec。',
    '实验表达式遵循同一数学白名单，可额外使用时间变量 t。durationExpression 只能引用参数且结果应为 0.2 到 60 秒；位置、测量量和矢量表达式可以引用 t 和参数。',
    '所有表达式字段都必须是 JSON 字符串；常量表达式也要写成 "0"，不能写成数字 0。',
    '实验必须返回 vectors 数组；没有适合的矢量时返回空数组。矢量只描述从质点出发的物理量，包含 id、label、xExpression、yExpression、scale、unit，最多 4 个；scale 是把物理量换算为坐标长度的正数，不改变实际数值。',
    '自由落体建议使用 durationExpression="sqrt(2*h0/g)"、xExpression="0"、yExpression="max(0,h0-0.5*g*t^2)"，提供高度与速度测量量，并返回速度矢量 vx="0"、vy="0-g*t"、scale=0.1、unit="m/s"，以及重力加速度矢量 ax="0"、ay="0-g"、scale=0.15、unit="m/s^2"。parameters 最多 6 个、metrics 最多 4 个。',
    '时间实验的 parameterOverrides 必须为空，subject 必须为 physics。化学、地理以及目前无法表达为单个质点运动的实验仍返回 unsupported。',
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

  const response = await client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    thinking: { type: 'disabled' },
    system: systemPrompt(),
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    tools: [{
      name: TOOL_NAME,
      description: '返回紧凑的 Word2HTML LessonPlan 0.1。',
      input_schema: lessonPlanSchema,
    }],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  })

  const plan = validateGeneratedPlan(
    normalizeGeneratedPlan(extractPlanFromModelResponse(response)),
  )
  return {
    apiVersion: GENERATION_API_VERSION,
    plan,
    usage: {
      inputTokens: response.usage?.input_tokens,
      cachedInputTokens: response.usage?.cache_read_input_tokens,
      outputTokens: response.usage?.output_tokens,
    },
    provider: { name: 'MiniMax', model: response.model ?? config.model },
  }
}
