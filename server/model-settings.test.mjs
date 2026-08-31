import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MODEL_SETTINGS_FORMAT,
  createModelSettingsStore,
  readTrustedModelCatalog,
} from './model-settings.mjs'

const catalog = JSON.stringify([
  {
    id: 'minimax-m3', label: 'MiniMax M3', provider: 'MiniMax',
    protocol: 'anthropic-compatible', baseURL: 'https://api.minimaxi.com/anthropic',
    model: 'MiniMax-M3', apiKeyEnv: 'MINIMAX_API_KEY',
  },
  {
    id: 'school-gateway', label: '校内网关', provider: '校内网关',
    protocol: 'openai-compatible', baseURL: 'https://models.example.edu/v1',
    model: 'lesson-planner', apiKeyEnv: 'SCHOOL_MODEL_API_KEY', maxTokens: 1800,
    inputCostPerMillion: 2, outputCostPerMillion: 8,
  },
])

async function storeAt(overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'word2html-model-settings-'))
  const dataFile = join(directory, 'settings.json')
  const environment = {
    WORD2HTML_MODEL_CATALOG_JSON: catalog,
    MINIMAX_API_KEY: 'minimax-secret',
    SCHOOL_MODEL_API_KEY: 'school-secret',
    ...overrides,
  }
  return {
    dataFile,
    store: createModelSettingsStore({
      dataFile, environment, now: () => new Date('2026-08-30T08:00:00.000Z'),
    }),
  }
}

describe('trusted model catalog', () => {
  it('loads validated providers while keeping keys private', () => {
    const result = readTrustedModelCatalog({
      WORD2HTML_MODEL_CATALOG_JSON: catalog,
      MINIMAX_API_KEY: 'private-key',
    })
    expect(result).toHaveLength(2)
    expect(result[0].config.configured).toBe(true)
    expect(result[1].config.configured).toBe(false)
    expect(JSON.stringify(result.map(({ config, ...item }) => item))).not.toContain('private-key')
  })

  it('rejects embedded keys and unsafe provider URLs', () => {
    expect(() => readTrustedModelCatalog({
      WORD2HTML_MODEL_CATALOG_JSON: JSON.stringify([{ ...JSON.parse(catalog)[0], apiKey: 'secret' }]),
    })).toThrow(/API Key/)
    expect(() => readTrustedModelCatalog({
      WORD2HTML_MODEL_CATALOG_JSON: JSON.stringify([{
        ...JSON.parse(catalog)[0], baseURL: 'https://192.168.1.20/v1',
      }]),
    })).toThrow(/局域网/)
  })
})

describe('model settings store', () => {
  it('returns a public default without writing a file or exposing keys', async () => {
    const { dataFile, store } = await storeAt()
    const settings = await store.get()
    expect(settings).toMatchObject({
      generationId: 'minimax-m3', reviewId: 'school-gateway',
      enabledIds: ['minimax-m3', 'school-gateway'],
    })
    expect(settings.catalog.every((item) => !Object.hasOwn(item, 'apiKey'))).toBe(true)
    await expect(readFile(dataFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('exposes only enabled trusted model metadata to ordinary users', async () => {
    const { store } = await storeAt()
    const options = await store.publicOptions()
    expect(options).toMatchObject({
      defaultModelId: 'minimax-m3',
      models: [
        { id: 'minimax-m3', platformKeyAvailable: true },
        { id: 'school-gateway', platformKeyAvailable: true },
      ],
    })
    expect(JSON.stringify(options)).not.toContain('secret')
    expect(JSON.stringify(options)).not.toContain('apiKeyEnv')
    expect(JSON.stringify(options)).not.toContain('baseURL')
  })

  it('persists only IDs and resolves the selected private configuration', async () => {
    const { dataFile, store } = await storeAt()
    const settings = await store.update({
      enabledIds: ['school-gateway'], generationId: 'school-gateway', reviewId: 'school-gateway',
    })
    expect(settings.updatedAt).toBe('2026-08-30T08:00:00.000Z')
    const saved = JSON.parse(await readFile(dataFile, 'utf8'))
    expect(saved).toMatchObject({ format: MODEL_SETTINGS_FORMAT, generationId: 'school-gateway' })
    expect(JSON.stringify(saved)).not.toContain('secret')
    await expect(store.config('generation')).resolves.toMatchObject({
      catalogId: 'school-gateway', protocol: 'openai-compatible', apiKey: 'school-secret',
      inputCostPerMillion: 2, outputCostPerMillion: 8,
    })
  })

  it('requires selected profiles to remain enabled and trusted', async () => {
    const { store } = await storeAt()
    await expect(store.update({
      enabledIds: ['minimax-m3'], generationId: 'minimax-m3', reviewId: 'school-gateway',
    })).rejects.toThrow(/必须已启用/)
    await expect(store.config('generation', 'unknown-model')).rejects.toThrow(/未启用/)
  })

  it('does not save an unconfigured model as a runtime default', async () => {
    const { store } = await storeAt({ SCHOOL_MODEL_API_KEY: '' })
    await expect(store.update({
      enabledIds: ['minimax-m3', 'school-gateway'],
      generationId: 'school-gateway', reviewId: 'minimax-m3',
    })).rejects.toThrow(/配置 API Key/)
  })
})
