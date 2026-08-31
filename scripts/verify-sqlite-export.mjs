import { resolve } from 'node:path'
import { verifyRuntimeJsonExport } from '../server/sqlite-runtime-export.mjs'

if (!process.argv[2] || !process.argv[3]) {
  throw new Error('用法：npm run verify:sqlite-export -- <SQLite 运行库文件> <JSON 导出备份目录>')
}
const result = await verifyRuntimeJsonExport({
  databaseFile: resolve(process.argv[2]),
  backupDirectory: resolve(process.argv[3]),
})
console.log(JSON.stringify(result, null, 2))
