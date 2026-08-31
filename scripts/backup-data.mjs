import { resolve } from 'node:path'
import { createDataBackup } from '../server/data-backup.mjs'

const sourceDirectory = resolve(process.argv[2] || '.word2html-data')
const backupRoot = resolve(process.argv[3] || '.word2html-backups')
const result = await createDataBackup({ sourceDirectory, backupRoot })
console.log(JSON.stringify({
  ok: result.ok,
  directory: result.directory,
  createdAt: result.manifest.createdAt,
  files: result.manifest.files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
}, null, 2))
