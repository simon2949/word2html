import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadEnvironmentSecretFiles } from './environment-secrets.mjs'

describe('environment secret files', () => {
  it('loads built-in and custom model secrets without returning their values', async () => {
    const root = await mkdtemp('/tmp/word2html-secret-files-')
    const adminFile = join(root, 'admin-token')
    const modelFile = join(root, 'school-model-key')
    await writeFile(adminFile, 'admin-secret-value\n', { mode: 0o600 })
    await writeFile(modelFile, 'model-secret-value\n', { mode: 0o600 })
    const environment = {
      WORD2HTML_ADMIN_TOKEN_FILE: adminFile,
      SCHOOL_MODEL_API_KEY_FILE: modelFile,
    }
    expect(loadEnvironmentSecretFiles(environment)).toEqual([
      'WORD2HTML_ADMIN_TOKEN', 'SCHOOL_MODEL_API_KEY',
    ])
    expect(environment).toMatchObject({
      WORD2HTML_ADMIN_TOKEN: 'admin-secret-value',
      SCHOOL_MODEL_API_KEY: 'model-secret-value',
    })
    expect(environment).not.toHaveProperty('WORD2HTML_ADMIN_TOKEN_FILE')
    expect(environment).not.toHaveProperty('SCHOOL_MODEL_API_KEY_FILE')
    expect(JSON.stringify(loadEnvironmentSecretFiles(environment))).not.toContain('secret-value')
  })

  it('keeps an explicitly injected environment value and does not require its fallback file', () => {
    const environment = {
      MINIMAX_API_KEY: 'direct-secret',
      MINIMAX_API_KEY_FILE: '/missing/should-not-be-read',
    }
    expect(loadEnvironmentSecretFiles(environment)).toEqual([])
    expect(environment.MINIMAX_API_KEY).toBe('direct-secret')
    expect(environment).not.toHaveProperty('MINIMAX_API_KEY_FILE')
  })

  it('rejects missing, empty and oversized secret files without exposing their paths', async () => {
    const root = await mkdtemp('/tmp/word2html-invalid-secret-files-')
    const emptyFile = join(root, 'empty-secret')
    const largeFile = join(root, 'large-secret')
    await writeFile(emptyFile, '')
    await writeFile(largeFile, 'x'.repeat(16 * 1024 + 1))
    expect(() => loadEnvironmentSecretFiles({ WORD2HTML_ADMIN_TOKEN_FILE: join(root, 'missing-secret') }))
      .toThrow('无法读取 WORD2HTML_ADMIN_TOKEN 对应的密钥文件。')
    expect(() => loadEnvironmentSecretFiles({ WORD2HTML_ADMIN_TOKEN_FILE: emptyFile }))
      .toThrow('密钥文件为空或格式无效')
    expect(() => loadEnvironmentSecretFiles({ WORD2HTML_ADMIN_TOKEN_FILE: largeFile }))
      .toThrow('密钥文件过大')
    for (const path of [root, emptyFile, largeFile]) {
      try { loadEnvironmentSecretFiles({ WORD2HTML_ADMIN_TOKEN_FILE: path }) } catch (error) {
        expect(error.message).not.toContain(path)
      }
    }
  })

  it('ignores unrelated file settings', () => {
    const environment = { WORD2HTML_LIBRARY_FILE: '/data/lessons.json', CONFIG_FILE: '/config/app.json' }
    expect(loadEnvironmentSecretFiles(environment)).toEqual([])
    expect(environment).toEqual({ WORD2HTML_LIBRARY_FILE: '/data/lessons.json', CONFIG_FILE: '/config/app.json' })
  })
})
