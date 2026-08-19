import { useEffect, useState } from 'react'
import type { LessonLibraryEntry } from '../core/lessonLibrary'
import { isNumberParameter } from '../types/lessonScene'

interface LessonLibraryPanelProps {
  open: boolean
  officialEntries: LessonLibraryEntry[]
  thirdPartyEntries: LessonLibraryEntry[]
  onClose: () => void
  onLoad: (entry: LessonLibraryEntry) => void
  onRemoveThirdParty: (id: string) => void
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
}: LessonLibraryPanelProps) {
  const [tab, setTab] = useState<'official' | 'third-party'>('official')

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
            : '成功导入的文件会自动保存在此设备并标记为待审核；当前不会自动上传到服务器。'}
        </div>

        {entries.length === 0 ? (
          <div className="library-empty">
            <strong>第三方库还是空的</strong>
            <p>导入一个通过校验的 LessonScene 或 .word2html.json 文件后，它会自动出现在这里。</p>
          </div>
        ) : (
          <div className="library-grid">
            {entries.map((entry) => {
              const parameters = Object.values(entry.scene.parameters)
                .filter(isNumberParameter)
                .map((parameter) => parameter.label)
                .slice(0, 3)
              return (
                <article className="library-card" key={entry.id}>
                  <div className="library-card-meta">
                    <span>{subjectLabels[entry.subject]}</span>
                    <span className={`review-badge review-badge--${entry.reviewStatus}`}>
                      {entry.reviewStatus === 'official' ? '官方审核' : entry.reviewStatus === 'verified' ? '第三方已审核' : '待管理员审核'}
                    </span>
                  </div>
                  <h3>{entry.title}</h3>
                  <p>{entry.summary}</p>
                  <div className="library-parameters">
                    {parameters.length > 0 ? `可调：${parameters.join('、')}` : '使用场景内交互控制'}
                  </div>
                  {entry.sourceFilename && <small>来源：{entry.sourceFilename}</small>}
                  <div className="library-card-actions">
                    <button className="primary-button" type="button" onClick={() => onLoad(entry)}>打开演示</button>
                    {entry.source === 'third-party' && (
                      <button className="library-remove" type="button" onClick={() => onRemoveThirdParty(entry.id)}>从本地移除</button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

