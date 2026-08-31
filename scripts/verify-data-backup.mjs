import { resolve } from 'node:path'
import { verifyDataBackup } from '../server/data-backup.mjs'

if (!process.argv[2]) throw new Error('请提供需要验证的备份目录。')
const result = await verifyDataBackup(resolve(process.argv[2]))
console.log(JSON.stringify({
  ok: result.ok,
  directory: result.directory,
  createdAt: result.manifest.createdAt,
  files: result.manifest.files.length,
}, null, 2))
