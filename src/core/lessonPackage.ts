import {
  assertLessonPlan,
  assertSceneRendererSupported,
  GENERATION_API_VERSION,
  instantiateLessonPlan,
  lessonPlanFromScene,
  type LessonPlan,
} from './modelGateway'
import { assertLessonScene } from './validateScene'
import type { LessonScene } from '../types/lessonScene'

export const LESSON_PACKAGE_FORMAT = 'word2html.lesson-package'
export const LESSON_PACKAGE_VERSION = '0.1'
export const LEGACY_LESSON_PACKAGE_API_VERSIONS = ['lesson-plan-0.6', 'lesson-plan-0.7', 'lesson-plan-0.8', 'lesson-plan-0.9', 'lesson-plan-1.0', 'lesson-plan-1.1', 'lesson-plan-1.2', 'lesson-plan-1.3'] as const
type LegacyLessonPackageApiVersion = typeof LEGACY_LESSON_PACKAGE_API_VERSIONS[number]

export interface LessonPackage {
  format: typeof LESSON_PACKAGE_FORMAT
  formatVersion: typeof LESSON_PACKAGE_VERSION
  kind: 'lesson-plan'
  apiVersion: typeof GENERATION_API_VERSION | LegacyLessonPackageApiVersion
  plan: LessonPlan
}

export interface ParsedLessonImport {
  scene: LessonScene
  sourceFormat: 'lesson-package' | 'lesson-scene'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function assertLessonPackage(value: unknown): asserts value is LessonPackage {
  if (!isRecord(value) || value.format !== LESSON_PACKAGE_FORMAT) {
    throw new Error('文件既不是 LessonScene，也不是 Word2HTML 场景包。')
  }
  const allowed = new Set(['format', 'formatVersion', 'kind', 'apiVersion', 'plan'])
  const additional = Object.keys(value).filter((key) => !allowed.has(key))
  if (additional.length > 0) {
    throw new Error(`Word2HTML 场景包包含未知字段：${additional.join('、')}`)
  }
  if (value.formatVersion !== LESSON_PACKAGE_VERSION) {
    throw new Error(`不支持的场景包版本：${String(value.formatVersion)}`)
  }
  if (value.kind !== 'lesson-plan') {
    throw new Error(`不支持的场景包类型：${String(value.kind)}`)
  }
  if (
    value.apiVersion !== GENERATION_API_VERSION &&
    !LEGACY_LESSON_PACKAGE_API_VERSIONS.includes(value.apiVersion as LegacyLessonPackageApiVersion)
  ) {
    throw new Error(
      `场景包使用 ${String(value.apiVersion)}，当前应用需要 ${GENERATION_API_VERSION}。请重新生成或迁移文件。`,
    )
  }
  assertLessonPlan(value.plan)
}

export function parseLessonImport(value: unknown): ParsedLessonImport {
  let scene: LessonScene
  let sourceFormat: ParsedLessonImport['sourceFormat']

  if (isRecord(value) && value.format === LESSON_PACKAGE_FORMAT) {
    assertLessonPackage(value)
    scene = instantiateLessonPlan(value.plan)
    sourceFormat = 'lesson-package'
  } else {
    assertLessonScene(value)
    scene = structuredClone(value)
    sourceFormat = 'lesson-scene'
  }

  assertLessonScene(scene)
  assertSceneRendererSupported(scene)
  scene.lineage.source = 'imported'
  scene.lineage.updatedAt = new Date().toISOString()
  return { scene, sourceFormat }
}

export function createLessonPackage(plan: LessonPlan): LessonPackage {
  assertLessonPlan(plan)
  return {
    format: LESSON_PACKAGE_FORMAT,
    formatVersion: LESSON_PACKAGE_VERSION,
    kind: 'lesson-plan',
    apiVersion: GENERATION_API_VERSION,
    plan: structuredClone(plan),
  }
}

/**
 * Export an installed scene through the same compact, declarative format used
 * by model generation and contextual editing. Pure appearance settings remain
 * available through the full LessonScene export instead.
 */
export function createLessonPackageFromScene(scene: LessonScene): LessonPackage {
  assertLessonScene(scene)
  assertSceneRendererSupported(scene)
  return createLessonPackage(lessonPlanFromScene(scene))
}
