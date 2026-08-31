import { describe, expect, it } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { createQuadraticScene } from '../templates/quadraticTemplate'
import { createGenericFunctionScene } from '../templates/genericFunctionTemplate'
import { createTimeExperimentScene } from '../templates/timeExperimentTemplate'
import { createCollision2DScene } from '../templates/collision2dTemplate'
import { createRelationCurve2DScene } from '../templates/relationCurve2dTemplate'
import { createDataChart2DScene } from '../templates/dataChart2dTemplate'
import { exportSceneAsStandaloneHtml } from './exportHtml'
import { applyLayoutPreset, applyStylePreset } from './appearancePresets'

describe('standalone HTML export', () => {
  it('embeds the validated scene and local interaction runtime', () => {
    const scene = createEllipseScene()
    scene.appearance.pointStyle = 'shadow'
    scene.appearance.lineStyle = 'dash-dot'
    scene.appearance.helperLineStyle = 'dashed'
    scene.appearance.objectStyles = {
      focusLeft: { color: '#2244AA', pointRadius: 15, pointStyle: 'shadow' },
      distanceLeft: { lineWidth: 6, lineStyle: 'dash-dot' },
    }
    const html = exportSceneAsStandaloneHtml(scene)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('id="lesson-scene"')
    expect(html).toContain('椭圆的焦点距离和')
    expect(html).toContain('pointermove')
    expect(html).toContain('id="zoom-fit"')
    expect(html.indexOf('id="formula"')).toBeLessThan(html.indexOf('id="plot"'))
    expect(html).toContain('squareStep')
    expect(html).toContain('function dashAttr')
    expect(html).toContain('function pointAttrs')
    expect(html).toContain('function objectStyle')
    expect(html).toContain('data-scene-object-id="focusLeft"')
    expect(html).toContain('objectPointRadius(ap,\'focusLeft\')')
    expect(html).toContain('"objectStyles":{"focusLeft"')
    expect(html).toContain('"pointStyle":"shadow"')
    expect(html).not.toContain('apiKey')
    expect(html).not.toContain('https://')

    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone runtime')
    expect(() => new Function(runtime)).not.toThrow()
  })

  it('escapes markup from scene text before embedding it', () => {
    const scene = createEllipseScene()
    scene.metadata.title = '</script><script>alert(1)</script>'
    const html = exportSceneAsStandaloneHtml(scene)
    const embedded = html.split('<script id="lesson-scene" type="application/json">')[1]?.split('</script>')[0]
    expect(embedded).not.toContain('</script>')
    expect(embedded).toContain('\\u003c')
  })

  it('preserves controlled style and layout presets in standalone HTML', () => {
    const scene = applyLayoutPreset(applyStylePreset(createEllipseScene(), 'dark-presentation'), 'compact')
    const html = exportSceneAsStandaloneHtml(scene)

    expect(html).toContain('<body data-theme="dark" data-layout-preset="compact">')
    expect(html).toContain('body[data-layout-preset="compact"] .layout')
    expect(html).toContain("background=dark?'#17212b':'#fbfcfe'")
    expect(html).toContain('"layoutPreset":"compact"')
    expect(html).toContain('"curveColor":"#A9A7FF"')
  })

  it('exports a standalone quadratic runtime with local parameter controls', () => {
    const html = exportSceneAsStandaloneHtml(createQuadraticScene())
    expect(html).toContain('二次函数的顶点与开口')
    expect(html).toContain("['coefficientA','二次项系数 a']")
    expect(html).toContain('id="zoom-fit"')
    expect(html.indexOf('id="formula"')).toBeLessThan(html.indexOf('id="plot"'))
    expect(html).not.toContain('apiKey')
    expect(html).not.toContain('https://')

    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone quadratic runtime')
    expect(() => new Function(runtime)).not.toThrow()
  })

  it('exports a generic function with a parser instead of dynamic code execution', () => {
    const scene = createGenericFunctionScene({
      expression: 'A*sin(B*x)', formula: 'y = A sin(Bx)', xMin: -10, xMax: 10,
      parameters: [
        { id: 'A', label: '振幅 A', value: 2, min: 0.5, max: 5, step: 0.1 },
        { id: 'B', label: '频率 B', value: 1, min: 0.2, max: 3, step: 0.1 },
      ],
    }, { title: '正弦函数参数变化', topic: '正弦函数', summary: '调节振幅和频率。' })
    const html = exportSceneAsStandaloneHtml(scene)

    expect(html).toContain('A*sin(B*x)')
    expect(html).toContain('function compile(source,allowed)')
    expect(html).toContain('id="line-width"')
    expect(html).not.toContain('eval(')
    expect(html).not.toContain('new Function')
    expect(html).not.toContain('https://')

    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone generic function runtime')
    expect(() => new Function(runtime)).not.toThrow()
  })

  it('exports an offline time experiment with playback and local measurements', () => {
    const scene = createTimeExperimentScene({
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
    }, { title: '自由落体运动', topic: '自由落体', subject: 'physics', summary: '观察下落过程。' })
    const html = exportSceneAsStandaloneHtml(scene)

    expect(html).toContain('INTERACTIVE EXPERIMENT')
    expect(html).toContain("requestAnimationFrame(frame)")
    expect(html).toContain('max(0,h0-0.5*g*t^2)')
    expect(html).toContain('vector.velocity')
    expect(html).toContain('current.vectors.forEach')
    expect(html).toContain('辅助线、矢量与约束')
    expect(html).not.toContain('id="trace-snap-step"')
    expect(html).not.toContain('eval(')
    expect(html).not.toContain('new Function')
    expect(html).not.toContain('https://')

    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone time experiment runtime')
    expect(() => new Function(runtime)).not.toThrow()
  })

  it('exports offline drag projection and final-point coordinate snapping for math trajectories', () => {
    const scene = createTimeExperimentScene({
      durationExpression: '4', bodyId: 'moving', bodyLabel: 'P',
      xExpression: 't', yExpression: 't^2', formula: 'x=t, y=t²',
      conclusion: '拖动点沿轨迹改变共同参数。', parameters: [], metrics: [], vectors: [],
      additionalBodies: [{ id: 'fixed', label: 'F', xExpression: '2', yExpression: '0' }],
    }, { title: '参数轨迹', topic: '参数轨迹', subject: 'math', summary: '离线拖动。' })
    const html = exportSceneAsStandaloneHtml(scene)

    expect(html).toContain('id="trace-snap-step"')
    expect(html).toContain('function nearestTraceTime(')
    expect(html).toContain('function rootsFor(')
    expect(html).toContain('data-trace-draggable=')
    expect(html).toContain('data-time-trace-snap-axis')
    expect(html).toContain('data-world-x=')
    expect(html).toContain('data-world-y=')
    expect(html).toContain("plot.addEventListener('pointermove'")
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone math trajectory runtime')
    expect(() => new Function(runtime)).not.toThrow()
  })

  it('exports multiple bodies, independent trails, and anchored vectors', () => {
    const scene = createTimeExperimentScene({
      durationExpression: '4', bodyId: 'left', bodyLabel: '左球',
      xExpression: '0-t', yExpression: '0',
      formula: '双物体运动', conclusion: '两个物体独立运动。',
      parameters: [], metrics: [],
      additionalBodies: [{ id: 'right', label: '右球', xExpression: 't', yExpression: '0' }],
      vectors: [{
        id: 'rightVelocity', label: '右球速度', bodyId: 'right',
        xExpression: '1', yExpression: '0', scale: 0.5, unit: 'm/s',
      }],
    }, { title: '双物体运动', topic: '多物体', subject: 'physics', summary: '观察两个物体。' })
    const html = exportSceneAsStandaloneHtml(scene)

    expect(html).toContain('body.left')
    expect(html).toContain('body.right')
    expect(html).toContain('bodySpecs.map')
    expect(html).toContain('data-trail-id')
    expect(html).toContain('vector.spec.anchorId')

    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone multi-body runtime')
    expect(() => new Function(runtime)).not.toThrow()
  })

  it('exports geometric distance vectors as labelled straight segments', () => {
    const scene = createTimeExperimentScene({
      durationExpression: '4', bodyId: 'point', bodyLabel: 'P',
      xExpression: 't', yExpression: '2', formula: 'PF=sqrt((3-t)^2+4)',
      conclusion: '显示点到焦点的距离。', parameters: [], metrics: [], constraints: [],
      vectors: [{
        id: 'distance', label: 'PF', xExpression: '3-t', yExpression: '0-2',
        scale: 1, unit: 'm', bodyId: 'point', display: 'distance', labelMode: 'value',
      }],
    }, { title: '几何距离', topic: '距离', subject: 'math', summary: '直线距离标注。' })
    const html = exportSceneAsStandaloneHtml(scene)

    expect(html).toContain('几何距离')
    expect(html).toContain('data-vector-display')
    expect(html).toContain("isDistance?length:Math.min(length,130)")
    expect(html).toContain("labelMode==='value'")
    expect(html).toContain('"labelMode":"value"')

    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone distance runtime')
    expect(() => new Function(runtime)).not.toThrow()
  })

  it('exports a spring constraint without external runtime dependencies', () => {
    const scene = createTimeExperimentScene({
      durationExpression: '4', bodyId: 'block', bodyLabel: '滑块',
      xExpression: 'cos(t)', yExpression: '0', formula: 'x=cos(t)',
      conclusion: '弹簧连接固定点和滑块。', parameters: [], metrics: [], vectors: [],
      constraints: [{
        id: 'spring', label: '弹簧', type: 'spring', bodyId: 'block',
        anchorXExpression: '0-3', anchorYExpression: '0', restLengthExpression: '3',
      }],
    }, { title: '弹簧振子', topic: '简谐运动', subject: 'physics', summary: '观察弹簧约束。' })
    const html = exportSceneAsStandaloneHtml(scene)

    expect(html).toContain('constraint.spring')
    expect(html).toContain('constraintEvals')
    expect(html).toContain('springPoints')
    expect(html).toContain('data-constraint-id')
    expect(html).not.toContain('https://')

    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone constraint runtime')
    expect(() => new Function(runtime)).not.toThrow()
  })

  it('exports a deterministic offline two-dimensional contact solver', () => {
    const scene = createCollision2DScene({
      durationExpression: 'duration', gravityXExpression: '0', gravityYExpression: '0',
      restitutionExpression: 'restitution',
      formula: '碰撞前后系统总动量守恒', conclusion: '观察两个圆盘的接触、反弹和速度交换。',
      parameters: [
        { id: 'duration', label: '实验时长', value: 3, min: 1, max: 5, step: 0.25 },
        { id: 'restitution', label: '恢复系数', value: 1, min: 0, max: 1, step: 0.1 },
        { id: 'massA', label: '小球 A 质量', value: 1, min: 0.5, max: 3, step: 0.25 },
        { id: 'vxA', label: '小球 A 水平初速度', value: 2, min: -4, max: 4, step: 0.25 },
        { id: 'vyA', label: '小球 A 竖直初速度', value: 0, min: -4, max: 4, step: 0.25 },
        { id: 'massB', label: '小球 B 质量', value: 1, min: 0.5, max: 3, step: 0.25 },
        { id: 'vxB', label: '小球 B 水平初速度', value: 0, min: -4, max: 4, step: 0.25 },
        { id: 'vyB', label: '小球 B 竖直初速度', value: 0, min: -4, max: 4, step: 0.25 },
      ],
      bounds: { xMinExpression: '0-10', xMaxExpression: '10', yMinExpression: '0-5', yMaxExpression: '5' },
      bodies: [
        { id: 'ballA', label: '小球 A', xExpression: '0-3', yExpression: '0', vxExpression: 'vxA', vyExpression: 'vyA', radiusExpression: '0.5', massExpression: 'massA' },
        { id: 'ballB', label: '小球 B', xExpression: '0', yExpression: '0', vxExpression: 'vxB', vyExpression: 'vyB', radiusExpression: '0.5', massExpression: 'massB' },
      ],
    }, { title: '二维圆盘碰撞', topic: '动量守恒', summary: '真实接触求解。' })
    const html = exportSceneAsStandaloneHtml(scene)

    expect(html).toContain('2D CONTACT LAB')
    expect(html).toContain('function contact(a,b)')
    expect(html).toContain('Math.ceil(config.duration*240)')
    expect(html).toContain('iteration<32')
    expect(html).toContain('requestAnimationFrame(frame)')
    expect(html).toContain('collisionBody.ballA')
    expect(html).toContain('function bodyUses(body,id)')
    expect(html).toContain("addGroup('实验全局'")
    expect(html).toContain('小球 A 水平初速度')
    expect(html).toContain('小球 B 质量')
    expect(html).not.toContain('eval(')
    expect(html).not.toContain('new Function')
    expect(html).not.toContain('https://')

    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone collision runtime')
    expect(() => new Function(runtime)).not.toThrow()
  })

  it('exports offline parameter, polar and implicit relation-curve sampling', () => {
    const scene = createRelationCurve2DScene({
      mode: 'implicit', formula: 'x²+y²=a²', conclusion: '圆是到原点距离等于 a 的点集。',
      parameters: [{ id: 'a', label: '半径 a', value: 2, min: 1, max: 4, step: 0.25 }],
      xMin: -3, xMax: 3, yMin: -3, yMax: 3, implicitExpression: 'x^2+y^2-a^2',
    }, { title: '隐式圆', topic: '隐函数', summary: '本地提取等值线。' })
    const html = exportSceneAsStandaloneHtml(scene)

    expect(html).toContain('2D RELATION CURVE')
    expect(html).toContain("mode!=='implicit'")
    expect(html).toContain('size=96')
    expect(html).toContain('data-scene-object-id="relationCurve"')
    expect(html).not.toContain('eval(')
    expect(html).not.toContain('new Function')
    expect(html).not.toContain('https://')
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone relation curve runtime')
    expect(() => new Function(runtime)).not.toThrow()
  })

  it('exports an offline data chart without a third-party chart library', () => {
    const scene = createDataChart2DScene({
      mode: 'line', formula: '比较折线趋势', conclusion: '甲地升温更快。',
      xLabel: '月份', yLabel: '平均气温', unit: '℃', categories: ['一月', '二月', '三月'],
      series: [
        { id: 'placeA', label: '甲地', values: [-2, 1, 7] },
        { id: 'placeB', label: '乙地', values: [6, 8, 11] },
      ],
    }, { title: '月平均气温', topic: '折线图', summary: '比较两组数据。' })
    const html = exportSceneAsStandaloneHtml(scene)

    expect(html).toContain('DATA EXPLORER')
    expect(html).toContain('chart.series.placeA')
    expect(html).toContain("spec.mode==='line'")
    expect(html).toContain('function categoryLabelLayout(')
    expect(html).toContain('function categoryPositions(')
    expect(html).toContain('data-category-scale="distributed"')
    expect(html).toContain('data-category-spacing=')
    expect(html).toContain('data-category-guide=')
    expect(html).toContain('data-category-label-layout=')
    expect(html).toContain('data-category-label-row=')
    expect(html).toContain('id="zoom-fit"')
    expect(html).not.toContain('eval(')
    expect(html).not.toContain('new Function')
    expect(html).not.toContain('https://')
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone data-chart runtime')
    expect(() => new Function(runtime)).not.toThrow()
  })
})
