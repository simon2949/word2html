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
})
