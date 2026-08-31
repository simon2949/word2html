import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  CAPABILITY_REVIEW_FORMAT,
  CAPABILITY_REVIEW_VERSION,
  normalizeCapabilityReviewDocument,
} from './capability-subject-reviews.mjs'
import { createDataBackup, verifyDataBackup } from './data-backup.mjs'
import { validateWord2HtmlDataDirectory } from './data-restore.mjs'
import { LESSON_DIRECTORY_FORMAT, LESSON_DIRECTORY_VERSION } from './lesson-directory.mjs'
import { MODEL_SETTINGS_FORMAT } from './model-settings.mjs'
import { documentRecords, recordsDigest, targetSnapshot } from './sqlite-shadow-migration.mjs'
import {
  SQLITE_RUNTIME_ROLE,
  verifyRuntimeSqliteDatabase,
} from './sqlite-runtime-store.mjs'
import { USER_DIRECTORY_FORMAT, USER_DIRECTORY_VERSION } from './user-directory.mjs'

const EXPORT_FILES = Object.freeze({
  [USER_DIRECTORY_FORMAT]: 'users.json',
  [LESSON_DIRECTORY_FORMAT]: 'lesson-directory.json',
  [CAPABILITY_REVIEW_FORMAT]: 'capability-subject-reviews.json',
  [MODEL_SETTINGS_FORMAT]: 'model-settings.json',
})

const REQUIRED_FORMATS = Object.freeze([
  USER_DIRECTORY_FORMAT,
  LESSON_DIRECTORY_FORMAT,
  CAPABILITY_REVIEW_FORMAT,
])

const ALL_FORMATS = Object.freeze([...REQUIRED_FORMATS, MODEL_SETTINGS_FORMAT])

function currentCapabilityDocument(records) {
  const usesCurrentFields = records.every((record) => (
    typeof record?.reviewComment === 'string' &&
    (!Array.isArray(record.history) || record.history.every((event) => typeof event?.reviewComment === 'string'))
  ))
  return normalizeCapabilityReviewDocument({
    format: CAPABILITY_REVIEW_FORMAT,
    formatVersion: usesCurrentFields ? CAPABILITY_REVIEW_VERSION : '0.1',
    records,
  })
}

function documentFromSnapshot(format, records) {
  if (format === USER_DIRECTORY_FORMAT) {
    return { format, formatVersion: USER_DIRECTORY_VERSION, users: records }
  }
  if (format === LESSON_DIRECTORY_FORMAT) {
    return { format, formatVersion: LESSON_DIRECTORY_VERSION, entries: records }
  }
  if (format === CAPABILITY_REVIEW_FORMAT) return currentCapabilityDocument(records)
  if (format === MODEL_SETTINGS_FORMAT) return records[0]
  throw new Error(`SQLite JSON 导出不支持业务格式：${format}`)
}

function historyCount(format, records) {
  if (format === LESSON_DIRECTORY_FORMAT) {
    return records.reduce((sum, record) => sum + (Array.isArray(record.reviewHistory) ? record.reviewHistory.length : 0), 0)
  }
  if (format === CAPABILITY_REVIEW_FORMAT) {
    return records.reduce((sum, record) => sum + (Array.isArray(record.history) ? record.history.length : 0), 0)
  }
  return 0
}

function sameRuntimeState(before, after) {
  if (
    before.schemaVersion !== after.schemaVersion ||
    before.storageRole !== after.storageRole ||
    before.promotedAt !== after.promotedAt ||
    before.runtimeRevision !== after.runtimeRevision
  ) return false
  const compact = (value) => value.checks.map((check) => ({
    format: check.format,
    revision: check.revision,
    records: check.records,
    history: check.history,
  }))
  return recordsDigest(compact(before)) === recordsDigest(compact(after))
}

function readConsistentRuntimeState(databaseFile) {
  const before = verifyRuntimeSqliteDatabase(databaseFile)
  const database = new DatabaseSync(before.databaseFile, { readOnly: true })
  let committed = false
  let snapshots
  try {
    database.exec('BEGIN')
    snapshots = Object.fromEntries(ALL_FORMATS.map((format) => {
      const snapshot = targetSnapshot(database, format)
      if (!snapshot.normalized) throw new Error(`SQLite 运行库 ${format} 规范化字段校验失败。`)
      return [format, snapshot]
    }))
    database.exec('COMMIT')
    committed = true
  } finally {
    if (!committed) {
      try { database.exec('ROLLBACK') } catch { /* The read transaction may not have started. */ }
    }
    database.close()
  }
  const after = verifyRuntimeSqliteDatabase(databaseFile)
  if (!sameRuntimeState(before, after)) throw new Error('SQLite 运行库在导出期间发生变化，请在维护模式下重试。')
  return { verification: after, snapshots }
}

async function backupDocuments(backupDirectory) {
  const result = new Map()
  const backup = await verifyDataBackup(backupDirectory)
  for (const file of backup.manifest.files) {
    const document = JSON.parse(await readFile(join(backup.directory, file.name), 'utf8'))
    if (result.has(document.format)) throw new Error(`SQLite JSON 导出包含重复业务格式：${document.format}`)
    result.set(document.format, document)
  }
  return { backup, documents: result }
}

function assertBoundRuntimeSource(manifest, runtime) {
  const source = manifest.sourceRuntime
  if (!source) throw new Error('JSON 导出备份没有绑定 SQLite 运行库来源。')
  if (
    source.storageRole !== SQLITE_RUNTIME_ROLE ||
    source.schemaVersion !== runtime.schemaVersion ||
    source.runtimeRevision !== runtime.runtimeRevision ||
    source.promotedAt !== runtime.promotedAt
  ) throw new Error('JSON 导出备份绑定的 SQLite 运行库版本或修订号不匹配。')
}

export async function verifyRuntimeJsonExport({
  databaseFile,
  backupDirectory,
  environment = process.env,
} = {}) {
  if (!databaseFile || !backupDirectory) throw new Error('SQLite JSON 导出校验参数不完整。')
  const runtime = readConsistentRuntimeState(databaseFile)
  const exported = await backupDocuments(backupDirectory)
  assertBoundRuntimeSource(exported.backup.manifest, runtime.verification)
  await validateWord2HtmlDataDirectory(exported.backup.directory, { environment })

  for (const format of REQUIRED_FORMATS) {
    if (!exported.documents.has(format)) throw new Error(`JSON 导出缺少业务格式：${format}`)
  }
  const unknownFormats = [...exported.documents.keys()].filter((format) => !ALL_FORMATS.includes(format))
  if (unknownFormats.length > 0) throw new Error(`JSON 导出包含未知业务格式：${unknownFormats.join('、')}`)

  const checks = ALL_FORMATS.map((format) => {
    const runtimeDocument = documentFromSnapshot(format, runtime.snapshots[format].records)
    const exportedDocument = exported.documents.get(format)
    if (!runtimeDocument && exportedDocument) throw new Error('SQLite 没有持久化模型设置，但 JSON 导出包含模型设置文件。')
    if (runtimeDocument && !exportedDocument) throw new Error(`JSON 导出缺少业务格式：${format}`)
    const runtimeRecords = runtimeDocument ? documentRecords(runtimeDocument) : []
    const exportedRecords = exportedDocument ? documentRecords(exportedDocument) : []
    const expectedHistory = historyCount(format, runtimeRecords)
    const actualHistory = historyCount(format, exportedRecords)
    const passed = runtimeRecords.length === exportedRecords.length &&
      expectedHistory === actualHistory && recordsDigest(runtimeRecords) === recordsDigest(exportedRecords)
    if (!passed) throw new Error(`SQLite 与 JSON 导出的业务数据不一致：${format}`)
    return {
      format,
      records: exportedRecords.length,
      history: actualHistory,
      passed: true,
    }
  })
  return {
    ok: true,
    databaseFile: runtime.verification.databaseFile,
    backupDirectory: exported.backup.directory,
    schemaVersion: runtime.verification.schemaVersion,
    runtimeRevision: runtime.verification.runtimeRevision,
    checks,
  }
}

export async function exportRuntimeSqliteToJsonBackup({
  databaseFile,
  backupRoot,
  environment = process.env,
  now = () => new Date(),
} = {}) {
  if (!databaseFile || !backupRoot) throw new Error('SQLite JSON 导出参数不完整。')
  const runtime = readConsistentRuntimeState(databaseFile)
  const exportedAt = now()
  if (!(exportedAt instanceof Date) || Number.isNaN(exportedAt.getTime())) throw new Error('SQLite JSON 导出时钟无效。')
  const root = resolve(backupRoot)
  await mkdir(root, { recursive: true })
  const stagingDirectory = await mkdtemp(join(tmpdir(), 'word2html-sqlite-export-'))
  let createdDirectory
  try {
    for (const format of ALL_FORMATS) {
      const document = documentFromSnapshot(format, runtime.snapshots[format].records)
      if (!document) continue
      await writeFile(
        join(stagingDirectory, EXPORT_FILES[format]),
        `${JSON.stringify(document, null, 2)}\n`,
        { flag: 'wx', mode: 0o600 },
      )
    }
    await validateWord2HtmlDataDirectory(stagingDirectory, { environment })
    const created = await createDataBackup({
      sourceDirectory: stagingDirectory,
      backupRoot: root,
      now: () => new Date(exportedAt.getTime()),
      sourceRuntime: {
        storageRole: runtime.verification.storageRole,
        schemaVersion: runtime.verification.schemaVersion,
        runtimeRevision: runtime.verification.runtimeRevision,
        promotedAt: runtime.verification.promotedAt,
      },
    })
    createdDirectory = created.directory
    const verified = await verifyRuntimeJsonExport({
      databaseFile: runtime.verification.databaseFile,
      backupDirectory: created.directory,
      environment,
    })
    return { ...verified, manifest: created.manifest }
  } catch (error) {
    if (createdDirectory) {
      try { await rm(createdDirectory, { recursive: true, force: true }) } catch { /* Do not retain an unverified export. */ }
    }
    throw error
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true })
  }
}
