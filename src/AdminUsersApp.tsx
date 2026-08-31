import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AdminApiError,
  createAdminUser,
  issueAdminUserInvite,
  loadAdminUsers,
  loginAdmin,
  logoutAdmin,
  restoreAdminSession,
  updateAdminUser,
  type AdminSession,
  type AdminUserAccount,
} from './core/adminReviewApi'

type SessionState = 'checking' | 'signed-out' | 'signed-in'
type UserDraft = { displayName: string; status: 'active' | 'paused'; dailyCalls: number; dailyTokens: number }

function message(error: unknown): string {
  return error instanceof Error ? error.message : '用户管理操作失败。'
}

function time(value?: string): string {
  if (!value) return '尚未登录'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function draftOf(user: AdminUserAccount): UserDraft {
  return {
    displayName: user.displayName,
    status: user.status,
    dailyCalls: user.quota.dailyCalls,
    dailyTokens: user.quota.dailyTokens,
  }
}

export default function AdminUsersApp() {
  const [sessionState, setSessionState] = useState<SessionState>('checking')
  const [session, setSession] = useState<AdminSession | null>(null)
  const [loginToken, setLoginToken] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [users, setUsers] = useState<AdminUserAccount[]>([])
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({})
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [invite, setInvite] = useState<{ displayName: string; accessCode: string } | null>(null)
  const [copyResult, setCopyResult] = useState<'success' | 'failure' | null>(null)
  const [newName, setNewName] = useState('')
  const [newCalls, setNewCalls] = useState(20)
  const [newTokens, setNewTokens] = useState(100000)

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
    setActionMessage('')
    try {
      const next = await loadAdminUsers()
      setUsers(next)
      setDrafts(Object.fromEntries(next.map((user) => [user.id, draftOf(user)])))
    } catch (error) {
      if (!handleAuthError(error)) setActionMessage(message(error))
    } finally {
      setLoading(false)
    }
  }, [handleAuthError])

  useEffect(() => {
    let active = true
    void restoreAdminSession().then((restored) => {
      if (!active) return
      setSession(restored)
      setSessionState(restored ? 'signed-in' : 'signed-out')
    }).catch((error) => {
      if (!active) return
      setSessionState('signed-out')
      setLoginError(message(error))
    })
    return () => { active = false }
  }, [])

  useEffect(() => { if (sessionState === 'signed-in') void refresh() }, [refresh, sessionState])

  const login = async (event: FormEvent) => {
    event.preventDefault()
    if (!loginToken.trim()) return
    setLoggingIn(true)
    setLoginError('')
    try {
      setSession(await loginAdmin(loginToken))
      setSessionState('signed-in')
      setLoginToken('')
    } catch (error) { setLoginError(message(error)) } finally { setLoggingIn(false) }
  }

  const logout = async () => {
    try { if (session) await logoutAdmin(session.csrfToken) } catch { /* Clear local state regardless. */ }
    setSession(null)
    setSessionState('signed-out')
    setUsers([])
    setInvite(null)
  }

  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (!session || !newName.trim()) return
    setBusyId('new')
    setActionMessage('')
    try {
      const result = await createAdminUser({
        displayName: newName.trim(), dailyCalls: newCalls, dailyTokens: newTokens,
      }, session.csrfToken)
      setInvite({ displayName: result.user.displayName, accessCode: result.accessCode })
      setNewName('')
      await refresh()
    } catch (error) {
      if (!handleAuthError(error)) setActionMessage(message(error))
    } finally { setBusyId('') }
  }

  const save = async (id: string) => {
    if (!session || !drafts[id]) return
    setBusyId(id)
    setActionMessage('')
    try {
      await updateAdminUser(id, drafts[id], session.csrfToken)
      setActionMessage('用户状态和额度已保存。')
      await refresh()
    } catch (error) {
      if (!handleAuthError(error)) setActionMessage(message(error))
    } finally { setBusyId('') }
  }

  const issueInvite = async (user: AdminUserAccount) => {
    if (!session) return
    setBusyId(user.id)
    setActionMessage('')
    try {
      const result = await issueAdminUserInvite(user.id, session.csrfToken)
      setInvite({ displayName: user.displayName, accessCode: result.accessCode })
      await refresh()
    } catch (error) {
      if (!handleAuthError(error)) setActionMessage(message(error))
    } finally { setBusyId('') }
  }

  const copyInviteCode = async () => {
    if (!invite) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(invite.accessCode)
      } else {
        const field = document.createElement('textarea')
        field.value = invite.accessCode
        field.setAttribute('readonly', '')
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.append(field)
        field.select()
        const copied = document.execCommand('copy')
        field.remove()
        if (!copied) throw new Error('copy unavailable')
      }
      setCopyResult('success')
    } catch {
      setCopyResult('failure')
    }
  }

  const activeCount = useMemo(() => users.filter((user) => user.status === 'active').length, [users])

  if (sessionState === 'checking') return <main className="admin-auth-shell"><div className="admin-auth-card admin-auth-card--loading"><span className="admin-spinner" />正在检查管理员会话…</div></main>
  if (sessionState === 'signed-out') return (
    <main className="admin-auth-shell">
      <form className="admin-auth-card" onSubmit={(event) => void login(event)}>
        <a className="brand" href="/"><span className="brand-mark"><i /><i /><i /></span><span><strong>Word2HTML</strong><small>用户管理</small></span></a>
        <div className="admin-auth-copy"><span className="eyebrow">管理员入口</span><h1>进入用户管理</h1><p>创建轻量账号、签发一次性登录码，并管理平台模型额度。</p></div>
        <label className="admin-token-field"><span>管理员令牌</span><input type="password" value={loginToken} onChange={(event) => setLoginToken(event.target.value)} autoComplete="current-password" placeholder="输入 WORD2HTML_ADMIN_TOKEN" /></label>
        {loginError && <div className="admin-auth-error">{loginError}</div>}
        <button className="admin-login-button" type="submit" disabled={loggingIn || !loginToken.trim()}>{loggingIn ? '正在登录…' : '登录用户管理'}</button>
      </form>
    </main>
  )

  return (
    <div className="admin-shell admin-users-shell">
      <header className="admin-topbar">
        <a className="brand" href="/admin/users"><span className="brand-mark"><i /><i /><i /></span><span><strong>Word2HTML</strong><small>用户管理</small></span></a>
        <div className="admin-summary-strip"><div><strong>{users.length}</strong><span>全部账号</span></div><div><strong>{activeCount}</strong><span>正常</span></div><div><strong>{users.length - activeCount}</strong><span>已暂停</span></div></div>
        <nav className="admin-top-actions">
          <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? '刷新中…' : '刷新'}</button>
          <a href="/admin/models">模型设置</a><a href="/admin/reviews">第三方库审核</a><a href="/admin/capabilities">能力复核</a><a href="/">普通应用</a>
          <button type="button" onClick={() => void logout()}>退出</button>
        </nav>
      </header>
      <main className="admin-users-workspace">
        <section className="admin-users-intro">
          <div><span className="eyebrow">R6.4 轻量身份</span><h1>账号、邀请和模型额度</h1><p>不保存密码。一次性登录码只显示一次，用户使用后立即失效；暂停账号会阻止后续平台模型调用和共享提交。</p></div>
          <form onSubmit={(event) => void create(event)}>
            <label><span>用户名称</span><input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={80} placeholder="例如：数学教研组" /></label>
            <label><span>每日调用</span><input type="number" min="1" max="10000" value={newCalls} onChange={(event) => setNewCalls(Number(event.target.value))} /></label>
            <label><span>每日 Token</span><input type="number" min="1000" max="100000000" step="1000" value={newTokens} onChange={(event) => setNewTokens(Number(event.target.value))} /></label>
            <button type="submit" disabled={busyId === 'new' || !newName.trim()}>{busyId === 'new' ? '创建中…' : '创建并签发登录码'}</button>
          </form>
        </section>

        {invite && <section className="admin-invite-result" data-admin-invite-result><div><span className="eyebrow">只显示一次</span><h2>{invite.displayName} 的一次性登录码</h2><p>请通过可信渠道发送给用户。关闭后管理员页面不会再次显示此码。</p></div><code>{invite.accessCode}</code><div><button type="button" onClick={() => void copyInviteCode()}>复制登录码</button><button type="button" onClick={() => setInvite(null)}>我已保存，关闭</button></div></section>}

        {actionMessage && <div className="model-settings-message" role="status">{actionMessage}</div>}
        <section className="admin-users-list">
          {users.length === 0 && !loading ? <div className="admin-users-empty">尚未创建用户。</div> : users.map((user) => {
            const draft = drafts[user.id] ?? draftOf(user)
            const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(user))
            return <article className="admin-user-card" data-admin-user-id={user.id} key={user.id}>
              <div className="admin-user-heading"><div><span className={`admin-user-status ${user.status}`}>{user.status === 'active' ? '正常' : '已暂停'}</span><h2>{user.displayName}</h2><small>{user.id}</small></div><div><strong>{user.usage.calls}/{user.quota.dailyCalls}</strong><span>今日调用</span><strong>{user.usage.totalTokens.toLocaleString()}/{user.quota.dailyTokens.toLocaleString()}</strong><span>今日 Token</span></div></div>
              <div className="admin-user-fields">
                <label><span>用户名称</span><input value={draft.displayName} onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: { ...draft, displayName: event.target.value } }))} /></label>
                <label><span>账号状态</span><select value={draft.status} onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: { ...draft, status: event.target.value as 'active' | 'paused' } }))}><option value="active">正常</option><option value="paused">暂停</option></select></label>
                <label><span>每日调用额度</span><input type="number" min="1" max="10000" value={draft.dailyCalls} onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: { ...draft, dailyCalls: Number(event.target.value) } }))} /></label>
                <label><span>每日 Token 额度</span><input type="number" min="1000" max="100000000" step="1000" value={draft.dailyTokens} onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: { ...draft, dailyTokens: Number(event.target.value) } }))} /></label>
              </div>
              <footer><span>最近登录：{time(user.lastLoginAt)}{user.invitePending ? ` · 登录码有效至 ${time(user.inviteExpiresAt)}` : ''}</span><div><button type="button" onClick={() => void issueInvite(user)} disabled={busyId === user.id}>重新签发登录码</button><button className="admin-user-save" type="button" onClick={() => void save(user.id)} disabled={!dirty || busyId === user.id}>{busyId === user.id ? '处理中…' : '保存设置'}</button></div></footer>
            </article>
          })}
        </section>
      </main>
      {copyResult && <div className="admin-copy-overlay" role="presentation">
        <section className="admin-copy-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-copy-title" data-copy-result={copyResult}>
          <span className={`admin-copy-icon ${copyResult}`} aria-hidden="true">{copyResult === 'success' ? '✓' : '!'}</span>
          <div><h2 id="admin-copy-title">{copyResult === 'success' ? '已复制' : '复制失败'}</h2><p>{copyResult === 'success' ? '登录码已复制到剪贴板。' : '浏览器没有允许访问剪贴板，请手动选择并复制登录码。'}</p></div>
          <button type="button" onClick={() => setCopyResult(null)}>知道了</button>
        </section>
      </div>}
    </div>
  )
}
