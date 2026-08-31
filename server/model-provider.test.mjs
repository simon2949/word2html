import { describe, expect, it, vi } from 'vitest'
import {
  createModelProviderClient,
  publicModelProviderStatus,
  readModelProviderConfig,
  testModelProviderConnection,
  validateModelBaseUrl,
} from './model-provider.mjs'

describe('model provider configuration', () => {
  it('keeps the existing MiniMax environment compatible', () => {
    const config = readModelProviderConfig({ MINIMAX_API_KEY: 'legacy-key' })
    expect(config).toMatchObject({
      provider: 'MiniMax', protocol: 'anthropic-compatible',
      model: 'MiniMax-M3', baseURL: 'https://api.minimaxi.com/anthropic',
      apiKey: 'legacy-key', configured: true,
    })
  })

  it('reads a unified OpenAI-compatible profile without exposing its key', () => {
    const environment = {
      WORD2HTML_MODEL_PROTOCOL: 'openai-compatible',
      WORD2HTML_MODEL_PROVIDER: '校内模型网关',
      WORD2HTML_MODEL_BASE_URL: 'https://models.example.edu/v1/',
      WORD2HTML_MODEL_MODEL: 'lesson-planner',
      WORD2HTML_MODEL_API_KEY: 'private-key',
    }
    const config = readModelProviderConfig(environment)
    const status = publicModelProviderStatus(environment)
    expect(config).toMatchObject({
      provider: '校内模型网关', protocol: 'openai-compatible',
      baseURL: 'https://models.example.edu/v1', model: 'lesson-planner', configured: true,
    })
    expect(status).not.toHaveProperty('apiKey')
    expect(JSON.stringify(status)).not.toContain('private-key')
  })

  it('uses a separate review profile with generation fallback', () => {
    const config = readModelProviderConfig({
      WORD2HTML_MODEL_API_KEY: 'shared-key',
      WORD2HTML_MODEL_MODEL: 'generation-model',
      WORD2HTML_REVIEW_MODEL_MODEL: 'review-model',
      WORD2HTML_REVIEW_MODEL_MAX_TOKENS: '900',
    }, { profile: 'review' })
    expect(config).toMatchObject({ profile: 'review', apiKey: 'shared-key', model: 'review-model', maxTokens: 900 })
  })

  it('rejects unsafe provider URLs unless an administrator explicitly opts in', () => {
    expect(() => validateModelBaseUrl('http://127.0.0.1:8000/v1')).toThrow(/HTTPS/)
    expect(() => validateModelBaseUrl('https://192.168.1.20/v1')).toThrow(/局域网/)
    expect(() => validateModelBaseUrl('https://user:pass@example.com/v1')).toThrow(/用户名或密码/)
    expect(validateModelBaseUrl('http://127.0.0.1:8000/v1', { allowHttp: true, allowPrivate: true }))
      .toBe('http://127.0.0.1:8000/v1')
  })
})

describe('OpenAI-compatible model provider adapter', () => {
  it('translates tool requests and normalizes usage and tool output', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'response-1', model: 'lesson-planner',
        choices: [{ message: { tool_calls: [{
          id: 'call-1', type: 'function',
          function: { name: 'emit_lesson_plan', arguments: '{"schemaVersion":"0.1"}' },
        }] } }],
        usage: { prompt_tokens: 120, completion_tokens: 45, prompt_tokens_details: { cached_tokens: 20 } },
      }),
    })
    const config = readModelProviderConfig({
      WORD2HTML_MODEL_PROTOCOL: 'openai-compatible',
      WORD2HTML_MODEL_PROVIDER: '测试网关',
      WORD2HTML_MODEL_BASE_URL: 'https://models.example.com/v1',
      WORD2HTML_MODEL_MODEL: 'lesson-planner',
      WORD2HTML_MODEL_API_KEY: 'test-key',
    })
    const client = createModelProviderClient(config, { fetchImpl })
    const response = await client.messages.create({
      model: config.model, max_tokens: 1000, temperature: 0.2,
      system: 'system prompt',
      messages: [{ role: 'user', content: [{ type: 'text', text: '画一个椭圆' }] }],
      tools: [{ name: 'emit_lesson_plan', description: '返回规划', input_schema: { type: 'object' } }],
      tool_choice: { type: 'tool', name: 'emit_lesson_plan' },
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://models.example.com/v1/chat/completions', expect.objectContaining({
      method: 'POST', signal: expect.any(AbortSignal),
    }))
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.messages).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: '画一个椭圆' },
    ])
    expect(body.tools[0]).toMatchObject({ type: 'function', function: { name: 'emit_lesson_plan' } })
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'emit_lesson_plan' } })
    expect(response).toMatchObject({
      model: 'lesson-planner',
      content: [{ type: 'tool_use', id: 'call-1', name: 'emit_lesson_plan', input: { schemaVersion: '0.1' } }],
      usage: { input_tokens: 120, cache_read_input_tokens: 20, output_tokens: 45 },
    })
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key')
  })

  it('runs a minimal forced-tool connection test without exposing the key', async () => {
    const create = vi.fn().mockResolvedValue({
      model: 'lesson-planner',
      content: [{
        type: 'tool_use', name: 'report_word2html_connection', input: { status: 'ok' },
      }],
      usage: { input_tokens: 18, output_tokens: 5 },
    })
    const config = readModelProviderConfig({
      WORD2HTML_MODEL_PROTOCOL: 'openai-compatible',
      WORD2HTML_MODEL_BASE_URL: 'https://models.example.com/v1',
      WORD2HTML_MODEL_MODEL: 'lesson-planner',
      WORD2HTML_MODEL_API_KEY: 'private-key',
    })
    const times = [100, 142]
    const result = await testModelProviderConnection(config, {
      client: { messages: { create } }, clock: () => times.shift(),
    })
    expect(create.mock.calls[0][0]).toMatchObject({
      max_tokens: 64, temperature: 0,
      tool_choice: { type: 'tool', name: 'report_word2html_connection' },
    })
    expect(result).toMatchObject({ ok: true, model: 'lesson-planner', latencyMs: 42 })
    expect(JSON.stringify(result)).not.toContain('private-key')
  })
})
