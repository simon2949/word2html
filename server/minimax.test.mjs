import { describe, expect, it, vi } from 'vitest'
import {
  extractPlanFromModelResponse,
  generateLessonPlan,
  normalizeGeneratedPlan,
  publicModelStatus,
  readMinimaxConfig,
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
    expect(config.maxTokens).toBe(1024)
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

    const quadratic = normalizeGeneratedPlan(quadraticPlan({ coefficientA: '-2' }))
    expect(quadratic.parameterOverrides.coefficientA).toBe(-2)

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
    expect(experiment.experimentSpec.vectors[0]).toMatchObject({ xExpression: '0', scale: 0.1 })
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
    expect(request.max_tokens).toBe(1024)
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'emit_lesson_plan' })
    expect(request.tools[0].input_schema.title).toBe('LessonPlan 0.1')
    expect(result.plan).toEqual(plan)
    expect(result.apiVersion).toBe('lesson-plan-0.3')
    expect(result.usage).toEqual({ inputTokens: 80, cachedInputTokens: 30, outputTokens: 90 })
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
