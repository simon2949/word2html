import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertCurrentLessonPackage,
  createLessonDirectory,
  createSubmissionRateLimiter,
  isAdminAuthorized,
} from './lesson-directory.mjs'

const temporaryDirectories = []

function ellipsePackage() {
  return {
    format: 'word2html.lesson-package',
    formatVersion: '0.1',
    kind: 'lesson-plan',
    apiVersion: 'lesson-plan-1.4',
    plan: {
      schemaVersion: '0.1',
      status: 'matched',
      subject: 'math',
      topic: '共享椭圆演示',
      templateId: 'math.conic.ellipse-focus-sum',
      parameterOverrides: { majorAxis: 12, minorAxis: 8 },
      reason: '等待管理员审核的椭圆焦点距离和演示。',
    },
  }
}

function noIssuesPreReview() {
  return {
    schemaVersion: '0.1', standardVersion: '0.1', verdict: 'no-issues',
    summary: 'AI 在声明式数据中未发现明确问题。', issues: [],
    manualReviewFocus: ['管理员仍需运行场景并检查视觉效果。'],
  }
}

async function directory() {
  const folder = await mkdtemp(join(tmpdir(), 'word2html-directory-'))
  temporaryDirectories.push(folder)
  return createLessonDirectory({
    dataFile: join(folder, 'directory.json'),
    now: () => '2026-08-20T08:00:00.000Z',
  })
}

async function directoryWithFile() {
  const folder = await mkdtemp(join(tmpdir(), 'word2html-directory-'))
  temporaryDirectories.push(folder)
  const dataFile = join(folder, 'directory.json')
  return {
    dataFile,
    store: createLessonDirectory({
      dataFile,
      now: () => '2026-08-20T08:00:00.000Z',
    }),
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

describe('shared lesson directory', () => {
  it('quarantines valid submissions until an administrator verifies them', async () => {
    const store = await directory()
    const submitted = await store.submit(ellipsePackage(), '../ellipse.word2html.json')

    expect(submitted.duplicate).toBe(false)
    expect(submitted.entry.reviewStatus).toBe('pending')
    expect(submitted.entry.preReview.status).toBe('queued')
    expect(submitted.entry.sourceFilename).toBe('ellipse.word2html.json')
    expect(await store.listPublic()).toEqual([])

    await store.moderate(submitted.entry.id, 'verified', '数学内容与交互均已复核。')
    const publicEntries = await store.listPublic()
    expect(publicEntries).toHaveLength(1)
    expect(publicEntries[0]?.reviewStatus).toBe('verified')
    expect(publicEntries[0]?.lessonPackage.plan.topic).toBe('共享椭圆演示')
  })

  it('deduplicates the same package by SHA-256 without resetting review state', async () => {
    const store = await directory()
    const first = await store.submit(ellipsePackage(), 'first.json')
    await store.moderate(first.entry.id, 'verified', '')
    const duplicate = await store.submit(ellipsePackage(), 'second.json')

    expect(duplicate.duplicate).toBe(true)
    expect(duplicate.entry.id).toBe(first.entry.id)
    expect(duplicate.entry.reviewStatus).toBe('verified')
    expect(await store.listForAdmin()).toHaveLength(1)
  })

  it('stores AI findings with the pending submission without granting final approval', async () => {
    const store = await directory()
    const submitted = await store.submit(ellipsePackage(), 'ellipse.json')
    const completed = await store.completePreReview(submitted.entry.id, {
      standardVersion: '0.1',
      result: noIssuesPreReview(),
      usage: {
        inputTokens: 600, outputTokens: 180, modelCalls: 1,
        repaired: false, adjudicated: false,
      },
      provider: { name: 'MiniMax', model: 'MiniMax-M3' },
    })

    expect(completed.reviewStatus).toBe('pending')
    expect(completed.preReview).toMatchObject({
      status: 'completed',
      result: { verdict: 'no-issues' },
      usage: { inputTokens: 600, modelCalls: 1 },
      provider: { name: 'MiniMax', model: 'MiniMax-M3' },
    })
    expect((await store.listForAdmin())[0]?.preReview.result.summary).toContain('未发现明确问题')
    expect(await store.listPublic()).toEqual([])

    await store.moderate(submitted.entry.id, 'verified', '管理员已完成人工复核。')
    expect((await store.listPublic())[0]).not.toHaveProperty('preReview')
  })

  it('records a failed pre-review and lets an administrator queue a retry', async () => {
    const store = await directory()
    const submitted = await store.submit(ellipsePackage(), 'ellipse.json')

    const failed = await store.failPreReview(submitted.entry.id, new Error('模型服务暂时不可用。'))
    expect(failed.preReview).toMatchObject({ status: 'failed', error: '模型服务暂时不可用。' })

    const queued = await store.queuePreReview(submitted.entry.id)
    expect(queued.preReview.status).toBe('queued')
    expect((await store.getForAdmin(submitted.entry.id)).lessonPackage.plan.topic).toBe('共享椭圆演示')
  })

  it('keeps an administrator-only append history for pre-review and moderation actions', async () => {
    const store = await directory()
    const submitted = await store.submit(ellipsePackage(), 'ellipse.json')
    await store.completePreReview(submitted.entry.id, {
      standardVersion: '0.1',
      result: noIssuesPreReview(),
    })
    await store.moderate(submitted.entry.id, 'needs-changes', '请补充距离标注。')
    await store.queuePreReview(submitted.entry.id)
    await store.failPreReview(submitted.entry.id, new Error('模型服务超时。'))

    const entry = await store.getForAdmin(submitted.entry.id)
    expect(entry.reviewHistory.map((event) => event.type)).toEqual([
      'submitted',
      'pre-review-queued',
      'pre-review-completed',
      'moderated',
      'pre-review-queued',
      'pre-review-failed',
    ])
    expect(entry.reviewHistory.find((event) => event.type === 'moderated')).toMatchObject({
      actor: 'admin',
      previousStatus: 'pending',
      status: 'needs-changes',
      note: '请补充距离标注。',
    })
    expect(await store.statusForSubmitter(ellipsePackage())).not.toHaveProperty('reviewHistory')
    expect(await store.listPublic()).toEqual([])
  })

  it('synthesizes history for an older 0.1 directory and persists it on the next action', async () => {
    const { dataFile, store } = await directoryWithFile()
    const submitted = await store.submit(ellipsePackage(), 'ellipse.json')
    const state = JSON.parse(await readFile(dataFile, 'utf8'))
    delete state.entries[0].reviewHistory
    await writeFile(dataFile, `${JSON.stringify(state, null, 2)}\n`)

    const legacy = await store.getForAdmin(submitted.entry.id)
    expect(legacy.reviewHistory.map((event) => event.type)).toEqual([
      'submitted',
      'pre-review-queued',
    ])

    await store.moderate(submitted.entry.id, 'verified', '旧记录已重新复核。')
    const persisted = JSON.parse(await readFile(dataFile, 'utf8'))
    expect(persisted.entries[0].reviewHistory.map((event) => event.type)).toEqual([
      'submitted',
      'pre-review-queued',
      'moderated',
    ])
  })

  it('separates change requests from permanent rejection and requires an explanation', async () => {
    const store = await directory()
    const submitted = await store.submit(ellipsePackage(), 'ellipse.json')

    expect(() => store.moderate(submitted.entry.id, 'needs-changes', ''))
      .toThrow(/必须填写审核意见/)
    const returned = await store.moderate(
      submitted.entry.id,
      'needs-changes',
      '请补充焦点连线并检查距离标签。',
    )
    expect(returned).toMatchObject({
      reviewStatus: 'needs-changes',
      reviewNote: '请补充焦点连线并检查距离标签。',
    })
    expect(await store.listPublic()).toEqual([])
  })

  it('returns review feedback only when the submitter presents the exact validated package', async () => {
    const store = await directory()
    const submitted = await store.submit(ellipsePackage(), 'ellipse.json')
    await store.completePreReview(submitted.entry.id, {
      standardVersion: '0.1',
      result: noIssuesPreReview(),
    })
    await store.moderate(
      submitted.entry.id,
      'needs-changes',
      '请补充焦点连线并在图中标注两段距离。',
    )

    await expect(store.statusForSubmitter(ellipsePackage())).resolves.toMatchObject({
      id: submitted.entry.id,
      reviewStatus: 'needs-changes',
      reviewNote: '请补充焦点连线并在图中标注两段距离。',
      preReview: { status: 'completed', result: { verdict: 'no-issues' } },
    })
    const different = ellipsePackage()
    different.plan.parameterOverrides.majorAxis = 18
    await expect(store.statusForSubmitter(different)).resolves.toBeNull()
    expect(await store.statusForSubmitter(ellipsePackage())).not.toHaveProperty('lessonPackage')
    expect(await store.statusForSubmitter(ellipsePackage())).not.toHaveProperty('contentHash')
  })

  it('links a changed resubmission to the returned version for administrator comparison', async () => {
    const store = await directory()
    const original = await store.submit(ellipsePackage(), 'ellipse.json')
    await store.moderate(original.entry.id, 'needs-changes', '请增加两条焦点距离线。')
    const revisionPackage = ellipsePackage()
    revisionPackage.plan.parameterOverrides.majorAxis = 14
    revisionPackage.plan.reason = '已根据审核意见补充距离展示并调整长轴。'

    const revision = await store.submit(
      revisionPackage,
      'ellipse-revision.json',
      original.entry.id,
    )

    expect(revision.entry).toMatchObject({
      reviewStatus: 'pending',
      revisionOf: original.entry.id,
    })
    const entries = await store.listForAdmin()
    expect(entries.find((entry) => entry.id === original.entry.id)?.supersededBy)
      .toBe(revision.entry.id)
    expect(entries.find((entry) => entry.id === revision.entry.id)?.revisionOf)
      .toBe(original.entry.id)
    expect(entries.find((entry) => entry.id === original.entry.id)?.reviewHistory)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        type: 'revision-linked', relatedEntryId: revision.entry.id,
      })]))
    expect(entries.find((entry) => entry.id === revision.entry.id)?.reviewHistory)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        type: 'revision-linked', relatedEntryId: original.entry.id,
      })]))
    expect(await store.listPublic()).toEqual([])
  })

  it('rejects invalid or ineligible revision relationships', async () => {
    const store = await directory()
    const original = await store.submit(ellipsePackage(), 'ellipse.json')
    const revisionPackage = ellipsePackage()
    revisionPackage.plan.parameterOverrides.majorAxis = 14

    expect(() => store.submit(revisionPackage, 'revision.json', 'not-an-entry'))
      .toThrow(/原提交编号无效/)
    await expect(store.submit(
      revisionPackage,
      'revision.json',
      'community.000000000000000000000000',
    )).rejects.toThrow(/原提交不存在/)
    await expect(store.submit(revisionPackage, 'revision.json', original.entry.id))
      .rejects.toThrow(/只有被退回/)
  })

  it('rejects outdated, unsupported, or provenance-forging packages', () => {
    expect(() => assertCurrentLessonPackage({ ...ellipsePackage(), apiVersion: 'lesson-plan-0.8' }))
      .toThrow(/lesson-plan-1.4/)
    expect(() => assertCurrentLessonPackage({ ...ellipsePackage(), reviewStatus: 'verified' }))
      .toThrow(/未知字段/)
    const unsupported = ellipsePackage()
    unsupported.plan = {
      ...unsupported.plan,
      status: 'unsupported',
      templateId: 'unsupported',
      parameterOverrides: {},
    }
    expect(() => assertCurrentLessonPackage(unsupported)).toThrow(/不能提交/)
  })

  it('uses a configured bearer token without accepting missing or partial values', () => {
    expect(isAdminAuthorized('Bearer admin-secret', 'admin-secret')).toBe(true)
    expect(isAdminAuthorized('Bearer admin', 'admin-secret')).toBe(false)
    expect(isAdminAuthorized(undefined, 'admin-secret')).toBe(false)
    expect(isAdminAuthorized('Bearer admin-secret', '')).toBe(false)
  })

  it('limits repeated submissions per client within a fixed window', () => {
    let timestamp = 1000
    const limiter = createSubmissionRateLimiter({ limit: 2, windowMs: 5000, clock: () => timestamp })

    expect(limiter.check('127.0.0.1').allowed).toBe(true)
    expect(limiter.check('127.0.0.1').allowed).toBe(true)
    expect(limiter.check('127.0.0.1').allowed).toBe(false)
    expect(limiter.check('192.0.2.1').allowed).toBe(true)
    timestamp = 6000
    expect(limiter.check('127.0.0.1').allowed).toBe(true)
  })
})
