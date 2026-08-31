import { createHash } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDataBackup } from './data-backup.mjs'
import { createLessonDirectory } from './lesson-directory.mjs'
import {
  runSqliteActiveHttpAcceptance,
  SQLITE_ACTIVE_HTTP_ACCEPTANCE_FORMAT,
} from './sqlite-active-http-acceptance.mjs'
import { migrateBackupToShadowSqlite } from './sqlite-shadow-migration.mjs'
import { promoteShadowToRuntimeSqlite, verifyRuntimeSqliteDatabase } from './sqlite-runtime-store.mjs'
import { createUserDirectory } from './user-directory.mjs'

const fixedDate = '2026-08-30T18:00:00.000Z'

function lessonPackage() {
  return {
    format: 'word2html.lesson-package', formatVersion: '0.1', kind: 'lesson-plan', apiVersion: 'lesson-plan-1.4',
    plan: {
      schemaVersion: '0.1', status: 'matched', subject: 'math', topic: 'SQLite active HTTP 验收椭圆',
      templateId: 'math.conic.ellipse-focus-sum',
      parameterOverrides: { majorAxis: 12, minorAxis: 8 }, reason: '用于隔离 HTTP 写入验收。',
    },
  }
}

async function fixture() {
  const root = await mkdtemp('/tmp/word2html-sqlite-active-http-test-')
  const source = join(root, 'source')
  const users = createUserDirectory({ dataFile: join(source, 'users.json'), now: () => new Date(fixedDate) })
  await users.create({ displayName: '源候选账号' })
  const lessons = createLessonDirectory({ dataFile: join(source, 'lessons.json'), now: () => fixedDate })
  await lessons.submit(lessonPackage(), 'active-http.json')
  const backup = await createDataBackup({
    sourceDirectory: source,
    backupRoot: join(root, 'backups'),
    now: () => new Date(fixedDate),
  })
  const shadowFile = join(root, 'shadow.sqlite')
  const runtimeFile = join(root, 'runtime.sqlite')
  await migrateBackupToShadowSqlite({
    backupDirectory: backup.directory,
    outputFile: shadowFile,
    now: () => new Date(fixedDate),
  })
  await promoteShadowToRuntimeSqlite({
    shadowFile,
    outputFile: runtimeFile,
    now: () => new Date(fixedDate),
  })
  return { root, runtimeFile }
}

describe('SQLite active HTTP acceptance', () => {
  it('writes all four stores through real HTTP and boots the exported JSON rollback', async () => {
    const value = await fixture()
    const beforeDigest = createHash('sha256').update(await readFile(value.runtimeFile)).digest('hex')
    const reportFile = join(value.root, 'reports', 'active-http.json')
    let result
    try {
      result = await runSqliteActiveHttpAcceptance({
        databaseFile: value.runtimeFile,
        reportFile,
        temporaryRoot: join(value.root, 'temporary'),
        now: () => new Date(fixedDate),
      })
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'EPERM') return
      throw error
    }
    expect(result).toMatchObject({
      format: SQLITE_ACTIVE_HTTP_ACCEPTANCE_FORMAT,
      formatVersion: '0.1',
      passed: true,
      sourceRuntimeChanged: false,
      productionTrafficChanged: false,
      isolated: {
        runtimeRevisionBefore: 0,
        runtimeRevisionAfter: 5,
        committedWrites: 5,
      },
    })
    expect(result.checks.map((check) => check.id)).toEqual([
      'source-runtime-verified',
      'active-service-started',
      'active-service-ready',
      'admin-session-established',
      'operational-alert-status-safe',
      'model-settings-http-write',
      'user-create-and-login-http-write',
      'authenticated-shared-submission',
      'lesson-moderation-http-write',
      'capability-review-http-write',
      'active-admin-status-safe',
      'http-write-revisions-accounted',
      'active-runtime-export-and-restore',
      'json-rollback-service-ready',
      'source-runtime-unchanged',
    ])
    expect(result.checks.every((check) => check.passed)).toBe(true)
    const stored = await readFile(reportFile, 'utf8')
    expect(stored).not.toMatch(/acceptance-key-never-exported|w2h-login-|sqlite-http-admin-|runtime-copy[.]sqlite|127[.]0[.]0[.]1/)
    const afterDigest = createHash('sha256').update(await readFile(value.runtimeFile)).digest('hex')
    expect(afterDigest).toBe(beforeDigest)
    expect(verifyRuntimeSqliteDatabase(value.runtimeFile).runtimeRevision).toBe(0)
  }, 20_000)
})
