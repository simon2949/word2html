import { afterEach, describe, expect, it, vi } from 'vitest'
import { isNumberParameter } from '../types/lessonScene'
import {
  editSceneWithModel,
  generateSceneWithModel,
  getPublicModelOptions,
  instantiateLessonPlan,
  lessonPlanFromScene,
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

function relationCurvePlan(): LessonPlan {
  return {
    schemaVersion: '0.1', status: 'matched', subject: 'math',
    topic: '三瓣玫瑰线', templateId: 'math.curve.relation-2d', parameterOverrides: {},
    relationSpec: {
      mode: 'polar', formula: 'r=a cos(3θ)', conclusion: '观察参数 a 对玫瑰线尺度的影响。',
      parameters: [{ id: 'a', label: '尺度 a', value: 3, min: 1, max: 5, step: 0.25 }],
      xMin: -4, xMax: 4, yMin: -4, yMax: 4,
      variableMin: 0, variableMax: Math.PI * 2, radialExpression: 'a*cos(3*theta)',
    },
    reason: '使用安全二维关系曲线运行时。',
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

function geometryPlan(): LessonPlan {
  return {
    schemaVersion: '0.1', status: 'matched', subject: 'math',
    topic: '三角形边角测量', templateId: 'math.geometry.primitives-2d', parameterOverrides: {},
    geometrySpec: {
      formula: 'S=1/2*base*height', conclusion: '拖动顶点观察测量值变化。',
      parameters: [
        { id: 'Ax', label: 'A 点横坐标', value: 0, min: -8, max: 8, step: 0.1 },
        { id: 'Ay', label: 'A 点纵坐标', value: 0, min: -6, max: 6, step: 0.1 },
      ],
      points: [
        { id: 'A', label: 'A', xExpression: 'Ax', yExpression: 'Ay', draggable: true },
        { id: 'B', label: 'B', xExpression: '3', yExpression: '0' },
        { id: 'C', label: 'C', xExpression: '0', yExpression: '4' },
      ],
      connections: [{ id: 'AB', label: 'AB', kind: 'segment', fromPointId: 'A', toPointId: 'B' }],
      arcs: [{ id: 'Aarc', label: '∠A', centerPointId: 'A', startPointId: 'B', endPointId: 'C' }],
      polygons: [{ id: 'ABC', label: '三角形 ABC', pointIds: ['A', 'B', 'C'], filled: true }],
      measurements: [
        { id: 'AB', label: 'AB', kind: 'distance', pointIds: ['A', 'B'], unit: '' },
        { id: 'area', label: '面积', kind: 'area', pointIds: ['A', 'B', 'C'], unit: '' },
      ],
      loci: [],
    },
    reason: '使用声明式二维几何运行时。',
  }
}

function collisionPlan(): LessonPlan {
  return {
    schemaVersion: '0.1', status: 'matched', subject: 'physics',
    topic: '二维圆盘弹性碰撞', templateId: 'physics.collision.discs-2d', parameterOverrides: {},
    collisionSpec: {
      durationExpression: 'duration', gravityXExpression: '0', gravityYExpression: '0',
      restitutionExpression: 'restitution',
      formula: 'm1*v1+m2*v2=m1*v1p+m2*v2p', conclusion: '碰撞前后系统总动量保持不变。',
      parameters: [
        { id: 'duration', label: '实验时长', value: 3, min: 1, max: 5, step: 0.25 },
        { id: 'restitution', label: '恢复系数', value: 1, min: 0, max: 1, step: 0.1 },
      ],
      bounds: { xMinExpression: '0-10', xMaxExpression: '10', yMinExpression: '0-5', yMaxExpression: '5' },
      bodies: [
        { id: 'ballA', label: '小球 A', xExpression: '0-3', yExpression: '0', vxExpression: '2', vyExpression: '0', radiusExpression: '0.5', massExpression: '1' },
        { id: 'ballB', label: '小球 B', xExpression: '0', yExpression: '0', vxExpression: '0', vyExpression: '0', radiusExpression: '0.5', massExpression: '1' },
      ],
    },
    reason: '使用确定性二维圆盘接触求解器。',
  }
}

function dataChartPlan(): LessonPlan {
  return {
    schemaVersion: '0.1', status: 'matched', subject: 'math',
    topic: '两地月平均气温', templateId: 'math.data.chart-2d', parameterOverrides: {},
    dataChartSpec: {
      mode: 'line', formula: '比较折线变化趋势', conclusion: '甲地升温更快。',
      xLabel: '月份', yLabel: '平均气温', unit: '℃',
      categories: ['一月', '二月', '三月'],
      series: [
        { id: 'placeA', label: '甲地', values: [-2, 1, 7] },
        { id: 'placeB', label: '乙地', values: [6, 8, 11] },
      ],
    },
    reason: '使用安全数据图表运行时。',
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
    expect(scene.metadata).toMatchObject({
      title: matchedPlan().topic,
      topic: matchedPlan().topic,
      summary: matchedPlan().reason,
    })
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
    expect(scene.metadata.title).toBe(quadraticPlan().topic)
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

  it('instantiates and reconstructs a polar relation curve', () => {
    const scene = instantiateLessonPlan(relationCurvePlan())
    expect(scene.templateRef.id).toBe('math.curve.relation-2d')
    expect(scene.objects.find((object) => object.kind === 'relation-curve')?.bindings.mode).toBe('polar')
    expect(lessonPlanFromScene(scene).relationSpec).toEqual(relationCurvePlan().relationSpec)
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

  it('instantiates and reconstructs a declarative two-dimensional geometry plan', () => {
    const scene = instantiateLessonPlan(geometryPlan())
    expect(scene.templateRef.id).toBe('math.geometry.primitives-2d')
    expect(scene.objects.some((object) => object.kind === 'polygon')).toBe(true)
    expect(scene.objects.some((object) => object.kind === 'arc')).toBe(true)
    expect(lessonPlanFromScene(scene).geometrySpec).toEqual(geometryPlan().geometrySpec)
  })

  it('round-trips constructed points, constraints, and local loci', () => {
    const plan = geometryPlan()
    plan.geometrySpec!.parameters.push({ id: 'theta', label: '旋转角', value: 0.5, min: 0, max: 6.28, step: 0.05 })
    plan.geometrySpec!.points[0]!.constraint = { kind: 'segment', pointAId: 'B', pointBId: 'C' }
    plan.geometrySpec!.points.push({ id: 'R', label: 'R', construction: { kind: 'rotation', sourcePointId: 'B', centerPointId: 'A', angleExpression: 'theta' } })
    plan.geometrySpec!.loci = [{ id: 'rotation', label: 'R 的轨迹', pointId: 'R', parameterId: 'theta' }]
    const scene = instantiateLessonPlan(plan)

    expect(scene.objects.find((object) => object.id === 'point.R')?.bindings.constructionKind).toBe('rotation')
    expect(scene.objects.find((object) => object.id === 'point.A')?.bindings.pointConstraintKind).toBe('segment')
    expect(scene.objects.find((object) => object.id === 'locus.rotation')?.kind).toBe('locus')
    expect(lessonPlanFromScene(scene).geometrySpec).toEqual(plan.geometrySpec)
  })

  it('instantiates and reconstructs a deterministic two-dimensional collision plan', () => {
    const scene = instantiateLessonPlan(collisionPlan())
    expect(scene.templateRef.id).toBe('physics.collision.discs-2d')
    expect(scene.objects.filter((object) => object.kind === 'collision-body')).toHaveLength(2)
    expect(lessonPlanFromScene(scene).collisionSpec).toEqual(collisionPlan().collisionSpec)
  })

  it('instantiates and reconstructs a compact data-chart plan', () => {
    const scene = instantiateLessonPlan(dataChartPlan())
    expect(scene.templateRef.id).toBe('math.data.chart-2d')
    expect(scene.objects.filter((object) => object.kind === 'chart-line-series')).toHaveLength(2)
    expect(lessonPlanFromScene(scene).dataChartSpec).toEqual(dataChartPlan().dataChartSpec)
  })

  it('reconstructs an editable compact plan from the current scene', () => {
    const scene = instantiateLessonPlan(timeExperimentPlan())
    const vector = scene.objects.find((object) => object.id === 'vector.velocity')
    if (!vector) throw new Error('missing vector')
    vector.role = '几何距离'
    vector.bindings.labelMode = 'value'

    const plan = lessonPlanFromScene(scene)

    expect(plan.templateId).toBe('experiment.motion.point-2d')
    expect(plan.experimentSpec?.vectors[0]).toMatchObject({
      id: 'velocity', display: 'distance', labelMode: 'value', bodyId: 'primary',
    })
    expect(plan.experimentSpec?.parameters[0]?.value).toBe(20)
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: 'lesson-plan-1.4',
        plan: genericFunctionPlan(),
        usage: { inputTokens: 70, cachedInputTokens: 20, outputTokens: 85 },
        provider: { name: 'MiniMax', model: 'MiniMax-M3' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateSceneWithModel(
      '绘制一个可调正弦函数',
      'math.function.explicit-2d',
      { modelId: 'minimax-m3', apiKey: 'temporary-user-secret' },
    )

    expect(result.scene.templateRef.id).toBe('math.function.generic-2d')
    expect(result.usage.outputTokens).toBe(85)
    expect(result.plan.functionSpec?.expression).toBe('A*sin(B*x)')
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const requestBody = String(request?.body)
    expect(JSON.parse(requestBody).capabilityId).toBe('math.function.explicit-2d')
    expect(requestBody).not.toContain('temporary-user-secret')
    expect(request?.headers).toMatchObject({
      'X-Word2HTML-Model-ID': 'minimax-m3',
      'X-Word2HTML-Temporary-API-Key': 'temporary-user-secret',
      'Idempotency-Key': expect.stringMatching(/^w2h-/),
    })
  })

  it('loads only the public trusted model option contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      apiVersion: 'lesson-plan-1.4',
      defaultModelId: 'minimax-m3',
      models: [{
        id: 'minimax-m3', label: 'MiniMax M3', provider: 'MiniMax',
        protocol: 'anthropic-compatible', model: 'MiniMax-M3', platformKeyAvailable: true,
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(getPublicModelOptions()).resolves.toMatchObject({
      defaultModelId: 'minimax-m3', models: [{ id: 'minimax-m3' }],
    })
  })

  it('edits against the current plan and preserves local appearance settings', async () => {
    const current = instantiateLessonPlan(timeExperimentPlan())
    current.appearance.helperColor = '#123456'
    const editedPlan: LessonPlan = {
      ...timeExperimentPlan(),
      experimentSpec: {
        ...timeExperimentPlan().experimentSpec!,
        vectors: timeExperimentPlan().experimentSpec!.vectors.map((vector) => ({
          ...vector,
          display: 'distance' as const,
          labelMode: 'value' as const,
          scale: 1,
        })),
      },
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: 'lesson-plan-1.4',
        plan: editedPlan,
        usage: { inputTokens: 180, outputTokens: 120, modelCalls: 1 },
        provider: { name: 'MiniMax', model: 'MiniMax-M3' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await editSceneWithModel('把现有矢量改成距离直线并标注长度', current)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    if (typeof request?.body !== 'string') throw new Error('missing request body')
    const body = JSON.parse(request.body)
    expect(body.edit.basePlan.templateId).toBe('experiment.motion.point-2d')
    expect(body.edit.basePlan.experimentSpec.vectors[0].display).toBe('arrow')
    expect(result.plan.experimentSpec?.vectors[0]?.display).toBe('distance')
    expect(result.plan.experimentSpec?.vectors[0]?.labelMode).toBe('value')
    expect(result.changes).toContain('矢量/距离 velocity：线型 箭头 → 距离直线；标注 标签、数值和单位 → 仅数值；比例 0.1 → 1')
    expect(result.scene.appearance.helperColor).toBe('#123456')
    expect(result.scene.lineage.parentSceneId).toBe(current.id)
  })

  it('edits chart structure while preserving local series appearance', async () => {
    const current = instantiateLessonPlan(dataChartPlan())
    current.appearance.objectStyles = {
      'chart.series.placeA': { color: '#123456', lineWidth: 5 },
    }
    const editedPlan = structuredClone(dataChartPlan())
    editedPlan.dataChartSpec!.mode = 'bar'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: 'lesson-plan-1.4', plan: editedPlan,
        usage: { inputTokens: 120, outputTokens: 70, modelCalls: 1 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await editSceneWithModel('保留数据，改成分组柱状图', current)

    expect(result.plan.dataChartSpec?.mode).toBe('bar')
    expect(result.scene.templateRef.id).toBe('math.data.chart-2d')
    expect(result.scene.appearance.objectStyles?.['chart.series.placeA']).toEqual({ color: '#123456', lineWidth: 5 })
    expect(result.changes).toContain('图表类型 line → bar')
  })

  it('repairs a contextual response that makes no semantic change', async () => {
    const current = instantiateLessonPlan(timeExperimentPlan())
    const basePlan = lessonPlanFromScene(current)
    const editedPlan = structuredClone(basePlan)
    editedPlan.experimentSpec!.bodyLabel = '落体 P'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apiVersion: 'lesson-plan-1.4', plan: basePlan,
          usage: { inputTokens: 120, outputTokens: 80, modelCalls: 1 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apiVersion: 'lesson-plan-1.4', plan: editedPlan,
          usage: { inputTokens: 140, outputTokens: 90, modelCalls: 1, repaired: true },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const result = await editSceneWithModel('把运动点标签简化为落体 P', current)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const repairRequest = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined
    if (typeof repairRequest?.body !== 'string') throw new Error('missing repair request body')
    expect(JSON.parse(repairRequest.body).correction.validationError).toContain('没有对当前场景产生')
    expect(result.changes).toEqual(['主运动点标签：运动物体 → 落体 P'])
    expect(result.usage.modelCalls).toBe(2)
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
          apiVersion: 'lesson-plan-1.4', plan: invalidRopePlan,
          usage: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 80, modelCalls: 1, repaired: false },
          provider: { name: 'MiniMax', model: 'MiniMax-M3' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apiVersion: 'lesson-plan-1.4', plan: timeExperimentPlan(),
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
        apiVersion: 'lesson-plan-1.4', plan: invalidRopePlan,
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
