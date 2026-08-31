export interface UserAccount {
  id: string
  displayName: string
  status: 'active'
  quota: { dailyCalls: number; dailyTokens: number }
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
}

export interface UserSession {
  user: UserAccount
  csrfToken: string
  expiresAt: string
}

export class UserSessionApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'UserSessionApiError'
    this.status = status
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  let value: unknown
  try { value = await response.json() } catch {
    throw new UserSessionApiError(`用户服务返回了无法解析的响应（HTTP ${response.status}）。`, response.status)
  }
  if (!isRecord(value)) throw new UserSessionApiError('用户服务响应格式无效。', response.status)
  if (!response.ok) {
    throw new UserSessionApiError(
      typeof value.error === 'string' ? value.error : `用户服务请求失败（HTTP ${response.status}）。`,
      response.status,
      typeof value.code === 'string' ? value.code : undefined,
    )
  }
  return value
}

function parseSession(value: Record<string, unknown>): UserSession {
  if (
    value.authenticated !== true || !isRecord(value.user) || typeof value.csrfToken !== 'string' ||
    typeof value.expiresAt !== 'string' || typeof value.user.id !== 'string' ||
    typeof value.user.displayName !== 'string' || value.user.status !== 'active' ||
    !isRecord(value.user.quota) || typeof value.user.quota.dailyCalls !== 'number' ||
    typeof value.user.quota.dailyTokens !== 'number' || typeof value.user.createdAt !== 'string' ||
    typeof value.user.updatedAt !== 'string'
  ) throw new Error('用户会话响应格式不完整。')
  return {
    user: value.user as unknown as UserAccount,
    csrfToken: value.csrfToken,
    expiresAt: value.expiresAt,
  }
}

export async function restoreUserSession(): Promise<UserSession | null> {
  const response = await fetch('/api/user/session', {
    headers: { Accept: 'application/json' }, credentials: 'same-origin',
  })
  if (response.status === 401 || response.status === 403) return null
  return parseSession(await responsePayload(response))
}

export async function loginUser(accessCode: string): Promise<UserSession> {
  const response = await fetch('/api/user/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ accessCode }),
  })
  return parseSession(await responsePayload(response))
}

export async function logoutUser(csrfToken: string): Promise<void> {
  const response = await fetch('/api/user/session', {
    method: 'DELETE',
    headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken },
    credentials: 'same-origin',
  })
  await responsePayload(response)
}
