const SQLITE_FORMAT_IDS = Object.freeze({
  'word2html.user-directory': 'users',
  'word2html.lesson-directory': 'lesson-directory',
  'word2html.capability-subject-reviews': 'capability-reviews',
  'word2html.model-settings': 'model-settings',
})

export const SQLITE_ACTIVE_MODE = 'active-single-instance'
export const SQLITE_MAINTENANCE_MODE = 'maintenance-pilot'
export const SQLITE_ACTIVATION_CONFIRMATION = 'confirm-single-instance-sqlite-writes'

export async function createConfiguredStorageBackend({
  name = 'json',
  jsonStores,
  sqliteRuntimeFile,
  environment = process.env,
  maintenanceMode = false,
  sqliteMode = SQLITE_MAINTENANCE_MODE,
  activationConfirmation = '',
  userDefaults = {},
} = {}) {
  const backend = String(name || 'json').trim().toLowerCase()
  if (!['json', 'sqlite'].includes(backend)) {
    throw new Error('WORD2HTML_STORAGE_BACKEND 只支持 json 或 sqlite。')
  }
  if (
    !jsonStores?.users || !jsonStores?.lessons ||
    !jsonStores?.capabilityReviews || !jsonStores?.modelSettings
  ) throw new Error('JSON 存储接口不完整。')

  if (backend === 'json') {
    return {
      name: 'json',
      pilot: false,
      ...jsonStores,
      publicStatus() { return { backend: 'json', pilot: false } },
      verify() { return { ok: true, backend: 'json' } },
      adminStatus() { return null },
      close() {},
    }
  }

  const mode = String(sqliteMode || SQLITE_MAINTENANCE_MODE).trim().toLowerCase()
  if (![SQLITE_MAINTENANCE_MODE, SQLITE_ACTIVE_MODE].includes(mode)) {
    throw new Error('WORD2HTML_SQLITE_MODE 只支持 maintenance-pilot 或 active-single-instance。')
  }
  const active = mode === SQLITE_ACTIVE_MODE
  if (maintenanceMode && active) {
    throw new Error('SQLite active 模式不能与 WORD2HTML_MAINTENANCE_MODE=true 同时启用。')
  }
  if (!maintenanceMode && !active) {
    throw new Error('SQLite 非维护运行必须显式设置 WORD2HTML_SQLITE_MODE=active-single-instance。')
  }
  if (active && activationConfirmation !== SQLITE_ACTIVATION_CONFIRMATION) {
    throw new Error(`SQLite active 模式还需要 WORD2HTML_SQLITE_ACTIVATION_CONFIRM=${SQLITE_ACTIVATION_CONFIRMATION}。`)
  }
  if (typeof sqliteRuntimeFile !== 'string' || !sqliteRuntimeFile.trim()) {
    throw new Error('SQLite 后端缺少 WORD2HTML_SQLITE_RUNTIME_FILE。')
  }
  const { createSqliteRuntimeStore } = await import('./sqlite-runtime-store.mjs')
  const runtime = createSqliteRuntimeStore({
    databaseFile: sqliteRuntimeFile,
    environment,
    defaultDailyCalls: userDefaults.defaultDailyCalls,
    defaultDailyTokens: userDefaults.defaultDailyTokens,
  })
  const initial = runtime.verify()
  return {
    name: 'sqlite',
    mode,
    pilot: !active,
    active,
    users: runtime.users,
    lessons: runtime.lessons,
    capabilityReviews: runtime.capabilityReviews,
    modelSettings: runtime.modelSettings,
    publicStatus() {
      return {
        backend: 'sqlite', pilot: !active, active, mode,
        schemaVersion: initial.schemaVersion,
      }
    },
    verify() {
      const status = runtime.verify()
      return {
        ok: status.ok,
        backend: 'sqlite', pilot: !active, active, mode,
        schemaVersion: status.schemaVersion,
        runtimeRevision: status.runtimeRevision,
      }
    },
    adminStatus() {
      const status = runtime.verify()
      return {
        status: active ? 'runtime-active' : 'runtime-pilot',
        checkedAt: new Date().toISOString(),
        mode: active ? 'sqlite-single-instance-active' : 'sqlite-maintenance-pilot',
        schemaVersion: status.schemaVersion,
        runtimeRevision: status.runtimeRevision,
        checks: status.checks.map((check) => ({
          id: SQLITE_FORMAT_IDS[check.format],
          matched: check.passed,
          jsonRecords: 0,
          sqliteRecords: check.records,
          runtimeRevision: check.revision,
        })),
      }
    },
    close() { runtime.close() },
  }
}
