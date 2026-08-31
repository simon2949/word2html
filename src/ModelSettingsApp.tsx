import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AdminApiError,
  loadAdminModelSettings,
  loadAdminModelUsage,
  loadAdminOperationalEvents,
  loadAdminStorageShadow,
  loginAdmin,
  logoutAdmin,
  restoreAdminSession,
  saveAdminModelSettings,
  testAdminModelConnection,
  type AdminModelSettings,
  type AdminModelUsageStatus,
  type AdminOperationalStatus,
  type AdminStorageShadowStatus,
  type AdminSession,
  type ModelConnectionTestResult,
  type TrustedModelProfile,
} from './core/adminReviewApi'

type SessionState = 'checking' | 'signed-out' | 'signed-in'
type TestProfile = 'generation' | 'review'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '模型设置操作失败。'
}

function formattedTime(value?: string): string {
  if (!value) return '尚未保存'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function testSummary(result: ModelConnectionTestResult): string {
  const usage = [
    result.usage.inputTokens === undefined ? null : `输入 ${result.usage.inputTokens}`,
    result.usage.cachedInputTokens === undefined ? null : `缓存 ${result.usage.cachedInputTokens}`,
    result.usage.outputTokens === undefined ? null : `输出 ${result.usage.outputTokens}`,
  ].filter(Boolean).join(' / ')
  return `${result.model} 连接成功 · ${result.latencyMs} ms${usage ? ` · ${usage} tokens` : ''}`
}

function protocolLabel(profile: TrustedModelProfile): string {
  return profile.protocol === 'anthropic-compatible' ? 'Anthropic 兼容' : 'OpenAI 兼容'
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

function usagePercent(value: number, limit: number): number {
  if (!(limit > 0)) return 0
  return Math.min(100, Math.max(0, (value / limit) * 100))
}

const shadowLabels: Record<AdminStorageShadowStatus['checks'][number]['id'], string> = {
  users: '用户目录',
  'lesson-directory': '共享实验',
  'capability-reviews': '能力复核',
  'model-settings': '模型设置',
}

const operationalCategoryLabels = {
  process: '进程', storage: '存储', http: '请求', model: '模型', security: '安全', maintenance: '维护',
} as const

const operationalSeverityLabels = {
  info: '信息', warning: '注意', error: '错误', critical: '严重',
} as const

export default function ModelSettingsApp() {
  const [sessionState, setSessionState] = useState<SessionState>('checking')
  const [session, setSession] = useState<AdminSession | null>(null)
  const [loginToken, setLoginToken] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [settings, setSettings] = useState<AdminModelSettings | null>(null)
  const [usageStatus, setUsageStatus] = useState<AdminModelUsageStatus | null>(null)
  const [operationalStatus, setOperationalStatus] = useState<AdminOperationalStatus | null>(null)
  const [storageShadow, setStorageShadow] = useState<AdminStorageShadowStatus | null>(null)
  const [enabledIds, setEnabledIds] = useState<string[]>([])
  const [generationId, setGenerationId] = useState('')
  const [reviewId, setReviewId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<TestProfile | null>(null)
  const [message, setMessage] = useState('')
  const [testResults, setTestResults] = useState<Partial<Record<TestProfile, ModelConnectionTestResult>>>({})

  const handleAuthError = useCallback((error: unknown): boolean => {
    if (error instanceof AdminApiError && error.status === 401) {
      setSession(null)
      setSessionState('signed-out')
      setLoginError('管理员会话已失效，请重新登录。')
      return true
    }
    return false
  }, [])

  const applySettings = useCallback((next: AdminModelSettings) => {
    setSettings(next)
    setEnabledIds(next.enabledIds)
    setGenerationId(next.generationId)
    setReviewId(next.reviewId)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const [nextSettings, nextUsage, nextOperationalStatus, nextStorageShadow] = await Promise.all([
        loadAdminModelSettings(),
        loadAdminModelUsage(),
        loadAdminOperationalEvents(),
        loadAdminStorageShadow(),
      ])
      applySettings(nextSettings)
      setUsageStatus(nextUsage)
      setOperationalStatus(nextOperationalStatus)
      setStorageShadow(nextStorageShadow)
    } catch (error) {
      if (!handleAuthError(error)) setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [applySettings, handleAuthError])

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
      try { await logoutAdmin(session.csrfToken) } catch { /* Clear the local session view regardless. */ }
    }
    setSession(null)
    setSettings(null)
    setUsageStatus(null)
    setOperationalStatus(null)
    setStorageShadow(null)
    setSessionState('signed-out')
  }

  const enabledProfiles = useMemo(
    () => settings?.catalog.filter((profile) => enabledIds.includes(profile.id)) ?? [],
    [enabledIds, settings],
  )
  const dirty = Boolean(settings) && (
    generationId !== settings?.generationId || reviewId !== settings?.reviewId ||
    [...enabledIds].sort().join('|') !== [...(settings?.enabledIds ?? [])].sort().join('|')
  )

  const toggleEnabled = (id: string) => {
    setMessage('')
    setEnabledIds((current) => {
      if (!current.includes(id)) return [...current, id]
      if (current.length === 1) {
        setMessage('至少需要保留一个已启用模型。')
        return current
      }
      const next = current.filter((candidate) => candidate !== id)
      if (generationId === id) setGenerationId(next[0]!)
      if (reviewId === id) setReviewId(next[0]!)
      return next
    })
  }

  const save = async () => {
    if (!session || !settings) return
    setSaving(true)
    setMessage('')
    try {
      const next = await saveAdminModelSettings({ enabledIds, generationId, reviewId }, session.csrfToken)
      applySettings(next)
      setTestResults({})
      setMessage('模型设置已保存，后续生成和 AI 预审将使用新选择。')
    } catch (error) {
      if (!handleAuthError(error)) setMessage(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async (profile: TestProfile) => {
    if (!session) return
    const modelId = profile === 'generation' ? generationId : reviewId
    setTesting(profile)
    setMessage('正在执行极小工具调用，请稍候…')
    try {
      const result = await testAdminModelConnection(modelId, profile, session.csrfToken)
      setTestResults((current) => ({ ...current, [profile]: result }))
      setMessage(testSummary(result))
      void loadAdminModelUsage().then(setUsageStatus).catch(() => undefined)
    } catch (error) {
      if (!handleAuthError(error)) setMessage(errorMessage(error))
    } finally {
      setTesting(null)
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
            <span><strong>Word2HTML</strong><small>模型设置</small></span>
          </a>
          <div className="admin-auth-copy">
            <span className="eyebrow">管理员入口</span>
            <h1>进入模型设置</h1>
            <p>使用与审核台相同的安全会话。页面不会返回或保存模型 API Key。</p>
          </div>
          <label className="admin-token-field">
            <span>管理员令牌</span>
            <input type="password" value={loginToken} autoComplete="current-password" onChange={(event) => setLoginToken(event.target.value)} placeholder="输入 WORD2HTML_ADMIN_TOKEN" autoFocus />
          </label>
          {loginError && <div className="admin-auth-error" role="alert">{loginError}</div>}
          <button className="admin-login-button" type="submit" disabled={loggingIn || !loginToken.trim()}>{loggingIn ? '正在登录…' : '登录模型设置'}</button>
          <a className="admin-back-link" href="/">← 返回普通应用</a>
        </form>
      </main>
    )
  }

  const keyConfiguredCount = settings?.catalog.filter((profile) => profile.keyConfigured).length ?? 0

  return (
    <div className="admin-shell model-settings-shell">
      <header className="admin-topbar">
        <a className="brand" href="/admin/models">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>Word2HTML</strong><small>模型设置</small></span>
        </a>
        <div className="admin-summary-strip">
          <div><strong>{enabledIds.length}</strong><span>已启用</span></div>
          <div><strong>{keyConfiguredCount}</strong><span>密钥已配置</span></div>
          <div><strong>{settings?.catalog.length ?? 0}</strong><span>可信目录</span></div>
        </div>
        <nav className="admin-top-actions">
          <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? '刷新中…' : '刷新设置'}</button>
          <a href="/admin/users">用户管理</a>
          <a href="/admin/reviews">第三方库审核</a>
          <a href="/admin/capabilities">能力学科复核</a>
          <a href="/">普通应用</a>
          <button type="button" onClick={() => void handleLogout()}>退出</button>
        </nav>
      </header>

      <main className="model-settings-workspace">
        <section className="model-settings-intro">
          <div>
            <span className="eyebrow">R6 公开使用基础</span>
            <h1>选择可信的生成与预审模型</h1>
            <p>可选项由服务器环境中的可信目录决定。管理员可启用、切换和测试，但不能在页面中填写任意 Base URL 或读取 API Key。</p>
          </div>
          <div className="model-security-note">
            <strong>密钥与地址边界</strong>
            <span>API Key 只从服务器进程环境读取。</span>
            <span>新增供应商需修改部署配置并重启服务。</span>
          </div>
        </section>

        {settings ? (
          <>
            {usageStatus && (
              <section className="model-usage-card" data-model-usage-status>
                <div className="model-section-heading">
                  <div><span className="eyebrow">今日模型用量</span><h2>限流、并发与费用熔断</h2></div>
                  <span>UTC {usageStatus.day}</span>
                </div>
                <div className="model-usage-grid">
                  <article>
                    <div><span>平台调用</span><strong>{compactNumber(usageStatus.usage.calls)} / {compactNumber(usageStatus.limits.platformDailyCalls)}</strong></div>
                    <div className="model-usage-progress"><i style={{ width: `${usagePercent(usageStatus.usage.calls, usageStatus.limits.platformDailyCalls)}%` }} /></div>
                    <small>单客户端上限 {compactNumber(usageStatus.limits.clientDailyCalls)} 次/日</small>
                  </article>
                  <article>
                    <div><span>Token</span><strong>{compactNumber(usageStatus.usage.totalTokens)} / {compactNumber(usageStatus.limits.platformDailyTokens)}</strong></div>
                    <div className="model-usage-progress"><i style={{ width: `${usagePercent(usageStatus.usage.totalTokens, usageStatus.limits.platformDailyTokens)}%` }} /></div>
                    <small>输入 {compactNumber(usageStatus.usage.inputTokens)} · 输出 {compactNumber(usageStatus.usage.outputTokens)}</small>
                  </article>
                  <article>
                    <div><span>估算费用</span><strong>${usageStatus.usage.estimatedCostUsd.toFixed(6)}</strong></div>
                    <div className="model-usage-progress"><i style={{ width: `${usagePercent(usageStatus.usage.estimatedCostUsd, usageStatus.limits.platformDailyCostUsd)}%` }} /></div>
                    <small>{usageStatus.limits.platformDailyCostUsd > 0 ? `熔断上限 $${usageStatus.limits.platformDailyCostUsd}` : '未启用费用熔断；需配置模型价格'}</small>
                  </article>
                  <article>
                    <div><span>当前并发</span><strong>{usageStatus.concurrency.active} / {usageStatus.concurrency.limit}</strong></div>
                    <div className="model-usage-progress"><i style={{ width: `${usagePercent(usageStatus.concurrency.active, usageStatus.concurrency.limit)}%` }} /></div>
                    <small>单客户端并发 {usageStatus.limits.clientConcurrency}</small>
                  </article>
                </div>
                <div className="model-fuse-row">
                  <span className={usageStatus.fuse.calls ? 'tripped' : ''}>调用熔断：{usageStatus.fuse.calls ? '已触发' : '正常'}</span>
                  <span className={usageStatus.fuse.tokens ? 'tripped' : ''}>Token 熔断：{usageStatus.fuse.tokens ? '已触发' : '正常'}</span>
                  <span className={usageStatus.fuse.cost ? 'tripped' : ''}>费用熔断：{usageStatus.fuse.cost ? '已触发' : '正常'}</span>
                  <small>{Math.round(usageStatus.limits.windowMs / 60_000)} 分钟窗口 · 生成 {usageStatus.limits.scopeLimits.generation ?? 0} 次 · 编辑 {usageStatus.limits.scopeLimits.edit ?? 0} 次</small>
                </div>
              </section>
            )}
            {operationalStatus && (
              <section className={`operational-alert-card ${operationalStatus.status}`} data-operational-alerts={operationalStatus.status}>
                <div className="model-section-heading">
                  <div><span className="eyebrow">运行状态</span><h2>脱敏告警与近期事件</h2></div>
                  <span>{operationalStatus.status === 'healthy' ? '当前正常' : operationalStatus.status === 'attention' ? '需要关注' : '需要立即处理'}</span>
                </div>
                <div className="operational-alert-summary">
                  <span><strong>{operationalStatus.counts.warning}</strong> 注意</span>
                  <span><strong>{operationalStatus.counts.error}</strong> 错误</span>
                  <span><strong>{operationalStatus.counts.critical}</strong> 严重</span>
                  <small>仅统计尚未恢复的事件；内存保留 {operationalStatus.retained}/{operationalStatus.limit} 条</small>
                </div>
                <div className="operational-event-list">
                  {operationalStatus.events.length === 0 ? (
                    <p>暂无运行事件。服务启动、存储、模型或 HTTP 故障会显示在这里。</p>
                  ) : operationalStatus.events.slice(0, 12).map((event) => (
                    <article className={`${event.severity} ${event.resolvedAt ? 'resolved' : ''}`} key={event.id}>
                      <div>
                        <span>{operationalSeverityLabels[event.severity]} · {operationalCategoryLabels[event.category]}</span>
                        <strong>{event.summary}</strong>
                      </div>
                      <code>{event.code}</code>
                      <small>
                        {formattedTime(event.lastAt)}{event.occurrences > 1 ? ` · ${event.occurrences} 次` : ''}{event.resolvedAt ? ' · 已恢复' : ''}
                      </small>
                    </article>
                  ))}
                </div>
                <p className="operational-alert-note">此处不显示请求正文、教学提示词、密钥、登录码、Cookie 或本机文件路径；服务重启后内存事件会清空。</p>
              </section>
            )}
            {storageShadow && (
              <section className={`storage-shadow-card ${storageShadow.status}`} data-storage-shadow-status={storageShadow.status}>
                <div className="model-section-heading">
                  <div>
                    <span className="eyebrow">{storageShadow.status === 'runtime-active' ? '当前主存储' : storageShadow.status === 'runtime-pilot' ? '存储后端试运行' : '存储影子对比'}</span>
                    <h2>{storageShadow.status === 'runtime-active' ? 'SQLite 单实例活动运行库' : storageShadow.status === 'runtime-pilot' ? 'SQLite 维护模式候选运行库' : 'JSON 主存储与 SQLite 只读副本'}</h2>
                  </div>
                  <span>{storageShadow.schemaVersion ? `Schema v${storageShadow.schemaVersion}` : '尚未启用'}</span>
                </div>
                {storageShadow.status === 'not-configured' ? (
                  <p>当前仍只使用 JSON。设置服务端 <code>WORD2HTML_SQLITE_SHADOW_FILE</code> 后，可在这里检查四类数据是否一致。</p>
                ) : storageShadow.status === 'unavailable' ? (
                  <p className="storage-shadow-warning">
                    {storageShadow.mode === 'sqlite-maintenance-pilot' || storageShadow.mode === 'sqlite-single-instance-active'
                      ? `SQLite ${storageShadow.mode === 'sqlite-single-instance-active' ? '活动' : '候选'}运行库无法读取或未通过完整性校验；请停止服务并复验运行库。`
                      : '影子数据库无法读取或未通过完整性校验；JSON 主存储继续正常工作，请重新运行迁移和复验命令。'}
                  </p>
                ) : storageShadow.status === 'runtime-pilot' || storageShadow.status === 'runtime-active' ? (
                  <>
                    <div className="storage-shadow-summary">
                      <strong>{storageShadow.status === 'runtime-active' ? 'SQLite 正在承接业务读写' : '维护试运行已就绪'}</strong>
                      <span>{storageShadow.status === 'runtime-active' ? '当前为单实例活动模式；写入使用事务并同步更新完整性摘要与修订号。' : '页面读取 SQLite 候选运行库；维护模式会拒绝全部业务写操作。'}</span>
                      <small>全局修订 {storageShadow.runtimeRevision ?? 0}{storageShadow.checkedAt ? ` · ${formattedTime(storageShadow.checkedAt)}` : ''}</small>
                    </div>
                    <div className="storage-shadow-checks">
                      {storageShadow.checks.map((check) => <article className={check.matched ? 'matched' : 'diverged'} key={check.id}>
                        <span>{shadowLabels[check.id]}</span><strong>{check.matched ? '就绪' : '异常'}</strong>
                        <small>SQLite {check.sqliteRecords} · 修订 {check.runtimeRevision ?? 0}</small>
                      </article>)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="storage-shadow-summary">
                      <strong>{storageShadow.status === 'matched' ? '全部一致' : '检测到差异'}</strong>
                      <span>{storageShadow.status === 'matched' ? 'SQLite 仍为只读，不承接任何用户写入。' : '差异只记录给管理员，不影响当前 JSON 请求。'}</span>
                      <small>{storageShadow.checkedAt ? `检查时间：${formattedTime(storageShadow.checkedAt)}` : ''}</small>
                    </div>
                    <div className="storage-shadow-checks">
                      {storageShadow.checks.map((check) => <article className={check.matched ? 'matched' : 'diverged'} key={check.id}>
                        <span>{shadowLabels[check.id]}</span><strong>{check.matched ? '一致' : '有差异'}</strong>
                        <small>JSON {check.jsonRecords} · SQLite {check.sqliteRecords}</small>
                      </article>)}
                    </div>
                  </>
                )}
              </section>
            )}
            <section className="model-assignment-card">
              <div className="model-section-heading">
                <div><span className="eyebrow">默认分工</span><h2>生成与 AI 预审</h2></div>
                <span>最近保存：{formattedTime(settings.updatedAt)}</span>
              </div>
              <div className="model-assignment-grid">
                <label>
                  <span>场景生成模型</span>
                  <select value={generationId} onChange={(event) => setGenerationId(event.target.value)}>
                    {enabledProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.label} · {profile.model}</option>)}
                  </select>
                  <small>用于新场景、二次编辑和自动纠错。</small>
                  <button type="button" onClick={() => void testConnection('generation')} disabled={testing !== null || dirty}>
                    {testing === 'generation' ? '测试中…' : '测试生成连接'}
                  </button>
                  {testResults.generation && <output>✓ {testSummary(testResults.generation)}</output>}
                </label>
                <label>
                  <span>AI 预审模型</span>
                  <select value={reviewId} onChange={(event) => setReviewId(event.target.value)}>
                    {enabledProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.label} · {profile.model}</option>)}
                  </select>
                  <small>用于第三方场景包预审，不会自动通过审核。</small>
                  <button type="button" onClick={() => void testConnection('review')} disabled={testing !== null || dirty}>
                    {testing === 'review' ? '测试中…' : '测试预审连接'}
                  </button>
                  {testResults.review && <output>✓ {testSummary(testResults.review)}</output>}
                </label>
              </div>
              <p className="model-test-cost-note">连接测试会发出一次强制工具调用，可能产生少量 token 和费用。请先保存选择再测试。</p>
            </section>

            <section className="model-catalog-section">
              <div className="model-section-heading">
                <div><span className="eyebrow">服务器可信目录</span><h2>已允许的模型</h2></div>
                <span>{enabledIds.length}/{settings.catalog.length} 已启用</span>
              </div>
              <div className="model-catalog-grid">
                {settings.catalog.map((profile) => {
                  const enabled = enabledIds.includes(profile.id)
                  return (
                    <article className={`model-profile-card ${enabled ? 'enabled' : ''}`} key={profile.id}>
                      <div className="model-profile-heading">
                        <div>
                          <span className="model-protocol-badge">{protocolLabel(profile)}</span>
                          <h3>{profile.label}</h3>
                          <p>{profile.provider} · {profile.model}</p>
                        </div>
                        <label className="model-enable-toggle">
                          <input type="checkbox" checked={enabled} onChange={() => toggleEnabled(profile.id)} />
                          <span aria-hidden="true" />
                          <b>{enabled ? '已启用' : '未启用'}</b>
                        </label>
                      </div>
                      <dl>
                        <div><dt>Base URL</dt><dd>{profile.baseURL}</dd></div>
                        <div><dt>输出上限</dt><dd>{profile.maxTokens} tokens</dd></div>
                        <div><dt>超时</dt><dd>{Math.round(profile.timeout / 1000)} 秒</dd></div>
                        <div><dt>估算价格</dt><dd>{profile.inputCostPerMillion || profile.outputCostPerMillion ? `输入 $${profile.inputCostPerMillion} / 输出 $${profile.outputCostPerMillion} · 每百万 token` : '未配置，只统计 token'}</dd></div>
                        <div><dt>API Key</dt><dd className={profile.keyConfigured ? 'model-key-ready' : 'model-key-missing'}>{profile.keyConfigured ? '已在服务器配置' : '未配置'}</dd></div>
                      </dl>
                      <code>{profile.id}</code>
                    </article>
                  )
                })}
              </div>
            </section>

            {message && <div className="model-settings-message" role="status">{message}</div>}
            <div className="model-settings-actions">
              <button type="button" onClick={() => settings && applySettings(settings)} disabled={!dirty || saving}>放弃未保存修改</button>
              <button className="model-save-button" type="button" onClick={() => void save()} disabled={!dirty || saving}>{saving ? '保存中…' : '保存模型设置'}</button>
            </div>
          </>
        ) : (
          <section className="model-settings-loading"><span className="admin-spinner" />{loading ? '正在读取可信模型目录…' : message || '暂无可用模型设置。'}</section>
        )}
      </main>
    </div>
  )
}
