import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createCapabilitySubjectReviewStore } from './capability-subject-reviews.mjs'
import { createDataBackup } from './data-backup.mjs'
import { createLessonDirectory } from './lesson-directory.mjs'
import { createModelSettingsStore } from './model-settings.mjs'
import { migrateBackupToShadowSqlite, verifyShadowSqliteDatabase } from './sqlite-shadow-migration.mjs'
import { createUserDirectory } from './user-directory.mjs'

const environment = {
  WORD2HTML_MODEL_CATALOG_JSON: JSON.stringify([{
    id: 'test-model', label: '测试模型', provider: 'Test', protocol: 'openai-compatible',
    baseURL: 'https://models.example.edu/v1', model: 'lesson-planner', apiKeyEnv: 'SQLITE_TEST_KEY',
  }]),
  SQLITE_TEST_KEY: 'must-not-enter-sqlite',
}

const lessonPackage = {
  format: 'word2html.lesson-package', formatVersion: '0.1', kind: 'lesson-plan',
  apiVersion: 'lesson-plan-1.4',
  plan: {
    schemaVersion: '0.1', status: 'matched', subject: 'math', topic: 'SQLite 椭圆审计',
    templateId: 'math.conic.ellipse-focus-sum',
    parameterOverrides: { majorAxis: 12, minorAxis: 8 }, reason: '迁移测试。',
  },
}

async function migrationFixture() {
  const root = await mkdtemp('/tmp/word2html-sqlite-migration-')
  const source = join(root, 'source')
  const backups = join(root, 'backups')
  const output = join(root, 'shadow.sqlite')

  const users = createUserDirectory({ dataFile: join(source, 'users.json') })
  await users.create({ displayName: '迁移用户', dailyCalls: 7, dailyTokens: 7000 })

  const lessons = createLessonDirectory({
    dataFile: join(source, 'lesson-directory.json'),
    now: () => '2026-08-30T10:00:00.000Z',
  })
  const submitted = await lessons.submit(lessonPackage, 'ellipse.json')
  await lessons.moderate(submitted.entry.id, 'verified', '迁移前已审核。')

  const reviews = createCapabilitySubjectReviewStore({
    dataFile: join(source, 'capability-reviews.json'),
    now: () => new Date('2026-08-30T10:00:00.000Z'),
  })
  await reviews.update('math.function.explicit-2d', {
    status: 'approved', reviewer: '迁移审核员', reviewerRole: '数学教师',
    reviewedVersion: 'word2html@0.1.0', reviewComment: '',
    checks: { accuracy: true, boundaries: true },
  })

  const models = createModelSettingsStore({
    dataFile: join(source, 'model-settings.json'), environment,
    now: () => new Date('2026-08-30T10:00:00.000Z'),
  })
  await models.update({ enabledIds: ['test-model'], generationId: 'test-model', reviewId: 'test-model' })

  const backup = await createDataBackup({ sourceDirectory: source, backupRoot: backups })
  return { root, source, output, backup }
}

describe('JSON to SQLite shadow migration', () => {
  it('imports all business formats and reconciles records, histories, and digests', async () => {
    const value = await migrationFixture()
    const result = await migrateBackupToShadowSqlite({
      backupDirectory: value.backup.directory,
      outputFile: value.output,
      environment,
      now: () => new Date('2026-08-30T11:00:00.000Z'),
    })
    expect(result.ok).toBe(true)
    expect(result.schemaVersion).toBe(1)
    expect(result.checks).toHaveLength(4)
    expect(result.checks.every((check) => check.passed && check.normalizedColumns)).toBe(true)
    expect(result.checks.find((check) => check.format === 'word2html.lesson-directory')).toMatchObject({
      sourceRecords: 1, targetRecords: 1, sourceHistory: 3, targetHistory: 3,
    })
    expect(result.checks.find((check) => check.format === 'word2html.capability-subject-reviews')).toMatchObject({
      sourceRecords: 1, targetRecords: 1, sourceHistory: 1, targetHistory: 1,
    })
    expect((await readFile(value.output)).toString('latin1')).not.toContain('must-not-enter-sqlite')
  })

  it('refuses to overwrite an existing SQLite output', async () => {
    const value = await migrationFixture()
    await migrateBackupToShadowSqlite({ backupDirectory: value.backup.directory, outputFile: value.output, environment })
    await expect(migrateBackupToShadowSqlite({
      backupDirectory: value.backup.directory, outputFile: value.output, environment,
    })).rejects.toThrow('拒绝覆盖')
  })

  it('refuses to place the shadow database inside the verified backup', async () => {
    const value = await migrationFixture()
    await expect(migrateBackupToShadowSqlite({
      backupDirectory: value.backup.directory,
      outputFile: join(value.backup.directory, 'shadow.sqlite'),
      environment,
    })).rejects.toThrow('源备份目录内部')
  })

  it('detects changes to normalized target columns during read-only verification', async () => {
    const value = await migrationFixture()
    await migrateBackupToShadowSqlite({ backupDirectory: value.backup.directory, outputFile: value.output, environment })
    const database = new DatabaseSync(value.output)
    database.prepare("UPDATE users SET display_name = '被篡改'").run()
    database.close()
    expect(() => verifyShadowSqliteDatabase(value.output)).toThrow('数据对账失败')
  })
})
