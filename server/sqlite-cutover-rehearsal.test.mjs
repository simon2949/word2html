import { createHash } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDataBackup } from './data-backup.mjs'
import {
  SQLITE_CUTOVER_REHEARSAL_FORMAT,
  rehearseSqliteCutover,
} from './sqlite-cutover-rehearsal.mjs'
import { migrateBackupToShadowSqlite } from './sqlite-shadow-migration.mjs'
import { promoteShadowToRuntimeSqlite, verifyRuntimeSqliteDatabase } from './sqlite-runtime-store.mjs'
import { createUserDirectory } from './user-directory.mjs'

const fixedDate = '2026-08-30T17:00:00.000Z'

async function fixture() {
  const root = await mkdtemp('/tmp/word2html-cutover-rehearsal-test-')
  const source = join(root, 'source')
  const users = createUserDirectory({
    dataFile: join(source, 'users.json'),
    now: () => new Date(fixedDate),
  })
  const issued = await users.create({ displayName: '原候选库账号' })
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
  return { root, runtimeFile, issued }
}

describe('SQLite cutover rehearsal', () => {
  it('runs writes and fault injections on a disposable copy and archives a safe report', async () => {
    const value = await fixture()
    const beforeBytes = await readFile(value.runtimeFile)
    const beforeDigest = createHash('sha256').update(beforeBytes).digest('hex')
    const reportFile = join(value.root, 'reports', 'rehearsal.json')
    const result = await rehearseSqliteCutover({
      databaseFile: value.runtimeFile,
      reportFile,
      temporaryRoot: join(value.root, 'temporary'),
      now: () => new Date(fixedDate),
    })

    expect(result).toMatchObject({
      format: SQLITE_CUTOVER_REHEARSAL_FORMAT,
      formatVersion: '0.1',
      passed: true,
      productionActivationChanged: false,
      source: { fileName: 'runtime.sqlite', schemaVersion: 2, runtimeRevision: 0 },
      isolated: { runtimeRevision: 1, roundtripRuntimeRevision: 0 },
    })
    expect(result.checks.map((check) => check.id)).toEqual([
      'source-runtime-verified',
      'normal-mode-activation-guarded',
      'isolated-write-committed',
      'transaction-failure-rolled-back',
      'plaintext-credential-not-stored',
      'corrupted-runtime-rejected-at-startup',
      'runtime-json-export-reconciled',
      'json-restore-validated',
      'json-roundtrip-promoted',
      'source-runtime-unchanged',
    ])
    expect(result.checks.every((check) => check.passed)).toBe(true)
    expect(result.reportFile).toBe(reportFile)

    const stored = await readFile(reportFile, 'utf8')
    expect(JSON.parse(stored)).toMatchObject({ passed: true, productionActivationChanged: false })
    expect(stored).not.toContain(value.issued.accessCode)
    expect(stored).not.toMatch(/word2html-sqlite-cutover-|runtime-copy[.]sqlite|corrupted-runtime[.]sqlite|sha256|digest/i)

    const afterDigest = createHash('sha256').update(await readFile(value.runtimeFile)).digest('hex')
    expect(afterDigest).toBe(beforeDigest)
    expect(verifyRuntimeSqliteDatabase(value.runtimeFile).runtimeRevision).toBe(0)
  })

  it('refuses to overwrite an existing rehearsal report', async () => {
    const value = await fixture()
    const reportFile = join(value.root, 'report.json')
    await rehearseSqliteCutover({
      databaseFile: value.runtimeFile,
      reportFile,
      temporaryRoot: join(value.root, 'temporary-a'),
    })
    await expect(rehearseSqliteCutover({
      databaseFile: value.runtimeFile,
      reportFile,
      temporaryRoot: join(value.root, 'temporary-b'),
    })).rejects.toMatchObject({ code: 'EEXIST' })
  })
})
