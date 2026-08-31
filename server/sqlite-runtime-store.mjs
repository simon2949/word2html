import { randomBytes } from 'node:crypto'
import { chmod, copyFile, lstat, mkdir, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  CAPABILITY_REVIEW_FORMAT,
  CAPABILITY_REVIEW_VERSION,
  createCapabilitySubjectReviewStore,
  normalizeCapabilityReviewDocument,
} from './capability-subject-reviews.mjs'
import {
  createLessonDirectory,
  LESSON_DIRECTORY_FORMAT,
  LESSON_DIRECTORY_VERSION,
} from './lesson-directory.mjs'
import {
  createModelSettingsStore,
  MODEL_SETTINGS_FORMAT,
  MODEL_SETTINGS_VERSION,
} from './model-settings.mjs'
import {
  documentRecords,
  FORMAT_TABLE,
  insertRecords,
  integrity,
  recordsDigest,
  SQLITE_APPLICATION_ID,
  SQLITE_SCHEMA_VERSION,
  targetSnapshot,
  verifyShadowSqliteDatabase,
} from './sqlite-shadow-migration.mjs'
import {
  createUserDirectory,
  USER_DIRECTORY_FORMAT,
  USER_DIRECTORY_VERSION,
} from './user-directory.mjs'

export const SQLITE_RUNTIME_SCHEMA_VERSION = 2
export const SQLITE_RUNTIME_ROLE = 'runtime'

const RUNTIME_FORMATS = Object.freeze([
  USER_DIRECTORY_FORMAT,
  LESSON_DIRECTORY_FORMAT,
  CAPABILITY_REVIEW_FORMAT,
  MODEL_SETTINGS_FORMAT,
])

function timestamp(now) {
  const value = now()
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error('SQLite 运行库时钟无效。')
  return value.toISOString()
}

function documentFromRecords(format, records) {
  if (format === USER_DIRECTORY_FORMAT) {
    return { format, formatVersion: USER_DIRECTORY_VERSION, users: records }
  }
  if (format === LESSON_DIRECTORY_FORMAT) {
    return { format, formatVersion: LESSON_DIRECTORY_VERSION, entries: records }
  }
  if (format === CAPABILITY_REVIEW_FORMAT) {
    const usesCurrentFields = records.every((record) => (
      typeof record?.reviewComment === 'string' &&
      (!Array.isArray(record.history) || record.history.every((event) => typeof event?.reviewComment === 'string'))
    ))
    return normalizeCapabilityReviewDocument({
      format,
      formatVersion: usesCurrentFields ? CAPABILITY_REVIEW_VERSION : '0.1',
      records,
    })
  }
  if (format === MODEL_SETTINGS_FORMAT) return records[0]
  throw new Error(`SQLite 运行库不支持业务格式：${format}`)
}

function trackerFor(database, format) {
  return database.prepare(`
    SELECT revision, updated_at, record_count, history_count, records_sha256
    FROM runtime_store_state WHERE format = ?
  `).get(format)
}

function checkedSnapshot(database, format) {
  const snapshot = targetSnapshot(database, format)
  const tracker = trackerFor(database, format)
  const digest = recordsDigest(snapshot.records)
  const revision = Number(tracker?.revision)
  const passed = Boolean(tracker) && Number.isSafeInteger(revision) && revision >= 0 && snapshot.normalized
    && tracker.record_count === snapshot.records.length
    && tracker.history_count === snapshot.historyCount
    && tracker.records_sha256 === digest
  if (!passed) throw new Error(`SQLite 运行库 ${format} 状态校验失败。`)
  return { ...snapshot, digest, tracker }
}

function updateTracker(database, format, revision, updatedAt) {
  const snapshot = targetSnapshot(database, format)
  if (!snapshot.normalized) throw new Error(`SQLite 运行库 ${format} 规范化字段校验失败。`)
  database.prepare(`
    INSERT INTO runtime_store_state (
      format, revision, updated_at, record_count, history_count, records_sha256
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(format) DO UPDATE SET
      revision = excluded.revision,
      updated_at = excluded.updated_at,
      record_count = excluded.record_count,
      history_count = excluded.history_count,
      records_sha256 = excluded.records_sha256
  `).run(
    format,
    revision,
    updatedAt,
    snapshot.records.length,
    snapshot.historyCount,
    recordsDigest(snapshot.records),
  )
}

function meta(database) {
  return new Map(database.prepare('SELECT key, value FROM word2html_meta').all().map((row) => [row.key, row.value]))
}

function verifyRuntimeConnection(database, databaseFile) {
  const applicationId = Number(database.prepare('PRAGMA application_id').get().application_id)
  const schemaVersion = Number(database.prepare('PRAGMA user_version').get().user_version)
  if (applicationId !== SQLITE_APPLICATION_ID) throw new Error('SQLite 文件不是 Word2HTML 数据库。')
  if (schemaVersion !== SQLITE_RUNTIME_SCHEMA_VERSION) throw new Error('SQLite 运行库 Schema 版本不受支持。')
  if (!integrity(database)) throw new Error('SQLite 运行库完整性检查失败。')
  const metadata = meta(database)
  if (metadata.get('storageRole') !== SQLITE_RUNTIME_ROLE) throw new Error('SQLite 文件不是可写运行库。')
  if (metadata.get('promotedFromSchemaVersion') !== String(SQLITE_SCHEMA_VERSION)) {
    throw new Error('SQLite 运行库缺少有效的影子迁移来源。')
  }
  const globalRevision = Number(metadata.get('runtimeRevision'))
  if (!Number.isSafeInteger(globalRevision) || globalRevision < 0) throw new Error('SQLite 运行库全局修订号无效。')
  const promotedAt = metadata.get('promotedAt')
  if (typeof promotedAt !== 'string' || !promotedAt) throw new Error('SQLite 运行库晋升时间无效。')
  const trackerFormats = database.prepare('SELECT format FROM runtime_store_state ORDER BY format').all()
    .map((row) => row.format)
  if (
    trackerFormats.length !== RUNTIME_FORMATS.length ||
    trackerFormats.some((format) => !RUNTIME_FORMATS.includes(format))
  ) throw new Error('SQLite 运行库状态记录集合无效。')

  const checks = RUNTIME_FORMATS.map((format) => {
    const snapshot = checkedSnapshot(database, format)
    return {
      format,
      revision: snapshot.tracker.revision,
      records: snapshot.records.length,
      history: snapshot.historyCount,
      normalizedColumns: snapshot.normalized,
      passed: true,
    }
  })
  const revisionTotal = checks.reduce((sum, check) => sum + check.revision, 0)
  if (revisionTotal !== globalRevision) throw new Error('SQLite 运行库修订号对账失败。')
  return {
    ok: true,
    databaseFile,
    schemaVersion,
    storageRole: SQLITE_RUNTIME_ROLE,
    runtimeRevision: globalRevision,
    promotedAt,
    checks,
  }
}

export function verifyRuntimeSqliteDatabase(databaseFile) {
  const file = resolve(databaseFile)
  const database = new DatabaseSync(file, { readOnly: true })
  try {
    return verifyRuntimeConnection(database, file)
  } finally {
    database.close()
  }
}

async function refuseExistingOutput(output) {
  try {
    await lstat(output)
    throw new Error(`SQLite 运行库输出文件已存在，拒绝覆盖：${output}`)
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return
    throw error
  }
}

export async function promoteShadowToRuntimeSqlite({
  shadowFile,
  outputFile,
  now = () => new Date(),
} = {}) {
  if (!shadowFile || !outputFile) throw new Error('SQLite 运行库晋升参数不完整。')
  const shadow = verifyShadowSqliteDatabase(shadowFile).databaseFile
  const output = resolve(outputFile)
  if (!/\.(sqlite|db)$/i.test(output)) throw new Error('SQLite 运行库输出文件应使用 .sqlite 或 .db 扩展名。')
  await refuseExistingOutput(output)
  await mkdir(dirname(output), { recursive: true })
  const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`
  const partial = join(dirname(output), `.${basename(output)}.${suffix}.promoting`)
  await copyFile(shadow, partial)
  await chmod(partial, 0o600)

  let database
  let committed = false
  let published = false
  try {
    database = new DatabaseSync(partial)
    database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; BEGIN IMMEDIATE;')
    database.exec(`
      CREATE TABLE runtime_store_state (
        format TEXT PRIMARY KEY,
        revision INTEGER NOT NULL CHECK(revision >= 0),
        updated_at TEXT NOT NULL,
        record_count INTEGER NOT NULL CHECK(record_count >= 0),
        history_count INTEGER NOT NULL CHECK(history_count >= 0),
        records_sha256 TEXT NOT NULL CHECK(length(records_sha256) = 64)
      ) STRICT;
    `)
    const promotedAt = timestamp(now)
    const upsertMeta = database.prepare(`
      INSERT INTO word2html_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)
    upsertMeta.run('storageRole', SQLITE_RUNTIME_ROLE)
    upsertMeta.run('promotedFromSchemaVersion', String(SQLITE_SCHEMA_VERSION))
    upsertMeta.run('promotedAt', promotedAt)
    upsertMeta.run('runtimeRevision', '0')
    for (const format of RUNTIME_FORMATS) updateTracker(database, format, 0, promotedAt)
    database.exec(`PRAGMA user_version = ${SQLITE_RUNTIME_SCHEMA_VERSION}; COMMIT;`)
    committed = true
    database.close()
    database = undefined
    verifyRuntimeSqliteDatabase(partial)
    await rename(partial, output)
    published = true
    return verifyRuntimeSqliteDatabase(output)
  } catch (error) {
    if (database && !committed) {
      try { database.exec('ROLLBACK') } catch { /* The transaction may not have started. */ }
    }
    throw error
  } finally {
    try { database?.close() } catch { /* Preserve the original failure. */ }
    if (!published) {
      try { await unlink(partial) } catch { /* Partial output may not exist. */ }
    }
  }
}

function createStateStorage(database, format, now) {
  const table = FORMAT_TABLE[format]
  if (!table) throw new Error(`SQLite 运行库不支持业务格式：${format}`)
  return {
    async read() {
      return documentFromRecords(format, checkedSnapshot(database, format).records)
    },
    async write(state) {
      const records = documentRecords(state)
      database.exec('BEGIN IMMEDIATE')
      let committed = false
      try {
        const tracker = trackerFor(database, format)
        if (!tracker) throw new Error(`SQLite 运行库缺少 ${format} 状态记录。`)
        const nextRevision = Number(tracker.revision) + 1
        database.exec(`DELETE FROM ${table}`)
        insertRecords(database, format, records)
        updateTracker(database, format, nextRevision, timestamp(now))
        const changed = database.prepare(`
          UPDATE word2html_meta
          SET value = CAST(value AS INTEGER) + 1
          WHERE key = 'runtimeRevision' AND CAST(value AS INTEGER) >= 0
        `).run().changes
        if (changed !== 1) throw new Error('SQLite 运行库全局修订号更新失败。')
        database.exec('COMMIT')
        committed = true
      } finally {
        if (!committed) {
          try { database.exec('ROLLBACK') } catch { /* The transaction may already have ended. */ }
        }
      }
    },
  }
}

export function createSqliteRuntimeStore({
  databaseFile,
  environment = process.env,
  now = () => new Date(),
  defaultDailyCalls = 20,
  defaultDailyTokens = 100_000,
  inviteTtlMs = 7 * 24 * 60 * 60 * 1000,
} = {}) {
  const verification = verifyRuntimeSqliteDatabase(databaseFile)
  const database = new DatabaseSync(verification.databaseFile)
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;')
  const storage = Object.fromEntries(RUNTIME_FORMATS.map((format) => [
    format,
    createStateStorage(database, format, now),
  ]))
  const users = createUserDirectory({
    stateStorage: storage[USER_DIRECTORY_FORMAT], now,
    defaultDailyCalls, defaultDailyTokens, inviteTtlMs,
  })
  const lessons = createLessonDirectory({
    stateStorage: storage[LESSON_DIRECTORY_FORMAT],
    now: () => timestamp(now),
  })
  const capabilityReviews = createCapabilitySubjectReviewStore({
    stateStorage: storage[CAPABILITY_REVIEW_FORMAT], now,
  })
  const modelSettings = createModelSettingsStore({
    stateStorage: storage[MODEL_SETTINGS_FORMAT], environment, now,
  })
  return {
    users,
    lessons,
    capabilityReviews,
    modelSettings,
    schemaVersion: SQLITE_RUNTIME_SCHEMA_VERSION,
    verify() { return verifyRuntimeConnection(database, verification.databaseFile) },
    close() { database.close() },
  }
}
