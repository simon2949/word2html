import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { cacheScene, getCachedScene } from './storage'

const values = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
})

beforeEach(() => values.clear())
afterAll(() => vi.unstubAllGlobals())

describe('validated prompt cache', () => {
  it('restores an exact reusable clone without changing the stored scene', () => {
    const scene = createEllipseScene()
    cacheScene('same-request|model:MiniMax:MiniMax-M3|schema:0.1', scene)

    const first = getCachedScene('same-request|model:MiniMax:MiniMax-M3|schema:0.1')
    const second = getCachedScene('same-request|model:MiniMax:MiniMax-M3|schema:0.1')

    expect(first?.lineage.matchLevel).toBe('exact')
    expect(first).not.toBe(second)
    expect(scene.lineage.matchLevel).toBe('template')
  })

  it('does not return a cached scene that fails validation', () => {
    localStorage.setItem(
      'word2html.lesson-scene.prompt-cache.v0.1',
      JSON.stringify({ broken: { schemaVersion: '0.1' } }),
    )

    expect(getCachedScene('broken')).toBeNull()
  })

  it('rejects cache entries from another capability target', () => {
    const scene = createEllipseScene()
    cacheScene('isolated', scene)
    expect(getCachedScene('isolated', { templateId: 'math.function.generic-2d' })).toBeNull()
    expect(getCachedScene('isolated', { subject: 'physics' })).toBeNull()
    expect(getCachedScene('isolated', {
      templateId: 'math.conic.ellipse-focus-sum', subject: 'math',
    })).not.toBeNull()
  })
})
