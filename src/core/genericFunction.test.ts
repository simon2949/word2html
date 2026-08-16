import { describe, expect, it } from 'vitest'
import { createGenericFunctionScene } from '../templates/genericFunctionTemplate'
import { isNumberParameter } from '../types/lessonScene'
import { validateLessonScene } from './validateScene'
import {
  estimateGenericFunctionViewport,
  getGenericFunctionSpec,
  sampleGenericFunction,
  updateGenericFunctionParameter,
  validateGenericFunctionSpec,
  type GenericFunctionSpec,
} from './genericFunction'

function sineSpec(): GenericFunctionSpec {
  return {
    expression: 'amplitude * sin(frequency * x)',
    formula: 'y = A sin(ωx)',
    xMin: -10,
    xMax: 10,
    parameters: [
      { id: 'amplitude', label: '振幅 A', value: 2, min: 0.5, max: 5, step: 0.1 },
      { id: 'frequency', label: '频率 ω', value: 1, min: 0.2, max: 3, step: 0.1 },
    ],
  }
}

describe('generic function runtime', () => {
  it('creates and validates a safe parameterized function scene', () => {
    const scene = createGenericFunctionScene(sineSpec(), {
      title: '正弦函数参数演示', topic: '正弦函数', summary: '观察振幅和频率变化。',
    })
    expect(validateLessonScene(scene).valid).toBe(true)
    expect(getGenericFunctionSpec(scene).expression).toBe('amplitude * sin(frequency * x)')
  })

  it('samples the expression and updates parameters locally', () => {
    const spec = sineSpec()
    const samples = sampleGenericFunction(spec, 5)
    expect(samples).toHaveLength(5)
    expect(samples.every((sample) => Number.isFinite(sample.y))).toBe(true)

    let scene = createGenericFunctionScene(spec, {
      title: '正弦函数', topic: '正弦函数', summary: '参数演示。',
    })
    scene = updateGenericFunctionParameter(scene, 'amplitude', 3)
    const amplitude = scene.parameters.amplitude
    expect(isNumberParameter(amplitude) && amplitude.value).toBe(3)
  })

  it('estimates a finite viewport and rejects unsafe expressions', () => {
    const viewport = estimateGenericFunctionViewport(sineSpec())
    expect(viewport.yMin).toBeLessThan(-1)
    expect(viewport.yMax).toBeGreaterThan(1)
    expect(validateGenericFunctionSpec({ ...sineSpec(), expression: 'fetch(x)' })).toContain('不允许')
  })

  it('supports a function with no adjustable parameters', () => {
    const scene = createGenericFunctionScene({
      expression: 'sin(x)', formula: 'y = sin(x)', xMin: -6.28, xMax: 6.28, parameters: [],
    }, { title: '正弦函数', topic: '正弦函数', summary: '观察基础正弦曲线。' })

    expect(Object.keys(scene.parameters)).toHaveLength(0)
    expect(validateLessonScene(scene).valid).toBe(true)
  })
})
