import { describe, expect, it } from 'vitest'
import { requestClientAddress } from './request-client-address.mjs'

describe('request client address', () => {
  it('uses the socket address unless proxy trust is explicitly enabled', () => {
    const request = {
      socket: { remoteAddress: '172.18.0.3' },
      headers: { 'x-forwarded-for': '198.51.100.10' },
    }
    expect(requestClientAddress(request)).toBe('172.18.0.3')
  })

  it('uses the last valid address added by the trusted single proxy', () => {
    const request = {
      socket: { remoteAddress: '172.18.0.3' },
      headers: { 'x-forwarded-for': '203.0.113.99, 198.51.100.10' },
    }
    expect(requestClientAddress(request, { trustProxy: true })).toBe('198.51.100.10')
  })

  it('falls back to the socket for invalid or missing forwarded addresses', () => {
    expect(requestClientAddress({
      socket: { remoteAddress: '172.18.0.3' }, headers: { 'x-forwarded-for': 'not-an-ip' },
    }, { trustProxy: true })).toBe('172.18.0.3')
    expect(requestClientAddress({ socket: { remoteAddress: '::1' }, headers: {} }, { trustProxy: true })).toBe('::1')
  })
})
