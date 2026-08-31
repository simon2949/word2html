import { resolve } from 'node:path'
import { exportRuntimeSqliteToJsonBackup } from '../server/sqlite-runtime-export.mjs'

const databaseFile = process.argv[2]
if (!databaseFile) {
  throw new Error('用法：npm run export:sqlite-runtime -- <SQLite 运行库文件> [JSON 备份根目录]')
}
const result = await exportRuntimeSqliteToJsonBackup({
  databaseFile: resolve(databaseFile),
  backupRoot: resolve(process.argv[3] || '.word2html-backups'),
})
console.log(JSON.stringify({
  ok: result.ok,
  backupDirectory: result.backupDirectory,
  schemaVersion: result.schemaVersion,
  runtimeRevision: result.runtimeRevision,
  createdAt: result.manifest.createdAt,
  files: result.manifest.files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
  checks: result.checks,
}, null, 2))
