import { describe, expect, it } from 'vitest'
import { modelRequestHeaders } from './modelRequestIdentity'

describe('model request identity', () => {
  it('reuses an idempotency key for the same body and client', () => {
    const first = modelRequestHeaders('{"prompt":"ellipse"}')
    const second = modelRequestHeaders('{"prompt":"ellipse"}')
    expect(second).toEqual(first)
    expect(first['X-Word2HTML-Client-ID']).toMatch(/^[A-Za-z0-9._-]{8,100}$/)
    expect(first['Idempotency-Key']).toMatch(/^w2h-/)
  })

  it('creates unique keys for deliberate connection tests', () => {
    const first = modelRequestHeaders('{"profile":"generation"}', { unique: true })
    const second = modelRequestHeaders('{"profile":"generation"}', { unique: true })
    expect(second['X-Word2HTML-Client-ID']).toBe(first['X-Word2HTML-Client-ID'])
    expect(second['Idempotency-Key']).not.toBe(first['Idempotency-Key'])
  })
})
