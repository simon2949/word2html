import { randomUUID } from 'node:crypto'

export const OPERATIONAL_EVENT_SEVERITIES = Object.freeze(['info', 'warning', 'error', 'critical'])
export const OPERATIONAL_EVENT_CATEGORIES = Object.freeze([
  'process',
  'storage',
  'http',
  'model',
  'security',
  'maintenance',
])

const SEVERITY_SET = new Set(OPERATIONAL_EVENT_SEVERITIES)
const CATEGORY_SET = new Set(OPERATIONAL_EVENT_CATEGORIES)
const SENSITIVE_KEY = /api.?key|authorization|cookie|csrf|token|secret|password|access.?code|prompt|body|payload|credential/i
const SAFE_CODE = /^[a-z0-9][a-z0-9-]{1,63}$/
const MAX_STRING_LENGTH = 300
const REDACTED = '[redacted]'

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback
}

function redactString(value) {
  const sanitized = String(value)
    .replace(/\bBearer\s+[^\s,;]+/gi, `Bearer ${REDACTED}`)
    .replace(/\bw2h-login-[A-Za-z0-9._-]+\b/g, REDACTED)
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED)
    .replace(/\b(?:MINIMAX_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|WORD2HTML_ADMIN_TOKEN)\s*=\s*[^\s,;]+/gi, REDACTED)
    .replace(/([?&](?:api_?key|token|secret|password|access_?code)=)[^&#\s]+/gi, `$1${REDACTED}`)
    .replace(/(?:\/home|\/root|\/tmp|\/var|\/etc|\/Users)\/[A-Za-z0-9._~!$&'()+,;=:@%/-]+/g, '[path]')
  return sanitized.length > MAX_STRING_LENGTH
    ? `${sanitized.slice(0, MAX_STRING_LENGTH - 1)}…`
    : sanitized
}

function sanitizeValue(value, depth = 0) {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'string') return redactString(value)
  if (value instanceof Error) return { name: redactString(value.name || 'Error') }
  if (depth >= 3) return '[omitted]'
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1))
  if (!value || typeof value !== 'object') return redactString(String(value))

  const result = {}
  for (const [rawKey, item] of Object.entries(value).slice(0, 30)) {
    const key = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(rawKey) ? rawKey : 'field'
    result[key] = SENSITIVE_KEY.test(rawKey) ? REDACTED : sanitizeValue(item, depth + 1)
  }
  return result
}

export function sanitizeOperationalData(value) {
  return sanitizeValue(value)
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(
    ([key, item]) => [key, stableValue(item)],
  ))
}

function statusFromCounts(counts) {
  if (counts.error > 0 || counts.critical > 0) return 'critical'
  if (counts.warning > 0) return 'attention'
  return 'healthy'
}

export function createOperationalEventStore({
  clock = Date.now,
  createId = randomUUID,
  maxEvents = 200,
  dedupeWindowMs = 5 * 60 * 1000,
  emit = (line, severity) => {
    if (severity === 'error' || severity === 'critical') console.error(line)
    else console.log(line)
  },
} = {}) {
  const eventLimit = boundedInteger(maxEvents, 200, 20, 2000)
  const dedupeWindow = boundedInteger(dedupeWindowMs, 5 * 60 * 1000, 1000, 24 * 60 * 60 * 1000)
  const events = []

  function record(input = {}) {
    const severity = SEVERITY_SET.has(input.severity) ? input.severity : 'info'
    const category = CATEGORY_SET.has(input.category) ? input.category : 'process'
    const code = SAFE_CODE.test(input.code) ? input.code : 'unspecified-event'
    const summary = redactString(input.summary || '运行事件')
    const context = sanitizeValue(input.context ?? {})
    const timestamp = clock()
    const at = new Date(timestamp).toISOString()
    const fingerprint = JSON.stringify(stableValue({ category, code, context }))
    const existingIndex = events.findIndex((event) => (
      !event.resolvedAt && event.fingerprint === fingerprint && timestamp - event.lastTimestamp <= dedupeWindow
    ))
    const existing = existingIndex >= 0 ? events[existingIndex] : undefined

    let event
    let shouldEmit = true
    if (existing) {
      existing.lastAt = at
      existing.lastTimestamp = timestamp
      existing.occurrences += 1
      if (OPERATIONAL_EVENT_SEVERITIES.indexOf(severity) > OPERATIONAL_EVENT_SEVERITIES.indexOf(existing.severity)) {
        existing.severity = severity
      } else {
        shouldEmit = false
      }
      events.splice(existingIndex, 1)
      events.unshift(existing)
      event = existing
    } else {
      event = {
        id: `operational-event.${createId()}`,
        severity,
        category,
        code,
        summary,
        context,
        occurrences: 1,
        firstAt: at,
        lastAt: at,
        lastTimestamp: timestamp,
        fingerprint,
      }
      events.unshift(event)
      if (events.length > eventLimit) events.length = eventLimit
    }

    const output = publicEvent(event)
    if (shouldEmit) {
      emit(JSON.stringify({ format: 'word2html.operational-event', version: '0.1', event: output }), event.severity)
    }
    return structuredClone(output)
  }

  function publicEvent(event) {
    return {
      id: event.id,
      severity: event.severity,
      category: event.category,
      code: event.code,
      summary: event.summary,
      context: event.context,
      occurrences: event.occurrences,
      firstAt: event.firstAt,
      lastAt: event.lastAt,
      ...(event.resolvedAt ? { resolvedAt: event.resolvedAt } : {}),
    }
  }

  function resolve({ category, code } = {}) {
    if (!CATEGORY_SET.has(category) || !SAFE_CODE.test(code)) return 0
    const at = new Date(clock()).toISOString()
    let resolved = 0
    for (const event of events) {
      if (event.category === category && event.code === code && !event.resolvedAt) {
        event.resolvedAt = at
        event.lastAt = at
        resolved += 1
      }
    }
    return resolved
  }

  function snapshot({ limit = 50 } = {}) {
    const boundedLimit = boundedInteger(limit, 50, 1, 200)
    const visible = events.slice(0, boundedLimit).map(publicEvent)
    const counts = { info: 0, warning: 0, error: 0, critical: 0 }
    for (const event of events) {
      if (!event.resolvedAt) counts[event.severity] += 1
    }
    return {
      status: statusFromCounts(counts),
      counts,
      retained: events.length,
      limit: eventLimit,
      updatedAt: events[0]?.lastAt,
      events: structuredClone(visible),
    }
  }

  function publicStatus() {
    const status = snapshot({ limit: 1 })
    return {
      status: status.status,
      warningCount: status.counts.warning,
      errorCount: status.counts.error,
      criticalCount: status.counts.critical,
      latestAt: status.updatedAt,
    }
  }

  return { record, resolve, snapshot, publicStatus }
}
