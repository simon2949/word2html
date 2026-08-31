import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_REVIEW_FORMAT,
  createCapabilitySubjectReviewStore,
} from './capability-subject-reviews.mjs'
import { createDataBackup } from './data-backup.mjs'
import { restoreDataBackup, validateWord2HtmlDataDirectory } from './data-restore.mjs'
import { createLessonDirectory } from './lesson-directory.mjs'
import { createModelSettingsStore } from './model-settings.mjs'
import {
  exportRuntimeSqliteToJsonBackup,
  verifyRuntimeJsonExport,
} from './sqlite-runtime-export.mjs'
import { migrateBackupToShadowSqlite } from './sqlite-shadow-migration.mjs'
import { createSqliteRuntimeStore, promoteShadowToRuntimeSqlite } from './sqlite-runtime-store.mjs'
import { createUserDirectory } from './user-directory.mjs'

const fixedDate = '2026-08-30T16:00:00.000Z'
const environment = {
  WORD2HTML_MODEL_CATALOG_JSON: JSON.stringify([
    {
      id: 'export-primary', label: '导出测试模型', provider: 'Test', protocol: 'openai-compatible',
      baseURL: 'https://models.example.edu/v1', model: 'lesson-export', apiKeyEnv: 'EXPORT_PRIMARY_KEY',
    },
  ]),
  EXPORT_PRIMARY_KEY: 'must-never-be-exported',
}

function lessonPackage() {
  return {
    format: 'word2html.lesson-package', formatVersion: '0.1', kind: 'lesson-plan', apiVersion: 'lesson-plan-1.4',
    plan: {
      schemaVersion: '0.1', status: 'matched', subject: 'math', topic: 'SQLite JSON 回导测试',
      templateId: 'math.conic.ellipse-focus-sum',
      parameterOverrides: { majorAxis: 12, minorAxis: 8 }, reason: '验证可恢复的完整业务状态。',
    },
  }
}

async function fixture({ includeModelSettings = true } = {}) {
  const root = await mkdtemp('/tmp/word2html-sqlite-export-test-')
  const source = join(root, 'source')
  const now = () => new Date(fixedDate)
  const users = createUserDirectory({ dataFile: join(source, 'users.json'), now })
  const issued = await users.create({ displayName: '导出用户', dailyCalls: 30, dailyTokens: 30_000 })
  const lessons = createLessonDirectory({ dataFile: join(source, 'lessons.json'), now: () => fixedDate })
  const lesson = await lessons.submit(lessonPackage(), 'export-test.json')
  const capabilities = createCapabilitySubjectReviewStore({ dataFile: join(source, 'capabilities.json'), now })
  await capabilities.update('math.function.explicit-2d', {
    status: 'needs-changes', reviewer: '导出审核人', reviewerRole: '数学教师',
    reviewedVersion: 'word2html@0.1.0', reviewComment: '补充边界说明。', checks: { accuracy: true, boundaries: false },
  })
  if (includeModelSettings) {
    const models = createModelSettingsStore({ dataFile: join(source, 'models.json'), environment, now })
    await models.update({
      enabledIds: ['export-primary'], generationId: 'export-primary', reviewId: 'export-primary',
    })
  }
  const backup = await createDataBackup({ sourceDirectory: source, backupRoot: join(root, 'source-backups'), now })
  const shadowFile = join(root, 'shadow.sqlite')
  const runtimeFile = join(root, 'runtime.sqlite')
  await migrateBackupToShadowSqlite({ backupDirectory: backup.directory, outputFile: shadowFile, environment, now })
  await promoteShadowToRuntimeSqlite({ shadowFile, outputFile: runtimeFile, now })
  const runtime = createSqliteRuntimeStore({ databaseFile: runtimeFile, environment, now })
  return { root, runtimeFile, runtime, issued, lesson, now }
}

function normalizedCapabilityReviews(records) {
  return records.map((record) => ({
    ...record,
    history: record.history.map(({ id: _id, ...event }) => event),
  }))
}

describe('SQLite runtime JSON export', () => {
  it('creates a revision-bound backup that restores all four stores without secrets', async () => {
    const value = await fixture()
    try {
      await value.runtime.users.update(value.issued.user.id, { dailyCalls: 35 })
      await value.runtime.lessons.moderate(value.lesson.entry.id, 'verified', '')
      const secondUser = await value.runtime.users.create({ displayName: '运行库新增用户' })
      const before = value.runtime.verify()
      expect(before.runtimeRevision).toBeGreaterThan(0)

      const exported = await exportRuntimeSqliteToJsonBackup({
        databaseFile: value.runtimeFile,
        backupRoot: join(value.root, 'exports'),
        environment,
        now: value.now,
      })
      expect(exported.runtimeRevision).toBe(before.runtimeRevision)
      expect(exported.manifest.sourceRuntime).toMatchObject({
        storageRole: 'runtime', schemaVersion: 2, runtimeRevision: before.runtimeRevision,
      })
      expect(exported.checks).toHaveLength(4)
      expect(exported.checks.every((check) => check.passed)).toBe(true)

      const usersJson = await readFile(join(exported.backupDirectory, 'users.json'), 'utf8')
      const modelsJson = await readFile(join(exported.backupDirectory, 'model-settings.json'), 'utf8')
      expect(usersJson).toContain('digest')
      expect(usersJson).not.toContain(value.issued.accessCode)
      expect(usersJson).not.toContain(secondUser.accessCode)
      expect(modelsJson).not.toContain(environment.EXPORT_PRIMARY_KEY)

      const target = join(value.root, 'restored-data')
      await restoreDataBackup({
        backupDirectory: exported.backupDirectory,
        targetDirectory: target,
        rollbackBackupRoot: join(value.root, 'rollback-backups'),
        maintenanceConfirmed: true,
        environment,
      })
      await expect(validateWord2HtmlDataDirectory(target, { environment })).resolves.toMatchObject({ ok: true })
      const restoredUsers = createUserDirectory({ dataFile: join(target, 'users.json'), now: value.now })
      const restoredLessons = createLessonDirectory({ dataFile: join(target, 'lesson-directory.json'), now: () => fixedDate })
      const restoredCapabilities = createCapabilitySubjectReviewStore({
        dataFile: join(target, 'capability-subject-reviews.json'), now: value.now,
      })
      const restoredModels = createModelSettingsStore({
        dataFile: join(target, 'model-settings.json'), environment, now: value.now,
      })
      expect(await restoredUsers.list()).toEqual(await value.runtime.users.list())
      expect(await restoredLessons.listForAdmin()).toEqual(await value.runtime.lessons.listForAdmin())
      expect(normalizedCapabilityReviews(await restoredCapabilities.list()))
        .toEqual(normalizedCapabilityReviews(await value.runtime.capabilityReviews.list()))
      expect(await restoredModels.get()).toEqual(await value.runtime.modelSettings.get())

      await value.runtime.users.update(value.issued.user.id, { dailyCalls: 36 })
      await expect(verifyRuntimeJsonExport({
        databaseFile: value.runtimeFile,
        backupDirectory: exported.backupDirectory,
        environment,
      })).rejects.toThrow('修订号不匹配')
    } finally { value.runtime.close() }
  })

  it('omits environment-derived model settings and rejects tampered backup bytes', async () => {
    const value = await fixture({ includeModelSettings: false })
    try {
      const exported = await exportRuntimeSqliteToJsonBackup({
        databaseFile: value.runtimeFile,
        backupRoot: join(value.root, 'exports'),
        environment,
        now: value.now,
      })
      expect(exported.manifest.files.map((file) => file.name)).not.toContain('model-settings.json')
      expect(exported.checks.find((check) => check.format === 'word2html.model-settings')).toMatchObject({
        records: 0, passed: true,
      })
      await writeFile(join(exported.backupDirectory, 'users.json'), '{"tampered":true}\n')
      await expect(verifyRuntimeJsonExport({
        databaseFile: value.runtimeFile,
        backupDirectory: exported.backupDirectory,
        environment,
      })).rejects.toThrow('完整性校验失败')
    } finally { value.runtime.close() }
  })

  it('upgrades legacy capability records while exporting the current JSON format', async () => {
    const root = await mkdtemp('/tmp/word2html-sqlite-export-legacy-')
    const source = join(root, 'source')
    await mkdir(source)
    await writeFile(join(source, 'capabilities.json'), JSON.stringify({
      format: CAPABILITY_REVIEW_FORMAT,
      formatVersion: '0.1',
      records: [{
        capabilityId: 'math.function.explicit-2d', status: 'needs-changes',
        reviewer: '旧审核人', reviewerRole: '数学教师', reviewedVersion: 'old-version',
        findings: '旧审阅意见', checks: { accuracy: true }, updatedAt: fixedDate,
        history: [{
          id: 'old-event', at: fixedDate, status: 'needs-changes', reviewer: '旧审核人',
          reviewerRole: '数学教师', reviewedVersion: 'old-version', findings: '旧审阅意见',
          checks: { accuracy: true },
        }],
      }],
    }))
    const backup = await createDataBackup({ sourceDirectory: source, backupRoot: join(root, 'backups') })
    const shadowFile = join(root, 'shadow.sqlite')
    const runtimeFile = join(root, 'runtime.sqlite')
    await migrateBackupToShadowSqlite({ backupDirectory: backup.directory, outputFile: shadowFile, environment })
    await promoteShadowToRuntimeSqlite({ shadowFile, outputFile: runtimeFile })
    const runtime = createSqliteRuntimeStore({ databaseFile: runtimeFile, environment })
    try {
      expect((await runtime.capabilityReviews.list())[0]).toMatchObject({ reviewComment: '旧审阅意见' })
      const exported = await exportRuntimeSqliteToJsonBackup({
        databaseFile: runtimeFile,
        backupRoot: join(root, 'exports'),
        environment,
      })
      const document = JSON.parse(await readFile(
        join(exported.backupDirectory, 'capability-subject-reviews.json'),
        'utf8',
      ))
      expect(document.formatVersion).toBe('0.2')
      expect(document.records[0]).toMatchObject({ reviewComment: '旧审阅意见' })
      expect(document.records[0]).not.toHaveProperty('findings')
    } finally { runtime.close() }
  })
})
