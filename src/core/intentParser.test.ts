import { describe, expect, it } from 'vitest'
import { isNumberParameter } from '../types/lessonScene'
import { createSceneFromTemplate, normalizePrompt, routeGenerationRequest } from './intentParser'
import { validateLessonScene } from './validateScene'

describe('generation request router', () => {
  it('reuses the reviewed ellipse template without a model call', () => {
    const route = routeGenerationRequest('绘制椭圆并演示两个焦点的距离和')
    expect(route.kind).toBe('template')
  })

  it('reuses the reviewed quadratic vertex template without a model call', () => {
    const route = routeGenerationRequest('演示二次函数顶点变化')
    expect(route.kind).toBe('template')
    expect(route.templateId).toBe('math.function.quadratic-vertex')
  })

  it('routes parameter and appearance edits to the right settings panel', () => {
    expect(routeGenerationRequest('隐藏网格').kind).toBe('settings')
    expect(routeGenerationRequest('长轴改成 12').kind).toBe('settings')
    expect(routeGenerationRequest('把曲线改成红色').kind).toBe('settings')
  })

  it('routes unsupported teaching content to the model gateway', () => {
    expect(routeGenerationRequest('模拟自由落体运动').kind).toBe('model')
  })

  it('keeps structural follow-up instructions eligible for contextual model editing', () => {
    expect(routeGenerationRequest('动点到两个焦点应该通过直线连接，并标注距离').kind).toBe('model')
  })
})

describe('quadratic template generation', () => {
  it('extracts vertex-form parameters and creates a valid scene', () => {
    const result = createSceneFromTemplate('绘制二次函数图像，a=-2，顶点为(3, 4)，演示顶点变化')
    const coefficient = result.scene.parameters.coefficientA
    const vertexH = result.scene.parameters.vertexH
    const vertexK = result.scene.parameters.vertexK
    expect(isNumberParameter(coefficient) && coefficient.value).toBe(-2)
    expect(isNumberParameter(vertexH) && vertexH.value).toBe(3)
    expect(isNumberParameter(vertexK) && vertexK.value).toBe(4)
    expect(validateLessonScene(result.scene).valid).toBe(true)
  })

  it('rejects a zero coefficient', () => {
    expect(() => createSceneFromTemplate('演示二次函数顶点变化，a=0')).toThrow(/不能为 0/)
  })
})

describe('ellipse template generation', () => {
  it('creates an ellipse scene and extracts initial axes', () => {
    const result = createSceneFromTemplate('绘制椭圆，长轴为 12，短轴为 8，演示焦点距离和')
    const major = result.scene.parameters.majorAxis
    const minor = result.scene.parameters.minorAxis
    expect(isNumberParameter(major) && major.value).toBe(12)
    expect(isNumberParameter(minor) && minor.value).toBe(8)
    expect(validateLessonScene(result.scene).valid).toBe(true)
  })

  it('normalizes the contextual term 核心 to 焦点', () => {
    const result = createSceneFromTemplate('制作椭圆，显示到两个核心的距离')
    expect(result.notices.some((notice) => notice.includes('焦点'))).toBe(true)
    expect(normalizePrompt(' 两个核心。 ')).toBe('两个焦点')
  })

  it('rejects illegal initial axes', () => {
    expect(() => createSceneFromTemplate('绘制椭圆焦点距离和，长轴为 5，短轴为 8')).toThrow(/不能大于/)
  })
})
