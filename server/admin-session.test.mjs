import { describe, expect, it } from 'vitest'
import { ADMIN_SESSION_COOKIE, createAdminSessionManager } from './admin-session.mjs'

function cookieFrom(setCookie) {
  return setCookie.split(';')[0]
}

describe('administrator browser sessions', () => {
  it('keeps the administrator token out of the cookie and requires CSRF for writes', () => {
    const sessions = createAdminSessionManager({ configuredToken: 'long-admin-secret' })
    const login = sessions.start('long-admin-secret')

    expect(login.setCookie).toContain(`${ADMIN_SESSION_COOKIE}=`)
    expect(login.setCookie).toContain('HttpOnly')
    expect(login.setCookie).toContain('SameSite=Strict')
    expect(login.setCookie).not.toContain('long-admin-secret')

    const headers = { cookie: cookieFrom(login.setCookie) }
    expect(sessions.authorize(headers).authorized).toBe(true)
    expect(sessions.authorize(headers, { requireCsrf: true })).toMatchObject({
      authorized: false,
      reason: 'csrf',
    })
    expect(sessions.authorize({ ...headers, 'x-csrf-token': login.csrfToken }, { requireCsrf: true }).authorized)
      .toBe(true)
  })

  it('expires sessions and supports bearer authentication for existing CLI workflows', () => {
    let timestamp = 1000
    const sessions = createAdminSessionManager({
      configuredToken: 'admin-secret',
      ttlMs: 5000,
      clock: () => timestamp,
    })
    const login = sessions.start('admin-secret')
    const headers = { cookie: cookieFrom(login.setCookie) }

    expect(sessions.authorize(headers).authorized).toBe(true)
    timestamp = 6000
    expect(sessions.authorize(headers).authorized).toBe(false)
    expect(sessions.authorize({ authorization: 'Bearer admin-secret' }).method).toBe('bearer')
    expect(sessions.authorize({ authorization: 'Bearer admin' }).authorized).toBe(false)
  })

  it('destroys a session and emits a clearing cookie', () => {
    const sessions = createAdminSessionManager({ configuredToken: 'admin-secret', secure: true })
    const login = sessions.start('admin-secret')
    const headers = { cookie: cookieFrom(login.setCookie) }

    expect(sessions.size()).toBe(1)
    expect(sessions.end(headers)).toContain('Max-Age=0')
    expect(sessions.end({})).toContain('Secure')
    expect(sessions.size()).toBe(0)
  })
})
