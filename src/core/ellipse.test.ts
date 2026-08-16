import { describe, expect, it } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import {
  getEllipseSnapshot,
  sampleEllipseInvariant,
  updateAxisParameter,
  validateAxisValues,
} from './ellipse'

describe('ellipse runtime', () => {
  it('uses the expected 3-4-5 geometry in the default scene', () => {
    const scene = createEllipseScene()
    const snapshot = getEllipseSnapshot(scene, 0.72)

    expect(snapshot.a).toBe(5)
    expect(snapshot.b).toBe(3)
    expect(snapshot.c).toBe(4)
    expect(snapshot.focusLeft).toEqual({ x: -4, y: 0 })
    expect(snapshot.focusRight).toEqual({ x: 4, y: 0 })
    expect(snapshot.distanceSum).toBeCloseTo(10, 12)
  })

  it('keeps the focal distance sum invariant across at least 100 samples', () => {
    const scene = createEllipseScene()
    const result = sampleEllipseInvariant(scene, 180)

    expect(result.passed).toBe(true)
    expect(result.maxError).toBeLessThanOrEqual(1e-8)
  })

  it('supports the circle boundary case', () => {
    let scene = createEllipseScene()
    scene = updateAxisParameter(scene, 'minorAxis', 10)
    const snapshot = getEllipseSnapshot(scene, Math.PI / 3)

    expect(snapshot.c).toBe(0)
    expect(snapshot.distanceSum).toBeCloseTo(10, 12)
    expect(sampleEllipseInvariant(scene).passed).toBe(true)
  })

  it('rejects a short axis longer than the long axis', () => {
    const scene = createEllipseScene()
    expect(validateAxisValues(scene, 6, 10)).toContain('不能大于')
  })
})

