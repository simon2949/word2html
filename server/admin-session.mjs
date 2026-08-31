import { randomBytes, timingSafeEqual } from 'node:crypto'

export const ADMIN_SESSION_COOKIE = 'word2html_admin_session'

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''))
  const rightBuffer = Buffer.from(String(right ?? ''))
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function cookieValue(header, name) {
  const source = Array.isArray(header) ? header.join(';') : String(header ?? '')
  for (const part of source.split(';')) {
    const [candidate, ...value] = part.trim().split('=')
    if (candidate === name) return decodeURIComponent(value.join('='))
  }
  return ''
}

function cookieHeader(sessionId, { maxAgeSeconds, secure }) {
  const attributes = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (secure) attributes.push('Secure')
  return attributes.join('; ')
}

export function createAdminSessionManager({
  configuredToken,
  secure = false,
  ttlMs = 8 * 60 * 60 * 1000,
  maxSessions = 100,
  clock = Date.now,
} = {}) {
  const expectedToken = typeof configuredToken === 'string' ? configuredToken.trim() : ''
  const sessions = new Map()

  function prune() {
    const timestamp = clock()
    for (const [id, session] of sessions) {
      if (timestamp >= session.expiresAt) sessions.delete(id)
    }
    while (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value)
  }

  function sessionFromHeaders(headers) {
    prune()
    const id = cookieValue(headers?.cookie, ADMIN_SESSION_COOKIE)
    const session = id ? sessions.get(id) : undefined
    if (!session || clock() >= session.expiresAt) {
      if (id) sessions.delete(id)
      return undefined
    }
    return { id, ...session }
  }

  return {
    configured: Boolean(expectedToken),

    start(suppliedToken) {
      if (!expectedToken || !safeEqual(String(suppliedToken ?? '').trim(), expectedToken)) return undefined
      prune()
      const id = randomBytes(32).toString('base64url')
      const csrfToken = randomBytes(24).toString('base64url')
      const expiresAt = clock() + ttlMs
      sessions.set(id, { csrfToken, expiresAt })
      return {
        csrfToken,
        expiresAt: new Date(expiresAt).toISOString(),
        setCookie: cookieHeader(id, {
          maxAgeSeconds: Math.max(1, Math.floor(ttlMs / 1000)),
          secure,
        }),
      }
    },

    authorize(headers, { requireCsrf = false } = {}) {
      const authorization = headers?.authorization
      if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
        const supplied = authorization.slice('Bearer '.length).trim()
        if (expectedToken && safeEqual(supplied, expectedToken)) {
          return { authorized: true, method: 'bearer' }
        }
      }

      const session = sessionFromHeaders(headers)
      if (!session) return { authorized: false, reason: 'unauthorized' }
      if (requireCsrf) {
        const suppliedCsrf = Array.isArray(headers?.['x-csrf-token'])
          ? headers['x-csrf-token'][0]
          : headers?.['x-csrf-token']
        if (!safeEqual(suppliedCsrf, session.csrfToken)) {
          return { authorized: false, reason: 'csrf' }
        }
      }
      return {
        authorized: true,
        method: 'session',
        csrfToken: session.csrfToken,
        expiresAt: new Date(session.expiresAt).toISOString(),
      }
    },

    end(headers) {
      const id = cookieValue(headers?.cookie, ADMIN_SESSION_COOKIE)
      if (id) sessions.delete(id)
      return cookieHeader('', { maxAgeSeconds: 0, secure })
    },

    size() {
      prune()
      return sessions.size
    },
  }
}
