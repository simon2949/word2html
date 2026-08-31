import { describe, expect, it } from 'vitest'
import { createRelationCurve2DScene } from '../templates/relationCurve2dTemplate'
import { isNumberParameter } from '../types/lessonScene'
import {
  getRelationCurve2DSpec,
  resetRelationCurveScene,
  sampleRelationCurve,
  updateRelationCurveParameter,
  validateRelationCurve2DSpec,
  type RelationCurve2DSpec,
} from './relationCurve2d'
import { validateLessonScene } from './validateScene'

function parametricCircle(): RelationCurve2DSpec {
  return {
    mode: 'parametric', formula: 'x=a cos(t), y=a sin(t)', conclusion: '参数变化一周得到半径为 a 的圆。',
    parameters: [{ id: 'a', label: '半径 a', value: 2, min: 1, max: 4, step: 0.25 }],
    xMin: -4, xMax: 4, yMin: -4, yMax: 4,
    variableMin: 0, variableMax: Math.PI * 2, xExpression: 'a*cos(t)', yExpression: 'a*sin(t)',
  }
}

describe('2D relation curve runtime', () => {
  it('samples a parametric circle and creates a valid scene', () => {
    const spec = parametricCircle()
    const sample = sampleRelationCurve(spec)
    expect(sample.paths).toHaveLength(1)
    expect(sample.pointCount).toBe(801)
    expect(sample.paths[0]![200]!.x).toBeCloseTo(0, 4)
    expect(sample.paths[0]![200]!.y).toBeCloseTo(2, 4)
    const scene = createRelationCurve2DScene(spec, { title: '参数圆', topic: '参数方程', summary: '观察参数圆。' })
    expect(validateLessonScene(scene).valid).toBe(true)
    expect(getRelationCurve2DSpec(scene)).toEqual(spec)
  })

  it('samples a polar rose without model-provided points', () => {
    const spec: RelationCurve2DSpec = {
      mode: 'polar', formula: 'r=a cos(3θ)', conclusion: '奇数 3 产生三瓣玫瑰线。',
      parameters: [{ id: 'a', label: '尺度 a', value: 3, min: 1, max: 5, step: 0.25 }],
      xMin: -4, xMax: 4, yMin: -4, yMax: 4,
      variableMin: 0, variableMax: Math.PI * 2, radialExpression: 'a*cos(3*theta)',
    }
    const sample = sampleRelationCurve(spec)
    expect(sample.pointCount).toBeGreaterThan(700)
    expect(Math.max(...sample.paths.flat().map((point) => Math.hypot(point.x, point.y)))).toBeCloseTo(3, 2)
  })

  it('extracts an implicit circle with marching squares', () => {
    const spec: RelationCurve2DSpec = {
      mode: 'implicit', formula: 'x²+y²=a²', conclusion: '等值线表示到原点距离等于 a 的点集。',
      parameters: [{ id: 'a', label: '半径 a', value: 2, min: 1, max: 4, step: 0.25 }],
      xMin: -3, xMax: 3, yMin: -3, yMax: 3,
      implicitExpression: 'x^2+y^2-a^2',
    }
    const sample = sampleRelationCurve(spec)
    expect(sample.paths.length).toBeGreaterThan(100)
    for (const point of sample.paths.flat().slice(0, 30)) expect(Math.hypot(point.x, point.y)).toBeCloseTo(2, 1)
  })

  it('keeps an exact zero contour that aligns with the sampling grid', () => {
    const sample = sampleRelationCurve({
      mode: 'implicit', formula: 'x = 0', conclusion: '零等值线是 y 轴。', parameters: [],
      xMin: -2, xMax: 2, yMin: -2, yMax: 2, implicitExpression: 'x',
    })
    expect(sample.paths.length).toBeGreaterThan(50)
    expect(sample.paths.flat().every((point) => Math.abs(point.x) < 1e-10)).toBe(true)
  })

  it('updates and resets parameters locally', () => {
    let scene = createRelationCurve2DScene(parametricCircle(), { title: '参数圆', topic: '参数方程', summary: '观察参数圆。' })
    scene = updateRelationCurveParameter(scene, 'a', 3)
    expect(isNumberParameter(scene.parameters.a) && scene.parameters.a.value).toBe(3)
    scene = resetRelationCurveScene(scene)
    expect(isNumberParameter(scene.parameters.a) && scene.parameters.a.value).toBe(2)
  })

  it('rejects mixed modes, unsafe expressions and empty contours', () => {
    expect(validateRelationCurve2DSpec({ ...parametricCircle(), radialExpression: '1' })).toContain('不能包含')
    expect(validateRelationCurve2DSpec({ ...parametricCircle(), xExpression: 'fetch(t)' })).toContain('不允许')
    expect(validateRelationCurve2DSpec({
      mode: 'implicit', formula: '1=0', conclusion: '没有解。', parameters: [],
      xMin: -2, xMax: 2, yMin: -2, yMax: 2, implicitExpression: '1',
    })).toContain('没有可绘制')
    expect(validateRelationCurve2DSpec({
      ...parametricCircle(), xExpression: '1000+cos(t)', yExpression: '1000+sin(t)',
    })).toContain('没有进入')
  })
})
