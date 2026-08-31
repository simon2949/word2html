import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const USER_SESSION_COOKIE = 'word2html_user_session'

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

function cookieHeader(token, { maxAgeSeconds, secure }) {
  const attributes = [
    `${USER_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (secure) attributes.push('Secure')
  return attributes.join('; ')
}

export function createUserSessionManager({
  secret,
  secure = false,
  ttlMs = 7 * 24 * 60 * 60 * 1000,
  clock = Date.now,
} = {}) {
  const signingSecret = typeof secret === 'string' ? secret.trim() : ''
  if (signingSecret.length < 12) throw new Error('WORD2HTML_USER_SESSION_SECRET 至少需要 12 个字符。')

  const signature = (payload) => createHmac('sha256', signingSecret).update(payload).digest('base64url')
  const csrfFor = (token) => createHmac('sha256', signingSecret).update(`csrf|${token}`).digest('base64url')

  function decode(headers) {
    const token = cookieValue(headers?.cookie, USER_SESSION_COOKIE)
    const [payload, suppliedSignature] = token.split('.')
    if (!payload || !suppliedSignature || !safeEqual(signature(payload), suppliedSignature)) return undefined
    try {
      const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      if (
        value?.version !== 1 || typeof value.userId !== 'string' ||
        !Number.isFinite(value.expiresAt) || clock() >= value.expiresAt
      ) return undefined
      return { token, userId: value.userId, expiresAt: value.expiresAt }
    } catch {
      return undefined
    }
  }

  return {
    start(userId) {
      if (typeof userId !== 'string' || !userId) throw new Error('用户会话缺少账号 ID。')
      const expiresAt = clock() + ttlMs
      const payload = Buffer.from(JSON.stringify({
        version: 1,
        userId,
        expiresAt,
        nonce: randomBytes(12).toString('base64url'),
      })).toString('base64url')
      const token = `${payload}.${signature(payload)}`
      return {
        userId,
        csrfToken: csrfFor(token),
        expiresAt: new Date(expiresAt).toISOString(),
        setCookie: cookieHeader(token, {
          maxAgeSeconds: Math.max(1, Math.floor(ttlMs / 1000)),
          secure,
        }),
      }
    },

    authorize(headers, { requireCsrf = false } = {}) {
      const session = decode(headers)
      if (!session) return { authorized: false, reason: 'unauthorized' }
      const csrfToken = csrfFor(session.token)
      if (requireCsrf) {
        const supplied = Array.isArray(headers?.['x-csrf-token'])
          ? headers['x-csrf-token'][0]
          : headers?.['x-csrf-token']
        if (!safeEqual(supplied, csrfToken)) return { authorized: false, reason: 'csrf' }
      }
      return {
        authorized: true,
        userId: session.userId,
        csrfToken,
        expiresAt: new Date(session.expiresAt).toISOString(),
      }
    },

    end() {
      return cookieHeader('', { maxAgeSeconds: 0, secure })
    },
  }
}
