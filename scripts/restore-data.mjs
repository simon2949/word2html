import { basename, dirname, join, resolve } from 'node:path'
import { restoreDataBackup } from '../server/data-restore.mjs'

const argumentsList = process.argv.slice(2)
const positional = argumentsList.filter((value) => value !== '--maintenance-confirmed')
if (!positional[0]) {
  throw new Error('用法：npm run restore:data -- <备份目录> [目标数据目录] [恢复前备份目录] --maintenance-confirmed')
}
const backupDirectory = resolve(positional[0])
const targetDirectory = resolve(positional[1] || '.word2html-data')
const rollbackBackupRoot = resolve(
  positional[2] || join(dirname(targetDirectory), `.${basename(targetDirectory)}-pre-restore-backups`),
)
const result = await restoreDataBackup({
  backupDirectory,
  targetDirectory,
  rollbackBackupRoot,
  maintenanceConfirmed: argumentsList.includes('--maintenance-confirmed'),
})
console.log(JSON.stringify(result, null, 2))
