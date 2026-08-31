import Anthropic from '@anthropic-ai/sdk'

export const MODEL_PROTOCOLS = Object.freeze([
  'anthropic-compatible',
  'openai-compatible',
])

const MODEL_PROTOCOL_SET = new Set(MODEL_PROTOCOLS)

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function boundedNumber(value, fallback, minimum, maximum) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return fallback
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback
}

function booleanValue(value) {
  return clean(value).toLowerCase() === 'true'
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0
}

function isPrivateHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || normalized.startsWith('fe80:')
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || isPrivateIpv4(normalized)
}

export function validateModelBaseUrl(baseURL, options = {}) {
  const value = clean(baseURL).replace(/\/+$/, '')
  if (!value) throw new Error('模型 Base URL 不能为空。')
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('模型 Base URL 不是有效 URL。')
  }
  if (url.username || url.password) throw new Error('模型 Base URL 不能包含用户名或密码。')
  if (url.hash) throw new Error('模型 Base URL 不能包含片段标识。')
  if (url.protocol !== 'https:' && !(options.allowHttp && url.protocol === 'http:')) {
    throw new Error('模型 Base URL 必须使用 HTTPS。')
  }
  if (!options.allowPrivate && isPrivateHostname(url.hostname)) {
    throw new Error('模型 Base URL 不能指向回环、局域网或链路本地地址。')
  }
  const allowedHosts = options.allowedHosts ?? []
  if (allowedHosts.length > 0 && !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error(`模型 Base URL 域名不在允许列表中：${url.hostname}`)
  }
  return value
}

function environmentValue(environment, profile, name, legacyName) {
  const profilePrefix = profile === 'review' ? 'WORD2HTML_REVIEW_MODEL_' : 'WORD2HTML_MODEL_'
  return clean(environment[`${profilePrefix}${name}`])
    || (profile === 'review' ? clean(environment[`WORD2HTML_MODEL_${name}`]) : '')
    || (legacyName ? clean(environment[legacyName]) : '')
}

export function readModelProviderConfig(environment = process.env, options = {}) {
  const profile = options.profile === 'review' ? 'review' : 'generation'
  const protocol = environmentValue(environment, profile, 'PROTOCOL') || 'anthropic-compatible'
  if (!MODEL_PROTOCOL_SET.has(protocol)) {
    throw new Error(`不支持的模型协议：${protocol}。`)
  }
  const legacyReviewMaxTokens = profile === 'review' ? 'MINIMAX_REVIEW_MAX_TOKENS' : 'MINIMAX_MAX_TOKENS'
  const provider = environmentValue(environment, profile, 'PROVIDER')
    || (protocol === 'anthropic-compatible' ? 'MiniMax' : 'OpenAI Compatible')
  const apiKey = environmentValue(environment, profile, 'API_KEY', 'MINIMAX_API_KEY')
  const model = environmentValue(environment, profile, 'MODEL', 'MINIMAX_MODEL')
    || (protocol === 'anthropic-compatible' ? 'MiniMax-M3' : '')
  const defaultBaseURL = protocol === 'anthropic-compatible'
    ? 'https://api.minimaxi.com/anthropic'
    : 'https://api.openai.com/v1'
  const rawBaseURL = environmentValue(environment, profile, 'BASE_URL', 'MINIMAX_BASE_URL') || defaultBaseURL
  const allowedHosts = environmentValue(environment, profile, 'ALLOWED_HOSTS')
    .split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
  const allowHttp = booleanValue(environmentValue(environment, profile, 'ALLOW_HTTP'))
  const allowPrivate = booleanValue(environmentValue(environment, profile, 'ALLOW_PRIVATE_BASE_URL'))
  const baseURL = validateModelBaseUrl(rawBaseURL, { allowedHosts, allowHttp, allowPrivate })
  const maxTokens = boundedNumber(
    environmentValue(environment, profile, 'MAX_TOKENS', legacyReviewMaxTokens),
    profile === 'review' ? 1600 : 2048,
    profile === 'review' ? 512 : 256,
    profile === 'review' ? 3072 : 4096,
  )
  const timeout = boundedNumber(
    environmentValue(environment, profile, 'TIMEOUT_MS', 'MINIMAX_TIMEOUT_MS'),
    120000, 10000, 600000,
  )
  const temperature = boundedNumber(
    environmentValue(environment, profile, 'TEMPERATURE', 'MINIMAX_TEMPERATURE'),
    profile === 'review' ? 0.3 : 1, 0, 2,
  )
  return {
    profile,
    provider,
    protocol,
    apiKey,
    baseURL,
    model,
    maxTokens,
    timeout,
    temperature,
    configured: Boolean(apiKey && model),
  }
}

export function publicModelProviderStatus(environment = process.env, options = {}) {
  const config = readModelProviderConfig(environment, options)
  return {
    configured: config.configured,
    profile: config.profile,
    provider: config.provider,
    protocol: config.protocol,
    model: config.model,
    baseURL: config.baseURL,
  }
}

function textContent(content) {
  if (typeof content === 'string') return content
  return (content ?? [])
    .filter((block) => block?.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

function openAiMessages(system, messages) {
  const output = system ? [{ role: 'system', content: system }] : []
  for (const message of messages ?? []) {
    const content = Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }]
    const toolUses = content.filter((block) => block?.type === 'tool_use')
    const toolResults = content.filter((block) => block?.type === 'tool_result')
    const text = textContent(content)
    if (message.role === 'assistant' && toolUses.length > 0) {
      output.push({
        role: 'assistant',
        content: text || null,
        tool_calls: toolUses.map((block) => ({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        })),
      })
      continue
    }
    if (message.role === 'user' && toolResults.length > 0) {
      if (text) output.push({ role: 'user', content: text })
      for (const block of toolResults) {
        output.push({ role: 'tool', tool_call_id: block.tool_use_id, content: textContent(block.content) })
      }
      continue
    }
    output.push({ role: message.role, content: text })
  }
  return output
}

function normalizedOpenAiResponse(payload) {
  const message = payload?.choices?.[0]?.message ?? {}
  const content = []
  if (typeof message.content === 'string' && message.content) content.push({ type: 'text', text: message.content })
  for (const call of message.tool_calls ?? []) {
    let input
    try { input = JSON.parse(call?.function?.arguments ?? '{}') } catch { input = call?.function?.arguments ?? '' }
    content.push({ type: 'tool_use', id: call.id, name: call?.function?.name, input })
  }
  return {
    id: payload?.id,
    model: payload?.model,
    content,
    usage: {
      input_tokens: payload?.usage?.prompt_tokens,
      cache_read_input_tokens: payload?.usage?.prompt_tokens_details?.cached_tokens,
      output_tokens: payload?.usage?.completion_tokens,
    },
  }
}

function openAiCompatibleClient(config, fetchImpl) {
  return {
    messages: {
      async create(request) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), config.timeout)
        try {
          const response = await fetchImpl(`${config.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model: request.model,
              max_tokens: request.max_tokens,
              temperature: request.temperature,
              messages: openAiMessages(request.system, request.messages),
              tools: (request.tools ?? []).map((tool) => ({
                type: 'function',
                function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
              })),
              tool_choice: request.tool_choice?.name
                ? { type: 'function', function: { name: request.tool_choice.name } }
                : 'auto',
            }),
            signal: controller.signal,
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok) {
            const detail = clean(payload?.error?.message || payload?.message).slice(0, 500)
            throw new Error(`模型服务请求失败（HTTP ${response.status}）${detail ? `：${detail}` : '。'}`)
          }
          return normalizedOpenAiResponse(payload)
        } finally {
          clearTimeout(timer)
        }
      },
    },
  }
}

export function createModelProviderClient(config, options = {}) {
  if (!config?.configured) throw new Error('模型服务未配置 API Key 或模型名称。')
  if (config.protocol === 'anthropic-compatible') {
    return new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout,
      maxRetries: 2,
    })
  }
  if (config.protocol === 'openai-compatible') {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch
    if (typeof fetchImpl !== 'function') throw new Error('当前运行环境不支持模型 HTTP 请求。')
    return openAiCompatibleClient(config, fetchImpl)
  }
  throw new Error(`不支持的模型协议：${config.protocol}。`)
}

export async function testModelProviderConnection(config, options = {}) {
  const client = options.client ?? createModelProviderClient(config, { fetchImpl: options.fetchImpl })
  const clock = options.clock ?? Date.now
  const startedAt = clock()
  const response = await client.messages.create({
    model: config.model,
    max_tokens: 64,
    temperature: 0,
    system: '你正在执行 Word2HTML 模型连接测试。不要生成教学内容，只调用指定工具。',
    messages: [{ role: 'user', content: [{ type: 'text', text: '请确认模型接口可用。' }] }],
    tools: [{
      name: 'report_word2html_connection',
      description: '返回 Word2HTML 连接测试结果。',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['status'],
        properties: { status: { const: 'ok' } },
      },
    }],
    tool_choice: { type: 'tool', name: 'report_word2html_connection' },
  })
  const confirmation = response?.content?.find(
    (block) => block?.type === 'tool_use' && block?.name === 'report_word2html_connection',
  )
  if (confirmation?.input?.status !== 'ok') throw new Error('模型已响应，但未完成规定的工具调用。')
  return {
    ok: true,
    provider: config.provider,
    protocol: config.protocol,
    model: response.model ?? config.model,
    latencyMs: Math.max(0, clock() - startedAt),
    usage: {
      inputTokens: response.usage?.input_tokens,
      cachedInputTokens: response.usage?.cache_read_input_tokens,
      outputTokens: response.usage?.output_tokens,
    },
  }
}
