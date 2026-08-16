import { afterEach, describe, expect, it, vi } from 'vitest'
import { isNumberParameter } from '../types/lessonScene'
import {
  generateSceneWithModel,
  instantiateLessonPlan,
  type LessonPlan,
} from './modelGateway'

function matchedPlan(): LessonPlan {
  return {
    schemaVersion: '0.1',
    status: 'matched',
    subject: 'math',
    topic: '椭圆焦点距离和',
    templateId: 'math.conic.ellipse-focus-sum',
    parameterOverrides: { majorAxis: 12, minorAxis: 8 },
    reason: '命中椭圆模板。',
  }
}

function quadraticPlan(): LessonPlan {
  return {
    schemaVersion: '0.1',
    status: 'matched',
    subject: 'math',
    topic: '二次函数顶点变化',
    templateId: 'math.function.quadratic-vertex',
    parameterOverrides: { coefficientA: -1.5, vertexH: 2, vertexK: 3 },
    reason: '命中二次函数顶点式模板。',
  }
}

function genericFunctionPlan(): LessonPlan {
  return {
    schemaVersion: '0.1',
    status: 'matched',
    subject: 'math',
    topic: '正弦函数的振幅与频率',
    templateId: 'math.function.generic-2d',
    parameterOverrides: {},
    functionSpec: {
      expression: 'A*sin(B*x)',
      formula: 'y = A sin(Bx)',
      xMin: -10,
      xMax: 10,
      parameters: [
        { id: 'A', label: '振幅 A', value: 2, min: 0.5, max: 5, step: 0.1 },
        { id: 'B', label: '频率 B', value: 1, min: 0.2, max: 3, step: 0.1 },
      ],
    },
    reason: '使用安全通用函数运行时演示参数变化。',
  }
}

function timeExperimentPlan(): LessonPlan {
  return {
    schemaVersion: '0.1', status: 'matched', subject: 'physics',
    topic: '自由落体运动', templateId: 'experiment.motion.point-2d', parameterOverrides: {},
    experimentSpec: {
      durationExpression: 'sqrt(2*h0/g)', xExpression: '0',
      yExpression: 'max(0,h0-0.5*g*t^2)', formula: 'h(t) = h0 - 0.5gt^2',
      conclusion: '忽略空气阻力时，速度随时间线性增加。',
      parameters: [
        { id: 'h0', label: '初始高度 h0 (m)', value: 20, min: 2, max: 50, step: 1 },
        { id: 'g', label: '重力加速度 g (m/s^2)', value: 9.8, min: 1, max: 15, step: 0.1 },
      ],
      metrics: [
        { id: 'height', label: '当前高度', expression: 'max(0,h0-0.5*g*t^2)', unit: 'm' },
        { id: 'speed', label: '当前速度', expression: 'g*t', unit: 'm/s' },
      ],
      vectors: [
        { id: 'velocity', label: '速度', xExpression: '0', yExpression: '0-g*t', scale: 0.1, unit: 'm/s' },
        { id: 'gravity', label: '重力加速度', xExpression: '0', yExpression: '0-g', scale: 0.15, unit: 'm/s^2' },
      ],
    },
    reason: '使用通用二维点运动实验运行时。',
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('LessonPlan instantiation', () => {
  it('applies model parameters to the reviewed local template', () => {
    const scene = instantiateLessonPlan(matchedPlan())
    const major = scene.parameters.majorAxis
    const minor = scene.parameters.minorAxis

    expect(isNumberParameter(major) && major.value).toBe(12)
    expect(isNumberParameter(minor) && minor.value).toBe(8)
    expect(scene.lineage).toMatchObject({ source: 'model', matchLevel: 'template' })
  })

  it('rejects unsupported content without creating a scene', () => {
    const plan: LessonPlan = {
      ...matchedPlan(),
      status: 'unsupported',
      subject: 'physics',
      topic: '自由落体',
      templateId: 'unsupported',
      parameterOverrides: {},
      reason: '尚未安装自由落体模板。',
    }

    expect(() => instantiateLessonPlan(plan)).toThrow(/尚未安装/)
  })

  it('instantiates a quadratic plan from the reviewed template', () => {
    const scene = instantiateLessonPlan(quadraticPlan())
    const coefficient = scene.parameters.coefficientA
    const vertexH = scene.parameters.vertexH
    const vertexK = scene.parameters.vertexK

    expect(scene.templateRef.id).toBe('math.function.quadratic-vertex')
    expect(isNumberParameter(coefficient) && coefficient.value).toBe(-1.5)
    expect(isNumberParameter(vertexH) && vertexH.value).toBe(2)
    expect(isNumberParameter(vertexK) && vertexK.value).toBe(3)
  })

  it('instantiates a declarative generic function without executing generated code', () => {
    const scene = instantiateLessonPlan(genericFunctionPlan())

    expect(scene.templateRef.id).toBe('math.function.generic-2d')
    expect(scene.objects.find((object) => object.kind === 'function-curve')?.bindings.expression)
      .toBe('A*sin(B*x)')
    expect(isNumberParameter(scene.parameters.A) && scene.parameters.A.value).toBe(2)
    expect(scene.lineage).toMatchObject({ source: 'model', matchLevel: 'new' })
  })

  it('rejects unsafe or inconsistent generic function plans', () => {
    expect(() => instantiateLessonPlan({
      ...genericFunctionPlan(),
      functionSpec: { ...genericFunctionPlan().functionSpec!, expression: 'alert(x)' },
    })).toThrow(/不允许的函数|未知/)
    expect(() => instantiateLessonPlan({
      ...genericFunctionPlan(),
      templateId: 'math.function.quadratic-vertex',
    })).toThrow(/非通用函数/)
  })

  it('instantiates a declarative free-fall time experiment', () => {
    const scene = instantiateLessonPlan(timeExperimentPlan())

    expect(scene.templateRef.id).toBe('experiment.motion.point-2d')
    expect(scene.metadata.subject).toBe('physics')
    expect(scene.objects.find((object) => object.kind === 'time-point')?.bindings.yExpression)
      .toBe('max(0,h0-0.5*g*t^2)')
    expect(scene.objects.filter((object) => object.kind === 'vector')).toHaveLength(2)
    expect(isNumberParameter(scene.parameters.h0) && scene.parameters.h0.value).toBe(20)
  })

  it('validates the API plan before instantiating and preserves usage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: 'lesson-plan-0.3',
        plan: matchedPlan(),
        usage: { inputTokens: 70, cachedInputTokens: 20, outputTokens: 85 },
        provider: { name: 'MiniMax', model: 'MiniMax-M3' },
      }),
    }))

    const result = await generateSceneWithModel('用两个定点的距离和解释圆锥曲线')

    expect(result.scene.templateRef.id).toBe('math.conic.ellipse-focus-sum')
    expect(result.usage.outputTokens).toBe(85)
    expect(result.plan.parameterOverrides).toEqual({ majorAxis: 12, minorAxis: 8 })
  })

  it('reports a stale generation server instead of validating it as a current scene', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plan: matchedPlan() }),
    }))

    await expect(generateSceneWithModel('绘制 y=A*sin(B*x)，可调 A 和 B'))
      .rejects.toThrow(/旧协议.*重新执行 npm run dev/)
  })
})
