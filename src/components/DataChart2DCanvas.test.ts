import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDataChart2DScene } from '../templates/dataChart2dTemplate'
import type { DataChart2DSpec } from '../core/dataChart2d'
import { DataChart2DCanvas } from './DataChart2DCanvas'

function render(spec: DataChart2DSpec): string {
  const scene = createDataChart2DScene(spec, {
    title: `测试${spec.mode}`, topic: '统计图', summary: '组件渲染测试。',
  })
  return renderToStaticMarkup(createElement(DataChart2DCanvas, {
    scene, zoom: 1, selectedObjectId: 'chart.series.first', onObjectSelect: () => {},
  }))
}

describe('data-chart canvas', () => {
  it.each(['bar', 'line'] as const)('renders selectable %s series in the fixed SVG viewport', (mode) => {
    const html = render({
      mode, formula: '比较数据', conclusion: '观察变化。', xLabel: '类别', yLabel: '数值', unit: '',
      categories: ['甲', '乙', '丙'], series: [{ id: 'first', label: '第一组', values: [1, 3, 2] }],
    })
    expect(html).toContain('viewBox="0 0 900 590"')
    expect(html).toContain(`data-chart-mode="${mode}"`)
    expect(html).toContain('data-scene-object-id="chart.series.first"')
    expect(html).toContain('data-scene-selected="true"')
  })

  it('renders scatter points and their coordinates', () => {
    const html = render({
      mode: 'scatter', formula: '观察相关性', conclusion: '数据呈正相关。', xLabel: '身高', yLabel: '臂展', unit: 'cm',
      series: [{ id: 'first', label: '样本', points: [{ x: 150, y: 149 }, { x: 165, y: 167 }] }],
    })
    expect(html).toContain('data-chart-mode="scatter"')
    expect(html).toContain('(150, 149)')
    expect(html).toContain('data-scene-object-id="chart.series.first"')
  })

  it('uses accessible table markup for table mode', () => {
    const html = render({
      mode: 'table', formula: '读取数据表', conclusion: '第二项更大。', xLabel: '项目', yLabel: '人数', unit: '人',
      categories: ['第一项', '第二项'], series: [{ id: 'first', label: '人数', values: [12, 18] }],
    })
    expect(html).toContain('<table aria-label="测试table">')
    expect(html).toContain('<caption>测试table</caption>')
    expect(html).toContain('人数（人）')
    expect(html).toContain('data-scene-object-id="chart.series.first"')
  })

  it('distributes categorical axes across the plot before applying label layout', () => {
    const categories = Array.from({ length: 12 }, (_, index) => `${index + 1}月`)
    const html = render({
      mode: 'line', formula: '全年趋势', conclusion: '观察全年变化。', xLabel: '月份', yLabel: '数值', unit: '',
      categories, series: [{ id: 'first', label: '第一组', values: categories.map((_, index) => index) }],
    })
    expect(html).toContain('data-category-scale="distributed"')
    expect(html).toContain('data-category-spacing=')
    expect(html).toContain('data-category-guide="true"')
    expect(html.match(/data-category-label="true"/g)).toHaveLength(12)
  })
})
