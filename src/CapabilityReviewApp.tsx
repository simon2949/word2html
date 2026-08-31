import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import packageMetadata from '../package.json'
import { ReviewScenePreview } from './components/ReviewScenePreview'
import {
  AdminApiError,
  loadCapabilitySubjectReviews,
  loginAdmin,
  logoutAdmin,
  restoreAdminSession,
  saveCapabilitySubjectReview,
  type AdminSession,
  type CapabilitySubjectReviewInput,
  type CapabilitySubjectReviewRecord,
  type CapabilitySubjectReviewStatus,
} from './core/adminReviewApi'
import {
  CAPABILITY_SUBJECT_REVIEW_DEFINITIONS,
  type CapabilitySubjectReviewDefinition,
} from './core/capabilitySubjectReviewDefinitions'
import { getOfficialLibraryEntries } from './core/lessonLibrary'
import type { Subject } from './types/lessonScene'

type SessionState = 'checking' | 'signed-out' | 'signed-in'

const STATUS_LABELS: Record<CapabilitySubjectReviewStatus, string> = {
  pending: '待复核',
  'needs-changes': '需要修改',
  approved: '已批准',
}

const SUBJECT_LABELS: Record<Subject, string> = {
  math: '数学',
  physics: '物理',
  chemistry: '化学',
  geography: '地理',
}

const FIRST_DEFINITION = CAPABILITY_SUBJECT_REVIEW_DEFINITIONS[0]!
export const RECOMMENDED_REVIEW_VERSION = `word2html@${packageMetadata.version}`

export type ReviewVersionState = 'not-approved' | 'current' | 'mismatch'

export function reviewVersionState(
  record: Pick<CapabilitySubjectReviewRecord, 'status' | 'reviewedVersion'> | undefined,
): ReviewVersionState {
  if (record?.status !== 'approved') return 'not-approved'
  return record.reviewedVersion.trim() === RECOMMENDED_REVIEW_VERSION ? 'current' : 'mismatch'
}

const EMPTY_FORM: CapabilitySubjectReviewInput = {
  status: 'pending',
  reviewer: '',
  reviewerRole: '',
  reviewedVersion: RECOMMENDED_REVIEW_VERSION,
  reviewComment: '',
  checks: {},
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '能力复核操作失败。'
}

function formattedTime(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function inputFromRecord(
  record: CapabilitySubjectReviewRecord | undefined,
  definition: CapabilitySubjectReviewDefinition,
): CapabilitySubjectReviewInput {
  const checks = Object.fromEntries(definition.focusItems.map((_, index) => [
    `focus-${index + 1}`,
    record?.checks[`focus-${index + 1}`] ?? false,
  ]))
  return record ? {
    status: record.status,
    reviewer: record.reviewer,
    reviewerRole: record.reviewerRole || definition.reviewerRole,
    reviewedVersion: record.reviewedVersion || RECOMMENDED_REVIEW_VERSION,
    reviewComment: record.reviewComment,
    checks,
  } : { ...EMPTY_FORM, reviewerRole: definition.reviewerRole, checks }
}

export default function CapabilityReviewApp() {
  const [sessionState, setSessionState] = useState<SessionState>('checking')
  const [session, setSession] = useState<AdminSession | null>(null)
  const [loginToken, setLoginToken] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [records, setRecords] = useState<CapabilitySubjectReviewRecord[]>([])
  const [selectedId, setSelectedId] = useState(
    () => new URLSearchParams(window.location.search).get('id') ?? FIRST_DEFINITION.capabilityId,
  )
  const [selectedExampleId, setSelectedExampleId] = useState('')
  const [form, setForm] = useState<CapabilitySubjectReviewInput>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<CapabilitySubjectReviewStatus | null>(null)
  const [message, setMessage] = useState('')

  const definition = useMemo(
    () => CAPABILITY_SUBJECT_REVIEW_DEFINITIONS.find((item) => item.capabilityId === selectedId)
      ?? FIRST_DEFINITION,
    [selectedId],
  )
  const record = useMemo(
    () => records.find((item) => item.capabilityId === definition.capabilityId),
    [definition.capabilityId, records],
  )
  const officialEntries = useMemo(() => getOfficialLibraryEntries(), [])
  const examples = useMemo(
    () => definition.officialExampleIds.map((id) => officialEntries.find((entry) => entry.id === id)).filter(Boolean),
    [definition, officialEntries],
  )
  const selectedExample = examples.find((entry) => entry?.id === selectedExampleId) ?? examples[0]

  const handleAuthError = useCallback((error: unknown): boolean => {
    if (error instanceof AdminApiError && error.status === 401) {
      setSession(null)
      setSessionState('signed-out')
      setLoginError('管理员会话已失效，请重新登录。')
      return true
    }
    return false
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      setRecords(await loadCapabilitySubjectReviews())
    } catch (error) {
      if (!handleAuthError(error)) setMessage(errorMessage(error))
    } finally {
      setLoading(false)
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
    if (sessionState === 'signed-in') void refresh()
  }, [refresh, sessionState])

  useEffect(() => {
    setForm(inputFromRecord(record, definition))
    setSelectedExampleId(definition.officialExampleIds[0]!)
    const url = new URL(window.location.href)
    url.searchParams.set('id', definition.capabilityId)
    window.history.replaceState(null, '', url)
  }, [definition, record?.updatedAt])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (!loginToken.trim()) return
    setLoggingIn(true)
    setLoginError('')
    try {
      const next = await loginAdmin(loginToken)
      setSession(next)
      setLoginToken('')
      setSessionState('signed-in')
    } catch (error) {
      setLoginError(errorMessage(error))
    } finally {
      setLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    if (session) {
      try { await logoutAdmin(session.csrfToken) } catch { /* Clear local state regardless. */ }
    }
    setSession(null)
    setRecords([])
    setSessionState('signed-out')
  }

  const save = async (status: CapabilitySubjectReviewStatus) => {
    if (!session) return
    if (!form.reviewer.trim() || !form.reviewerRole.trim() || !form.reviewedVersion.trim()) {
      setMessage('请先填写审核人、审核角色和被审版本。')
      return
    }
    if (status === 'needs-changes' && !form.reviewComment.trim()) {
      setMessage('标记需要修改时，必须填写审阅意见。')
      return
    }
    if (status === 'approved' && !window.confirm(`确认批准“${definition.title}”的学科复核吗？`)) return
    setBusy(status)
    setMessage('')
    try {
      const next = await saveCapabilitySubjectReview(
        definition.capabilityId,
        { ...form, status },
        session.csrfToken,
      )
      setRecords((current) => current.map((item) => item.capabilityId === next.capabilityId ? next : item))
      setMessage(`已保存为“${STATUS_LABELS[next.status]}”，审核历史已追加。`)
    } catch (error) {
      if (!handleAuthError(error)) setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  if (sessionState === 'checking') {
    return <main className="admin-auth-shell"><div className="admin-auth-card admin-auth-card--loading"><span className="admin-spinner" />正在检查管理员会话…</div></main>
  }

  if (sessionState === 'signed-out') {
    return (
      <main className="admin-auth-shell">
        <form className="admin-auth-card" onSubmit={(event) => void handleLogin(event)}>
          <a className="brand" href="/" aria-label="返回 Word2HTML">
            <span className="brand-mark"><i /><i /><i /></span>
            <span><strong>Word2HTML</strong><small>能力学科复核</small></span>
          </a>
          <div className="admin-auth-copy">
            <span className="eyebrow">管理员入口</span>
            <h1>进入能力学科复核台</h1>
            <p>使用与第三方库审核台相同的管理员令牌和安全会话。</p>
          </div>
          <label className="admin-token-field">
            <span>管理员令牌</span>
            <input type="password" value={loginToken} autoComplete="current-password" onChange={(event) => setLoginToken(event.target.value)} placeholder="输入 WORD2HTML_ADMIN_TOKEN" autoFocus />
          </label>
          {loginError && <div className="admin-auth-error" role="alert">{loginError}</div>}
          <button className="admin-login-button" type="submit" disabled={loggingIn || !loginToken.trim()}>{loggingIn ? '正在登录…' : '登录复核台'}</button>
          <a className="admin-back-link" href="/">← 返回普通应用</a>
        </form>
      </main>
    )
  }

  const approvedCount = records.filter((item) => item.status === 'approved').length
  const changesCount = records.filter((item) => item.status === 'needs-changes').length
  const currentVersionApprovedCount = records.filter((item) => reviewVersionState(item) === 'current').length
  const versionMismatchCount = records.filter((item) => reviewVersionState(item) === 'mismatch').length
  const checkedCount = Object.values(form.checks).filter(Boolean).length
  const selectedVersionState = reviewVersionState(record)
  const formUsesRecommendedVersion = form.reviewedVersion.trim() === RECOMMENDED_REVIEW_VERSION

  return (
    <div className="admin-shell capability-review-shell">
      <header className="admin-topbar">
        <a className="brand" href="/admin/capabilities">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>Word2HTML</strong><small>能力学科复核台</small></span>
        </a>
        <div className="admin-summary-strip">
          <div><strong>{records.length - approvedCount}</strong><span>尚未批准</span></div>
          <div><strong>{changesCount}</strong><span>需要修改</span></div>
          <div><strong>{versionMismatchCount}</strong><span>版本待确认</span></div>
          <div><strong>{currentVersionApprovedCount}/7</strong><span>当前版本已批准</span></div>
        </div>
        <nav className="admin-top-actions">
          <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? '刷新中…' : '刷新记录'}</button>
          <a href="/admin/users">用户管理</a>
          <a href="/admin/models">模型设置</a>
          <a href="/admin/reviews">第三方库审核</a>
          <a href="/">普通应用</a>
          <button type="button" onClick={() => void handleLogout()}>退出</button>
        </nav>
      </header>

      <main className="capability-review-workspace">
        <aside className="admin-queue-panel capability-review-queue">
          <div className="admin-panel-heading">
            <div><span className="eyebrow">R5.1 学科终审</span><h1>待复核能力</h1></div>
            <span>{approvedCount}/7</span>
          </div>
          <p className="capability-review-intro">技术验收均已通过。这里记录人的学科判断，不调用大模型。</p>
          <div className="admin-queue-list">
            {CAPABILITY_SUBJECT_REVIEW_DEFINITIONS.map((item) => {
              const itemRecord = records.find((candidate) => candidate.capabilityId === item.capabilityId)
              const status = itemRecord?.status ?? 'pending'
              const versionState = reviewVersionState(itemRecord)
              const displayedStatus = versionState === 'mismatch' ? '版本待确认' : STATUS_LABELS[status]
              return (
                <button data-review-version-state={versionState} className={`admin-queue-card ${item.capabilityId === definition.capabilityId ? 'active' : ''}`} type="button" key={item.capabilityId} onClick={() => { setMessage(''); setSelectedId(item.capabilityId) }}>
                  <div className="admin-queue-card-top">
                    <span className={`admin-subject admin-subject--${item.subject}`}>{SUBJECT_LABELS[item.subject]}</span>
                    <span className={`capability-review-status capability-review-status--${versionState === 'mismatch' ? 'version-mismatch' : status}`}>{displayedStatus}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.capabilityId}</p>
                  <small>{item.officialExampleIds.length} 个官方代表场景</small>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="admin-preview-panel capability-review-preview">
          <div className="admin-entry-heading">
            <div>
              <div className="admin-entry-kicker"><span>{SUBJECT_LABELS[definition.subject]}</span><span>{definition.capabilityId}</span></div>
              <h2>{definition.title}</h2>
              <p>建议审核角色：{definition.reviewerRole}</p>
            </div>
            <span data-review-version-state={selectedVersionState} className={`admin-current-status capability-review-status--${selectedVersionState === 'mismatch' ? 'version-mismatch' : record?.status ?? 'pending'}`}>
              {selectedVersionState === 'mismatch' ? '版本待确认' : STATUS_LABELS[record?.status ?? 'pending']}
            </span>
          </div>
          <div className="capability-review-evidence">
            <strong>技术证据已通过</strong>
            <code>{definition.browserCommand}</code>
          </div>
          {examples.length > 1 && (
            <div className="capability-example-tabs" role="tablist" aria-label="官方代表场景">
              {examples.map((entry) => entry && (
                <button type="button" role="tab" aria-selected={entry.id === selectedExample?.id} key={entry.id} onClick={() => setSelectedExampleId(entry.id)}>{entry.title}</button>
              ))}
            </div>
          )}
          {selectedExample ? (
            <ReviewScenePreview key={selectedExample.id} initialScene={selectedExample.scene} />
          ) : (
            <div className="admin-preview-error" role="alert"><strong>官方代表场景缺失</strong><p>请先修复能力与官方库的绑定。</p></div>
          )}
        </section>

        <aside className="admin-decision-panel capability-review-form-panel">
          <section className="admin-review-section">
            <span className="eyebrow">人工复核重点</span>
            <h2>{checkedCount}/{definition.focusItems.length} 项已确认</h2>
            <div className="admin-checklist capability-focus-list">
              {definition.focusItems.map((label, index) => {
                const id = `focus-${index + 1}`
                return (
                  <label key={id}>
                    <input type="checkbox" checked={form.checks[id] ?? false} onChange={(event) => setForm((current) => ({ ...current, checks: { ...current.checks, [id]: event.target.checked } }))} />
                    <span>✓</span>{label}
                  </label>
                )
              })}
            </div>
          </section>

          <section className="admin-review-section capability-review-fields">
            <span className="eyebrow">审核记录</span>
            <h2>身份、版本与结论依据</h2>
            <label><b>审核人 <span aria-hidden="true">*</span></b><input required aria-required="true" value={form.reviewer} onChange={(event) => setForm((current) => ({ ...current, reviewer: event.target.value }))} placeholder="例如：王老师" /></label>
            <label><b>审核角色 <span aria-hidden="true">*</span></b><input required aria-required="true" value={form.reviewerRole} onChange={(event) => setForm((current) => ({ ...current, reviewerRole: event.target.value }))} placeholder={definition.reviewerRole} /></label>
            <label><b>被审版本 <span aria-hidden="true">*</span></b><input required aria-required="true" value={form.reviewedVersion} onChange={(event) => setForm((current) => ({ ...current, reviewedVersion: event.target.value }))} placeholder={RECOMMENDED_REVIEW_VERSION} /><small>推荐值：{RECOMMENDED_REVIEW_VERSION}，也可以改为 Git commit 或发布号。</small></label>
            {!formUsesRecommendedVersion && form.reviewedVersion.trim() && (
              <div className="capability-review-version-warning" role="status" data-review-version-state="mismatch">
                <div>
                  <strong>被审版本与当前推荐版本不一致</strong>
                  <p>当前填写“{form.reviewedVersion.trim()}”，推荐“{RECOMMENDED_REVIEW_VERSION}”。如填写的是特定 Git commit 或发布号，可以保留并交由维护者核对；否则请改用推荐版本后重新保存审核结论。</p>
                </div>
                <button type="button" onClick={() => setForm((current) => ({ ...current, reviewedVersion: RECOMMENDED_REVIEW_VERSION }))}>填入推荐版本</button>
              </div>
            )}
            <label><b>审阅意见 <small>标记需要修改时必填，其他结果选填</small></b><textarea value={form.reviewComment} onChange={(event) => setForm((current) => ({ ...current, reviewComment: event.target.value }))} rows={5} placeholder="填写问题、修改建议或其他审阅意见。" /></label>
            {message && <div className="admin-action-message" role="status">{message}</div>}
            <div className="capability-review-actions">
              <button type="button" onClick={() => void save('pending')} disabled={busy !== null}>{busy === 'pending' ? '保存中…' : '保存草稿'}</button>
              <button className="capability-needs-changes-button" type="button" onClick={() => void save('needs-changes')} disabled={busy !== null}>{busy === 'needs-changes' ? '保存中…' : '标记需要修改'}</button>
              <button className="admin-approve-button" type="button" onClick={() => void save('approved')} disabled={busy !== null}>{busy === 'approved' ? '保存中…' : '审核通过'}</button>
            </div>
          </section>

          <section className="admin-review-section">
            <span className="eyebrow">留痕</span>
            <h2>审核历史</h2>
            {record?.history.length ? (
              <ol className="admin-review-timeline">
                {[...record.history].reverse().map((event) => (
                  <li className="admin-review-event" key={event.id}>
                    <span className="admin-review-event-marker" />
                    <div className="admin-review-event-heading"><strong>{STATUS_LABELS[event.status]}</strong><time>{formattedTime(event.at)}</time></div>
                    <p>{event.reviewer || '未署名草稿'} · {event.reviewerRole || '角色未填写'} · {event.reviewedVersion || '版本未填写'}</p>
                  </li>
                ))}
              </ol>
            ) : <div className="admin-auto-check-empty">尚无审核记录。</div>}
          </section>
        </aside>
      </main>
    </div>
  )
}
