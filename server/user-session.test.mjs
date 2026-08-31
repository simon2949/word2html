import { describe, expect, it } from 'vitest'
import { USER_SESSION_COOKIE, createUserSessionManager } from './user-session.mjs'

function cookieFrom(setCookie) {
  return setCookie.split(';')[0]
}

describe('signed user sessions', () => {
  it('creates a persistent HttpOnly cookie without exposing the signing secret', () => {
    const sessions = createUserSessionManager({ secret: 'long-user-session-secret' })
    const login = sessions.start('user.123')
    expect(login.setCookie).toContain(`${USER_SESSION_COOKIE}=`)
    expect(login.setCookie).toContain('HttpOnly')
    expect(login.setCookie).toContain('SameSite=Strict')
    expect(login.setCookie).not.toContain('long-user-session-secret')
    const authorization = sessions.authorize({ cookie: cookieFrom(login.setCookie) })
    expect(authorization).toMatchObject({ authorized: true, userId: 'user.123' })
  })

  it('rejects tampering, expiry, and missing CSRF on logout', () => {
    let timestamp = 1000
    const sessions = createUserSessionManager({
      secret: 'long-user-session-secret', ttlMs: 5000, clock: () => timestamp,
    })
    const login = sessions.start('user.123')
    const cookie = cookieFrom(login.setCookie)
    expect(sessions.authorize({ cookie: `${cookie}x` }).authorized).toBe(false)
    expect(sessions.authorize({ cookie }, { requireCsrf: true })).toMatchObject({ reason: 'csrf' })
    expect(sessions.authorize({ cookie, 'x-csrf-token': login.csrfToken }, { requireCsrf: true }).authorized).toBe(true)
    timestamp = 6000
    expect(sessions.authorize({ cookie }).authorized).toBe(false)
    expect(sessions.end()).toContain('Max-Age=0')
  })
})
