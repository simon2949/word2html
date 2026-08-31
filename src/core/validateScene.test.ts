import { describe, expect, it } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { createQuadraticScene } from '../templates/quadraticTemplate'
import { createGenericFunctionScene } from '../templates/genericFunctionTemplate'
import { isNumberParameter } from '../types/lessonScene'
import { validateLessonScene } from './validateScene'

describe('LessonScene validation', () => {
  it('accepts the built-in ellipse template', () => {
    const result = validateLessonScene(createEllipseScene())
    expect(result.valid).toBe(true)
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })

  it('accepts the built-in quadratic vertex template', () => {
    const result = validateLessonScene(createQuadraticScene())
    expect(result.valid).toBe(true)
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })

  it('accepts a safe dynamically configured generic function', () => {
    const scene = createGenericFunctionScene({
      expression: 'a * sin(x)', formula: 'y = a sin(x)', xMin: -8, xMax: 8,
      parameters: [{ id: 'a', label: '振幅', value: 1, min: 0.5, max: 3, step: 0.1 }],
    }, { title: '正弦函数', topic: '三角函数', summary: '观察振幅变化。' })
    expect(validateLessonScene(scene).valid).toBe(true)
  })

  it('rejects unknown top-level fields', () => {
    const scene = { ...createEllipseScene(), arbitraryScript: 'alert(1)' }
    const result = validateLessonScene(scene)
    expect(result.valid).toBe(false)
  })

  it('rejects unsafe expressions', () => {
    const scene = createEllipseScene()
    scene.derivedValues[0]!.expression = 'window.fetch(1)'
    const result = validateLessonScene(scene)
    expect(result.valid).toBe(false)
  })

  it('rejects cyclic derived values', () => {
    const scene = createEllipseScene()
    scene.derivedValues[0]!.expression = 'b'
    scene.derivedValues[1]!.expression = 'a'
    const result = validateLessonScene(scene)
    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('循环'))).toBe(true)
  })

  it('returns a warning rather than an error for a circle', () => {
    const scene = createEllipseScene()
    const minor = scene.parameters.minorAxis
    if (!isNumberParameter(minor)) throw new Error('invalid fixture')
    minor.value = 10
    const result = validateLessonScene(scene)
    expect(result.valid).toBe(true)
    expect(result.issues.some((issue) => issue.severity === 'warning')).toBe(true)
  })

  it('accepts older appearance objects and rejects unknown point or line styles', () => {
    const legacy = createEllipseScene()
    delete legacy.appearance.pointStyle
    delete legacy.appearance.lineStyle
    delete legacy.appearance.helperLineStyle
    delete legacy.appearance.helperLineWidth
    expect(validateLessonScene(legacy).valid).toBe(true)

    const invalid = createEllipseScene()
    invalid.appearance.pointStyle = 'gradient' as never
    expect(validateLessonScene(invalid).valid).toBe(false)
  })

  it('accepts the optional layout preset enum and keeps legacy scenes compatible', () => {
    const legacy = createEllipseScene()
    delete legacy.appearance.layoutPreset
    expect(validateLessonScene(legacy).valid).toBe(true)

    const compact = createEllipseScene()
    compact.appearance.layoutPreset = 'compact'
    expect(validateLessonScene(compact).valid).toBe(true)

    const invalid = createEllipseScene()
    invalid.appearance.layoutPreset = 'free-css-layout' as never
    expect(validateLessonScene(invalid).valid).toBe(false)
  })

  it('accepts valid object overrides and rejects missing or non-editable object references', () => {
    const valid = createEllipseScene()
    valid.appearance.objectStyles = {
      focusLeft: { color: '#123456', pointRadius: 12 },
      distanceRight: { lineWidth: 5, lineStyle: 'dashed' },
    }
    expect(validateLessonScene(valid).valid).toBe(true)

    const missing = createEllipseScene()
    missing.appearance.objectStyles = { unknownPoint: { pointRadius: 10 } }
    expect(validateLessonScene(missing).issues.some((issue) => issue.message.includes('引用不存在'))).toBe(true)

    const grid = createEllipseScene()
    grid.appearance.objectStyles = { grid: { color: '#123456' } }
    expect(validateLessonScene(grid).issues.some((issue) => issue.message.includes('不支持独立外观'))).toBe(true)
  })
})
