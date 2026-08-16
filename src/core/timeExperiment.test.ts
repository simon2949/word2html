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
})
