import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EllipseCanvas } from './components/EllipseCanvas'
import { QuadraticCanvas } from './components/QuadraticCanvas'
import { GenericFunctionCanvas } from './components/GenericFunctionCanvas'
import { TimeExperimentCanvas } from './components/TimeExperimentCanvas'
import { Geometry2DCanvas } from './components/Geometry2DCanvas'
import { Collision2DCanvas } from './components/Collision2DCanvas'
import { RelationCurve2DCanvas } from './components/RelationCurve2DCanvas'
import { DataChart2DCanvas } from './components/DataChart2DCanvas'
import { SettingsPanel } from './components/SettingsPanel'
import { LessonLibraryPanel } from './components/LessonLibraryPanel'
import { GenerationCapabilityDetails } from './components/GenerationCapabilityDetails'
import { GenerationReuseDetails } from './components/GenerationReuseDetails'
import { ModelAccessPanel } from './components/ModelAccessPanel'
import { UserAccountDialog } from './components/UserAccountDialog'
import {
  getEllipseSnapshot,
  normalizeAngle,
  resetSceneValues,
  updateAppearance,
  updateAxisParameter,
  validateAxisValues,
} from './core/ellipse'
import {
  getQuadraticSnapshot,
  QUADRATIC_TEMPLATE_ID,
  resetQuadraticScene,
  updateQuadraticParameter,
  validateQuadraticValues,
  type QuadraticParameterId,
} from './core/quadratic'
import {
  GENERIC_FUNCTION_TEMPLATE_ID,
  resetGenericFunctionScene,
  updateGenericFunctionParameter,
} from './core/genericFunction'
import {
  getTimeExperimentSnapshot,
  resetTimeExperimentScene,
  TIME_EXPERIMENT_TEMPLATE_ID,
  updateTimeExperimentParameter,
} from './core/timeExperiment'
import {
  GEOMETRY_2D_TEMPLATE_ID,
  resetGeometryScene,
  updateGeometryParameter,
  updateGeometryPoint,
} from './core/geometry2d'
import {
  COLLISION_2D_TEMPLATE_ID,
  createCollision2DRuntime,
  resetCollisionScene,
  updateCollisionParameter,
} from './core/collision2d'
import {
  RELATION_CURVE_2D_TEMPLATE_ID,
  resetRelationCurveScene,
  updateRelationCurveParameter,
} from './core/relationCurve2d'
import {
  DATA_CHART_2D_TEMPLATE_ID,
  resetDataChartScene,
} from './core/dataChart2d'
import { exportSceneAsStandaloneHtml } from './core/exportHtml'
import {
  createSceneFromTemplate,
  routeGenerationRequest,
} from './core/intentParser'
import {
  assertSceneRendererSupported,
  editSceneWithModel,
  generateSceneWithModel,
  getModelServiceStatus,
  getPublicModelOptions,
  lessonPlanFromScene,
  type ModelServiceStatus,
  type PublicModelOption,
  type TemporaryModelAccess,
} from './core/modelGateway'
import {
  cacheScene,
  downloadTextFile,
  getCachedScene,
  loadDraft,
  saveDraft,
} from './core/storage'
import { validateLessonScene } from './core/validateScene'
import { createLessonPackageFromScene, parseLessonImport } from './core/lessonPackage'
import { describeLessonPlanChanges } from './core/lessonPlanDiff'
import {
  getOfficialLibraryEntries,
  loadThirdPartyLibrary,
  removeThirdPartyEntry,
  saveThirdPartyScene,
  type LessonLibraryEntry,
} from './core/lessonLibrary'
import {
  loadSharedSubmissionStatus,
  loadSharedLessonLibrary,
  submitSceneToSharedLibrary,
  type SharedSubmissionStatus,
} from './core/sharedLessonLibrary'
import { createEllipseScene } from './templates/ellipseTemplate'
import type {
  LessonScene,
  ObjectAppearanceOverride,
  SceneAppearance,
} from './types/lessonScene'
import { isNumberParameter } from './types/lessonScene'
import { resetObjectAppearance, updateObjectAppearance } from './core/objectAppearance'
import {
  applyLayoutPreset,
  applyStylePreset,
  layoutPresetOf,
  resetAppearanceToTemplate,
  STYLE_PRESETS,
  LAYOUT_PRESETS,
  type StylePresetId,
} from './core/appearancePresets'
import type { LayoutPresetId } from './types/lessonScene'
import {
  contextualReuseCacheKey,
  decideSceneReuse,
  materializeReusableScene,
  modelReuseCacheKey,
  templateReuseCacheKey,
} from './core/sceneReuse'
import {
  loginUser,
  logoutUser,
  restoreUserSession,
  type UserSession,
} from './core/userSessionApi'

interface SceneHistory {
  past: LessonScene[]
  present: LessonScene
  future: LessonScene[]
}

interface AppStatus {
  tone: 'neutral' | 'success' | 'warning' | 'error'
  title: string
  detail: string
  changes?: string[]
}

interface SharedLibraryStatus {
  state: 'idle' | 'loading' | 'ready' | 'error'
  detail: string
}

const DEFAULT_PROMPT = '制作一个椭圆函数图像，椭圆边上的点可以拖动，显示它到两个焦点的距离，并演示距离之和不变。长轴设为 10，短轴设为 6。'

function pointAngle(scene: LessonScene): number {
  const parameter = scene.parameters.pointAngle
  return isNumberParameter(parameter) ? parameter.value : 0.72
}

function applyCurrentAppearance(cached: LessonScene, current: LessonScene): LessonScene {
  const next = structuredClone(cached)
  next.appearance = structuredClone(current.appearance)
  next.lineage.parentSceneId = current.id
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

function safeFilename(title: string, extension: string): string {
  const name = title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'lesson-scene'
  return `${name}.${extension}`
}

function initialScene(): LessonScene {
  const draft = loadDraft()
  if (draft) {
    try {
      assertSceneRendererSupported(draft)
      return draft
    } catch {
      // Ignore drafts created for renderers that are not installed in this build.
    }
  }
  return createEllipseScene()
}

export default function App() {
  const [history, setHistory] = useState<SceneHistory>(() => ({
    past: [],
    present: initialScene(),
    future: [],
  }))
  const scene = history.present
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [angle, setAngle] = useState(() => pointAngle(history.present))
  const [zoom, setZoom] = useState(1)
  const [trailAngles, setTrailAngles] = useState<number[]>([])
  const [experimentTime, setExperimentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [officialLibrary] = useState(() => getOfficialLibraryEntries())
  const [thirdPartyLibrary, setThirdPartyLibrary] = useState(() => loadThirdPartyLibrary())
  const [sharedThirdPartyLibrary, setSharedThirdPartyLibrary] = useState<LessonLibraryEntry[]>([])
  const [sharedLibraryStatus, setSharedLibraryStatus] = useState<SharedLibraryStatus>({
    state: 'idle',
    detail: '共享目录尚未刷新',
  })
  const [submissionStatuses, setSubmissionStatuses] = useState<Record<string, SharedSubmissionStatus>>({})
  const [submissionStatusesLoading, setSubmissionStatusesLoading] = useState(false)
  const [activeLocalEntryId, setActiveLocalEntryId] = useState<string | null>(null)
  const [submittingEntryId, setSubmittingEntryId] = useState<string | null>(null)
  const [parameterError, setParameterError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [modelStatus, setModelStatus] = useState<ModelServiceStatus>({
    reachable: false,
    configured: false,
    apiCompatible: false,
    provider: '未配置模型服务',
    model: '未选择模型',
    baseURL: '',
  })
  const [modelOptions, setModelOptions] = useState<PublicModelOption[]>([])
  const [modelOptionsError, setModelOptionsError] = useState('')
  const [temporaryModelAccess, setTemporaryModelAccess] = useState<TemporaryModelAccess | undefined>()
  const [userSession, setUserSession] = useState<UserSession | null>(null)
  const [userAccountOpen, setUserAccountOpen] = useState(false)
  const [userAccountBusy, setUserAccountBusy] = useState(false)
  const [userAccountError, setUserAccountError] = useState('')
  const [status, setStatus] = useState<AppStatus>({
    tone: 'neutral',
    title: '内置模板已就绪',
    detail: '可以直接拖动图形，或输入描述生成新的参数实例。',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const submissionRefreshIdRef = useRef(0)
  const validation = useMemo(() => validateLessonScene(scene), [scene])
  const ellipseScene = scene.templateRef.id === 'math.conic.ellipse-focus-sum'
  const quadraticScene = scene.templateRef.id === QUADRATIC_TEMPLATE_ID
  const genericFunctionScene = scene.templateRef.id === GENERIC_FUNCTION_TEMPLATE_ID
  const timeExperimentScene = scene.templateRef.id === TIME_EXPERIMENT_TEMPLATE_ID
  const geometry2DScene = scene.templateRef.id === GEOMETRY_2D_TEMPLATE_ID
  const collision2DScene = scene.templateRef.id === COLLISION_2D_TEMPLATE_ID
  const relationCurve2DScene = scene.templateRef.id === RELATION_CURVE_2D_TEMPLATE_ID
  const dataChart2DScene = scene.templateRef.id === DATA_CHART_2D_TEMPLATE_ID
  const mathParameterTraceScene = timeExperimentScene && scene.metadata.subject === 'math'
  const ellipseSnapshot = useMemo(
    () => ellipseScene ? getEllipseSnapshot(scene, angle) : null,
    [angle, ellipseScene, scene],
  )
  const quadraticSnapshot = useMemo(
    () => quadraticScene ? getQuadraticSnapshot(scene) : null,
    [quadraticScene, scene],
  )
  const timeExperimentSnapshot = useMemo(
    () => timeExperimentScene ? getTimeExperimentSnapshot(scene, experimentTime) : null,
    [experimentTime, scene, timeExperimentScene],
  )
  const timeExperimentDuration = timeExperimentSnapshot?.duration
  const collisionRuntime = useMemo(
    () => collision2DScene ? createCollision2DRuntime(scene) : null,
    [collision2DScene, scene],
  )
  const dynamicExperimentDuration = timeExperimentDuration ?? collisionRuntime?.duration
  const generationRoute = useMemo(() => routeGenerationRequest(prompt), [prompt])
  const combinedThirdPartyLibrary = useMemo(
    () => [...sharedThirdPartyLibrary, ...thirdPartyLibrary],
    [sharedThirdPartyLibrary, thirdPartyLibrary],
  )
  const reuseDecision = useMemo(
    () => decideSceneReuse(
      prompt,
      generationRoute,
      [...officialLibrary, ...combinedThirdPartyLibrary],
    ),
    [combinedThirdPartyLibrary, generationRoute, officialLibrary, prompt],
  )
  const temporaryModelOption = useMemo(
    () => modelOptions.find((option) => option.id === temporaryModelAccess?.modelId),
    [modelOptions, temporaryModelAccess?.modelId],
  )
  const activeModelIdentity = temporaryModelAccess && temporaryModelOption
    ? temporaryModelOption
    : modelStatus
  const temporaryModelReady = Boolean(temporaryModelAccess && temporaryModelOption)
  const modelReady = modelStatus.reachable && modelStatus.apiCompatible && (
    temporaryModelReady || (modelStatus.configured && Boolean(userSession))
  )
  const modelDisplay = temporaryModelReady
    ? `${temporaryModelOption?.model ?? temporaryModelAccess?.modelId} · 自带 Key`
    : modelStatus.configured
      ? userSession ? `${modelStatus.model} · 平台额度` : `${modelStatus.model} · 登录后可用`
      : `${modelStatus.model} 未配置`

  const commitScene = useCallback((next: LessonScene, nextStatus?: AppStatus): boolean => {
    const result = validateLessonScene(next)
    if (!result.valid) {
      const firstError = result.issues.find((issue) => issue.severity === 'error')
      setStatus({
        tone: 'error',
        title: '场景未通过校验',
        detail: firstError?.message ?? '场景包含不合法配置。',
      })
      return false
    }
    setHistory((current) => ({
      past: [...current.past.slice(-49), current.present],
      present: next,
      future: [],
    }))
    if (nextStatus) setStatus(nextStatus)
    return true
  }, [])

  useEffect(() => {
    let active = true
    void getModelServiceStatus().then((next) => {
      if (active) setModelStatus(next)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void restoreUserSession()
      .then((session) => { if (active) setUserSession(session) })
      .catch(() => { if (active) setUserSession(null) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void getPublicModelOptions()
      .then((options) => {
        if (!active) return
        setModelOptions(options.models)
        setModelOptionsError('')
      })
      .catch((error) => {
        if (!active) return
        setModelOptionsError(error instanceof Error ? error.message : '无法读取可信模型目录。')
      })
    return () => { active = false }
  }, [])

  const applyTemporaryModelAccess = useCallback((access: TemporaryModelAccess) => {
    setTemporaryModelAccess(access)
    const option = modelOptions.find((candidate) => candidate.id === access.modelId)
    setStatus({
      tone: 'neutral',
      title: '已启用当前页面的临时 API Key',
      detail: `${option?.model ?? access.modelId} 将用于后续模型请求；刷新或关闭页面后自动清除。`,
    })
  }, [modelOptions])

  const clearTemporaryModelAccess = useCallback(() => {
    setTemporaryModelAccess(undefined)
    setStatus({
      tone: 'neutral',
      title: '临时 API Key 已清除',
      detail: '后续模型请求恢复使用平台默认模型和有限额度。',
    })
  }, [])

  const handleUserLogin = useCallback(async (accessCode: string) => {
    setUserAccountBusy(true)
    setUserAccountError('')
    try {
      const session = await loginUser(accessCode)
      setUserSession(session)
      setUserAccountOpen(false)
      setStatus({
        tone: 'success',
        title: `欢迎，${session.user.displayName}`,
        detail: `已启用平台有限额度：每日 ${session.user.quota.dailyCalls} 次调用、${session.user.quota.dailyTokens} Token。`,
      })
    } catch (error) {
      setUserAccountError(error instanceof Error ? error.message : '登录失败。')
    } finally {
      setUserAccountBusy(false)
    }
  }, [])

  const handleUserLogout = useCallback(async () => {
    setUserAccountBusy(true)
    try {
      if (userSession) await logoutUser(userSession.csrfToken)
    } catch {
      // The local view is cleared even if the session already expired.
    } finally {
      setUserSession(null)
      setUserAccountBusy(false)
      setUserAccountOpen(false)
      setStatus({ tone: 'neutral', title: '已退出登录', detail: '本地编辑和临时自带 API Key 仍可继续使用。' })
    }
  }, [userSession])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        saveDraft(scene)
        setSavedAt(new Date())
      } catch {
        setStatus({
          tone: 'warning',
          title: '本地保存失败',
          detail: '浏览器可能禁止本地存储；当前编辑仍保留在页面中。',
        })
      }
    }, 280)
    return () => window.clearTimeout(timer)
  }, [scene])

  useEffect(() => {
    setIsPlaying(false)
    setSelectedObjectId(null)
    setAngle(pointAngle(scene))
    setTrailAngles([])
    setExperimentTime(0)
    setZoom(1)
  }, [scene.templateRef.id])

  useEffect(() => {
    if (selectedObjectId && !scene.objects.some((object) => object.id === selectedObjectId)) {
      setSelectedObjectId(null)
    }
  }, [scene.objects, selectedObjectId])

  const handleAngleChange = useCallback((nextAngle: number) => {
    const normalized = normalizeAngle(nextAngle)
    setAngle(normalized)
    setTrailAngles((current) => {
      const last = current.at(-1)
      if (last !== undefined && Math.abs(last - normalized) < 0.035) return current
      return [...current.slice(-179), normalized]
    })
  }, [])

  useEffect(() => {
    if (!isPlaying || !ellipseScene) return
    let frameId = 0
    let previous = performance.now()
    const animate = (now: number) => {
      const delta = Math.min(0.05, (now - previous) / 1000)
      previous = now
      setAngle((current) => {
        const next = normalizeAngle(current + delta * scene.appearance.animationSpeed)
        setTrailAngles((trail) => {
          const last = trail.at(-1)
          if (last !== undefined && Math.abs(last - next) < 0.035) return trail
          return [...trail.slice(-179), next]
        })
        return next
      })
      frameId = requestAnimationFrame(animate)
    }
    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [ellipseScene, isPlaying, scene.appearance.animationSpeed])

  useEffect(() => {
    if (!isPlaying || (!timeExperimentScene && !collision2DScene) || dynamicExperimentDuration === undefined) return
    let frameId = 0
    let previous = performance.now()
    const animate = (now: number) => {
      const delta = Math.min(0.05, (now - previous) / 1000)
      previous = now
      setExperimentTime((current) => {
        const next = current + delta * scene.appearance.animationSpeed * 2
        if (next >= dynamicExperimentDuration) {
          setIsPlaying(false)
          return dynamicExperimentDuration
        }
        return next
      })
      frameId = requestAnimationFrame(animate)
    }
    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [collision2DScene, dynamicExperimentDuration, isPlaying, scene.appearance.animationSpeed, timeExperimentScene])

  const handleParameterChange = (id: string, value: number) => {
    if (relationCurve2DScene) {
      const parameter = scene.parameters[id]
      if (!isNumberParameter(parameter)) return
      try {
        setParameterError(null)
        const committed = commitScene(updateRelationCurveParameter(scene, id, value), {
          tone: 'success', title: '曲线参数已更新',
          detail: '关系曲线已由本地安全运行时重新采样，AI token：0。',
          changes: [`${parameter.label}改为 ${value}`],
        })
        if (committed) setZoom(1)
      } catch (error) {
        setParameterError(error instanceof Error ? error.message : '曲线参数无效。')
      }
      return
    }
    if (collision2DScene) {
      const parameter = scene.parameters[id]
      if (!isNumberParameter(parameter)) return
      try {
        setParameterError(null)
        const committed = commitScene(updateCollisionParameter(scene, id, value), {
          tone: 'success', title: '碰撞参数已更新',
          detail: '完整碰撞时段已由本地确定性求解器重新计算并校验，AI token：0。',
          changes: [`${parameter.label}改为 ${value}`],
        })
        if (committed) {
          setExperimentTime(0)
          setIsPlaying(false)
          setZoom(1)
        }
      } catch (error) {
        setParameterError(error instanceof Error ? error.message : '碰撞参数无效。')
      }
      return
    }
    if (geometry2DScene) {
      const parameter = scene.parameters[id]
      if (!isNumberParameter(parameter)) return
      try {
        setParameterError(null)
        const committed = commitScene(updateGeometryParameter(scene, id, value), {
          tone: 'success', title: '几何参数已更新',
          detail: '点坐标、几何构造和测量值已在本地重新计算，AI token：0。',
          changes: [`${parameter.label}改为 ${value}`],
        })
        if (committed) setZoom(1)
      } catch (error) {
        setParameterError(error instanceof Error ? error.message : '几何参数无效。')
      }
      return
    }
    if (timeExperimentScene) {
      const parameter = scene.parameters[id]
      if (!isNumberParameter(parameter)) return
      try {
        setParameterError(null)
        const committed = commitScene(updateTimeExperimentParameter(scene, id, value), {
          tone: 'success', title: '实验参数已更新',
          detail: '运动状态、持续时间和测量量已在本地重新计算，AI token：0。',
          changes: [`${parameter.label}改为 ${value}`],
        })
        if (committed) {
          setExperimentTime(0)
          setIsPlaying(false)
          setZoom(1)
        }
      } catch (error) {
        setParameterError(error instanceof Error ? error.message : '实验参数无效。')
      }
      return
    }
    if (genericFunctionScene) {
      const parameter = scene.parameters[id]
      if (!isNumberParameter(parameter)) return
      try {
        setParameterError(null)
        const committed = commitScene(updateGenericFunctionParameter(scene, id, value), {
          tone: 'success',
          title: '参数已更新',
          detail: '通用函数已由安全本地运行时重新采样，AI token：0。',
          changes: [`${parameter.label}改为 ${value}`],
        })
        if (committed) setZoom(1)
      } catch (error) {
        setParameterError(error instanceof Error ? error.message : '参数无效。')
      }
      return
    }
    if (quadraticScene) {
      if (id !== 'coefficientA' && id !== 'vertexH' && id !== 'vertexK') return
      const coefficientA = scene.parameters.coefficientA
      const vertexH = scene.parameters.vertexH
      const vertexK = scene.parameters.vertexK
      if (!isNumberParameter(coefficientA) || !isNumberParameter(vertexH) || !isNumberParameter(vertexK)) return
      const values = {
        coefficientA: id === 'coefficientA' ? value : coefficientA.value,
        vertexH: id === 'vertexH' ? value : vertexH.value,
        vertexK: id === 'vertexK' ? value : vertexK.value,
      }
      const error = validateQuadraticValues(scene, values)
      if (error) {
        setParameterError(error)
        return
      }
      setParameterError(null)
      const parameter = scene.parameters[id]
      const committed = commitScene(updateQuadraticParameter(scene, id as QuadraticParameterId, value), {
        tone: 'success',
        title: '参数已更新',
        detail: '函数图像和顶点已在本地重新计算，AI token：0。',
        changes: [`${parameter?.label ?? id}改为 ${value}`],
      })
      if (committed) setZoom(1)
      return
    }

    if (id !== 'majorAxis' && id !== 'minorAxis') return
    const major = scene.parameters.majorAxis
    const minor = scene.parameters.minorAxis
    if (!isNumberParameter(major) || !isNumberParameter(minor)) return
    const nextMajor = id === 'majorAxis' ? value : major.value
    const nextMinor = id === 'minorAxis' ? value : minor.value
    const error = validateAxisValues(scene, nextMajor, nextMinor)
    if (error) {
      setParameterError(error)
      return
    }
    setParameterError(null)
    const committed = commitScene(updateAxisParameter(scene, id, value), {
      tone: 'success',
      title: '参数已更新',
      detail: '图形和派生数值已在本地重新计算，AI token：0。',
      changes: [`${id === 'majorAxis' ? '长轴全长' : '短轴全长'}改为 ${value}`],
    })
    if (committed) setZoom(1)
  }

  const handleGeometryPointChange = useCallback((pointId: string, x: number, y: number) => {
    if (!geometry2DScene) return
    try {
      setParameterError(null)
      commitScene(updateGeometryPoint(scene, pointId, x, y), {
        tone: 'success',
        title: '几何点已移动',
        detail: '点坐标和全部测量值已在本地更新，AI token：0。',
      })
    } catch (error) {
      setParameterError(error instanceof Error ? error.message : '无法移动几何点。')
    }
  }, [commitScene, geometry2DScene, scene])

  const handleAppearanceChange = <K extends keyof SceneAppearance>(
    key: K,
    value: SceneAppearance[K],
  ) => {
    commitScene(updateAppearance(scene, key, value), {
      tone: 'success',
      title: '显示效果已更新',
      detail: '只修改了场景外观配置，AI token：0。',
    })
  }

  const handleObjectAppearanceChange = (
    objectId: string,
    patch: Partial<ObjectAppearanceOverride>,
  ) => {
    try {
      const object = scene.objects.find((candidate) => candidate.id === objectId)
      commitScene(updateObjectAppearance(scene, objectId, patch), {
        tone: 'success',
        title: '对象样式已更新',
        detail: `只修改了“${object?.label ?? object?.role ?? objectId}”的本地外观，AI token：0。`,
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        title: '无法修改对象样式',
        detail: error instanceof Error ? error.message : '对象样式补丁无效。',
      })
    }
  }

  const handleObjectAppearanceReset = (objectId: string) => {
    try {
      const object = scene.objects.find((candidate) => candidate.id === objectId)
      commitScene(resetObjectAppearance(scene, objectId), {
        tone: 'neutral',
        title: '对象样式已恢复',
        detail: `“${object?.label ?? object?.role ?? objectId}”重新使用场景默认外观，AI token：0。`,
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        title: '无法恢复对象样式',
        detail: error instanceof Error ? error.message : '对象不存在。',
      })
    }
  }

  const handleStylePresetApply = (presetId: StylePresetId, resetObjectStyles: boolean) => {
    const preset = STYLE_PRESETS.find((item) => item.id === presetId)
    commitScene(applyStylePreset(scene, presetId, resetObjectStyles), {
      tone: 'success',
      title: `已应用“${preset?.label ?? presetId}”`,
      detail: `样式预设已作为受控本地补丁应用${resetObjectStyles ? '，对象局部样式已清除' : '，对象局部样式保持不变'}，AI token：0。`,
    })
  }

  const handleLayoutPresetApply = (presetId: LayoutPresetId) => {
    const preset = LAYOUT_PRESETS.find((item) => item.id === presetId)
    commitScene(applyLayoutPreset(scene, presetId), {
      tone: 'success',
      title: `已应用“${preset?.label ?? presetId}”布局`,
      detail: '画布、测量值和参数区已按本地布局预设重新组合，AI token：0。',
    })
  }

  const handleAppearanceReset = (resetObjectStyles: boolean) => {
    commitScene(resetAppearanceToTemplate(scene, resetObjectStyles), {
      tone: 'neutral',
      title: '已恢复模板外观',
      detail: `场景级样式与布局已恢复默认${resetObjectStyles ? '，对象局部样式已清除' : '，对象局部样式保持不变'}，AI token：0。`,
    })
  }

  const handleGenerate = async (mode: 'create' | 'edit' = 'create') => {
    setIsGenerating(true)
    setParameterError(null)
    await Promise.resolve()
    try {
      const route = routeGenerationRequest(prompt)
      if (route.kind === 'settings') {
        setStatus({ tone: 'warning', title: route.label, detail: route.reason })
        return
      }

      if (route.kind === 'unsupported') {
        setStatus({
          tone: 'warning',
          title: route.label,
          detail: route.reason,
          changes: route.missingCapabilities.length > 0
            ? [
                `缺少：${route.missingCapabilities.map((item) => item.label).join('、')}`,
                `建议：${route.missingCapabilities[0]?.suggestion ?? '等待对应运行时实现。'}`,
              ]
            : undefined,
        })
        return
      }

      if (mode === 'create' && route.kind === 'template') {
        const templateId = route.templateId ?? 'unknown'
        const key = templateReuseCacheKey(prompt, templateId)
        const cached = getCachedScene(key)
        const generated = cached ? null : createSceneFromTemplate(prompt)
        const next = cached ?? generated!.scene
        if (!cached && generated) cacheScene(key, generated.scene)
        const applied = commitScene(next, {
          tone: 'success',
          title: cached ? '已精确复用缓存场景' : `已复用${next.metadata.title}模板`,
          detail: `${cached ? '精确缓存命中' : '模板命中'} · 未调用大模型 · AI token：0`,
          changes: generated
            ? [...generated.changes, ...generated.notices]
            : ['直接加载相同描述的已校验场景。'],
        })
        if (applied) {
          setAngle(pointAngle(next))
          setExperimentTime(0)
          setTrailAngles([])
          setIsPlaying(false)
          setZoom(1)
        }
        return
      }

      const capabilityId = route.requiredCapabilities[0]?.id
      const createCacheKey = modelReuseCacheKey(
        prompt, capabilityId, activeModelIdentity.provider, activeModelIdentity.model, activeModelIdentity.protocol,
      )

      if (mode === 'create') {
        const cached = getCachedScene(createCacheKey, {
          templateId: route.templateId,
          subject: route.subject,
        })
        if (cached) {
          assertSceneRendererSupported(cached)
          if (commitScene(cached, {
            tone: 'success',
            title: '已精确复用生成结果',
            detail: '相同描述和能力已通过本地缓存恢复 · 未调用大模型 · AI token：0',
            changes: ['缓存键同时匹配描述、能力 ID、模型版本和场景协议。'],
          })) {
            setAngle(pointAngle(cached))
            setExperimentTime(0)
            setTrailAngles([])
            setIsPlaying(false)
            setZoom(1)
          }
          return
        }
      }

      if (mode === 'create' && reuseDecision.action === 'reuse-directly' && reuseDecision.candidate) {
        const reused = materializeReusableScene(reuseDecision.candidate, prompt)
        cacheScene(createCacheKey, reused.scene)
        if (commitScene(reused.scene, {
          tone: 'success',
          title: `已复用${reuseDecision.candidate.title}`,
          detail: `${reuseDecision.source === 'official' ? '官方库' : '已审核第三方库'}${reuseDecision.matchLevel === 'exact' ? '精确命中' : '同能力命中'} · 未调用大模型 · AI token：0`,
          changes: reused.changes.length > 0
            ? [`基础场景：${reuseDecision.candidate.title}`, ...reused.changes]
            : [`直接加载已通过协议、学科和交互审核的场景：${reuseDecision.candidate.title}`],
        })) {
          setAngle(pointAngle(reused.scene))
          setExperimentTime(0)
          setTrailAngles([])
          setIsPlaying(false)
          setZoom(1)
        }
        return
      }

      const reuseBaseScene = mode === 'create' && reuseDecision.action === 'use-as-model-base'
        ? reuseDecision.candidate?.scene
        : undefined
      const contextualBaseScene = mode === 'edit' ? scene : reuseBaseScene
      const basePlan = contextualBaseScene ? lessonPlanFromScene(contextualBaseScene) : null
      const key = basePlan
        ? contextualReuseCacheKey(prompt, basePlan, activeModelIdentity.provider, activeModelIdentity.model, activeModelIdentity.protocol)
        : createCacheKey

      if (basePlan && contextualBaseScene) {
        const cached = getCachedScene(key, {
          templateId: basePlan.templateId,
          subject: basePlan.subject,
        })
        if (cached) {
          assertSceneRendererSupported(cached)
          const next = mode === 'edit' ? applyCurrentAppearance(cached, scene) : cached
          const cachedChanges = describeLessonPlanChanges(basePlan, lessonPlanFromScene(next))
          if (cachedChanges.length > 0) {
            if (commitScene(next, {
              tone: 'success',
              title: mode === 'edit' ? '已精确复用场景修改' : '已精确复用相似场景修改',
              detail: mode === 'edit'
                ? '相同当前规划和修改要求已通过本地缓存恢复 · 未调用大模型 · AI token：0'
                : `已恢复基于“${reuseDecision.candidate?.title ?? '审核场景'}”的相同修改 · 未调用大模型 · AI token：0`,
              changes: cachedChanges,
            })) {
              setAngle(pointAngle(next))
              setExperimentTime(0)
              setTrailAngles([])
              setIsPlaying(false)
              setZoom(1)
            }
            return
          }
        }
      }

      if (!modelReady) {
        const loginRequired = modelStatus.reachable && modelStatus.apiCompatible &&
          modelStatus.configured && !temporaryModelReady && !userSession
        if (loginRequired) setUserAccountOpen(true)
        setStatus({
          tone: 'warning',
          title: '已判断需要调用大模型',
          detail: !modelStatus.reachable
            ? '无法连接本项目的模型代理服务，请通过 npm run dev 启动统一开发服务器。'
            : !modelStatus.apiCompatible
              ? '生成服务仍在运行旧协议，请停止并重新执行 npm run dev，然后刷新浏览器。'
              : loginRequired
                ? '平台模型需要登录后使用。也可以在“模型来源”中提供当前页面临时 API Key。'
              : modelOptionsError
                ? `${modelOptionsError} 请重启统一服务后重试。`
                : '平台尚未配置 API Key。也可以在“模型来源”中临时提供自己的 Key。',
        })
        return
      }

      const generated = contextualBaseScene
        ? await editSceneWithModel(prompt, contextualBaseScene, temporaryModelAccess, userSession?.csrfToken)
        : await generateSceneWithModel(prompt, capabilityId, temporaryModelAccess, userSession?.csrfToken)
      const usageText = [
        generated.usage.deduplicated ? '服务端幂等复用' : null,
        generated.usage.modelCalls !== undefined ? `调用 ${generated.usage.modelCalls} 次` : null,
        generated.usage.inputTokens !== undefined ? `输入 ${generated.usage.inputTokens}` : null,
        generated.usage.cachedInputTokens !== undefined ? `缓存 ${generated.usage.cachedInputTokens}` : null,
        generated.usage.outputTokens !== undefined ? `输出 ${generated.usage.outputTokens}` : null,
      ].filter(Boolean).join(' / ')
      if (commitScene(generated.scene, {
        tone: 'success',
        title: mode === 'edit'
          ? generated.usage.repaired
            ? `${generated.provider?.model ?? '大模型'} 已纠错并修改当前场景`
            : `${generated.provider?.model ?? '大模型'} 已修改当前场景`
          : reuseBaseScene
            ? `${generated.provider?.model ?? '大模型'} 已基于${reuseDecision.candidate?.title ?? '相似场景'}创建场景`
          : generated.usage.repaired
            ? `${generated.provider?.model ?? '大模型'} 已自动纠错并创建场景`
            : `${generated.provider?.model ?? '大模型'} 已规划并创建场景`,
        detail: `${usageText ? `Token：${usageText}` : '生成服务未返回 token 统计。'}${mode === 'edit' ? ' · 已保留当前显示设置' : reuseBaseScene ? ' · 只发送相似场景的收窄规划进行修改' : ''}`,
        changes: contextualBaseScene
          ? [
              ...(reuseBaseScene ? [`复用基础场景：${reuseDecision.candidate?.title ?? '相似场景'}`] : []),
              ...(generated.changes ?? []),
            ]
          : undefined,
      })) {
        cacheScene(key, generated.scene)
        if (mode === 'create') cacheScene(createCacheKey, generated.scene)
        setAngle(pointAngle(generated.scene))
        setExperimentTime(0)
        setTrailAngles([])
        setIsPlaying(false)
        setZoom(1)
      }
    } catch (error) {
      setStatus({
        tone: 'error',
        title: '无法应用这条描述',
        detail: error instanceof Error ? error.message : '本地解析失败，请调整描述。',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const undo = () => {
    setHistory((current) => {
      const previous = current.past.at(-1)
      if (!previous) return current
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, 50),
      }
    })
    setStatus({ tone: 'neutral', title: '已撤销', detail: '已恢复到上一个场景状态。' })
  }

  const redo = () => {
    setHistory((current) => {
      const next = current.future[0]
      if (!next) return current
      return {
        past: [...current.past.slice(-49), current.present],
        present: next,
        future: current.future.slice(1),
      }
    })
    setStatus({ tone: 'neutral', title: '已重做', detail: '已重新应用场景修改。' })
  }

  const reset = () => {
    const next = dataChart2DScene
      ? resetDataChartScene(scene)
      : relationCurve2DScene
      ? resetRelationCurveScene(scene)
      : collision2DScene
      ? resetCollisionScene(scene)
      : geometry2DScene
      ? resetGeometryScene(scene)
      : timeExperimentScene
      ? resetTimeExperimentScene(scene)
      : genericFunctionScene
      ? resetGenericFunctionScene(scene)
      : quadraticScene ? resetQuadraticScene(scene) : resetSceneValues(scene)
    if (commitScene(next, {
      tone: 'neutral',
      title: '已恢复默认状态',
      detail: '参数、显示效果和动点位置均已重置。',
    })) {
      setAngle(pointAngle(next))
      setTrailAngles([])
      setExperimentTime(0)
      setIsPlaying(false)
      setZoom(1)
      setParameterError(null)
    }
  }

  const handleImport = async (file: File) => {
    try {
      const value: unknown = JSON.parse(await file.text())
      const imported = parseLessonImport(value)
      const next = imported.scene
      if (commitScene(next, {
        tone: 'success',
        title: '场景导入成功',
        detail: '协议、表达式、教学不变量和渲染能力均已通过校验。',
      })) {
        setAngle(pointAngle(next))
        setExperimentTime(0)
        setTrailAngles([])
        setIsPlaying(false)
        setZoom(1)
        try {
          const savedEntry = saveThirdPartyScene(next, file.name)
          setThirdPartyLibrary(loadThirdPartyLibrary())
          setActiveLocalEntryId(savedEntry.id)
          setStatus({
            tone: 'success',
            title: '场景导入成功并已加入第三方库',
            detail: `${imported.sourceFormat === 'lesson-package' ? '紧凑场景包' : 'LessonScene 文件'}已通过运行校验；内容标记为待管理员审核。`,
          })
        } catch {
          setStatus({
            tone: 'warning',
            title: '场景已导入，但第三方库保存失败',
            detail: '浏览器可能限制了本地存储；当前场景仍可正常使用。',
          })
        }
      }
    } catch (error) {
      setStatus({
        tone: 'error',
        title: '无法导入场景',
        detail: error instanceof Error ? error.message : '文件格式不正确。',
      })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const refreshSharedLibrary = useCallback(async () => {
    setSharedLibraryStatus({ state: 'loading', detail: '正在连接共享目录' })
    try {
      const entries = await loadSharedLessonLibrary()
      setSharedThirdPartyLibrary(entries)
      setSharedLibraryStatus({
        state: 'ready',
        detail: `已加载 ${entries.length} 个共享审核条目`,
      })
    } catch (error) {
      setSharedLibraryStatus({
        state: 'error',
        detail: error instanceof Error ? error.message : '共享目录暂时不可用',
      })
    }
  }, [])

  const refreshSubmissionStatuses = useCallback(async (notifyReturned = false) => {
    const refreshId = ++submissionRefreshIdRef.current
    if (thirdPartyLibrary.length === 0) {
      setSubmissionStatuses({})
      setSubmissionStatusesLoading(false)
      return
    }
    setSubmissionStatusesLoading(true)
    const results = await Promise.all(thirdPartyLibrary.map(async (entry) => {
      try {
        return { id: entry.id, status: await loadSharedSubmissionStatus(entry.scene), failed: false }
      } catch {
        return { id: entry.id, status: null, failed: true }
      }
    }))
    if (refreshId !== submissionRefreshIdRef.current) return
    setSubmissionStatuses((current) => {
      const localIds = new Set(thirdPartyLibrary.map((entry) => entry.id))
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => localIds.has(id)))
      for (const result of results) {
        if (result.failed) continue
        if (result.status) next[result.id] = result.status
        else delete next[result.id]
      }
      return next
    })
    const returned = results.filter(
      (result) => !result.failed && result.status?.reviewStatus === 'needs-changes',
    )
    if (notifyReturned && returned.length > 0) {
      const first = returned[0]!.status!
      setStatus({
        tone: 'warning',
        title: `${returned.length} 个第三方场景被退回修改`,
        detail: `${first.reviewNote ?? '管理员已经给出修改意见。'} 请打开实验库查看并修改。`,
      })
    }
    setSubmissionStatusesLoading(false)
  }, [thirdPartyLibrary])

  useEffect(() => {
    void refreshSubmissionStatuses(true)
  }, [refreshSubmissionStatuses])

  const refreshAllLibraries = useCallback(async () => {
    await Promise.all([refreshSharedLibrary(), refreshSubmissionStatuses(false)])
  }, [refreshSharedLibrary, refreshSubmissionStatuses])

  const openLibrary = () => {
    setLibraryOpen(true)
    void refreshAllLibraries()
  }

  const closeLibrary = useCallback(() => setLibraryOpen(false), [])

  const handleLibraryLoad = (entry: LessonLibraryEntry) => {
    const next = structuredClone(entry.scene)
    const feedback = entry.catalog === 'local' ? submissionStatuses[entry.id] : undefined
    if (commitScene(next, {
      tone: feedback?.reviewStatus === 'needs-changes' ? 'warning' : 'success',
      title: feedback?.reviewStatus === 'needs-changes'
        ? '已打开管理员退回的场景'
        : `已从${entry.source === 'official' ? '官方库' : '第三方库'}打开场景`,
      detail: feedback?.reviewStatus === 'needs-changes'
        ? `${feedback.reviewNote ?? '请根据审核意见修改。'} 修改要求已填入左侧；可点击“修改当前”，完成后点击顶部“保存修改”，再到实验库提交修改版本。`
        : entry.reviewStatus === 'pending'
          ? '该文件已通过运行校验；可继续修改，修改后保存到本地第三方库。'
          : '场景已通过对应目录的审核流程，可在右侧继续修改参数和显示效果。',
    })) {
      setAngle(pointAngle(next))
      setExperimentTime(0)
      setTrailAngles([])
      setIsPlaying(false)
      setZoom(1)
      setParameterError(null)
      setActiveLocalEntryId(entry.catalog === 'local' ? entry.id : null)
      if (feedback?.reviewStatus === 'needs-changes') {
        const guidance = feedback.reviewNote ?? feedback.preReview?.issues?.map((issue) => issue.suggestedAction).join('；')
        if (guidance) setPrompt(`请根据管理员审核意见修改当前场景：${guidance}`)
      }
      setLibraryOpen(false)
    }
  }

  const handleRemoveThirdParty = (id: string) => {
    submissionRefreshIdRef.current += 1
    setThirdPartyLibrary(removeThirdPartyEntry(id))
    setSubmissionStatuses((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    if (activeLocalEntryId === id) setActiveLocalEntryId(null)
    setStatus({
      tone: 'neutral',
      title: '已从本地第三方库移除',
      detail: '只删除了此设备中的库记录，当前正在展示的场景不受影响。',
    })
  }

  const handleSubmitThirdParty = async (entry: LessonLibraryEntry) => {
    if (entry.source !== 'third-party' || entry.catalog === 'shared') return
    if (!userSession) {
      setUserAccountError('提交共享审核需要先登录。')
      setUserAccountOpen(true)
      setStatus({
        tone: 'warning',
        title: '提交共享审核需要登录',
        detail: '请使用管理员签发的一次性登录码；本地文件没有被上传。',
      })
      return
    }
    const revisionText = entry.revisionOfSubmissionId
      ? '系统会把它关联为原退回提交的修改版本，供管理员直接比较。'
      : '提交后管理员可以查看其教学结构。'
    const confirmed = window.confirm(
      `确认将“${entry.title}”的紧凑场景包提交到共享审核队列吗？${revisionText}不会上传 API 密钥或完整显示外观。`,
    )
    if (!confirmed) return
    setSubmittingEntryId(entry.id)
    try {
      const result = await submitSceneToSharedLibrary(
        entry.scene,
        entry.sourceFilename,
        entry.revisionOfSubmissionId,
        userSession.csrfToken,
      )
      let feedback: SharedSubmissionStatus | null = null
      try {
        feedback = await loadSharedSubmissionStatus(entry.scene)
      } catch {
        // Submission succeeded; feedback can be refreshed independently later.
      }
      if (feedback) {
        setSubmissionStatuses((current) => ({ ...current, [entry.id]: feedback }))
      }
      const alreadyVerified = result.reviewStatus === 'verified'
      const returnedForChanges = result.reviewStatus === 'needs-changes'
      const rejected = result.reviewStatus === 'rejected'
      const preReview = result.preReview
      const preReviewTitle = preReview?.status === 'completed'
        ? preReview.verdict === 'no-issues'
          ? 'AI 预审未发现问题，等待管理员终审'
          : `AI 预审发现 ${preReview.issueCount ?? 0} 个问题，等待管理员终审`
        : preReview?.status === 'failed'
          ? '已提交，AI 预审未完成'
          : '已提交共享审核'
      const preReviewDetail = preReview?.status === 'completed'
        ? `${preReview.summary ?? '结构化预审已完成'} 最终审核状态仍由管理员决定。`
        : preReview?.status === 'failed'
          ? `${preReview.error ?? '模型服务暂时不可用。'} 文件仍保持 pending，管理员可以人工审核或重新预审。`
          : '场景包已进入待审核队列；审核通过前不会向其他用户公开。'
      setStatus({
        tone: returnedForChanges || rejected || preReview?.status === 'failed' ? 'warning' : 'success',
        title: alreadyVerified
          ? '共享目录已有相同的审核版本'
          : returnedForChanges
            ? '该版本已被管理员退回修改'
            : rejected
              ? '该版本未被共享目录收录'
              : preReviewTitle,
        detail: returnedForChanges || rejected
          ? `${feedback?.reviewNote ?? '请查看管理员审核意见。'} 修改内容后保存为新版本再提交。`
          : alreadyVerified
          ? '已加载管理员审核通过的共享条目。'
          : result.duplicate
            ? '相同内容已在审核队列中，没有重复创建。'
            : preReviewDetail,
      })
      if (alreadyVerified) await refreshSharedLibrary()
      else {
        setSharedLibraryStatus({
          state: 'ready',
          detail: result.duplicate
            ? '相同内容已在待审核队列'
            : preReview?.status === 'completed'
              ? preReview.verdict === 'no-issues' ? 'AI 预审未发现问题，等待终审' : `AI 预审发现 ${preReview.issueCount ?? 0} 个问题`
              : preReview?.status === 'failed' ? 'AI 预审未完成，等待人工处理' : '已提交，等待管理员审核',
        })
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '共享目录暂时不可用；本地场景未受影响。'
      setStatus({
        tone: 'error',
        title: '无法提交共享审核',
        detail,
      })
      setSharedLibraryStatus({ state: 'error', detail })
    } finally {
      setSubmittingEntryId(null)
    }
  }

  const saveCurrentRevision = () => {
    if (!activeLocalEntryId) return
    const existing = thirdPartyLibrary.find((entry) => entry.id === activeLocalEntryId)
    if (!existing) {
      setActiveLocalEntryId(null)
      return
    }
    try {
      submissionRefreshIdRef.current += 1
      const existingFeedback = submissionStatuses[activeLocalEntryId]
      const revisionParentId = existingFeedback && ['needs-changes', 'rejected', 'deprecated'].includes(existingFeedback.reviewStatus)
        ? existingFeedback.id
        : existing.revisionOfSubmissionId
      const saved = saveThirdPartyScene(
        scene,
        existing.sourceFilename,
        activeLocalEntryId,
        revisionParentId,
      )
      setThirdPartyLibrary(loadThirdPartyLibrary())
      setSubmissionStatuses((current) => {
        const next = { ...current }
        delete next[saved.id]
        return next
      })
      setStatus({
        tone: 'success',
        title: '修改版本已保存到本地第三方库',
        detail: revisionParentId
          ? '请打开实验库提交共享审核；管理员会看到它对应的原退回版本和具体修改差异。'
          : '请打开实验库，在该条目上点击“提交共享审核”，系统会按新内容创建或复用审核版本。',
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        title: '无法保存修改版本',
        detail: error instanceof Error ? error.message : '浏览器本地存储不可用。',
      })
    }
  }

  const exportJson = () => {
    downloadTextFile(
      safeFilename(scene.metadata.title, 'lesson.json'),
      JSON.stringify(scene, null, 2),
      'application/json;charset=utf-8',
    )
    setStatus({
      tone: 'success',
      title: '完整场景数据已导出',
      detail: '文件保留当前结构、参数和显示外观，可重新导入当前应用。',
    })
  }

  const exportLessonPackage = () => {
    try {
      const lessonPackage = createLessonPackageFromScene(scene)
      downloadTextFile(
        safeFilename(scene.metadata.title, 'word2html.json'),
        JSON.stringify(lessonPackage, null, 2),
        'application/json;charset=utf-8',
      )
      setStatus({
        tone: 'success',
        title: '紧凑场景包已导出',
        detail: '文件保留当前结构与参数，可分享、重新导入第三方库并继续二次编辑；纯显示外观请使用“完整数据”。',
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        title: '无法导出紧凑场景包',
        detail: error instanceof Error ? error.message : '当前场景不能转换为 LessonPlan。',
      })
    }
  }

  const exportHtml = () => {
    downloadTextFile(
      safeFilename(scene.metadata.title, 'html'),
      exportSceneAsStandaloneHtml(scene),
      'text/html;charset=utf-8',
    )
    setStatus({ tone: 'success', title: '交互 HTML 已导出', detail: '导出文件无需调用 AI，可在浏览器中独立运行。' })
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await stageRef.current?.requestFullscreen()
    } catch {
      setStatus({ tone: 'warning', title: '无法进入全屏', detail: '当前浏览器可能限制了全屏操作。' })
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="./" aria-label="Word2HTML 首页">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>Word2HTML</strong><small>交互教学场景</small></span>
        </a>
        <div className="document-status">
          <span className="save-dot" />
          {savedAt ? `${savedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 已保存到本地` : '正在保存'}
        </div>
        <nav className="top-actions" aria-label="文档操作">
          <button className="icon-text-button" type="button" onClick={undo} disabled={history.past.length === 0} title="撤销">
            <span aria-hidden="true">↶</span><b>撤销</b>
          </button>
          <button className="icon-text-button" type="button" onClick={redo} disabled={history.future.length === 0} title="重做">
            <span aria-hidden="true">↷</span><b>重做</b>
          </button>
          <button className={`secondary-button user-account-button ${userSession ? 'signed-in' : ''}`} type="button" onClick={() => { setUserAccountError(''); setUserAccountOpen(true) }}>
            {userSession ? userSession.user.displayName : '登录'}
          </button>
          <button className="secondary-button library-button" type="button" onClick={openLibrary}>实验库</button>
          {activeLocalEntryId && (
            <button className="secondary-button revision-save-button" type="button" onClick={saveCurrentRevision}>保存修改</button>
          )}
          <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>导入</button>
          <div className="export-actions">
            <button className="secondary-button" type="button" onClick={exportJson}>完整数据</button>
            <button className="secondary-button" type="button" onClick={exportLessonPackage}>场景包</button>
            <button className="primary-button" type="button" onClick={exportHtml}>导出 HTML</button>
          </div>
          <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImport(file) }} />
        </nav>
      </header>

      <main className="workspace">
        <aside className="prompt-panel">
          <div className="prompt-heading">
            <span className="eyebrow">自然语言创建</span>
            <h1>描述你想展示的内容</h1>
            <p>可生成新场景，也可让模型基于当前场景修改结构；参数和纯显示设置仍在右侧本地完成。</p>
          </div>

          <ModelAccessPanel
            modelStatus={modelStatus}
            options={modelOptions}
            optionsError={modelOptionsError}
            access={temporaryModelAccess}
            userAuthenticated={Boolean(userSession)}
            onApply={applyTemporaryModelAccess}
            onClear={clearTemporaryModelAccess}
          />

          <div className="prompt-box">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={8}
              aria-label="教学内容描述"
            />
            <div className="prompt-footer">
              <span>{prompt.length} 字</span>
              <div className="prompt-actions">
                <button className="edit-scene-button" type="button" onClick={() => void handleGenerate('edit')} disabled={isGenerating || !prompt.trim()}>
                  <span aria-hidden="true">↻</span>{isGenerating ? '处理中…' : '修改当前'}
                </button>
                <button className="generate-button" type="button" onClick={() => void handleGenerate('create')} disabled={isGenerating || !prompt.trim()}>
                  <span aria-hidden="true">✦</span>{isGenerating ? '处理中…' : '生成新场景'}
                </button>
              </div>
            </div>
          </div>

          <div className={`route-decision route-decision--${generationRoute.kind}`}>
            <span className="route-decision-icon" aria-hidden="true">
              {generationRoute.kind === 'template' || reuseDecision.action === 'reuse-directly' ? '◇' : generationRoute.kind === 'model' ? '✦' : generationRoute.kind === 'unsupported' ? '!' : '↗'}
            </span>
            <div>
              <strong>{generationRoute.label}</strong>
              <p>{generationRoute.willCallModel && reuseDecision.action === 'reuse-directly'
                ? '已找到可直接复用的审核场景，本次不会调用大模型。'
                : generationRoute.reason}</p>
              <GenerationCapabilityDetails route={generationRoute} reuseDecision={reuseDecision} />
              <GenerationReuseDetails decision={reuseDecision} />
              {generationRoute.kind === 'model' && reuseDecision.action !== 'reuse-directly' && (
                <small className={modelReady ? 'model-ready' : 'model-missing'}>
                  {!modelStatus.apiCompatible && modelStatus.reachable
                    ? '服务版本需重启'
                    : modelReady ? `${modelDisplay} 已就绪` : `${modelStatus.model} 未配置`}
                </small>
              )}
            </div>
          </div>

          <div className="example-section">
            <span>示例教学内容</span>
            <div className="example-chips">
              {['演示椭圆焦点距离和', '演示二次函数顶点变化', '绘制 y=A*sin(B*x)，可调 A 和 B', '模拟自由落体运动，可调初始高度和重力加速度', '展示酸碱中和过程'].map((example) => (
                <button key={example} type="button" onClick={() => setPrompt(example)}>{example}</button>
              ))}
            </div>
          </div>

          <section className={`result-card result-card--${status.tone}`} aria-live="polite">
            <div className="result-icon" aria-hidden="true">{status.tone === 'error' ? '!' : status.tone === 'warning' ? '△' : '✓'}</div>
            <div>
              <strong>{status.title}</strong>
              <p>{status.detail}</p>
              {status.changes && status.changes.length > 0 && (
                <ul>{status.changes.map((change) => <li key={change}>{change}</li>)}</ul>
              )}
            </div>
          </section>

          <div className="runtime-facts">
            <div><span>模板</span><strong>{scene.templateRef.id.split('.').at(-1)}@{scene.templateRef.version}</strong></div>
            <div><span>协议</span><strong>LessonScene 0.1</strong></div>
            <div><span>生成路由</span><strong>{generationRoute.label}</strong></div>
            <div><span>大模型</span><strong>{!modelStatus.apiCompatible && modelStatus.reachable ? '服务版本需重启' : modelReady ? modelDisplay : `${modelStatus.model} 未配置`}</strong></div>
            <div><span>运行方式</span><strong>参数修改本地计算</strong></div>
          </div>
        </aside>

        <section className="preview-stage" ref={stageRef} data-layout-preset={layoutPresetOf(scene.appearance)}>
          <div className="stage-heading">
            <div>
              <span className="eyebrow">实时预览</span>
              <h2>{scene.metadata.title}</h2>
              <p>{scene.metadata.summary}</p>
            </div>
            <div className="stage-actions">
              <span className={`validation-badge ${validation.valid ? 'valid' : 'invalid'}`}>
                <i /> {validation.valid ? '场景有效' : '校验失败'}
              </span>
              <div className="zoom-controls" aria-label="画布缩放">
                <button type="button" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(1))))} disabled={zoom <= 0.5} aria-label="缩小画布">−</button>
                <button className="zoom-value" type="button" onClick={() => setZoom(1)} title="适应窗口">{Math.round(zoom * 100)}%</button>
                <button type="button" onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(1))))} disabled={zoom >= 1.6} aria-label="放大画布">+</button>
              </div>
              <button className="fit-button" type="button" onClick={() => setZoom(1)}>适应</button>
              <button className="square-button" type="button" onClick={() => void toggleFullscreen()} title="全屏预览" aria-label="全屏预览">⛶</button>
            </div>
          </div>

          {scene.appearance.showFormula && (
            <div className="formula-card formula-card--above">
              <div className="formula-symbol">{scene.annotations.formula}</div>
              <div><strong>观察结论</strong><p>{scene.annotations.conclusion}</p></div>
            </div>
          )}

          {ellipseScene && (
            <EllipseCanvas
              scene={scene}
              angle={angle}
              trailAngles={trailAngles}
              zoom={zoom}
              onAngleChange={handleAngleChange}
              selectedObjectId={selectedObjectId}
              onObjectSelect={setSelectedObjectId}
            />
          )}
          {quadraticScene && <QuadraticCanvas scene={scene} zoom={zoom} selectedObjectId={selectedObjectId} onObjectSelect={setSelectedObjectId} />}
          {genericFunctionScene && <GenericFunctionCanvas scene={scene} zoom={zoom} selectedObjectId={selectedObjectId} onObjectSelect={setSelectedObjectId} />}
          {relationCurve2DScene && <RelationCurve2DCanvas scene={scene} zoom={zoom} selectedObjectId={selectedObjectId} onObjectSelect={setSelectedObjectId} />}
          {dataChart2DScene && <DataChart2DCanvas scene={scene} zoom={zoom} selectedObjectId={selectedObjectId} onObjectSelect={setSelectedObjectId} />}
          {timeExperimentScene && <TimeExperimentCanvas
            scene={scene} time={experimentTime} zoom={zoom}
            selectedObjectId={selectedObjectId} onObjectSelect={setSelectedObjectId}
            onTimeChange={mathParameterTraceScene ? (value) => { setExperimentTime(value); setIsPlaying(false) } : undefined}
          />}
          {geometry2DScene && <Geometry2DCanvas scene={scene} zoom={zoom} selectedObjectId={selectedObjectId} onObjectSelect={setSelectedObjectId} onPointChange={handleGeometryPointChange} />}
          {collision2DScene && <Collision2DCanvas scene={scene} time={experimentTime} zoom={zoom} selectedObjectId={selectedObjectId} onObjectSelect={setSelectedObjectId} />}

          <div className="playback-row">
            <div className="playback-actions">
              {(ellipseScene || timeExperimentScene || collision2DScene) && (
                <button className={`play-button ${isPlaying ? 'is-playing' : ''}`} type="button" onClick={() => setIsPlaying((value) => !value)}>
                  <span aria-hidden="true">{isPlaying ? 'Ⅱ' : '▶'}</span>{isPlaying ? '暂停' : '播放'}
                </button>
              )}
              <button className="reset-button" type="button" onClick={reset}><span aria-hidden="true">↺</span> 重置</button>
            </div>
            <div className="invariant-status">
              <span className="invariant-check">✓</span>
              <div>
                <strong>{dataChart2DScene ? '数据图表有效' : relationCurve2DScene ? '关系曲线有效' : collision2DScene ? '碰撞状态有效' : geometry2DScene ? '几何构造有效' : mathParameterTraceScene ? '参数轨迹有效' : timeExperimentScene ? '时间状态有效' : genericFunctionScene ? '函数场景有效' : quadraticScene ? '顶点关系成立' : '不变量成立'}</strong>
                <small>{collision2DScene
                  ? `已预演 0–${collisionRuntime?.duration.toFixed(2) ?? '0.00'} s，未发现越界或穿透`
                  : relationCurve2DScene
                  ? '表达式、定义区间和可绘制样本均已通过本地校验'
                  : dataChart2DScene
                  ? '类别、系列长度和全部有限数值均已通过本地校验'
                  : geometry2DScene
                  ? '全部点坐标与测量值均为有限数'
                  : timeExperimentScene
                  ? `已校验 ${mathParameterTraceScene ? 't = ' : ''}0–${timeExperimentSnapshot?.duration.toFixed(2) ?? '0.00'}${mathParameterTraceScene ? '' : ' s'}`
                  : `当前数值误差 ${(ellipseSnapshot?.invariantError ?? quadraticSnapshot?.invariantError ?? 0).toExponential(1)}`}</small>
              </div>
            </div>
          </div>

        </section>

        <SettingsPanel
          scene={scene}
          onParameterChange={handleParameterChange}
          onAppearanceChange={handleAppearanceChange}
          selectedObjectId={selectedObjectId}
          onObjectSelect={setSelectedObjectId}
          onObjectAppearanceChange={handleObjectAppearanceChange}
          onObjectAppearanceReset={handleObjectAppearanceReset}
          onStylePresetApply={handleStylePresetApply}
          onLayoutPresetApply={handleLayoutPresetApply}
          onAppearanceReset={handleAppearanceReset}
          error={parameterError}
        />
      </main>

      <LessonLibraryPanel
        open={libraryOpen}
        officialEntries={officialLibrary}
        thirdPartyEntries={combinedThirdPartyLibrary}
        onClose={closeLibrary}
        onLoad={handleLibraryLoad}
        onRemoveThirdParty={handleRemoveThirdParty}
        onSubmitThirdParty={handleSubmitThirdParty}
        onRefreshShared={refreshAllLibraries}
        submittingEntryId={submittingEntryId}
        sharedStatus={sharedLibraryStatus}
        submissionStatuses={submissionStatuses}
        submissionStatusesLoading={submissionStatusesLoading}
      />
      <UserAccountDialog
        open={userAccountOpen}
        session={userSession}
        busy={userAccountBusy}
        error={userAccountError}
        onClose={() => setUserAccountOpen(false)}
        onLogin={(accessCode) => void handleUserLogin(accessCode)}
        onLogout={() => void handleUserLogout()}
      />
    </div>
  )
}
