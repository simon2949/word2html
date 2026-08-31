import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

export const DATA_BACKUP_FORMAT = 'word2html.data-backup'
export const DATA_BACKUP_VERSION = '0.1'
const MANIFEST_FILE = 'manifest.json'
const SAFE_JSON_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/
const RUNTIME_SOURCE_KEYS = new Set([
  'storageRole', 'schemaVersion', 'runtimeRevision', 'promotedAt', 'exportedAt',
])

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function assertRuntimeSource(value, createdAt) {
  if (
    !value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some((key) => !RUNTIME_SOURCE_KEYS.has(key)) ||
    value.storageRole !== 'runtime' ||
    !Number.isSafeInteger(value.schemaVersion) || value.schemaVersion < 1 ||
    !Number.isSafeInteger(value.runtimeRevision) || value.runtimeRevision < 0 ||
    typeof value.promotedAt !== 'string' || !value.promotedAt ||
    typeof value.exportedAt !== 'string' || value.exportedAt !== createdAt
  ) throw new Error('备份清单的 SQLite 运行库来源无效。')
  return value
}

function assertManifest(value) {
  if (
    !value || typeof value !== 'object' || value.format !== DATA_BACKUP_FORMAT ||
    value.formatVersion !== DATA_BACKUP_VERSION || typeof value.createdAt !== 'string' ||
    !Array.isArray(value.files) || value.files.length === 0
  ) throw new Error('备份清单格式无效。')
  if (value.sourceRuntime !== undefined) assertRuntimeSource(value.sourceRuntime, value.createdAt)
  const names = new Set()
  for (const file of value.files) {
    if (
      !file || typeof file !== 'object' || typeof file.name !== 'string' ||
      !SAFE_JSON_NAME.test(file.name) || file.name === MANIFEST_FILE || names.has(file.name) ||
      !Number.isInteger(file.bytes) || file.bytes < 0 ||
      typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)
    ) throw new Error('备份清单包含无效文件记录。')
    names.add(file.name)
  }
  return value
}

export async function verifyDataBackup(directory) {
  const backupDirectory = resolve(directory)
  const manifest = assertManifest(JSON.parse(await readFile(join(backupDirectory, MANIFEST_FILE), 'utf8')))
  const actualNames = (await readdir(backupDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== MANIFEST_FILE)
    .map((entry) => entry.name)
    .sort()
  const expectedNames = manifest.files.map((file) => file.name).sort()
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) throw new Error('备份文件集合与清单不一致。')
  for (const file of manifest.files) {
    const content = await readFile(join(backupDirectory, file.name))
    if (content.byteLength !== file.bytes || digest(content) !== file.sha256) {
      throw new Error(`备份文件完整性校验失败：${file.name}`)
    }
    JSON.parse(content.toString('utf8'))
  }
  return { ok: true, directory: backupDirectory, manifest }
}

export async function createDataBackup({
  sourceDirectory,
  backupRoot,
  now = () => new Date(),
  sourceRuntime,
}) {
  const source = resolve(sourceDirectory)
  const root = resolve(backupRoot)
  const entries = await readdir(source, { withFileTypes: true })
  const names = entries
    .filter((entry) => entry.isFile() && SAFE_JSON_NAME.test(entry.name) && entry.name !== MANIFEST_FILE)
    .map((entry) => entry.name)
    .sort()
  if (names.length === 0) throw new Error(`数据目录中没有可备份的 JSON 文件：${source}`)

  const createdAt = now().toISOString()
  const timestamp = createdAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const backupName = `word2html-backup-${timestamp}-${randomBytes(3).toString('hex')}`
  const partial = join(root, `.${backupName}.partial`)
  const destination = join(root, backupName)

  const sourceFiles = []
  for (const name of names) {
    const content = await readFile(join(source, name))
    try { JSON.parse(content.toString('utf8')) } catch { throw new Error(`源数据不是有效 JSON：${name}`) }
    sourceFiles.push({ name, content, bytes: content.byteLength, sha256: digest(content) })
  }
  await mkdir(root, { recursive: true })
  await mkdir(partial, { recursive: false, mode: 0o700 })

  const files = []
  for (const file of sourceFiles) {
    await writeFile(join(partial, file.name), file.content, { flag: 'wx', mode: 0o600 })
    files.push({ name: file.name, bytes: file.bytes, sha256: file.sha256 })
  }
  const manifest = {
    format: DATA_BACKUP_FORMAT,
    formatVersion: DATA_BACKUP_VERSION,
    createdAt,
    sourceName: basename(source),
    ...(sourceRuntime ? {
      sourceRuntime: assertRuntimeSource({
        storageRole: sourceRuntime.storageRole,
        schemaVersion: sourceRuntime.schemaVersion,
        runtimeRevision: sourceRuntime.runtimeRevision,
        promotedAt: sourceRuntime.promotedAt,
        exportedAt: createdAt,
      }, createdAt),
    } : {}),
    files,
  }
  await writeFile(join(partial, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  await verifyDataBackup(partial)
  await rename(partial, destination)
  return verifyDataBackup(destination)
}
