import {
  inspectLessonDirectoryUpgrade,
  upgradeLessonDirectoryInPlace,
} from '../server/lesson-directory-upgrade.mjs'

const dataFile = process.argv[2]
if (!dataFile) {
  throw new Error('用法：npm run upgrade:lesson-directory -- 数据文件 [--in-place 已验证备份目录]')
}
const inPlaceIndex = process.argv.indexOf('--in-place')
const backupDirectory = inPlaceIndex >= 0 ? process.argv[inPlaceIndex + 1] : undefined
if (inPlaceIndex >= 0 && !backupDirectory) throw new Error('--in-place 后必须提供已验证备份目录。')
const result = backupDirectory
  ? await upgradeLessonDirectoryInPlace({ dataFile, verifiedBackupDirectory: backupDirectory })
  : await inspectLessonDirectoryUpgrade(dataFile)

console.log(JSON.stringify({
  ok: true,
  changed: result.changed ?? result.upgradedEntries.length > 0,
  file: result.file,
  backupDirectory: result.backupDirectory,
  beforeSha256: result.beforeSha256,
  afterSha256: result.afterSha256,
  entries: result.entries,
  upgradedEntries: result.upgradedEntries,
}, null, 2))
