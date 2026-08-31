const MODEL_ID_HEADER = 'x-word2html-model-id'
const API_KEY_HEADER = 'x-word2html-temporary-api-key'

export class TemporaryModelAccessError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'TemporaryModelAccessError'
    this.status = status
  }
}

function singleHeader(headers, name) {
  const value = headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

export function readTemporaryModelCredential(headers) {
  const rawModelId = singleHeader(headers, MODEL_ID_HEADER)
  const rawApiKey = singleHeader(headers, API_KEY_HEADER)
  if (rawModelId === undefined && rawApiKey === undefined) return undefined
  if (typeof rawModelId !== 'string' || typeof rawApiKey !== 'string') {
    throw new TemporaryModelAccessError('临时模型 ID 与 API Key 必须同时提供。')
  }
  const modelId = rawModelId.trim()
  const apiKey = rawApiKey.trim()
  if (!/^[a-z][a-z0-9._-]{1,63}$/.test(modelId)) {
    throw new TemporaryModelAccessError('临时模型 ID 格式无效。')
  }
  if (apiKey.length < 8 || apiKey.length > 4096 || /[\u0000-\u001f\u007f]/.test(apiKey)) {
    throw new TemporaryModelAccessError('临时 API Key 格式或长度无效。')
  }
  return { modelId, apiKey }
}

export function applyTemporaryModelCredential(config, credential) {
  if (!credential) return { config, credentialMode: 'platform' }
  return {
    config: { ...config, apiKey: credential.apiKey, configured: true },
    credentialMode: 'user',
  }
}
