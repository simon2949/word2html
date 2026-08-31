import { createHash } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createCapabilitySubjectReviewStore } from './capability-subject-reviews.mjs'
import { createDataBackup } from './data-backup.mjs'
import { createLessonDirectory } from './lesson-directory.mjs'
import { createModelSettingsStore } from './model-settings.mjs'
import { migrateBackupToShadowSqlite, verifyShadowSqliteDatabase } from './sqlite-shadow-migration.mjs'
import {
  createSqliteRuntimeStore,
  promoteShadowToRuntimeSqlite,
  verifyRuntimeSqliteDatabase,
} from './sqlite-runtime-store.mjs'
import { createUserDirectory } from './user-directory.mjs'

const fixedDate = '2026-08-30T14:00:00.000Z'
const environment = {
  WORD2HTML_MODEL_CATALOG_JSON: JSON.stringify([
    {
      id: 'runtime-primary', label: '运行主模型', provider: 'Test', protocol: 'openai-compatible',
      baseURL: 'https://models.example.edu/v1', model: 'lesson-primary', apiKeyEnv: 'RUNTIME_PRIMARY_KEY',
    },
    {
      id: 'runtime-review', label: '运行预审模型', provider: 'Test', protocol: 'anthropic-compatible',
      baseURL: 'https://review.example.edu/anthropic', model: 'lesson-review', apiKeyEnv: 'RUNTIME_REVIEW_KEY',
    },
  ]),
  RUNTIME_PRIMARY_KEY: 'runtime-primary-secret',
  RUNTIME_REVIEW_KEY: 'runtime-review-secret',
}

function lessonPackage(reason, majorAxis = 12) {
  return {
    format: 'word2html.lesson-package', formatVersion: '0.1', kind: 'lesson-plan', apiVersion: 'lesson-plan-1.4',
    plan: {
      schemaVersion: '0.1', status: 'matched', subject: 'math', topic: 'SQLite 运行库椭圆',
      templateId: 'math.conic.ellipse-focus-sum',
      parameterOverrides: { majorAxis, minorAxis: 8 }, reason,
    },
  }
}

const noIssuesReview = {
  standardVersion: '0.1',
  result: {
    schemaVersion: '0.1', standardVersion: '0.1', verdict: 'no-issues',
    summary: '未发现明确问题，仍需管理员人工确认。', issues: [],
    manualReviewFocus: ['检查参数边界。'],
  },
  usage: { inputTokens: 40, outputTokens: 10, modelCalls: 1 },
  provider: { name: 'Test', model: 'lesson-review' },
}

async function fixture() {
  const root = await mkdtemp('/tmp/word2html-sqlite-runtime-')
  const source = join(root, 'source')
  const now = () => new Date(fixedDate)
  const users = createUserDirectory({ dataFile: join(source, 'users.json'), now })
  await users.create({ displayName: '初始用户', dailyCalls: 10, dailyTokens: 10_000 })

  const lessons = createLessonDirectory({ dataFile: join(source, 'lessons.json'), now: () => fixedDate })
  const initialLesson = await lessons.submit(lessonPackage('初始版本。'), 'initial.json')
  await lessons.moderate(initialLesson.entry.id, 'needs-changes', '请补充参数说明。')

  const capabilityReviews = createCapabilitySubjectReviewStore({
    dataFile: join(source, 'capabilities.json'), now,
  })
  await capabilityReviews.update('math.function.explicit-2d', {
    status: 'approved', reviewer: '初始审核人', reviewerRole: '数学教师',
    reviewedVersion: 'word2html@0.1.0', reviewComment: '', checks: { accuracy: true },
  })

  const modelSettings = createModelSettingsStore({
    dataFile: join(source, 'models.json'), environment, now,
  })
  await modelSettings.update({
    enabledIds: ['runtime-primary', 'runtime-review'],
    generationId: 'runtime-primary', reviewId: 'runtime-review',
  })

  const backup = await createDataBackup({ sourceDirectory: source, backupRoot: join(root, 'backups') })
  const shadowFile = join(root, 'shadow.sqlite')
  const runtimeFile = join(root, 'runtime.sqlite')
  await migrateBackupToShadowSqlite({ backupDirectory: backup.directory, outputFile: shadowFile, environment, now })
  await promoteShadowToRuntimeSqlite({ shadowFile, outputFile: runtimeFile, now })
  return {
    root, shadowFile, runtimeFile, initialLesson,
    json: { users, lessons, capabilityReviews, modelSettings },
    runtime: createSqliteRuntimeStore({ databaseFile: runtimeFile, environment, now }),
  }
}

function withoutEventIds(value) {
  return value.map((entry) => ({
    ...entry,
    reviewHistory: entry.reviewHistory?.map(({ id: _id, ...event }) => event),
  }))
}

function normalizedUsers(value) {
  return value.map(({ id: _id, ...user }) => user).sort((left, right) => left.displayName.localeCompare(right.displayName))
}

function normalizedCapabilityReviews(value) {
  return value.map((record) => ({
    ...record,
    history: record.history.map(({ id: _id, ...event }) => event),
  }))
}

async function rejectionMessage(operation) {
  try {
    await operation()
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

describe('SQLite writable runtime store', () => {
  it('promotes a verified shadow into a separate Schema v2 runtime without changing the shadow', async () => {
    const value = await fixture()
    try {
      const before = createHash('sha256').update(await readFile(value.shadowFile)).digest('hex')
      const runtime = verifyRuntimeSqliteDatabase(value.runtimeFile)
      const after = createHash('sha256').update(await readFile(value.shadowFile)).digest('hex')
      expect(after).toBe(before)
      expect(verifyShadowSqliteDatabase(value.shadowFile).schemaVersion).toBe(1)
      expect(runtime).toMatchObject({ schemaVersion: 2, storageRole: 'runtime', runtimeRevision: 0 })
      expect(runtime.checks).toHaveLength(4)
      expect(() => verifyShadowSqliteDatabase(value.runtimeFile)).toThrow('Schema 版本不受支持')
      await expect(promoteShadowToRuntimeSqlite({
        shadowFile: value.shadowFile, outputFile: value.runtimeFile,
      })).rejects.toThrow('拒绝覆盖')
    } finally { value.runtime.close() }
  })

  it('matches JSON validation, mutations, histories, and private-field boundaries across all four stores', async () => {
    const value = await fixture()
    try {
      expect(await value.runtime.users.list()).toEqual(await value.json.users.list())
      expect(withoutEventIds(await value.runtime.lessons.listForAdmin()))
        .toEqual(withoutEventIds(await value.json.lessons.listForAdmin()))
      expect(normalizedCapabilityReviews(await value.runtime.capabilityReviews.list()))
        .toEqual(normalizedCapabilityReviews(await value.json.capabilityReviews.list()))
      expect(await value.runtime.modelSettings.get()).toEqual(await value.json.modelSettings.get())

      const [jsonUser, sqliteUser] = await Promise.all([
        value.json.users.create({ displayName: '新增用户', dailyCalls: 12, dailyTokens: 12_000 }),
        value.runtime.users.create({ displayName: '新增用户', dailyCalls: 12, dailyTokens: 12_000 }),
      ])
      expect(jsonUser.accessCode).toMatch(/^w2h-login-/)
      expect(sqliteUser.accessCode).toMatch(/^w2h-login-/)
      await value.json.users.update(jsonUser.user.id, { status: 'paused', dailyCalls: 8, dailyTokens: 8000 })
      await value.runtime.users.update(sqliteUser.user.id, { status: 'paused', dailyCalls: 8, dailyTokens: 8000 })
      const [jsonInvite, sqliteInvite] = await Promise.all([
        value.json.users.issueInvite(jsonUser.user.id),
        value.runtime.users.issueInvite(sqliteUser.user.id),
      ])
      await value.json.users.update(jsonUser.user.id, { status: 'active' })
      await value.runtime.users.update(sqliteUser.user.id, { status: 'active' })
      await expect(value.json.users.consumeInvite(jsonInvite.accessCode)).resolves.toMatchObject({ invitePending: false })
      await expect(value.runtime.users.consumeInvite(sqliteInvite.accessCode)).resolves.toMatchObject({ invitePending: false })
      expect(normalizedUsers(await value.runtime.users.list())).toEqual(normalizedUsers(await value.json.users.list()))
      expect(await rejectionMessage(() => value.runtime.users.update('missing', {})))
        .toBe(await rejectionMessage(() => value.json.users.update('missing', {})))

      const revision = lessonPackage('补充后的修改版本。', 14)
      const [jsonRevision, sqliteRevision] = await Promise.all([
        value.json.lessons.submit(revision, '../revision.json', value.initialLesson.entry.id),
        value.runtime.lessons.submit(revision, '../revision.json', value.initialLesson.entry.id),
      ])
      expect(sqliteRevision.entry.id).toBe(jsonRevision.entry.id)
      await value.json.lessons.completePreReview(jsonRevision.entry.id, noIssuesReview)
      await value.runtime.lessons.completePreReview(sqliteRevision.entry.id, noIssuesReview)
      await value.json.lessons.moderate(jsonRevision.entry.id, 'verified', '')
      await value.runtime.lessons.moderate(sqliteRevision.entry.id, 'verified', '')
      await value.json.lessons.queuePreReview(jsonRevision.entry.id)
      await value.runtime.lessons.queuePreReview(sqliteRevision.entry.id)
      expect(withoutEventIds(await value.runtime.lessons.listForAdmin()))
        .toEqual(withoutEventIds(await value.json.lessons.listForAdmin()))
      expect(await rejectionMessage(() => value.runtime.lessons.moderate('missing', 'verified', '')))
        .toBe(await rejectionMessage(() => value.json.lessons.moderate('missing', 'verified', '')))

      const capabilityInput = {
        status: 'needs-changes', reviewer: '复核人', reviewerRole: '教研员',
        reviewedVersion: 'word2html@0.1.1', reviewComment: '需要补充边界说明。',
        checks: { accuracy: true, boundaries: false },
      }
      await value.json.capabilityReviews.update('math.data.chart-2d', capabilityInput)
      await value.runtime.capabilityReviews.update('math.data.chart-2d', capabilityInput)
      expect(normalizedCapabilityReviews(await value.runtime.capabilityReviews.list()))
        .toEqual(normalizedCapabilityReviews(await value.json.capabilityReviews.list()))
      expect(await rejectionMessage(() => value.runtime.capabilityReviews.update('unknown', capabilityInput)))
        .toBe(await rejectionMessage(() => value.json.capabilityReviews.update('unknown', capabilityInput)))

      const modelInput = {
        enabledIds: ['runtime-review'], generationId: 'runtime-review', reviewId: 'runtime-review',
      }
      expect(await value.runtime.modelSettings.update(modelInput)).toEqual(await value.json.modelSettings.update(modelInput))
      expect(await value.runtime.modelSettings.publicOptions()).toEqual(await value.json.modelSettings.publicOptions())
      expect(await value.runtime.modelSettings.config('generation')).toMatchObject({
        catalogId: 'runtime-review', apiKey: 'runtime-review-secret',
      })
      expect(JSON.stringify(await value.runtime.modelSettings.get())).not.toContain('runtime-review-secret')

      const verified = value.runtime.verify()
      expect(verified.runtimeRevision).toBe(11)
      expect(verified.checks.reduce((sum, check) => sum + check.revision, 0)).toBe(11)
      const databaseBytes = (await readFile(value.runtimeFile)).toString('latin1')
      expect(databaseBytes).not.toContain(sqliteInvite.accessCode)
      expect(databaseBytes).not.toContain('runtime-review-secret')
    } finally { value.runtime.close() }
  })

  it('rolls back the table and revision tracker when a SQLite write fails midway', async () => {
    const value = await fixture()
    try {
      const beforeUsers = await value.runtime.users.list()
      const beforeVerification = value.runtime.verify()
      const database = new DatabaseSync(value.runtimeFile)
      database.exec(`
        CREATE TRIGGER reject_runtime_user
        BEFORE INSERT ON users WHEN NEW.display_name = '触发回滚'
        BEGIN SELECT RAISE(ABORT, 'forced runtime rollback'); END;
      `)
      database.close()
      await expect(value.runtime.users.create({ displayName: '触发回滚' })).rejects.toThrow('forced runtime rollback')
      expect(await value.runtime.users.list()).toEqual(beforeUsers)
      expect(value.runtime.verify().runtimeRevision).toBe(beforeVerification.runtimeRevision)
    } finally { value.runtime.close() }
  })

  it('serializes concurrent mutations within one runtime store instance without losing records', async () => {
    const value = await fixture()
    try {
      const before = value.runtime.verify()
      await Promise.all(Array.from({ length: 6 }, (_, index) => value.runtime.users.create({
        displayName: `并发用户 ${index + 1}`,
        dailyCalls: 10 + index,
        dailyTokens: 10_000 + index,
      })))
      const users = await value.runtime.users.list()
      expect(users.filter((user) => user.displayName.startsWith('并发用户 '))).toHaveLength(6)
      const after = value.runtime.verify()
      expect(after.runtimeRevision).toBe(before.runtimeRevision + 6)
      expect(after.checks.find((check) => check.format === 'word2html.user-directory')?.revision).toBe(6)
    } finally { value.runtime.close() }
  })
})
