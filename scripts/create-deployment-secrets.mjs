import { randomBytes } from 'node:crypto'
import { chmod, lstat, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const secretDirectory = resolve(projectRoot, process.argv[2] ?? 'deploy/secrets')
const modelApiKey = (process.env.WORD2HTML_MODEL_API_KEY || process.env.MINIMAX_API_KEY || '').trim()

if (!modelApiKey) {
  throw new Error('未检测到 WORD2HTML_MODEL_API_KEY 或 MINIMAX_API_KEY，未创建任何部署密钥。')
}

const secrets = new Map([
  ['admin-token', randomBytes(48).toString('base64url')],
  ['user-session-secret', randomBytes(48).toString('base64url')],
  ['model-usage-hash-secret', randomBytes(48).toString('base64url')],
  ['model-api-key', modelApiKey],
])

await mkdir(secretDirectory, { recursive: true, mode: 0o700 })
await chmod(secretDirectory, 0o700)

for (const name of secrets.keys()) {
  try {
    await lstat(resolve(secretDirectory, name))
    throw new Error(`部署密钥文件 ${name} 已存在；为避免覆盖，未创建任何文件。`)
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') continue
    throw error
  }
}

for (const [name, value] of secrets) {
  const file = resolve(secretDirectory, name)
  await writeFile(file, value, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  await chmod(file, 0o600)
}

console.log(JSON.stringify({
  created: [...secrets.keys()],
  directory: 'deploy/secrets',
  permissions: '0600',
  valuesPrinted: false,
}, null, 2))
