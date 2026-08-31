import { randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'
import { runSqliteActiveHttpAcceptance } from '../server/sqlite-active-http-acceptance.mjs'

if (!process.argv[2]) {
  throw new Error('用法：npm run acceptance:sqlite-active -- <SQLite 候选运行库文件> [验收报告文件]')
}
const createdAt = new Date().toISOString()
const timestamp = createdAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const reportFile = resolve(process.argv[3] || join(
  '.word2html-migrations',
  'rehearsals',
  `sqlite-active-http-${timestamp}-${randomBytes(3).toString('hex')}.json`,
))
const result = await runSqliteActiveHttpAcceptance({
  databaseFile: resolve(process.argv[2]),
  reportFile,
})
console.log(JSON.stringify(result, null, 2))
