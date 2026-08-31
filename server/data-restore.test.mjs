import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDataBackup, verifyDataBackup } from './data-backup.mjs'
import { restoreDataBackup, validateWord2HtmlDataDirectory } from './data-restore.mjs'
import { createUserDirectory } from './user-directory.mjs'

async function fixture() {
  const root = await mkdtemp('/tmp/word2html-restore-test-')
  const source = join(root, 'source')
  const target = join(root, 'target')
  const backups = join(root, 'backups')
  const rollbackBackups = join(root, 'rollback-backups')
  await mkdir(source)
  await mkdir(target)
  const sourceUsers = createUserDirectory({ dataFile: join(source, 'users.json') })
  const targetUsers = createUserDirectory({ dataFile: join(target, 'users.json') })
  await sourceUsers.create({ displayName: '备份用户', dailyCalls: 6, dailyTokens: 6000 })
  await targetUsers.create({ displayName: '当前用户', dailyCalls: 9, dailyTokens: 9000 })
  const backup = await createDataBackup({ sourceDirectory: source, backupRoot: backups })
  return { root, source, target, backup, rollbackBackups }
}

describe('safe data restore', () => {
  it('refuses to restore without explicit maintenance confirmation', async () => {
    const value = await fixture()
    await expect(restoreDataBackup({
      backupDirectory: value.backup.directory,
      targetDirectory: value.target,
      rollbackBackupRoot: value.rollbackBackups,
    })).rejects.toThrow('显式确认')
    expect((await createUserDirectory({ dataFile: join(value.target, 'users.json') }).list())[0].displayName).toBe('当前用户')
  })

  it('backs up the current directory, validates staging, and preserves the previous directory', async () => {
    const value = await fixture()
    const result = await restoreDataBackup({
      backupDirectory: value.backup.directory,
      targetDirectory: value.target,
      rollbackBackupRoot: value.rollbackBackups,
      maintenanceConfirmed: true,
    })
    expect(result.ok).toBe(true)
    expect(result.currentBackupDirectory).toBeTruthy()
    expect(result.previousDirectory).toBeTruthy()
    expect((await createUserDirectory({ dataFile: join(value.target, 'users.json') }).list())[0].displayName).toBe('备份用户')
    expect((await createUserDirectory({ dataFile: join(result.previousDirectory, 'users.json') }).list())[0].displayName).toBe('当前用户')
    expect((await verifyDataBackup(result.currentBackupDirectory)).ok).toBe(true)
  })

  it('rejects an unknown business format before touching the target', async () => {
    const value = await fixture()
    const unknownSource = join(value.root, 'unknown-source')
    await mkdir(unknownSource)
    await writeFile(join(unknownSource, 'unknown.json'), '{"format":"word2html.unknown","formatVersion":"0.1"}\n')
    const unknownBackup = await createDataBackup({ sourceDirectory: unknownSource, backupRoot: join(value.root, 'unknown-backups') })
    await expect(restoreDataBackup({
      backupDirectory: unknownBackup.directory,
      targetDirectory: value.target,
      rollbackBackupRoot: value.rollbackBackups,
      maintenanceConfirmed: true,
    })).rejects.toThrow('未知业务格式')
    expect((await createUserDirectory({ dataFile: join(value.target, 'users.json') }).list())[0].displayName).toBe('当前用户')
  })

  it('validates every supported business file by its declared format', async () => {
    const value = await fixture()
    const report = await validateWord2HtmlDataDirectory(value.source)
    expect(report.stores).toEqual([
      expect.objectContaining({ format: 'word2html.user-directory', records: 1 }),
    ])
    const stored = JSON.parse(await readFile(join(value.source, 'users.json'), 'utf8'))
    expect(stored.users).toHaveLength(1)
  })
})
