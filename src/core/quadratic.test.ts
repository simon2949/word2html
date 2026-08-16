import { describe, expect, it } from 'vitest'
import { createQuadraticScene } from '../templates/quadraticTemplate'
import {
  evaluateQuadratic,
  getQuadraticSnapshot,
  sampleQuadraticInvariant,
  updateQuadraticParameter,
  validateQuadraticValues,
} from './quadratic'

describe('quadratic vertex-form runtime', () => {
  it('uses the expected default vertex and opening', () => {
    const snapshot = getQuadraticSnapshot(createQuadraticScene())
    expect(snapshot.vertex).toEqual({ x: 0, y: 0 })
    expect(snapshot.opensUpward).toBe(true)
    expect(snapshot.roots).toEqual([0])
  })

  it('updates a, h and k while keeping the vertex relation exact', () => {
    let scene = createQuadraticScene()
    scene = updateQuadraticParameter(scene, 'coefficientA', -2)
    scene = updateQuadraticParameter(scene, 'vertexH', 3)
    scene = updateQuadraticParameter(scene, 'vertexK', 4)
    const snapshot = getQuadraticSnapshot(scene)

    expect(snapshot.vertex).toEqual({ x: 3, y: 4 })
    expect(snapshot.opensUpward).toBe(false)
    expect(evaluateQuadratic(-2, 3, 4, 3)).toBe(4)
    expect(sampleQuadraticInvariant(scene, 180).passed).toBe(true)
  })

  it('rejects a zero quadratic coefficient', () => {
    const scene = createQuadraticScene()
    expect(validateQuadraticValues(scene, { coefficientA: 0, vertexH: 0, vertexK: 0 }))
      .toContain('不能为 0')
  })
})
