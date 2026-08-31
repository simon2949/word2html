import { afterEach, describe, expect, it, vi } from 'vitest'
import { loginUser, logoutUser, restoreUserSession } from './userSessionApi'

const sessionPayload = {
  authenticated: true,
  user: {
    id: 'user.123', displayName: '测试用户', status: 'active',
    quota: { dailyCalls: 20, dailyTokens: 100000 },
    createdAt: '2026-08-30T00:00:00Z', updatedAt: '2026-08-30T00:00:00Z',
  },
  csrfToken: 'csrf-user', expiresAt: '2026-09-06T00:00:00Z',
}

afterEach(() => vi.unstubAllGlobals())

describe('user session API', () => {
  it('restores an active signed session and treats 401 as guest', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(sessionPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'login required' }), { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(restoreUserSession()).resolves.toMatchObject({ user: { id: 'user.123' } })
    await expect(restoreUserSession()).resolves.toBeNull()
  })

  it('sends a one-time code only to the login endpoint and uses CSRF for logout', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(sessionPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: false }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await loginUser('w2h-login-one-time')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ accessCode: 'w2h-login-one-time' })
    await logoutUser('csrf-user')
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-user' })
  })
})
