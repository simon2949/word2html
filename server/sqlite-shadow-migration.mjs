import { createHash, randomBytes } from 'node:crypto'
import { lstat, mkdir, readFile, rename } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CAPABILITY_REVIEW_FORMAT } from './capability-subject-reviews.mjs'
import { verifyDataBackup } from './data-backup.mjs'
import { validateWord2HtmlDataDirectory } from './data-restore.mjs'
import { LESSON_DIRECTORY_FORMAT } from './lesson-directory.mjs'
import { MODEL_SETTINGS_FORMAT } from './model-settings.mjs'
import { USER_DIRECTORY_FORMAT } from './user-directory.mjs'

export const SQLITE_APPLICATION_ID = 0x57324854
export const SQLITE_SCHEMA_VERSION = 1
export const SQLITE_MIGRATION_REPORT_FORMAT = 'word2html.sqlite-migration-report'
export const SQLITE_MIGRATION_REPORT_VERSION = '0.1'

export const FORMAT_TABLE = Object.freeze({
  [USER_DIRECTORY_FORMAT]: 'users',
  [LESSON_DIRECTORY_FORMAT]: 'lesson_entries',
  [CAPABILITY_REVIEW_FORMAT]: 'capability_reviews',
  [MODEL_SETTINGS_FORMAT]: 'model_settings',
})

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

export function recordsDigest(records) {
  return sha256(JSON.stringify(canonicalize(records)))
}

function text(value) {
  return typeof value === 'string' ? value : null
}

function json(value, fallback) {
  return JSON.stringify(value === undefined ? fallback : value)
}

function jsonEqual(encoded, value, fallback) {
  try { return recordsDigest([JSON.parse(encoded)]) === recordsDigest([value === undefined ? fallback : value]) } catch { return false }
}

export function documentRecords(value) {
  if (value.format === USER_DIRECTORY_FORMAT) return value.users
  if (value.format === LESSON_DIRECTORY_FORMAT) return value.entries
  if (value.format === CAPABILITY_REVIEW_FORMAT) return value.records
  if (value.format === MODEL_SETTINGS_FORMAT) return [value]
  throw new Error(`SQLite 迁移不支持业务格式：${value.format}`)
}

function sourceHistoryCount(format, records) {
  if (format === LESSON_DIRECTORY_FORMAT) {
    return records.reduce((sum, record) => sum + (Array.isArray(record.reviewHistory) ? record.reviewHistory.length : 0), 0)
  }
  if (format === CAPABILITY_REVIEW_FORMAT) {
    return records.reduce((sum, record) => sum + (Array.isArray(record.history) ? record.history.length : 0), 0)
  }
  return 0
}

function createSchema(database) {
  database.exec(`
    PRAGMA application_id = ${SQLITE_APPLICATION_ID};
    PRAGMA user_version = ${SQLITE_SCHEMA_VERSION};
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;

    CREATE TABLE word2html_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;

    CREATE TABLE source_documents (
      format TEXT PRIMARY KEY,
      format_version TEXT NOT NULL,
      source_file TEXT NOT NULL UNIQUE,
      source_bytes INTEGER NOT NULL CHECK(source_bytes >= 0),
      source_sha256 TEXT NOT NULL CHECK(length(source_sha256) = 64),
      records_sha256 TEXT NOT NULL CHECK(length(records_sha256) = 64),
      record_count INTEGER NOT NULL CHECK(record_count >= 0),
      history_count INTEGER NOT NULL CHECK(history_count >= 0)
    ) STRICT;

    CREATE TABLE users (
      source_index INTEGER NOT NULL UNIQUE,
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'paused')),
      daily_calls INTEGER NOT NULL,
      daily_tokens INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT,
      invite_digest TEXT,
      invite_created_at TEXT,
      invite_expires_at TEXT,
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64)
    ) STRICT;

    CREATE TABLE lesson_entries (
      source_index INTEGER NOT NULL UNIQUE,
      id TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      review_status TEXT NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      summary TEXT NOT NULL,
      source_filename TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reviewed_at TEXT,
      revision_of TEXT,
      superseded_by TEXT,
      review_note TEXT,
      history_count INTEGER NOT NULL CHECK(history_count >= 0),
      lesson_package_json TEXT NOT NULL CHECK(json_valid(lesson_package_json)),
      pre_review_json TEXT CHECK(pre_review_json IS NULL OR json_valid(pre_review_json)),
      review_history_json TEXT NOT NULL CHECK(json_valid(review_history_json)),
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64)
    ) STRICT;

    CREATE TABLE capability_reviews (
      source_index INTEGER NOT NULL UNIQUE,
      capability_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      reviewer TEXT NOT NULL,
      reviewer_role TEXT NOT NULL,
      reviewed_version TEXT NOT NULL,
      review_comment TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reviewed_at TEXT,
      history_count INTEGER NOT NULL CHECK(history_count >= 0),
      checks_json TEXT NOT NULL CHECK(json_valid(checks_json)),
      history_json TEXT NOT NULL CHECK(json_valid(history_json)),
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64)
    ) STRICT;

    CREATE TABLE model_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      format_version TEXT NOT NULL,
      enabled_ids_json TEXT NOT NULL CHECK(json_valid(enabled_ids_json)),
      generation_id TEXT NOT NULL,
      review_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64)
    ) STRICT;

    CREATE TABLE migration_audits (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      report_json TEXT NOT NULL CHECK(json_valid(report_json)),
      report_sha256 TEXT NOT NULL CHECK(length(report_sha256) = 64)
    ) STRICT;
  `)
}

export function insertRecords(database, format, records) {
  if (format === USER_DIRECTORY_FORMAT) {
    const statement = database.prepare(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    records.forEach((record, index) => {
      const payload = json(record, {})
      statement.run(
        index, record.id, record.displayName, record.status,
        record.quota.dailyCalls, record.quota.dailyTokens,
        record.createdAt, record.updatedAt, text(record.lastLoginAt),
        text(record.invite?.digest), text(record.invite?.createdAt), text(record.invite?.expiresAt),
        payload, sha256(payload),
      )
    })
    return
  }
  if (format === LESSON_DIRECTORY_FORMAT) {
    const statement = database.prepare(`INSERT INTO lesson_entries VALUES (${Array(20).fill('?').join(', ')})`)
    records.forEach((record, index) => {
      const history = Array.isArray(record.reviewHistory) ? record.reviewHistory : []
      const payload = json(record, {})
      statement.run(
        index, record.id, record.contentHash, record.reviewStatus, record.title, record.subject,
        record.summary, text(record.sourceFilename), record.createdAt, record.updatedAt,
        text(record.reviewedAt), text(record.revisionOf), text(record.supersededBy), text(record.reviewNote),
        history.length, json(record.lessonPackage, {}), record.preReview === undefined ? null : json(record.preReview, {}),
        json(history, []), payload, sha256(payload),
      )
    })
    return
  }
  if (format === CAPABILITY_REVIEW_FORMAT) {
    const statement = database.prepare(`INSERT INTO capability_reviews VALUES (${Array(14).fill('?').join(', ')})`)
    records.forEach((record, index) => {
      const history = Array.isArray(record.history) ? record.history : []
      const payload = json(record, {})
      statement.run(
        index, record.capabilityId, record.status,
        text(record.reviewer) ?? '', text(record.reviewerRole) ?? '', text(record.reviewedVersion) ?? '',
        text(record.reviewComment) ?? text(record.findings) ?? '', text(record.updatedAt) ?? '',
        text(record.reviewedAt), history.length, json(record.checks, {}), json(history, []),
        payload, sha256(payload),
      )
    })
    return
  }
  if (format === MODEL_SETTINGS_FORMAT) {
    const record = records[0]
    const payload = json(record, {})
    database.prepare(`INSERT INTO model_settings VALUES (1, ?, ?, ?, ?, ?, ?, ?)`).run(
      record.formatVersion, json(record.enabledIds, []), record.generationId,
      record.reviewId, record.updatedAt, payload, sha256(payload),
    )
    return
  }
  throw new Error(`SQLite 迁移不支持业务格式：${format}`)
}

function normalizedRowMatches(format, row, payload) {
  if (sha256(row.payload_json) !== row.payload_sha256) return false
  if (format === USER_DIRECTORY_FORMAT) {
    return row.id === payload.id && row.display_name === payload.displayName && row.status === payload.status
      && row.daily_calls === payload.quota.dailyCalls && row.daily_tokens === payload.quota.dailyTokens
      && row.created_at === payload.createdAt && row.updated_at === payload.updatedAt
      && row.last_login_at === (payload.lastLoginAt ?? null)
      && row.invite_digest === (payload.invite?.digest ?? null)
      && row.invite_created_at === (payload.invite?.createdAt ?? null)
      && row.invite_expires_at === (payload.invite?.expiresAt ?? null)
  }
  if (format === LESSON_DIRECTORY_FORMAT) {
    const history = Array.isArray(payload.reviewHistory) ? payload.reviewHistory : []
    return row.id === payload.id && row.content_hash === payload.contentHash
      && row.review_status === payload.reviewStatus && row.title === payload.title
      && row.subject === payload.subject && row.summary === payload.summary
      && row.source_filename === (payload.sourceFilename ?? null)
      && row.created_at === payload.createdAt && row.updated_at === payload.updatedAt
      && row.reviewed_at === (payload.reviewedAt ?? null) && row.revision_of === (payload.revisionOf ?? null)
      && row.superseded_by === (payload.supersededBy ?? null) && row.review_note === (payload.reviewNote ?? null)
      && row.history_count === history.length
      && jsonEqual(row.lesson_package_json, payload.lessonPackage, {})
      && (payload.preReview === undefined ? row.pre_review_json === null : jsonEqual(row.pre_review_json, payload.preReview, {}))
      && jsonEqual(row.review_history_json, history, [])
  }
  if (format === CAPABILITY_REVIEW_FORMAT) {
    const history = Array.isArray(payload.history) ? payload.history : []
    return row.capability_id === payload.capabilityId && row.status === payload.status
      && row.reviewer === (payload.reviewer ?? '') && row.reviewer_role === (payload.reviewerRole ?? '')
      && row.reviewed_version === (payload.reviewedVersion ?? '')
      && row.review_comment === (payload.reviewComment ?? payload.findings ?? '')
      && row.updated_at === (payload.updatedAt ?? '') && row.reviewed_at === (payload.reviewedAt ?? null)
      && row.history_count === history.length && jsonEqual(row.checks_json, payload.checks, {})
      && jsonEqual(row.history_json, history, [])
  }
  if (format === MODEL_SETTINGS_FORMAT) {
    return row.id === 1 && row.format_version === payload.formatVersion
      && jsonEqual(row.enabled_ids_json, payload.enabledIds, [])
      && row.generation_id === payload.generationId && row.review_id === payload.reviewId
      && row.updated_at === payload.updatedAt
  }
  return false
}

export function targetSnapshot(database, format) {
  const table = FORMAT_TABLE[format]
  if (!table) throw new Error(`SQLite 审计不支持业务格式：${format}`)
  const orderBy = table === 'model_settings' ? 'id' : 'source_index'
  const rows = database.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all()
  const records = rows.map((row) => JSON.parse(row.payload_json))
  const normalized = rows.every((row, index) => normalizedRowMatches(format, row, records[index]))
  const historyCount = ['lesson_entries', 'capability_reviews'].includes(table)
    ? Number(database.prepare(`SELECT COALESCE(SUM(history_count), 0) AS total FROM ${table}`).get().total)
    : 0
  return { records, historyCount, normalized }
}

function auditDocuments(database) {
  return database.prepare('SELECT * FROM source_documents ORDER BY format').all().map((source) => {
    const target = targetSnapshot(database, source.format)
    const targetDigest = recordsDigest(target.records)
    const targetRecords = target.records.length
    const passed = targetRecords === source.record_count
      && target.historyCount === source.history_count
      && targetDigest === source.records_sha256
      && target.normalized
    return {
      format: source.format,
      formatVersion: source.format_version,
      sourceFile: source.source_file,
      sourceRecords: source.record_count,
      targetRecords,
      sourceHistory: source.history_count,
      targetHistory: target.historyCount,
      sourceDigest: source.records_sha256,
      targetDigest,
      normalizedColumns: target.normalized,
      passed,
    }
  })
}

export function integrity(database) {
  const rows = database.prepare('PRAGMA integrity_check').all()
  return rows.length === 1 && rows[0].integrity_check === 'ok'
}

export function verifyShadowSqliteDatabase(databaseFile) {
  const file = resolve(databaseFile)
  const database = new DatabaseSync(file, { readOnly: true })
  try {
    const applicationId = Number(database.prepare('PRAGMA application_id').get().application_id)
    const schemaVersion = Number(database.prepare('PRAGMA user_version').get().user_version)
    if (applicationId !== SQLITE_APPLICATION_ID) throw new Error('SQLite 文件不是 Word2HTML 数据库。')
    if (schemaVersion !== SQLITE_SCHEMA_VERSION) throw new Error('SQLite Schema 版本不受支持。')
    if (!integrity(database)) throw new Error('SQLite 完整性检查失败。')
    const stored = database.prepare('SELECT report_json, report_sha256 FROM migration_audits ORDER BY created_at DESC LIMIT 1').get()
    if (!stored || sha256(stored.report_json) !== stored.report_sha256) throw new Error('SQLite 迁移报告摘要无效。')
    const report = JSON.parse(stored.report_json)
    if (
      report.format !== SQLITE_MIGRATION_REPORT_FORMAT ||
      report.formatVersion !== SQLITE_MIGRATION_REPORT_VERSION ||
      report.schemaVersion !== SQLITE_SCHEMA_VERSION
    ) throw new Error('SQLite 迁移报告格式无效。')
    const checks = auditDocuments(database)
    if (checks.length === 0 || checks.some((check) => !check.passed)) throw new Error('SQLite 数据对账失败。')
    if (recordsDigest(checks) !== recordsDigest(report.checks)) throw new Error('SQLite 迁移报告与当前数据不一致。')
    return { ok: true, databaseFile: file, schemaVersion, checks, report }
  } finally {
    database.close()
  }
}

async function refuseExistingOutput(output) {
  try {
    await lstat(output)
    throw new Error(`SQLite 输出文件已存在，拒绝覆盖：${output}`)
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return
    throw error
  }
}

export async function migrateBackupToShadowSqlite({
  backupDirectory,
  outputFile,
  environment = process.env,
  now = () => new Date(),
} = {}) {
  if (!backupDirectory || !outputFile) throw new Error('SQLite 迁移参数不完整。')
  const backupPath = resolve(backupDirectory)
  const output = resolve(outputFile)
  const outputRelativeToBackup = relative(backupPath, output)
  if (outputRelativeToBackup === '' || (
    outputRelativeToBackup !== '..' && !outputRelativeToBackup.startsWith(`..${sep}`) &&
    !isAbsolute(outputRelativeToBackup)
  )) throw new Error('SQLite 输出文件不能位于源备份目录内部。')
  if (!/\.(sqlite|db)$/i.test(output)) throw new Error('SQLite 输出文件应使用 .sqlite 或 .db 扩展名。')
  await refuseExistingOutput(output)
  const backup = await verifyDataBackup(backupPath)
  await validateWord2HtmlDataDirectory(backupPath, { environment })
  await mkdir(dirname(output), { recursive: true })
  const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`
  const partial = join(dirname(output), `.${basename(output)}.${suffix}.migrating`)
  const createdAt = now().toISOString()
  const database = new DatabaseSync(partial)
  let committed = false
  try {
    createSchema(database)
    database.exec('BEGIN IMMEDIATE')
    database.prepare('INSERT INTO word2html_meta VALUES (?, ?)').run('schemaVersion', String(SQLITE_SCHEMA_VERSION))
    database.prepare('INSERT INTO word2html_meta VALUES (?, ?)').run('sourceBackupCreatedAt', backup.manifest.createdAt)
    const insertSource = database.prepare('INSERT INTO source_documents VALUES (?, ?, ?, ?, ?, ?, ?, ?)')

    for (const file of backup.manifest.files) {
      const content = await readFile(join(backupPath, file.name))
      const value = JSON.parse(content.toString('utf8'))
      const records = documentRecords(value)
      const historyCount = sourceHistoryCount(value.format, records)
      const canonicalDigest = recordsDigest(records)
      insertSource.run(
        value.format, value.formatVersion, file.name, file.bytes, file.sha256,
        canonicalDigest, records.length, historyCount,
      )
      insertRecords(database, value.format, records)
    }

    const checks = auditDocuments(database)
    if (checks.length === 0 || checks.some((check) => !check.passed)) throw new Error('SQLite 影子迁移对账失败。')
    const report = {
      format: SQLITE_MIGRATION_REPORT_FORMAT,
      formatVersion: SQLITE_MIGRATION_REPORT_VERSION,
      schemaVersion: SQLITE_SCHEMA_VERSION,
      createdAt,
      sourceBackup: {
        createdAt: backup.manifest.createdAt,
        files: backup.manifest.files.length,
        manifestDigest: sha256(JSON.stringify(canonicalize(backup.manifest))),
      },
      checks,
      passed: true,
    }
    const reportJson = JSON.stringify(report)
    database.prepare('INSERT INTO migration_audits VALUES (?, ?, ?, ?)').run(
      `migration.${createdAt}.${randomBytes(4).toString('hex')}`,
      createdAt,
      reportJson,
      sha256(reportJson),
    )
    database.exec('COMMIT')
    committed = true
  } catch (error) {
    if (!committed) {
      try { database.exec('ROLLBACK') } catch { /* The transaction may not have started. */ }
    }
    throw error
  } finally {
    database.close()
  }

  verifyShadowSqliteDatabase(partial)
  await rename(partial, output)
  return verifyShadowSqliteDatabase(output)
}
