import type { LessonScene, Subject } from '../types/lessonScene'
import type { LessonLibraryEntry } from './lessonLibrary'
import { createLessonPackageFromScene, parseLessonImport } from './lessonPackage'
import { GENERATION_API_VERSION } from './modelGateway'
import { modelRequestHeaders } from './modelRequestIdentity'

interface SharedDirectoryEntry {
  id: string
  reviewStatus: 'verified'
  title: string
  subject: Subject
  summary: string
  sourceFilename?: string
  createdAt: string
  updatedAt: string
  lessonPackage: unknown
}

export interface SharedLessonSubmissionResult {
  id: string
  duplicate: boolean
  reviewStatus: 'pending' | 'needs-changes' | 'verified' | 'rejected' | 'deprecated'
  revisionOf?: string
  supersededBy?: string
  preReview?: {
    status: 'queued' | 'completed' | 'failed'
    verdict?: 'no-issues' | 'issues-found'
    summary?: string
    issueCount?: number
    error?: string
  }
}

export interface SharedSubmissionStatus {
  id: string
  reviewStatus: SharedLessonSubmissionResult['reviewStatus']
  reviewNote?: string
  reviewedAt?: string
  updatedAt: string
  revisionOf?: string
  supersededBy?: string
  preReview?: SharedLessonSubmissionResult['preReview'] & {
    issues?: Array<{
      category: string
      severity: 'warning' | 'error' | 'critical'
      location: string
      finding: string
      suggestedAction: string
    }>
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function libraryBaseEndpoint(): string {
  return (import.meta.env.VITE_SHARED_LIBRARY_ENDPOINT || '/api/library').replace(/\/+$/, '')
}

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error(`共享目录返回了无法解析的响应（HTTP ${response.status}）。`)
  }
  if (!isRecord(payload)) throw new Error('共享目录返回格式不正确。')
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `共享目录请求失败（HTTP ${response.status}）。`)
  }
  return payload
}

function parseSharedEntry(value: unknown): LessonLibraryEntry {
  if (!isRecord(value)) throw new Error('共享目录包含无效条目。')
  if (
    typeof value.id !== 'string' || value.reviewStatus !== 'verified' ||
    typeof value.title !== 'string' || typeof value.summary !== 'string' ||
    !['math', 'physics', 'chemistry', 'geography'].includes(String(value.subject)) ||
    typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string' ||
    (value.sourceFilename !== undefined && typeof value.sourceFilename !== 'string')
  ) {
    throw new Error('共享目录条目元数据不正确。')
  }
  const imported = parseLessonImport(value.lessonPackage)
  if (imported.sourceFormat !== 'lesson-package') throw new Error('共享目录条目不是紧凑场景包。')
  const scene = imported.scene
  if (
    scene.metadata.subject !== value.subject || scene.metadata.title !== value.title ||
    scene.metadata.summary !== value.summary
  ) {
    throw new Error('共享目录条目元数据与场景包不一致。')
  }
  return {
    id: value.id,
    source: 'third-party',
    catalog: 'shared',
    reviewStatus: 'verified',
    title: value.title,
    subject: value.subject as Subject,
    topic: scene.metadata.topic,
    summary: value.summary,
    sourceFilename: value.sourceFilename as string | undefined,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    scene,
  }
}

function parseReviewStatus(value: unknown): SharedLessonSubmissionResult['reviewStatus'] {
  if (!['pending', 'needs-changes', 'verified', 'rejected', 'deprecated'].includes(String(value))) {
    throw new Error('共享目录返回了未知审核状态。')
  }
  return value as SharedLessonSubmissionResult['reviewStatus']
}

function parsePreReview(value: unknown): SharedSubmissionStatus['preReview'] {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new Error('共享目录返回了无效的 AI 预审状态。')
  const status = value.status
  if (!['queued', 'completed', 'failed'].includes(String(status))) {
    throw new Error('共享目录返回了未知的 AI 预审状态。')
  }
  const preReview: SharedSubmissionStatus['preReview'] = {
    status: status as 'queued' | 'completed' | 'failed',
  }
  if (status === 'completed') {
    const result = value.result
    if (!isRecord(result) || !['no-issues', 'issues-found'].includes(String(result.verdict)) || !Array.isArray(result.issues)) {
      throw new Error('共享目录返回了无效的 AI 预审结论。')
    }
    preReview.verdict = result.verdict as 'no-issues' | 'issues-found'
    preReview.summary = typeof result.summary === 'string' ? result.summary : undefined
    preReview.issueCount = result.issues.length
    const issues = result.issues.flatMap((issue) => {
      if (
        !isRecord(issue) || typeof issue.category !== 'string' ||
        !['warning', 'error', 'critical'].includes(String(issue.severity)) ||
        typeof issue.location !== 'string' || typeof issue.finding !== 'string' ||
        typeof issue.suggestedAction !== 'string'
      ) return []
      return [{
        category: issue.category,
        severity: issue.severity as 'warning' | 'error' | 'critical',
        location: issue.location,
        finding: issue.finding,
        suggestedAction: issue.suggestedAction,
      }]
    })
    if (issues.length > 0) preReview.issues = issues
  }
  return preReview
}

export async function loadSharedLessonLibrary(): Promise<LessonLibraryEntry[]> {
  const response = await fetch(`${libraryBaseEndpoint()}/entries`, {
    headers: { Accept: 'application/json' },
  })
  const payload = await responsePayload(response)
  if (payload.apiVersion !== GENERATION_API_VERSION) {
    throw new Error(`共享目录协议不兼容：当前应用需要 ${GENERATION_API_VERSION}。`)
  }
  if (!Array.isArray(payload.entries)) throw new Error('共享目录缺少条目列表。')
  return payload.entries.map(parseSharedEntry)
}

export async function submitSceneToSharedLibrary(
  scene: LessonScene,
  sourceFilename?: string,
  revisionParentId?: string,
  csrfToken?: string,
): Promise<SharedLessonSubmissionResult> {
  const lessonPackage = createLessonPackageFromScene(scene)
  const serializedBody = JSON.stringify({ lessonPackage, sourceFilename, revisionParentId })
  const response = await fetch(`${libraryBaseEndpoint()}/submissions`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json',
      ...modelRequestHeaders(serializedBody),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: serializedBody,
  })
  const payload = await responsePayload(response)
  if (typeof payload.duplicate !== 'boolean' || !isRecord(payload.entry)) {
    throw new Error('共享目录提交响应格式不正确。')
  }
  const reviewStatus = parseReviewStatus(payload.entry.reviewStatus)
  if (typeof payload.entry.id !== 'string') throw new Error('共享目录提交响应缺少条目 ID。')
  const preReview = parsePreReview(payload.entry.preReview)
  if (preReview?.status === 'failed') {
    preReview.error = isRecord(payload.entry.preReview) && typeof payload.entry.preReview.error === 'string'
      ? payload.entry.preReview.error
      : 'AI 预审未完成。'
  }
  return {
    id: payload.entry.id,
    duplicate: payload.duplicate,
    reviewStatus,
    ...(typeof payload.entry.revisionOf === 'string' ? { revisionOf: payload.entry.revisionOf } : {}),
    ...(typeof payload.entry.supersededBy === 'string' ? { supersededBy: payload.entry.supersededBy } : {}),
    preReview,
  }
}

export async function loadSharedSubmissionStatus(
  scene: LessonScene,
): Promise<SharedSubmissionStatus | null> {
  const lessonPackage = createLessonPackageFromScene(scene)
  const response = await fetch(`${libraryBaseEndpoint()}/submission-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ lessonPackage }),
  })
  const value = await responsePayload(response)
  if (value.entry === null) return null
  if (!isRecord(value.entry)) throw new Error('共享目录审核状态响应不完整。')
  if (
    typeof value.entry.id !== 'string' || typeof value.entry.updatedAt !== 'string' ||
    (value.entry.reviewNote !== undefined && typeof value.entry.reviewNote !== 'string') ||
    (value.entry.reviewedAt !== undefined && typeof value.entry.reviewedAt !== 'string') ||
    (value.entry.revisionOf !== undefined && typeof value.entry.revisionOf !== 'string') ||
    (value.entry.supersededBy !== undefined && typeof value.entry.supersededBy !== 'string')
  ) {
    throw new Error('共享目录审核反馈格式不正确。')
  }
  return {
    id: value.entry.id,
    reviewStatus: parseReviewStatus(value.entry.reviewStatus),
    reviewNote: value.entry.reviewNote,
    reviewedAt: value.entry.reviewedAt,
    updatedAt: value.entry.updatedAt,
    revisionOf: value.entry.revisionOf,
    supersededBy: value.entry.supersededBy,
    preReview: parsePreReview(value.entry.preReview),
  }
}
