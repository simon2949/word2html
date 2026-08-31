import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const image = process.env.WORD2HTML_IMAGE || 'word2html:local'
const suffix = `${process.pid}-${randomBytes(4).toString('hex')}`
const dataVolume = `word2html-recovery-data-${suffix}`
const backupVolume = `word2html-recovery-backups-${suffix}`
const volumes = [dataVolume, backupVolume]

function docker(argumentsList, { tolerateFailure = false } = {}) {
  const result = spawnSync('docker', argumentsList, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error && !tolerateFailure) throw new Error('无法执行 Docker 容器恢复验收。', { cause: result.error })
  if (result.status !== 0 && !tolerateFailure) {
    throw new Error(`Docker 容器恢复验收命令失败：${result.stderr.trim() || result.stdout.trim() || '未知错误'}`)
  }
  return result
}

function parseJsonOutput(output) {
  const text = output.trim()
  for (let index = text.indexOf('{'); index >= 0; index = text.indexOf('{', index + 1)) {
    try { return JSON.parse(text.slice(index)) } catch { /* npm may have printed a prefix */ }
  }
  throw new Error(`容器命令没有返回可解析的 JSON：${text.slice(0, 300)}`)
}

function containerArguments(command) {
  return [
    'run', '--rm',
    '--network', 'none',
    '--read-only',
    '--user', 'node',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true',
    '--pids-limit', '128',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=67108864',
    '--mount', `type=volume,source=${dataVolume},target=/var/lib/word2html-volume`,
    '--mount', `type=volume,source=${backupVolume},target=/var/backups/word2html-volume`,
    '--env', 'npm_config_cache=/tmp/npm-cache',
    image,
    ...command,
  ]
}

function runNode(source, ...argumentsList) {
  const result = docker(containerArguments([
    'node', '--input-type=module', '--eval', source, ...argumentsList,
  ]))
  return parseJsonOutput(result.stdout)
}

function runNpm(script, ...argumentsList) {
  const result = docker(containerArguments(['npm', 'run', script, '--', ...argumentsList]))
  return parseJsonOutput(result.stdout)
}

const dataDirectory = '/var/lib/word2html-volume/data'
const backupRoot = '/var/backups/word2html-volume/backups'
const rollbackRoot = '/var/backups/word2html-volume/restore-rollbacks'
const usersFile = `${dataDirectory}/users.json`
let report
let failure
const cleanupFailures = []

try {
  docker(['image', 'inspect', image])
  for (const volume of volumes) {
    docker(['volume', 'create', '--label', 'word2html.acceptance=container-recovery', volume])
  }

  const original = runNode(`
    const { createUserDirectory } = await import('/app/server/user-directory.mjs')
    const store = createUserDirectory({ dataFile: ${JSON.stringify(usersFile)} })
    const created = await store.create({ displayName: '容器备份用户', dailyCalls: 6, dailyTokens: 6000 })
    console.log(JSON.stringify({ displayName: created.user.displayName }))
  `)

  const backup = runNpm('backup:data', dataDirectory, backupRoot)
  const verified = runNpm('verify:data-backup', backup.directory)

  const changed = runNode(`
    const { createUserDirectory } = await import('/app/server/user-directory.mjs')
    const store = createUserDirectory({ dataFile: ${JSON.stringify(usersFile)} })
    const [user] = await store.list()
    await store.update(user.id, { displayName: '容器修改后用户' })
    const [updated] = await store.list()
    console.log(JSON.stringify({ displayName: updated.displayName }))
  `)

  const restored = runNpm(
    'restore:data', backup.directory, dataDirectory, rollbackRoot, '--maintenance-confirmed',
  )
  const restoredUser = runNode(`
    const { createUserDirectory } = await import('/app/server/user-directory.mjs')
    const [user] = await createUserDirectory({ dataFile: ${JSON.stringify(usersFile)} }).list()
    console.log(JSON.stringify({ displayName: user.displayName }))
  `)
  const rollbackVerified = runNpm('verify:data-backup', restored.currentBackupDirectory)
  const previousUser = runNode(`
    const { createUserDirectory } = await import('/app/server/user-directory.mjs')
    const file = process.argv[1] + '/users.json'
    const [user] = await createUserDirectory({ dataFile: file }).list()
    console.log(JSON.stringify({ displayName: user.displayName }))
  `, restored.previousDirectory)

  if (original.displayName !== '容器备份用户' || changed.displayName !== '容器修改后用户') {
    throw new Error('恢复演练的前置数据没有按预期建立。')
  }
  if (restoredUser.displayName !== '容器备份用户') throw new Error('恢复后没有得到备份中的账号数据。')
  if (previousUser.displayName !== '容器修改后用户') throw new Error('恢复切换前的数据目录没有被保留。')
  if (!verified.ok || !rollbackVerified.ok) throw new Error('备份或恢复前自动备份没有通过完整性验证。')

  report = {
    format: 'word2html.container-recovery-acceptance',
    formatVersion: '0.1',
    passed: true,
    image,
    checks: {
      isolatedVolumes: true,
      nonRootReadOnlyMaintenance: true,
      backupManifestVerified: true,
      restoredBusinessDataValidated: true,
      currentDataBackedUpBeforeRestore: true,
      previousDirectoryPreserved: true,
    },
  }
} catch (error) {
  failure = error
} finally {
  for (const volume of volumes.reverse()) {
    const result = docker(['volume', 'rm', '--force', volume], { tolerateFailure: true })
    if (result.error || result.status !== 0) cleanupFailures.push(volume)
  }
}

if (failure) throw failure
if (cleanupFailures.length > 0) throw new Error(`验收通过但临时卷清理失败：${cleanupFailures.join(', ')}`)

console.log(JSON.stringify({
  ...report,
  temporaryVolumesRemoved: true,
}, null, 2))
