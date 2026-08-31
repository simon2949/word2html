import { promoteShadowToRuntimeSqlite } from '../server/sqlite-runtime-store.mjs'

const shadowFile = process.argv[2]
const outputFile = process.argv[3]
if (!shadowFile || !outputFile) {
  throw new Error('用法：npm run promote:sqlite-runtime -- 影子数据库.sqlite 运行数据库.sqlite')
}

const result = await promoteShadowToRuntimeSqlite({ shadowFile, outputFile })
console.log(JSON.stringify(result, null, 2))
