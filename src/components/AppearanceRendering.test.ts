import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { createGenericFunctionScene } from '../templates/genericFunctionTemplate'
import { createQuadraticScene } from '../templates/quadraticTemplate'
import { createTimeExperimentScene } from '../templates/timeExperimentTemplate'
import { EllipseCanvas } from './EllipseCanvas'
import { GenericFunctionCanvas } from './GenericFunctionCanvas'
import { QuadraticCanvas } from './QuadraticCanvas'
import { TimeExperimentCanvas } from './TimeExperimentCanvas'

describe('point and line appearance rendering', () => {
  it('renders ellipse points with shadow and independent main/helper line styles', () => {
    const scene = createEllipseScene()
    scene.appearance.pointRadius = 12
    scene.appearance.pointStyle = 'shadow'
    scene.appearance.lineWidth = 4
    scene.appearance.lineStyle = 'dash-dot'
    scene.appearance.helperLineWidth = 2
    scene.appearance.helperLineStyle = 'dashed'

    const html = renderToStaticMarkup(createElement(EllipseCanvas, {
      scene, angle: 0.7, trailAngles: [0.2, 0.5, 0.7], zoom: 1, onAngleChange: () => undefined,
    }))

    expect(html).toContain('stroke-dasharray="20 9.6 4 9.6"')
    expect(html).toContain('stroke-dasharray="8 5"')
    expect(html).toContain('filter="url(#ellipse-point-shadow)"')
    expect(html).toContain('r="12"')
  })

  it('applies overrides and selection to only the targeted ellipse objects', () => {
    const scene = createEllipseScene()
    scene.appearance.objectStyles = {
      focusLeft: { color: '#2244AA', pointRadius: 15, pointStyle: 'shadow' },
      distanceLeft: { color: '#118844', lineWidth: 6, lineStyle: 'dash-dot' },
    }
    const html = renderToStaticMarkup(createElement(EllipseCanvas, {
      scene, angle: 0.7, trailAngles: [], zoom: 1, onAngleChange: () => undefined,
      selectedObjectId: 'focusLeft', onObjectSelect: () => undefined,
    }))

    expect(html).toMatch(/data-scene-object-id="focusLeft"[^>]*data-scene-selected="true"[^>]*r="14"[^>]*fill="#2244AA"/)
    expect(html).toMatch(/data-scene-object-id="focusRight"[^>]*data-scene-selected="false"[^>]*r="6"/)
    expect(html).toMatch(/data-scene-object-id="distanceLeft"[^>]*stroke="#118844"[^>]*stroke-width="6"[^>]*stroke-dasharray="30 14.399999999999999 6 14.399999999999999"/)
  })

  it('renders generic functions with dashed adjustable-width curves', () => {
    const scene = createGenericFunctionScene({
      expression: 'sin(x)', formula: 'y=sin(x)', xMin: -6, xMax: 6, parameters: [],
    }, { title: '正弦函数', topic: '三角函数', summary: '观察曲线。' })
    scene.appearance.lineStyle = 'dashed'
    scene.appearance.lineWidth = 5

    const html = renderToStaticMarkup(createElement(GenericFunctionCanvas, { scene, zoom: 1 }))
    expect(html).toContain('stroke-width="5"')
    expect(html).toContain('stroke-dasharray="20 12.5"')
  })

  it('applies independent curve and label overrides in quadratic scenes', () => {
    const scene = createQuadraticScene()
    scene.appearance.objectStyles = {
      parabola: { color: '#3355AA', lineWidth: 7, lineStyle: 'dashed' },
      vertexLabel: { color: '#AA3355', fontScale: 1.4 },
    }

    const html = renderToStaticMarkup(createElement(QuadraticCanvas, {
      scene, zoom: 1, selectedObjectId: 'vertexLabel', onObjectSelect: () => undefined,
    }))
    expect(html).toMatch(/data-scene-object-id="parabola"[^>]*stroke="#3355AA"[^>]*stroke-width="7"[^>]*stroke-dasharray="28 17.5"/)
    expect(html).toMatch(/data-scene-object-id="vertexLabel"[^>]*data-scene-selected="true"[^>]*fill="#AA3355"[^>]*font-size="21"/)
  })

  it('applies point size and styles to experiment bodies and helper primitives', () => {
    const scene = createTimeExperimentScene({
      durationExpression: '2', bodyId: 'ball', bodyLabel: '小球',
      xExpression: 't', yExpression: '1', formula: 'x=t', conclusion: '匀速运动。',
      parameters: [], metrics: [],
      vectors: [{ id: 'v', label: '速度', xExpression: '1', yExpression: '0', scale: 1, unit: 'm/s' }],
    }, { title: '匀速运动', topic: '运动', subject: 'physics', summary: '观察运动。' })
    scene.appearance.pointRadius = 15
    scene.appearance.pointStyle = 'solid'
    scene.appearance.helperLineWidth = 5
    scene.appearance.helperLineStyle = 'dash-dot'

    const html = renderToStaticMarkup(createElement(TimeExperimentCanvas, { scene, time: 1, zoom: 1 }))
    expect(html).toMatch(/data-body-id="ball"[^>]*r="15"[^>]*stroke="none"/)
    expect(html).toContain('stroke-width="5"')
    expect(html).toContain('stroke-dasharray="25 12 5 12"')
  })

  it('targets one experiment body and vector without changing global defaults', () => {
    const scene = createTimeExperimentScene({
      durationExpression: '2', bodyId: 'ball', bodyLabel: '小球',
      xExpression: 't', yExpression: '1', formula: 'x=t', conclusion: '匀速运动。',
      parameters: [], metrics: [],
      vectors: [{ id: 'v', label: '速度', xExpression: '1', yExpression: '0', scale: 1, unit: 'm/s' }],
    }, { title: '匀速运动', topic: '运动', subject: 'physics', summary: '观察运动。' })
    scene.appearance.objectStyles = {
      'body.ball': { color: '#112233', pointRadius: 12, pointStyle: 'shadow' },
      'vector.v': { color: '#AA3300', lineWidth: 4, lineStyle: 'dashed' },
    }

    const html = renderToStaticMarkup(createElement(TimeExperimentCanvas, {
      scene, time: 1, zoom: 1, selectedObjectId: 'body.ball', onObjectSelect: () => undefined,
    }))
    expect(html).toMatch(/data-scene-object-id="body\.ball"[^>]*data-scene-selected="true"[^>]*r="12"[^>]*fill="#112233"[^>]*filter="url\(#time-experiment-point-shadow\)"/)
    expect(html).toMatch(/data-scene-object-id="vector\.v"[^>]*stroke="#AA3300"[^>]*stroke-width="4"[^>]*stroke-dasharray="16 10"/)
  })
})
