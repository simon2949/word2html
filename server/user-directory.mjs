import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const USER_DIRECTORY_FORMAT = 'word2html.user-directory'
export const USER_DIRECTORY_VERSION = '0.1'
const USER_STATUSES = new Set(['active', 'paused'])
const MAX_USERS = 10_000

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanText(value, label, { max = 80 } = {}) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`请填写${label}。`)
  const text = value.trim()
  if (text.length > max) throw new Error(`${label}不能超过 ${max} 个字符。`)
  return text
}

function boundedInteger(value, fallback, minimum, maximum, label) {
  const number = value === undefined ? fallback : Number(value)
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label}必须是 ${minimum}–${maximum} 之间的整数。`)
  }
  return number
}

function codeDigest(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function assertUser(value) {
  if (
    !isRecord(value) || typeof value.id !== 'string' || typeof value.displayName !== 'string' ||
    !USER_STATUSES.has(value.status) || !isRecord(value.quota) ||
    !Number.isInteger(value.quota.dailyCalls) || !Number.isInteger(value.quota.dailyTokens) ||
    typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string'
  ) throw new Error('用户目录包含无效账号。')
  if (value.lastLoginAt !== undefined && typeof value.lastLoginAt !== 'string') throw new Error('用户最近登录时间无效。')
  if (value.invite !== undefined && (
    !isRecord(value.invite) || typeof value.invite.digest !== 'string' ||
    typeof value.invite.createdAt !== 'string' || typeof value.invite.expiresAt !== 'string'
  )) throw new Error('用户邀请记录无效。')
}

function assertState(value) {
  if (
    !isRecord(value) || value.format !== USER_DIRECTORY_FORMAT ||
    value.formatVersion !== USER_DIRECTORY_VERSION || !Array.isArray(value.users) ||
    value.users.length > MAX_USERS
  ) throw new Error('用户目录数据文件格式不正确。')
  const ids = new Set()
  for (const user of value.users) {
    assertUser(user)
    if (ids.has(user.id)) throw new Error('用户目录包含重复账号。')
    ids.add(user.id)
  }
  return value
}

function emptyState() {
  return { format: USER_DIRECTORY_FORMAT, formatVersion: USER_DIRECTORY_VERSION, users: [] }
}

function publicUser(user) {
  return {
    id: user.id,
    displayName: user.displayName,
    status: user.status,
    quota: { ...user.quota },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {}),
    invitePending: Boolean(user.invite),
    ...(user.invite ? { inviteExpiresAt: user.invite.expiresAt } : {}),
  }
}

export function createUserDirectory({
  dataFile,
  stateStorage,
  now = () => new Date(),
  defaultDailyCalls = 20,
  defaultDailyTokens = 100_000,
  inviteTtlMs = 7 * 24 * 60 * 60 * 1000,
} = {}) {
  if ((!stateStorage || typeof stateStorage.read !== 'function' || typeof stateStorage.write !== 'function') && (
    typeof dataFile !== 'string' || !dataFile
  )) throw new Error('用户目录数据文件路径不能为空。')
  let writeQueue = Promise.resolve()

  async function load() {
    if (stateStorage) {
      const value = await stateStorage.read()
      return value === undefined ? emptyState() : assertState(value)
    }
    try {
      return assertState(JSON.parse(await readFile(dataFile, 'utf8')))
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') return emptyState()
      throw error
    }
  }

  async function save(state) {
    assertState(state)
    if (stateStorage) {
      await stateStorage.write(state)
      return
    }
    await mkdir(dirname(dataFile), { recursive: true })
    const temporary = `${dataFile}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, dataFile)
  }

  function serialized(operation) {
    const next = writeQueue.then(operation, operation)
    writeQueue = next.then(() => undefined, () => undefined)
    return next
  }

  function invitation() {
    const code = `w2h-login-${randomBytes(24).toString('base64url')}`
    const createdAt = now()
    return {
      code,
      stored: {
        digest: codeDigest(code),
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + inviteTtlMs).toISOString(),
      },
    }
  }

  return {
    async list() {
      return (await load()).users.map(publicUser)
    },

    async get(id) {
      const user = (await load()).users.find((candidate) => candidate.id === id)
      return user ? publicUser(user) : undefined
    },

    async create(input) {
      const displayName = cleanText(input?.displayName, '用户名称')
      const dailyCalls = boundedInteger(input?.dailyCalls, defaultDailyCalls, 1, 10_000, '每日调用额度')
      const dailyTokens = boundedInteger(input?.dailyTokens, defaultDailyTokens, 1000, 100_000_000, '每日 Token 额度')
      return serialized(async () => {
        const state = await load()
        if (state.users.length >= MAX_USERS) throw new Error('用户数量已达到上限。')
        const issued = invitation()
        const timestamp = now().toISOString()
        const user = {
          id: `user.${randomUUID()}`,
          displayName,
          status: 'active',
          quota: { dailyCalls, dailyTokens },
          createdAt: timestamp,
          updatedAt: timestamp,
          invite: issued.stored,
        }
        state.users.push(user)
        await save(state)
        return { user: publicUser(user), accessCode: issued.code }
      })
    },

    async update(id, input) {
      return serialized(async () => {
        const state = await load()
        const user = state.users.find((candidate) => candidate.id === id)
        if (!user) throw new Error('用户不存在。')
        if (input?.displayName !== undefined) user.displayName = cleanText(input.displayName, '用户名称')
        if (input?.status !== undefined) {
          if (!USER_STATUSES.has(input.status)) throw new Error('用户状态无效。')
          user.status = input.status
        }
        user.quota = {
          dailyCalls: boundedInteger(input?.dailyCalls, user.quota.dailyCalls, 1, 10_000, '每日调用额度'),
          dailyTokens: boundedInteger(input?.dailyTokens, user.quota.dailyTokens, 1000, 100_000_000, '每日 Token 额度'),
        }
        user.updatedAt = now().toISOString()
        await save(state)
        return publicUser(user)
      })
    },

    async issueInvite(id) {
      return serialized(async () => {
        const state = await load()
        const user = state.users.find((candidate) => candidate.id === id)
        if (!user) throw new Error('用户不存在。')
        const issued = invitation()
        user.invite = issued.stored
        user.updatedAt = now().toISOString()
        await save(state)
        return { user: publicUser(user), accessCode: issued.code }
      })
    },

    async consumeInvite(accessCode) {
      const digest = codeDigest(String(accessCode ?? '').trim())
      return serialized(async () => {
        const state = await load()
        const user = state.users.find((candidate) => candidate.invite?.digest === digest)
        if (!user?.invite || Date.parse(user.invite.expiresAt) <= now().getTime() || user.status !== 'active') {
          return undefined
        }
        delete user.invite
        user.lastLoginAt = now().toISOString()
        user.updatedAt = user.lastLoginAt
        await save(state)
        return publicUser(user)
      })
    },
  }
}
