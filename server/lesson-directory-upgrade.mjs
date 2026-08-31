import { createHash, randomUUID } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { verifyDataBackup } from './data-backup.mjs'
import {
  assertCurrentLessonPackage,
  createLessonDirectory,
  lessonPackageContentHash,
} from './lesson-directory.mjs'
import { GENERATION_API_VERSION } from './minimax.mjs'

export const LEGACY_SERVER_LESSON_API_VERSIONS = Object.freeze([
  'lesson-plan-0.6',
  'lesson-plan-0.7',
  'lesson-plan-0.8',
  'lesson-plan-0.9',
  'lesson-plan-1.0',
  'lesson-plan-1.1',
  'lesson-plan-1.2',
  'lesson-plan-1.3',
])

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function clone(value) {
  return structuredClone(value)
}

async function validateUpgradedState(state) {
  const store = createLessonDirectory({
    stateStorage: {
      async read() { return clone(state) },
      async write() { throw new Error('升级校验不得写入状态。') },
    },
  })
  await store.listForAdmin()
}

export async function planLessonDirectoryUpgrade(value) {
  if (
    !value || typeof value !== 'object' || value.format !== 'word2html.lesson-directory' ||
    value.formatVersion !== '0.1' || !Array.isArray(value.entries)
  ) throw new Error('旧版共享实验目录格式无效。')

  const state = clone(value)
  const upgradedEntries = []
  for (const entry of state.entries) {
    const lessonPackage = entry?.lessonPackage
    const sourceVersion = lessonPackage?.apiVersion
    if (sourceVersion === GENERATION_API_VERSION) {
      assertCurrentLessonPackage(lessonPackage)
      continue
    }
    if (!LEGACY_SERVER_LESSON_API_VERSIONS.includes(sourceVersion)) {
      throw new Error(`共享实验 ${entry?.id ?? '未知条目'} 使用不支持的接口版本：${sourceVersion ?? '缺失'}`)
    }
    const upgradedPackage = { ...clone(lessonPackage), apiVersion: GENERATION_API_VERSION }
    try {
      assertCurrentLessonPackage(upgradedPackage)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`共享实验 ${entry.id} 不能安全升级：${message}`)
    }
    entry.lessonPackage = upgradedPackage
    entry.contentHash = lessonPackageContentHash(upgradedPackage)
    upgradedEntries.push({ id: entry.id, from: sourceVersion, to: GENERATION_API_VERSION })
  }

  const hashes = state.entries.map((entry) => entry.contentHash)
  if (new Set(hashes).size !== hashes.length) throw new Error('升级后出现重复场景内容，拒绝写入。')
  await validateUpgradedState(state)
  return { state, upgradedEntries }
}

export async function inspectLessonDirectoryUpgrade(dataFile) {
  const file = resolve(dataFile)
  const source = await readFile(file)
  const planned = await planLessonDirectoryUpgrade(JSON.parse(source.toString('utf8')))
  const output = Buffer.from(`${JSON.stringify(planned.state, null, 2)}\n`)
  return {
    file,
    source,
    output,
    beforeSha256: sha256(source),
    afterSha256: sha256(output),
    entries: planned.state.entries.length,
    upgradedEntries: planned.upgradedEntries,
  }
}

export async function upgradeLessonDirectoryInPlace({ dataFile, verifiedBackupDirectory } = {}) {
  if (!dataFile || !verifiedBackupDirectory) throw new Error('原地升级需要数据文件和已验证备份目录。')
  const file = resolve(dataFile)
  const backup = await verifyDataBackup(verifiedBackupDirectory)
  const name = basename(file)
  const manifestFile = backup.manifest.files.find((item) => item.name === name)
  if (!manifestFile) throw new Error(`已验证备份中不存在 ${name}。`)
  const inspection = await inspectLessonDirectoryUpgrade(file)
  if (inspection.beforeSha256 !== manifestFile.sha256 || inspection.source.byteLength !== manifestFile.bytes) {
    throw new Error('当前共享实验目录与已验证备份不一致，拒绝原地升级。')
  }
  if (inspection.upgradedEntries.length === 0) {
    return { ok: true, changed: false, ...inspection, source: undefined, output: undefined }
  }

  const temporary = join(
    dirname(file),
    `.${name}.${process.pid}.${randomUUID()}.upgrading`,
  )
  let published = false
  try {
    await writeFile(temporary, inspection.output, { flag: 'wx', mode: 0o600 })
    const staged = await inspectLessonDirectoryUpgrade(temporary)
    if (staged.upgradedEntries.length !== 0 || staged.beforeSha256 !== inspection.afterSha256) {
      throw new Error('共享实验目录升级旁路复验失败。')
    }
    await rename(temporary, file)
    published = true
    const final = await inspectLessonDirectoryUpgrade(file)
    if (final.upgradedEntries.length !== 0 || final.beforeSha256 !== inspection.afterSha256) {
      throw new Error('共享实验目录升级终检失败。')
    }
    return {
      ok: true,
      changed: true,
      file,
      backupDirectory: backup.directory,
      beforeSha256: inspection.beforeSha256,
      afterSha256: inspection.afterSha256,
      entries: inspection.entries,
      upgradedEntries: inspection.upgradedEntries,
    }
  } catch (error) {
    if (published) {
      const rollback = `${temporary}.rollback`
      await writeFile(rollback, inspection.source, { flag: 'wx', mode: 0o600 })
      await rename(rollback, file)
    }
    throw error
  } finally {
    if (!published) {
      try { await unlink(temporary) } catch { /* Temporary file may not exist. */ }
    }
  }
}
