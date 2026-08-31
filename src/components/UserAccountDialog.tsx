import { useEffect, useState, type FormEvent } from 'react'
import type { UserSession } from '../core/userSessionApi'

interface UserAccountDialogProps {
  open: boolean
  session: UserSession | null
  busy: boolean
  error?: string
  onClose: () => void
  onLogin: (accessCode: string) => void
  onLogout: () => void
}

function compact(value: number): string {
  return new Intl.NumberFormat('zh-CN', { notation: value >= 10_000 ? 'compact' : 'standard' }).format(value)
}

export function UserAccountDialog({ open, session, busy, error, onClose, onLogin, onLogout }: UserAccountDialogProps) {
  const [accessCode, setAccessCode] = useState('')
  useEffect(() => {
    if (!open) setAccessCode('')
  }, [open])
  if (!open) return null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (accessCode.trim()) onLogin(accessCode.trim())
  }

  return (
    <div className="user-account-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="user-account-dialog" role="dialog" aria-modal="true" aria-labelledby="user-account-title">
        <header>
          <div><span className="eyebrow">轻量账号</span><h2 id="user-account-title">{session ? session.user.displayName : '使用一次性登录码'}</h2></div>
          <button type="button" onClick={onClose} aria-label="关闭登录窗口">×</button>
        </header>
        {session ? (
          <div className="user-account-body">
            <div className="user-account-success"><strong>账号已登录</strong><p>可以使用平台有限模型额度并提交共享审核。</p></div>
            <dl>
              <div><dt>每日模型调用</dt><dd>{compact(session.user.quota.dailyCalls)} 次</dd></div>
              <div><dt>每日 Token</dt><dd>{compact(session.user.quota.dailyTokens)}</dd></div>
              <div><dt>会话到期</dt><dd>{new Date(session.expiresAt).toLocaleString('zh-CN', { hour12: false })}</dd></div>
            </dl>
            <button className="user-logout-button" type="button" onClick={onLogout} disabled={busy}>{busy ? '处理中…' : '退出登录'}</button>
          </div>
        ) : (
          <form className="user-account-body" onSubmit={submit}>
            <p className="user-login-explanation">登录不需要密码。请粘贴管理员发给你的一次性登录码；使用后该码立即失效。</p>
            <label><span>一次性登录码</span><input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} autoComplete="one-time-code" placeholder="w2h-login-…" autoFocus /></label>
            {error && <p className="user-account-error" role="alert">{error}</p>}
            <button className="user-login-button" type="submit" disabled={busy || !accessCode.trim()}>{busy ? '正在登录…' : '登录'}</button>
            <small>游客仍可使用本地模板、参数编辑、导入导出和自己的临时 API Key。</small>
          </form>
        )}
      </section>
    </div>
  )
}
