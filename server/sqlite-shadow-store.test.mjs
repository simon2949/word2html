import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCapabilitySubjectReviewStore } from './capability-subject-reviews.mjs'
import { createDataBackup } from './data-backup.mjs'
import { createLessonDirectory } from './lesson-directory.mjs'
import { createModelSettingsStore } from './model-settings.mjs'
import { migrateBackupToShadowSqlite } from './sqlite-shadow-migration.mjs'
import { compareJsonAndSqliteStores, createSqliteShadowStore } from './sqlite-shadow-store.mjs'
import { createUserDirectory } from './user-directory.mjs'

const environment = {
  WORD2HTML_MODEL_CATALOG_JSON: JSON.stringify([{
    id: 'shadow-model', label: '影子模型', provider: 'Test', protocol: 'openai-compatible',
    baseURL: 'https://models.example.edu/v1', model: 'lesson-planner', apiKeyEnv: 'SHADOW_MODEL_KEY',
  }]),
  SHADOW_MODEL_KEY: 'shadow-test-secret',
}

const lessonPackage = {
  format: 'word2html.lesson-package', formatVersion: '0.1', kind: 'lesson-plan', apiVersion: 'lesson-plan-1.4',
  plan: {
    schemaVersion: '0.1', status: 'matched', subject: 'math', topic: '影子椭圆',
    templateId: 'math.conic.ellipse-focus-sum', parameterOverrides: { majorAxis: 12, minorAxis: 8 },
    reason: '只读适配器测试。',
  },
}

async function fixture() {
  const root = await mkdtemp('/tmp/word2html-shadow-store-')
  const source = join(root, 'source')
  const users = createUserDirectory({ dataFile: join(source, 'users.json') })
  const createdUser = await users.create({ displayName: '影子用户', dailyCalls: 5, dailyTokens: 5000 })

  const lessons = createLessonDirectory({ dataFile: join(source, 'lessons.json'), now: () => '2026-08-30T12:00:00.000Z' })
  const submitted = await lessons.submit(lessonPackage, 'ellipse.json')
  await lessons.moderate(submitted.entry.id, 'verified', '已审核。')

  const capabilityReviews = createCapabilitySubjectReviewStore({
    dataFile: join(source, 'capabilities.json'), now: () => new Date('2026-08-30T12:00:00.000Z'),
  })
  await capabilityReviews.update('math.function.explicit-2d', {
    status: 'approved', reviewer: '审核人', reviewerRole: '数学教师',
    reviewedVersion: 'word2html@0.1.0', reviewComment: '', checks: { accuracy: true },
  })

  const modelSettings = createModelSettingsStore({
    dataFile: join(source, 'models.json'), environment,
    now: () => new Date('2026-08-30T12:00:00.000Z'),
  })
  await modelSettings.update({ enabledIds: ['shadow-model'], generationId: 'shadow-model', reviewId: 'shadow-model' })

  const backup = await createDataBackup({ sourceDirectory: source, backupRoot: join(root, 'backups') })
  const databaseFile = join(root, 'shadow.sqlite')
  await migrateBackupToShadowSqlite({ backupDirectory: backup.directory, outputFile: databaseFile, environment })
  return {
    databaseFile, createdUser,
    jsonStores: { users, lessons, capabilityReviews, modelSettings },
  }
}

describe('SQLite read-only shadow adapters', () => {
  it('matches the four JSON read interfaces without exposing private credentials', async () => {
    const value = await fixture()
    const shadow = createSqliteShadowStore({ databaseFile: value.databaseFile, environment })
    try {
      await expect(shadow.users.list()).resolves.toEqual(await value.jsonStores.users.list())
      await expect(shadow.users.get(value.createdUser.user.id)).resolves.toEqual(await value.jsonStores.users.get(value.createdUser.user.id))
      await expect(shadow.lessons.listPublic()).resolves.toEqual(await value.jsonStores.lessons.listPublic())
      await expect(shadow.lessons.listForAdmin()).resolves.toEqual(await value.jsonStores.lessons.listForAdmin())
      await expect(shadow.lessons.statusForSubmitter(lessonPackage)).resolves.toEqual(await value.jsonStores.lessons.statusForSubmitter(lessonPackage))
      await expect(shadow.capabilityReviews.list()).resolves.toEqual(await value.jsonStores.capabilityReviews.list())
      await expect(shadow.modelSettings.get()).resolves.toEqual(await value.jsonStores.modelSettings.get())
      await expect(shadow.modelSettings.publicOptions()).resolves.toEqual(await value.jsonStores.modelSettings.publicOptions())
      const config = await shadow.modelSettings.config('generation')
      expect(config).toMatchObject({ catalogId: 'shadow-model', apiKey: 'shadow-test-secret' })
      expect(JSON.stringify(await shadow.modelSettings.get())).not.toContain('shadow-test-secret')
    } finally { shadow.close() }
  })

  it('reports divergence without changing the JSON primary store', async () => {
    const value = await fixture()
    const shadow = createSqliteShadowStore({ databaseFile: value.databaseFile, environment })
    try {
      const matched = await compareJsonAndSqliteStores({ jsonStores: value.jsonStores, sqliteStore: shadow })
      expect(matched.status).toBe('matched')
      expect(matched.checks.every((check) => check.matched)).toBe(true)

      await value.jsonStores.users.update(value.createdUser.user.id, { displayName: 'JSON 后续修改' })
      const diverged = await compareJsonAndSqliteStores({ jsonStores: value.jsonStores, sqliteStore: shadow })
      expect(diverged.status).toBe('diverged')
      expect(diverged.checks.find((check) => check.id === 'users')?.matched).toBe(false)
      expect((await value.jsonStores.users.get(value.createdUser.user.id))?.displayName).toBe('JSON 后续修改')
      expect((await shadow.users.get(value.createdUser.user.id))?.displayName).toBe('影子用户')
    } finally { shadow.close() }
  })
})
