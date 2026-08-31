import Ajv2020 from 'ajv/dist/2020.js'
import lessonPlanSchema from '../schema/lesson-plan.schema.json'
import { updateAxisParameter, validateAxisValues } from './ellipse'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { createQuadraticScene } from '../templates/quadraticTemplate'
import { createGenericFunctionScene } from '../templates/genericFunctionTemplate'
import { createTimeExperimentScene } from '../templates/timeExperimentTemplate'
import { createGeometry2DScene } from '../templates/geometry2dTemplate'
import { createCollision2DScene } from '../templates/collision2dTemplate'
import { createRelationCurve2DScene } from '../templates/relationCurve2dTemplate'
import { createDataChart2DScene } from '../templates/dataChart2dTemplate'
import {
  QUADRATIC_TEMPLATE_ID,
  updateQuadraticParameter,
  validateQuadraticValues,
} from './quadratic'
import {
  GENERIC_FUNCTION_TEMPLATE_ID,
  getGenericFunctionSpec,
  validateGenericFunctionSpec,
  type GenericFunctionSpec,
} from './genericFunction'
import {
  getTimeExperimentSpec,
  TIME_EXPERIMENT_TEMPLATE_ID,
  validateTimeExperimentSpec,
  type TimeExperimentSpec,
} from './timeExperiment'
import {
  GEOMETRY_2D_TEMPLATE_ID,
  getGeometry2DSpec,
  validateGeometry2DSpec,
  type Geometry2DSpec,
} from './geometry2d'
import {
  COLLISION_2D_TEMPLATE_ID,
  getCollision2DSpec,
  validateCollision2DSpec,
  type Collision2DSpec,
} from './collision2d'
import {
  RELATION_CURVE_2D_TEMPLATE_ID,
  getRelationCurve2DSpec,
  validateRelationCurve2DSpec,
  type RelationCurve2DSpec,
} from './relationCurve2d'
import {
  DATA_CHART_2D_TEMPLATE_ID,
  getDataChart2DSpec,
  validateDataChart2DSpec,
  type DataChart2DSpec,
} from './dataChart2d'
import type { LessonScene, Subject } from '../types/lessonScene'
import { isNumberParameter } from '../types/lessonScene'
import { assertLessonScene } from './validateScene'
import { describeLessonPlanChanges } from './lessonPlanDiff'
import { getCapabilityDefinition, isRegisteredTemplateId } from './capabilityRegistry'
import { modelRequestHeaders } from './modelRequestIdentity'

const ajv = new Ajv2020({ allErrors: true, strict: true })
const validatePlanSchema = ajv.compile(lessonPlanSchema)
export const GENERATION_API_VERSION = 'lesson-plan-1.4'

export interface LessonPlan {
  schemaVersion: '0.1'
  status: 'matched' | 'unsupported'
  subject: Subject
  topic: string
  templateId: 'math.conic.ellipse-focus-sum' | 'math.function.quadratic-vertex' | 'math.function.generic-2d' | 'math.curve.relation-2d' | 'math.geometry.primitives-2d' | 'math.data.chart-2d' | 'experiment.motion.point-2d' | 'physics.collision.discs-2d' | 'unsupported'
  parameterOverrides: {
    majorAxis?: number
    minorAxis?: number
    coefficientA?: number
    vertexH?: number
    vertexK?: number
  }
  functionSpec?: GenericFunctionSpec
  relationSpec?: RelationCurve2DSpec
  geometrySpec?: Geometry2DSpec
  experimentSpec?: TimeExperimentSpec
  collisionSpec?: Collision2DSpec
  dataChartSpec?: DataChart2DSpec
  reason: string
}

export interface ModelUsage {
  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
  modelCalls?: number
  repaired?: boolean
  deduplicated?: boolean
}

export interface ModelGenerationResult {
  scene: LessonScene
  plan: LessonPlan
  usage: ModelUsage
  changes?: string[]
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
  protocol?: 'anthropic-compatible' | 'openai-compatible'
  profile?: string
  model: string
  baseURL: string
}

export interface PublicModelOption {
  id: string
  label: string
  provider: string
  protocol: 'anthropic-compatible' | 'openai-compatible'
  model: string
  platformKeyAvailable: boolean
}

export interface PublicModelOptions {
  defaultModelId: string
  models: PublicModelOption[]
}

export interface TemporaryModelAccess {
  modelId: string
  apiKey: string
}

export function assertSceneRendererSupported(scene: LessonScene): void {
  if (!isRegisteredTemplateId(scene.templateRef.id)) {
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
  if (plan.templateId === RELATION_CURVE_2D_TEMPLATE_ID) {
    if (plan.subject !== 'math') throw new Error('二维关系曲线必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).length > 0) throw new Error('二维关系曲线不能包含模板参数覆盖。')
    if (!plan.relationSpec) throw new Error('二维关系曲线缺少关系曲线规格。')
    const error = validateRelationCurve2DSpec(plan.relationSpec)
    if (error) throw new Error(`二维关系曲线规格无效：${error}`)
  } else if (plan.relationSpec !== undefined) {
    throw new Error('非二维关系曲线计划不能包含关系曲线规格。')
  }
  if (plan.templateId === GEOMETRY_2D_TEMPLATE_ID) {
    if (plan.subject !== 'math') throw new Error('二维几何场景必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).length > 0) {
      throw new Error('二维几何场景不能包含模板参数覆盖。')
    }
    if (!plan.geometrySpec) throw new Error('二维几何场景缺少几何规格。')
    const error = validateGeometry2DSpec(plan.geometrySpec)
    if (error) throw new Error(`二维几何规格无效：${error}`)
  } else if (plan.geometrySpec !== undefined) {
    throw new Error('非二维几何计划不能包含几何规格。')
  }
  if (plan.templateId === TIME_EXPERIMENT_TEMPLATE_ID) {
    if (plan.subject !== 'physics' && plan.subject !== 'math') {
      throw new Error('二维参数轨迹运行时只支持数学或物理。')
    }
    if (Object.keys(plan.parameterOverrides).length > 0) {
      throw new Error('时间实验不能包含模板参数覆盖。')
    }
    if (!plan.experimentSpec) throw new Error('时间实验缺少实验规格。')
    const error = validateTimeExperimentSpec(plan.experimentSpec)
    if (error) throw new Error(`时间实验规格无效：${error}`)
  } else if (plan.experimentSpec !== undefined) {
    throw new Error('非时间实验计划不能包含实验规格。')
  }
  if (plan.templateId === COLLISION_2D_TEMPLATE_ID) {
    if (plan.subject !== 'physics') throw new Error('二维碰撞场景必须归类为物理。')
    if (Object.keys(plan.parameterOverrides).length > 0) {
      throw new Error('二维碰撞场景不能包含模板参数覆盖。')
    }
    if (!plan.collisionSpec) throw new Error('二维碰撞场景缺少碰撞规格。')
    const error = validateCollision2DSpec(plan.collisionSpec)
    if (error) throw new Error(`二维碰撞规格无效：${error}`)
  } else if (plan.collisionSpec !== undefined) {
    throw new Error('非二维碰撞计划不能包含碰撞规格。')
  }
  if (plan.templateId === DATA_CHART_2D_TEMPLATE_ID) {
    if (plan.subject !== 'math') throw new Error('数据图表必须归类为数学。')
    if (Object.keys(plan.parameterOverrides).length > 0) throw new Error('数据图表不能包含模板参数覆盖。')
    if (!plan.dataChartSpec) throw new Error('数据图表缺少图表规格。')
    const error = validateDataChart2DSpec(plan.dataChartSpec)
    if (error) throw new Error(`数据图表规格无效：${error}`)
  } else if (plan.dataChartSpec !== undefined) {
    throw new Error('非数据图表计划不能包含图表规格。')
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
  if (plan.templateId === RELATION_CURVE_2D_TEMPLATE_ID) {
    const scene = createRelationCurve2DScene(plan.relationSpec!, {
      title: plan.topic,
      topic: plan.topic,
      summary: plan.reason,
    })
    assertLessonScene(scene)
    return scene
  }
  if (plan.templateId === DATA_CHART_2D_TEMPLATE_ID) {
    const scene = createDataChart2DScene(plan.dataChartSpec!, {
      title: plan.topic,
      topic: plan.topic,
      summary: plan.reason,
    })
    assertLessonScene(scene)
    return scene
  }
  if (plan.templateId === COLLISION_2D_TEMPLATE_ID) {
    const scene = createCollision2DScene(plan.collisionSpec!, {
      title: plan.topic,
      topic: plan.topic,
      summary: plan.reason,
    })
    assertLessonScene(scene)
    return scene
  }
  if (plan.templateId === GEOMETRY_2D_TEMPLATE_ID) {
    const scene = createGeometry2DScene(plan.geometrySpec!, {
      title: plan.topic,
      topic: plan.topic,
      summary: plan.reason,
    })
    assertLessonScene(scene)
    return scene
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
    scene.metadata = {
      ...scene.metadata,
      title: plan.topic,
      topic: plan.topic,
      summary: plan.reason,
    }
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
  scene.metadata = {
    ...scene.metadata,
    title: plan.topic,
    topic: plan.topic,
    summary: plan.reason,
  }
  scene.lineage = {
    source: 'model',
    matchLevel: 'template',
    fingerprint: `model-plan|${plan.templateId}|major:${major}|minor:${minor}|v1`,
    updatedAt: new Date().toISOString(),
  }
  assertLessonScene(scene)
  return scene
}

function sceneReason(scene: LessonScene): string {
  const summary = scene.metadata.summary.trim()
  return (summary || '基于当前已校验场景继续编辑。').slice(0, 240)
}

function sceneTopic(scene: LessonScene): string {
  const topic = scene.metadata.topic.trim()
  return (topic || scene.metadata.title.trim() || '当前教学场景').slice(0, 120)
}

/**
 * Reconstruct the compact, safe planning representation from any installed
 * renderer scene. This lets imports, library entries and locally adjusted
 * parameter values all participate in contextual model edits.
 */
export function lessonPlanFromScene(scene: LessonScene): LessonPlan {
  assertLessonScene(scene)
  assertSceneRendererSupported(scene)
  const common = {
    schemaVersion: '0.1' as const,
    status: 'matched' as const,
    subject: scene.metadata.subject,
    topic: sceneTopic(scene),
    reason: sceneReason(scene),
  }
  let plan: LessonPlan
  if (scene.templateRef.id === 'math.conic.ellipse-focus-sum') {
    const major = scene.parameters.majorAxis
    const minor = scene.parameters.minorAxis
    if (!isNumberParameter(major) || !isNumberParameter(minor)) {
      throw new Error('当前椭圆场景缺少可编辑的长轴或短轴参数。')
    }
    plan = {
      ...common,
      subject: 'math',
      templateId: 'math.conic.ellipse-focus-sum',
      parameterOverrides: { majorAxis: major.value, minorAxis: minor.value },
    }
  } else if (scene.templateRef.id === QUADRATIC_TEMPLATE_ID) {
    const coefficientA = scene.parameters.coefficientA
    const vertexH = scene.parameters.vertexH
    const vertexK = scene.parameters.vertexK
    if (
      !isNumberParameter(coefficientA) ||
      !isNumberParameter(vertexH) ||
      !isNumberParameter(vertexK)
    ) {
      throw new Error('当前二次函数场景缺少 a、h 或 k 参数。')
    }
    plan = {
      ...common,
      subject: 'math',
      templateId: QUADRATIC_TEMPLATE_ID,
      parameterOverrides: {
        coefficientA: coefficientA.value,
        vertexH: vertexH.value,
        vertexK: vertexK.value,
      },
    }
  } else if (scene.templateRef.id === GENERIC_FUNCTION_TEMPLATE_ID) {
    plan = {
      ...common,
      subject: 'math',
      templateId: GENERIC_FUNCTION_TEMPLATE_ID,
      parameterOverrides: {},
      functionSpec: getGenericFunctionSpec(scene),
    }
  } else if (scene.templateRef.id === RELATION_CURVE_2D_TEMPLATE_ID) {
    plan = {
      ...common,
      subject: 'math',
      templateId: RELATION_CURVE_2D_TEMPLATE_ID,
      parameterOverrides: {},
      relationSpec: getRelationCurve2DSpec(scene),
    }
  } else if (scene.templateRef.id === TIME_EXPERIMENT_TEMPLATE_ID) {
    plan = {
      ...common,
      templateId: TIME_EXPERIMENT_TEMPLATE_ID,
      parameterOverrides: {},
      experimentSpec: getTimeExperimentSpec(scene),
    }
  } else if (scene.templateRef.id === GEOMETRY_2D_TEMPLATE_ID) {
    plan = {
      ...common,
      subject: 'math',
      templateId: GEOMETRY_2D_TEMPLATE_ID,
      parameterOverrides: {},
      geometrySpec: getGeometry2DSpec(scene),
    }
  } else if (scene.templateRef.id === COLLISION_2D_TEMPLATE_ID) {
    plan = {
      ...common,
      subject: 'physics',
      templateId: COLLISION_2D_TEMPLATE_ID,
      parameterOverrides: {},
      collisionSpec: getCollision2DSpec(scene),
    }
  } else if (scene.templateRef.id === DATA_CHART_2D_TEMPLATE_ID) {
    plan = {
      ...common,
      subject: 'math',
      templateId: DATA_CHART_2D_TEMPLATE_ID,
      parameterOverrides: {},
      dataChartSpec: getDataChart2DSpec(scene),
    }
  } else {
    throw new Error(`当前场景不能转换为可编辑规划：${scene.templateRef.id}`)
  }
  assertLessonPlan(plan)
  return plan
}

function assertContextualEditPlan(basePlan: LessonPlan, editedPlan: LessonPlan): void {
  if (editedPlan.status !== 'matched') {
    throw new Error('二次编辑不能把当前可用场景改为不支持状态。')
  }
  if (editedPlan.templateId !== basePlan.templateId) {
    throw new Error('二次编辑不能更换当前场景的运行模板；如需其他内容，请使用“生成新场景”。')
  }
  if (editedPlan.subject !== basePlan.subject) {
    throw new Error('二次编辑不能改变当前场景的学科分类。')
  }
}

function instantiateContextualEdit(plan: LessonPlan, basePlan: LessonPlan, currentScene: LessonScene): LessonScene {
  assertLessonPlan(plan)
  assertContextualEditPlan(basePlan, plan)
  const next = instantiateLessonPlan(plan)
  next.appearance = structuredClone(currentScene.appearance)
  next.lineage.parentSceneId = currentScene.id
  next.lineage.updatedAt = new Date().toISOString()
  assertLessonScene(next)
  return next
}

export async function getModelServiceStatus(): Promise<ModelServiceStatus> {
  const endpoint = import.meta.env.VITE_MODEL_STATUS_ENDPOINT || '/api/health'
  try {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error('status unavailable')
    const payload = await response.json() as {
      apiVersion?: string
      model?: {
        configured?: boolean
        provider?: string
        protocol?: 'anthropic-compatible' | 'openai-compatible'
        profile?: string
        model?: string
        baseURL?: string
      }
    }
    return {
      reachable: true,
      configured: Boolean(payload.model?.configured),
      apiCompatible: payload.apiVersion === GENERATION_API_VERSION,
      provider: payload.model?.provider ?? '未配置模型服务',
      protocol: payload.model?.protocol,
      profile: payload.model?.profile,
      model: payload.model?.model ?? '未选择模型',
      baseURL: payload.model?.baseURL ?? '',
    }
  } catch {
    return {
      reachable: false,
      configured: false,
      apiCompatible: false,
      provider: '未配置模型服务',
      model: '未选择模型',
      baseURL: '',
    }
  }
}

export async function getPublicModelOptions(): Promise<PublicModelOptions> {
  const response = await fetch('/api/model-options', { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`无法读取可信模型目录（HTTP ${response.status}）。`)
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object') throw new Error('可信模型目录响应格式不正确。')
  const payload = value as Record<string, unknown>
  if (payload.apiVersion !== GENERATION_API_VERSION || typeof payload.defaultModelId !== 'string' || !Array.isArray(payload.models)) {
    throw new Error('可信模型目录与当前应用版本不兼容。')
  }
  const protocols = ['anthropic-compatible', 'openai-compatible']
  const models = payload.models.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') throw new Error('可信模型目录包含无效项。')
    const item = candidate as Record<string, unknown>
    if (
      typeof item.id !== 'string' || typeof item.label !== 'string' ||
      typeof item.provider !== 'string' || !protocols.includes(String(item.protocol)) ||
      typeof item.model !== 'string' || typeof item.platformKeyAvailable !== 'boolean'
    ) throw new Error('可信模型目录条目不完整。')
    return item as unknown as PublicModelOption
  })
  if (!models.some((item) => item.id === payload.defaultModelId)) {
    throw new Error('可信模型目录缺少默认模型。')
  }
  return { defaultModelId: payload.defaultModelId, models }
}

interface GenerationPayload {
  apiVersion?: string
  plan?: unknown
  usage?: ModelUsage
  provider?: { name?: string; model?: string }
}

async function postGenerationRequest(
  endpoint: string,
  body: Record<string, unknown>,
  temporaryAccess?: TemporaryModelAccess,
  csrfToken?: string,
): Promise<GenerationPayload> {
  const serializedBody = JSON.stringify(body)
  const credentialNamespace = temporaryAccess ? `user:${temporaryAccess.modelId}` : 'platform'
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...modelRequestHeaders(`${serializedBody}|credential:${credentialNamespace}`),
      ...(temporaryAccess ? {
        'X-Word2HTML-Model-ID': temporaryAccess.modelId,
        'X-Word2HTML-Temporary-API-Key': temporaryAccess.apiKey,
      } : csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: serializedBody,
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
  const candidate = payload as GenerationPayload
  if (candidate.apiVersion !== GENERATION_API_VERSION) {
    throw new Error('生成服务仍在运行旧协议。请停止并重新执行 npm run dev，然后刷新浏览器。')
  }
  return candidate
}

function usageSum(...values: Array<number | undefined>): number | undefined {
  const finite = values.filter((value): value is number => Number.isFinite(value))
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) : undefined
}

function providerFromPayload(candidate: GenerationPayload) {
  return candidate.provider?.name && candidate.provider.model
    ? { name: candidate.provider.name, model: candidate.provider.model }
    : undefined
}

function assertPlanMatchesCapability(plan: LessonPlan, capabilityId?: string): void {
  if (!capabilityId) return
  const capability = getCapabilityDefinition(capabilityId)
  if (!capability) throw new Error(`生成请求包含未知能力 ID：${capabilityId}`)
  if (
    plan.status !== 'matched' || plan.templateId !== capability.templateId
    || plan.subject !== capability.subject
  ) {
    throw new Error(`大模型规划超出已选能力“${capability.label}”的学科或运行时范围。`)
  }
}

export async function generateSceneWithModel(
  prompt: string,
  capabilityId?: string,
  temporaryAccess?: TemporaryModelAccess,
  csrfToken?: string,
): Promise<ModelGenerationResult> {
  const endpoint = import.meta.env.VITE_SCENE_GENERATION_ENDPOINT || '/api/generate'
  const first = await postGenerationRequest(endpoint, {
    prompt, schemaVersion: '0.1', locale: 'zh-CN',
    ...(capabilityId ? { capabilityId } : {}),
  }, temporaryAccess, csrfToken)
  try {
    assertLessonPlan(first.plan)
    assertPlanMatchesCapability(first.plan, capabilityId)
    const scene = instantiateLessonPlan(first.plan)
    return {
      scene,
      plan: first.plan,
      usage: first.usage ?? {},
      provider: providerFromPayload(first),
    }
  } catch (error) {
    const validationError = error instanceof Error ? error.message : '浏览器本地场景校验失败。'
    const modelCalls = first.usage?.modelCalls
    if ((modelCalls !== 1 && !first.usage?.deduplicated) || !first.plan || typeof first.plan !== 'object') {
      if (modelCalls !== undefined && modelCalls >= 2) {
        throw new Error(`大模型自动纠错后场景仍无效：${validationError}`)
      }
      throw error
    }
    const repair = await postGenerationRequest(endpoint, {
      prompt,
      schemaVersion: '0.1',
      locale: 'zh-CN',
      correction: {
        previousPlan: first.plan,
        validationError: validationError.slice(0, 2400),
      },
      ...(capabilityId ? { capabilityId } : {}),
    }, temporaryAccess, csrfToken)
    try {
      assertLessonPlan(repair.plan)
      assertPlanMatchesCapability(repair.plan, capabilityId)
      const scene = instantiateLessonPlan(repair.plan)
      const firstUsage = first.usage ?? {}
      const repairUsage = repair.usage ?? {}
      return {
        scene,
        plan: repair.plan,
        usage: {
          inputTokens: usageSum(firstUsage.inputTokens, repairUsage.inputTokens),
          cachedInputTokens: usageSum(firstUsage.cachedInputTokens, repairUsage.cachedInputTokens),
          outputTokens: usageSum(firstUsage.outputTokens, repairUsage.outputTokens),
          modelCalls: usageSum(firstUsage.modelCalls, repairUsage.modelCalls) ?? 2,
          repaired: true,
          ...(firstUsage.deduplicated || repairUsage.deduplicated ? { deduplicated: true } : {}),
        },
        provider: providerFromPayload(repair) ?? providerFromPayload(first),
      }
    } catch (repairError) {
      const message = repairError instanceof Error ? repairError.message : '浏览器本地场景校验失败。'
      throw new Error(`大模型自动纠错后场景仍无效：${message}`)
    }
  }
}

export async function editSceneWithModel(
  instruction: string,
  currentScene: LessonScene,
  temporaryAccess?: TemporaryModelAccess,
  csrfToken?: string,
): Promise<ModelGenerationResult> {
  const endpoint = import.meta.env.VITE_SCENE_GENERATION_ENDPOINT || '/api/generate'
  const basePlan = lessonPlanFromScene(currentScene)
  const first = await postGenerationRequest(endpoint, {
    prompt: instruction,
    schemaVersion: '0.1',
    locale: 'zh-CN',
    edit: { basePlan },
  }, temporaryAccess, csrfToken)
  try {
    assertLessonPlan(first.plan)
    const changes = describeLessonPlanChanges(basePlan, first.plan)
    if (changes.length === 0) throw new Error('模型没有对当前场景产生可应用的修改。请更明确地描述要改变的对象或标注。')
    return {
      scene: instantiateContextualEdit(first.plan, basePlan, currentScene),
      plan: first.plan,
      usage: first.usage ?? {},
      changes,
      provider: providerFromPayload(first),
    }
  } catch (error) {
    const validationError = error instanceof Error ? error.message : '浏览器本地场景校验失败。'
    const modelCalls = first.usage?.modelCalls
    if ((modelCalls !== 1 && !first.usage?.deduplicated) || !first.plan || typeof first.plan !== 'object') {
      if (modelCalls !== undefined && modelCalls >= 2) {
        throw new Error(`大模型自动纠错后二次编辑仍无效：${validationError}`)
      }
      throw error
    }
    const repair = await postGenerationRequest(endpoint, {
      prompt: instruction,
      schemaVersion: '0.1',
      locale: 'zh-CN',
      correction: {
        basePlan,
        previousPlan: first.plan,
        validationError: validationError.slice(0, 2400),
      },
    }, temporaryAccess, csrfToken)
    try {
      assertLessonPlan(repair.plan)
      const changes = describeLessonPlanChanges(basePlan, repair.plan)
      if (changes.length === 0) throw new Error('模型纠错后仍未对当前场景产生可应用的修改。')
      const firstUsage = first.usage ?? {}
      const repairUsage = repair.usage ?? {}
      return {
        scene: instantiateContextualEdit(repair.plan, basePlan, currentScene),
        plan: repair.plan,
        changes,
        usage: {
          inputTokens: usageSum(firstUsage.inputTokens, repairUsage.inputTokens),
          cachedInputTokens: usageSum(firstUsage.cachedInputTokens, repairUsage.cachedInputTokens),
          outputTokens: usageSum(firstUsage.outputTokens, repairUsage.outputTokens),
          modelCalls: usageSum(firstUsage.modelCalls, repairUsage.modelCalls) ?? 2,
          repaired: true,
          ...(firstUsage.deduplicated || repairUsage.deduplicated ? { deduplicated: true } : {}),
        },
        provider: providerFromPayload(repair) ?? providerFromPayload(first),
      }
    } catch (repairError) {
      const message = repairError instanceof Error ? repairError.message : '浏览器本地场景校验失败。'
      throw new Error(`大模型自动纠错后二次编辑仍无效：${message}`)
    }
  }
}
