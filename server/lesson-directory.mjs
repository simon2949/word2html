import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { GENERATION_API_VERSION, validateGeneratedPlan } from './minimax.mjs'
import {
  assertLessonPreReview,
  LESSON_REVIEW_STANDARD_VERSION,
} from './lesson-pre-review.mjs'

export const LESSON_DIRECTORY_FORMAT = 'word2html.lesson-directory'
export const LESSON_DIRECTORY_VERSION = '0.1'
export const LESSON_PACKAGE_FORMAT = 'word2html.lesson-package'
export const LESSON_PACKAGE_VERSION = '0.1'

const MAX_DIRECTORY_ENTRIES = 1000
const REVIEW_STATUSES = new Set(['pending', 'needs-changes', 'verified', 'rejected', 'deprecated'])
const PRE_REVIEW_STATUSES = new Set(['queued', 'completed', 'failed'])
const REVISION_PARENT_STATUSES = new Set(['needs-changes', 'rejected', 'deprecated'])
const REVIEW_EVENT_TYPES = new Set([
  'submitted',
  'revision-linked',
  'pre-review-queued',
  'pre-review-completed',
  'pre-review-failed',
  'moderated',
])
const REVIEW_EVENT_ACTORS = new Set(['submitter', 'admin', 'ai', 'system'])

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  return structuredClone(value)
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  )
}

export function lessonPackageContentHash(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function safeSourceFilename(value) {
  if (typeof value !== 'string') return undefined
  const filename = value.trim().split(/[\\/]/).at(-1)?.trim()
  return filename ? filename.slice(0, 180) : undefined
}

function safeRevisionParentId(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !/^community\.[a-f0-9]{24}$/.test(value.trim())) {
    throw new Error('修改版本关联的原提交编号无效。')
  }
  return value.trim()
}

function assertExactKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknown.length > 0) throw new Error(`${label}包含未知字段：${unknown.join('、')}`)
}

export function assertCurrentLessonPackage(value) {
  if (!isRecord(value) || value.format !== LESSON_PACKAGE_FORMAT) {
    throw new Error('共享目录只接收 Word2HTML 紧凑场景包。')
  }
  assertExactKeys(
    value,
    new Set(['format', 'formatVersion', 'kind', 'apiVersion', 'plan']),
    '场景包信封',
  )
  if (value.formatVersion !== LESSON_PACKAGE_VERSION || value.kind !== 'lesson-plan') {
    throw new Error('场景包格式或类型不受支持。')
  }
  if (value.apiVersion !== GENERATION_API_VERSION) {
    throw new Error(`共享目录只接收当前 ${GENERATION_API_VERSION} 场景包。`)
  }
  validateGeneratedPlan(value.plan)
  if (value.plan.status !== 'matched') throw new Error('不支持的规划不能提交到共享目录。')
  return value
}

function emptyState() {
  return {
    format: LESSON_DIRECTORY_FORMAT,
    formatVersion: LESSON_DIRECTORY_VERSION,
    entries: [],
  }
}

function assertStoredEntry(entry) {
  if (
    !isRecord(entry) || typeof entry.id !== 'string' ||
    typeof entry.contentHash !== 'string' || !REVIEW_STATUSES.has(entry.reviewStatus) ||
    typeof entry.title !== 'string' || typeof entry.subject !== 'string' ||
    typeof entry.summary !== 'string' || typeof entry.createdAt !== 'string' ||
    typeof entry.updatedAt !== 'string'
  ) {
    throw new Error('共享目录数据包含无效条目。')
  }
  assertCurrentLessonPackage(entry.lessonPackage)
  if (entry.preReview !== undefined) assertStoredPreReview(entry.preReview)
  if (entry.revisionOf !== undefined && typeof entry.revisionOf !== 'string') {
    throw new Error('共享目录条目的原版本关联无效。')
  }
  if (entry.supersededBy !== undefined && typeof entry.supersededBy !== 'string') {
    throw new Error('共享目录条目的后续版本关联无效。')
  }
  if (entry.reviewHistory !== undefined) {
    if (!Array.isArray(entry.reviewHistory)) throw new Error('共享目录条目的审核历史无效。')
    for (const event of entry.reviewHistory) assertStoredReviewEvent(event)
  }
}

function assertStoredReviewEvent(event) {
  if (
    !isRecord(event) || typeof event.id !== 'string' || !REVIEW_EVENT_TYPES.has(event.type) ||
    !REVIEW_EVENT_ACTORS.has(event.actor) || typeof event.at !== 'string'
  ) {
    throw new Error('共享目录包含无效审核事件。')
  }
  assertExactKeys(
    event,
    new Set(['id', 'type', 'actor', 'at', 'status', 'previousStatus', 'note', 'relatedEntryId', 'summary']),
    '审核事件',
  )
  if (event.status !== undefined && !REVIEW_STATUSES.has(event.status)) {
    throw new Error('审核事件包含无效状态。')
  }
  if (event.previousStatus !== undefined && !REVIEW_STATUSES.has(event.previousStatus)) {
    throw new Error('审核事件包含无效原状态。')
  }
  for (const key of ['note', 'relatedEntryId', 'summary']) {
    if (event[key] !== undefined && typeof event[key] !== 'string') {
      throw new Error(`审核事件字段 ${key} 无效。`)
    }
  }
}

function assertStoredPreReview(preReview) {
  if (
    !isRecord(preReview) || !PRE_REVIEW_STATUSES.has(preReview.status) ||
    preReview.standardVersion !== LESSON_REVIEW_STANDARD_VERSION
  ) {
    throw new Error('共享目录数据包含无效 AI 预审记录。')
  }
  if (preReview.status === 'queued' && typeof preReview.requestedAt !== 'string') {
    throw new Error('共享目录 AI 预审排队记录缺少时间。')
  }
  if (preReview.status === 'failed' && (
    typeof preReview.completedAt !== 'string' || typeof preReview.error !== 'string'
  )) {
    throw new Error('共享目录 AI 预审失败记录不完整。')
  }
  if (preReview.status === 'completed') {
    if (typeof preReview.completedAt !== 'string') throw new Error('共享目录 AI 预审完成记录缺少时间。')
    assertLessonPreReview(preReview.result)
  }
}

function assertState(value) {
  if (
    !isRecord(value) || value.format !== LESSON_DIRECTORY_FORMAT ||
    value.formatVersion !== LESSON_DIRECTORY_VERSION || !Array.isArray(value.entries)
  ) {
    throw new Error('共享目录数据文件格式不正确。')
  }
  for (const entry of value.entries) assertStoredEntry(entry)
  const ids = new Set(value.entries.map((entry) => entry.id))
  for (const entry of value.entries) {
    if (entry.revisionOf !== undefined && (!ids.has(entry.revisionOf) || entry.revisionOf === entry.id)) {
      throw new Error('共享目录包含断开的原版本关联。')
    }
    if (entry.supersededBy !== undefined && (!ids.has(entry.supersededBy) || entry.supersededBy === entry.id)) {
      throw new Error('共享目录包含断开的后续版本关联。')
    }
    const eventIds = new Set()
    for (const event of entry.reviewHistory ?? []) {
      if (eventIds.has(event.id)) throw new Error('共享目录包含重复的审核事件编号。')
      eventIds.add(event.id)
      if (event.relatedEntryId !== undefined && (
        !ids.has(event.relatedEntryId) || event.relatedEntryId === entry.id
      )) {
        throw new Error('共享目录审核历史包含断开的版本关联。')
      }
    }
  }
  return value
}

function publicEntry(entry) {
  return {
    id: entry.id,
    reviewStatus: entry.reviewStatus,
    title: entry.title,
    subject: entry.subject,
    summary: entry.summary,
    sourceFilename: entry.sourceFilename,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    lessonPackage: clone(entry.lessonPackage),
  }
}

function submissionEntry(entry) {
  return {
    ...publicEntry(entry),
    revisionOf: entry.revisionOf,
    supersededBy: entry.supersededBy,
    preReview: entry.preReview ? clone(entry.preReview) : undefined,
  }
}

function reviewEvent(type, actor, at, detail = {}) {
  return {
    id: `review-event.${randomUUID()}`,
    type,
    actor,
    at,
    ...detail,
  }
}

function legacyReviewHistory(entry) {
  const history = [reviewEvent(
    'submitted',
    'submitter',
    entry.createdAt,
    { status: 'pending', summary: '提交到共享第三方库。' },
  )]
  const preReview = entry.preReview
  if (preReview?.status === 'queued') {
    history.push(reviewEvent('pre-review-queued', 'system', preReview.requestedAt, {
      summary: 'AI 预审已进入队列。',
    }))
  } else if (preReview?.status === 'completed') {
    history.push(reviewEvent('pre-review-completed', 'ai', preReview.completedAt, {
      summary: preReview.result?.verdict === 'no-issues'
        ? 'AI 预审未发现明确问题。'
        : `AI 预审发现 ${preReview.result?.issues?.length ?? 0} 项问题。`,
    }))
  } else if (preReview?.status === 'failed') {
    history.push(reviewEvent('pre-review-failed', 'system', preReview.completedAt, {
      summary: preReview.error ?? 'AI 预审失败。',
    }))
  }
  if (entry.reviewedAt) {
    history.push(reviewEvent('moderated', 'admin', entry.reviewedAt, {
      status: entry.reviewStatus,
      note: entry.reviewNote,
      summary: '该记录来自旧目录中的最近一次人工审核结果。',
    }))
  }
  return history.sort((left, right) => left.at.localeCompare(right.at))
}

function reviewHistoryFor(entry) {
  return clone(entry.reviewHistory ?? legacyReviewHistory(entry))
}

function ensureReviewHistory(entry) {
  if (!entry.reviewHistory) entry.reviewHistory = legacyReviewHistory(entry)
  return entry.reviewHistory
}

function appendReviewEvent(entry, type, actor, at, detail = {}) {
  ensureReviewHistory(entry).push(reviewEvent(type, actor, at, detail))
}

function adminEntry(entry) {
  return { ...clone(entry), reviewHistory: reviewHistoryFor(entry) }
}

function submitterFeedback(entry) {
  const preReview = entry.preReview
  let safePreReview
  if (preReview?.status === 'completed') {
    safePreReview = {
      status: 'completed',
      standardVersion: preReview.standardVersion,
      completedAt: preReview.completedAt,
      result: clone(preReview.result),
    }
  } else if (preReview?.status === 'failed') {
    safePreReview = {
      status: 'failed',
      standardVersion: preReview.standardVersion,
      completedAt: preReview.completedAt,
    }
  } else if (preReview?.status === 'queued') {
    safePreReview = {
      status: 'queued',
      standardVersion: preReview.standardVersion,
      requestedAt: preReview.requestedAt,
    }
  }
  return {
    id: entry.id,
    reviewStatus: entry.reviewStatus,
    reviewNote: entry.reviewNote,
    reviewedAt: entry.reviewedAt,
    updatedAt: entry.updatedAt,
    revisionOf: entry.revisionOf,
    supersededBy: entry.supersededBy,
    preReview: safePreReview,
  }
}

function normalizedUsage(value) {
  if (!isRecord(value)) return undefined
  const usage = {}
  for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens', 'modelCalls']) {
    if (Number.isFinite(value[key]) && value[key] >= 0) usage[key] = value[key]
  }
  if (typeof value.repaired === 'boolean') usage.repaired = value.repaired
  if (typeof value.adjudicated === 'boolean') usage.adjudicated = value.adjudicated
  return Object.keys(usage).length > 0 ? usage : undefined
}

function normalizedProvider(value) {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.model !== 'string') return undefined
  return { name: value.name.slice(0, 80), model: value.model.slice(0, 120) }
}

export function isAdminAuthorized(authorization, configuredToken) {
  const token = typeof configuredToken === 'string' ? configuredToken.trim() : ''
  if (!token || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false
  const supplied = authorization.slice('Bearer '.length).trim()
  const expectedBuffer = Buffer.from(token)
  const suppliedBuffer = Buffer.from(supplied)
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer)
}

export function createSubmissionRateLimiter({ limit = 20, windowMs = 10 * 60 * 1000, clock = Date.now } = {}) {
  const buckets = new Map()
  return {
    check(clientId) {
      const key = String(clientId || 'unknown')
      const timestamp = clock()
      let bucket = buckets.get(key)
      if (!bucket || timestamp >= bucket.resetAt) {
        bucket = { count: 0, resetAt: timestamp + windowMs }
        buckets.set(key, bucket)
      }
      bucket.count += 1
      if (buckets.size > 10000) {
        for (const [candidate, value] of buckets) {
          if (timestamp >= value.resetAt) buckets.delete(candidate)
        }
      }
      return {
        allowed: bucket.count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000)),
      }
    },
  }
}

export function createLessonDirectory({ dataFile, stateStorage, now = () => new Date().toISOString() }) {
  if ((!stateStorage || typeof stateStorage.read !== 'function' || typeof stateStorage.write !== 'function') && !dataFile) {
    throw new Error('共享目录缺少数据文件路径。')
  }
  let mutationQueue = Promise.resolve()

  async function readState() {
    if (stateStorage) {
      const value = await stateStorage.read()
      return value === undefined ? emptyState() : assertState(value)
    }
    try {
      return assertState(JSON.parse(await readFile(dataFile, 'utf8')))
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyState()
      throw error
    }
  }

  async function writeState(state) {
    assertState(state)
    if (stateStorage) {
      await stateStorage.write(state)
      return
    }
    await mkdir(dirname(dataFile), { recursive: true })
    const temporaryFile = `${dataFile}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    await rename(temporaryFile, dataFile)
  }

  function mutate(operation) {
    const pending = mutationQueue.then(async () => {
      const state = await readState()
      const result = await operation(state)
      if (result.changed) await writeState(state)
      return result.value
    })
    mutationQueue = pending.then(() => undefined, () => undefined)
    return pending
  }

  return {
    async listPublic() {
      const state = await readState()
      return state.entries
        .filter((entry) => entry.reviewStatus === 'verified')
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(publicEntry)
    },

    async listForAdmin() {
      const state = await readState()
      return state.entries
        .slice()
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(adminEntry)
    },

    async statusForSubmitter(value) {
      const lessonPackage = assertCurrentLessonPackage(value)
      const hash = lessonPackageContentHash(lessonPackage)
      const state = await readState()
      const entry = state.entries.find((candidate) => candidate.contentHash === hash)
      return entry ? submitterFeedback(entry) : null
    },

    submit(value, sourceFilename, revisionParentId) {
      const lessonPackage = clone(assertCurrentLessonPackage(value))
      const hash = lessonPackageContentHash(lessonPackage)
      const revisionOf = safeRevisionParentId(revisionParentId)
      return mutate(async (state) => {
        const revisionParent = revisionOf
          ? state.entries.find((entry) => entry.id === revisionOf)
          : undefined
        if (revisionOf && !revisionParent) throw new Error('修改版本关联的原提交不存在。')
        if (revisionParent && !REVISION_PARENT_STATUSES.has(revisionParent.reviewStatus)) {
          throw new Error('只有被退回、拒绝或下架的提交才能关联修改版本。')
        }
        if (revisionParent && revisionParent.subject !== lessonPackage.plan.subject) {
          throw new Error('修改版本不能改变原提交的学科。')
        }
        const existing = state.entries.find((entry) => entry.contentHash === hash)
        if (existing) {
          let shouldPreReview = false
          let changed = false
          if (!existing.preReview) {
            const timestamp = now()
            ensureReviewHistory(existing)
            existing.preReview = {
              status: 'queued', standardVersion: LESSON_REVIEW_STANDARD_VERSION, requestedAt: timestamp,
            }
            appendReviewEvent(existing, 'pre-review-queued', 'system', timestamp, {
              summary: '缺少历史预审记录，已自动加入 AI 预审队列。',
            })
            shouldPreReview = true
            changed = true
          }
          if (revisionParent && existing.id !== revisionParent.id) {
            const timestamp = now()
            if (revisionParent.supersededBy !== existing.id) {
              revisionParent.supersededBy = existing.id
              revisionParent.updatedAt = timestamp
              appendReviewEvent(revisionParent, 'revision-linked', 'submitter', timestamp, {
                relatedEntryId: existing.id,
                summary: '提交者上传了修改版本。',
              })
              changed = true
            }
            if (!existing.revisionOf && existing.reviewStatus === 'pending') {
              existing.revisionOf = revisionParent.id
              existing.updatedAt = timestamp
              appendReviewEvent(existing, 'revision-linked', 'submitter', timestamp, {
                relatedEntryId: revisionParent.id,
                summary: '该提交被标记为原版本的修改版。',
              })
              changed = true
            }
          }
          return {
            changed,
            value: { duplicate: true, shouldPreReview, entry: submissionEntry(existing) },
          }
        }
        if (state.entries.length >= MAX_DIRECTORY_ENTRIES) {
          throw new Error('共享目录已达到容量上限，请先由管理员清理。')
        }
        const timestamp = now()
        const entry = {
          id: `community.${hash.slice(0, 24)}`,
          contentHash: hash,
          reviewStatus: 'pending',
          title: lessonPackage.plan.topic,
          subject: lessonPackage.plan.subject,
          summary: lessonPackage.plan.reason,
          sourceFilename: safeSourceFilename(sourceFilename),
          createdAt: timestamp,
          updatedAt: timestamp,
          revisionOf: revisionParent?.id,
          lessonPackage,
          preReview: {
            status: 'queued', standardVersion: LESSON_REVIEW_STANDARD_VERSION, requestedAt: timestamp,
          },
          reviewHistory: [
            reviewEvent('submitted', 'submitter', timestamp, {
              status: 'pending',
              summary: revisionParent ? '提交修改版本到共享第三方库。' : '提交到共享第三方库。',
            }),
            reviewEvent('pre-review-queued', 'system', timestamp, {
              summary: '新提交已自动加入 AI 预审队列。',
            }),
            ...(revisionParent ? [reviewEvent('revision-linked', 'submitter', timestamp, {
              relatedEntryId: revisionParent.id,
              summary: '该提交关联到被退回、拒绝或下架的原版本。',
            })] : []),
          ],
        }
        if (revisionParent) {
          ensureReviewHistory(revisionParent)
          revisionParent.supersededBy = entry.id
          revisionParent.updatedAt = timestamp
          appendReviewEvent(revisionParent, 'revision-linked', 'submitter', timestamp, {
            relatedEntryId: entry.id,
            summary: '提交者上传了修改版本。',
          })
        }
        state.entries.unshift(entry)
        return { changed: true, value: { duplicate: false, shouldPreReview: true, entry: submissionEntry(entry) } }
      })
    },

    async getForAdmin(id) {
      const state = await readState()
      const entry = state.entries.find((candidate) => candidate.id === id)
      if (!entry) throw new Error('共享目录中不存在该条目。')
      return adminEntry(entry)
    },

    queuePreReview(id) {
      return mutate(async (state) => {
        const entry = state.entries.find((candidate) => candidate.id === id)
        if (!entry) throw new Error('共享目录中不存在该条目。')
        const timestamp = now()
        ensureReviewHistory(entry)
        entry.preReview = {
          status: 'queued', standardVersion: LESSON_REVIEW_STANDARD_VERSION, requestedAt: timestamp,
        }
        appendReviewEvent(entry, 'pre-review-queued', 'admin', timestamp, {
          summary: '管理员要求重新运行 AI 预审。',
        })
        entry.updatedAt = timestamp
        return { changed: true, value: adminEntry(entry) }
      })
    },

    completePreReview(id, review) {
      if (!isRecord(review) || review.standardVersion !== LESSON_REVIEW_STANDARD_VERSION) {
        throw new Error('AI 预审结果使用了不兼容的审核标准。')
      }
      const result = clone(assertLessonPreReview(review.result))
      return mutate(async (state) => {
        const entry = state.entries.find((candidate) => candidate.id === id)
        if (!entry) throw new Error('共享目录中不存在该条目。')
        const timestamp = now()
        ensureReviewHistory(entry)
        entry.preReview = {
          status: 'completed',
          standardVersion: LESSON_REVIEW_STANDARD_VERSION,
          completedAt: timestamp,
          result,
          usage: normalizedUsage(review.usage),
          provider: normalizedProvider(review.provider),
        }
        appendReviewEvent(entry, 'pre-review-completed', 'ai', timestamp, {
          summary: result.verdict === 'no-issues'
            ? 'AI 预审未发现明确问题。'
            : `AI 预审发现 ${result.issues.length} 项问题。`,
        })
        entry.updatedAt = timestamp
        return { changed: true, value: submissionEntry(entry) }
      })
    },

    failPreReview(id, error) {
      const message = error instanceof Error ? error.message : String(error || 'AI 预审失败。')
      return mutate(async (state) => {
        const entry = state.entries.find((candidate) => candidate.id === id)
        if (!entry) throw new Error('共享目录中不存在该条目。')
        const timestamp = now()
        ensureReviewHistory(entry)
        entry.preReview = {
          status: 'failed', standardVersion: LESSON_REVIEW_STANDARD_VERSION,
          completedAt: timestamp, error: message.slice(0, 500),
        }
        appendReviewEvent(entry, 'pre-review-failed', 'system', timestamp, {
          summary: message.slice(0, 500),
        })
        entry.updatedAt = timestamp
        return { changed: true, value: submissionEntry(entry) }
      })
    },

    moderate(id, reviewStatus, reviewNote) {
      if (!REVIEW_STATUSES.has(reviewStatus)) throw new Error('审核状态不受支持。')
      const note = typeof reviewNote === 'string' ? reviewNote.trim().slice(0, 500) : ''
      if ((reviewStatus === 'needs-changes' || reviewStatus === 'rejected') && !note) {
        throw new Error('退回修改或拒绝时必须填写审核意见。')
      }
      return mutate(async (state) => {
        const entry = state.entries.find((candidate) => candidate.id === id)
        if (!entry) throw new Error('共享目录中不存在该条目。')
        const timestamp = now()
        const previousStatus = entry.reviewStatus
        ensureReviewHistory(entry)
        entry.reviewStatus = reviewStatus
        entry.reviewNote = note || undefined
        entry.reviewedAt = timestamp
        entry.updatedAt = timestamp
        appendReviewEvent(entry, 'moderated', 'admin', timestamp, {
          previousStatus,
          status: reviewStatus,
          note: note || undefined,
          summary: previousStatus === reviewStatus ? '管理员更新了审核意见。' : '管理员更新了审核状态。',
        })
        return { changed: true, value: adminEntry(entry) }
      })
    },
  }
}
