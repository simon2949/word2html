import { createHash } from 'node:crypto'

export const MODEL_USAGE_SCOPES = Object.freeze([
  'generation',
  'edit',
  'correction',
  'pre-review',
  'connection-test',
])

const SCOPE_SET = new Set(MODEL_USAGE_SCOPES)

function boundedNumber(value, fallback, minimum, maximum) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return fallback
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback
}

function boundedInteger(value, fallback, minimum, maximum) {
  return Math.round(boundedNumber(value, fallback, minimum, maximum))
}

export function readModelUsageGuardConfig(environment = process.env) {
  return {
    windowMs: boundedInteger(environment.WORD2HTML_MODEL_RATE_WINDOW_MS, 10 * 60 * 1000, 10_000, 24 * 60 * 60 * 1000),
    scopeLimits: {
      generation: boundedInteger(environment.WORD2HTML_MODEL_RATE_GENERATION, 8, 1, 1000),
      edit: boundedInteger(environment.WORD2HTML_MODEL_RATE_EDIT, 12, 1, 1000),
      correction: boundedInteger(environment.WORD2HTML_MODEL_RATE_CORRECTION, 8, 1, 1000),
      'pre-review': boundedInteger(environment.WORD2HTML_MODEL_RATE_PRE_REVIEW, 20, 1, 1000),
      'connection-test': boundedInteger(environment.WORD2HTML_MODEL_RATE_CONNECTION_TEST, 10, 1, 1000),
    },
    clientConcurrency: boundedInteger(environment.WORD2HTML_MODEL_CLIENT_CONCURRENCY, 1, 1, 20),
    globalConcurrency: boundedInteger(environment.WORD2HTML_MODEL_GLOBAL_CONCURRENCY, 4, 1, 100),
    clientDailyCalls: boundedInteger(environment.WORD2HTML_MODEL_CLIENT_DAILY_CALLS, 50, 1, 100_000),
    platformDailyCalls: boundedInteger(environment.WORD2HTML_MODEL_PLATFORM_DAILY_CALLS, 1000, 1, 10_000_000),
    clientDailyTokens: boundedInteger(environment.WORD2HTML_MODEL_CLIENT_DAILY_TOKENS, 250_000, 1000, 100_000_000),
    platformDailyTokens: boundedInteger(environment.WORD2HTML_MODEL_PLATFORM_DAILY_TOKENS, 5_000_000, 1000, 10_000_000_000),
    platformDailyCostUsd: boundedNumber(environment.WORD2HTML_MODEL_PLATFORM_DAILY_COST_USD, 0, 0, 1_000_000),
    idempotencyTtlMs: boundedInteger(environment.WORD2HTML_MODEL_IDEMPOTENCY_TTL_MS, 5 * 60 * 1000, 10_000, 24 * 60 * 60 * 1000),
  }
}

export class ModelUsageLimitError extends Error {
  constructor(message, { status = 429, code = 'model-rate-limit', retryAfterSeconds = 1 } = {}) {
    super(message)
    this.name = 'ModelUsageLimitError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds))
  }
}

function dayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function nextUtcDay(timestamp) {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
}

function emptyDaily(day) {
  return { day, calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costMicros: 0 }
}

function finiteUsage(value) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function usageFrom(value) {
  const usage = value?.usage ?? {}
  return {
    inputTokens: finiteUsage(usage.inputTokens),
    outputTokens: finiteUsage(usage.outputTokens),
  }
}

function estimatedCostMicros(usage, rates = {}) {
  const inputRate = boundedNumber(rates.inputCostPerMillion, 0, 0, 1_000_000)
  const outputRate = boundedNumber(rates.outputCostPerMillion, 0, 0, 1_000_000)
  return Math.ceil(usage.inputTokens * inputRate + usage.outputTokens * outputRate)
}

function clone(value) {
  return structuredClone(value)
}

export function modelClientKey(req, secret = 'word2html-model-usage', clientAddress) {
  const remoteAddress = String(clientAddress ?? req?.socket?.remoteAddress ?? 'unknown').slice(0, 100)
  const rawDevice = Array.isArray(req?.headers?.['x-word2html-client-id'])
    ? req.headers['x-word2html-client-id'][0]
    : req?.headers?.['x-word2html-client-id']
  const device = typeof rawDevice === 'string' && /^[A-Za-z0-9._-]{8,100}$/.test(rawDevice)
    ? rawDevice
    : 'no-device'
  return createHash('sha256').update(`${secret}|${remoteAddress}|${device}`).digest('hex').slice(0, 32)
}

export function modelAccountKey(accountId, secret = 'word2html-model-usage') {
  return createHash('sha256').update(`${secret}|account|${String(accountId)}`).digest('hex').slice(0, 32)
}

export function requestFingerprint(body) {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex')
}

export function requestIdempotencyKey(req, fingerprint) {
  const raw = Array.isArray(req?.headers?.['idempotency-key'])
    ? req.headers['idempotency-key'][0]
    : req?.headers?.['idempotency-key']
  if (typeof raw === 'string' && /^[A-Za-z0-9._:-]{8,160}$/.test(raw)) return raw
  return `auto:${fingerprint}`
}

export function createModelUsageGuard({
  environment = process.env,
  config = readModelUsageGuardConfig(environment),
  clock = Date.now,
} = {}) {
  const rateWindows = new Map()
  const clientDaily = new Map()
  const clientConcurrency = new Map()
  const idempotency = new Map()
  let platformDaily = emptyDaily(dayKey(clock()))
  let globalConcurrency = 0

  function currentDaily() {
    const timestamp = clock()
    const today = dayKey(timestamp)
    if (platformDaily.day !== today) {
      platformDaily = emptyDaily(today)
      clientDaily.clear()
    }
    return { timestamp, today }
  }

  function clientStats(clientKey, today) {
    const current = clientDaily.get(clientKey)
    if (current?.day === today) return current
    const next = emptyDaily(today)
    clientDaily.set(clientKey, next)
    return next
  }

  function prune(timestamp) {
    for (const [key, values] of rateWindows) {
      const active = values.filter((value) => timestamp - value < config.windowMs)
      if (active.length > 0) rateWindows.set(key, active)
      else rateWindows.delete(key)
    }
    for (const [key, entry] of idempotency) {
      if (entry.expiresAt <= timestamp) idempotency.delete(key)
    }
  }

  function effectiveClientLimits(clientLimits = {}) {
    return {
      dailyCalls: boundedInteger(clientLimits.dailyCalls, config.clientDailyCalls, 1, 100_000),
      dailyTokens: boundedInteger(clientLimits.dailyTokens, config.clientDailyTokens, 1000, 100_000_000),
      concurrency: boundedInteger(clientLimits.concurrency, config.clientConcurrency, 1, 20),
    }
  }

  function dailyLimitError(client, timestamp, limits) {
    const retryAfterSeconds = (nextUtcDay(timestamp) - timestamp) / 1000
    if (platformDaily.calls >= config.platformDailyCalls) {
      return new ModelUsageLimitError('平台今日模型调用额度已用完，请明日再试。', {
        status: 503, code: 'platform-daily-calls', retryAfterSeconds,
      })
    }
    if (client.calls >= limits.dailyCalls) {
      return new ModelUsageLimitError('当前客户端今日模型调用额度已用完。', {
        code: 'client-daily-calls', retryAfterSeconds,
      })
    }
    if (platformDaily.totalTokens >= config.platformDailyTokens) {
      return new ModelUsageLimitError('平台今日 token 预算已用完，模型服务已熔断。', {
        status: 503, code: 'platform-daily-tokens', retryAfterSeconds,
      })
    }
    if (client.totalTokens >= limits.dailyTokens) {
      return new ModelUsageLimitError('当前客户端今日 token 额度已用完。', {
        code: 'client-daily-tokens', retryAfterSeconds,
      })
    }
    const costLimitMicros = Math.round(config.platformDailyCostUsd * 1_000_000)
    if (costLimitMicros > 0 && platformDaily.costMicros >= costLimitMicros) {
      return new ModelUsageLimitError('平台今日模型费用预算已用完，模型服务已熔断。', {
        status: 503, code: 'platform-daily-cost', retryAfterSeconds,
      })
    }
    return undefined
  }

  async function run({ scope, clientKey, idempotencyKey, fingerprint, costRates, clientLimits }, operation) {
    if (!SCOPE_SET.has(scope)) throw new Error('未知的模型用量控制范围。')
    if (typeof clientKey !== 'string' || !clientKey) throw new Error('模型用量控制缺少客户端标识。')
    if (typeof idempotencyKey !== 'string' || !idempotencyKey) throw new Error('模型请求缺少幂等标识。')
    if (typeof fingerprint !== 'string' || !fingerprint) throw new Error('模型请求缺少内容指纹。')
    const { timestamp, today } = currentDaily()
    prune(timestamp)
    const idempotencyMapKey = `${clientKey}:${scope}:${idempotencyKey}`
    const existing = idempotency.get(idempotencyMapKey)
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new ModelUsageLimitError('同一幂等标识不能用于不同模型请求。', {
          status: 409, code: 'idempotency-conflict', retryAfterSeconds: 1,
        })
      }
      return { value: clone(await existing.promise), replayed: true }
    }

    const rateKey = `${clientKey}:${scope}`
    const rateValues = rateWindows.get(rateKey) ?? []
    const limit = config.scopeLimits[scope]
    if (rateValues.length >= limit) {
      const retryAfterSeconds = (config.windowMs - (timestamp - rateValues[0])) / 1000
      throw new ModelUsageLimitError(`该类模型操作过于频繁，请稍后重试。`, {
        code: `scope-rate-${scope}`, retryAfterSeconds,
      })
    }
    const client = clientStats(clientKey, today)
    const platform = platformDaily
    const limits = effectiveClientLimits(clientLimits)
    const dailyError = dailyLimitError(client, timestamp, limits)
    if (dailyError) throw dailyError
    if (globalConcurrency >= config.globalConcurrency) {
      throw new ModelUsageLimitError('平台模型任务正在排队，请稍后重试。', {
        status: 503, code: 'global-concurrency', retryAfterSeconds: 3,
      })
    }
    if ((clientConcurrency.get(clientKey) ?? 0) >= limits.concurrency) {
      throw new ModelUsageLimitError('当前客户端已有模型任务进行中，请等待完成。', {
        code: 'client-concurrency', retryAfterSeconds: 2,
      })
    }

    rateWindows.set(rateKey, [...rateValues, timestamp])
    platform.calls += 1
    client.calls += 1
    globalConcurrency += 1
    clientConcurrency.set(clientKey, (clientConcurrency.get(clientKey) ?? 0) + 1)
    const promise = Promise.resolve().then(async () => {
      try {
        const value = await operation()
        const usage = usageFrom(value)
        const costMicros = estimatedCostMicros(usage, costRates)
        for (const stats of [platform, client]) {
          stats.inputTokens += usage.inputTokens
          stats.outputTokens += usage.outputTokens
          stats.totalTokens += usage.inputTokens + usage.outputTokens
          stats.costMicros += costMicros
        }
        return clone(value)
      } catch (error) {
        idempotency.delete(idempotencyMapKey)
        throw error
      } finally {
        globalConcurrency = Math.max(0, globalConcurrency - 1)
        const current = Math.max(0, (clientConcurrency.get(clientKey) ?? 1) - 1)
        if (current > 0) clientConcurrency.set(clientKey, current)
        else clientConcurrency.delete(clientKey)
      }
    })
    idempotency.set(idempotencyMapKey, {
      fingerprint,
      expiresAt: timestamp + config.idempotencyTtlMs,
      promise,
    })
    return { value: clone(await promise), replayed: false }
  }

  return {
    run,

    clientStatus(clientKey) {
      const { timestamp, today } = currentDaily()
      prune(timestamp)
      const stats = clientDaily.get(clientKey)
      const current = stats?.day === today ? stats : emptyDaily(today)
      return {
        day: today,
        calls: current.calls,
        inputTokens: current.inputTokens,
        outputTokens: current.outputTokens,
        totalTokens: current.totalTokens,
        active: clientConcurrency.get(clientKey) ?? 0,
      }
    },

    status() {
      const { timestamp, today } = currentDaily()
      prune(timestamp)
      const costLimitMicros = Math.round(config.platformDailyCostUsd * 1_000_000)
      return {
        day: today,
        usage: {
          calls: platformDaily.calls,
          inputTokens: platformDaily.inputTokens,
          outputTokens: platformDaily.outputTokens,
          totalTokens: platformDaily.totalTokens,
          estimatedCostUsd: platformDaily.costMicros / 1_000_000,
        },
        concurrency: { active: globalConcurrency, limit: config.globalConcurrency },
        limits: {
          platformDailyCalls: config.platformDailyCalls,
          platformDailyTokens: config.platformDailyTokens,
          platformDailyCostUsd: config.platformDailyCostUsd,
          clientDailyCalls: config.clientDailyCalls,
          clientDailyTokens: config.clientDailyTokens,
          clientConcurrency: config.clientConcurrency,
          windowMs: config.windowMs,
          scopeLimits: { ...config.scopeLimits },
        },
        fuse: {
          calls: platformDaily.calls >= config.platformDailyCalls,
          tokens: platformDaily.totalTokens >= config.platformDailyTokens,
          cost: costLimitMicros > 0 && platformDaily.costMicros >= costLimitMicros,
        },
      }
    },
  }
}
