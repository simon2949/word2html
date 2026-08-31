import { describe, expect, it } from 'vitest'
import { checkOperationalReadiness, securityHeaders } from './operational-readiness.mjs'

describe('operational readiness', () => {
  it('reports every storage dependency without exposing thrown errors', async () => {
    const report = await checkOperationalReadiness({
      users: async () => ['ok'],
      library: async () => { throw new Error('/secret/path/corrupt.json') },
    })
    expect(report).toEqual({ ok: false, checks: { users: 'ready', library: 'unavailable' } })
    expect(JSON.stringify(report)).not.toContain('secret')
  })

  it('adds restrictive production HTML headers', () => {
    const headers = securityHeaders({ html: true })
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Permissions-Policy']).toContain('camera=()')
    expect(headers['Content-Security-Policy']).toContain("object-src 'none'")
    expect(headers['Content-Security-Policy']).toContain("script-src 'self' 'unsafe-eval'")
  })
})
