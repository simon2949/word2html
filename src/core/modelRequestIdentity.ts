const CLIENT_ID_STORAGE_KEY = 'word2html.model-client-id.v0.1'

let memoryClientId = ''

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replaceAll('-', '')
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

export function modelClientId(): string {
  if (memoryClientId) return memoryClientId
  try {
    const stored = globalThis.localStorage?.getItem(CLIENT_ID_STORAGE_KEY)
    if (stored && /^[A-Za-z0-9._-]{8,100}$/.test(stored)) {
      memoryClientId = stored
      return memoryClientId
    }
  } catch {
    // Storage can be disabled; the in-memory ID still scopes this tab safely.
  }
  memoryClientId = `browser-${randomToken()}`.slice(0, 100)
  try {
    globalThis.localStorage?.setItem(CLIENT_ID_STORAGE_KEY, memoryClientId)
  } catch {
    // Keep the in-memory ID when storage is unavailable.
  }
  return memoryClientId
}

function stableHash(value: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`
}

export function modelRequestHeaders(
  serializedBody: string,
  { unique = false }: { unique?: boolean } = {},
): Record<string, string> {
  const suffix = unique ? `${serializedBody}|${randomToken()}` : serializedBody
  return {
    'X-Word2HTML-Client-ID': modelClientId(),
    'Idempotency-Key': `w2h-${stableHash(suffix)}`,
  }
}
