import { resolve } from 'node:path'
import { migrateBackupToShadowSqlite } from '../server/sqlite-shadow-migration.mjs'

if (!process.argv[2] || !process.argv[3]) {
  throw new Error('用法：npm run migrate:sqlite -- <已验证备份目录> <新的 SQLite 文件>')
}
const result = await migrateBackupToShadowSqlite({
  backupDirectory: resolve(process.argv[2]),
  outputFile: resolve(process.argv[3]),
})
console.log(JSON.stringify({
  ok: result.ok,
  databaseFile: result.databaseFile,
  schemaVersion: result.schemaVersion,
  checks: result.checks,
}, null, 2))
