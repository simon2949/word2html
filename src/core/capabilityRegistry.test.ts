import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_GAP_REGISTRY,
  CAPABILITY_REGISTRY,
  INSTALLED_CAPABILITY_BINDINGS,
  getCapabilityDefinition,
  isRegisteredTemplateId,
  resolveCapabilityRequest,
} from './capabilityRegistry'
import { STANDALONE_HTML_EXPORTER_TEMPLATE_IDS } from './exportHtml'

describe('capability registry consistency', () => {
  it('uses unique stable IDs and complete runtime bindings', () => {
    const capabilityIds = CAPABILITY_REGISTRY.map((item) => item.id)
    const gapIds = CAPABILITY_GAP_REGISTRY.map((item) => item.id)
    expect(new Set(capabilityIds).size).toBe(capabilityIds.length)
    expect(new Set(gapIds).size).toBe(gapIds.length)

    for (const capability of CAPABILITY_REGISTRY) {
      expect(capability.intentTerms.length).toBeGreaterThan(0)
      expect(capability.primitives.length).toBeGreaterThan(0)
      expect(INSTALLED_CAPABILITY_BINDINGS.templateIds).toContain(capability.templateId)
      expect(INSTALLED_CAPABILITY_BINDINGS.rendererIds).toContain(capability.rendererId)
      expect(INSTALLED_CAPABILITY_BINDINGS.validatorIds).toContain(capability.validatorId)
      expect(INSTALLED_CAPABILITY_BINDINGS.exporterIds).toContain(capability.exporterId)
      expect(getCapabilityDefinition(capability.id)).toBe(capability)
      expect(isRegisteredTemplateId(capability.templateId)).toBe(true)
    }
    expect(new Set(STANDALONE_HTML_EXPORTER_TEMPLATE_IDS)).toEqual(
      new Set(INSTALLED_CAPABILITY_BINDINGS.templateIds),
    )
    expect(getCapabilityDefinition('math.curve.relation-2d')?.status).toBe('verified')
    expect(getCapabilityDefinition('math.function.explicit-2d')?.status).toBe('verified')
    expect(getCapabilityDefinition('math.data.chart-2d')?.status).toBe('verified')
    expect(getCapabilityDefinition('math.geometry.primitives-2d')?.status).toBe('verified')
    expect(getCapabilityDefinition('math.geometry.parametric-trace-2d')?.status).toBe('verified')
    expect(getCapabilityDefinition('physics.collision.discs-2d')?.status).toBe('verified')
    expect(getCapabilityDefinition('physics.motion.point-2d')?.status).toBe('verified')
  })

  it('maps supported requests to a concrete template or runtime', () => {
    const ellipse = resolveCapabilityRequest('演示椭圆上动点到两个焦点的距离和')
    expect(ellipse?.matchSource).toBe('verified-template')
    expect(ellipse?.capabilities[0]?.id).toBe('math.ellipse.focus-distance-sum')
    expect(ellipse?.needsModel).toBe(false)

    const sine = resolveCapabilityRequest('绘制 y=A*sin(B*x)，可调 A 和 B')
    expect(sine?.matchSource).toBe('registered-runtime')
    expect(sine?.templateId).toBe('math.function.generic-2d')
    expect(sine?.needsModel).toBe(true)

    const fall = resolveCapabilityRequest('模拟自由落体运动，可调初始高度和重力加速度')
    expect(fall?.subject).toBe('physics')
    expect(fall?.templateId).toBe('experiment.motion.point-2d')

    const hyperbola = resolveCapabilityRequest('制作双曲线函数图像并演示焦点距离差不变')
    expect(hyperbola?.capabilities[0]?.id).toBe('math.geometry.parametric-trace-2d')

    const geometry = resolveCapabilityRequest('制作一个可以拖动顶点的三角形，显示边长角度和面积')
    expect(geometry?.capabilities[0]?.id).toBe('math.geometry.primitives-2d')
    expect(geometry?.templateId).toBe('math.geometry.primitives-2d')

    const transformation = resolveCapabilityRequest('让点 A 绕点 O 旋转并显示圆周轨迹和垂足')
    expect(transformation?.capabilities[0]?.id).toBe('math.geometry.primitives-2d')
    expect(transformation?.interactions).toContain('显示或隐藏几何轨迹')

    const implicit = resolveCapabilityRequest('绘制隐函数 x^2+y^2=4 的等值线图像')
    expect(implicit?.capabilities[0]?.id).toBe('math.curve.relation-2d')
    expect(implicit?.templateId).toBe('math.curve.relation-2d')

    const polar = resolveCapabilityRequest('绘制极坐标玫瑰线 r=3*cos(3*theta)')
    expect(polar?.templateId).toBe('math.curve.relation-2d')

    const parametric = resolveCapabilityRequest('绘制参数方程 x=2*cos(t), y=2*sin(t) 的图像')
    expect(parametric?.templateId).toBe('math.curve.relation-2d')

    const chart = resolveCapabilityRequest('制作两地月平均气温折线图并显示数据值')
    expect(chart?.capabilities[0]?.id).toBe('math.data.chart-2d')
    expect(chart?.templateId).toBe('math.data.chart-2d')
    expect(chart?.needsModel).toBe(true)
  })

  it('reports concrete renderer gaps instead of pretending a model can fulfil them', () => {
    const chemistry = resolveCapabilityRequest('展示酸碱中和过程')
    expect(chemistry?.matchSource).toBe('capability-gap')
    expect(chemistry?.needsModel).toBe(false)
    expect(chemistry?.missingCapabilities.map((item) => item.label)).toEqual(
      expect.arrayContaining(['实验容器', '物质与粒子', '反应进度']),
    )

    const collision = resolveCapabilityRequest('制作三个小球在二维平面碰撞的实验')
    expect(collision?.matchSource).toBe('registered-runtime')
    expect(collision?.templateId).toBe('physics.collision.discs-2d')
    expect(collision?.needsModel).toBe(true)
  })
})
