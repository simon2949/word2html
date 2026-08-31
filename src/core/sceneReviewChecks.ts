import { ELLIPSE_TEMPLATE_ID } from '../templates/ellipseTemplate'
import type { LessonScene, NumberParameter, SceneValidationIssue } from '../types/lessonScene'
import { sampleEllipseInvariant } from './ellipse'
import {
  GENERIC_FUNCTION_TEMPLATE_ID,
  getGenericFunctionSpec,
  sampleGenericFunction,
} from './genericFunction'
import { QUADRATIC_TEMPLATE_ID, sampleQuadraticInvariant } from './quadratic'
import { createTimeExperimentRuntime, TIME_EXPERIMENT_TEMPLATE_ID } from './timeExperiment'
import { validateLessonScene } from './validateScene'
import {
  evaluateGeometry2D,
  GEOMETRY_2D_TEMPLATE_ID,
  getGeometry2DSpec,
  sampleGeometryLoci,
} from './geometry2d'
import {
  getRelationCurve2DSpec,
  RELATION_CURVE_2D_TEMPLATE_ID,
  relationCurveVisiblePointCount,
  sampleRelationCurve,
} from './relationCurve2d'
import { DATA_CHART_2D_TEMPLATE_ID, getDataChart2DSpec } from './dataChart2d'

export type SceneReviewCheckStatus = 'passed' | 'warning' | 'failed'

export interface SceneReviewCheckResult {
  id: 'protocol' | 'parameter-boundaries' | 'runtime-sampling' | 'controls' | 'viewport'
  label: string
  status: SceneReviewCheckStatus
  detail: string
  findings: string[]
}

export interface SceneReviewCheckReport {
  status: SceneReviewCheckStatus
  results: SceneReviewCheckResult[]
  testedCases: number
  completedAt: string
}

interface BoundaryCase {
  label: string
  scene: LessonScene
}

function aggregateStatus(statuses: SceneReviewCheckStatus[]): SceneReviewCheckStatus {
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('warning')) return 'warning'
  return 'passed'
}

function issueText(issue: SceneValidationIssue): string {
  return `${issue.path}：${issue.message}`
}

function protocolCheck(scene: LessonScene): SceneReviewCheckResult {
  const validation = validateLessonScene(scene)
  const errors = validation.issues.filter((issue) => issue.severity === 'error')
  const warnings = validation.issues.filter((issue) => issue.severity === 'warning')
  const findings = [...errors, ...warnings].slice(0, 8).map(issueText)
  if (errors.length > 0) {
    return {
      id: 'protocol',
      label: '协议与当前参数',
      status: 'failed',
      detail: `当前场景有 ${errors.length} 个错误，不能进入自动运行检查。`,
      findings,
    }
  }
  if (warnings.length > 0) {
    return {
      id: 'protocol',
      label: '协议与当前参数',
      status: 'warning',
      detail: `当前场景通过协议校验，但有 ${warnings.length} 个提醒。`,
      findings,
    }
  }
  return {
    id: 'protocol',
    label: '协议与当前参数',
    status: 'passed',
    detail: 'Schema、表达式引用、对象关系和当前参数均有效。',
    findings: [],
  }
}

function setNumericValues(
  source: LessonScene,
  values: Record<string, number>,
): LessonScene {
  const next = structuredClone(source)
  for (const [id, value] of Object.entries(values)) {
    const parameter = next.parameters[id]
    if (parameter?.type === 'number') parameter.value = value
  }
  return next
}

function editableNumberParameters(scene: LessonScene): Array<[string, NumberParameter]> {
  return Object.entries(scene.parameters).filter(
    (entry): entry is [string, NumberParameter] => entry[1].type === 'number' && entry[1].editable,
  )
}

function adjustCoupledEllipseBoundary(scene: LessonScene, targetId: string): void {
  if (scene.templateRef.id !== ELLIPSE_TEMPLATE_ID) return
  const major = scene.parameters.majorAxis
  const minor = scene.parameters.minorAxis
  if (major?.type !== 'number' || minor?.type !== 'number' || minor.value <= major.value) return

  if (targetId === 'majorAxis') {
    minor.value = Math.max(minor.min, Math.min(minor.value, major.value))
  } else if (targetId === 'minorAxis') {
    major.value = Math.min(major.max, Math.max(major.value, minor.value))
  }
}

function boundaryCases(scene: LessonScene): BoundaryCase[] {
  const parameters = editableNumberParameters(scene)
  if (parameters.length === 0) return []

  const defaults = Object.fromEntries(parameters.map(([id, parameter]) => [id, parameter.default]))
  const cases: BoundaryCase[] = [{ label: '全部默认值', scene: setNumericValues(scene, defaults) }]

  for (const [id, parameter] of parameters) {
    for (const [boundaryLabel, value] of [['最小值', parameter.min], ['最大值', parameter.max]] as const) {
      const candidate = setNumericValues(scene, { ...defaults, [id]: value })
      adjustCoupledEllipseBoundary(candidate, id)
      cases.push({ label: `${parameter.label}=${boundaryLabel} ${value}`, scene: candidate })
    }
  }

  cases.push({
    label: '全部参数取最小值',
    scene: setNumericValues(scene, Object.fromEntries(parameters.map(([id, parameter]) => [id, parameter.min]))),
  })
  cases.push({
    label: '全部参数取最大值',
    scene: setNumericValues(scene, Object.fromEntries(parameters.map(([id, parameter]) => [id, parameter.max]))),
  })
  return cases
}

function parameterBoundaryCheck(scene: LessonScene): {
  result: SceneReviewCheckResult
  testedCases: number
} {
  const cases = boundaryCases(scene)
  if (cases.length === 0) {
    return {
      testedCases: 0,
      result: {
        id: 'parameter-boundaries',
        label: '参数边界矩阵',
        status: 'passed',
        detail: '该场景没有可编辑数值参数，无需执行数值边界矩阵。',
        findings: [],
      },
    }
  }

  const errors: string[] = []
  const warnings: string[] = []
  for (const candidate of cases) {
    const validation = validateLessonScene(candidate.scene)
    const candidateErrors = validation.issues.filter((issue) => issue.severity === 'error')
    const candidateWarnings = validation.issues.filter((issue) => issue.severity === 'warning')
    if (candidateErrors.length > 0) {
      errors.push(`${candidate.label}：${candidateErrors.map((issue) => issue.message).join('；')}`)
    } else if (candidateWarnings.length > 0) {
      warnings.push(`${candidate.label}：${candidateWarnings.map((issue) => issue.message).join('；')}`)
    }
  }

  if (errors.length > 0) {
    return {
      testedCases: cases.length,
      result: {
        id: 'parameter-boundaries',
        label: '参数边界矩阵',
        status: 'failed',
        detail: `${cases.length} 组参数中有 ${errors.length} 组无法安全运行。`,
        findings: [...errors, ...warnings].slice(0, 10),
      },
    }
  }
  if (warnings.length > 0) {
    return {
      testedCases: cases.length,
      result: {
        id: 'parameter-boundaries',
        label: '参数边界矩阵',
        status: 'warning',
        detail: `${cases.length} 组参数均可运行，其中 ${warnings.length} 组需要人工确认退化或特殊情况。`,
        findings: warnings.slice(0, 10),
      },
    }
  }
  return {
    testedCases: cases.length,
    result: {
      id: 'parameter-boundaries',
      label: '参数边界矩阵',
      status: 'passed',
      detail: `${cases.length} 组默认值、单参数最小/最大值及组合边界均可安全运行。`,
      findings: [],
    },
  }
}

function runtimeSamplingCheck(scene: LessonScene, canRun: boolean): SceneReviewCheckResult {
  if (!canRun) {
    return {
      id: 'runtime-sampling',
      label: '运行区间采样',
      status: 'failed',
      detail: '当前场景未通过基础校验，已停止运行区间采样。',
      findings: ['先修复“协议与当前参数”中的错误，再重新运行自动检查。'],
    }
  }

  try {
    if (scene.templateRef.id === ELLIPSE_TEMPLATE_ID) {
      const invariant = sampleEllipseInvariant(scene, 180)
      return {
        id: 'runtime-sampling',
        label: '运行区间采样',
        status: invariant.passed ? 'passed' : 'failed',
        detail: invariant.passed
          ? `已采样 180 个动点位置，焦点距离和最大误差为 ${invariant.maxError.toExponential(2)}。`
          : `焦点距离和不变量失败，最大误差为 ${invariant.maxError.toExponential(2)}。`,
        findings: invariant.passed ? [] : ['检查焦点坐标、动点轨迹和距离表达式。'],
      }
    }

    if (scene.templateRef.id === QUADRATIC_TEMPLATE_ID) {
      const invariant = sampleQuadraticInvariant(scene, 160)
      return {
        id: 'runtime-sampling',
        label: '运行区间采样',
        status: invariant.passed ? 'passed' : 'failed',
        detail: invariant.passed
          ? `已采样 160 组对称点，顶点与对称性最大误差为 ${invariant.maxError.toExponential(2)}。`
          : `二次函数顶点或对称性校验失败，最大误差为 ${invariant.maxError.toExponential(2)}。`,
        findings: invariant.passed ? [] : ['检查顶点式、顶点坐标和曲线表达式。'],
      }
    }

    if (scene.templateRef.id === GENERIC_FUNCTION_TEMPLATE_ID) {
      const samples = sampleGenericFunction(getGenericFunctionSpec(scene), 401)
      const finiteCount = samples.filter((sample) => Number.isFinite(sample.y)).length
      const displayableCount = samples.filter(
        (sample) => Number.isFinite(sample.y) && Math.abs(sample.y) <= 1e6,
      ).length
      const ratio = displayableCount / samples.length
      const status: SceneReviewCheckStatus = displayableCount < 2
        ? 'failed'
        : ratio < 0.8
          ? 'warning'
          : 'passed'
      return {
        id: 'runtime-sampling',
        label: '运行区间采样',
        status,
        detail: `定义域内采样 401 点，有限值 ${finiteCount} 点，可显示值 ${displayableCount} 点。`,
        findings: status === 'passed' ? [] : [
          status === 'failed'
            ? '当前定义域内没有足够的可显示点。'
            : '超过 20% 的采样点无效或绝对值大于 1,000,000，请人工确认间断点和缩放效果。',
        ],
      }
    }

    if (scene.templateRef.id === DATA_CHART_2D_TEMPLATE_ID) {
      const spec = getDataChart2DSpec(scene)
      const pointCount = spec.mode === 'scatter'
        ? spec.series.reduce((sum, series) => sum + (series.points?.length ?? 0), 0)
        : (spec.categories?.length ?? 0) * spec.series.length
      return {
        id: 'runtime-sampling',
        label: '运行区间采样',
        status: 'passed',
        detail: `已检查 ${spec.series.length} 个系列和 ${pointCount} 个有限数据值/点，系列结构与 ${spec.mode} 模式一致。`,
        findings: [],
      }
    }

    if (scene.templateRef.id === TIME_EXPERIMENT_TEMPLATE_ID) {
      const runtime = createTimeExperimentRuntime(scene)
      let maxRopeError = 0
      for (let index = 0; index <= 180; index += 1) {
        const snapshot = runtime.snapshot(runtime.duration * index / 180)
        const values = [
          ...snapshot.bodies.flatMap((body) => [body.x, body.y]),
          ...snapshot.metrics.map((metric) => metric.value),
          ...snapshot.vectors.flatMap((vector) => [vector.x, vector.y, vector.magnitude]),
          ...snapshot.constraints.flatMap((constraint) => [
            constraint.anchorX,
            constraint.anchorY,
            constraint.restLength,
            constraint.currentLength,
          ]),
        ]
        if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e6)) {
          throw new Error(`t=${snapshot.time.toFixed(3)} 秒时出现无效或过大的数值。`)
        }
        for (const constraint of snapshot.constraints) {
          if (constraint.type === 'rope') maxRopeError = Math.max(maxRopeError, Math.abs(constraint.error))
        }
      }
      return {
        id: 'runtime-sampling',
        label: '运行区间采样',
        status: 'passed',
        detail: `已覆盖 0–${runtime.duration.toFixed(3)} 秒的 181 个时刻；绳长最大误差 ${maxRopeError.toExponential(2)}。`,
        findings: [],
      }
    }

    if (scene.templateRef.id === GEOMETRY_2D_TEMPLATE_ID) {
      const spec = getGeometry2DSpec(scene)
      const snapshot = evaluateGeometry2D(spec)
      const loci = sampleGeometryLoci(spec)
      const values = [
        ...snapshot.points.flatMap((point) => [point.x, point.y]),
        ...snapshot.measurements.map((measurement) => measurement.value),
        ...loci.flatMap((locus) => locus.points.flatMap((point) => [point.x, point.y])),
      ]
      if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e6)) {
        throw new Error('二维几何场景包含无效或过大的坐标/测量值。')
      }
      return {
        id: 'runtime-sampling',
        label: '几何状态计算',
        status: 'passed',
        detail: `已计算 ${snapshot.points.length} 个点、${snapshot.measurements.length} 个测量量和 ${loci.length} 条几何轨迹（共 ${loci.reduce((sum, locus) => sum + locus.points.length, 0)} 个本地采样点）；坐标与结果均为有限数。`,
        findings: [],
      }
    }

    if (scene.templateRef.id === RELATION_CURVE_2D_TEMPLATE_ID) {
      const spec = getRelationCurve2DSpec(scene)
      const sample = sampleRelationCurve(spec)
      const visiblePointCount = relationCurveVisiblePointCount(sample, spec)
      return {
        id: 'runtime-sampling',
        label: '关系曲线采样',
        status: 'passed',
        detail: `本地运行时生成 ${sample.paths.length} 条路径、${sample.pointCount} 个点，其中 ${visiblePointCount} 个采样点位于视口内。`,
        findings: [],
      }
    }

    return {
      id: 'runtime-sampling',
      label: '运行区间采样',
      status: 'warning',
      detail: `模板 ${scene.templateRef.id} 暂无专用采样器。`,
      findings: ['基础协议已校验，仍需管理员完整操作预览中的主要交互。'],
    }
  } catch (error) {
    return {
      id: 'runtime-sampling',
      label: '运行区间采样',
      status: 'failed',
      detail: '运行区间采样时发生错误。',
      findings: [error instanceof Error ? error.message : '未知运行错误。'],
    }
  }
}

function controlsCheck(scene: LessonScene): SceneReviewCheckResult {
  const targets = new Set(scene.controls.map((control) => control.target))
  const missing = Object.entries(scene.parameters)
    .filter(([, parameter]) => parameter.editable)
    .filter(([id]) => !targets.has(id))
    .map(([, parameter]) => parameter.label)
  if (missing.length > 0) {
    return {
      id: 'controls',
      label: '可编辑参数控件',
      status: 'warning',
      detail: `有 ${missing.length} 个可编辑参数没有直接对应的控件。`,
      findings: missing.map((label) => `缺少控件：${label}`),
    }
  }
  return {
    id: 'controls',
    label: '可编辑参数控件',
    status: 'passed',
    detail: `全部 ${Object.values(scene.parameters).filter((parameter) => parameter.editable).length} 个可编辑参数均可从界面操作。`,
    findings: [],
  }
}

function viewportCheck(scene: LessonScene): SceneReviewCheckResult {
  const { xMin, xMax, yMin, yMax, allowZoom } = scene.viewport
  const values = [xMin, xMax, yMin, yMax]
  const xSpan = xMax - xMin
  const ySpan = yMax - yMin
  if (values.some((value) => !Number.isFinite(value)) || xSpan <= 0 || ySpan <= 0) {
    return {
      id: 'viewport',
      label: '视口与缩放',
      status: 'failed',
      detail: '视口范围无效，无法可靠显示场景。',
      findings: [`x=[${xMin}, ${xMax}]，y=[${yMin}, ${yMax}]`],
    }
  }
  if (!allowZoom) {
    return {
      id: 'viewport',
      label: '视口与缩放',
      status: 'warning',
      detail: `视口范围有效（${xSpan.toFixed(2)} × ${ySpan.toFixed(2)}），但未允许缩放。`,
      findings: ['请在宽屏和窄屏预览中确认内容不会被裁切。'],
    }
  }
  return {
    id: 'viewport',
    label: '视口与缩放',
    status: 'passed',
    detail: `视口范围有效（${xSpan.toFixed(2)} × ${ySpan.toFixed(2)}）并允许缩放。`,
    findings: [],
  }
}

export function runSceneReviewChecks(scene: LessonScene): SceneReviewCheckReport {
  const protocol = protocolCheck(scene)
  const boundary = parameterBoundaryCheck(scene)
  const results = [
    protocol,
    boundary.result,
    runtimeSamplingCheck(scene, protocol.status !== 'failed'),
    controlsCheck(scene),
    viewportCheck(scene),
  ]
  return {
    status: aggregateStatus(results.map((result) => result.status)),
    results,
    testedCases: boundary.testedCases,
    completedAt: new Date().toISOString(),
  }
}
