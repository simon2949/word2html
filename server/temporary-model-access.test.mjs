import { describe, expect, it } from 'vitest'
import {
  TemporaryModelAccessError,
  applyTemporaryModelCredential,
  readTemporaryModelCredential,
} from './temporary-model-access.mjs'

describe('temporary model access', () => {
  it('accepts a complete credential pair and overrides only the current config', () => {
    const credential = readTemporaryModelCredential({
      'x-word2html-model-id': 'school-gateway',
      'x-word2html-temporary-api-key': ' user-secret-123 ',
    })
    const original = { catalogId: 'school-gateway', apiKey: '', configured: false, model: 'lesson-planner' }
    const resolved = applyTemporaryModelCredential(original, credential)
    expect(resolved).toMatchObject({ credentialMode: 'user', config: { configured: true, apiKey: 'user-secret-123' } })
    expect(original.apiKey).toBe('')
  })

  it('keeps platform configuration when temporary headers are absent', () => {
    const config = { apiKey: 'platform-secret', configured: true }
    expect(applyTemporaryModelCredential(config, readTemporaryModelCredential({})))
      .toEqual({ config, credentialMode: 'platform' })
  })

  it('rejects incomplete or malformed credentials without echoing the key', () => {
    expect(() => readTemporaryModelCredential({ 'x-word2html-model-id': 'school-gateway' }))
      .toThrow(TemporaryModelAccessError)
    expect(() => readTemporaryModelCredential({
      'x-word2html-model-id': 'INVALID MODEL',
      'x-word2html-temporary-api-key': 'do-not-echo-this-secret',
    })).toThrow('临时模型 ID 格式无效')
  })
})
