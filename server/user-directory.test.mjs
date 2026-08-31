import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createUserDirectory } from './user-directory.mjs'

async function directoryAt(options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'word2html-users-'))
  const dataFile = join(directory, 'users.json')
  return { dataFile, store: createUserDirectory({ dataFile, ...options }) }
}

describe('user directory', () => {
  it('stores only an invite digest and consumes a code once', async () => {
    const { dataFile, store } = await directoryAt()
    const created = await store.create({ displayName: '测试用户', dailyCalls: 12, dailyTokens: 50000 })
    expect(created.accessCode).toMatch(/^w2h-login-/)
    const stored = await readFile(dataFile, 'utf8')
    expect(stored).not.toContain(created.accessCode)
    expect(stored).not.toContain('accessCode')

    await expect(store.consumeInvite(created.accessCode)).resolves.toMatchObject({
      id: created.user.id, displayName: '测试用户', invitePending: false,
    })
    await expect(store.consumeInvite(created.accessCode)).resolves.toBeUndefined()
  })

  it('supports pausing users, changing quotas, and issuing a replacement invite', async () => {
    const { store } = await directoryAt()
    const created = await store.create({ displayName: '用户 A' })
    await expect(store.update(created.user.id, { status: 'paused', dailyCalls: 5, dailyTokens: 8000 }))
      .resolves.toMatchObject({ status: 'paused', quota: { dailyCalls: 5, dailyTokens: 8000 } })
    const invite = await store.issueInvite(created.user.id)
    expect(invite.accessCode).toMatch(/^w2h-login-/)
    await expect(store.consumeInvite(invite.accessCode)).resolves.toBeUndefined()
  })

  it('expires invitations deterministically', async () => {
    let timestamp = Date.parse('2026-08-30T00:00:00Z')
    const { store } = await directoryAt({ now: () => new Date(timestamp), inviteTtlMs: 1000 })
    const created = await store.create({ displayName: '即将过期' })
    timestamp += 1001
    await expect(store.consumeInvite(created.accessCode)).resolves.toBeUndefined()
  })
})
