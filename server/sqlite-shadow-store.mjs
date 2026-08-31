import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { CAPABILITY_SUBJECT_REVIEW_IDS } from './capability-subject-reviews.mjs'
import { assertCurrentLessonPackage } from './lesson-directory.mjs'
import { readTrustedModelCatalog } from './model-settings.mjs'
import { verifyShadowSqliteDatabase } from './sqlite-shadow-migration.mjs'

function clone(value) {
  return structuredClone(value)
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

function semanticDigest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function payloads(database, table, order = 'source_index') {
  return database.prepare(`SELECT payload_json FROM ${table} ORDER BY ${order}`).all()
    .map((row) => JSON.parse(row.payload_json))
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

function publicLesson(entry) {
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

function legacyReviewHistory(entry) {
  const event = (suffix, type, actor, at, detail = {}) => ({
    id: `shadow-legacy.${entry.id}.${suffix}`, type, actor, at, ...detail,
  })
  const history = [event('submitted', 'submitted', 'submitter', entry.createdAt, {
    status: 'pending', summary: '提交到共享第三方库。',
  })]
  const preReview = entry.preReview
  if (preReview?.status === 'queued') {
    history.push(event('pre-review', 'pre-review-queued', 'system', preReview.requestedAt, { summary: 'AI 预审已进入队列。' }))
  } else if (preReview?.status === 'completed') {
    history.push(event('pre-review', 'pre-review-completed', 'ai', preReview.completedAt, {
      summary: preReview.result?.verdict === 'no-issues' ? 'AI 预审未发现明确问题。' : `AI 预审发现 ${preReview.result?.issues?.length ?? 0} 项问题。`,
    }))
  } else if (preReview?.status === 'failed') {
    history.push(event('pre-review', 'pre-review-failed', 'system', preReview.completedAt, { summary: preReview.error ?? 'AI 预审失败。' }))
  }
  if (entry.reviewedAt) {
    history.push(event('moderated', 'moderated', 'admin', entry.reviewedAt, {
      status: entry.reviewStatus, note: entry.reviewNote,
      summary: '该记录来自旧目录中的最近一次人工审核结果。',
    }))
  }
  return history.sort((left, right) => left.at.localeCompare(right.at))
}

function adminLesson(entry) {
  return { ...clone(entry), reviewHistory: clone(entry.reviewHistory ?? legacyReviewHistory(entry)) }
}

function submitterFeedback(entry) {
  let preReview
  if (entry.preReview?.status === 'completed') {
    preReview = {
      status: 'completed', standardVersion: entry.preReview.standardVersion,
      completedAt: entry.preReview.completedAt, result: clone(entry.preReview.result),
    }
  } else if (entry.preReview?.status === 'failed') {
    preReview = {
      status: 'failed', standardVersion: entry.preReview.standardVersion,
      completedAt: entry.preReview.completedAt,
    }
  } else if (entry.preReview?.status === 'queued') {
    preReview = {
      status: 'queued', standardVersion: entry.preReview.standardVersion,
      requestedAt: entry.preReview.requestedAt,
    }
  }
  return {
    id: entry.id, reviewStatus: entry.reviewStatus, reviewNote: entry.reviewNote,
    reviewedAt: entry.reviewedAt, updatedAt: entry.updatedAt,
    revisionOf: entry.revisionOf, supersededBy: entry.supersededBy, preReview,
  }
}

function contentHash(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function emptyCapabilityReview(capabilityId) {
  return {
    capabilityId, status: 'pending', reviewer: '', reviewerRole: '', reviewedVersion: '',
    reviewComment: '', checks: {}, updatedAt: '', history: [],
  }
}

function normalizedCapabilityReview(record) {
  if (!record) return record
  if (record.reviewComment !== undefined) return clone(record)
  return {
    capabilityId: record.capabilityId,
    status: record.status,
    reviewer: record.reviewer ?? '',
    reviewerRole: record.reviewerRole ?? '',
    reviewedVersion: record.reviewedVersion ?? '',
    reviewComment: record.findings ?? '',
    checks: clone(record.checks ?? {}),
    updatedAt: record.updatedAt ?? '',
    ...(record.reviewedAt ? { reviewedAt: record.reviewedAt } : {}),
    history: (record.history ?? []).map((event) => ({
      id: event.id, at: event.at, status: event.status,
      reviewer: event.reviewer ?? '', reviewerRole: event.reviewerRole ?? '',
      reviewedVersion: event.reviewedVersion ?? '', reviewComment: event.reviewComment ?? event.findings ?? '',
      checks: clone(event.checks ?? {}),
    })),
  }
}

function publicCatalogItem(item) {
  return {
    id: item.id, label: item.label, provider: item.provider, protocol: item.protocol,
    baseURL: item.baseURL, model: item.model, keyConfigured: item.config.configured,
    maxTokens: item.config.maxTokens, temperature: item.config.temperature,
    timeout: item.config.timeout, inputCostPerMillion: item.config.inputCostPerMillion,
    outputCostPerMillion: item.config.outputCostPerMillion,
  }
}

function modelState(database, catalog, environment) {
  const stored = payloads(database, 'model_settings', 'id')[0]
  if (!stored) {
    const ids = catalog.map((item) => item.id)
    const generationId = ids.includes(environment.WORD2HTML_MODEL_DEFAULT_ID)
      ? environment.WORD2HTML_MODEL_DEFAULT_ID : ids[0]
    const reviewId = ids.includes(environment.WORD2HTML_REVIEW_MODEL_DEFAULT_ID)
      ? environment.WORD2HTML_REVIEW_MODEL_DEFAULT_ID : (ids[1] ?? ids[0])
    return { formatVersion: '0.1', enabledIds: ids, generationId, reviewId, updatedAt: '' }
  }
  const known = new Set(catalog.map((item) => item.id))
  const fallback = catalog.map((item) => item.id)
  const enabled = [...new Set(stored.enabledIds.filter((id) => known.has(id)))]
  const enabledIds = enabled.length > 0 ? enabled : fallback
  return {
    ...stored,
    enabledIds,
    generationId: enabledIds.includes(stored.generationId) ? stored.generationId : enabledIds[0],
    reviewId: enabledIds.includes(stored.reviewId) ? stored.reviewId : enabledIds[0],
  }
}

export function createSqliteShadowStore({ databaseFile, environment = process.env } = {}) {
  const verification = verifyShadowSqliteDatabase(databaseFile)
  const database = new DatabaseSync(databaseFile, { readOnly: true })
  const catalog = readTrustedModelCatalog(environment)

  const users = {
    async list() { return payloads(database, 'users').map(publicUser) },
    async get(id) {
      const row = database.prepare('SELECT payload_json FROM users WHERE id = ?').get(id)
      return row ? publicUser(JSON.parse(row.payload_json)) : undefined
    },
  }

  const lessons = {
    async listPublic() {
      return payloads(database, 'lesson_entries')
        .filter((entry) => entry.reviewStatus === 'verified')
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(publicLesson)
    },
    async listForAdmin() {
      return payloads(database, 'lesson_entries')
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(adminLesson)
    },
    async getForAdmin(id) {
      const row = database.prepare('SELECT payload_json FROM lesson_entries WHERE id = ?').get(id)
      if (!row) throw new Error('共享目录中不存在该条目。')
      return adminLesson(JSON.parse(row.payload_json))
    },
    async statusForSubmitter(value) {
      const lessonPackage = assertCurrentLessonPackage(value)
      const row = database.prepare('SELECT payload_json FROM lesson_entries WHERE content_hash = ?').get(contentHash(lessonPackage))
      return row ? submitterFeedback(JSON.parse(row.payload_json)) : null
    },
  }

  const capabilityReviews = {
    async list() {
      const stored = new Map(payloads(database, 'capability_reviews').map((record) => [record.capabilityId, normalizedCapabilityReview(record)]))
      return CAPABILITY_SUBJECT_REVIEW_IDS.map((id) => clone(stored.get(id) ?? emptyCapabilityReview(id)))
    },
  }

  const modelSettings = {
    async get() {
      const state = modelState(database, catalog, environment)
      return {
        formatVersion: state.formatVersion,
        catalog: catalog.map(publicCatalogItem),
        enabledIds: [...state.enabledIds],
        generationId: state.generationId,
        reviewId: state.reviewId,
        updatedAt: state.updatedAt,
      }
    },
    async publicOptions() {
      const settings = await this.get()
      return {
        defaultModelId: settings.generationId,
        models: settings.catalog.filter((item) => settings.enabledIds.includes(item.id)).map((item) => ({
          id: item.id, label: item.label, provider: item.provider, protocol: item.protocol,
          model: item.model, platformKeyAvailable: item.keyConfigured,
        })),
      }
    },
    async config(profile = 'generation', requestedId) {
      const state = modelState(database, catalog, environment)
      const id = requestedId || (profile === 'review' ? state.reviewId : state.generationId)
      if (!state.enabledIds.includes(id)) throw new Error('该模型未启用。')
      const item = catalog.find((candidate) => candidate.id === id)
      if (!item) throw new Error('该模型不在可信目录中。')
      return { ...item.config, profile, catalogId: item.id }
    },
    async publicStatus(profile = 'generation') {
      const config = await this.config(profile)
      return {
        configured: config.configured, profile, provider: config.provider,
        protocol: config.protocol, model: config.model, baseURL: config.baseURL,
        catalogId: config.catalogId,
      }
    },
  }

  return {
    users, lessons, capabilityReviews, modelSettings,
    schemaVersion: verification.schemaVersion,
    close() { database.close() },
  }
}

function check(label, jsonValue, sqliteValue) {
  const comparable = (value) => label === 'lesson-directory'
    ? value.map((entry) => ({
        ...entry,
        reviewHistory: entry.reviewHistory?.map(({ id: _id, ...event }) => event),
      }))
    : value
  const jsonRecords = Array.isArray(jsonValue) ? jsonValue.length : 1
  const sqliteRecords = Array.isArray(sqliteValue) ? sqliteValue.length : 1
  return {
    id: label,
    matched: semanticDigest(comparable(jsonValue)) === semanticDigest(comparable(sqliteValue)),
    jsonRecords,
    sqliteRecords,
  }
}

export async function compareJsonAndSqliteStores({ jsonStores, sqliteStore, now = () => new Date() }) {
  const pairs = await Promise.all([
    Promise.all([jsonStores.users.list(), sqliteStore.users.list()]),
    Promise.all([jsonStores.lessons.listForAdmin(), sqliteStore.lessons.listForAdmin()]),
    Promise.all([jsonStores.capabilityReviews.list(), sqliteStore.capabilityReviews.list()]),
    Promise.all([jsonStores.modelSettings.get(), sqliteStore.modelSettings.get()]),
  ])
  const checks = [
    check('users', ...pairs[0]),
    check('lesson-directory', ...pairs[1]),
    check('capability-reviews', ...pairs[2]),
    check('model-settings', ...pairs[3]),
  ]
  return {
    status: checks.every((item) => item.matched) ? 'matched' : 'diverged',
    checkedAt: now().toISOString(),
    mode: 'json-primary-sqlite-read-only',
    schemaVersion: sqliteStore.schemaVersion,
    checks,
  }
}
