import { describe, expect, it } from 'vitest'
import { createOperationalEventStore, sanitizeOperationalData } from './operational-events.mjs'

describe('operational event store', () => {
  it('redacts credentials, prompts, request bodies and local paths recursively', () => {
    const sanitized = sanitizeOperationalData({
      authorization: 'Bearer top-secret',
      apiKey: 'sk-abcdefghijk',
      prompt: '老师的原始教学要求',
      nested: {
        accessCode: 'w2h-login-abc123',
        detail: 'failed at /home/hello/word2html/private.json?token=secret-value',
      },
    })
    const serialized = JSON.stringify(sanitized)
    expect(serialized).not.toContain('top-secret')
    expect(serialized).not.toContain('abcdefghijk')
    expect(serialized).not.toContain('老师的原始教学要求')
    expect(serialized).not.toContain('abc123')
    expect(serialized).not.toContain('/home/hello')
    expect(serialized).not.toContain('secret-value')
    expect(serialized).toContain('[redacted]')
    expect(serialized).toContain('[path]')
  })

  it('deduplicates repeated faults, raises severity and keeps a bounded newest-first history', () => {
    let now = Date.parse('2026-08-30T12:00:00.000Z')
    let id = 0
    const store = createOperationalEventStore({
      clock: () => now,
      createId: () => String(++id),
      maxEvents: 20,
      emit: () => undefined,
    })
    store.record({ severity: 'warning', category: 'storage', code: 'readiness-failed', summary: '存储检查失败', context: { checks: ['users'] } })
    now += 1000
    store.record({ severity: 'error', category: 'storage', code: 'readiness-failed', summary: '存储检查失败', context: { checks: ['users'] } })
    expect(store.snapshot().events[0]).toMatchObject({ occurrences: 2, severity: 'error' })
    for (let index = 0; index < 24; index += 1) {
      now += 1000
      store.record({ severity: 'info', category: 'process', code: `event-${index}`, summary: `事件 ${index}` })
    }
    const snapshot = store.snapshot({ limit: 200 })
    expect(snapshot.retained).toBe(20)
    expect(snapshot.events[0]?.code).toBe('event-23')
    expect(snapshot.events.some((event) => event.code === 'event-0')).toBe(false)
  })

  it('does not repeatedly emit an unchanged incident inside the deduplication window', () => {
    const lines = []
    const store = createOperationalEventStore({ emit: (line) => lines.push(line) })
    const incident = {
      severity: 'warning', category: 'storage', code: 'readiness-failed',
      summary: '存储检查失败', context: { checks: ['users'] },
    }
    store.record(incident)
    store.record(incident)
    expect(lines).toHaveLength(1)
    expect(store.snapshot().events[0]).toMatchObject({ occurrences: 2 })
  })

  it('exposes safe aggregate public status and emits structured JSON only', () => {
    const lines = []
    const store = createOperationalEventStore({ emit: (line) => lines.push(JSON.parse(line)) })
    store.record({
      severity: 'warning', category: 'model', code: 'provider-failed',
      summary: 'Bearer unsafe-value at /tmp/private.log',
      context: { body: 'private prompt', model: 'MiniMax-M3' },
    })
    expect(store.publicStatus()).toMatchObject({
      status: 'attention', warningCount: 1, errorCount: 0, criticalCount: 0,
    })
    expect(Object.keys(store.publicStatus())).toEqual([
      'status', 'warningCount', 'errorCount', 'criticalCount', 'latestAt',
    ])
    expect(lines[0]).toMatchObject({
      format: 'word2html.operational-event', version: '0.1',
      event: { severity: 'warning', category: 'model', code: 'provider-failed' },
    })
    const serialized = JSON.stringify(lines)
    expect(serialized).not.toContain('unsafe-value')
    expect(serialized).not.toContain('private prompt')
    expect(serialized).not.toContain('/tmp/private.log')
    expect(store.resolve({ category: 'model', code: 'provider-failed' })).toBe(1)
    expect(store.publicStatus()).toMatchObject({ status: 'healthy', warningCount: 0 })
    expect(store.snapshot().events[0]?.resolvedAt).toBeTypeOf('string')
    store.record({
      severity: 'warning', category: 'model', code: 'provider-failed',
      summary: '模型连接再次失败。', context: { body: 'another private prompt', model: 'MiniMax-M3' },
    })
    expect(store.snapshot().events).toHaveLength(2)
    expect(store.snapshot().events[0]).toMatchObject({ summary: '模型连接再次失败。', occurrences: 1 })
    expect(store.publicStatus()).toMatchObject({ status: 'attention', warningCount: 1 })
  })
})
