import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createTimeExperimentScene } from '../templates/timeExperimentTemplate'
import { TimeExperimentCanvas } from './TimeExperimentCanvas'

describe('TimeExperimentCanvas vectors', () => {
  it('renders safe vector arrows, magnitudes, and units from the runtime snapshot', () => {
    const scene = createTimeExperimentScene({
      durationExpression: 'sqrt(2*h0/g)',
      xExpression: '0',
      yExpression: 'max(0,h0-0.5*g*t^2)',
      formula: 'h(t) = h0 - 0.5gt^2',
      conclusion: '速度和重力加速度方向均竖直向下。',
      parameters: [
        { id: 'h0', label: '初始高度', value: 20, min: 2, max: 50, step: 1 },
        { id: 'g', label: '重力加速度', value: 9.8, min: 1, max: 15, step: 0.1 },
      ],
      metrics: [],
      vectors: [
        { id: 'velocity', label: '速度', xExpression: '0', yExpression: '0-g*t', scale: 0.1, unit: 'm/s' },
        { id: 'gravity', label: '重力加速度', xExpression: '0', yExpression: '0-g', scale: 0.15, unit: 'm/s^2' },
      ],
    }, {
      title: '自由落体运动', topic: '自由落体', subject: 'physics', summary: '观察矢量变化。',
    })

    const html = renderToStaticMarkup(createElement(TimeExperimentCanvas, { scene, time: 1, zoom: 1 }))

    expect(html.match(/<polygon/g)).toHaveLength(2)
    expect(html).toContain('速度 9.80 m/s')
    expect(html).toContain('重力加速度 9.80 m/s^2')
  })

  it('renders multiple moving bodies with independent trails and labels', () => {
    const scene = createTimeExperimentScene({
      durationExpression: '4', bodyId: 'left', bodyLabel: '左球',
      xExpression: '0-t', yExpression: '0',
      formula: '两个质点独立运动', conclusion: '两个物体拥有独立的位置、标签和轨迹。',
      parameters: [], metrics: [], vectors: [],
      additionalBodies: [{ id: 'right', label: '右球', xExpression: 't', yExpression: '0' }],
    }, {
      title: '双物体运动', topic: '多物体', subject: 'physics', summary: '观察两个运动物体。',
    })

    const html = renderToStaticMarkup(createElement(TimeExperimentCanvas, { scene, time: 2, zoom: 1 }))

    expect(html.match(/data-body-id=/g)).toHaveLength(2)
    expect(html.match(/<polyline/g)).toHaveLength(2)
    expect(html).toContain('左球 (-2.00, 0.00)')
    expect(html).toContain('右球 (2.00, 0.00)')
  })

  it('renders rope and spring constraint primitives with fixed anchors', () => {
    const scene = createTimeExperimentScene({
      durationExpression: '4', bodyId: 'block', bodyLabel: '滑块',
      xExpression: 'cos(t)', yExpression: '0', formula: 'x=cos(t)',
      conclusion: '弹簧连接固定点和滑块。', parameters: [], metrics: [], vectors: [],
      constraints: [{
        id: 'spring', label: '弹簧', type: 'spring', bodyId: 'block',
        anchorXExpression: '0-3', anchorYExpression: '0', restLengthExpression: '3',
      }],
    }, {
      title: '弹簧振子', topic: '简谐运动', subject: 'physics', summary: '观察弹簧约束。',
    })

    const html = renderToStaticMarkup(createElement(TimeExperimentCanvas, { scene, time: 0, zoom: 1 }))
    expect(html).toContain('data-constraint-id="spring"')
    expect(html).toContain('弹簧 L=4.00 m')
    expect(html).toContain('<polyline')
  })

  it('renders two pendulums and two independent ropes', () => {
    const scene = createTimeExperimentScene({
      durationExpression: '4*pi*sqrt(max(L1,L2)/g)', bodyId: 'p1', bodyLabel: '钟摆 1',
      xExpression: '0-2+L1*sin(a1)', yExpression: '0-L1*cos(a1)',
      formula: 'T=2*pi*sqrt(L/g)', conclusion: '两个钟摆独立运动。',
      parameters: [
        { id: 'L1', label: '摆长 1', value: 1.5, min: 0.3, max: 3, step: 0.1 },
        { id: 'L2', label: '摆长 2', value: 1, min: 0.3, max: 3, step: 0.1 },
        { id: 'g', label: '重力加速度', value: 9.8, min: 1.6, max: 20, step: 0.1 },
      ],
      metrics: [
        { id: 'a1', label: '摆角 1', expression: '0.2*cos(sqrt(g/L1)*t)', unit: 'rad' },
        { id: 'a2', label: '摆角 2', expression: '0.3*cos(sqrt(g/L2)*t)', unit: 'rad' },
      ],
      additionalBodies: [{ id: 'p2', label: '钟摆 2', xExpression: '2+L2*sin(a2)', yExpression: '0-L2*cos(a2)' }],
      vectors: [],
      constraints: [
        { id: 'r1', label: '摆绳 1', type: 'rope', bodyId: 'p1', anchorXExpression: '0-2', anchorYExpression: '0', restLengthExpression: 'L1' },
        { id: 'r2', label: '摆绳 2', type: 'rope', bodyId: 'p2', anchorXExpression: '2', anchorYExpression: '0', restLengthExpression: 'L2' },
      ],
    }, {
      title: '双钟摆', topic: '单摆', subject: 'physics', summary: '观察两个钟摆。',
    })
    const html = renderToStaticMarkup(createElement(TimeExperimentCanvas, { scene, time: 0.8, zoom: 1 }))
    expect(html.match(/data-body-id=/g)).toHaveLength(2)
    expect(html.match(/data-constraint-id=/g)).toHaveLength(2)
    expect(html).toContain('摆绳 1 L=1.50 m')
    expect(html).toContain('摆绳 2 L=1.00 m')
  })
})
