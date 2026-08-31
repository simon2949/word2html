import { resolve } from 'node:path'
import { verifyShadowSqliteDatabase } from '../server/sqlite-shadow-migration.mjs'

if (!process.argv[2]) throw new Error('请提供需要验证的 SQLite 文件。')
const result = verifyShadowSqliteDatabase(resolve(process.argv[2]))
console.log(JSON.stringify({
  ok: result.ok,
  databaseFile: result.databaseFile,
  schemaVersion: result.schemaVersion,
  checks: result.checks,
}, null, 2))
