import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createGeometry2DScene } from '../templates/geometry2dTemplate'
import { createDataChart2DScene } from '../templates/dataChart2dTemplate'
import { ReviewScenePreview } from './ReviewScenePreview'

describe('administrator scene preview', () => {
  it('loads geometry submissions with their real canvas and parameter controls', () => {
    const scene = createGeometry2DScene({
      formula: 'AB', conclusion: '观察线段长度。',
      parameters: [
        { id: 'Ax', label: 'A 点横坐标', value: 0, min: -5, max: 5, step: 0.1 },
        { id: 'Ay', label: 'A 点纵坐标', value: 0, min: -5, max: 5, step: 0.1 },
      ],
      points: [
        { id: 'A', label: 'A', xExpression: 'Ax', yExpression: 'Ay', draggable: true },
        { id: 'B', label: 'B', xExpression: '3', yExpression: '4' },
      ],
      connections: [{ id: 'AB', label: 'AB', kind: 'segment', fromPointId: 'A', toPointId: 'B' }],
      arcs: [], polygons: [],
      measurements: [{ id: 'distance', label: 'AB', kind: 'distance', pointIds: ['A', 'B'], unit: '' }],
    }, { title: '线段测量', topic: '平面几何', summary: '管理员交互检查。' })

    const html = renderToStaticMarkup(createElement(ReviewScenePreview, { initialScene: scene }))
    expect(html).toContain('geometry-2d-canvas')
    expect(html).toContain('data-scene-object-id="point.A"')
    expect(html).toContain('A 点横坐标')
    expect(html).toContain('此处修改只用于审核测试')
  })

  it('loads data-chart submissions with the same trusted chart runtime', () => {
    const scene = createDataChart2DScene({
      mode: 'bar', formula: '比较柱形高度', conclusion: '乙组第二项更高。',
      xLabel: '类别', yLabel: '人数', unit: '人', categories: ['第一项', '第二项'],
      series: [
        { id: 'groupA', label: '甲组', values: [12, 18] },
        { id: 'groupB', label: '乙组', values: [10, 21] },
      ],
    }, { title: '分组柱状图', topic: '统计图', summary: '管理员检查图表系列。' })

    const html = renderToStaticMarkup(createElement(ReviewScenePreview, { initialScene: scene }))
    expect(html).toContain('data-chart-2d-canvas')
    expect(html).toContain('data-chart-mode="bar"')
    expect(html).toContain('data-scene-object-id="chart.series.groupA"')
    expect(html).toContain('此处修改只用于审核测试')
  })
})
