import { useCallback, useEffect, useMemo, useState } from 'react'
import { EllipseCanvas } from './EllipseCanvas'
import { GenericFunctionCanvas } from './GenericFunctionCanvas'
import { QuadraticCanvas } from './QuadraticCanvas'
import { SettingsPanel } from './SettingsPanel'
import { TimeExperimentCanvas } from './TimeExperimentCanvas'
import { Geometry2DCanvas } from './Geometry2DCanvas'
import { Collision2DCanvas } from './Collision2DCanvas'
import { RelationCurve2DCanvas } from './RelationCurve2DCanvas'
import { DataChart2DCanvas } from './DataChart2DCanvas'
import {
  normalizeAngle,
  resetSceneValues,
  updateAppearance,
  updateAxisParameter,
  validateAxisValues,
} from '../core/ellipse'
import {
  QUADRATIC_TEMPLATE_ID,
  resetQuadraticScene,
  updateQuadraticParameter,
  validateQuadraticValues,
  type QuadraticParameterId,
} from '../core/quadratic'
import {
  GENERIC_FUNCTION_TEMPLATE_ID,
  resetGenericFunctionScene,
  updateGenericFunctionParameter,
} from '../core/genericFunction'
import {
  getTimeExperimentSnapshot,
  resetTimeExperimentScene,
  TIME_EXPERIMENT_TEMPLATE_ID,
  updateTimeExperimentParameter,
} from '../core/timeExperiment'
import { validateLessonScene } from '../core/validateScene'
import type { LessonScene, SceneAppearance } from '../types/lessonScene'
import { isNumberParameter } from '../types/lessonScene'
import {
  GEOMETRY_2D_TEMPLATE_ID,
  resetGeometryScene,
  updateGeometryParameter,
  updateGeometryPoint,
} from '../core/geometry2d'
import {
  COLLISION_2D_TEMPLATE_ID,
  createCollision2DRuntime,
  resetCollisionScene,
  updateCollisionParameter,
} from '../core/collision2d'
import {
  RELATION_CURVE_2D_TEMPLATE_ID,
  resetRelationCurveScene,
  updateRelationCurveParameter,
} from '../core/relationCurve2d'
import { DATA_CHART_2D_TEMPLATE_ID, resetDataChartScene } from '../core/dataChart2d'

interface ReviewScenePreviewProps {
  initialScene: LessonScene
}

function initialAngle(scene: LessonScene): number {
  const parameter = scene.parameters.pointAngle
  return isNumberParameter(parameter) ? parameter.value : 0.72
}

export function ReviewScenePreview({ initialScene }: ReviewScenePreviewProps) {
  const [scene, setScene] = useState(() => structuredClone(initialScene))
  const [angle, setAngle] = useState(() => initialAngle(initialScene))
  const [trailAngles, setTrailAngles] = useState<number[]>([])
  const [time, setTime] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [compactViewport, setCompactViewport] = useState(false)
  const [parameterError, setParameterError] = useState<string | null>(null)

  const ellipse = scene.templateRef.id === 'math.conic.ellipse-focus-sum'
  const quadratic = scene.templateRef.id === QUADRATIC_TEMPLATE_ID
  const genericFunction = scene.templateRef.id === GENERIC_FUNCTION_TEMPLATE_ID
  const timeExperiment = scene.templateRef.id === TIME_EXPERIMENT_TEMPLATE_ID
  const mathParameterTrace = timeExperiment && scene.metadata.subject === 'math'
  const geometry2D = scene.templateRef.id === GEOMETRY_2D_TEMPLATE_ID
  const collision2D = scene.templateRef.id === COLLISION_2D_TEMPLATE_ID
  const relationCurve2D = scene.templateRef.id === RELATION_CURVE_2D_TEMPLATE_ID
  const dataChart2D = scene.templateRef.id === DATA_CHART_2D_TEMPLATE_ID
  const validation = useMemo(() => validateLessonScene(scene), [scene])
  const timeSnapshot = useMemo(
    () => timeExperiment ? getTimeExperimentSnapshot(scene, time) : null,
    [scene, time, timeExperiment],
  )
  const timeDuration = timeSnapshot?.duration
  const collisionRuntime = useMemo(
    () => collision2D ? createCollision2DRuntime(scene) : null,
    [collision2D, scene],
  )
  const dynamicDuration = timeDuration ?? collisionRuntime?.duration

  useEffect(() => {
    const next = structuredClone(initialScene)
    setScene(next)
    setAngle(initialAngle(next))
    setTrailAngles([])
    setTime(0)
    setZoom(1)
    setPlaying(false)
    setParameterError(null)
  }, [initialScene])

  const handleAngleChange = useCallback((value: number) => {
    const next = normalizeAngle(value)
    setAngle(next)
    setTrailAngles((current) => {
      const last = current.at(-1)
      if (last !== undefined && Math.abs(last - next) < 0.035) return current
      return [...current.slice(-179), next]
    })
  }, [])

  useEffect(() => {
    if (!playing || !ellipse) return
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
  }, [ellipse, playing, scene.appearance.animationSpeed])

  useEffect(() => {
    if (!playing || (!timeExperiment && !collision2D) || dynamicDuration === undefined) return
    let frameId = 0
    let previous = performance.now()
    const animate = (now: number) => {
      const delta = Math.min(0.05, (now - previous) / 1000)
      previous = now
      setTime((current) => {
        const next = current + delta * scene.appearance.animationSpeed * 2
        if (next >= dynamicDuration) {
          setPlaying(false)
          return dynamicDuration
        }
        return next
      })
      frameId = requestAnimationFrame(animate)
    }
    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [collision2D, dynamicDuration, playing, scene.appearance.animationSpeed, timeExperiment])

  const updateParameter = (id: string, value: number) => {
    try {
      setParameterError(null)
      if (relationCurve2D) {
        setScene(updateRelationCurveParameter(scene, id, value))
        setZoom(1)
        return
      }
      if (collision2D) {
        setScene(updateCollisionParameter(scene, id, value))
        setTime(0)
        setPlaying(false)
        setZoom(1)
        return
      }
      if (geometry2D) {
        setScene(updateGeometryParameter(scene, id, value))
        setZoom(1)
        return
      }
      if (timeExperiment) {
        setScene(updateTimeExperimentParameter(scene, id, value))
        setTime(0)
        setPlaying(false)
        setZoom(1)
        return
      }
      if (genericFunction) {
        setScene(updateGenericFunctionParameter(scene, id, value))
        setZoom(1)
        return
      }
      if (quadratic) {
        if (!['coefficientA', 'vertexH', 'vertexK'].includes(id)) return
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
        if (error) throw new Error(error)
        setScene(updateQuadraticParameter(scene, id as QuadraticParameterId, value))
        setZoom(1)
        return
      }
      if (id !== 'majorAxis' && id !== 'minorAxis') return
      const major = scene.parameters.majorAxis
      const minor = scene.parameters.minorAxis
      if (!isNumberParameter(major) || !isNumberParameter(minor)) return
      const nextMajor = id === 'majorAxis' ? value : major.value
      const nextMinor = id === 'minorAxis' ? value : minor.value
      const error = validateAxisValues(scene, nextMajor, nextMinor)
      if (error) throw new Error(error)
      setScene(updateAxisParameter(scene, id, value))
      setZoom(1)
    } catch (error) {
      setParameterError(error instanceof Error ? error.message : '参数运行检查失败。')
    }
  }

  const updateSceneAppearance = <K extends keyof SceneAppearance>(
    key: K,
    value: SceneAppearance[K],
  ) => setScene(updateAppearance(scene, key, value))

  const reset = () => {
    const next = dataChart2D
      ? resetDataChartScene(scene)
      : relationCurve2D
      ? resetRelationCurveScene(scene)
      : collision2D
      ? resetCollisionScene(scene)
      : geometry2D
      ? resetGeometryScene(scene)
      : timeExperiment
      ? resetTimeExperimentScene(scene)
      : genericFunction
        ? resetGenericFunctionScene(scene)
        : quadratic
          ? resetQuadraticScene(scene)
          : resetSceneValues(scene)
    setScene(next)
    setAngle(initialAngle(next))
    setTrailAngles([])
    setTime(0)
    setZoom(1)
    setPlaying(false)
    setParameterError(null)
  }

  return (
    <div className="admin-scene-preview">
      <div className="admin-preview-toolbar">
        <div>
          <span className={`validation-badge ${validation.valid ? 'valid' : 'invalid'}`}>
            <i /> {validation.valid ? '本地结构校验通过' : '本地结构校验失败'}
          </span>
          <span className="admin-local-note">此处修改只用于审核测试，不会改写提交文件</span>
        </div>
        <div className="stage-actions">
          <div className="admin-viewport-switch" aria-label="预览宽度">
            <button className={!compactViewport ? 'active' : ''} type="button" onClick={() => setCompactViewport(false)}>宽屏</button>
            <button className={compactViewport ? 'active' : ''} type="button" onClick={() => setCompactViewport(true)}>窄屏</button>
          </div>
          <div className="zoom-controls" aria-label="审核画布缩放">
            <button type="button" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(1))))}>−</button>
            <button className="zoom-value" type="button" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(1))))}>+</button>
          </div>
        </div>
      </div>

      <div className={`admin-preview-frame ${compactViewport ? 'admin-preview-frame--compact' : ''}`}>
        {scene.appearance.showFormula && (
          <div className="formula-card formula-card--above">
            <div className="formula-symbol">{scene.annotations.formula}</div>
            <div><strong>观察结论</strong><p>{scene.annotations.conclusion}</p></div>
          </div>
        )}
        {ellipse && (
          <EllipseCanvas scene={scene} angle={angle} trailAngles={trailAngles} zoom={zoom} onAngleChange={handleAngleChange} />
        )}
        {quadratic && <QuadraticCanvas scene={scene} zoom={zoom} />}
        {genericFunction && <GenericFunctionCanvas scene={scene} zoom={zoom} />}
        {relationCurve2D && <RelationCurve2DCanvas scene={scene} zoom={zoom} />}
        {dataChart2D && <DataChart2DCanvas scene={scene} zoom={zoom} />}
        {timeExperiment && <TimeExperimentCanvas
          scene={scene} time={time} zoom={zoom}
          onTimeChange={mathParameterTrace ? (value) => { setTime(value); setPlaying(false) } : undefined}
        />}
        {collision2D && <Collision2DCanvas scene={scene} time={time} zoom={zoom} />}
        {geometry2D && <Geometry2DCanvas
          scene={scene}
          zoom={zoom}
          onPointChange={(pointId, x, y) => {
            try {
              setParameterError(null)
              setScene(updateGeometryPoint(scene, pointId, x, y))
            } catch (error) {
              setParameterError(error instanceof Error ? error.message : '几何点拖动检查失败。')
            }
          }}
        />}
      </div>

      <div className="playback-row admin-preview-playback">
        <div className="playback-actions">
          {(ellipse || timeExperiment || collision2D) && (
            <button className={`play-button ${playing ? 'is-playing' : ''}`} type="button" onClick={() => setPlaying((value) => !value)}>
              <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>{playing ? '暂停' : '播放'}
            </button>
          )}
          <button className="reset-button" type="button" onClick={reset}><span aria-hidden="true">↺</span> 恢复提交状态</button>
        </div>
        <div className="invariant-status">
          <span className="invariant-check">✓</span>
          <div><strong>可交互预览已加载</strong><small>请拖动、播放并测试参数边界</small></div>
        </div>
      </div>

      <div className="admin-embedded-settings">
        <SettingsPanel
          scene={scene}
          onParameterChange={updateParameter}
          onAppearanceChange={updateSceneAppearance}
          error={parameterError}
        />
      </div>
    </div>
  )
}
