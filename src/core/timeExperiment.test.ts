import { describe, expect, it } from 'vitest'
import { createTimeExperimentScene } from '../templates/timeExperimentTemplate'
import { isNumberParameter } from '../types/lessonScene'
import { validateLessonScene } from './validateScene'
import {
  getTimeExperimentSnapshot,
  resetTimeExperimentScene,
  sampleTimeExperiment,
  updateTimeExperimentParameter,
  validateTimeExperimentSpec,
  type TimeExperimentSpec,
} from './timeExperiment'

function freeFallSpec(): TimeExperimentSpec {
  return {
    durationExpression: 'sqrt(2*h0/g)',
    xExpression: '0',
    yExpression: 'max(0,h0-0.5*g*t^2)',
    formula: 'h(t) = h₀ - 1/2 gt²',
    conclusion: '忽略空气阻力时，速度随时间线性增加，物体的高度随时间二次下降。',
    parameters: [
      { id: 'h0', label: '初始高度 h₀ (m)', value: 20, min: 2, max: 50, step: 1 },
      { id: 'g', label: '重力加速度 g (m/s²)', value: 9.8, min: 1, max: 15, step: 0.1 },
    ],
    metrics: [
      { id: 'height', label: '当前高度', expression: 'max(0,h0-0.5*g*t^2)', unit: 'm' },
      { id: 'speed', label: '当前速度', expression: 'g*t', unit: 'm/s' },
    ],
    vectors: [
      { id: 'velocity', label: '速度', xExpression: '0', yExpression: '0-g*t', scale: 0.1, unit: 'm/s' },
      { id: 'gravity', label: '重力加速度', xExpression: '0', yExpression: '0-g', scale: 0.15, unit: 'm/s^2' },
    ],
  }
}

function freeFallScene() {
  return createTimeExperimentScene(freeFallSpec(), {
    title: '自由落体运动', topic: '自由落体', subject: 'physics',
    summary: '调节初始高度与重力加速度，观察下落过程。',
  })
}

function elasticCollisionSpec(): TimeExperimentSpec {
  const collisionTime = '(x2-x1)/(u1-u2)'
  const velocity1 = '((m1-m2)*u1+2*m2*u2)/(m1+m2)'
  const velocity2 = '(2*m1*u1+(m2-m1)*u2)/(m1+m2)'
  return {
    durationExpression: '5', bodyId: 'ball1', bodyLabel: '小球 1',
    xExpression: 'x1+u1*min(t,tc)+v1p*max(0,t-tc)',
    yExpression: '0',
    formula: '一维完全弹性碰撞：动量和动能守恒',
    conclusion: '碰撞前后系统总动量和总动能保持不变。',
    parameters: [
      { id: 'm1', label: '小球 1 质量', value: 2, min: 1, max: 5, step: 0.5 },
      { id: 'm2', label: '小球 2 质量', value: 1, min: 1, max: 5, step: 0.5 },
      { id: 'u1', label: '小球 1 初速度', value: 3, min: 1, max: 5, step: 0.5 },
      { id: 'u2', label: '小球 2 初速度', value: 0, min: -3, max: 0, step: 0.5 },
      { id: 'x1', label: '小球 1 初位置', value: -5, min: -8, max: -2, step: 0.5 },
      { id: 'x2', label: '小球 2 初位置', value: 1, min: 1, max: 4, step: 0.5 },
    ],
    additionalBodies: [{
      id: 'ball2', label: '小球 2',
      xExpression: 'x2+u2*min(t,tc)+v2p*max(0,t-tc)',
      yExpression: '0',
    }],
    metrics: [
      { id: 'tc', label: '碰撞时刻', expression: collisionTime, unit: 's' },
      { id: 'v1p', label: '小球 1 碰后速度', expression: velocity1, unit: 'm/s' },
      { id: 'v2p', label: '小球 2 碰后速度', expression: velocity2, unit: 'm/s' },
      { id: 'momentum', label: '系统总动量', expression: 'm1*u1+m2*u2', unit: 'kg*m/s' },
    ],
    vectors: [
      { id: 'velocity1', label: '小球 1 速度', bodyId: 'ball1', xExpression: 'u1+(v1p-u1)*step(t-tc)', yExpression: '0', scale: 0.35, unit: 'm/s' },
      { id: 'velocity2', label: '小球 2 速度', bodyId: 'ball2', xExpression: 'u2+(v2p-u2)*step(t-tc)', yExpression: '0', scale: 0.35, unit: 'm/s' },
    ],
  }
}

describe('generic time experiment runtime', () => {
  it('creates a valid reusable free-fall scene', () => {
    const scene = freeFallScene()
    expect(validateLessonScene(scene).valid).toBe(true)
    expect(scene.templateRef.id).toBe('experiment.motion.point-2d')
    expect(sampleTimeExperiment(scene, undefined, 11)).toHaveLength(11)
  })

  it('computes deterministic state and measurements from time', () => {
    const scene = freeFallScene()
    const start = getTimeExperimentSnapshot(scene, 0)
    const end = getTimeExperimentSnapshot(scene, start.duration)

    expect(start).toMatchObject({ x: 0, y: 20 })
    expect(end.y).toBeCloseTo(0, 8)
    expect(end.metrics.find((metric) => metric.id === 'speed')?.value)
      .toBeCloseTo(9.8 * start.duration, 8)
    expect(start.vectors.find((vector) => vector.id === 'gravity')).toMatchObject({ x: 0, y: -9.8 })
    expect(end.vectors.find((vector) => vector.id === 'velocity')?.magnitude)
      .toBeCloseTo(9.8 * start.duration, 8)
  })

  it('updates and resets experiment parameters locally', () => {
    let scene = freeFallScene()
    scene = updateTimeExperimentParameter(scene, 'h0', 30)
    expect(isNumberParameter(scene.parameters.h0) && scene.parameters.h0.value).toBe(30)
    scene = resetTimeExperimentScene(scene)
    expect(isNumberParameter(scene.parameters.h0) && scene.parameters.h0.value).toBe(20)
  })

  it('rejects script syntax and unbounded runtime', () => {
    expect(validateTimeExperimentSpec({ ...freeFallSpec(), yExpression: 'fetch(t)' })).toContain('不允许')
    expect(validateTimeExperimentSpec({ ...freeFallSpec(), durationExpression: '100' })).toContain('60')
    expect(validateTimeExperimentSpec({
      ...freeFallSpec(),
      vectors: [{ ...freeFallSpec().vectors[0]!, yExpression: 'window(t)' }],
    })).toContain('不允许')
  })

  it('models two-body elastic collision with body-bound velocity vectors', () => {
    const scene = createTimeExperimentScene(elasticCollisionSpec(), {
      title: '一维弹性碰撞', topic: '动量守恒', subject: 'physics', summary: '观察两个小球碰撞。',
    })
    expect(validateLessonScene(scene).valid).toBe(true)
    expect(scene.templateRef.version).toBe(4)

    const collision = getTimeExperimentSnapshot(scene, 2)
    expect(collision.bodies).toHaveLength(2)
    expect(collision.bodies.map((body) => body.x)).toEqual([1, 1])

    const after = getTimeExperimentSnapshot(scene, 3)
    expect(after.bodies.find((body) => body.id === 'ball1')?.x).toBeCloseTo(2)
    expect(after.bodies.find((body) => body.id === 'ball2')?.x).toBeCloseTo(5)
    expect(after.vectors.find((vector) => vector.bodyId === 'ball1')?.x).toBeCloseTo(1)
    expect(after.vectors.find((vector) => vector.bodyId === 'ball2')?.x).toBeCloseTo(4)
  })

  it('rejects cyclic measurement dependencies used by motion expressions', () => {
    expect(validateTimeExperimentSpec({
      ...freeFallSpec(),
      metrics: [
        { id: 'first', label: '第一项', expression: 'second+1', unit: 'm' },
        { id: 'second', label: '第二项', expression: 'first+1', unit: 'm' },
      ],
    })).toContain('循环依赖')
  })

  it('models a pendulum with a constant-length rope constraint', () => {
    const scene = createTimeExperimentScene({
      durationExpression: '4*pi*sqrt(L/g)', bodyId: 'bob', bodyLabel: '摆球',
      xExpression: 'L*sin(theta)', yExpression: '0-L*cos(theta)',
      formula: 'theta(t)=theta0*cos(sqrt(g/L)*t)',
      conclusion: '小角度近似下，摆球做周期运动，绳长始终保持为 L。',
      parameters: [
        { id: 'L', label: '摆长 L', value: 4, min: 1, max: 6, step: 0.1 },
        { id: 'g', label: '重力加速度 g', value: 9.8, min: 5, max: 15, step: 0.1 },
        { id: 'theta0', label: '初始摆角', value: 0.25, min: 0.05, max: 0.35, step: 0.01 },
      ],
      metrics: [{ id: 'theta', label: '摆角', expression: 'theta0*cos(sqrt(g/L)*t)', unit: 'rad' }],
      vectors: [],
      constraints: [{
        id: 'rope', label: '摆绳', type: 'rope', bodyId: 'bob',
        anchorXExpression: '0', anchorYExpression: '0', restLengthExpression: 'L',
      }],
    }, {
      title: '单摆运动', topic: '单摆', subject: 'physics', summary: '观察摆长约束和周期运动。',
    })

    expect(validateLessonScene(scene).valid).toBe(true)
    const state = getTimeExperimentSnapshot(scene, 1.2)
    expect(state.constraints).toHaveLength(1)
    expect(state.constraints[0]).toMatchObject({ id: 'rope', type: 'rope', bodyId: 'bob', restLength: 4 })
    expect(state.constraints[0]!.currentLength).toBeCloseTo(4, 10)
    expect(state.constraints[0]!.error).toBeCloseTo(0, 10)
  })

  it('models a spring oscillator and rejects a rope that changes length', () => {
    const oscillator: TimeExperimentSpec = {
      durationExpression: '6*pi/w', bodyId: 'block', bodyLabel: '滑块',
      xExpression: 'A*cos(w*t)', yExpression: '0',
      formula: 'x(t)=A*cos(wt)', conclusion: '滑块围绕平衡位置做简谐运动。',
      parameters: [
        { id: 'A', label: '振幅 A', value: 2, min: 0.5, max: 3, step: 0.1 },
        { id: 'w', label: '角频率 w', value: 1.5, min: 0.5, max: 3, step: 0.1 },
      ],
      metrics: [{ id: 'displacement', label: '位移', expression: 'A*cos(w*t)', unit: 'm' }],
      vectors: [{
        id: 'acceleration', label: '加速度', bodyId: 'block',
        xExpression: '0-w^2*displacement', yExpression: '0', scale: 0.2, unit: 'm/s^2',
      }],
      constraints: [{
        id: 'spring', label: '弹簧', type: 'spring', bodyId: 'block',
        anchorXExpression: '0-5', anchorYExpression: '0', restLengthExpression: '5',
      }],
    }
    expect(validateTimeExperimentSpec(oscillator)).toBeNull()
    const scene = createTimeExperimentScene(oscillator, {
      title: '水平弹簧振子', topic: '简谐运动', subject: 'physics', summary: '观察振幅和角频率。',
    })
    expect(getTimeExperimentSnapshot(scene, 0).constraints[0]).toMatchObject({ currentLength: 7, restLength: 5 })

    expect(validateTimeExperimentSpec({
      ...oscillator,
      constraints: [{ ...oscillator.constraints![0]!, type: 'rope' }],
    })).toContain('未保持长度不变')
  })

  it('models two pendulums with independently adjustable lengths and angles', () => {
    let scene = createTimeExperimentScene({
      durationExpression: '4*pi*sqrt(max(L1,L2)/g)', bodyId: 'pendulum1', bodyLabel: '钟摆 1',
      xExpression: '0-2+L1*sin(theta1)', yExpression: '0-L1*cos(theta1)',
      formula: 'T=2*pi*sqrt(L/g)', conclusion: '两个钟摆拥有独立摆长与初始摆角。',
      parameters: [
        { id: 'L1', label: '钟摆 1 摆长', value: 1.5, min: 0.3, max: 3, step: 0.1 },
        { id: 'L2', label: '钟摆 2 摆长', value: 1, min: 0.3, max: 3, step: 0.1 },
        { id: 'theta01', label: '钟摆 1 初始摆角', value: 0.2, min: 0.05, max: 0.35, step: 0.01 },
        { id: 'theta02', label: '钟摆 2 初始摆角', value: 0.3, min: 0.05, max: 0.35, step: 0.01 },
        { id: 'g', label: '重力加速度', value: 9.8, min: 1.6, max: 20, step: 0.1 },
      ],
      metrics: [
        { id: 'theta1', label: '钟摆 1 摆角', expression: 'theta01*cos(sqrt(g/L1)*t)', unit: 'rad' },
        { id: 'theta2', label: '钟摆 2 摆角', expression: 'theta02*cos(sqrt(g/L2)*t)', unit: 'rad' },
        { id: 'period1', label: '钟摆 1 周期', expression: '2*pi*sqrt(L1/g)', unit: 's' },
        { id: 'period2', label: '钟摆 2 周期', expression: '2*pi*sqrt(L2/g)', unit: 's' },
      ],
      additionalBodies: [{
        id: 'pendulum2', label: '钟摆 2',
        xExpression: '2+L2*sin(theta2)', yExpression: '0-L2*cos(theta2)',
      }],
      vectors: [],
      constraints: [
        { id: 'rope1', label: '摆绳 1', type: 'rope', bodyId: 'pendulum1', anchorXExpression: '0-2', anchorYExpression: '0', restLengthExpression: 'L1' },
        { id: 'rope2', label: '摆绳 2', type: 'rope', bodyId: 'pendulum2', anchorXExpression: '2', anchorYExpression: '0', restLengthExpression: 'L2' },
      ],
    }, {
      title: '双钟摆运动', topic: '两个独立单摆', subject: 'physics', summary: '分别调节两个钟摆。',
    })

    expect(validateLessonScene(scene).valid).toBe(true)
    let state = getTimeExperimentSnapshot(scene, 0.8)
    expect(state.bodies).toHaveLength(2)
    expect(state.constraints.map((constraint) => constraint.currentLength)).toEqual([
      expect.closeTo(1.5, 10), expect.closeTo(1, 10),
    ])
    scene = updateTimeExperimentParameter(scene, 'L1', 2.2)
    state = getTimeExperimentSnapshot(scene, 0.8)
    expect(state.constraints.map((constraint) => constraint.restLength)).toEqual([2.2, 1])
    expect(isNumberParameter(scene.parameters.L2) && scene.parameters.L2.value).toBe(1)
  })
})
