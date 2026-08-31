import { useEffect, useState } from 'react'
import type { LessonLibraryEntry } from '../core/lessonLibrary'
import type { SharedSubmissionStatus } from '../core/sharedLessonLibrary'
import { ReadableReviewDialog } from './ReadableReviewDialog'
import { isNumberParameter } from '../types/lessonScene'

interface LessonLibraryPanelProps {
  open: boolean
  officialEntries: LessonLibraryEntry[]
  thirdPartyEntries: LessonLibraryEntry[]
  onClose: () => void
  onLoad: (entry: LessonLibraryEntry) => void
  onRemoveThirdParty: (id: string) => void
  onSubmitThirdParty: (entry: LessonLibraryEntry) => Promise<void>
  onRefreshShared: () => Promise<void>
  submittingEntryId: string | null
  sharedStatus: {
    state: 'idle' | 'loading' | 'ready' | 'error'
    detail: string
  }
  submissionStatuses: Record<string, SharedSubmissionStatus>
  submissionStatusesLoading: boolean
}

const subjectLabels = {
  math: '数学',
  physics: '物理',
  chemistry: '化学',
  geography: '地理',
} as const

export function LessonLibraryPanel({
  open,
  officialEntries,
  thirdPartyEntries,
  onClose,
  onLoad,
  onRemoveThirdParty,
  onSubmitThirdParty,
  onRefreshShared,
  submittingEntryId,
  sharedStatus,
  submissionStatuses,
  submissionStatusesLoading,
}: LessonLibraryPanelProps) {
  const [tab, setTab] = useState<'official' | 'third-party'>('official')
  const [expandedFeedback, setExpandedFeedback] = useState<{
    title: string
    status: SharedSubmissionStatus
  } | null>(null)

  useEffect(() => {
    if (!open) setExpandedFeedback(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null
  const entries = tab === 'official' ? officialEntries : thirdPartyEntries

  return (
    <div className="library-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="library-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="library-header">
          <div>
            <span className="eyebrow">可复用实验</span>
            <h2 id="library-title">教学演示库</h2>
            <p>官方内容经过项目审核；第三方内容仅代表已通过格式和运行校验。</p>
          </div>
          <button className="library-close" type="button" onClick={onClose} aria-label="关闭实验库">×</button>
        </header>

        <div className="library-tabs" role="tablist" aria-label="实验库来源">
          <button type="button" className={tab === 'official' ? 'active' : ''} onClick={() => setTab('official')}>
            官方库 <span>{officialEntries.length}</span>
          </button>
          <button type="button" className={tab === 'third-party' ? 'active' : ''} onClick={() => setTab('third-party')}>
            第三方库 <span>{thirdPartyEntries.length}</span>
          </button>
        </div>

        <div className="library-notice">
          {tab === 'official'
            ? '官方场景随应用版本发布，升级时统一维护和回归测试。'
            : (
              <>
                <span>导入文件只保存在本机；点击“提交共享审核”后才会上传紧凑场景包。公共目录仅显示管理员审核通过的内容。</span>
                <span className={`shared-directory-state shared-directory-state--${sharedStatus.state}`}>
                  {sharedStatus.detail}
                </span>
                <button type="button" onClick={() => void onRefreshShared()} disabled={sharedStatus.state === 'loading' || submissionStatusesLoading}>
                  {sharedStatus.state === 'loading' || submissionStatusesLoading ? '正在刷新…' : '刷新审核状态'}
                </button>
              </>
            )}
        </div>

        {entries.length === 0 ? (
          <div className="library-empty">
            <strong>第三方库还是空的</strong>
            <p>导入一个通过校验的 LessonScene 或 .word2html.json 文件后，它会自动出现在这里。</p>
          </div>
        ) : (
          <div className="library-grid">
            {entries.map((entry) => {
              const submissionStatus = entry.catalog === 'local'
                ? submissionStatuses[entry.id]
                : undefined
              const remoteStatus = submissionStatus?.reviewStatus
              const reviewLabel = entry.reviewStatus === 'official'
                ? '官方审核'
                : entry.catalog === 'shared' || remoteStatus === 'verified'
                  ? '第三方已审核'
                  : remoteStatus === 'pending'
                    ? '共享审核中'
                    : remoteStatus === 'needs-changes'
                      ? '已退回修改'
                      : remoteStatus === 'rejected'
                        ? '未被收录'
                        : remoteStatus === 'deprecated'
                          ? '已下架'
                          : entry.revisionOfSubmissionId ? '修改版待提交' : '本地未提交'
              const parameters = Object.values(entry.scene.parameters)
                .filter(isNumberParameter)
                .map((parameter) => parameter.label)
                .slice(0, 3)
              return (
                <article className={`library-card ${remoteStatus ? `library-card--${remoteStatus}` : ''}`} key={entry.id}>
                  <div className="library-card-meta">
                    <span>
                      {subjectLabels[entry.subject]}
                      {entry.source === 'third-party' ? ` · ${entry.catalog === 'shared' ? '共享目录' : '本机'}` : ''}
                    </span>
                    <span className={`review-badge review-badge--${remoteStatus ?? entry.reviewStatus}`}>
                      {reviewLabel}
                    </span>
                  </div>
                  <h3>{entry.title}</h3>
                  <p>{entry.summary}</p>
                  <div className="library-parameters">
                    {parameters.length > 0 ? `可调：${parameters.join('、')}` : '使用场景内交互控制'}
                  </div>
                  {entry.sourceFilename && <small>来源：{entry.sourceFilename}</small>}
                  {submissionStatus && entry.catalog === 'local' && (
                    <div className={`library-review-feedback library-review-feedback--${submissionStatus.reviewStatus}`}>
                      <strong>{submissionStatus.reviewStatus === 'needs-changes'
                        ? '管理员要求修改'
                        : submissionStatus.reviewStatus === 'rejected'
                          ? '管理员未收录此版本'
                          : submissionStatus.reviewStatus === 'verified'
                            ? '该版本已通过人工审核'
                            : submissionStatus.reviewStatus === 'deprecated'
                              ? '该版本已从共享库下架'
                              : '该版本正在等待人工审核'}</strong>
                      {submissionStatus.reviewNote && <p>{submissionStatus.reviewNote}</p>}
                      {(submissionStatus.reviewNote || submissionStatus.preReview?.issues?.length) && (
                        <button
                          className="library-feedback-expand"
                          type="button"
                          onClick={() => setExpandedFeedback({ title: entry.title, status: submissionStatus })}
                        >
                          放大阅读完整意见
                        </button>
                      )}
                      {submissionStatus.preReview?.issues && submissionStatus.preReview.issues.length > 0 && (
                        <details>
                          <summary>查看AI预审建议（{submissionStatus.preReview.issues.length}）</summary>
                          <ul>{submissionStatus.preReview.issues.slice(0, 3).map((issue) => (
                            <li key={`${issue.location}-${issue.finding}`}>
                              {issue.finding}<small>建议：{issue.suggestedAction}</small>
                            </li>
                          ))}</ul>
                        </details>
                      )}
                    </div>
                  )}
                  <div className="library-card-actions">
                    <button className="primary-button" type="button" onClick={() => onLoad(entry)}>
                      {remoteStatus === 'needs-changes' || remoteStatus === 'rejected' || remoteStatus === 'deprecated'
                        ? '打开并修改'
                        : '打开演示'}
                    </button>
                    {entry.source === 'third-party' && entry.catalog !== 'shared' && (
                      <>
                        <button
                          className="library-submit"
                          type="button"
                          disabled={submittingEntryId === entry.id || Boolean(remoteStatus)}
                          onClick={() => void onSubmitThirdParty(entry)}
                        >
                          {submittingEntryId === entry.id
                            ? '提交中…'
                            : remoteStatus === 'pending'
                              ? '等待管理员审核'
                              : remoteStatus === 'verified'
                                ? '该版本已发布'
                                : remoteStatus
                                  ? '请先修改并保存'
                                  : entry.revisionOfSubmissionId ? '提交修改版本' : '提交共享审核'}
                        </button>
                        <button className="library-remove" type="button" onClick={() => onRemoveThirdParty(entry.id)}>从本地移除</button>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      <ReadableReviewDialog
        open={Boolean(expandedFeedback)}
        eyebrow="审核反馈 · 大字号阅读"
        title={expandedFeedback ? `${expandedFeedback.title}修改意见` : '修改意见'}
        onClose={() => setExpandedFeedback(null)}
      >
        {expandedFeedback && (
          <>
            {expandedFeedback.status.reviewNote && (
              <section className="readable-review-note readable-review-note--primary">
                <h3>管理员修改意见</h3>
                <p>{expandedFeedback.status.reviewNote}</p>
              </section>
            )}
            {expandedFeedback.status.preReview?.summary && (
              <section className="readable-review-summary readable-review-summary--issues-found">
                <h3>AI预审摘要</h3>
                <p>{expandedFeedback.status.preReview.summary}</p>
              </section>
            )}
            {expandedFeedback.status.preReview?.issues && expandedFeedback.status.preReview.issues.length > 0 && (
              <section className="readable-review-list-section">
                <h3>问题与处理建议</h3>
                <div className="readable-review-issues">
                  {expandedFeedback.status.preReview.issues.map((issue, index) => (
                    <article className={`readable-review-issue readable-review-issue--${issue.severity}`} key={`${issue.location}-${index}`}>
                      <div className="readable-review-issue-heading">
                        <strong>{index + 1}. 审核建议</strong>
                        <span>{issue.severity === 'critical' ? '严重' : issue.severity === 'error' ? '错误' : '提醒'}</span>
                      </div>
                      <code>{issue.location}</code>
                      <p>{issue.finding}</p>
                      <div className="readable-review-suggestion"><b>建议修改</b>{issue.suggestedAction}</div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </ReadableReviewDialog>
    </div>
  )
}
