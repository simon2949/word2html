import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadAdminModelSettings,
  loadAdminStorageShadow,
  loadAdminModelUsage,
  loadAdminOperationalEvents,
  loadAdminUsers,
  createAdminUser,
  saveAdminModelSettings,
  testAdminModelConnection,
} from './adminReviewApi'

const settings = {
  formatVersion: '0.1',
  catalog: [{
    id: 'minimax-m3', label: 'MiniMax M3', provider: 'MiniMax',
    protocol: 'anthropic-compatible', baseURL: 'https://api.minimaxi.com/anthropic',
    model: 'MiniMax-M3', keyConfigured: true, maxTokens: 2048, temperature: 1, timeout: 120000,
    inputCostPerMillion: 0, outputCostPerMillion: 0,
  }],
  enabledIds: ['minimax-m3'], generationId: 'minimax-m3', reviewId: 'minimax-m3', updatedAt: '',
}

afterEach(() => vi.unstubAllGlobals())

describe('admin model settings API', () => {
  it('parses the public trusted catalog without expecting a key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ settings }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const loaded = await loadAdminModelSettings()
    expect(loaded).toEqual(settings)
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/model-settings', expect.objectContaining({
      credentials: 'same-origin',
    }))
    expect(JSON.stringify(loaded)).not.toContain('apiKey')
  })

  it('sends only model IDs and the CSRF token when saving', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ settings: { ...settings, updatedAt: 'now' } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await saveAdminModelSettings({
      enabledIds: ['minimax-m3'], generationId: 'minimax-m3', reviewId: 'minimax-m3',
    }, 'csrf-token')
    const request = fetchMock.mock.calls[0]![1] as RequestInit
    expect(request.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-token' })
    expect(JSON.parse(String(request.body))).toEqual({
      enabledIds: ['minimax-m3'], generationId: 'minimax-m3', reviewId: 'minimax-m3',
    })
  })

  it('parses a minimal connection-test result', async () => {
    const result = {
      ok: true, profile: 'generation', modelId: 'minimax-m3', provider: 'MiniMax',
      protocol: 'anthropic-compatible', model: 'MiniMax-M3', latencyMs: 120,
      usage: { inputTokens: 10, outputTokens: 3 },
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(testAdminModelConnection('minimax-m3', 'generation', 'csrf-token')).resolves.toEqual(result)
    const request = fetchMock.mock.calls[0]![1] as RequestInit
    expect(request.headers).toMatchObject({
      'X-CSRF-Token': 'csrf-token',
      'X-Word2HTML-Client-ID': expect.stringMatching(/^browser-/),
      'Idempotency-Key': expect.stringMatching(/^w2h-/),
    })
  })

  it('parses aggregate usage and fuse status', async () => {
    const status = {
      day: '2026-08-30',
      usage: { calls: 3, inputTokens: 100, outputTokens: 20, totalTokens: 120, estimatedCostUsd: 0.001 },
      concurrency: { active: 1, limit: 4 },
      limits: {
        platformDailyCalls: 1000, platformDailyTokens: 5_000_000, platformDailyCostUsd: 5,
        clientDailyCalls: 50, clientDailyTokens: 250_000, clientConcurrency: 1,
        windowMs: 600_000, scopeLimits: { generation: 8, edit: 12 },
      },
      fuse: { calls: false, tokens: false, cost: false },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))
    await expect(loadAdminModelUsage()).resolves.toEqual(status)
  })

  it('parses the read-only storage comparison without expecting paths or records', async () => {
    const status = {
      status: 'matched',
      mode: 'json-primary-sqlite-read-only',
      checkedAt: '2026-08-30T10:00:00.000Z',
      schemaVersion: 1,
      checks: [
        { id: 'users', matched: true, jsonRecords: 2, sqliteRecords: 2 },
        { id: 'lesson-directory', matched: true, jsonRecords: 3, sqliteRecords: 3 },
        { id: 'capability-reviews', matched: true, jsonRecords: 6, sqliteRecords: 6 },
        { id: 'model-settings', matched: true, jsonRecords: 1, sqliteRecords: 1 },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const loaded = await loadAdminStorageShadow()
    expect(loaded).toEqual(status)
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/storage-shadow', expect.objectContaining({
      credentials: 'same-origin',
    }))
    expect(JSON.stringify(loaded)).not.toMatch(/databaseFile|dataFile|payload|digest|\.sqlite/)
  })

  it('parses a SQLite maintenance-pilot status', async () => {
    const status = {
      status: 'runtime-pilot', mode: 'sqlite-maintenance-pilot',
      checkedAt: '2026-08-30T10:00:00.000Z', schemaVersion: 2, runtimeRevision: 0,
      checks: [{
        id: 'users', matched: true, jsonRecords: 0, sqliteRecords: 2, runtimeRevision: 0,
      }],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status }), { status: 200 })))
    await expect(loadAdminStorageShadow()).resolves.toEqual(status)
  })

  it('parses a SQLite single-instance active status', async () => {
    const status = {
      status: 'runtime-active', mode: 'sqlite-single-instance-active',
      checkedAt: '2026-08-30T11:00:00.000Z', schemaVersion: 2, runtimeRevision: 5,
      checks: [{
        id: 'lesson-directory', matched: true, jsonRecords: 0, sqliteRecords: 3, runtimeRevision: 2,
      }],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status }), { status: 200 })))
    await expect(loadAdminStorageShadow()).resolves.toEqual(status)
  })

  it('parses a bounded, read-only operational alert snapshot', async () => {
    const status = {
      status: 'attention',
      counts: { info: 2, warning: 1, error: 0, critical: 0 },
      retained: 3,
      limit: 200,
      updatedAt: '2026-08-30T12:00:00.000Z',
      events: [{
        id: 'operational-event.1', severity: 'warning', category: 'model',
        code: 'model-request-failed', summary: '模型请求失败。', context: { operation: 'generation' },
        occurrences: 2, firstAt: '2026-08-30T11:59:00.000Z', lastAt: '2026-08-30T12:00:00.000Z',
      }],
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadAdminOperationalEvents()).resolves.toEqual(status)
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/operational-events', expect.objectContaining({
      credentials: 'same-origin',
    }))
    expect(JSON.stringify(status)).not.toMatch(/apiKey|authorization|cookie|prompt|payload|\/home\//i)
  })

  it('loads user quotas and sends CSRF-protected account creation', async () => {
    const user = {
      id: 'user.123', displayName: '测试用户', status: 'active',
      quota: { dailyCalls: 20, dailyTokens: 100000 },
      usage: { day: '2026-08-30', calls: 2, inputTokens: 10, outputTokens: 4, totalTokens: 14, active: 0 },
      createdAt: 'now', updatedAt: 'now', invitePending: false,
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ users: [user] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: Object.fromEntries(Object.entries(user).filter(([key]) => key !== 'usage')),
        accessCode: 'w2h-login-secret',
      }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadAdminUsers()).resolves.toEqual([user])
    await expect(createAdminUser({ displayName: '测试用户', dailyCalls: 20, dailyTokens: 100000 }, 'csrf-admin'))
      .resolves.toMatchObject({ accessCode: 'w2h-login-secret' })
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-admin' })
  })
})
