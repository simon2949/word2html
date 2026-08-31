import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  publicModelProviderStatus,
  readModelProviderConfig,
} from './model-provider.mjs'

export const MODEL_SETTINGS_FORMAT = 'word2html.model-settings'
export const MODEL_SETTINGS_VERSION = '0.1'
const MAX_CATALOG_SIZE = 20

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function booleanValue(value) {
  return clean(value).toLowerCase() === 'true'
}

function nonnegativeNumber(value, fallback = 0) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return fallback
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000) throw new Error('模型 token 价格配置无效。')
  return number
}

function safeId(value) {
  const id = clean(value)
  if (!/^[a-z][a-z0-9._-]{1,63}$/.test(id)) throw new Error('可信模型 ID 格式无效。')
  return id
}

function apiKeyEnvironmentName(value) {
  const name = clean(value)
  if (!/^[A-Z][A-Z0-9_]{2,100}$/.test(name)) throw new Error('模型密钥环境变量名格式无效。')
  return name
}

function profileEnvironment(environment, item, apiKey) {
  return {
    WORD2HTML_MODEL_PROVIDER: item.provider,
    WORD2HTML_MODEL_PROTOCOL: item.protocol,
    WORD2HTML_MODEL_BASE_URL: item.baseURL,
    WORD2HTML_MODEL_MODEL: item.model,
    WORD2HTML_MODEL_API_KEY: apiKey,
    WORD2HTML_MODEL_MAX_TOKENS: item.maxTokens === undefined ? '' : String(item.maxTokens),
    WORD2HTML_MODEL_TEMPERATURE: item.temperature === undefined ? '' : String(item.temperature),
    WORD2HTML_MODEL_TIMEOUT_MS: item.timeout === undefined ? '' : String(item.timeout),
    WORD2HTML_MODEL_ALLOWED_HOSTS: clean(environment.WORD2HTML_MODEL_ALLOWED_HOSTS),
    WORD2HTML_MODEL_ALLOW_HTTP: booleanValue(environment.WORD2HTML_MODEL_ALLOW_HTTP) ? 'true' : '',
    WORD2HTML_MODEL_ALLOW_PRIVATE_BASE_URL: booleanValue(environment.WORD2HTML_MODEL_ALLOW_PRIVATE_BASE_URL) ? 'true' : '',
  }
}

function catalogItemFromInput(value, environment) {
  if (!isRecord(value)) throw new Error('可信模型目录包含无效项。')
  if (Object.hasOwn(value, 'apiKey')) throw new Error('可信模型目录不能包含 API Key。')
  const id = safeId(value.id)
  const label = clean(value.label) || id
  const provider = clean(value.provider)
  const protocol = clean(value.protocol)
  const baseURL = clean(value.baseURL)
  const model = clean(value.model)
  const apiKeyEnv = apiKeyEnvironmentName(value.apiKeyEnv)
  if (!provider || !protocol || !baseURL || !model) throw new Error(`可信模型 ${id} 配置不完整。`)
  if (label.length > 100 || provider.length > 100 || model.length > 160) {
    throw new Error(`可信模型 ${id} 文本字段过长。`)
  }
  const raw = {
    id, label, provider, protocol, baseURL, model, apiKeyEnv,
    maxTokens: value.maxTokens,
    temperature: value.temperature,
    timeout: value.timeout,
    inputCostPerMillion: nonnegativeNumber(value.inputCostPerMillion),
    outputCostPerMillion: nonnegativeNumber(value.outputCostPerMillion),
  }
  const config = {
    ...readModelProviderConfig(profileEnvironment(environment, raw, clean(environment[apiKeyEnv]))),
    inputCostPerMillion: raw.inputCostPerMillion,
    outputCostPerMillion: raw.outputCostPerMillion,
  }
  return { ...raw, config }
}

function derivedCatalog(environment) {
  const generation = readModelProviderConfig(environment)
  const review = readModelProviderConfig(environment, { profile: 'review' })
  const generationRates = {
    inputCostPerMillion: nonnegativeNumber(environment.WORD2HTML_MODEL_INPUT_COST_PER_MILLION_USD),
    outputCostPerMillion: nonnegativeNumber(environment.WORD2HTML_MODEL_OUTPUT_COST_PER_MILLION_USD),
  }
  const reviewRates = {
    inputCostPerMillion: nonnegativeNumber(
      environment.WORD2HTML_REVIEW_MODEL_INPUT_COST_PER_MILLION_USD,
      generationRates.inputCostPerMillion,
    ),
    outputCostPerMillion: nonnegativeNumber(
      environment.WORD2HTML_REVIEW_MODEL_OUTPUT_COST_PER_MILLION_USD,
      generationRates.outputCostPerMillion,
    ),
  }
  const same = generation.provider === review.provider
    && generation.protocol === review.protocol
    && generation.baseURL === review.baseURL
    && generation.model === review.model
    && generation.apiKey === review.apiKey
  const make = (id, label, config, rates) => ({
    id, label, provider: config.provider, protocol: config.protocol,
    baseURL: config.baseURL, model: config.model, apiKeyEnv: '', config: { ...config, ...rates },
  })
  return same
    ? [make('environment-default', '环境默认模型', generation, generationRates)]
    : [
        make('environment-generation', '环境生成模型', generation, generationRates),
        make('environment-review', '环境 AI 预审模型', review, reviewRates),
      ]
}

export function readTrustedModelCatalog(environment = process.env) {
  const source = clean(environment.WORD2HTML_MODEL_CATALOG_JSON)
  if (!source) return derivedCatalog(environment)
  let parsed
  try { parsed = JSON.parse(source) } catch { throw new Error('WORD2HTML_MODEL_CATALOG_JSON 不是有效 JSON。') }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_CATALOG_SIZE) {
    throw new Error(`可信模型目录必须包含 1–${MAX_CATALOG_SIZE} 项。`)
  }
  const catalog = parsed.map((item) => catalogItemFromInput(item, environment))
  if (new Set(catalog.map((item) => item.id)).size !== catalog.length) throw new Error('可信模型目录包含重复 ID。')
  return catalog
}

function publicCatalogItem(item) {
  return {
    id: item.id,
    label: item.label,
    provider: item.provider,
    protocol: item.protocol,
    baseURL: item.baseURL,
    model: item.model,
    keyConfigured: item.config.configured,
    maxTokens: item.config.maxTokens,
    temperature: item.config.temperature,
    timeout: item.config.timeout,
    inputCostPerMillion: item.config.inputCostPerMillion,
    outputCostPerMillion: item.config.outputCostPerMillion,
  }
}

function emptyState(catalog, environment) {
  const ids = catalog.map((item) => item.id)
  const preferredGeneration = clean(environment.WORD2HTML_MODEL_DEFAULT_ID)
  const preferredReview = clean(environment.WORD2HTML_REVIEW_MODEL_DEFAULT_ID)
  return {
    format: MODEL_SETTINGS_FORMAT,
    formatVersion: MODEL_SETTINGS_VERSION,
    enabledIds: ids,
    generationId: ids.includes(preferredGeneration) ? preferredGeneration : ids[0],
    reviewId: ids.includes(preferredReview) ? preferredReview : (ids[1] ?? ids[0]),
    updatedAt: '',
  }
}

function assertState(value) {
  if (
    !isRecord(value) || value.format !== MODEL_SETTINGS_FORMAT ||
    value.formatVersion !== MODEL_SETTINGS_VERSION || !Array.isArray(value.enabledIds) ||
    typeof value.generationId !== 'string' || typeof value.reviewId !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) throw new Error('模型设置数据文件格式不正确。')
  if (value.enabledIds.some((id) => typeof id !== 'string')) throw new Error('模型设置包含无效 ID。')
  return value
}

function reconciledState(state, catalog, environment) {
  const known = new Set(catalog.map((item) => item.id))
  const fallback = emptyState(catalog, environment)
  const enabledIds = [...new Set(state.enabledIds.filter((id) => known.has(id)))]
  const enabled = enabledIds.length > 0 ? enabledIds : fallback.enabledIds
  return {
    ...state,
    enabledIds: enabled,
    generationId: enabled.includes(state.generationId) ? state.generationId : enabled[0],
    reviewId: enabled.includes(state.reviewId) ? state.reviewId : enabled[0],
  }
}

export function createModelSettingsStore({
  dataFile,
  stateStorage,
  environment = process.env,
  now = () => new Date(),
} = {}) {
  if ((!stateStorage || typeof stateStorage.read !== 'function' || typeof stateStorage.write !== 'function') && (
    typeof dataFile !== 'string' || !dataFile
  )) throw new Error('模型设置数据文件路径不能为空。')
  const catalog = readTrustedModelCatalog(environment)
  let writeQueue = Promise.resolve()

  async function load() {
    if (stateStorage) {
      const value = await stateStorage.read()
      return value === undefined
        ? emptyState(catalog, environment)
        : reconciledState(assertState(value), catalog, environment)
    }
    try {
      return reconciledState(assertState(JSON.parse(await readFile(dataFile, 'utf8'))), catalog, environment)
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') return emptyState(catalog, environment)
      throw error
    }
  }

  async function save(state) {
    assertState(state)
    if (stateStorage) {
      await stateStorage.write(state)
      return
    }
    await mkdir(dirname(dataFile), { recursive: true })
    const temporary = `${dataFile}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, dataFile)
  }

  function serialized(operation) {
    const next = writeQueue.then(operation, operation)
    writeQueue = next.then(() => undefined, () => undefined)
    return next
  }

  function settingsResponse(state) {
    return {
      formatVersion: MODEL_SETTINGS_VERSION,
      catalog: catalog.map(publicCatalogItem),
      enabledIds: [...state.enabledIds],
      generationId: state.generationId,
      reviewId: state.reviewId,
      updatedAt: state.updatedAt,
    }
  }

  return {
    async get() {
      return settingsResponse(await load())
    },

    async publicOptions() {
      const settings = settingsResponse(await load())
      return {
        defaultModelId: settings.generationId,
        models: settings.catalog
          .filter((item) => settings.enabledIds.includes(item.id))
          .map((item) => ({
            id: item.id,
            label: item.label,
            provider: item.provider,
            protocol: item.protocol,
            model: item.model,
            platformKeyAvailable: item.keyConfigured,
          })),
      }
    },

    async update(input) {
      if (!isRecord(input) || !Array.isArray(input.enabledIds)) throw new Error('模型设置格式无效。')
      const known = new Set(catalog.map((item) => item.id))
      const enabledIds = [...new Set(input.enabledIds.map(safeId))]
      if (enabledIds.length === 0) throw new Error('至少需要启用一个可信模型。')
      if (enabledIds.some((id) => !known.has(id))) throw new Error('设置包含不在可信目录中的模型。')
      const generationId = safeId(input.generationId)
      const reviewId = safeId(input.reviewId)
      if (!enabledIds.includes(generationId) || !enabledIds.includes(reviewId)) {
        throw new Error('生成和 AI 预审的默认模型必须已启用。')
      }
      const selected = [generationId, reviewId].map((id) => catalog.find((item) => item.id === id))
      if (selected.some((item) => !item?.config.configured)) {
        throw new Error('生成和 AI 预审的默认模型必须已在服务器配置 API Key。')
      }
      return serialized(async () => {
        const state = {
          format: MODEL_SETTINGS_FORMAT,
          formatVersion: MODEL_SETTINGS_VERSION,
          enabledIds,
          generationId,
          reviewId,
          updatedAt: now().toISOString(),
        }
        await save(state)
        return settingsResponse(state)
      })
    },

    async config(profile = 'generation', requestedId) {
      const state = await load()
      const id = requestedId || (profile === 'review' ? state.reviewId : state.generationId)
      if (!state.enabledIds.includes(id)) throw new Error('该模型未启用。')
      const item = catalog.find((candidate) => candidate.id === id)
      if (!item) throw new Error('该模型不在可信目录中。')
      return { ...item.config, profile, catalogId: item.id }
    },

    async publicStatus(profile = 'generation') {
      const config = await this.config(profile)
      return { ...publicModelProviderStatus(profileEnvironment(environment, config, config.apiKey)), profile, catalogId: config.catalogId }
    },
  }
}
