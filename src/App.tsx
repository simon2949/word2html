import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EllipseCanvas } from './components/EllipseCanvas'
import { QuadraticCanvas } from './components/QuadraticCanvas'
import { GenericFunctionCanvas } from './components/GenericFunctionCanvas'
import { TimeExperimentCanvas } from './components/TimeExperimentCanvas'
import { SettingsPanel } from './components/SettingsPanel'
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
import { exportSceneAsStandaloneHtml } from './core/exportHtml'
import {
  createSceneFromTemplate,
  normalizePrompt,
  routeGenerationRequest,
} from './core/intentParser'
import {
  assertSceneRendererSupported,
  GENERATION_API_VERSION,
  generateSceneWithModel,
  getModelServiceStatus,
  type ModelServiceStatus,
} from './core/modelGateway'
import {
  cacheScene,
  downloadTextFile,
  getCachedScene,
  loadDraft,
  saveDraft,
} from './core/storage'
import { assertLessonScene, validateLessonScene } from './core/validateScene'
import { createEllipseScene } from './templates/ellipseTemplate'
import type { LessonScene, SceneAppearance } from './types/lessonScene'
import { isNumberParameter } from './types/lessonScene'

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

const DEFAULT_PROMPT = '制作一个椭圆函数图像，椭圆边上的点可以拖动，显示它到两个焦点的距离，并演示距离之和不变。长轴设为 10，短轴设为 6。'

function pointAngle(scene: LessonScene): number {
  const parameter = scene.parameters.pointAngle
  return isNumberParameter(parameter) ? parameter.value : 0.72
}

function templateCacheKey(prompt: string, templateId: string): string {
  return `${normalizePrompt(prompt)}|template:${templateId}@1|schema:0.1`
}

function modelCacheKey(prompt: string, status: ModelServiceStatus): string {
  return `${normalizePrompt(prompt)}|model:${status.provider}:${status.model}|schema:0.1|plan:${GENERATION_API_VERSION}`
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
  const [parameterError, setParameterError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [modelStatus, setModelStatus] = useState<ModelServiceStatus>({
    reachable: false,
    configured: false,
    apiCompatible: false,
    provider: 'MiniMax',
    model: 'MiniMax-M3',
    baseURL: '',
  })
  const [status, setStatus] = useState<AppStatus>({
    tone: 'neutral',
    title: '内置模板已就绪',
    detail: '可以直接拖动图形，或输入描述生成新的参数实例。',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const validation = useMemo(() => validateLessonScene(scene), [scene])
  const ellipseScene = scene.templateRef.id === 'math.conic.ellipse-focus-sum'
  const quadraticScene = scene.templateRef.id === QUADRATIC_TEMPLATE_ID
  const genericFunctionScene = scene.templateRef.id === GENERIC_FUNCTION_TEMPLATE_ID
  const timeExperimentScene = scene.templateRef.id === TIME_EXPERIMENT_TEMPLATE_ID
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
  const generationRoute = useMemo(() => routeGenerationRequest(prompt), [prompt])

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
    setAngle(pointAngle(scene))
    setTrailAngles([])
    setExperimentTime(0)
    setZoom(1)
  }, [scene.templateRef.id])

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
    if (!isPlaying || !timeExperimentScene || timeExperimentDuration === undefined) return
    let frameId = 0
    let previous = performance.now()
    const animate = (now: number) => {
      const delta = Math.min(0.05, (now - previous) / 1000)
      previous = now
      setExperimentTime((current) => {
        const next = current + delta * scene.appearance.animationSpeed * 2
        if (next >= timeExperimentDuration) {
          setIsPlaying(false)
          return timeExperimentDuration
        }
        return next
      })
      frameId = requestAnimationFrame(animate)
    }
    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [isPlaying, scene.appearance.animationSpeed, timeExperimentDuration, timeExperimentScene])

  const handleParameterChange = (id: string, value: number) => {
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

  const handleGenerate = async () => {
    setIsGenerating(true)
    setParameterError(null)
    await Promise.resolve()
    try {
      const route = routeGenerationRequest(prompt)
      if (route.kind === 'settings') {
        setStatus({ tone: 'warning', title: route.label, detail: route.reason })
        return
      }

      if (route.kind === 'template') {
        const templateId = route.templateId ?? 'unknown'
        const key = templateCacheKey(prompt, templateId)
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

      const key = modelCacheKey(prompt, modelStatus)
      const cached = getCachedScene(key)
      let cachedRendererSupported = false
      if (cached) {
        try {
          assertSceneRendererSupported(cached)
          cachedRendererSupported = true
        } catch {
          // Ignore stale cache entries created for renderers that are not installed.
        }
      }
      if (cached && cachedRendererSupported) {
        if (commitScene(cached, {
          tone: 'success',
          title: '已精确复用模型生成场景',
          detail: '相同描述已通过本地缓存恢复 · 未调用大模型 · AI token：0',
          changes: ['复用了此前已经通过协议、安全、数学和渲染能力校验的场景。'],
        })) {
          setAngle(pointAngle(cached))
          setExperimentTime(0)
          setTrailAngles([])
          setIsPlaying(false)
          setZoom(1)
        }
        return
      }

      if (!modelStatus.reachable || !modelStatus.configured || !modelStatus.apiCompatible) {
        setStatus({
          tone: 'warning',
          title: '已判断需要调用大模型',
          detail: !modelStatus.reachable
            ? '无法连接本项目的模型代理服务，请通过 npm run dev 启动统一开发服务器。'
            : !modelStatus.apiCompatible
              ? '生成服务仍在运行旧协议，请停止并重新执行 npm run dev，然后刷新浏览器。'
              : 'MiniMax 服务端已启动，但尚未设置 MINIMAX_API_KEY，因此保留现有场景。',
        })
        return
      }

      const generated = await generateSceneWithModel(prompt)
      const usageText = [
        generated.usage.inputTokens !== undefined ? `输入 ${generated.usage.inputTokens}` : null,
        generated.usage.cachedInputTokens !== undefined ? `缓存 ${generated.usage.cachedInputTokens}` : null,
        generated.usage.outputTokens !== undefined ? `输出 ${generated.usage.outputTokens}` : null,
      ].filter(Boolean).join(' / ')
      if (commitScene(generated.scene, {
        tone: 'success',
        title: `${generated.provider?.model ?? 'MiniMax-M3'} 已规划并创建场景`,
        detail: usageText ? `Token：${usageText}` : '生成服务未返回 token 统计。',
      })) {
        cacheScene(key, generated.scene)
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
    const next = timeExperimentScene
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
      assertLessonScene(value)
      assertSceneRendererSupported(value)
      const next = structuredClone(value)
      next.lineage.source = 'imported'
      next.lineage.updatedAt = new Date().toISOString()
      if (commitScene(next, {
        tone: 'success',
        title: '场景导入成功',
        detail: '协议、引用、表达式和数学不变量均已通过校验。',
      })) {
        setAngle(pointAngle(next))
        setExperimentTime(0)
        setTrailAngles([])
        setIsPlaying(false)
        setZoom(1)
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

  const exportJson = () => {
    downloadTextFile(
      safeFilename(scene.metadata.title, 'lesson.json'),
      JSON.stringify(scene, null, 2),
      'application/json;charset=utf-8',
    )
    setStatus({ tone: 'success', title: '场景数据已导出', detail: '文件可重新导入当前应用。' })
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
          <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>导入</button>
          <div className="export-actions">
            <button className="secondary-button" type="button" onClick={exportJson}>场景数据</button>
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
            <p>支持审核模板与安全二维函数；参数和显示修改均在本地完成。</p>
          </div>

          <div className="prompt-box">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={8}
              aria-label="教学内容描述"
            />
            <div className="prompt-footer">
              <span>{prompt.length} 字</span>
              <button className="generate-button" type="button" onClick={() => void handleGenerate()} disabled={isGenerating || !prompt.trim()}>
                <span aria-hidden="true">✦</span>{isGenerating ? '正在生成…' : '分析并生成'}
              </button>
            </div>
          </div>

          <div className={`route-decision route-decision--${generationRoute.kind}`}>
            <span className="route-decision-icon" aria-hidden="true">
              {generationRoute.kind === 'template' ? '◇' : generationRoute.kind === 'model' ? '✦' : '↗'}
            </span>
            <div>
              <strong>{generationRoute.label}</strong>
              <p>{generationRoute.reason}</p>
              {generationRoute.kind === 'model' && (
                <small className={modelStatus.configured && modelStatus.apiCompatible ? 'model-ready' : 'model-missing'}>
                  {!modelStatus.apiCompatible && modelStatus.reachable
                    ? '服务版本需重启'
                    : modelStatus.configured ? `${modelStatus.model} 已连接` : `${modelStatus.model} 未配置`}
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
            <div><span>大模型</span><strong>{!modelStatus.apiCompatible && modelStatus.reachable ? '服务版本需重启' : modelStatus.configured ? `${modelStatus.model} 已连接` : `${modelStatus.model} 未配置`}</strong></div>
            <div><span>运行方式</span><strong>参数修改本地计算</strong></div>
          </div>
        </aside>

        <section className="preview-stage" ref={stageRef}>
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
            <EllipseCanvas scene={scene} angle={angle} trailAngles={trailAngles} zoom={zoom} onAngleChange={handleAngleChange} />
          )}
          {quadraticScene && <QuadraticCanvas scene={scene} zoom={zoom} />}
          {genericFunctionScene && <GenericFunctionCanvas scene={scene} zoom={zoom} />}
          {timeExperimentScene && <TimeExperimentCanvas scene={scene} time={experimentTime} zoom={zoom} />}

          <div className="playback-row">
            <div className="playback-actions">
              {(ellipseScene || timeExperimentScene) && (
                <button className={`play-button ${isPlaying ? 'is-playing' : ''}`} type="button" onClick={() => setIsPlaying((value) => !value)}>
                  <span aria-hidden="true">{isPlaying ? 'Ⅱ' : '▶'}</span>{isPlaying ? '暂停' : '播放'}
                </button>
              )}
              <button className="reset-button" type="button" onClick={reset}><span aria-hidden="true">↺</span> 重置</button>
            </div>
            <div className="invariant-status">
              <span className="invariant-check">✓</span>
              <div>
                <strong>{timeExperimentScene ? '时间状态有效' : genericFunctionScene ? '函数场景有效' : quadraticScene ? '顶点关系成立' : '不变量成立'}</strong>
                <small>{timeExperimentScene
                  ? `已校验 0–${timeExperimentSnapshot?.duration.toFixed(2) ?? '0.00'} s`
                  : `当前数值误差 ${(ellipseSnapshot?.invariantError ?? quadraticSnapshot?.invariantError ?? 0).toExponential(1)}`}</small>
              </div>
            </div>
          </div>

        </section>

        <SettingsPanel
          scene={scene}
          onParameterChange={handleParameterChange}
          onAppearanceChange={handleAppearanceChange}
          error={parameterError}
        />
      </main>
    </div>
  )
}
