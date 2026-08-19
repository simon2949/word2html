import { describe, expect, it } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { createQuadraticScene } from '../templates/quadraticTemplate'
import { createGenericFunctionScene } from '../templates/genericFunctionTemplate'
import { createTimeExperimentScene } from '../templates/timeExperimentTemplate'
import { exportSceneAsStandaloneHtml } from './exportHtml'

describe('standalone HTML export', () => {
  it('embeds the validated scene and local interaction runtime', () => {
    const html = exportSceneAsStandaloneHtml(createEllipseScene())
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('id="lesson-scene"')
    expect(html).toContain('椭圆的焦点距离和')
    expect(html).toContain('pointermove')
    expect(html).toContain('id="zoom-fit"')
    expect(html.indexOf('id="formula"')).toBeLessThan(html.indexOf('id="plot"'))
    expect(html).toContain('squareStep')
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
    expect(html).toContain('矢量与绳/弹簧约束')
    expect(html).not.toContain('eval(')
    expect(html).not.toContain('new Function')
    expect(html).not.toContain('https://')

    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone time experiment runtime')
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
})
