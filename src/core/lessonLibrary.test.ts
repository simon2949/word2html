import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import {
  getOfficialLibraryEntries,
  loadThirdPartyLibrary,
  removeThirdPartyEntry,
  saveThirdPartyScene,
} from './lessonLibrary'

const values = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
})

beforeEach(() => values.clear())
afterAll(() => vi.unstubAllGlobals())

describe('lesson libraries', () => {
  it('ships reviewed official demonstrations as immutable clones', () => {
    const first = getOfficialLibraryEntries()
    const second = getOfficialLibraryEntries()

    expect(first).toHaveLength(5)
    expect(first.every((entry) => entry.reviewStatus === 'official')).toBe(true)
    expect(first.map((entry) => entry.title)).toContain('自由落体运动')
    expect(first[0]).not.toBe(second[0])
  })

  it('automatically stores a validated import as pending third-party content', () => {
    const entry = saveThirdPartyScene(createEllipseScene(), 'ellipse.word2html.json')
    const stored = loadThirdPartyLibrary()

    expect(entry.reviewStatus).toBe('pending')
    expect(entry.source).toBe('third-party')
    expect(stored).toHaveLength(1)
    expect(stored[0]?.sourceFilename).toBe('ellipse.word2html.json')
    expect(stored[0]?.scene.lineage.source).toBe('imported')
  })

  it('deduplicates equivalent imports by reusable scene fingerprint', () => {
    const scene = createEllipseScene()
    saveThirdPartyScene(scene, 'first.json')
    const updated = saveThirdPartyScene(scene, 'second.json')

    expect(loadThirdPartyLibrary()).toHaveLength(1)
    expect(updated.sourceFilename).toBe('second.json')
  })

  it('removes local third-party records without touching official content', () => {
    const entry = saveThirdPartyScene(createEllipseScene())

    expect(removeThirdPartyEntry(entry.id)).toEqual([])
    expect(getOfficialLibraryEntries()).toHaveLength(5)
  })
})

