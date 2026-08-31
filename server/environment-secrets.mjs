import { readFileSync } from 'node:fs'

const MAX_SECRET_BYTES = 16 * 1024
const SECRET_TARGET = /(?:^|_)(?:API_KEY|ADMIN_TOKEN|SESSION_SECRET|HASH_SECRET)$/

function secretTarget(fileVariable) {
  if (typeof fileVariable !== 'string' || !fileVariable.endsWith('_FILE')) return undefined
  const target = fileVariable.slice(0, -5)
  return SECRET_TARGET.test(target) ? target : undefined
}

function safeReadSecret(target, path) {
  let value
  try {
    value = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`无法读取 ${target} 对应的密钥文件。`)
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_SECRET_BYTES) {
    throw new Error(`${target} 对应的密钥文件过大。`)
  }
  const secret = value.trim()
  if (!secret || secret.includes('\0')) throw new Error(`${target} 对应的密钥文件为空或格式无效。`)
  return secret
}

export function loadEnvironmentSecretFiles(environment = process.env) {
  const loaded = []
  for (const [fileVariable, rawPath] of Object.entries(environment)) {
    const target = secretTarget(fileVariable)
    if (!target || typeof rawPath !== 'string' || !rawPath.trim()) continue
    if (typeof environment[target] === 'string' && environment[target].trim()) {
      try { delete environment[fileVariable] } catch { /* Some injected environment objects may be immutable. */ }
      continue
    }
    environment[target] = safeReadSecret(target, rawPath.trim())
    try { delete environment[fileVariable] } catch { /* Some injected environment objects may be immutable. */ }
    loaded.push(target)
  }
  return loaded
}
