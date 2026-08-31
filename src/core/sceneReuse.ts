import type { GenerationRoute } from './intentParser'
import { normalizePrompt } from './intentParser'
import type { LessonLibraryEntry } from './lessonLibrary'
import type { LessonPlan } from './modelGateway'
import type { LessonScene } from '../types/lessonScene'
import { isNumberParameter } from '../types/lessonScene'
import {
  CAPABILITY_REGISTRY,
  getCapabilityDefinition,
} from './capabilityRegistry'
import { TIME_EXPERIMENT_TEMPLATE_ID } from './timeExperiment'
import { assertLessonScene } from './validateScene'

export type SceneReuseMatchLevel = 'exact' | 'capability' | 'similar' | 'none'
export type SceneReuseSource = 'official' | 'verified-third-party' | 'none'

export interface SceneReuseCandidate {
  entryId: string
  title: string
  source: Exclude<SceneReuseSource, 'none'>
  matchLevel: Exclude<SceneReuseMatchLevel, 'none'>
  capabilityId?: string
  capabilityFingerprint: string
  score: number
  reason: string
  scene: LessonScene
}

export interface SceneReuseDecision {
  matchLevel: SceneReuseMatchLevel
  source: SceneReuseSource
  action: 'reuse-directly' | 'use-as-model-base' | 'generate' | 'stop'
  reason: string
  estimatedModelCallsSaved: number
  candidate?: SceneReuseCandidate
}

export interface ReusableSceneResult {
  scene: LessonScene
  changes: string[]
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function compactSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/核心/g, '焦点')
    .replace(/[，。！？、；：,.!?;:\s()[\]{}"'`]+/g, '')
}

function characterBigrams(value: string): Set<string> {
  const normalized = compactSearchText(value)
  const result = new Set<string>()
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2))
  }
  return result
}

function bigramSimilarity(left: string, right: string): number {
  const leftSet = characterBigrams(left)
  const rightSet = characterBigrams(right)
  if (leftSet.size === 0 || rightSet.size === 0) return 0
  let overlap = 0
  for (const item of leftSet) if (rightSet.has(item)) overlap += 1
  return overlap / Math.max(leftSet.size, rightSet.size)
}

export function capabilityIdForScene(scene: LessonScene): string | undefined {
  if (scene.templateRef.id === TIME_EXPERIMENT_TEMPLATE_ID) {
    return scene.metadata.subject === 'math'
      ? 'math.geometry.parametric-trace-2d'
      : 'physics.motion.point-2d'
  }
  return CAPABILITY_REGISTRY.find((capability) => (
    capability.templateId === scene.templateRef.id
    && capability.subject === scene.metadata.subject
  ))?.id
}

export function capabilityFingerprintOfScene(scene: LessonScene): string {
  const capabilityId = capabilityIdForScene(scene) ?? 'unregistered'
  const objectSignature = scene.objects
    .map((object) => `${object.kind}:${object.role}`)
    .sort()
    .join(',')
  const interactionSignature = scene.interactions
    .map((interaction) => `${interaction.trigger}:${interaction.action}`)
    .sort()
    .join(',')
  const parameterSignature = Object.entries(scene.parameters)
    .map(([id, parameter]) => `${id}:${parameter.type}`)
    .sort()
    .join(',')
  return [
    capabilityId,
    scene.templateRef.id,
    scene.metadata.subject,
    stableHash(objectSignature),
    stableHash(interactionSignature),
    stableHash(parameterSignature),
  ].join('|')
}

function eligibleEntry(entry: LessonLibraryEntry): boolean {
  return entry.source === 'official'
    || (entry.source === 'third-party' && entry.reviewStatus === 'verified')
}

function exactTextMatch(prompt: string, entry: LessonLibraryEntry): boolean {
  const normalized = compactSearchText(prompt)
  const candidates = [
    ...(entry.reuseHints?.aliases ?? []),
    entry.title,
    entry.topic,
  ].map(compactSearchText).filter((value) => value.length >= 4)
  return candidates.some((candidate) => normalized === candidate || normalized.includes(candidate))
}

function conceptMatch(prompt: string, entry: LessonLibraryEntry): boolean {
  const normalized = compactSearchText(prompt)
  return (entry.reuseHints?.conceptTerms ?? [])
    .map(compactSearchText)
    .some((term) => term.length > 0 && normalized.includes(term))
}

function interactionKinds(values: readonly string[]): Set<string> {
  const kinds = new Set<string>()
  for (const value of values) {
    if (/slider|调节|参数/.test(value)) kinds.add('slider')
    if (/animation|播放|暂停|动画/.test(value)) kinds.add('animation')
    if (/drag|拖动/.test(value)) kinds.add('drag')
    if (/vector|矢量|距离/.test(value)) kinds.add('vector')
    if (/constraint|约束|rope|spring/.test(value)) kinds.add('constraint')
    if (/zoom|缩放/.test(value)) kinds.add('zoom')
  }
  return kinds
}

function candidateSimilarity(
  prompt: string,
  route: GenerationRoute,
  entry: LessonLibraryEntry,
): number {
  const texts = [
    entry.title,
    entry.topic,
    entry.summary,
    ...(entry.reuseHints?.aliases ?? []),
  ]
  const textScore = Math.max(0, ...texts.map((text) => bigramSimilarity(prompt, text)))
  const normalized = compactSearchText(prompt)
  const keywords = entry.reuseHints?.keywords ?? []
  const keywordHits = keywords.filter((keyword) => normalized.includes(compactSearchText(keyword))).length
  const keywordScore = keywords.length > 0 ? Math.min(1, keywordHits / Math.min(3, keywords.length)) : 0
  const requestedInteractions = interactionKinds(route.interactions)
  const candidateInteractions = interactionKinds(entry.reuseHints?.interactionSignature ?? [])
  const interactionOverlap = requestedInteractions.size > 0
    ? [...requestedInteractions].filter((kind) => candidateInteractions.has(kind)).length / requestedInteractions.size
    : 0
  return Math.min(1, Math.max(textScore, keywordScore * 0.82) + interactionOverlap * 0.08)
}

function candidateForEntry(
  prompt: string,
  route: GenerationRoute,
  entry: LessonLibraryEntry,
): SceneReuseCandidate | null {
  if (!eligibleEntry(entry)) return null
  const capabilityId = capabilityIdForScene(entry.scene)
  const requestedCapabilityId = route.requiredCapabilities[0]?.id
  const sameCapability = requestedCapabilityId
    ? capabilityId === requestedCapabilityId
    : route.subject === undefined || entry.subject === route.subject
  if (!sameCapability) return null

  const source = entry.source === 'official' ? 'official' : 'verified-third-party'
  const fingerprint = capabilityFingerprintOfScene(entry.scene)
  if (exactTextMatch(prompt, entry)) {
    return {
      entryId: entry.id, title: entry.title, source, matchLevel: 'exact',
      capabilityId, capabilityFingerprint: fingerprint, score: 1,
      reason: '描述与已审核场景的标题、知识点或常用描述精确匹配。',
      scene: structuredClone(entry.scene),
    }
  }
  if (conceptMatch(prompt, entry)) {
    return {
      entryId: entry.id, title: entry.title, source, matchLevel: 'capability',
      capabilityId, capabilityFingerprint: fingerprint, score: 0.9,
      reason: '命中相同知识点和交互能力，可在本地复用场景并套用明确参数。',
      scene: structuredClone(entry.scene),
    }
  }

  const score = candidateSimilarity(prompt, route, entry)
  if (score < 0.42) return null
  return {
    entryId: entry.id, title: entry.title, source, matchLevel: 'similar',
    capabilityId, capabilityFingerprint: fingerprint, score,
    reason: '知识点或交互结构相似，可作为受约束二次编辑的基础场景。',
    scene: structuredClone(entry.scene),
  }
}

export function decideSceneReuse(
  prompt: string,
  route: GenerationRoute,
  entries: readonly LessonLibraryEntry[],
): SceneReuseDecision {
  if (route.kind === 'settings') {
    return {
      matchLevel: 'none', source: 'none', action: 'stop',
      reason: '参数和显示修改由本地面板完成。', estimatedModelCallsSaved: 1,
    }
  }
  if (route.kind === 'unsupported') {
    return {
      matchLevel: 'none', source: 'none', action: 'stop',
      reason: '缺少已注册渲染原语，不能通过复用或模型调用绕过。', estimatedModelCallsSaved: 1,
    }
  }
  if (route.kind === 'template') {
    return {
      matchLevel: 'capability', source: 'official', action: 'reuse-directly',
      reason: '已命中本地审核模板，可直接创建参数实例。', estimatedModelCallsSaved: 1,
    }
  }

  const candidates = entries
    .map((entry) => candidateForEntry(prompt, route, entry))
    .filter((candidate): candidate is SceneReuseCandidate => candidate !== null)
    .sort((left, right) => {
      if (left.matchLevel !== right.matchLevel) {
        const rank = { exact: 3, capability: 2, similar: 1 }
        return rank[right.matchLevel] - rank[left.matchLevel]
      }
      if (left.source !== right.source) return left.source === 'official' ? -1 : 1
      return right.score - left.score
    })
  const candidate = candidates[0]
  if (!candidate) {
    return {
      matchLevel: 'none', source: 'none', action: 'generate',
      reason: '未找到同能力的已审核场景，将使用注册运行时生成新规划。',
      estimatedModelCallsSaved: 0,
    }
  }
  if (candidate.matchLevel === 'exact' || candidate.matchLevel === 'capability') {
    return {
      matchLevel: candidate.matchLevel,
      source: candidate.source,
      action: 'reuse-directly',
      reason: candidate.reason,
      estimatedModelCallsSaved: 1,
      candidate,
    }
  }
  return {
    matchLevel: 'similar',
    source: candidate.source,
    action: 'use-as-model-base',
    reason: candidate.reason,
    estimatedModelCallsSaved: 0,
    candidate,
  }
}

function parameterTerms(id: string, label: string): string[] {
  const withoutId = label.replace(new RegExp(`\\b${id}\\b`, 'ig'), '').trim()
  return [...new Set([id, label, withoutId].filter((value) => value.length > 0))]
}

function extractParameterValue(prompt: string, id: string, label: string): number | null {
  for (const term of parameterTerms(id, label)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const boundary = /^[A-Za-z][A-Za-z0-9]*$/.test(term) ? '\\b' : ''
    const match = prompt.match(new RegExp(
      `${boundary}${escaped}${boundary}\\s*(?:为|设为|设置为|=|：|:)?\\s*(-?\\d+(?:\\.\\d+)?)`,
      'i',
    ))
    if (match?.[1] !== undefined) return Number(match[1])
  }
  return null
}

export function materializeReusableScene(
  candidate: SceneReuseCandidate,
  prompt: string,
): ReusableSceneResult {
  const scene = structuredClone(candidate.scene)
  const changes: string[] = []
  for (const [id, parameter] of Object.entries(scene.parameters)) {
    if (!isNumberParameter(parameter)) continue
    const value = extractParameterValue(prompt, id, parameter.label)
    if (value === null || value === parameter.value) continue
    if (!Number.isFinite(value) || value < parameter.min || value > parameter.max) {
      throw new Error(`${parameter.label}必须在 ${parameter.min} 到 ${parameter.max}${parameter.unit || ''} 之间。`)
    }
    parameter.value = value
    parameter.default = value
    changes.push(`${parameter.label}设为 ${value}${parameter.unit}`)
  }
  const now = new Date().toISOString()
  scene.id = `scene.reused.${stableHash(`${candidate.entryId}|${normalizePrompt(prompt)}|${now}`)}`
  scene.lineage = {
    source: 'local-parser',
    matchLevel: candidate.matchLevel === 'exact' ? 'exact' : 'template',
    fingerprint: `${candidate.capabilityFingerprint}|params:${stableHash(JSON.stringify(scene.parameters))}`.slice(0, 200),
    parentSceneId: candidate.scene.id,
    updatedAt: now,
  }
  assertLessonScene(scene)
  return { scene, changes }
}

export function templateReuseCacheKey(prompt: string, templateId: string): string {
  return `${normalizePrompt(prompt)}|path:template|target:${templateId}|schema:0.1|reuse:r4`
}

export function modelReuseCacheKey(
  prompt: string,
  capabilityId: string | undefined,
  provider: string,
  model: string,
  protocol = 'unspecified',
): string {
  return `${normalizePrompt(prompt)}|path:model-create|capability:${capabilityId ?? 'unclassified'}|model:${protocol}:${provider}:${model}|api:lesson-plan-1.4|schema:0.1|reuse:r6`
}

export function contextualReuseCacheKey(
  prompt: string,
  basePlan: LessonPlan,
  provider: string,
  model: string,
  protocol = 'unspecified',
): string {
  const baseFingerprint = stableHash(JSON.stringify(basePlan))
  return `${normalizePrompt(prompt)}|path:model-edit|template:${basePlan.templateId}|subject:${basePlan.subject}|base:${baseFingerprint}|model:${protocol}:${provider}:${model}|api:lesson-plan-1.4|schema:0.1|reuse:r6`
}

export function capabilityLimitSummary(capabilityId: string | undefined): string[] {
  const capability = capabilityId ? getCapabilityDefinition(capabilityId) : undefined
  return capability?.limits.map((limit) => `${limit.label}：${limit.value}`) ?? []
}
