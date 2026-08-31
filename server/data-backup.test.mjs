import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDataBackup, verifyDataBackup } from './data-backup.mjs'

describe('single-instance data backup', () => {
  it('copies valid JSON with a verifiable SHA-256 manifest', async () => {
    const root = await mkdtemp('/tmp/word2html-backup-test-')
    const source = join(root, 'data')
    const backups = join(root, 'backups')
    await mkdir(source)
    await writeFile(join(source, 'users.json'), '{"users":[]}\n')
    await writeFile(join(source, 'notes.txt'), 'not part of backup')
    const created = await createDataBackup({ sourceDirectory: source, backupRoot: backups })
    expect(created.ok).toBe(true)
    expect(created.manifest.files.map((file) => file.name)).toEqual(['users.json'])
    expect(JSON.parse(await readFile(join(created.directory, 'users.json'), 'utf8'))).toEqual({ users: [] })
  })

  it('detects a changed backup file', async () => {
    const root = await mkdtemp('/tmp/word2html-backup-tamper-')
    const source = join(root, 'data')
    await mkdir(source)
    await writeFile(join(source, 'library.json'), '{"entries":[]}\n')
    const created = await createDataBackup({ sourceDirectory: source, backupRoot: join(root, 'backups') })
    await writeFile(join(created.directory, 'library.json'), '{"entries":[1]}\n')
    await expect(verifyDataBackup(created.directory)).rejects.toThrow('完整性校验失败')
  })

  it('validates an optional SQLite runtime source binding without changing legacy manifests', async () => {
    const root = await mkdtemp('/tmp/word2html-backup-runtime-source-')
    const source = join(root, 'data')
    await mkdir(source)
    await writeFile(join(source, 'users.json'), '{"users":[]}\n')
    const now = () => new Date('2026-08-30T16:00:00.000Z')
    const created = await createDataBackup({
      sourceDirectory: source,
      backupRoot: join(root, 'backups'),
      now,
      sourceRuntime: {
        storageRole: 'runtime', schemaVersion: 2, runtimeRevision: 7,
        promotedAt: '2026-08-30T15:00:00.000Z',
      },
    })
    expect(created.manifest.sourceRuntime).toEqual({
      storageRole: 'runtime', schemaVersion: 2, runtimeRevision: 7,
      promotedAt: '2026-08-30T15:00:00.000Z',
      exportedAt: '2026-08-30T16:00:00.000Z',
    })

    const manifestFile = join(created.directory, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
    manifest.sourceRuntime.runtimeRevision = -1
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
    await expect(verifyDataBackup(created.directory)).rejects.toThrow('运行库来源无效')
  })
})
