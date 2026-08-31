import { describe, expect, it } from 'vitest'
import { createCollision2DScene } from '../templates/collision2dTemplate'
import { isNumberParameter } from '../types/lessonScene'
import {
  createCollision2DRuntime,
  resetCollisionScene,
  updateCollisionParameter,
  validateCollision2DSpec,
  type Collision2DSpec,
} from './collision2d'
import { validateLessonScene } from './validateScene'

function headOnSpec(): Collision2DSpec {
  return {
    durationExpression: 'duration',
    gravityXExpression: '0',
    gravityYExpression: '0',
    restitutionExpression: 'restitution',
    formula: 'm₁v₁ + m₂v₂ = m₁v₁′ + m₂v₂′',
    conclusion: '孤立系统碰撞前后的总动量保持不变；完全弹性碰撞中总动能也保持不变。',
    parameters: [
      { id: 'duration', label: '实验时长', value: 3, min: 1, max: 5, step: 0.25 },
      { id: 'restitution', label: '恢复系数', value: 1, min: 0, max: 1, step: 0.1 },
      { id: 'speed', label: '小球 A 初速度', value: 2, min: 0.5, max: 4, step: 0.25 },
    ],
    bounds: {
      xMinExpression: '0-10', xMaxExpression: '10',
      yMinExpression: '0-5', yMaxExpression: '5',
    },
    bodies: [
      {
        id: 'ballA', label: '小球 A', xExpression: '0-3', yExpression: '0',
        vxExpression: 'speed', vyExpression: '0', radiusExpression: '0.5', massExpression: '1',
      },
      {
        id: 'ballB', label: '小球 B', xExpression: '0', yExpression: '0',
        vxExpression: '0', vyExpression: '0', radiusExpression: '0.5', massExpression: '1',
      },
    ],
  }
}

function headOnScene() {
  return createCollision2DScene(headOnSpec(), {
    title: '二维圆盘弹性碰撞', topic: '动量守恒', summary: '观察等质量圆盘的正碰。',
  })
}

describe('deterministic 2D disc collision runtime', () => {
  it('creates a semantically valid reusable scene', () => {
    const scene = headOnScene()
    expect(validateLessonScene(scene).valid).toBe(true)
    expect(scene.templateRef.id).toBe('physics.collision.discs-2d')
    expect(scene.objects.filter((object) => object.kind === 'collision-body')).toHaveLength(2)
  })

  it('exchanges velocity in an equal-mass elastic head-on collision', () => {
    const runtime = createCollision2DRuntime(headOnScene())
    const before = runtime.snapshot(0)
    const after = runtime.snapshot(1.5)

    expect(after.collisionCount).toBeGreaterThan(0)
    expect(after.bodies[0]?.vx).toBeCloseTo(0, 6)
    expect(after.bodies[1]?.vx).toBeCloseTo(2, 6)
    expect(after.momentumX).toBeCloseTo(before.momentumX, 6)
    expect(after.kineticEnergy).toBeCloseTo(before.kineticEnergy, 6)
  })

  it('keeps every body inside the contact bounds while bouncing from walls', () => {
    const spec = headOnSpec()
    spec.bodies[0] = {
      ...spec.bodies[0]!, xExpression: '0-8', yExpression: '3',
      vxExpression: '0-3', vyExpression: '2',
    }
    spec.bodies[1] = {
      ...spec.bodies[1]!, xExpression: '5', yExpression: '0-3',
    }
    const scene = createCollision2DScene(spec, {
      title: '边界反弹', topic: '接触碰撞', summary: '观察圆盘与矩形边界的接触。',
    })
    const runtime = createCollision2DRuntime(scene)
    for (const snapshot of runtime.samples(runtime.duration, 81)) {
      for (const body of snapshot.bodies) {
        expect(body.x - body.radius).toBeGreaterThanOrEqual(runtime.bounds.xMin - 1e-5)
        expect(body.x + body.radius).toBeLessThanOrEqual(runtime.bounds.xMax + 1e-5)
        expect(body.y - body.radius).toBeGreaterThanOrEqual(runtime.bounds.yMin - 1e-5)
        expect(body.y + body.radius).toBeLessThanOrEqual(runtime.bounds.yMax + 1e-5)
      }
    }
  })

  it('updates and resets parameters without model calls', () => {
    let scene = updateCollisionParameter(headOnScene(), 'speed', 3)
    expect(isNumberParameter(scene.parameters.speed) && scene.parameters.speed.value).toBe(3)
    scene = resetCollisionScene(scene)
    expect(isNumberParameter(scene.parameters.speed) && scene.parameters.speed.value).toBe(2)
  })

  it('rejects unsafe initial overlap, excessive projected speed and invalid expressions', () => {
    const overlap = headOnSpec()
    overlap.bodies[1] = { ...overlap.bodies[1]!, xExpression: '0-2.4' }
    expect(validateCollision2DSpec(overlap)).toContain('初始位置重叠')

    const fast = headOnSpec()
    fast.bodies[0] = { ...fast.bodies[0]!, vxExpression: '50' }
    expect(validateCollision2DSpec(fast)).toContain('预计最大速度过大')

    const unsafe = headOnSpec()
    unsafe.bodies[0] = { ...unsafe.bodies[0]!, xExpression: 'fetch(1)' }
    expect(validateCollision2DSpec(unsafe)).toContain('不允许')
  })
})
