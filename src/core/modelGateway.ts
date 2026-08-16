import Ajv2020 from 'ajv/dist/2020.js'
import lessonPlanSchema from '../schema/lesson-plan.schema.json'
import { updateAxisParameter, validateAxisValues } from './ellipse'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { createQuadraticScene } from '../templates/quadraticTemplate'
import { createGenericFunctionScene } from '../templates/genericFunctionTemplate'
import { createTimeExperimentScene } from '../templates/timeExperimentTemplate'
import {
  QUADRATIC_TEMPLATE_ID,
  updateQuadraticParameter,
  validateQuadraticValues,
} from './quadratic'
import {
  GENERIC_FUNCTION_TEMPLATE_ID,
  validateGenericFunctionSpec,
  type GenericFunctionSpec,
} from './genericFunction'
import {
  TIME_EXPERIMENT_TEMPLATE_ID,
  validateTimeExperimentSpec,
  type TimeExperimentSpec,
} from './timeExperiment'
import type { LessonScene, Subject } from '../types/lessonScene'
import { isNumberParameter } from '../types/lessonScene'
import { assertLessonScene } from './validateScene'

const ajv = new Ajv2020({ allErrors: true, strict: true })
const validatePlanSchema = ajv.compile(lessonPlanSchema)
export const GENERATION_API_VERSION = 'lesson-plan-0.3'

export interface LessonPlan {
  schemaVersion: '0.1'
  status: 'matched' | 'unsupported'
  subject: Subject
  topic: string
  templateId: 'math.conic.ellipse-focus-sum' | 'math.function.quadratic-vertex' | 'math.function.generic-2d' | 'experiment.motion.point-2d' | 'unsupported'
  parameterOverrides: {
    majorAxis?: number
    minorAxis?: number
    coefficientA?: number
    vertexH?: number
    vertexK?: number
  }
  functionSpec?: GenericFunctionSpec
  experimentSpec?: TimeExperimentSpec
  reason: string
}

export interface ModelUsage {
  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
}

export interface ModelGenerationResult {
  scene: LessonScene
  plan: LessonPlan
  usage: ModelUsage
  provider?: {
    name: string
    model: string
  }
}

export interface ModelServiceStatus {
  reachable: boolean
  configured: boolean
  apiCompatible: boolean
  provider: string
  model: string
  baseURL: string
}

export function assertSceneRendererSupported(scene: LessonScene): void {
  if (
    scene.templateRef.id !== 'math.conic.ellipse-focus-sum' &&
    scene.templateRef.id !== QUADRATIC_TEMPLATE_ID &&
    scene.templateRef.id !== GENERIC_FUNCTION_TEMPLATE_ID &&
    scene.templateRef.id !== TIME_EXPERIMENT_TEMPLATE_ID
  ) {
    throw new Error(`场景已通过协议校验，但当前渲染器尚不支持模板：${scene.templateRef.id}`)
  }
}

export function assertLessonPlan(value: unknown): asserts value is LessonPlan {
  if (!validatePlanSchema(value)) {
    const details = (validatePlanSchema.errors ?? [])
      .slice(0, 6)
      .map((error) => `${error.instancePath || '/'} ${error.message ?? '格式错误'}`)
      .join('；')
    throw new Error(`大模型规划未通过 LessonPlan 校验：${details}`)
  }
  const plan = value as unknown as LessonPlan
  if (
    (plan.status === 'matched' && plan.templateId === 'unsupported') ||
    (plan.status === 'unsupported' && plan.templateId !== 'unsupported')
  ) {
    throw new Error('大模型规划状态与模板不一致。')
  }
  if (plan.templateId === 'math.conic.ellipse-focus-sum') {
    if (plan.subject !== 'math') throw new Error('椭圆模板必须归类为数学。')
    const invalid = Object.keys(plan.parameterOverrides)
      .some((name) => !['majorAxis', 'minorAxis'].includes(name))
    if (invalid) throw new Error('椭圆模板包含不适用的参数覆盖。')
  }
  if (plan.templateId === QUADRATIC_TEMPLATE_ID) {
    if (plan.subject !== 'math') throw new Error('二次函数模板必须归类为数学。')
    const invalid = Object.keys(plan.parameterOverrides)
      .some((name) => !['coefficientA', 'vertexH', 'vertexK'].includes(name))
    if (invalid) throw new Error('二次函数模板包含不适用的参数覆盖。')
  }
  if (plan.templateId === GENERIC_FUNCTION_TEMPLATE_ID) {
    if (plan.subject !== 'math') throw new Error('通用函数场景必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).length > 0) {
      throw new Error('通用函数场景不能包含模板参数覆盖。')
    }
    if (!plan.functionSpec) throw new Error('通用函数场景缺少函数规格。')
    const error = validateGenericFunctionSpec(plan.functionSpec)
    if (error) throw new Error(`通用函数规格无效：${error}`)
  } else if (plan.functionSpec !== undefined) {
    throw new Error('非通用函数计划不能包含函数规格。')
  }
  if (plan.templateId === TIME_EXPERIMENT_TEMPLATE_ID) {
    if (plan.subject !== 'physics') throw new Error('二维点运动实验必须归类为物理。')
    if (Object.keys(plan.parameterOverrides).length > 0) {
      throw new Error('时间实验不能包含模板参数覆盖。')
    }
    if (!plan.experimentSpec) throw new Error('时间实验缺少实验规格。')
    const error = validateTimeExperimentSpec(plan.experimentSpec)
    if (error) throw new Error(`时间实验规格无效：${error}`)
  } else if (plan.experimentSpec !== undefined) {
    throw new Error('非时间实验计划不能包含实验规格。')
  }
  if (plan.status === 'unsupported' && Object.keys(plan.parameterOverrides).length > 0) {
    throw new Error('不支持的计划不能包含参数覆盖。')
  }
}

export function instantiateLessonPlan(plan: LessonPlan): LessonScene {
  assertLessonPlan(plan)
  if (plan.status === 'unsupported') {
    throw new Error(`当前尚未安装“${plan.topic}”的交互渲染模板。${plan.reason}`)
  }
  if (plan.templateId === TIME_EXPERIMENT_TEMPLATE_ID) {
    const scene = createTimeExperimentScene(plan.experimentSpec!, {
      title: plan.topic,
      topic: plan.topic,
      summary: plan.reason,
      subject: plan.subject,
    })
    assertLessonScene(scene)
    return scene
  }
  if (plan.templateId === GENERIC_FUNCTION_TEMPLATE_ID) {
    const scene = createGenericFunctionScene(plan.functionSpec!, {
      title: plan.topic,
      topic: plan.topic,
      summary: plan.reason,
    })
    assertLessonScene(scene)
    return scene
  }
  if (plan.templateId === QUADRATIC_TEMPLATE_ID) {
    let scene = createQuadraticScene()
    const coefficientA = plan.parameterOverrides.coefficientA ?? 1
    const vertexH = plan.parameterOverrides.vertexH ?? 0
    const vertexK = plan.parameterOverrides.vertexK ?? 0
    const parameterError = validateQuadraticValues(scene, { coefficientA, vertexH, vertexK })
    if (parameterError) throw new Error(`大模型参数规划无效：${parameterError}`)
    scene = updateQuadraticParameter(scene, 'coefficientA', coefficientA)
    scene = updateQuadraticParameter(scene, 'vertexH', vertexH)
    scene = updateQuadraticParameter(scene, 'vertexK', vertexK)
    scene.lineage = {
      source: 'model',
      matchLevel: 'template',
      fingerprint: `model-plan|${plan.templateId}|a:${coefficientA}|h:${vertexH}|k:${vertexK}|v1`,
      updatedAt: new Date().toISOString(),
    }
    assertLessonScene(scene)
    return scene
  }

  if (plan.templateId !== 'math.conic.ellipse-focus-sum') {
    throw new Error(`当前渲染器尚不支持模板：${plan.templateId}`)
  }

  let scene = createEllipseScene()
  const defaultMajor = scene.parameters.majorAxis
  const defaultMinor = scene.parameters.minorAxis
  if (!isNumberParameter(defaultMajor) || !isNumberParameter(defaultMinor)) {
    throw new Error('椭圆模板缺少长轴或短轴参数。')
  }
  const major = plan.parameterOverrides.majorAxis ?? defaultMajor.value
  const minor = plan.parameterOverrides.minorAxis ?? defaultMinor.value
  const axisError = validateAxisValues(scene, major, minor)
  if (axisError) throw new Error(`大模型参数规划无效：${axisError}`)

  scene = updateAxisParameter(scene, 'majorAxis', major)
  scene = updateAxisParameter(scene, 'minorAxis', minor)
  scene.lineage = {
    source: 'model',
    matchLevel: 'template',
    fingerprint: `model-plan|${plan.templateId}|major:${major}|minor:${minor}|v1`,
    updatedAt: new Date().toISOString(),
  }
  assertLessonScene(scene)
  return scene
}

export async function getModelServiceStatus(): Promise<ModelServiceStatus> {
  const endpoint = import.meta.env.VITE_MODEL_STATUS_ENDPOINT || '/api/health'
  try {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error('status unavailable')
    const payload = await response.json() as {
      apiVersion?: string
      model?: { configured?: boolean; provider?: string; model?: string; baseURL?: string }
    }
    return {
      reachable: true,
      configured: Boolean(payload.model?.configured),
      apiCompatible: payload.apiVersion === GENERATION_API_VERSION,
      provider: payload.model?.provider ?? 'MiniMax',
      model: payload.model?.model ?? 'MiniMax-M3',
      baseURL: payload.model?.baseURL ?? '',
    }
  } catch {
    return {
      reachable: false,
      configured: false,
      apiCompatible: false,
      provider: 'MiniMax',
      model: 'MiniMax-M3',
      baseURL: '',
    }
  }
}

export async function generateSceneWithModel(prompt: string): Promise<ModelGenerationResult> {
  const endpoint = import.meta.env.VITE_SCENE_GENERATION_ENDPOINT || '/api/generate'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, schemaVersion: '0.1', locale: 'zh-CN' }),
  })
  if (!response.ok) {
    let message = `大模型生成服务返回错误：${response.status}`
    try {
      const payload = await response.json() as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message)
  }

  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object') throw new Error('大模型生成服务返回了无效数据。')
  const candidate = payload as {
    apiVersion?: string
    plan?: unknown
    usage?: ModelUsage
    provider?: { name?: string; model?: string }
  }
  if (candidate.apiVersion !== GENERATION_API_VERSION) {
    throw new Error('生成服务仍在运行旧协议。请停止并重新执行 npm run dev，然后刷新浏览器。')
  }
  assertLessonPlan(candidate.plan)
  const scene = instantiateLessonPlan(candidate.plan)
  return {
    scene,
    plan: candidate.plan,
    usage: candidate.usage ?? {},
    provider: candidate.provider?.name && candidate.provider.model
      ? { name: candidate.provider.name, model: candidate.provider.model }
      : undefined,
  }
}
