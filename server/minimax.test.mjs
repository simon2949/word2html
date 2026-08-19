import { describe, expect, it, vi } from 'vitest'
import {
  extractPlanFromModelResponse,
  generateLessonPlan,
  normalizeGeneratedPlan,
  publicModelStatus,
  readMinimaxConfig,
  repairLessonPlan,
  validateGeneratedPlan,
} from './minimax.mjs'

function ellipsePlan(overrides = {}) {
  return {
    schemaVersion: '0.1',
    status: 'matched',
    subject: 'math',
    topic: '椭圆焦点距离和',
    templateId: 'math.conic.ellipse-focus-sum',
    parameterOverrides: overrides,
    reason: '命中已安装的椭圆模板。',
  }
}

function quadraticPlan(overrides = {}) {
  return {
    schemaVersion: '0.1',
    status: 'matched',
    subject: 'math',
    topic: '二次函数顶点变化',
    templateId: 'math.function.quadratic-vertex',
    parameterOverrides: overrides,
    reason: '命中二次函数顶点式模板。',
  }
}

function genericFunctionPlan() {
  return {
    schemaVersion: '0.1',
    status: 'matched',
    subject: 'math',
    topic: '正弦函数参数变化',
    templateId: 'math.function.generic-2d',
    parameterOverrides: {},
    functionSpec: {
      expression: 'A*sin(B*x)', formula: 'y = A sin(Bx)', xMin: -10, xMax: 10,
      parameters: [
        { id: 'A', label: '振幅 A', value: 2, min: 0.5, max: 5, step: 0.1 },
        { id: 'B', label: '频率 B', value: 1, min: 0.2, max: 3, step: 0.1 },
      ],
    },
    reason: '交给安全通用函数运行时。',
  }
}

function timeExperimentPlan() {
  return {
    schemaVersion: '0.1', status: 'matched', subject: 'physics',
    topic: '自由落体运动', templateId: 'experiment.motion.point-2d', parameterOverrides: {},
    experimentSpec: {
      durationExpression: 'sqrt(2*h0/g)', xExpression: '0',
      yExpression: 'max(0,h0-0.5*g*t^2)', formula: 'h(t) = h0 - 0.5gt^2',
      conclusion: '速度随时间线性增加。',
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

describe('MiniMax configuration', () => {
  it('uses compact-plan defaults and the official endpoint', () => {
    const config = readMinimaxConfig({ MINIMAX_API_KEY: 'test-key' })
    expect(config.baseURL).toBe('https://api.minimaxi.com/anthropic')
    expect(config.model).toBe('MiniMax-M3')
    expect(config.maxTokens).toBe(2048)
    expect(config.apiKey).toBe('test-key')
  })

  it('never exposes the API key in public status', () => {
    const status = publicModelStatus({ MINIMAX_API_KEY: 'private-key' })
    expect(status.configured).toBe(true)
    expect(JSON.stringify(status)).not.toContain('private-key')
  })
})

describe('MiniMax compact planning', () => {
  it('normalizes unambiguous numeric strings', () => {
    const normalized = normalizeGeneratedPlan({
      ...ellipsePlan(),
      schemaVersion: 0.1,
      parameterOverrides: { majorAxis: '12', minorAxis: '8.5' },
    })

    expect(normalized.schemaVersion).toBe('0.1')
    expect(normalized.parameterOverrides).toEqual({ majorAxis: 12, minorAxis: 8.5 })
    expect(validateGeneratedPlan(normalized)).toEqual(normalized)

    const missingOverrides = normalizeGeneratedPlan({
      ...timeExperimentPlan(), parameterOverrides: undefined,
    })
    delete missingOverrides.parameterOverrides
    const repairedOverrides = normalizeGeneratedPlan(missingOverrides)
    expect(repairedOverrides.parameterOverrides).toEqual({})
    expect(validateGeneratedPlan(repairedOverrides)).toEqual(repairedOverrides)

    const quadratic = normalizeGeneratedPlan(quadraticPlan({ coefficientA: '-2' }))
    expect(quadratic.parameterOverrides.coefficientA).toBe(-2)

    const annotatedZero = normalizeGeneratedPlan({
      ...timeExperimentPlan(),
      experimentSpec: {
        ...timeExperimentPlan().experimentSpec,
        yExpression: '  $0$  ',
        vectors: [{
          ...timeExperimentPlan().experimentSpec.vectors[0],
          yExpression: '0（无竖直分量）',
        }],
      },
    })
    expect(annotatedZero.experimentSpec.yExpression).toBe('0')
    expect(annotatedZero.experimentSpec.vectors[0].yExpression).toBe('0')
    expect(validateGeneratedPlan(annotatedZero)).toEqual(annotatedZero)

    const generic = normalizeGeneratedPlan({
      ...genericFunctionPlan(),
      functionSpec: {
        ...genericFunctionPlan().functionSpec,
        xMin: '-1e1',
        xMax: '10',
        parameters: genericFunctionPlan().functionSpec.parameters.map((parameter) => ({
          ...parameter,
          value: String(parameter.value), min: String(parameter.min),
          max: String(parameter.max), step: String(parameter.step),
        })),
      },
    })
    expect(generic.functionSpec.xMin).toBe(-10)
    expect(generic.functionSpec.parameters[0]).toMatchObject({ value: 2, min: 0.5, max: 5, step: 0.1 })
    expect(validateGeneratedPlan(generic)).toEqual(generic)

    const experiment = normalizeGeneratedPlan({
      ...timeExperimentPlan(),
      experimentSpec: {
        ...timeExperimentPlan().experimentSpec,
        xExpression: 0,
        vectors: timeExperimentPlan().experimentSpec.vectors.map((vector) => ({
          ...vector, xExpression: 0, scale: String(vector.scale),
        })),
        parameters: timeExperimentPlan().experimentSpec.parameters.map((parameter) => ({
          ...parameter, value: String(parameter.value), min: String(parameter.min),
          max: String(parameter.max), step: String(parameter.step),
        })),
      },
    })
    expect(experiment.experimentSpec.xExpression).toBe('0')
    expect(experiment.experimentSpec.parameters[1].value).toBe(9.8)
    expect(experiment.experimentSpec).toMatchObject({
      bodyId: 'primary', bodyLabel: '运动物体', additionalBodies: [], constraints: [],
    })
    expect(experiment.experimentSpec.vectors[0]).toMatchObject({
      xExpression: '0', scale: 0.1, bodyId: 'primary',
    })
    expect(validateGeneratedPlan(experiment)).toEqual(experiment)

    const withoutVectors = normalizeGeneratedPlan({
      ...timeExperimentPlan(),
      experimentSpec: { ...timeExperimentPlan().experimentSpec, vectors: undefined },
    })
    delete withoutVectors.experimentSpec.vectors
    const repaired = normalizeGeneratedPlan(withoutVectors)
    expect(repaired.experimentSpec.vectors).toEqual([])
    expect(validateGeneratedPlan(repaired)).toEqual(repaired)
  })

  it('extracts a LessonPlan from a forced tool call', () => {
    const plan = ellipsePlan({ majorAxis: 12, minorAxis: 8 })
    const extracted = extractPlanFromModelResponse({
      content: [{ type: 'tool_use', name: 'emit_lesson_plan', input: plan }],
    })
    expect(extracted).toEqual(plan)
    expect(validateGeneratedPlan(extracted)).toEqual(plan)
  })

  it('accepts a bounded generic function plan and rejects unsafe identifiers', () => {
    expect(validateGeneratedPlan(genericFunctionPlan())).toEqual(genericFunctionPlan())
    expect(() => validateGeneratedPlan({
      ...genericFunctionPlan(),
      functionSpec: { ...genericFunctionPlan().functionSpec, expression: 'fetch(x)' },
    })).toThrow(/未知标识符/)
  })

  it('accepts a point-motion experiment and rejects arbitrary expressions', () => {
    expect(validateGeneratedPlan(timeExperimentPlan())).toEqual(timeExperimentPlan())
    expect(() => validateGeneratedPlan({
      ...timeExperimentPlan(),
      experimentSpec: { ...timeExperimentPlan().experimentSpec, yExpression: 'document(t)' },
    })).toThrow(/未知标识符/)
  })

  it('accepts multiple bodies and rejects a vector with a missing anchor', () => {
    const multi = normalizeGeneratedPlan({
      ...timeExperimentPlan(),
      experimentSpec: {
        ...timeExperimentPlan().experimentSpec,
        bodyId: 'left', bodyLabel: '左球',
        additionalBodies: [{ id: 'right', label: '右球', xExpression: 't', yExpression: 0 }],
        vectors: [{
          id: 'rightVelocity', label: '右球速度', bodyId: 'right',
          xExpression: 1, yExpression: 0, scale: 0.5, unit: 'm/s',
        }],
      },
    })
    expect(multi.experimentSpec.additionalBodies[0].yExpression).toBe('0')
    expect(validateGeneratedPlan(multi)).toEqual(multi)

    expect(() => validateGeneratedPlan({
      ...multi,
      experimentSpec: {
        ...multi.experimentSpec,
        vectors: [{ ...multi.experimentSpec.vectors[0], bodyId: 'missing' }],
      },
    })).toThrow(/不存在的运动物体/)
  })

  it('normalizes and validates rope and spring constraints', () => {
    const pendulum = normalizeGeneratedPlan({
      ...timeExperimentPlan(),
      experimentSpec: {
        ...timeExperimentPlan().experimentSpec,
        bodyId: 'bob', bodyLabel: '摆球',
        durationExpression: '4*pi',
        xExpression: 'L*sin(theta)', yExpression: '0-L*cos(theta)',
        parameters: [
          { id: 'L', label: '摆长', value: 4, min: 1, max: 6, step: 0.1 },
          { id: 'theta0', label: '初始摆角', value: 0.2, min: 0.05, max: 0.35, step: 0.01 },
        ],
        metrics: [{ id: 'theta', label: '摆角', expression: 'theta0*cos(t)', unit: 'rad' }],
        vectors: [],
        constraints: [{
          id: 'rope', label: '摆绳', type: 'rope', bodyId: 'bob',
          anchorXExpression: 0, anchorYExpression: '  $0$  ', restLengthExpression: 'L',
        }],
      },
    })
    expect(pendulum.experimentSpec.constraints[0]).toMatchObject({
      anchorXExpression: '0', anchorYExpression: '0', restLengthExpression: 'L',
    })
    expect(validateGeneratedPlan(pendulum)).toEqual(pendulum)
    expect(() => validateGeneratedPlan({
      ...pendulum,
      experimentSpec: {
        ...pendulum.experimentSpec,
        constraints: [{ ...pendulum.experimentSpec.constraints[0], bodyId: 'missing' }],
      },
    })).toThrow(/不存在的运动物体/)
  })

  it('repairs dual-pendulum support heights and accidental expression quotes locally', () => {
    const raw = {
      schemaVersion: 0.1, status: 'matched', subject: 'physics',
      topic: '两个独立钟摆', templateId: 'experiment.motion.point-2d', parameterOverrides: {},
      experimentSpec: {
        durationExpression: '4*pi*sqrt(L1/g)"', bodyId: 'pendulum1', bodyLabel: '钟摆1摆球',
        xExpression: 'L1*sin(theta1)"', yExpression: 'H1-L1*cos(theta1)"',
        formula: 'theta=theta0*cos(sqrt(g/L)*t)', conclusion: '两个钟摆各自独立运动。',
        parameters: [
          { id: 'L1', label: '钟摆1摆长', value: 1.5, min: 0.3, max: 3, step: 0.1 },
          { id: 'L2', label: '钟摆2摆长', value: 1, min: 0.3, max: 3, step: 0.1 },
          { id: 'theta0', label: '初始摆角', value: 0.2, min: 0.05, max: 0.35, step: 0.01 },
          { id: 'g', label: '重力加速度', value: 9.8, min: 1.6, max: 20, step: 0.1 },
          { id: 'x2', label: '钟摆2水平偏移', value: 3, min: 1, max: 6, step: 0.1 },
          { id: 'H1', label: '悬挂高度', value: 4, min: 2, max: 8, step: 0.1 },
        ],
        metrics: [
          { id: 'theta1', label: '钟摆1角位移', expression: 'theta0*cos(sqrt(g/L1)*t)"', unit: 'rad' },
          { id: 'theta2', label: '钟摆2角位移', expression: 'theta0*cos(sqrt(g/L2)*t)"', unit: 'rad' },
          { id: 'period1', label: '钟摆1周期', expression: '2*pi*sqrt(L1/g)"', unit: 's' },
          { id: 'period2', label: '钟摆2周期', expression: '2*pi*sqrt(L2/g)"', unit: 's' },
        ],
        additionalBodies: [{
          id: 'pendulum2', label: '钟摆2摆球',
          xExpression: 'x2+L2*sin(theta2)"', yExpression: 'H2-L2*cos(theta2)"',
        }],
        vectors: [],
        constraints: [
          { id: 'rope1', label: '钟摆1绳', type: 'rope', bodyId: 'pendulum1', anchorXExpression: '0"', anchorYExpression: 'H1"', restLengthExpression: 'L1"' },
          { id: 'rope2', label: '钟摆2绳', type: 'rope', bodyId: 'pendulum2', anchorXExpression: 'x2"', anchorYExpression: 'H1"', restLengthExpression: 'L2"' },
        ],
      },
      reason: '用两个 rope 约束显示双钟摆。',
    }
    const repaired = normalizeGeneratedPlan(raw)
    expect(repaired.experimentSpec.durationExpression).toBe('4*pi*sqrt(L1/g)')
    expect(repaired.experimentSpec.additionalBodies[0].yExpression).toBe('(H1)-L2*cos(theta2)')
    expect(repaired.experimentSpec.constraints[1].anchorYExpression).toBe('H1')
    expect(validateGeneratedPlan(repaired)).toEqual(repaired)

    const missingAllHeights = structuredClone(raw)
    missingAllHeights.experimentSpec.parameters = missingAllHeights.experimentSpec.parameters
      .filter((parameter) => parameter.id !== 'H1')
    const zeroBased = normalizeGeneratedPlan(missingAllHeights)
    expect(zeroBased.experimentSpec.yExpression).toBe('0-L1*cos(theta1)')
    expect(zeroBased.experimentSpec.additionalBodies[0].yExpression).toBe('0-L2*cos(theta2)')
    expect(zeroBased.experimentSpec.constraints.map((constraint) => constraint.anchorYExpression)).toEqual(['0', '0'])
    expect(validateGeneratedPlan(zeroBased)).toEqual(zeroBased)
  })

  it('adds a local post-collision observation window without another model call', () => {
    const repaired = normalizeGeneratedPlan({
      ...timeExperimentPlan(),
      experimentSpec: {
        ...timeExperimentPlan().experimentSpec,
        durationExpression: '(x2-x1)/(u1-u2)',
        xExpression: 'x1+u1*min(t,tc)', yExpression: '0',
        parameters: [
          { id: 'x1', label: '初位置 1', value: -5, min: -8, max: -2, step: 1 },
          { id: 'x2', label: '初位置 2', value: 1, min: 1, max: 4, step: 1 },
          { id: 'u1', label: '初速度 1', value: 3, min: 1, max: 5, step: 0.5 },
          { id: 'u2', label: '初速度 2', value: 0, min: -3, max: 0, step: 0.5 },
        ],
        metrics: [{ id: 'tc', label: '碰撞时刻', expression: '(x2-x1)/(u1-u2)', unit: 's' }],
        bodyId: 'ball1', bodyLabel: '小球 1',
        additionalBodies: [{ id: 'ball2', label: '小球 2', xExpression: 'x2+u2*t', yExpression: '0' }],
        vectors: [],
      },
    })
    expect(repaired.experimentSpec.durationExpression).toBe('((x2-x1)/(u1-u2))+3')
    expect(validateGeneratedPlan(repaired)).toEqual(repaired)
  })

  it('calls MiniMax-M3 with the compact plan schema and reports token usage', async () => {
    const plan = ellipsePlan()
    const create = vi.fn().mockResolvedValue({
      model: 'MiniMax-M3',
      content: [{ type: 'tool_use', name: 'emit_lesson_plan', input: plan }],
      usage: { input_tokens: 80, cache_read_input_tokens: 30, output_tokens: 90 },
    })
    const result = await generateLessonPlan('识别一个教学目标', {
      environment: { MINIMAX_API_KEY: 'test-key' },
      client: { messages: { create } },
    })

    const request = create.mock.calls[0][0]
    expect(request.max_tokens).toBe(2048)
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'emit_lesson_plan' })
    expect(request.tools[0].input_schema.title).toBe('LessonPlan 0.1')
    expect(result.plan).toEqual(plan)
    expect(result.apiVersion).toBe('lesson-plan-0.6')
    expect(result.usage).toEqual({
      inputTokens: 80, cachedInputTokens: 30, outputTokens: 90,
      modelCalls: 1, repaired: false,
    })
  })

  it('feeds validation errors back once and aggregates repair token usage', async () => {
    const invalidPlan = {
      ...genericFunctionPlan(),
      functionSpec: { ...genericFunctionPlan().functionSpec, expression: 'missing(x)' },
    }
    const create = vi.fn()
      .mockResolvedValueOnce({
        model: 'MiniMax-M3',
        content: [{ type: 'tool_use', id: 'first-tool', name: 'emit_lesson_plan', input: invalidPlan }],
        usage: { input_tokens: 100, cache_read_input_tokens: 20, output_tokens: 60 },
      })
      .mockResolvedValueOnce({
        model: 'MiniMax-M3',
        content: [{ type: 'tool_use', id: 'repair-tool', name: 'emit_lesson_plan', input: genericFunctionPlan() }],
        usage: { input_tokens: 140, cache_read_input_tokens: 30, output_tokens: 70 },
      })
    const result = await generateLessonPlan('绘制一个可调正弦函数', {
      environment: { MINIMAX_API_KEY: 'test-key' },
      client: { messages: { create } },
    })

    expect(create).toHaveBeenCalledTimes(2)
    const repairRequest = create.mock.calls[1][0]
    expect(repairRequest.messages).toHaveLength(3)
    expect(repairRequest.messages[1]).toMatchObject({ role: 'assistant' })
    expect(repairRequest.messages[2].content[0]).toMatchObject({
      type: 'tool_result', tool_use_id: 'first-tool', is_error: true,
    })
    expect(repairRequest.messages[2].content[0].content).toContain('missing')
    expect(result.plan).toEqual(genericFunctionPlan())
    expect(result.usage).toEqual({
      inputTokens: 240, cachedInputTokens: 50, outputTokens: 130,
      modelCalls: 2, repaired: true,
    })
  })

  it('stops after one failed repair instead of repeatedly spending tokens', async () => {
    const invalidPlan = {
      ...genericFunctionPlan(),
      functionSpec: { ...genericFunctionPlan().functionSpec, expression: 'missing(x)' },
    }
    const create = vi.fn()
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'first-tool', name: 'emit_lesson_plan', input: invalidPlan }],
        usage: { input_tokens: 100, output_tokens: 60 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'second-tool', name: 'emit_lesson_plan', input: invalidPlan }],
        usage: { input_tokens: 140, output_tokens: 60 },
      })

    await expect(generateLessonPlan('绘制函数', {
      environment: { MINIMAX_API_KEY: 'test-key' },
      client: { messages: { create } },
    })).rejects.toThrow(/自动纠错后规划仍无效.*missing/)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('repairs a browser-rejected plan with exactly one correction call', async () => {
    const create = vi.fn().mockResolvedValue({
      model: 'MiniMax-M3',
      content: [{ type: 'tool_use', id: 'repair-tool', name: 'emit_lesson_plan', input: timeExperimentPlan() }],
      usage: { input_tokens: 150, cache_read_input_tokens: 40, output_tokens: 75 },
    })
    const result = await repairLessonPlan(
      '模拟自由落体',
      timeExperimentPlan(),
      '绳约束在运行区间内未保持长度不变。',
      { environment: { MINIMAX_API_KEY: 'test-key' }, client: { messages: { create } } },
    )

    expect(create).toHaveBeenCalledTimes(1)
    const requestText = create.mock.calls[0][0].messages[0].content[0].text
    expect(requestText).toContain('上一版 LessonPlan')
    expect(requestText).toContain('未保持长度不变')
    expect(result.usage).toEqual({
      inputTokens: 150, cachedInputTokens: 40, outputTokens: 75,
      modelCalls: 1, repaired: true,
    })
  })

  it('rejects inconsistent or invalid plans', () => {
    expect(() => validateGeneratedPlan({ schemaVersion: '0.1' })).toThrow(/LessonPlan Schema/)
    expect(() => validateGeneratedPlan({
      ...ellipsePlan(),
      status: 'unsupported',
    })).toThrow(/状态与模板不一致/)
    expect(() => validateGeneratedPlan(ellipsePlan({ majorAxis: 6, minorAxis: 10 })))
      .toThrow(/长轴全长/)
    expect(() => validateGeneratedPlan(quadraticPlan({ coefficientA: 0 })))
      .toThrow(/不能为 0/)
    expect(validateGeneratedPlan(quadraticPlan({ coefficientA: -2, vertexH: 1, vertexK: 3 })))
      .toEqual(quadraticPlan({ coefficientA: -2, vertexH: 1, vertexK: 3 }))
  })
})
