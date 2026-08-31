import { describe, expect, it, vi } from 'vitest'
import {
  ModelUsageLimitError,
  createModelUsageGuard,
  modelAccountKey,
  modelClientKey,
  readModelUsageGuardConfig,
} from './model-usage-guard.mjs'

const baseConfig = {
  windowMs: 1000,
  scopeLimits: { generation: 2, edit: 2, correction: 2, 'pre-review': 2, 'connection-test': 2 },
  clientConcurrency: 1,
  globalConcurrency: 2,
  clientDailyCalls: 4,
  platformDailyCalls: 10,
  clientDailyTokens: 100,
  platformDailyTokens: 500,
  platformDailyCostUsd: 0.001,
  idempotencyTtlMs: 5000,
}

function request(scope = 'generation', overrides = {}) {
  return {
    scope, clientKey: 'client-a', idempotencyKey: `request-${scope}-1`,
    fingerprint: `fingerprint-${scope}-1`, ...overrides,
  }
}

describe('model usage guard', () => {
  it('deduplicates completed and in-flight identical requests', async () => {
    const guard = createModelUsageGuard({ config: baseConfig, clock: () => Date.parse('2026-08-30T10:00:00Z') })
    let release
    const pending = new Promise((resolve) => { release = resolve })
    const operation = vi.fn(async () => { await pending; return { usage: { inputTokens: 10, outputTokens: 4 }, value: 1 } })
    const first = guard.run(request(), operation)
    const duplicate = guard.run(request(), operation)
    release()
    await expect(first).resolves.toMatchObject({ replayed: false, value: { value: 1 } })
    await expect(duplicate).resolves.toMatchObject({ replayed: true, value: { value: 1 } })
    await expect(guard.run(request(), operation)).resolves.toMatchObject({ replayed: true })
    expect(operation).toHaveBeenCalledTimes(1)
    expect(guard.status().usage).toMatchObject({ calls: 1, totalTokens: 14 })
  })

  it('enforces per-client concurrency for different requests', async () => {
    const guard = createModelUsageGuard({ config: baseConfig })
    let release
    const pending = new Promise((resolve) => { release = resolve })
    const first = guard.run(request(), async () => { await pending; return {} })
    await expect(guard.run(request('edit'), async () => ({}))).rejects.toMatchObject({
      code: 'client-concurrency', status: 429,
    })
    release()
    await first
  })

  it('enforces separate scope windows and daily token fuse', async () => {
    let now = Date.parse('2026-08-30T10:00:00Z')
    const guard = createModelUsageGuard({ config: { ...baseConfig, clientDailyTokens: 20 }, clock: () => now })
    const operation = async () => ({ usage: { inputTokens: 15, outputTokens: 6 } })
    await guard.run(request(), operation)
    await expect(guard.run(request('edit'), operation)).rejects.toMatchObject({ code: 'client-daily-tokens' })
    now += 24 * 60 * 60 * 1000
    await expect(guard.run(request('edit'), operation)).resolves.toMatchObject({ replayed: false })
  })

  it('tracks estimated provider cost and rejects conflicting idempotency keys', async () => {
    const guard = createModelUsageGuard({ config: baseConfig })
    await guard.run(request('generation', {
      costRates: { inputCostPerMillion: 2, outputCostPerMillion: 8 },
    }), async () => ({ usage: { inputTokens: 100, outputTokens: 50 } }))
    expect(guard.status().usage.estimatedCostUsd).toBeCloseTo(0.0006)
    await expect(guard.run(request('generation', { fingerprint: 'different' }), async () => ({})))
      .rejects.toBeInstanceOf(ModelUsageLimitError)
  })

  it('does not retain a synchronously failed operation as an idempotent result', async () => {
    const guard = createModelUsageGuard({ config: baseConfig })
    const guardedRequest = request('generation', { idempotencyKey: 'same-failure' })
    await expect(guard.run(guardedRequest, () => { throw new Error('configuration failed') }))
      .rejects.toThrow('configuration failed')
    await expect(guard.run(guardedRequest, async () => ({ usage: { inputTokens: 2, outputTokens: 1 } })))
      .resolves.toMatchObject({ replayed: false })
  })

  it('hashes network and valid anonymous device IDs without exposing them', () => {
    const first = modelClientKey({ socket: { remoteAddress: '192.0.2.10' }, headers: { 'x-word2html-client-id': 'device-12345678' } }, 'secret')
    const second = modelClientKey({ socket: { remoteAddress: '192.0.2.10' }, headers: { 'x-word2html-client-id': 'device-87654321' } }, 'secret')
    expect(first).toMatch(/^[a-f0-9]{32}$/)
    expect(first).not.toBe(second)
    expect(first).not.toContain('192.0.2.10')
    expect(modelClientKey({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }, 'secret', '192.0.2.10'))
      .not.toBe(modelClientKey({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }, 'secret', '192.0.2.11'))
    expect(modelAccountKey('user.123', 'secret')).toMatch(/^[a-f0-9]{32}$/)
  })

  it('applies account-specific daily quotas and exposes only that account aggregate', async () => {
    const guard = createModelUsageGuard({ config: baseConfig })
    const accountRequest = request('generation', {
      clientKey: 'account-a',
      clientLimits: { dailyCalls: 1, dailyTokens: 20, concurrency: 1 },
    })
    await guard.run(accountRequest, async () => ({ usage: { inputTokens: 4, outputTokens: 2 } }))
    expect(guard.clientStatus('account-a')).toMatchObject({ calls: 1, totalTokens: 6, active: 0 })
    await expect(guard.run({ ...accountRequest, idempotencyKey: 'account-second', fingerprint: 'second' }, async () => ({})))
      .rejects.toMatchObject({ code: 'client-daily-calls' })
  })

  it('bounds environment configuration', () => {
    const config = readModelUsageGuardConfig({
      WORD2HTML_MODEL_RATE_GENERATION: '0',
      WORD2HTML_MODEL_GLOBAL_CONCURRENCY: '9999',
      WORD2HTML_MODEL_PLATFORM_DAILY_COST_USD: '2.5',
    })
    expect(config.scopeLimits.generation).toBe(1)
    expect(config.globalConcurrency).toBe(100)
    expect(config.platformDailyCostUsd).toBe(2.5)
  })
})
