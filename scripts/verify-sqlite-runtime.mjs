import { verifyRuntimeSqliteDatabase } from '../server/sqlite-runtime-store.mjs'

const databaseFile = process.argv[2]
if (!databaseFile) throw new Error('用法：npm run verify:sqlite-runtime -- 运行数据库.sqlite')

console.log(JSON.stringify(verifyRuntimeSqliteDatabase(databaseFile), null, 2))
