import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const CAPABILITY_REVIEW_FORMAT = 'word2html.capability-subject-reviews'
export const CAPABILITY_REVIEW_VERSION = '0.2'
const LEGACY_CAPABILITY_REVIEW_VERSION = '0.1'

export const CAPABILITY_SUBJECT_REVIEW_IDS = Object.freeze([
  'math.function.explicit-2d',
  'math.data.chart-2d',
  'math.geometry.primitives-2d',
  'math.curve.relation-2d',
  'math.geometry.parametric-trace-2d',
  'physics.collision.discs-2d',
  'physics.motion.point-2d',
])

const REVIEW_ID_SET = new Set(CAPABILITY_SUBJECT_REVIEW_IDS)
const REVIEW_STATUSES = new Set(['pending', 'needs-changes', 'approved'])
const MAX_HISTORY = 100

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  return structuredClone(value)
}

function cleanText(value, label, { required = false, max = 4000 } = {}) {
  if (value === undefined || value === null) value = ''
  if (typeof value !== 'string') throw new Error(`${label}必须是文字。`)
  const text = value.trim()
  if (required && !text) throw new Error(`请填写${label}。`)
  if (text.length > max) throw new Error(`${label}不能超过 ${max} 个字符。`)
  return text
}

function cleanChecks(value) {
  if (!isRecord(value)) throw new Error('人工检查项格式无效。')
  const entries = Object.entries(value)
  if (entries.length === 0 || entries.length > 20) throw new Error('人工检查项数量无效。')
  const checks = {}
  for (const [id, checked] of entries) {
    if (!/^[a-z][a-z0-9-]{1,60}$/.test(id) || typeof checked !== 'boolean') {
      throw new Error('人工检查项包含无效字段。')
    }
    checks[id] = checked
  }
  return checks
}

function emptyRecord(capabilityId) {
  return {
    capabilityId,
    status: 'pending',
    reviewer: '',
    reviewerRole: '',
    reviewedVersion: '',
    reviewComment: '',
    checks: {},
    updatedAt: '',
    history: [],
  }
}

function assertStoredRecord(value) {
  if (
    !isRecord(value) || !REVIEW_ID_SET.has(value.capabilityId) ||
    !REVIEW_STATUSES.has(value.status) || !isRecord(value.checks) ||
    !Array.isArray(value.history)
  ) {
    throw new Error('能力学科复核数据包含无效记录。')
  }
  for (const key of [
    'reviewer', 'reviewerRole', 'reviewedVersion', 'reviewComment', 'updatedAt',
  ]) {
    if (typeof value[key] !== 'string') throw new Error('能力学科复核记录字段不完整。')
  }
  if (value.reviewedAt !== undefined && typeof value.reviewedAt !== 'string') {
    throw new Error('能力学科复核时间无效。')
  }
  for (const [id, checked] of Object.entries(value.checks)) {
    if (!/^[a-z][a-z0-9-]{1,60}$/.test(id) || typeof checked !== 'boolean') {
      throw new Error('能力学科复核检查项无效。')
    }
  }
  for (const event of value.history) {
    if (
      !isRecord(event) || typeof event.id !== 'string' || typeof event.at !== 'string' ||
      !REVIEW_STATUSES.has(event.status) || typeof event.reviewer !== 'string' ||
      typeof event.reviewerRole !== 'string' || typeof event.reviewedVersion !== 'string' ||
      typeof event.reviewComment !== 'string' || !isRecord(event.checks)
    ) {
      throw new Error('能力学科复核历史无效。')
    }
    if (Object.values(event.checks).some((checked) => typeof checked !== 'boolean')) {
      throw new Error('能力学科复核历史检查项无效。')
    }
  }
}

function emptyState() {
  return {
    format: CAPABILITY_REVIEW_FORMAT,
    formatVersion: CAPABILITY_REVIEW_VERSION,
    records: [],
  }
}

function migrateLegacyState(value) {
  return {
    format: CAPABILITY_REVIEW_FORMAT,
    formatVersion: CAPABILITY_REVIEW_VERSION,
    records: value.records.map((record) => ({
      capabilityId: record.capabilityId,
      status: record.status,
      reviewer: typeof record.reviewer === 'string' ? record.reviewer : '',
      reviewerRole: typeof record.reviewerRole === 'string' ? record.reviewerRole : '',
      reviewedVersion: typeof record.reviewedVersion === 'string' ? record.reviewedVersion : '',
      reviewComment: typeof record.findings === 'string' ? record.findings : '',
      checks: isRecord(record.checks) ? record.checks : {},
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
      reviewedAt: typeof record.reviewedAt === 'string' ? record.reviewedAt : undefined,
      history: Array.isArray(record.history) ? record.history.map((event) => ({
        id: event.id,
        at: event.at,
        status: event.status,
        reviewer: typeof event.reviewer === 'string' ? event.reviewer : '',
        reviewerRole: typeof event.reviewerRole === 'string' ? event.reviewerRole : '',
        reviewedVersion: typeof event.reviewedVersion === 'string' ? event.reviewedVersion : '',
        reviewComment: typeof event.findings === 'string' ? event.findings : '',
        checks: isRecord(event.checks) ? event.checks : {},
      })) : [],
    })),
  }
}

function assertState(value) {
  if (
    !isRecord(value) || value.format !== CAPABILITY_REVIEW_FORMAT ||
    ![CAPABILITY_REVIEW_VERSION, LEGACY_CAPABILITY_REVIEW_VERSION].includes(value.formatVersion) ||
    !Array.isArray(value.records)
  ) {
    throw new Error('能力学科复核数据文件格式不正确。')
  }
  const current = value.formatVersion === LEGACY_CAPABILITY_REVIEW_VERSION
    ? migrateLegacyState(value)
    : value
  const ids = new Set()
  for (const record of current.records) {
    assertStoredRecord(record)
    if (ids.has(record.capabilityId)) throw new Error('能力学科复核数据包含重复能力。')
    ids.add(record.capabilityId)
  }
  return current
}

export function normalizeCapabilityReviewDocument(value) {
  return assertState(value)
}

export function createCapabilitySubjectReviewStore({ dataFile, stateStorage, now = () => new Date() }) {
  if ((!stateStorage || typeof stateStorage.read !== 'function' || typeof stateStorage.write !== 'function') && (
    typeof dataFile !== 'string' || !dataFile
  )) throw new Error('能力复核数据文件路径不能为空。')

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

  return {
    async list() {
      const state = await load()
      const stored = new Map(state.records.map((record) => [record.capabilityId, record]))
      return CAPABILITY_SUBJECT_REVIEW_IDS.map((id) => clone(stored.get(id) ?? emptyRecord(id)))
    },

    async update(capabilityId, input) {
      if (!REVIEW_ID_SET.has(capabilityId)) throw new Error('未知的能力复核编号。')
      if (!isRecord(input) || !REVIEW_STATUSES.has(input.status)) throw new Error('能力复核结论无效。')

      const status = input.status
      const reviewer = cleanText(input.reviewer, '审核人', { required: true, max: 120 })
      const reviewerRole = cleanText(input.reviewerRole, '审核角色', { required: true, max: 160 })
      const reviewedVersion = cleanText(input.reviewedVersion, '被审版本', { required: true, max: 160 })
      const reviewComment = cleanText(input.reviewComment, '审阅意见', {
        required: status === 'needs-changes', max: 6000,
      })
      const checks = cleanChecks(input.checks)
      if (status === 'approved' && Object.values(checks).some((checked) => !checked)) {
        throw new Error('审核通过前必须完成全部人工检查项。')
      }

      return serialized(async () => {
        const state = await load()
        const existing = state.records.find((record) => record.capabilityId === capabilityId)
          ?? emptyRecord(capabilityId)
        const timestamp = now().toISOString()
        const snapshot = {
          id: `capability-review-event.${randomUUID()}`,
          at: timestamp,
          status,
          reviewer,
          reviewerRole,
          reviewedVersion,
          reviewComment,
          checks,
        }
        const next = {
          ...existing,
          capabilityId,
          status,
          reviewer,
          reviewerRole,
          reviewedVersion,
          reviewComment,
          checks,
          updatedAt: timestamp,
          reviewedAt: status === 'approved' ? timestamp : undefined,
          history: [...existing.history, snapshot].slice(-MAX_HISTORY),
        }
        const index = state.records.findIndex((record) => record.capabilityId === capabilityId)
        if (index >= 0) state.records[index] = next
        else state.records.push(next)
        await save(state)
        return clone(next)
      })
    },
  }
}
