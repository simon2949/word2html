import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDataBackup } from './data-backup.mjs'
import {
  inspectLessonDirectoryUpgrade,
  planLessonDirectoryUpgrade,
  upgradeLessonDirectoryInPlace,
} from './lesson-directory-upgrade.mjs'
import {
  assertCurrentLessonPackage,
  createLessonDirectory,
  lessonPackageContentHash,
} from './lesson-directory.mjs'

const lessonPackage = {
  format: 'word2html.lesson-package', formatVersion: '0.1', kind: 'lesson-plan', apiVersion: 'lesson-plan-1.4',
  plan: {
    schemaVersion: '0.1', status: 'matched', subject: 'math', topic: '旧版椭圆',
    templateId: 'math.conic.ellipse-focus-sum',
    parameterOverrides: { majorAxis: 12, minorAxis: 8 }, reason: '升级测试。',
  },
}

async function legacyFixture() {
  const root = await mkdtemp('/tmp/word2html-lesson-upgrade-')
  const source = join(root, 'source')
  const dataFile = join(source, 'lesson-directory.json')
  const store = createLessonDirectory({ dataFile, now: () => '2026-08-30T09:00:00.000Z' })
  const submitted = await store.submit(lessonPackage, 'ellipse.json')
  await store.moderate(submitted.entry.id, 'verified', '')
  const state = JSON.parse(await readFile(dataFile, 'utf8'))
  const originalId = state.entries[0].id
  const originalHistory = structuredClone(state.entries[0].reviewHistory)
  state.entries[0].lessonPackage.apiVersion = 'lesson-plan-0.9'
  state.entries[0].contentHash = lessonPackageContentHash(state.entries[0].lessonPackage)
  await writeFile(dataFile, `${JSON.stringify(state, null, 2)}\n`)
  const backup = await createDataBackup({ sourceDirectory: source, backupRoot: join(root, 'backups') })
  return { root, source, dataFile, backup, originalId, originalHistory }
}

describe('legacy lesson directory upgrade', () => {
  it('upgrades a verified backup in place while preserving stable IDs and review history', async () => {
    const value = await legacyFixture()
    const before = await inspectLessonDirectoryUpgrade(value.dataFile)
    expect(before.upgradedEntries).toEqual([{
      id: value.originalId, from: 'lesson-plan-0.9', to: 'lesson-plan-1.4',
    }])
    const result = await upgradeLessonDirectoryInPlace({
      dataFile: value.dataFile,
      verifiedBackupDirectory: value.backup.directory,
    })
    expect(result).toMatchObject({ ok: true, changed: true, entries: 1 })
    const state = JSON.parse(await readFile(value.dataFile, 'utf8'))
    expect(state.entries[0].id).toBe(value.originalId)
    expect(state.entries[0].reviewHistory).toEqual(value.originalHistory)
    expect(state.entries[0].contentHash).toBe(lessonPackageContentHash(state.entries[0].lessonPackage))
    expect(() => assertCurrentLessonPackage(state.entries[0].lessonPackage)).not.toThrow()
    await expect(createLessonDirectory({ dataFile: value.dataFile }).listForAdmin()).resolves.toHaveLength(1)
    await expect(inspectLessonDirectoryUpgrade(value.dataFile)).resolves.toMatchObject({ upgradedEntries: [] })
  })

  it('rejects versions outside the documented legacy compatibility range', async () => {
    const value = await legacyFixture()
    const state = JSON.parse(await readFile(value.dataFile, 'utf8'))
    state.entries[0].lessonPackage.apiVersion = 'lesson-plan-0.5'
    await expect(planLessonDirectoryUpgrade(state)).rejects.toThrow('不支持的接口版本')
  })

  it('refuses an in-place write when current bytes no longer match the verified backup', async () => {
    const value = await legacyFixture()
    const state = JSON.parse(await readFile(value.dataFile, 'utf8'))
    state.entries[0].summary = '备份之后发生变化。'
    await writeFile(value.dataFile, `${JSON.stringify(state, null, 2)}\n`)
    await expect(upgradeLessonDirectoryInPlace({
      dataFile: value.dataFile,
      verifiedBackupDirectory: value.backup.directory,
    })).rejects.toThrow('与已验证备份不一致')
    expect(JSON.parse(await readFile(value.dataFile, 'utf8')).entries[0].summary).toBe('备份之后发生变化。')
  })
})
