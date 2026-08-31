import { randomBytes } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { createCapabilitySubjectReviewStore, CAPABILITY_REVIEW_FORMAT } from './capability-subject-reviews.mjs'
import { createDataBackup, verifyDataBackup } from './data-backup.mjs'
import { createLessonDirectory, LESSON_DIRECTORY_FORMAT } from './lesson-directory.mjs'
import { createModelSettingsStore, MODEL_SETTINGS_FORMAT } from './model-settings.mjs'
import { createUserDirectory, USER_DIRECTORY_FORMAT } from './user-directory.mjs'

function inside(parent, candidate) {
  const path = relative(parent, candidate)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

async function directoryState(path) {
  try {
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error(`数据目录不能是符号链接：${path}`)
    if (!info.isDirectory()) throw new Error(`数据目录不是文件夹：${path}`)
    return { exists: true }
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return { exists: false }
    throw error
  }
}

async function jsonFileNames(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'manifest.json')
    .map((entry) => entry.name)
    .sort()
}

export async function validateWord2HtmlDataDirectory(directory, { environment = process.env } = {}) {
  const root = resolve(directory)
  const names = await jsonFileNames(root)
  if (names.length === 0) throw new Error('恢复数据中没有 Word2HTML 业务文件。')
  const seenFormats = new Set()
  const stores = []
  for (const name of names) {
    let value
    try { value = JSON.parse(await readFile(join(root, name), 'utf8')) } catch {
      throw new Error(`恢复文件不是有效 JSON：${name}`)
    }
    const format = value?.format
    if (typeof format !== 'string') throw new Error(`恢复文件缺少业务格式：${name}`)
    if (seenFormats.has(format)) throw new Error(`恢复数据包含重复业务格式：${format}`)
    seenFormats.add(format)
    const dataFile = join(root, name)
    if (format === LESSON_DIRECTORY_FORMAT) {
      const entries = await createLessonDirectory({ dataFile }).listForAdmin()
      stores.push({ format, file: name, records: entries.length })
    } else if (format === CAPABILITY_REVIEW_FORMAT) {
      await createCapabilitySubjectReviewStore({ dataFile }).list()
      stores.push({ format, file: name })
    } else if (format === MODEL_SETTINGS_FORMAT) {
      await createModelSettingsStore({ dataFile, environment }).get()
      stores.push({ format, file: name })
    } else if (format === USER_DIRECTORY_FORMAT) {
      const users = await createUserDirectory({ dataFile }).list()
      stores.push({ format, file: name, records: users.length })
    } else {
      throw new Error(`恢复文件使用未知业务格式：${format}`)
    }
  }
  return { ok: true, directory: root, stores }
}

function safeRestorePaths(backupDirectory, targetDirectory, rollbackBackupRoot) {
  const backup = resolve(backupDirectory)
  const target = resolve(targetDirectory)
  const rollbackRoot = resolve(rollbackBackupRoot)
  if (target === parse(target).root) throw new Error('禁止把文件系统根目录作为恢复目标。')
  if (inside(target, backup) || inside(backup, target)) throw new Error('备份目录和恢复目标不能互相包含。')
  if (inside(target, rollbackRoot)) throw new Error('恢复前备份目录不能位于恢复目标内部。')
  return { backup, target, rollbackRoot }
}

export async function restoreDataBackup({
  backupDirectory,
  targetDirectory,
  rollbackBackupRoot,
  maintenanceConfirmed = false,
  environment = process.env,
} = {}) {
  if (!maintenanceConfirmed) {
    throw new Error('恢复已拒绝：请先停止服务或启用维护模式，并显式确认维护恢复。')
  }
  if (!backupDirectory || !targetDirectory || !rollbackBackupRoot) throw new Error('恢复参数不完整。')
  const paths = safeRestorePaths(backupDirectory, targetDirectory, rollbackBackupRoot)
  const backup = await verifyDataBackup(paths.backup)
  const restoredValidation = await validateWord2HtmlDataDirectory(paths.backup, { environment })
  const targetState = await directoryState(paths.target)

  let currentBackupDirectory
  if (targetState.exists && (await jsonFileNames(paths.target)).length > 0) {
    const currentBackup = await createDataBackup({
      sourceDirectory: paths.target,
      backupRoot: paths.rollbackRoot,
    })
    currentBackupDirectory = currentBackup.directory
  }

  const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`
  const stagingDirectory = join(dirname(paths.target), `.${basename(paths.target)}.restore-${suffix}.staging`)
  const previousDirectory = targetState.exists
    ? join(dirname(paths.target), `.${basename(paths.target)}.pre-restore-${suffix}`)
    : undefined
  await mkdir(stagingDirectory, { recursive: false, mode: 0o700 })
  for (const file of backup.manifest.files) {
    const content = await readFile(join(paths.backup, file.name))
    await writeFile(join(stagingDirectory, file.name), content, { flag: 'wx', mode: 0o600 })
  }
  await validateWord2HtmlDataDirectory(stagingDirectory, { environment })

  let previousMoved = false
  try {
    if (previousDirectory) {
      await rename(paths.target, previousDirectory)
      previousMoved = true
    }
    await rename(stagingDirectory, paths.target)
  } catch (error) {
    if (previousMoved) {
      try { await rename(previousDirectory, paths.target) } catch (rollbackError) {
        throw new Error(`恢复切换失败，自动回滚也失败；原目录保留在 ${previousDirectory}。`, { cause: rollbackError })
      }
    }
    throw error
  }

  try {
    await validateWord2HtmlDataDirectory(paths.target, { environment })
  } catch (error) {
    const failedDirectory = join(dirname(paths.target), `.${basename(paths.target)}.failed-restore-${suffix}`)
    await rename(paths.target, failedDirectory)
    if (previousDirectory) await rename(previousDirectory, paths.target)
    throw new Error(`恢复后的启动级校验失败；失败数据保留在 ${failedDirectory}。`, { cause: error })
  }

  return {
    ok: true,
    targetDirectory: paths.target,
    currentBackupDirectory,
    previousDirectory,
    restored: restoredValidation.stores,
  }
}
