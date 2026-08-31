import { createHash, randomBytes } from 'node:crypto'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { validateWord2HtmlDataDirectory, restoreDataBackup } from './data-restore.mjs'
import {
  exportRuntimeSqliteToJsonBackup,
  verifyRuntimeJsonExport,
} from './sqlite-runtime-export.mjs'
import { migrateBackupToShadowSqlite } from './sqlite-shadow-migration.mjs'
import {
  createSqliteRuntimeStore,
  promoteShadowToRuntimeSqlite,
  verifyRuntimeSqliteDatabase,
} from './sqlite-runtime-store.mjs'
import { createConfiguredStorageBackend } from './storage-backend.mjs'

export const SQLITE_CUTOVER_REHEARSAL_FORMAT = 'word2html.sqlite-cutover-rehearsal'
export const SQLITE_CUTOVER_REHEARSAL_VERSION = '0.1'

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function timestamp(now) {
  const value = now()
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error('SQLite 切换演练时钟无效。')
  return value.toISOString()
}

function storageStubs() {
  return { users: {}, lessons: {}, capabilityReviews: {}, modelSettings: {} }
}

async function rejection(operation, expected) {
  try {
    const value = await operation()
    value?.close?.()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (expected.test(message)) return message
    throw error
  }
  throw new Error('故障注入未被预期的安全边界拒绝。')
}

function comparableChecks(verification) {
  return verification.checks.map((check) => ({
    format: check.format,
    records: check.records,
    history: check.history,
  }))
}

async function writeReport(reportFile, report) {
  if (!reportFile) return undefined
  const file = resolve(reportFile)
  if (!file.endsWith('.json')) throw new Error('SQLite 切换演练报告必须使用 .json 扩展名。')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  const stored = JSON.parse(await readFile(file, 'utf8'))
  if (stored.format !== SQLITE_CUTOVER_REHEARSAL_FORMAT || stored.passed !== true) {
    throw new Error('SQLite 切换演练报告写入后复验失败。')
  }
  return file
}

export async function rehearseSqliteCutover({
  databaseFile,
  reportFile,
  environment = process.env,
  now = () => new Date(),
  temporaryRoot = tmpdir(),
} = {}) {
  if (!databaseFile) throw new Error('请提供需要演练的 SQLite 运行库。')
  const sourceFile = resolve(databaseFile)
  const sourceBeforeBytes = await readFile(sourceFile)
  const sourceBeforeDigest = sha256(sourceBeforeBytes)
  const source = verifyRuntimeSqliteDatabase(sourceFile)
  const workspaceParent = resolve(temporaryRoot)
  await mkdir(workspaceParent, { recursive: true })
  const workspace = await mkdtemp(join(workspaceParent, 'word2html-sqlite-cutover-'))
  const runtimeCopy = join(workspace, 'runtime-copy.sqlite')
  const checks = [{ id: 'source-runtime-verified', passed: true }]
  let isolatedAfterWrite
  let exportResult
  let roundtrip

  try {
    await copyFile(sourceFile, runtimeCopy)
    await chmod(runtimeCopy, 0o600)

    await rejection(() => createConfiguredStorageBackend({
      name: 'sqlite',
      jsonStores: storageStubs(),
      sqliteRuntimeFile: runtimeCopy,
      environment,
      maintenanceMode: false,
    }), /非维护运行必须显式设置/)
    checks.push({ id: 'normal-mode-activation-guarded', passed: true })

    const runtime = createSqliteRuntimeStore({ databaseFile: runtimeCopy, environment, now })
    let issuedAccessCode
    try {
      const beforeWrite = runtime.verify()
      const issued = await runtime.users.create({
        displayName: 'SQLite 切换演练临时账号',
        dailyCalls: 3,
        dailyTokens: 3000,
      })
      issuedAccessCode = issued.accessCode
      isolatedAfterWrite = runtime.verify()
      if (isolatedAfterWrite.runtimeRevision !== beforeWrite.runtimeRevision + 1) {
        throw new Error('隔离写入后 SQLite 全局修订号没有按预期递增。')
      }
      checks.push({
        id: 'isolated-write-committed',
        passed: true,
        revisionBefore: beforeWrite.runtimeRevision,
        revisionAfter: isolatedAfterWrite.runtimeRevision,
      })

      const injector = new DatabaseSync(runtimeCopy)
      try {
        injector.exec(`
          CREATE TRIGGER rehearsal_reject_user
          BEFORE INSERT ON users WHEN NEW.display_name = 'SQLite 强制失败账号'
          BEGIN SELECT RAISE(ABORT, 'forced rehearsal rollback'); END;
        `)
      } finally { injector.close() }
      const beforeFailure = runtime.verify()
      const usersBeforeFailure = await runtime.users.list()
      await rejection(
        () => runtime.users.create({ displayName: 'SQLite 强制失败账号' }),
        /forced rehearsal rollback/,
      )
      const afterFailure = runtime.verify()
      const usersAfterFailure = await runtime.users.list()
      if (
        afterFailure.runtimeRevision !== beforeFailure.runtimeRevision ||
        JSON.stringify(usersAfterFailure) !== JSON.stringify(usersBeforeFailure)
      ) throw new Error('SQLite 强制写入失败后，业务记录或修订号没有完整回滚。')
      checks.push({ id: 'transaction-failure-rolled-back', passed: true })

      const cleanup = new DatabaseSync(runtimeCopy)
      try { cleanup.exec('DROP TRIGGER rehearsal_reject_user') } finally { cleanup.close() }
    } finally { runtime.close() }

    if ((await readFile(runtimeCopy)).toString('latin1').includes(issuedAccessCode)) {
      throw new Error('SQLite 隔离写入泄露了一次性登录码原文。')
    }
    checks.push({ id: 'plaintext-credential-not-stored', passed: true })

    const corruptedCopy = join(workspace, 'corrupted-runtime.sqlite')
    await copyFile(runtimeCopy, corruptedCopy)
    const corrupted = new DatabaseSync(corruptedCopy)
    try {
      corrupted.exec(`
        UPDATE users SET display_name = '被故障注入篡改'
        WHERE id = (SELECT id FROM users ORDER BY source_index LIMIT 1)
      `)
    } finally { corrupted.close() }
    await rejection(() => createConfiguredStorageBackend({
      name: 'sqlite',
      jsonStores: storageStubs(),
      sqliteRuntimeFile: corruptedCopy,
      environment,
      maintenanceMode: true,
    }), /状态校验失败|规范化字段校验失败/)
    checks.push({ id: 'corrupted-runtime-rejected-at-startup', passed: true })

    exportResult = await exportRuntimeSqliteToJsonBackup({
      databaseFile: runtimeCopy,
      backupRoot: join(workspace, 'exports'),
      environment,
      now,
    })
    await verifyRuntimeJsonExport({
      databaseFile: runtimeCopy,
      backupDirectory: exportResult.backupDirectory,
      environment,
    })
    checks.push({ id: 'runtime-json-export-reconciled', passed: true })

    const restoredDirectory = join(workspace, 'restored-json')
    await restoreDataBackup({
      backupDirectory: exportResult.backupDirectory,
      targetDirectory: restoredDirectory,
      rollbackBackupRoot: join(workspace, 'restore-rollbacks'),
      maintenanceConfirmed: true,
      environment,
    })
    await validateWord2HtmlDataDirectory(restoredDirectory, { environment })
    checks.push({ id: 'json-restore-validated', passed: true })

    const roundtripShadow = join(workspace, 'roundtrip-shadow.sqlite')
    const roundtripRuntime = join(workspace, 'roundtrip-runtime.sqlite')
    await migrateBackupToShadowSqlite({
      backupDirectory: exportResult.backupDirectory,
      outputFile: roundtripShadow,
      environment,
      now,
    })
    await promoteShadowToRuntimeSqlite({
      shadowFile: roundtripShadow,
      outputFile: roundtripRuntime,
      now,
    })
    roundtrip = verifyRuntimeSqliteDatabase(roundtripRuntime)
    if (JSON.stringify(comparableChecks(roundtrip)) !== JSON.stringify(comparableChecks(isolatedAfterWrite))) {
      throw new Error('JSON 回导后再晋升的 SQLite 记录或历史数量不一致。')
    }
    checks.push({ id: 'json-roundtrip-promoted', passed: true })

    const sourceAfterDigest = sha256(await readFile(sourceFile))
    if (sourceAfterDigest !== sourceBeforeDigest) throw new Error('切换演练意外修改了源 SQLite 运行库。')
    checks.push({ id: 'source-runtime-unchanged', passed: true })

    const report = {
      format: SQLITE_CUTOVER_REHEARSAL_FORMAT,
      formatVersion: SQLITE_CUTOVER_REHEARSAL_VERSION,
      createdAt: timestamp(now),
      source: {
        fileName: basename(sourceFile),
        schemaVersion: source.schemaVersion,
        runtimeRevision: source.runtimeRevision,
      },
      isolated: {
        runtimeRevision: isolatedAfterWrite.runtimeRevision,
        exportedRecords: exportResult.checks.reduce((sum, check) => sum + check.records, 0),
        exportedHistory: exportResult.checks.reduce((sum, check) => sum + check.history, 0),
        roundtripRuntimeRevision: roundtrip.runtimeRevision,
      },
      checks,
      passed: checks.every((check) => check.passed),
      productionActivationChanged: false,
    }
    const storedReportFile = await writeReport(reportFile, report)
    return { ...report, reportFile: storedReportFile }
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}
