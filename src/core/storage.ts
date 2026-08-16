import type { LessonScene } from '../types/lessonScene'
import { assertLessonScene } from './validateScene'

const DRAFT_KEY = 'word2html.lesson-scene.draft.v0.1'
const CACHE_KEY = 'word2html.lesson-scene.prompt-cache.v0.1'

export function saveDraft(scene: LessonScene): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(scene))
}

export function loadDraft(): LessonScene | null {
  const stored = localStorage.getItem(DRAFT_KEY)
  if (!stored) return null
  try {
    const value: unknown = JSON.parse(stored)
    assertLessonScene(value)
    return value
  } catch {
    localStorage.removeItem(DRAFT_KEY)
    return null
  }
}

type PromptCache = Record<string, LessonScene>

function readPromptCache(): PromptCache {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as PromptCache
  } catch {
    return {}
  }
}

export function getCachedScene(normalizedPrompt: string): LessonScene | null {
  const cached = readPromptCache()[normalizedPrompt]
  if (!cached) return null
  try {
    assertLessonScene(cached)
    const scene = structuredClone(cached)
    scene.lineage.matchLevel = 'exact'
    scene.lineage.updatedAt = new Date().toISOString()
    return scene
  } catch {
    return null
  }
}

export function cacheScene(normalizedPrompt: string, scene: LessonScene): void {
  const cache = readPromptCache()
  cache[normalizedPrompt] = structuredClone(scene)
  const entries = Object.entries(cache).slice(-30)
  localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
}

export function downloadTextFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

