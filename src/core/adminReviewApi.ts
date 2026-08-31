import type { Subject } from '../types/lessonScene'
import { modelRequestHeaders } from './modelRequestIdentity'

export type AdminReviewStatus =
  | 'pending'
  | 'needs-changes'
  | 'verified'
  | 'rejected'
  | 'deprecated'

export type PreReviewCategory =
  | 'scientific-accuracy'
  | 'formula-unit-consistency'
  | 'parameter-boundary'
  | 'teaching-suitability'
  | 'interaction-clarity'
  | 'safety-privacy'
  | 'maintenance'

export interface PreReviewIssue {
  category: PreReviewCategory
  severity: 'warning' | 'error' | 'critical'
  location: string
  finding: string
  suggestedAction: string
}

export interface AdminPreReview {
  status: 'queued' | 'completed' | 'failed'
  standardVersion: string
  requestedAt?: string
  completedAt?: string
  error?: string
  result?: {
    schemaVersion: string
    standardVersion: string
    verdict: 'no-issues' | 'issues-found'
    summary: string
    issues: PreReviewIssue[]
    manualReviewFocus: string[]
  }
  usage?: {
    inputTokens?: number
    cachedInputTokens?: number
    outputTokens?: number
    modelCalls?: number
    repaired?: boolean
    adjudicated?: boolean
  }
  provider?: { name: string; model: string }
}

export type AdminReviewEventType =
  | 'submitted'
  | 'revision-linked'
  | 'pre-review-queued'
  | 'pre-review-completed'
  | 'pre-review-failed'
  | 'moderated'

export interface AdminReviewEvent {
  id: string
  type: AdminReviewEventType
  actor: 'submitter' | 'admin' | 'ai' | 'system'
  at: string
  status?: AdminReviewStatus
  previousStatus?: AdminReviewStatus
  note?: string
  relatedEntryId?: string
  summary?: string
}

export interface AdminDirectoryEntry {
  id: string
  contentHash: string
  reviewStatus: AdminReviewStatus
  reviewNote?: string
  reviewedAt?: string
  revisionOf?: string
  supersededBy?: string
  title: string
  subject: Subject
  summary: string
  sourceFilename?: string
  createdAt: string
  updatedAt: string
  lessonPackage: unknown
  preReview?: AdminPreReview
  reviewHistory?: AdminReviewEvent[]
}

export interface AdminSession {
  csrfToken: string
  expiresAt: string
}

export type ModelProtocol = 'anthropic-compatible' | 'openai-compatible'

export interface TrustedModelProfile {
  id: string
  label: string
  provider: string
  protocol: ModelProtocol
  baseURL: string
  model: string
  keyConfigured: boolean
  maxTokens: number
  temperature: number
  timeout: number
  inputCostPerMillion: number
  outputCostPerMillion: number
}

export interface AdminModelSettings {
  formatVersion: string
  catalog: TrustedModelProfile[]
  enabledIds: string[]
  generationId: string
  reviewId: string
  updatedAt: string
}

export interface ModelConnectionTestResult {
  ok: true
  profile: 'generation' | 'review'
  modelId: string
  provider: string
  protocol: ModelProtocol
  model: string
  latencyMs: number
  usage: {
    inputTokens?: number
    cachedInputTokens?: number
    outputTokens?: number
  }
}

export interface AdminModelUsageStatus {
  day: string
  usage: {
    calls: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCostUsd: number
  }
  concurrency: { active: number; limit: number }
  limits: {
    platformDailyCalls: number
    platformDailyTokens: number
    platformDailyCostUsd: number
    clientDailyCalls: number
    clientDailyTokens: number
    clientConcurrency: number
    windowMs: number
    scopeLimits: Record<string, number>
  }
  fuse: { calls: boolean; tokens: boolean; cost: boolean }
}

export interface AdminStorageShadowStatus {
  status: 'not-configured' | 'matched' | 'diverged' | 'unavailable' | 'runtime-pilot' | 'runtime-active'
  mode: 'json-primary' | 'json-primary-sqlite-read-only' | 'sqlite-maintenance-pilot' | 'sqlite-single-instance-active'
  checkedAt?: string
  schemaVersion?: number
  runtimeRevision?: number
  checks: Array<{
    id: 'users' | 'lesson-directory' | 'capability-reviews' | 'model-settings'
    matched: boolean
    jsonRecords: number
    sqliteRecords: number
    runtimeRevision?: number
  }>
}

export type OperationalSeverity = 'info' | 'warning' | 'error' | 'critical'
export type OperationalCategory = 'process' | 'storage' | 'http' | 'model' | 'security' | 'maintenance'

export interface AdminOperationalEvent {
  id: string
  severity: OperationalSeverity
  category: OperationalCategory
  code: string
  summary: string
  context: Record<string, unknown>
  occurrences: number
  firstAt: string
  lastAt: string
  resolvedAt?: string
}

export interface AdminOperationalStatus {
  status: 'healthy' | 'attention' | 'critical'
  counts: Record<OperationalSeverity, number>
  retained: number
  limit: number
  updatedAt?: string
  events: AdminOperationalEvent[]
}

export interface AdminUserAccount {
  id: string
  displayName: string
  status: 'active' | 'paused'
  quota: { dailyCalls: number; dailyTokens: number }
  usage: {
    day: string
    calls: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    active: number
  }
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
  invitePending: boolean
  inviteExpiresAt?: string
}

export interface AdminUserInviteResult {
  user: AdminUserAccount
  accessCode: string
}

export type CapabilitySubjectReviewStatus = 'pending' | 'needs-changes' | 'approved'

export interface CapabilitySubjectReviewEvent {
  id: string
  at: string
  status: CapabilitySubjectReviewStatus
  reviewer: string
  reviewerRole: string
  reviewedVersion: string
  reviewComment: string
  checks: Record<string, boolean>
}

export interface CapabilitySubjectReviewRecord {
  capabilityId: string
  status: CapabilitySubjectReviewStatus
  reviewer: string
  reviewerRole: string
  reviewedVersion: string
  reviewComment: string
  checks: Record<string, boolean>
  updatedAt: string
  reviewedAt?: string
  history: CapabilitySubjectReviewEvent[]
}

export interface CapabilitySubjectReviewInput {
  status: CapabilitySubjectReviewStatus
  reviewer: string
  reviewerRole: string
  reviewedVersion: string
  reviewComment: string
  checks: Record<string, boolean>
}

export class AdminApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function payload(response: Response): Promise<Record<string, unknown>> {
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new AdminApiError(`审核服务返回了无法解析的响应（HTTP ${response.status}）。`, response.status)
  }
  if (!isRecord(value)) throw new AdminApiError('审核服务响应格式不正确。', response.status)
  if (!response.ok) {
    throw new AdminApiError(
      typeof value.error === 'string' ? value.error : `审核服务请求失败（HTTP ${response.status}）。`,
      response.status,
    )
  }
  return value
}

function parseEntry(value: unknown): AdminDirectoryEntry {
  if (!isRecord(value)) throw new Error('审核队列包含无效条目。')
  const statuses: AdminReviewStatus[] = ['pending', 'needs-changes', 'verified', 'rejected', 'deprecated']
  const subjects: Subject[] = ['math', 'physics', 'chemistry', 'geography']
  const eventTypes: AdminReviewEventType[] = [
    'submitted', 'revision-linked', 'pre-review-queued',
    'pre-review-completed', 'pre-review-failed', 'moderated',
  ]
  const eventActors: AdminReviewEvent['actor'][] = ['submitter', 'admin', 'ai', 'system']
  const validHistory = value.reviewHistory === undefined || (
    Array.isArray(value.reviewHistory) && value.reviewHistory.every((event) => {
      if (!isRecord(event)) return false
      return (
        typeof event.id === 'string' && eventTypes.includes(event.type as AdminReviewEventType) &&
        eventActors.includes(event.actor as AdminReviewEvent['actor']) && typeof event.at === 'string' &&
        (event.status === undefined || statuses.includes(event.status as AdminReviewStatus)) &&
        (event.previousStatus === undefined || statuses.includes(event.previousStatus as AdminReviewStatus)) &&
        (event.note === undefined || typeof event.note === 'string') &&
        (event.relatedEntryId === undefined || typeof event.relatedEntryId === 'string') &&
        (event.summary === undefined || typeof event.summary === 'string')
      )
    })
  )
  if (
    typeof value.id !== 'string' || typeof value.contentHash !== 'string' ||
    !statuses.includes(value.reviewStatus as AdminReviewStatus) ||
    typeof value.title !== 'string' || !subjects.includes(value.subject as Subject) ||
    typeof value.summary !== 'string' || typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' || !isRecord(value.lessonPackage)
    || (value.revisionOf !== undefined && typeof value.revisionOf !== 'string')
    || (value.supersededBy !== undefined && typeof value.supersededBy !== 'string')
    || !validHistory
  ) {
    throw new Error('审核队列条目元数据不完整。')
  }
  return value as unknown as AdminDirectoryEntry
}

function parseCapabilitySubjectReview(value: unknown): CapabilitySubjectReviewRecord {
  const statuses: CapabilitySubjectReviewStatus[] = ['pending', 'needs-changes', 'approved']
  if (
    !isRecord(value) || typeof value.capabilityId !== 'string' ||
    !statuses.includes(value.status as CapabilitySubjectReviewStatus) ||
    typeof value.reviewer !== 'string' || typeof value.reviewerRole !== 'string' ||
    typeof value.reviewedVersion !== 'string' || typeof value.reviewComment !== 'string' ||
    !isRecord(value.checks) || typeof value.updatedAt !== 'string' || !Array.isArray(value.history)
  ) {
    throw new Error('能力学科复核记录格式不完整。')
  }
  if (Object.values(value.checks).some((checked) => typeof checked !== 'boolean')) {
    throw new Error('能力学科复核检查项格式无效。')
  }
  return value as unknown as CapabilitySubjectReviewRecord
}

function parseTrustedModelProfile(value: unknown): TrustedModelProfile {
  const protocols: ModelProtocol[] = ['anthropic-compatible', 'openai-compatible']
  if (
    !isRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string' ||
    typeof value.provider !== 'string' || !protocols.includes(value.protocol as ModelProtocol) ||
    typeof value.baseURL !== 'string' || typeof value.model !== 'string' ||
    typeof value.keyConfigured !== 'boolean' || typeof value.maxTokens !== 'number' ||
    typeof value.temperature !== 'number' || typeof value.timeout !== 'number' ||
    typeof value.inputCostPerMillion !== 'number' || typeof value.outputCostPerMillion !== 'number'
  ) throw new Error('可信模型目录响应格式不完整。')
  return value as unknown as TrustedModelProfile
}

function parseModelSettings(value: unknown): AdminModelSettings {
  if (
    !isRecord(value) || typeof value.formatVersion !== 'string' || !Array.isArray(value.catalog) ||
    !Array.isArray(value.enabledIds) || value.enabledIds.some((id) => typeof id !== 'string') ||
    typeof value.generationId !== 'string' || typeof value.reviewId !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) throw new Error('模型设置响应格式不完整。')
  return { ...value, catalog: value.catalog.map(parseTrustedModelProfile) } as unknown as AdminModelSettings
}

function parseConnectionTestResult(value: unknown): ModelConnectionTestResult {
  const protocols: ModelProtocol[] = ['anthropic-compatible', 'openai-compatible']
  if (
    !isRecord(value) || value.ok !== true || !['generation', 'review'].includes(String(value.profile)) ||
    typeof value.modelId !== 'string' || typeof value.provider !== 'string' ||
    !protocols.includes(value.protocol as ModelProtocol) || typeof value.model !== 'string' ||
    typeof value.latencyMs !== 'number' || !isRecord(value.usage)
  ) throw new Error('模型连接测试响应格式不完整。')
  return value as unknown as ModelConnectionTestResult
}

function parseModelUsageStatus(value: unknown): AdminModelUsageStatus {
  if (
    !isRecord(value) || typeof value.day !== 'string' || !isRecord(value.usage) ||
    typeof value.usage.calls !== 'number' || typeof value.usage.inputTokens !== 'number' ||
    typeof value.usage.outputTokens !== 'number' || typeof value.usage.totalTokens !== 'number' ||
    typeof value.usage.estimatedCostUsd !== 'number' || !isRecord(value.concurrency) ||
    typeof value.concurrency.active !== 'number' || typeof value.concurrency.limit !== 'number' ||
    !isRecord(value.limits) || typeof value.limits.platformDailyCalls !== 'number' ||
    typeof value.limits.platformDailyTokens !== 'number' ||
    typeof value.limits.platformDailyCostUsd !== 'number' ||
    typeof value.limits.clientDailyCalls !== 'number' ||
    typeof value.limits.clientDailyTokens !== 'number' ||
    typeof value.limits.clientConcurrency !== 'number' || typeof value.limits.windowMs !== 'number' ||
    !isRecord(value.limits.scopeLimits) ||
    Object.values(value.limits.scopeLimits).some((limit) => typeof limit !== 'number') ||
    !isRecord(value.fuse) || typeof value.fuse.calls !== 'boolean' ||
    typeof value.fuse.tokens !== 'boolean' || typeof value.fuse.cost !== 'boolean'
  ) throw new Error('模型用量状态响应格式不完整。')
  return value as unknown as AdminModelUsageStatus
}

function parseStorageShadowStatus(value: unknown): AdminStorageShadowStatus {
  const statuses = ['not-configured', 'matched', 'diverged', 'unavailable', 'runtime-pilot', 'runtime-active']
  const modes = ['json-primary', 'json-primary-sqlite-read-only', 'sqlite-maintenance-pilot', 'sqlite-single-instance-active']
  if (
    !isRecord(value) || !statuses.includes(String(value.status)) ||
    !modes.includes(String(value.mode)) || !Array.isArray(value.checks) ||
    (value.checkedAt !== undefined && typeof value.checkedAt !== 'string') ||
    (value.schemaVersion !== undefined && typeof value.schemaVersion !== 'number') ||
    (value.runtimeRevision !== undefined && typeof value.runtimeRevision !== 'number')
  ) throw new Error('SQLite 影子对比响应格式不完整。')
  for (const check of value.checks) {
    if (
      !isRecord(check) || !['users', 'lesson-directory', 'capability-reviews', 'model-settings'].includes(String(check.id)) ||
      typeof check.matched !== 'boolean' || typeof check.jsonRecords !== 'number' ||
      typeof check.sqliteRecords !== 'number' ||
      (check.runtimeRevision !== undefined && typeof check.runtimeRevision !== 'number')
    ) throw new Error('SQLite 影子对比检查项格式不完整。')
  }
  return value as unknown as AdminStorageShadowStatus
}

function parseOperationalStatus(value: unknown): AdminOperationalStatus {
  const statuses = ['healthy', 'attention', 'critical']
  const severities: OperationalSeverity[] = ['info', 'warning', 'error', 'critical']
  const categories: OperationalCategory[] = ['process', 'storage', 'http', 'model', 'security', 'maintenance']
  const counts = isRecord(value) && isRecord(value.counts) ? value.counts : undefined
  if (
    !isRecord(value) || !statuses.includes(String(value.status)) || !counts ||
    severities.some((severity) => typeof counts[severity] !== 'number') ||
    typeof value.retained !== 'number' || typeof value.limit !== 'number' || !Array.isArray(value.events) ||
    (value.updatedAt !== undefined && typeof value.updatedAt !== 'string')
  ) throw new Error('运行告警状态响应格式不完整。')
  for (const event of value.events) {
    if (
      !isRecord(event) || typeof event.id !== 'string' ||
      !severities.includes(event.severity as OperationalSeverity) ||
      !categories.includes(event.category as OperationalCategory) ||
      typeof event.code !== 'string' || typeof event.summary !== 'string' || !isRecord(event.context) ||
      typeof event.occurrences !== 'number' || typeof event.firstAt !== 'string' ||
      typeof event.lastAt !== 'string' ||
      (event.resolvedAt !== undefined && typeof event.resolvedAt !== 'string')
    ) throw new Error('运行告警事件格式不完整。')
  }
  return value as unknown as AdminOperationalStatus
}

function parseAdminUser(value: unknown): AdminUserAccount {
  if (
    !isRecord(value) || typeof value.id !== 'string' || typeof value.displayName !== 'string' ||
    !['active', 'paused'].includes(String(value.status)) || !isRecord(value.quota) ||
    typeof value.quota.dailyCalls !== 'number' || typeof value.quota.dailyTokens !== 'number' ||
    !isRecord(value.usage) || typeof value.usage.day !== 'string' ||
    typeof value.usage.calls !== 'number' || typeof value.usage.inputTokens !== 'number' ||
    typeof value.usage.outputTokens !== 'number' || typeof value.usage.totalTokens !== 'number' ||
    typeof value.usage.active !== 'number' || typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' || typeof value.invitePending !== 'boolean'
  ) throw new Error('管理员用户记录格式不完整。')
  return value as unknown as AdminUserAccount
}

function parseUserWithoutUsage(value: unknown): Omit<AdminUserAccount, 'usage'> {
  if (
    !isRecord(value) || typeof value.id !== 'string' || typeof value.displayName !== 'string' ||
    !['active', 'paused'].includes(String(value.status)) || !isRecord(value.quota) ||
    typeof value.quota.dailyCalls !== 'number' || typeof value.quota.dailyTokens !== 'number' ||
    typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string' ||
    typeof value.invitePending !== 'boolean'
  ) throw new Error('用户设置响应格式不完整。')
  return value as unknown as Omit<AdminUserAccount, 'usage'>
}

function sessionFrom(value: Record<string, unknown>): AdminSession {
  if (value.authenticated !== true || typeof value.csrfToken !== 'string' || typeof value.expiresAt !== 'string') {
    throw new Error('管理员会话响应不完整。')
  }
  return { csrfToken: value.csrfToken, expiresAt: value.expiresAt }
}

export async function restoreAdminSession(): Promise<AdminSession | null> {
  const response = await fetch('/api/admin/session', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  if (response.status === 401) return null
  return sessionFrom(await payload(response))
}

export async function loginAdmin(token: string): Promise<AdminSession> {
  const response = await fetch('/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token }),
  })
  return sessionFrom(await payload(response))
}

export async function logoutAdmin(csrfToken: string): Promise<void> {
  const response = await fetch('/api/admin/session', {
    method: 'DELETE',
    headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken },
    credentials: 'same-origin',
  })
  await payload(response)
}

export async function loadAdminSubmissions(): Promise<AdminDirectoryEntry[]> {
  const response = await fetch('/api/admin/library/submissions', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  const value = await payload(response)
  if (!Array.isArray(value.entries)) throw new Error('审核服务响应缺少提交列表。')
  return value.entries.map(parseEntry)
}

export async function loadCapabilitySubjectReviews(): Promise<CapabilitySubjectReviewRecord[]> {
  const response = await fetch('/api/admin/capability-reviews', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  const value = await payload(response)
  if (!Array.isArray(value.records)) throw new Error('审核服务响应缺少能力复核列表。')
  return value.records.map(parseCapabilitySubjectReview)
}

export async function saveCapabilitySubjectReview(
  capabilityId: string,
  input: CapabilitySubjectReviewInput,
  csrfToken: string,
): Promise<CapabilitySubjectReviewRecord> {
  const response = await fetch(`/api/admin/capability-reviews/${encodeURIComponent(capabilityId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  })
  const value = await payload(response)
  return parseCapabilitySubjectReview(value.record)
}

export async function moderateAdminSubmission(
  id: string,
  reviewStatus: AdminReviewStatus,
  reviewNote: string,
  csrfToken: string,
): Promise<AdminDirectoryEntry> {
  const response = await fetch(`/api/admin/library/submissions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    credentials: 'same-origin',
    body: JSON.stringify({ reviewStatus, reviewNote }),
  })
  const value = await payload(response)
  return parseEntry(value.entry)
}

export async function retryAdminPreReview(
  id: string,
  csrfToken: string,
): Promise<AdminDirectoryEntry> {
  const requestMarker = JSON.stringify({ id, action: 'retry-pre-review' })
  const response = await fetch(`/api/admin/library/submissions/${encodeURIComponent(id)}/pre-review`, {
    method: 'POST',
    headers: {
      Accept: 'application/json', 'X-CSRF-Token': csrfToken,
      ...modelRequestHeaders(requestMarker, { unique: true }),
    },
    credentials: 'same-origin',
  })
  const value = await payload(response)
  return parseEntry(value.entry)
}

export async function loadAdminModelSettings(): Promise<AdminModelSettings> {
  const response = await fetch('/api/admin/model-settings', {
    headers: { Accept: 'application/json' }, credentials: 'same-origin',
  })
  return parseModelSettings((await payload(response)).settings)
}

export async function loadAdminModelUsage(): Promise<AdminModelUsageStatus> {
  const response = await fetch('/api/admin/model-usage', {
    headers: { Accept: 'application/json' }, credentials: 'same-origin',
  })
  return parseModelUsageStatus((await payload(response)).status)
}

export async function loadAdminStorageShadow(): Promise<AdminStorageShadowStatus> {
  const response = await fetch('/api/admin/storage-shadow', {
    headers: { Accept: 'application/json' }, credentials: 'same-origin',
  })
  return parseStorageShadowStatus((await payload(response)).status)
}

export async function loadAdminOperationalEvents(): Promise<AdminOperationalStatus> {
  const response = await fetch('/api/admin/operational-events', {
    headers: { Accept: 'application/json' }, credentials: 'same-origin',
  })
  return parseOperationalStatus((await payload(response)).status)
}

export async function loadAdminUsers(): Promise<AdminUserAccount[]> {
  const response = await fetch('/api/admin/users', {
    headers: { Accept: 'application/json' }, credentials: 'same-origin',
  })
  const value = await payload(response)
  if (!Array.isArray(value.users)) throw new Error('用户管理响应缺少账号列表。')
  return value.users.map(parseAdminUser)
}

async function userMutation(
  path: string,
  method: 'POST' | 'PATCH',
  csrfToken: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method,
    headers: {
      Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken,
    },
    credentials: 'same-origin',
    body: JSON.stringify(body ?? {}),
  })
  return payload(response)
}

export async function createAdminUser(
  input: { displayName: string; dailyCalls: number; dailyTokens: number },
  csrfToken: string,
): Promise<{ user: Omit<AdminUserAccount, 'usage'>; accessCode: string }> {
  const value = await userMutation('/api/admin/users', 'POST', csrfToken, input)
  if (typeof value.accessCode !== 'string') throw new Error('用户创建响应缺少一次性登录码。')
  return { user: parseUserWithoutUsage(value.user), accessCode: value.accessCode }
}

export async function updateAdminUser(
  id: string,
  input: { displayName: string; status: 'active' | 'paused'; dailyCalls: number; dailyTokens: number },
  csrfToken: string,
): Promise<Omit<AdminUserAccount, 'usage'>> {
  const value = await userMutation(`/api/admin/users/${encodeURIComponent(id)}`, 'PATCH', csrfToken, input)
  return parseUserWithoutUsage(value.user)
}

export async function issueAdminUserInvite(
  id: string,
  csrfToken: string,
): Promise<{ user: Omit<AdminUserAccount, 'usage'>; accessCode: string }> {
  const value = await userMutation(`/api/admin/users/${encodeURIComponent(id)}/invite`, 'POST', csrfToken)
  if (typeof value.accessCode !== 'string') throw new Error('登录码签发响应不完整。')
  return { user: parseUserWithoutUsage(value.user), accessCode: value.accessCode }
}

export async function saveAdminModelSettings(
  input: Pick<AdminModelSettings, 'enabledIds' | 'generationId' | 'reviewId'>,
  csrfToken: string,
): Promise<AdminModelSettings> {
  const response = await fetch('/api/admin/model-settings', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrfToken,
    },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  })
  return parseModelSettings((await payload(response)).settings)
}

export async function testAdminModelConnection(
  modelId: string,
  profile: 'generation' | 'review',
  csrfToken: string,
): Promise<ModelConnectionTestResult> {
  const serializedBody = JSON.stringify({ modelId, profile })
  const response = await fetch('/api/admin/model-settings/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrfToken,
      ...modelRequestHeaders(serializedBody, { unique: true }),
    },
    credentials: 'same-origin',
    body: serializedBody,
  })
  return parseConnectionTestResult((await payload(response)).result)
}
