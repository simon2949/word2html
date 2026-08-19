import { createEllipseScene } from '../templates/ellipseTemplate'
import { createQuadraticScene } from '../templates/quadraticTemplate'
import type { LessonScene, Subject } from '../types/lessonScene'
import {
  assertSceneRendererSupported,
  instantiateLessonPlan,
  type LessonPlan,
} from './modelGateway'
import { assertLessonScene } from './validateScene'

const THIRD_PARTY_LIBRARY_KEY = 'word2html.lesson-library.third-party.v0.1'
const MAX_THIRD_PARTY_ENTRIES = 30
const OFFICIAL_UPDATED_AT = '2026-08-19T00:00:00.000Z'

export type LessonLibrarySource = 'official' | 'third-party'
export type LessonReviewStatus = 'official' | 'pending' | 'verified'

export interface LessonLibraryEntry {
  id: string
  source: LessonLibrarySource
  reviewStatus: LessonReviewStatus
  title: string
  subject: Subject
  topic: string
  summary: string
  sourceFilename?: string
  createdAt: string
  updatedAt: string
  scene: LessonScene
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function officialScene(id: string, scene: LessonScene): LessonScene {
  const next = structuredClone(scene)
  next.id = `scene.official.${id}`
  next.lineage = {
    source: 'built-in',
    matchLevel: 'template',
    fingerprint: `official|${id}|${next.lineage.fingerprint}`.slice(0, 200),
    updatedAt: OFFICIAL_UPDATED_AT,
  }
  assertLessonScene(next)
  assertSceneRendererSupported(next)
  return next
}

function officialEntry(id: string, scene: LessonScene): LessonLibraryEntry {
  const reviewed = officialScene(id, scene)
  return {
    id: `official.${id}`,
    source: 'official',
    reviewStatus: 'official',
    title: reviewed.metadata.title,
    subject: reviewed.metadata.subject,
    topic: reviewed.metadata.topic,
    summary: reviewed.metadata.summary,
    createdAt: OFFICIAL_UPDATED_AT,
    updatedAt: OFFICIAL_UPDATED_AT,
    scene: reviewed,
  }
}

const sinePlan: LessonPlan = {
  schemaVersion: '0.1',
  status: 'matched',
  subject: 'math',
  topic: '正弦函数的振幅与频率',
  templateId: 'math.function.generic-2d',
  parameterOverrides: {},
  functionSpec: {
    expression: 'A*sin(B*x)',
    formula: 'y = A sin(Bx)',
    xMin: -10,
    xMax: 10,
    parameters: [
      { id: 'A', label: '振幅 A', value: 2, min: 0.5, max: 5, step: 0.1 },
      { id: 'B', label: '频率 B', value: 1, min: 0.2, max: 3, step: 0.1 },
    ],
  },
  reason: '调节 A 和 B，观察振幅与频率对正弦函数图像的影响。',
}

const freeFallPlan: LessonPlan = {
  schemaVersion: '0.1',
  status: 'matched',
  subject: 'physics',
  topic: '自由落体运动',
  templateId: 'experiment.motion.point-2d',
  parameterOverrides: {},
  experimentSpec: {
    durationExpression: 'sqrt(2*h0/g)',
    xExpression: '0',
    yExpression: 'max(0,h0-0.5*g*t^2)',
    formula: 'h(t) = h0 - 0.5gt^2',
    conclusion: '忽略空气阻力时，下落加速度保持为 g，速度随时间线性增加。',
    parameters: [
      { id: 'h0', label: '初始高度', value: 20, min: 2, max: 50, step: 1 },
      { id: 'g', label: '重力加速度', value: 9.8, min: 1, max: 15, step: 0.1 },
    ],
    metrics: [
      { id: 'height', label: '当前高度', expression: 'max(0,h0-0.5*g*t^2)', unit: 'm' },
      { id: 'speed', label: '当前速度', expression: 'g*t', unit: 'm/s' },
    ],
    vectors: [
      { id: 'velocity', label: '速度', xExpression: '0', yExpression: '0-g*t', scale: 0.1, unit: 'm/s' },
      { id: 'gravity', label: '重力加速度', xExpression: '0', yExpression: '0-g', scale: 0.15, unit: 'm/s^2' },
    ],
  },
  reason: '用受限点运动运行时演示自由落体。',
}

const dualPendulumPlan: LessonPlan = {
  schemaVersion: '0.1',
  status: 'matched',
  subject: 'physics',
  topic: '两个独立单摆的周期比较',
  templateId: 'experiment.motion.point-2d',
  parameterOverrides: {},
  experimentSpec: {
    durationExpression: '4*pi*sqrt(max(L1,L2)/g)',
    bodyId: 'pendulum1',
    bodyLabel: '左摆球',
    xExpression: '0-2+L1*sin(theta1)',
    yExpression: '0-L1*cos(theta1)',
    formula: 'T = 2pi sqrt(L/g)',
    conclusion: '在小角度近似下，摆长越长周期越大；两个摆长均可独立调节。',
    parameters: [
      { id: 'g', label: '重力加速度', value: 9.8, min: 1, max: 20, step: 0.1 },
      { id: 'L1', label: '左摆长', value: 1, min: 0.3, max: 3, step: 0.1 },
      { id: 'L2', label: '右摆长', value: 1.5, min: 0.3, max: 3, step: 0.1 },
      { id: 'theta01', label: '左初始角', value: 0.25, min: 0.05, max: 0.35, step: 0.01 },
      { id: 'theta02', label: '右初始角', value: 0.2, min: 0.05, max: 0.35, step: 0.01 },
    ],
    metrics: [
      { id: 'theta1', label: '左摆角', expression: 'theta01*cos(sqrt(g/L1)*t)', unit: 'rad' },
      { id: 'theta2', label: '右摆角', expression: 'theta02*cos(sqrt(g/L2)*t)', unit: 'rad' },
    ],
    additionalBodies: [{
      id: 'pendulum2',
      label: '右摆球',
      xExpression: '2+L2*sin(theta2)',
      yExpression: '0-L2*cos(theta2)',
    }],
    vectors: [],
    constraints: [
      {
        id: 'rope1', label: '左摆绳', type: 'rope', bodyId: 'pendulum1',
        anchorXExpression: '0-2', anchorYExpression: '0', restLengthExpression: 'L1',
      },
      {
        id: 'rope2', label: '右摆绳', type: 'rope', bodyId: 'pendulum2',
        anchorXExpression: '2', anchorYExpression: '0', restLengthExpression: 'L2',
      },
    ],
  },
  reason: '用两个受绳长约束的质点比较单摆周期。',
}

const officialEntries = [
  officialEntry('ellipse-focus-sum', createEllipseScene()),
  officialEntry('quadratic-vertex', createQuadraticScene()),
  officialEntry('sine-parameters', instantiateLessonPlan(sinePlan)),
  officialEntry('free-fall', instantiateLessonPlan(freeFallPlan)),
  officialEntry('dual-pendulum', instantiateLessonPlan(dualPendulumPlan)),
]

function validThirdPartyEntry(value: unknown): value is LessonLibraryEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Partial<LessonLibraryEntry>
  if (
    typeof entry.id !== 'string' || entry.source !== 'third-party' ||
    !['pending', 'verified'].includes(entry.reviewStatus ?? '') ||
    typeof entry.title !== 'string' || typeof entry.topic !== 'string' ||
    typeof entry.summary !== 'string' ||
    !['math', 'physics', 'chemistry', 'geography'].includes(entry.subject ?? '') ||
    (entry.sourceFilename !== undefined && typeof entry.sourceFilename !== 'string') ||
    typeof entry.createdAt !== 'string' || typeof entry.updatedAt !== 'string'
  ) return false
  try {
    assertLessonScene(entry.scene)
    assertSceneRendererSupported(entry.scene)
    return true
  } catch {
    return false
  }
}

export function getOfficialLibraryEntries(): LessonLibraryEntry[] {
  return structuredClone(officialEntries)
}

export function loadThirdPartyLibrary(): LessonLibraryEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(THIRD_PARTY_LIBRARY_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    const entries = value.filter(validThirdPartyEntry).slice(0, MAX_THIRD_PARTY_ENTRIES)
    if (entries.length !== value.length) {
      localStorage.setItem(THIRD_PARTY_LIBRARY_KEY, JSON.stringify(entries))
    }
    return structuredClone(entries)
  } catch {
    return []
  }
}

export function saveThirdPartyScene(scene: LessonScene, sourceFilename?: string): LessonLibraryEntry {
  assertLessonScene(scene)
  assertSceneRendererSupported(scene)
  const now = new Date().toISOString()
  const fingerprint = scene.lineage.fingerprint || `${scene.templateRef.id}|${scene.metadata.topic}`
  const id = `third-party.${stableHash(fingerprint)}`
  const entries = loadThirdPartyLibrary()
  const existing = entries.find((entry) => entry.id === id)
  const imported = structuredClone(scene)
  imported.lineage.source = 'imported'
  imported.lineage.updatedAt = now
  const entry: LessonLibraryEntry = {
    id,
    source: 'third-party',
    reviewStatus: existing?.reviewStatus === 'verified' ? 'verified' : 'pending',
    title: imported.metadata.title,
    subject: imported.metadata.subject,
    topic: imported.metadata.topic,
    summary: imported.metadata.summary,
    sourceFilename: sourceFilename || existing?.sourceFilename,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    scene: imported,
  }
  const next = [entry, ...entries.filter((item) => item.id !== id)]
    .slice(0, MAX_THIRD_PARTY_ENTRIES)
  localStorage.setItem(THIRD_PARTY_LIBRARY_KEY, JSON.stringify(next))
  return structuredClone(entry)
}

export function removeThirdPartyEntry(id: string): LessonLibraryEntry[] {
  const next = loadThirdPartyLibrary().filter((entry) => entry.id !== id)
  localStorage.setItem(THIRD_PARTY_LIBRARY_KEY, JSON.stringify(next))
  return next
}
