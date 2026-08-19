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

  it('instantiates the normalized two-pendulum plan returned by the model', () => {
    const plan: LessonPlan = {
      schemaVersion: '0.1', status: 'matched', subject: 'physics', topic: '双钟摆运动',
      templateId: 'experiment.motion.point-2d', parameterOverrides: {},
      experimentSpec: {
        durationExpression: '4*pi*sqrt(max(L1,L2)/g)', bodyId: 'pendulum1', bodyLabel: '左摆球',
        xExpression: '0-2+L1*sin(theta1)', yExpression: '0-L1*cos(theta1)',
        formula: 'theta1=theta01*cos(sqrt(g/L1)*t), theta2=theta02*cos(sqrt(g/L2)*t)',
        conclusion: '两个独立单摆各自做小角度简谐振动。',
        parameters: [
          { id: 'g', label: '重力加速度', value: 9.8, min: 1, max: 20, step: 0.1 },
          { id: 'L1', label: '左摆长', value: 1, min: 0.3, max: 3, step: 0.1 },
          { id: 'L2', label: '右摆长', value: 1.5, min: 0.3, max: 3, step: 0.1 },
          { id: 'theta01', label: '左初始角', value: 0.25, min: 0.05, max: 0.35, step: 0.01 },
          { id: 'theta02', label: '右初始角', value: 0.2, min: 0.05, max: 0.35, step: 0.01 },
        ],
        metrics: [
          { id: 'theta1', label: '左摆角', expression: 'theta01*cos(sqrt(g/L1)*t)', unit: 'rad' },
          { id: 'theta2', label: '右摆角', expression: 'theta02*cos(sqrt(g/L2)*t)', unit: 'rad' },
        ],
        additionalBodies: [{
          id: 'pendulum2', label: '右摆球',
          xExpression: '2+L2*sin(theta2)', yExpression: '0-L2*cos(theta2)',
        }],
        vectors: [],
        constraints: [
          { id: 'rope1', label: '左摆绳', type: 'rope', bodyId: 'pendulum1', anchorXExpression: '0-2', anchorYExpression: '0', restLengthExpression: 'L1' },
          { id: 'rope2', label: '右摆绳', type: 'rope', bodyId: 'pendulum2', anchorXExpression: '2', anchorYExpression: '0', restLengthExpression: 'L2' },
        ],
      },
      reason: '两个独立可调单摆。',
    }
    const scene = instantiateLessonPlan(plan)
    expect(scene.objects.filter((object) => object.kind === 'time-point')).toHaveLength(2)
    expect(scene.objects.filter((object) => object.kind === 'constraint')).toHaveLength(2)
    expect(isNumberParameter(scene.parameters.L1) && scene.parameters.L1.value).toBe(1)
    expect(isNumberParameter(scene.parameters.L2) && scene.parameters.L2.value).toBe(1.5)
  })

  it('validates the API plan before instantiating and preserves usage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: 'lesson-plan-0.6',
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

  it('requests one model repair when browser physics validation rejects the first plan', async () => {
    const invalidRopePlan: LessonPlan = {
      ...timeExperimentPlan(),
      experimentSpec: {
        ...timeExperimentPlan().experimentSpec!,
        constraints: [{
          id: 'rope', label: '错误的绳约束', type: 'rope', bodyId: 'primary',
          anchorXExpression: '0', anchorYExpression: '0', restLengthExpression: '1',
        }],
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apiVersion: 'lesson-plan-0.6', plan: invalidRopePlan,
          usage: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 80, modelCalls: 1, repaired: false },
          provider: { name: 'MiniMax', model: 'MiniMax-M3' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apiVersion: 'lesson-plan-0.6', plan: timeExperimentPlan(),
          usage: { inputTokens: 140, cachedInputTokens: 30, outputTokens: 70, modelCalls: 1, repaired: true },
          provider: { name: 'MiniMax', model: 'MiniMax-M3' },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateSceneWithModel('模拟自由落体')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const repairRequest = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined
    if (typeof repairRequest?.body !== 'string') throw new Error('missing repair request body')
    const repairBody = JSON.parse(repairRequest.body)
    expect(repairBody.correction.previousPlan).toEqual(invalidRopePlan)
    expect(repairBody.correction.validationError).toContain('未保持长度不变')
    expect(result.scene.templateRef.id).toBe('experiment.motion.point-2d')
    expect(result.usage).toEqual({
      inputTokens: 240, cachedInputTokens: 50, outputTokens: 150,
      modelCalls: 2, repaired: true,
    })
  })

  it('never starts a third model call after a server-side repair was already used', async () => {
    const invalidRopePlan: LessonPlan = {
      ...timeExperimentPlan(),
      experimentSpec: {
        ...timeExperimentPlan().experimentSpec!,
        constraints: [{
          id: 'rope', label: '错误的绳约束', type: 'rope', bodyId: 'primary',
          anchorXExpression: '0', anchorYExpression: '0', restLengthExpression: '1',
        }],
      },
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: 'lesson-plan-0.6', plan: invalidRopePlan,
        usage: { inputTokens: 220, outputTokens: 140, modelCalls: 2, repaired: true },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateSceneWithModel('模拟自由落体'))
      .rejects.toThrow(/自动纠错后场景仍无效.*未保持长度不变/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
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
