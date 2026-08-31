import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ReviewScenePreview } from './components/ReviewScenePreview'
import { ReadableReviewDialog } from './components/ReadableReviewDialog'
import {
  AdminApiError,
  loadAdminSubmissions,
  loginAdmin,
  logoutAdmin,
  moderateAdminSubmission,
  restoreAdminSession,
  retryAdminPreReview,
  type AdminDirectoryEntry,
  type AdminReviewEvent,
  type AdminReviewStatus,
  type AdminSession,
  type PreReviewCategory,
} from './core/adminReviewApi'
import { parseLessonImport } from './core/lessonPackage'
import { describeLessonPlanChanges } from './core/lessonPlanDiff'
import { lessonPlanFromScene } from './core/modelGateway'
import {
  runSceneReviewChecks,
  type SceneReviewCheckReport,
  type SceneReviewCheckStatus,
} from './core/sceneReviewChecks'
import type { LessonScene, Subject } from './types/lessonScene'

type SessionState = 'checking' | 'signed-out' | 'signed-in'
type QueueFilter = 'all' | AdminReviewStatus | 'ai-issues' | 'ai-failed'

const STATUS_LABELS: Record<AdminReviewStatus, string> = {
  pending: '待人工审核',
  'needs-changes': '待提交者修改',
  verified: '已审核通过',
  rejected: '已拒绝',
  deprecated: '已下架',
}

const SUBJECT_LABELS: Record<Subject, string> = {
  math: '数学',
  physics: '物理',
  chemistry: '化学',
  geography: '地理',
}

const CATEGORY_LABELS: Record<PreReviewCategory, string> = {
  'scientific-accuracy': '科学准确性',
  'formula-unit-consistency': '公式与单位',
  'parameter-boundary': '参数边界',
  'teaching-suitability': '教学适用性',
  'interaction-clarity': '交互清晰度',
  'safety-privacy': '安全与隐私',
  maintenance: '维护性',
}

const AUTO_CHECK_STATUS_LABELS: Record<SceneReviewCheckStatus, string> = {
  passed: '通过',
  warning: '需人工确认',
  failed: '未通过',
}

const REVIEW_ACTOR_LABELS: Record<AdminReviewEvent['actor'], string> = {
  submitter: '提交者',
  admin: '管理员',
  ai: 'AI预审',
  system: '系统',
}

const CHECKLIST = [
  { id: 'accuracy', label: '公式、结论与学科知识准确' },
  { id: 'boundaries', label: '已测试主要参数的最小值和最大值' },
  { id: 'visual', label: '宽屏、窄屏下图像和文字均可读' },
  { id: 'interaction', label: '拖动、播放、重置等交互正常' },
] as const

function formattedTime(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function reviewEventTitle(event: AdminReviewEvent): string {
  if (event.type === 'submitted') return '提交场景'
  if (event.type === 'revision-linked') return '关联修改版本'
  if (event.type === 'pre-review-queued') return 'AI预审排队'
  if (event.type === 'pre-review-completed') return 'AI预审完成'
  if (event.type === 'pre-review-failed') return 'AI预审失败'
  if (event.previousStatus && event.status && event.previousStatus !== event.status) {
    return `${STATUS_LABELS[event.previousStatus]} → ${STATUS_LABELS[event.status]}`
  }
  return event.status ? `更新“${STATUS_LABELS[event.status]}”审核记录` : '更新人工审核记录'
}

function preReviewLabel(entry: AdminDirectoryEntry): string {
  const preReview = entry.preReview
  if (!preReview) return '尚未AI预审'
  if (preReview.status === 'queued') return 'AI预审中'
  if (preReview.status === 'failed') return 'AI预审失败'
  if (preReview.result?.verdict === 'issues-found') {
    return `AI发现${preReview.result.issues.length}项`
  }
  return 'AI未发现问题'
}

function sceneFrom(entry: AdminDirectoryEntry | undefined): { scene?: LessonScene; error?: string } {
  if (!entry) return {}
  try {
    return { scene: parseLessonImport(entry.lessonPackage).scene }
  } catch (error) {
    return { error: error instanceof Error ? error.message : '无法实例化该场景包。' }
  }
}

function revisionDifferences(
  previous: AdminDirectoryEntry | undefined,
  current: AdminDirectoryEntry | undefined,
): string[] {
  if (!current) return []
  if (!previous) return ['无法读取原版本，需检查目录中的版本关联。']
  try {
    const previousPlan = lessonPlanFromScene(parseLessonImport(previous.lessonPackage).scene)
    const currentPlan = lessonPlanFromScene(parseLessonImport(current.lessonPackage).scene)
    const changes = describeLessonPlanChanges(previousPlan, currentPlan, 12)
    return changes.length > 0 ? changes : ['场景规划内容没有可识别的结构变化。']
  } catch (error) {
    return [error instanceof Error ? `无法自动比较：${error.message}` : '无法自动比较这两个版本。']
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '审核操作失败。'
}

export default function AdminReviewApp() {
  const [sessionState, setSessionState] = useState<SessionState>('checking')
  const [session, setSession] = useState<AdminSession | null>(null)
  const [loginToken, setLoginToken] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [entries, setEntries] = useState<AdminDirectoryEntry[]>([])
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('id') ?? '')
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [queueError, setQueueError] = useState('')
  const [filter, setFilter] = useState<QueueFilter>('pending')
  const [subject, setSubject] = useState<'all' | Subject>('all')
  const [search, setSearch] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [busyAction, setBusyAction] = useState<AdminReviewStatus | 'pre-review' | null>(null)
  const [actionMessage, setActionMessage] = useState('')
  const [expandedPreReview, setExpandedPreReview] = useState(false)
  const [autoCheckReport, setAutoCheckReport] = useState<SceneReviewCheckReport | null>(null)
  const [expandedAutoCheck, setExpandedAutoCheck] = useState(false)

  const handleAuthError = useCallback((error: unknown): boolean => {
    if (error instanceof AdminApiError && error.status === 401) {
      setSession(null)
      setSessionState('signed-out')
      setLoginError('管理员会话已失效，请重新登录。')
      return true
    }
    return false
  }, [])

  const refreshQueue = useCallback(async () => {
    setLoadingQueue(true)
    setQueueError('')
    try {
      const next = await loadAdminSubmissions()
      setEntries(next)
      setSelectedId((current) => {
        if (current && next.some((entry) => entry.id === current)) return current
        return next.find((entry) => entry.reviewStatus === 'pending')?.id ?? next[0]?.id ?? ''
      })
    } catch (error) {
      if (!handleAuthError(error)) setQueueError(errorMessage(error))
    } finally {
      setLoadingQueue(false)
    }
  }, [handleAuthError])

  useEffect(() => {
    let active = true
    void restoreAdminSession()
      .then((restored) => {
        if (!active) return
        setSession(restored)
        setSessionState(restored ? 'signed-in' : 'signed-out')
      })
      .catch((error) => {
        if (!active) return
        setSessionState('signed-out')
        setLoginError(errorMessage(error))
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (sessionState === 'signed-in') void refreshQueue()
  }, [refreshQueue, sessionState])

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId),
    [entries, selectedId],
  )
  const preview = useMemo(() => sceneFrom(selected), [selected])
  const revisionParent = useMemo(
    () => selected?.revisionOf ? entries.find((entry) => entry.id === selected.revisionOf) : undefined,
    [entries, selected],
  )
  const newerRevision = useMemo(
    () => selected?.supersededBy ? entries.find((entry) => entry.id === selected.supersededBy) : undefined,
    [entries, selected],
  )
  const revisionChanges = useMemo(
    () => revisionDifferences(revisionParent, selected),
    [revisionParent, selected],
  )

  useEffect(() => {
    setReviewNote(selected?.reviewNote ?? '')
    setChecked({})
    setActionMessage('')
    setExpandedPreReview(false)
    setAutoCheckReport(null)
    setExpandedAutoCheck(false)
    if (selected) {
      const url = new URL(window.location.href)
      url.searchParams.set('id', selected.id)
      window.history.replaceState(null, '', url)
    }
  }, [selected?.id])

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('zh-CN')
    return entries.filter((entry) => {
      if (subject !== 'all' && entry.subject !== subject) return false
      if (filter === 'ai-issues' && entry.preReview?.result?.verdict !== 'issues-found') return false
      if (filter === 'ai-failed' && entry.preReview?.status !== 'failed') return false
      if (!['all', 'ai-issues', 'ai-failed'].includes(filter) && entry.reviewStatus !== filter) return false
      if (!normalizedSearch) return true
      return [entry.title, entry.summary, entry.id, entry.sourceFilename]
        .some((value) => value?.toLocaleLowerCase('zh-CN').includes(normalizedSearch))
    })
  }, [entries, filter, search, subject])

  const pendingCount = entries.filter((entry) => entry.reviewStatus === 'pending').length
  const issueCount = entries.filter((entry) => entry.preReview?.result?.verdict === 'issues-found').length
  const allChecksComplete = CHECKLIST.every((item) => checked[item.id])
  const automaticChecksAllowApproval = autoCheckReport !== null && autoCheckReport.status !== 'failed'

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (!loginToken.trim()) return
    setLoggingIn(true)
    setLoginError('')
    try {
      const next = await loginAdmin(loginToken)
      setLoginToken('')
      setSession(next)
      setSessionState('signed-in')
    } catch (error) {
      setLoginError(errorMessage(error))
    } finally {
      setLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    if (session) {
      try {
        await logoutAdmin(session.csrfToken)
      } catch {
        // Always clear the local in-memory session view after an explicit logout.
      }
    }
    setSession(null)
    setEntries([])
    setSessionState('signed-out')
  }

  const replaceEntry = (next: AdminDirectoryEntry) => {
    setEntries((current) => current.map((entry) => entry.id === next.id ? next : entry))
  }

  const moderate = async (nextStatus: AdminReviewStatus) => {
    if (!selected || !session) return
    if ((nextStatus === 'needs-changes' || nextStatus === 'rejected') && !reviewNote.trim()) {
      setActionMessage('退回修改或拒绝时，请先填写具体问题和处理建议。')
      return
    }
    if (nextStatus === 'verified' && !autoCheckReport) {
      setActionMessage('审核通过前需要先运行一次自动检查。')
      return
    }
    if (nextStatus === 'verified' && autoCheckReport?.status === 'failed') {
      setActionMessage('自动检查仍有失败项，请退回修改或确认修复后重新检查。')
      return
    }
    if (nextStatus === 'verified' && !allChecksComplete) {
      setActionMessage('审核通过前需要完成四项人工检查。')
      return
    }
    if (nextStatus === 'verified' && !window.confirm(`确认将“${selected.title}”发布到共享第三方库吗？`)) return
    if (nextStatus === 'rejected' && !window.confirm(`确认永久拒绝“${selected.title}”吗？`)) return
    setBusyAction(nextStatus)
    setActionMessage('')
    try {
      const defaultNote = nextStatus === 'verified' && !reviewNote.trim()
        ? '管理员已复核科学内容、参数边界、视觉效果和主要交互。'
        : reviewNote
      const next = await moderateAdminSubmission(
        selected.id,
        nextStatus,
        defaultNote,
        session.csrfToken,
      )
      replaceEntry(next)
      setReviewNote(next.reviewNote ?? '')
      setActionMessage(`已更新为“${STATUS_LABELS[nextStatus]}”。`)
    } catch (error) {
      if (!handleAuthError(error)) setActionMessage(errorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  const retryPreReview = async () => {
    if (!selected || !session) return
    setBusyAction('pre-review')
    setActionMessage('AI正在按照当前审核标准重新预审，请稍候。')
    try {
      const next = await retryAdminPreReview(selected.id, session.csrfToken)
      replaceEntry(next)
      setActionMessage(next.preReview?.status === 'completed'
        ? 'AI预审已更新，最终结论仍由管理员决定。'
        : 'AI预审未完成，请查看失败原因。')
    } catch (error) {
      if (!handleAuthError(error)) setActionMessage(errorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  const runAutomaticChecks = () => {
    if (!preview.scene) {
      setActionMessage('场景无法加载，不能运行自动检查。')
      return
    }
    const report = runSceneReviewChecks(preview.scene)
    setAutoCheckReport(report)
    setActionMessage(report.status === 'failed'
      ? '自动检查发现失败项，请查看详情。'
      : report.status === 'warning'
        ? '自动检查完成，有提醒项需要人工确认。'
        : '自动检查全部通过，请继续完成人工终审。')
  }

  if (sessionState === 'checking') {
    return (
      <main className="admin-auth-shell">
        <div className="admin-auth-card admin-auth-card--loading"><span className="admin-spinner" />正在检查管理员会话…</div>
      </main>
    )
  }

  if (sessionState === 'signed-out') {
    return (
      <main className="admin-auth-shell">
        <form className="admin-auth-card" onSubmit={(event) => void handleLogin(event)}>
          <a className="brand" href="/" aria-label="返回 Word2HTML">
            <span className="brand-mark"><i /><i /><i /></span>
            <span><strong>Word2HTML</strong><small>第三方库审核</small></span>
          </a>
          <div className="admin-auth-copy">
            <span className="eyebrow">管理员入口</span>
            <h1>进入可视化审核台</h1>
            <p>令牌只用于建立服务端短期会话，不会保存到地址栏或浏览器本地存储。</p>
          </div>
          <label className="admin-token-field">
            <span>管理员令牌</span>
            <input
              type="password"
              value={loginToken}
              autoComplete="current-password"
              onChange={(event) => setLoginToken(event.target.value)}
              placeholder="输入 WORD2HTML_ADMIN_TOKEN"
              autoFocus
            />
          </label>
          {loginError && <div className="admin-auth-error" role="alert">{loginError}</div>}
          <button className="admin-login-button" type="submit" disabled={loggingIn || !loginToken.trim()}>
            {loggingIn ? '正在登录…' : '登录审核台'}
          </button>
          <a className="admin-back-link" href="/">← 返回普通应用</a>
        </form>
      </main>
    )
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <a className="brand" href="/admin/reviews">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>Word2HTML</strong><small>第三方库审核台</small></span>
        </a>
        <div className="admin-summary-strip">
          <div><strong>{pendingCount}</strong><span>待人工审核</span></div>
          <div><strong>{issueCount}</strong><span>AI标记风险</span></div>
          <div><strong>{entries.length}</strong><span>全部提交</span></div>
        </div>
        <nav className="admin-top-actions">
          <button type="button" onClick={() => void refreshQueue()} disabled={loadingQueue}>{loadingQueue ? '刷新中…' : '刷新队列'}</button>
          <a href="/admin/users">用户管理</a>
          <a href="/admin/models">模型设置</a>
          <a href="/admin/capabilities">能力学科复核</a>
          <a href="/">普通应用</a>
          <button type="button" onClick={() => void handleLogout()}>退出</button>
        </nav>
      </header>

      <main className="admin-workspace">
        <aside className="admin-queue-panel">
          <div className="admin-panel-heading">
            <div><span className="eyebrow">审核队列</span><h1>第三方提交</h1></div>
            <span>{filteredEntries.length}/{entries.length}</span>
          </div>
          <label className="admin-search-field">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、文件或编号" />
          </label>
          <div className="admin-filter-row">
            <select value={filter} onChange={(event) => setFilter(event.target.value as QueueFilter)} aria-label="审核状态筛选">
              <option value="pending">待人工审核</option>
              <option value="ai-issues">AI发现问题</option>
              <option value="ai-failed">AI预审失败</option>
              <option value="needs-changes">待提交者修改</option>
              <option value="verified">已审核通过</option>
              <option value="rejected">已拒绝</option>
              <option value="deprecated">已下架</option>
              <option value="all">全部状态</option>
            </select>
            <select value={subject} onChange={(event) => setSubject(event.target.value as 'all' | Subject)} aria-label="学科筛选">
              <option value="all">全部学科</option>
              <option value="math">数学</option>
              <option value="physics">物理</option>
              <option value="chemistry">化学</option>
              <option value="geography">地理</option>
            </select>
          </div>
          {queueError && <div className="admin-queue-error" role="alert">{queueError}</div>}
          <div className="admin-queue-list">
            {filteredEntries.map((entry) => (
              <button
                className={`admin-queue-card ${entry.id === selectedId ? 'active' : ''}`}
                type="button"
                key={entry.id}
                onClick={() => setSelectedId(entry.id)}
              >
                <div className="admin-queue-card-top">
                  <span className={`admin-subject admin-subject--${entry.subject}`}>{SUBJECT_LABELS[entry.subject]}</span>
                  <span className={`admin-status-dot admin-status-dot--${entry.reviewStatus}`}>{STATUS_LABELS[entry.reviewStatus]}</span>
                </div>
                <strong>{entry.title}</strong>
                <p>{entry.summary}</p>
                <div className="admin-queue-card-meta">
                  <div>
                    <span className={`admin-ai-label admin-ai-label--${entry.preReview?.status === 'failed' ? 'failed' : entry.preReview?.result?.verdict ?? 'queued'}`}>
                      {preReviewLabel(entry)}
                    </span>
                    {entry.revisionOf && <span className="admin-revision-chip">修改版</span>}
                  </div>
                  <time>{formattedTime(entry.createdAt)}</time>
                </div>
              </button>
            ))}
            {!loadingQueue && filteredEntries.length === 0 && (
              <div className="admin-empty-queue">当前筛选条件下没有提交。</div>
            )}
          </div>
        </aside>

        <section className="admin-preview-panel">
          {selected ? (
            <>
              <div className="admin-entry-heading">
                <div>
                  <div className="admin-entry-kicker">
                    <span>{SUBJECT_LABELS[selected.subject]}</span>
                    <span>{selected.id}</span>
                    <span>提交于 {formattedTime(selected.createdAt)}</span>
                  </div>
                  <h2>{selected.title}</h2>
                  <p>{selected.summary}</p>
                </div>
                <span className={`admin-current-status admin-current-status--${selected.reviewStatus}`}>
                  {STATUS_LABELS[selected.reviewStatus]}
                </span>
              </div>
              <div className="admin-package-facts">
                <span><b>源文件</b>{selected.sourceFilename ?? '未提供'}</span>
                <span><b>内容哈希</b>{selected.contentHash.slice(0, 16)}…</span>
                <span><b>最近更新</b>{formattedTime(selected.updatedAt)}</span>
              </div>
              {selected.revisionOf && (
                <section className="admin-version-card admin-version-card--revision">
                  <div className="admin-version-card-heading">
                    <div>
                      <span className="eyebrow">修改版本对比</span>
                      <h3>{revisionParent ? `基于“${revisionParent.title}”修改` : '原版本记录暂不可用'}</h3>
                    </div>
                    {revisionParent && (
                      <button type="button" onClick={() => setSelectedId(revisionParent.id)}>查看原版本</button>
                    )}
                  </div>
                  {revisionParent?.reviewNote && (
                    <div className="admin-original-review-note"><b>原退回意见</b><p>{revisionParent.reviewNote}</p></div>
                  )}
                  <ul>{revisionChanges.map((change) => <li key={change}>{change}</li>)}</ul>
                  <small>差异由本地 LessonPlan 比较生成，不调用AI、不消耗token。</small>
                </section>
              )}
              {newerRevision && (
                <section className="admin-version-card admin-version-card--newer">
                  <div>
                    <span className="eyebrow">已有后续版本</span>
                    <h3>提交者已经提交“{newerRevision.title}”修改版</h3>
                  </div>
                  <button type="button" onClick={() => setSelectedId(newerRevision.id)}>转到修改版审核</button>
                </section>
              )}
              {preview.scene ? (
                <ReviewScenePreview initialScene={preview.scene} />
              ) : (
                <div className="admin-preview-error" role="alert">
                  <strong>无法加载交互预览</strong><p>{preview.error}</p>
                </div>
              )}
            </>
          ) : (
            <div className="admin-empty-preview"><span>◇</span><strong>从左侧选择一个提交</strong><p>实验会在这里直接运行，无需下载和重新导入。</p></div>
          )}
        </section>

        <aside className="admin-decision-panel">
          {selected ? (
            <>
              <section className="admin-review-section">
                <div className="admin-section-heading">
                  <div><span className="eyebrow">AI预审</span><h2>{preReviewLabel(selected)}</h2></div>
                  <div className="admin-section-actions">
                    {selected.preReview?.status === 'completed' && (
                      <button className="admin-read-large-button" type="button" onClick={() => setExpandedPreReview(true)}>放大阅读</button>
                    )}
                    <button type="button" onClick={() => void retryPreReview()} disabled={busyAction !== null}>
                      {busyAction === 'pre-review' ? '预审中…' : '重新预审'}
                    </button>
                  </div>
                </div>
                {!selected.preReview ? (
                  <div className="admin-ai-state">该条目尚无AI预审记录，可点击“重新预审”；管理员也可以直接人工审核。</div>
                ) : selected.preReview.status === 'queued' ? (
                  <div className="admin-ai-state"><span className="admin-spinner" />预审任务正在处理或等待服务恢复。</div>
                ) : selected.preReview.status === 'failed' ? (
                  <div className="admin-ai-state admin-ai-state--failed">
                    <strong>模型预审未完成</strong><p>{selected.preReview.error}</p>
                  </div>
                ) : (
                  <>
                    <div className={`admin-ai-summary admin-ai-summary--${selected.preReview.result?.verdict}`}>
                      <strong>{selected.preReview.result?.verdict === 'no-issues' ? '未发现明确问题' : '发现需人工确认的问题'}</strong>
                      <p>{selected.preReview.result?.summary}</p>
                    </div>
                    {selected.preReview.result?.issues.map((issue, index) => (
                      <article className={`admin-issue-card admin-issue-card--${issue.severity}`} key={`${issue.location}-${index}`}>
                        <div><span>{CATEGORY_LABELS[issue.category]}</span><b>{issue.severity === 'critical' ? '严重' : issue.severity === 'error' ? '错误' : '提醒'}</b></div>
                        <code>{issue.location}</code>
                        <p>{issue.finding}</p>
                        <small><b>建议：</b>{issue.suggestedAction}</small>
                      </article>
                    ))}
                    <details className="admin-manual-focus" open={selected.preReview.result?.issues.length === 0}>
                      <summary>AI建议人工重点检查</summary>
                      <ul>{selected.preReview.result?.manualReviewFocus.map((item) => <li key={item}>{item}</li>)}</ul>
                    </details>
                    {selected.preReview.usage && (
                      <div className="admin-ai-usage">
                        {selected.preReview.provider?.model ?? 'AI'} · {selected.preReview.usage.modelCalls ?? 0} 次调用 · 输入 {selected.preReview.usage.inputTokens ?? 0} / 输出 {selected.preReview.usage.outputTokens ?? 0} tokens
                      </div>
                    )}
                  </>
                )}
              </section>

              <section className="admin-review-section">
                <div className="admin-section-heading">
                  <div><span className="eyebrow">确定性检查</span><h2>场景自动检查</h2></div>
                  <div className="admin-section-actions">
                    {autoCheckReport && (
                      <button className="admin-read-large-button" type="button" onClick={() => setExpandedAutoCheck(true)}>放大阅读</button>
                    )}
                    <button type="button" onClick={runAutomaticChecks} disabled={!preview.scene || busyAction !== null}>
                      {autoCheckReport ? '重新检查' : '运行检查'}
                    </button>
                  </div>
                </div>
                {!autoCheckReport ? (
                  <div className="admin-auto-check-empty">
                    自动测试默认值、参数最小/最大值、完整运行区间、控件覆盖和视口；只在本机计算，不调用AI、不消耗token。
                  </div>
                ) : (
                  <>
                    <div className={`admin-auto-check-summary admin-auto-check-summary--${autoCheckReport.status}`}>
                      <strong>{AUTO_CHECK_STATUS_LABELS[autoCheckReport.status]}</strong>
                      <p>
                        {autoCheckReport.results.filter((result) => result.status === 'passed').length} 项通过
                        {' · '}{autoCheckReport.results.filter((result) => result.status === 'warning').length} 项提醒
                        {' · '}{autoCheckReport.results.filter((result) => result.status === 'failed').length} 项失败
                        {' · '}{autoCheckReport.testedCases} 组参数
                      </p>
                    </div>
                    <div className="admin-auto-check-list">
                      {autoCheckReport.results.map((result) => (
                        <article className={`admin-auto-check-item admin-auto-check-item--${result.status}`} key={result.id}>
                          <div><strong>{result.label}</strong><span>{AUTO_CHECK_STATUS_LABELS[result.status]}</span></div>
                          <p>{result.detail}</p>
                          {result.findings.length > 0 && (
                            <ul>{result.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>
                          )}
                        </article>
                      ))}
                    </div>
                    <small className="admin-auto-check-note">自动结果只用于辅助；提醒项可由管理员复核后通过，失败项会阻止发布。</small>
                  </>
                )}
              </section>

              <section className="admin-review-section">
                <span className="eyebrow">操作追溯</span>
                <h2>审核时间线</h2>
                {selected.reviewHistory && selected.reviewHistory.length > 0 ? (
                  <ol className="admin-review-timeline">
                    {[...selected.reviewHistory].reverse().map((event) => {
                      const relatedEntry = event.relatedEntryId
                        ? entries.find((entry) => entry.id === event.relatedEntryId)
                        : undefined
                      return (
                        <li className={`admin-review-event admin-review-event--${event.type}`} key={event.id}>
                          <span className="admin-review-event-marker" aria-hidden="true" />
                          <div className="admin-review-event-heading">
                            <strong>{reviewEventTitle(event)}</strong>
                            <time>{formattedTime(event.at)}</time>
                          </div>
                          <div className="admin-review-event-actor">{REVIEW_ACTOR_LABELS[event.actor]}</div>
                          {event.summary && <p>{event.summary}</p>}
                          {event.note && <blockquote>{event.note}</blockquote>}
                          {event.relatedEntryId && (
                            relatedEntry ? (
                              <button type="button" onClick={() => setSelectedId(relatedEntry.id)}>
                                查看关联版本：{relatedEntry.title}
                              </button>
                            ) : (
                              <code>{event.relatedEntryId}</code>
                            )
                          )}
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <div className="admin-auto-check-empty">该旧条目暂时没有可显示的审核事件。</div>
                )}
                <small className="admin-history-note">时间线仅对管理员可见；公共库和提交者状态接口不会返回这些内部记录。</small>
              </section>

              <section className="admin-review-section">
                <span className="eyebrow">人工终审</span>
                <h2>检查清单</h2>
                <div className="admin-checklist">
                  {CHECKLIST.map((item) => (
                    <label key={item.id}>
                      <input
                        type="checkbox"
                        checked={Boolean(checked[item.id])}
                        onChange={(event) => setChecked((current) => ({ ...current, [item.id]: event.target.checked }))}
                      />
                      <span aria-hidden="true">✓</span>{item.label}
                    </label>
                  ))}
                </div>
              </section>

              <section className="admin-review-section admin-review-note-section">
                <label htmlFor="admin-review-note"><span className="eyebrow">审核意见</span><b>写给维护者的说明</b></label>
                <textarea
                  id="admin-review-note"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  rows={5}
                  maxLength={500}
                  placeholder="指出具体位置、问题和修改建议；退回或拒绝时必填。"
                />
                <div className="admin-note-templates">
                  <button type="button" onClick={() => setReviewNote('请调整参数范围，并确认最小值和最大值下实验仍能正常运行。')}>参数范围</button>
                  <button type="button" onClick={() => setReviewNote('请修正公式、单位或教学结论，并确保与图中展示一致。')}>公式结论</button>
                  <button type="button" onClick={() => setReviewNote('请处理文字重叠或画面裁切，确保窄屏下仍完整可读。')}>显示问题</button>
                </div>
              </section>

              {actionMessage && <div className="admin-action-message" role="status">{actionMessage}</div>}
              <div className="admin-decision-actions">
                <button
                  className="admin-approve-button"
                  type="button"
                  onClick={() => void moderate('verified')}
                  disabled={busyAction !== null || !automaticChecksAllowApproval || !allChecksComplete}
                  title={!autoCheckReport ? '请先运行自动检查' : autoCheckReport.status === 'failed' ? '自动检查有失败项' : !allChecksComplete ? '请完成人工检查清单' : undefined}
                >
                  {busyAction === 'verified' ? '正在发布…' : '审核通过并发布'}
                </button>
                <div>
                  <button className="admin-return-button" type="button" onClick={() => void moderate('needs-changes')} disabled={busyAction !== null}>退回修改</button>
                  <button className="admin-reject-button" type="button" onClick={() => void moderate('rejected')} disabled={busyAction !== null}>拒绝收录</button>
                </div>
                {selected.reviewStatus === 'verified' && (
                  <button className="admin-deprecate-button" type="button" onClick={() => void moderate('deprecated')} disabled={busyAction !== null}>从公开库下架</button>
                )}
              </div>
            </>
          ) : (
            <div className="admin-empty-decision">选择提交后显示AI预审和终审操作。</div>
          )}
        </aside>
      </main>
      <ReadableReviewDialog
        open={expandedPreReview && selected?.preReview?.status === 'completed'}
        eyebrow="AI预审 · 大字号阅读"
        title={selected ? `${selected.title}审核意见` : '审核意见'}
        onClose={() => setExpandedPreReview(false)}
      >
        {selected?.preReview?.status === 'completed' && selected.preReview.result && (
          <>
            <section className={`readable-review-summary readable-review-summary--${selected.preReview.result.verdict}`}>
              <h3>{selected.preReview.result.verdict === 'no-issues' ? 'AI未发现明确问题' : 'AI发现需人工确认的问题'}</h3>
              <p>{selected.preReview.result.summary}</p>
            </section>
            {selected.preReview.result.issues.length > 0 && (
              <section className="readable-review-list-section">
                <h3>问题与处理建议</h3>
                <div className="readable-review-issues">
                  {selected.preReview.result.issues.map((issue, index) => (
                    <article className={`readable-review-issue readable-review-issue--${issue.severity}`} key={`${issue.location}-${index}`}>
                      <div className="readable-review-issue-heading">
                        <strong>{index + 1}. {CATEGORY_LABELS[issue.category]}</strong>
                        <span>{issue.severity === 'critical' ? '严重' : issue.severity === 'error' ? '错误' : '提醒'}</span>
                      </div>
                      <code>{issue.location}</code>
                      <p>{issue.finding}</p>
                      <div className="readable-review-suggestion"><b>处理建议</b>{issue.suggestedAction}</div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <section className="readable-review-list-section">
              <h3>人工复核重点</h3>
              <ul>{selected.preReview.result.manualReviewFocus.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            {reviewNote.trim() && (
              <section className="readable-review-note">
                <h3>当前拟返回给用户的意见</h3>
                <p>{reviewNote}</p>
              </section>
            )}
          </>
        )}
      </ReadableReviewDialog>
      <ReadableReviewDialog
        open={expandedAutoCheck && autoCheckReport !== null}
        eyebrow="场景自动检查 · 大字号阅读"
        title={selected ? `${selected.title}自动检查结果` : '自动检查结果'}
        onClose={() => setExpandedAutoCheck(false)}
      >
        {autoCheckReport && (
          <>
            <section className={`readable-review-summary readable-auto-check-summary--${autoCheckReport.status}`}>
              <h3>总体结果：{AUTO_CHECK_STATUS_LABELS[autoCheckReport.status]}</h3>
              <p>
                共检查 {autoCheckReport.results.length} 项，覆盖 {autoCheckReport.testedCases} 组参数边界。
                本报告由浏览器确定性运行时生成，不调用AI、不消耗token。
              </p>
            </section>
            <section className="readable-review-list-section">
              <h3>逐项结果</h3>
              <div className="readable-review-issues">
                {autoCheckReport.results.map((result, index) => (
                  <article className={`readable-review-issue readable-auto-check-item--${result.status}`} key={result.id}>
                    <div className="readable-review-issue-heading">
                      <strong>{index + 1}. {result.label}</strong>
                      <span>{AUTO_CHECK_STATUS_LABELS[result.status]}</span>
                    </div>
                    <p>{result.detail}</p>
                    {result.findings.length > 0 && (
                      <ul>{result.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>
                    )}
                  </article>
                ))}
              </div>
            </section>
            <section className="readable-review-note">
              <h3>管理员仍需确认</h3>
              <p>自动检查不能判断教学表述是否恰当，也不能替代宽屏/窄屏视觉检查和真实拖动、播放体验。</p>
            </section>
          </>
        )}
      </ReadableReviewDialog>
    </div>
  )
}
