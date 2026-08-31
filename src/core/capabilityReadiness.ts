import { CAPABILITY_REGISTRY, INSTALLED_CAPABILITY_BINDINGS, type CapabilityStatus } from './capabilityRegistry'
import { STANDALONE_HTML_EXPORTER_TEMPLATE_IDS } from './exportHtml'
import { getOfficialLibraryEntries } from './lessonLibrary'
import { capabilityIdForScene } from './sceneReuse'
import { runSceneReviewChecks } from './sceneReviewChecks'

export type BrowserEvidenceStatus = 'passed' | 'partial' | 'pending'
export type SubjectReviewStatus = 'approved' | 'needs-changes' | 'pending'
export type CapabilityReadinessStatus = 'verified' | 'technical-ready' | 'evidence-incomplete' | 'blocked'

export interface CapabilityVerificationEvidence {
  capabilityId: string
  acceptanceDocs: readonly string[]
  browser: {
    status: BrowserEvidenceStatus
    command?: string
    detail: string
  }
  subjectReview: {
    status: SubjectReviewStatus
    detail: string
  }
}

export interface CapabilityReadinessItem {
  capabilityId: string
  label: string
  declaredStatus: CapabilityStatus
  readinessStatus: CapabilityReadinessStatus
  officialExampleIds: string[]
  automatedSceneChecksPassed: boolean
  browserStatus: BrowserEvidenceStatus
  subjectReviewStatus: SubjectReviewStatus
  acceptanceDocs: readonly string[]
  blockers: string[]
  nextActions: string[]
}

export interface CapabilityReadinessReport {
  generatedAt: string
  items: CapabilityReadinessItem[]
  integrityIssues: string[]
  summary: {
    total: number
    verified: number
    technicalReady: number
    evidenceIncomplete: number
    blocked: number
    pendingSubjectReview: number
  }
}

export interface CapabilitySubjectReviewOverride {
  capabilityId: string
  status: SubjectReviewStatus
  detail?: string
}

export const CAPABILITY_VERIFICATION_EVIDENCE: readonly CapabilityVerificationEvidence[] = [
  {
    capabilityId: 'math.ellipse.focus-distance-sum',
    acceptanceDocs: ['docs/ellipse-mvp-acceptance.md', 'docs/object-editing-acceptance.md', 'docs/preset-acceptance.md'],
    browser: {
      status: 'passed', command: 'npm run acceptance:appearance -- 9333 http://127.0.0.1:5173',
      detail: '椭圆拖动、对象样式、草稿恢复、预设和离线 HTML 已有真实浏览器证据。',
    },
    subjectReview: { status: 'approved', detail: '内置椭圆审核模板。' },
  },
  {
    capabilityId: 'math.function.quadratic-vertex',
    acceptanceDocs: ['docs/quadratic-mvp-acceptance.md'],
    browser: {
      status: 'passed', command: 'npm run acceptance:quadratic -- 9333 http://127.0.0.1:5173',
      detail: 'a、h、k 参数、开口、顶点、对称轴、零点、正方形网格、对象样式、缩放、草稿和独立 HTML 已通过真实浏览器验收。',
    },
    subjectReview: { status: 'approved', detail: '内置二次函数审核模板。' },
  },
  {
    capabilityId: 'math.function.explicit-2d',
    acceptanceDocs: ['docs/explicit-function-2d-acceptance.md', 'docs/lesson-scene-spec.md'],
    browser: {
      status: 'passed', command: 'npm run acceptance:explicit-function -- 9333 http://127.0.0.1:5173',
      detail: '正弦官方场景的安全采样、A/B 参数、正方形网格、对象样式、缩放、草稿和独立 HTML 已通过真实浏览器验收。',
    },
    subjectReview: { status: 'pending', detail: '需要复核定义域、间断点、极值参数和结论适用范围。' },
  },
  {
    capabilityId: 'math.data.chart-2d',
    acceptanceDocs: ['docs/data-chart-2d-acceptance.md'],
    browser: {
      status: 'passed', command: 'npm run acceptance:data-chart -- 9333 http://127.0.0.1:5173',
      detail: '2026-08-30 已通过分布式类别轴扩展验收：6 个月份全部显示，横轴跨度 748、相邻间距 149.6，参考线与折线点逐一对齐；系列样式、缩放和离线 HTML 同时通过。',
    },
    subjectReview: { status: 'pending', detail: '需要复核原始数据、单位、图表选择和教学结论。' },
  },
  {
    capabilityId: 'math.geometry.primitives-2d',
    acceptanceDocs: ['docs/geometry-primitives-acceptance.md', 'docs/geometry-transform-acceptance.md'],
    browser: {
      status: 'passed', command: 'npm run acceptance:geometry-primitives -- 9333 http://127.0.0.1:5173',
      detail: '2026-08-29 已通过扩展验收：测量标签无重叠，整数吸附与纵坐标锁定生效，角度联动、撤销重做和离线 HTML 同时通过；变换、轨迹与圆约束也有既有通过记录。',
    },
    subjectReview: { status: 'pending', detail: '需要复核构造语义、角度方向、测量定义和退化图形。' },
  },
  {
    capabilityId: 'math.curve.relation-2d',
    acceptanceDocs: ['docs/relation-curve-2d-acceptance.md'],
    browser: {
      status: 'passed', command: 'npm run acceptance:relation-curve -- 9333 http://127.0.0.1:5173',
      detail: '极坐标采样、参数修改、对象样式、草稿和离线 HTML 已通过真实浏览器验收。',
    },
    subjectReview: { status: 'pending', detail: '需要复核不连续点、负极径、隐函数多分支和数值近似说明。' },
  },
  {
    capabilityId: 'math.geometry.parametric-trace-2d',
    acceptanceDocs: ['docs/parametric-trace-2d-acceptance.md', 'docs/time-experiment-mvp-acceptance.md', 'docs/contextual-scene-edit-acceptance.md'],
    browser: {
      status: 'passed', command: 'npm run acceptance:parametric-trace -- 9333 http://127.0.0.1:5173',
      detail: '2026-08-30 已通过最终点坐标吸附扩展验收：步长为 1 时在线右支动点落在 y=2 网格线，离线 HTML 动点落在 x=6 网格线；共享时间由 0.76 变为 5.47，左右两支同步更新且距离差保持 2a；固定焦点不可拖动，参数、样式和缩放同时通过。',
    },
    subjectReview: { status: 'pending', detail: '需要复核参数化范围、几何不变量和轨迹教学表述。' },
  },
  {
    capabilityId: 'physics.collision.discs-2d',
    acceptanceDocs: ['docs/collision-2d-acceptance.md'],
    browser: {
      status: 'passed', command: 'npm run acceptance:collision -- 9333 http://127.0.0.1:5173',
      detail: '2026-08-30 已通过扩展验收：A/B/C 的质量、vx、vy 可分别修改并进入对应运行时，四个参数分组、三圆盘运动、接触读数和无网络依赖的离线 HTML 同时通过。',
    },
    subjectReview: { status: 'pending', detail: '需要复核动量/动能结论的条件、擦碰和连续边界反弹。' },
  },
  {
    capabilityId: 'physics.motion.point-2d',
    acceptanceDocs: ['docs/motion-point-2d-acceptance.md', 'docs/time-experiment-mvp-acceptance.md', 'docs/constraint-primitives-mvp-acceptance.md', 'docs/multi-body-collision-mvp-acceptance.md'],
    browser: {
      status: 'passed', command: 'npm run acceptance:motion-point -- 9333 http://127.0.0.1:5173',
      detail: '当前协议下的自由落体终点、速度/重力矢量、轨迹，以及双摆多物体、独立轨迹、恒长绳、参数、对象样式和独立 HTML 已通过统一真实浏览器验收。',
    },
    subjectReview: { status: 'pending', detail: '需要按自由落体、抛体、单摆、弹簧和多物体分别复核前提与单位。' },
  },
]

function readinessStatus(
  declaredStatus: CapabilityStatus,
  automatedPassed: boolean,
  browserStatus: BrowserEvidenceStatus,
  subjectStatus: SubjectReviewStatus,
  hasOfficialExample: boolean,
): CapabilityReadinessStatus {
  if (!automatedPassed || !hasOfficialExample) return 'blocked'
  if (declaredStatus === 'verified' && subjectStatus === 'approved' && browserStatus === 'passed') return 'verified'
  if (browserStatus === 'passed') return 'technical-ready'
  return 'evidence-incomplete'
}

export function auditCapabilityReadiness(
  now = new Date(),
  subjectReviewOverrides: readonly CapabilitySubjectReviewOverride[] = [],
): CapabilityReadinessReport {
  const officialEntries = getOfficialLibraryEntries()
  const evidenceById = new Map(CAPABILITY_VERIFICATION_EVIDENCE.map((item) => [item.capabilityId, item]))
  const registryIds = new Set(CAPABILITY_REGISTRY.map((item) => item.id))
  const installedTemplateIds = new Set<string>(INSTALLED_CAPABILITY_BINDINGS.templateIds)
  const exporterTemplateIds = new Set<string>(STANDALONE_HTML_EXPORTER_TEMPLATE_IDS)
  const integrityIssues: string[] = []
  const subjectReviewById = new Map(subjectReviewOverrides.map((item) => [item.capabilityId, item]))

  for (const evidence of CAPABILITY_VERIFICATION_EVIDENCE) {
    if (!registryIds.has(evidence.capabilityId)) integrityIssues.push(`验收证据引用未知能力：${evidence.capabilityId}`)
  }
  if (evidenceById.size !== CAPABILITY_VERIFICATION_EVIDENCE.length) integrityIssues.push('能力验收证据存在重复 ID。')
  if (subjectReviewById.size !== subjectReviewOverrides.length) integrityIssues.push('能力学科复核记录存在重复 ID。')
  for (const review of subjectReviewOverrides) {
    if (!registryIds.has(review.capabilityId)) integrityIssues.push(`能力学科复核引用未知能力：${review.capabilityId}`)
  }

  const items = CAPABILITY_REGISTRY.map((capability): CapabilityReadinessItem => {
    const evidence = evidenceById.get(capability.id)
    if (!evidence) integrityIssues.push(`能力缺少验收证据：${capability.id}`)
    if (!installedTemplateIds.has(capability.templateId)) integrityIssues.push(`能力缺少模板绑定：${capability.id}`)
    if (!exporterTemplateIds.has(capability.templateId)) integrityIssues.push(`能力缺少独立 HTML 导出器：${capability.id}`)

    const examples = officialEntries.filter((entry) => capabilityIdForScene(entry.scene) === capability.id)
    const reports = examples.map((entry) => runSceneReviewChecks(entry.scene))
    const automatedPassed = examples.length > 0 && reports.every((report) => report.status !== 'failed')
    const browserStatus = evidence?.browser.status ?? 'pending'
    const subjectReview = subjectReviewById.get(capability.id)
    const subjectStatus = subjectReview?.status ?? evidence?.subjectReview.status ?? 'pending'
    const status = readinessStatus(capability.status, automatedPassed, browserStatus, subjectStatus, examples.length > 0)
    const blockers: string[] = []
    const nextActions: string[] = []

    if (examples.length === 0) blockers.push('缺少与该能力直接对应的官方代表场景。')
    if (examples.length > 0 && !automatedPassed) blockers.push('至少一个官方代表场景未通过当前自动运行检查。')
    if (browserStatus !== 'passed') nextActions.push(evidence?.browser.detail ?? '补充专用真实浏览器验收。')
    if (subjectStatus !== 'approved') {
      nextActions.push(subjectReview?.detail ?? evidence?.subjectReview.detail ?? '完成学科人工复核。')
    } else if (capability.status !== 'verified') {
      nextActions.push('学科复核已批准；确认记录与被审版本一致后，将平台注册状态晋升为 verified。')
    }
    if (capability.status === 'verified' && browserStatus !== 'passed') {
      nextActions.push('补齐当前晋升规则要求的专用浏览器证据；在此之前保留既有 verified 状态但不得作为新能力晋升范例。')
    }

    return {
      capabilityId: capability.id,
      label: capability.label,
      declaredStatus: capability.status,
      readinessStatus: status,
      officialExampleIds: examples.map((entry) => entry.id),
      automatedSceneChecksPassed: automatedPassed,
      browserStatus,
      subjectReviewStatus: subjectStatus,
      acceptanceDocs: evidence?.acceptanceDocs ?? [],
      blockers,
      nextActions,
    }
  })

  const count = (status: CapabilityReadinessStatus) => items.filter((item) => item.readinessStatus === status).length
  return {
    generatedAt: now.toISOString(),
    items,
    integrityIssues,
    summary: {
      total: items.length,
      verified: count('verified'),
      technicalReady: count('technical-ready'),
      evidenceIncomplete: count('evidence-incomplete'),
      blocked: count('blocked'),
      pendingSubjectReview: items.filter((item) => item.subjectReviewStatus !== 'approved').length,
    },
  }
}
