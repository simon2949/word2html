import { isIP } from 'node:net'

export function requestClientAddress(req, { trustProxy = false } = {}) {
  if (trustProxy) {
    const raw = Array.isArray(req?.headers?.['x-forwarded-for'])
      ? req.headers['x-forwarded-for'][0]
      : req?.headers?.['x-forwarded-for']
    const forwarded = typeof raw === 'string' ? raw.split(',').at(-1)?.trim() : ''
    if (forwarded && isIP(forwarded)) return forwarded
  }
  return String(req?.socket?.remoteAddress ?? 'unknown').slice(0, 100)
}
