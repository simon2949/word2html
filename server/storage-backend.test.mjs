import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCapabilitySubjectReviewStore } from './capability-subject-reviews.mjs'
import { createDataBackup } from './data-backup.mjs'
import { createLessonDirectory } from './lesson-directory.mjs'
import { createModelSettingsStore } from './model-settings.mjs'
import { migrateBackupToShadowSqlite } from './sqlite-shadow-migration.mjs'
import { promoteShadowToRuntimeSqlite } from './sqlite-runtime-store.mjs'
import {
  createConfiguredStorageBackend,
  SQLITE_ACTIVATION_CONFIRMATION,
  SQLITE_ACTIVE_MODE,
} from './storage-backend.mjs'
import { createUserDirectory } from './user-directory.mjs'

const environment = {
  WORD2HTML_MODEL_CATALOG_JSON: JSON.stringify([{
    id: 'pilot-model', label: '试运行模型', provider: 'Test', protocol: 'openai-compatible',
    baseURL: 'https://models.example.edu/v1', model: 'pilot', apiKeyEnv: 'PILOT_MODEL_KEY',
  }]),
  PILOT_MODEL_KEY: 'pilot-private-secret',
}

async function fixture() {
  const root = await mkdtemp('/tmp/word2html-storage-backend-')
  const source = join(root, 'source')
  const jsonStores = {
    users: createUserDirectory({ dataFile: join(source, 'users.json') }),
    lessons: createLessonDirectory({ dataFile: join(source, 'lessons.json') }),
    capabilityReviews: createCapabilitySubjectReviewStore({ dataFile: join(source, 'capabilities.json') }),
    modelSettings: createModelSettingsStore({ dataFile: join(source, 'models.json'), environment }),
  }
  await jsonStores.users.create({ displayName: '维护试运行用户' })
  await jsonStores.modelSettings.update({
    enabledIds: ['pilot-model'], generationId: 'pilot-model', reviewId: 'pilot-model',
  })
  const backup = await createDataBackup({ sourceDirectory: source, backupRoot: join(root, 'backups') })
  const shadowFile = join(root, 'shadow.sqlite')
  const runtimeFile = join(root, 'runtime.sqlite')
  await migrateBackupToShadowSqlite({ backupDirectory: backup.directory, outputFile: shadowFile, environment })
  await promoteShadowToRuntimeSqlite({ shadowFile, outputFile: runtimeFile })
  return { jsonStores, runtimeFile }
}

describe('configured storage backend', () => {
  it('keeps JSON as the default backend', async () => {
    const value = await fixture()
    const backend = await createConfiguredStorageBackend({ jsonStores: value.jsonStores })
    expect(backend.publicStatus()).toEqual({ backend: 'json', pilot: false })
    expect(backend.users).toBe(value.jsonStores.users)
    expect(backend.adminStatus()).toBeNull()
  })

  it('requires an explicit active mode and a second confirmation outside maintenance mode', async () => {
    const value = await fixture()
    await expect(createConfiguredStorageBackend({ name: 'mysql', jsonStores: value.jsonStores }))
      .rejects.toThrow('只支持 json 或 sqlite')
    await expect(createConfiguredStorageBackend({
      name: 'sqlite', jsonStores: value.jsonStores,
      sqliteRuntimeFile: value.runtimeFile, environment, maintenanceMode: false,
    })).rejects.toThrow('非维护运行必须显式设置')
    await expect(createConfiguredStorageBackend({
      name: 'sqlite', jsonStores: value.jsonStores,
      sqliteRuntimeFile: value.runtimeFile, environment, maintenanceMode: false,
      sqliteMode: SQLITE_ACTIVE_MODE,
    })).rejects.toThrow('还需要 WORD2HTML_SQLITE_ACTIVATION_CONFIRM')
    await expect(createConfiguredStorageBackend({
      name: 'sqlite', jsonStores: value.jsonStores,
      sqliteRuntimeFile: value.runtimeFile, environment, maintenanceMode: true,
      sqliteMode: SQLITE_ACTIVE_MODE,
      activationConfirmation: SQLITE_ACTIVATION_CONFIRMATION,
    })).rejects.toThrow(/不能与.*MAINTENANCE_MODE/)
  })

  it('opens a verified SQLite candidate for maintenance read validation without exposing secrets or paths', async () => {
    const value = await fixture()
    const backend = await createConfiguredStorageBackend({
      name: 'sqlite', jsonStores: value.jsonStores,
      sqliteRuntimeFile: value.runtimeFile, environment, maintenanceMode: true,
    })
    try {
      await expect(backend.users.list()).resolves.toEqual(await value.jsonStores.users.list())
      expect(backend.verify()).toMatchObject({ ok: true, backend: 'sqlite', pilot: true, schemaVersion: 2 })
      const status = backend.adminStatus()
      expect(status).toMatchObject({ status: 'runtime-pilot', mode: 'sqlite-maintenance-pilot' })
      expect(status.checks).toHaveLength(4)
      expect(JSON.stringify(status)).not.toMatch(/databaseFile|runtimeFile|payload|digest|pilot-private-secret|[.]sqlite/)
    } finally { backend.close() }
  })

  it('opens the verified runtime for writes only after both active confirmations', async () => {
    const value = await fixture()
    const backend = await createConfiguredStorageBackend({
      name: 'sqlite', jsonStores: value.jsonStores,
      sqliteRuntimeFile: value.runtimeFile, environment, maintenanceMode: false,
      sqliteMode: SQLITE_ACTIVE_MODE,
      activationConfirmation: SQLITE_ACTIVATION_CONFIRMATION,
    })
    try {
      const before = backend.verify()
      await backend.users.create({ displayName: 'SQLite active 测试账号' })
      const after = backend.verify()
      expect(after).toMatchObject({
        ok: true, backend: 'sqlite', pilot: false, active: true,
        mode: SQLITE_ACTIVE_MODE, runtimeRevision: before.runtimeRevision + 1,
      })
      expect(backend.publicStatus()).toMatchObject({
        backend: 'sqlite', pilot: false, active: true, mode: SQLITE_ACTIVE_MODE,
      })
      const status = backend.adminStatus()
      expect(status).toMatchObject({ status: 'runtime-active', mode: 'sqlite-single-instance-active' })
      expect(JSON.stringify(status)).not.toMatch(/databaseFile|runtimeFile|payload|digest|pilot-private-secret|[.]sqlite/)
    } finally { backend.close() }
  })
})
