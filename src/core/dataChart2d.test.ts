import { describe, expect, it } from 'vitest'
import { createDataChart2DScene } from '../templates/dataChart2dTemplate'
import { validateLessonScene } from './validateScene'
import {
  dataChartCategoryPositions,
  dataChartRange,
  dataChartCategoryLabelLayout,
  getDataChart2DSpec,
  validateDataChart2DSpec,
  type DataChart2DSpec,
} from './dataChart2d'

function barSpec(): DataChart2DSpec {
  return {
    mode: 'bar',
    formula: '比较各月份两组读数',
    conclusion: '乙组增长更快，并在四月超过甲组。',
    xLabel: '月份', yLabel: '数量', unit: '个',
    categories: ['一月', '二月', '三月', '四月'],
    series: [
      { id: 'groupA', label: '甲组', values: [12, 16, 20, 23] },
      { id: 'groupB', label: '乙组', values: [8, 13, 19, 27] },
    ],
  }
}

describe('data chart 2D runtime', () => {
  it('round-trips a grouped categorical chart through LessonScene', () => {
    const spec = barSpec()
    const scene = createDataChart2DScene(spec, { title: '月度数量比较', topic: '数据比较', summary: '比较两组月度数量。' })

    expect(validateLessonScene(scene).valid).toBe(true)
    expect(getDataChart2DSpec(scene)).toEqual(spec)
    expect(scene.objects.filter((object) => object.kind === 'chart-bar-series')).toHaveLength(2)
  })

  it('accepts tables, lines and bounded scatter data', () => {
    const table = { ...barSpec(), mode: 'table' as const }
    const line = { ...barSpec(), mode: 'line' as const }
    const scatter: DataChart2DSpec = {
      mode: 'scatter', formula: '观察身高与臂展的关系', conclusion: '样本整体呈正相关。',
      xLabel: '身高', yLabel: '臂展', unit: 'cm',
      series: [{ id: 'students', label: '学生样本', points: [{ x: 150, y: 148 }, { x: 160, y: 161 }, { x: 170, y: 172 }] }],
    }

    expect(validateDataChart2DSpec(table)).toBeNull()
    expect(validateDataChart2DSpec(line)).toBeNull()
    expect(validateDataChart2DSpec(scatter)).toBeNull()
    expect(dataChartRange(scatter)).toMatchObject({ xMin: expect.any(Number), yMax: expect.any(Number) })
  })

  it('rejects mismatched, mixed, duplicate and non-finite data', () => {
    const mismatched = barSpec(); mismatched.series[0]!.values = [1]
    const duplicate = barSpec(); duplicate.categories = ['一月', '一月']
    const mixed: DataChart2DSpec = {
      mode: 'scatter', formula: '散点', conclusion: '观察散点。', xLabel: 'x', yLabel: 'y', unit: '',
      categories: ['错误'], series: [{ id: 's', label: '样本', points: [{ x: 1, y: 2 }] }],
    }
    const invalid = barSpec(); invalid.series[0]!.values![0] = Number.NaN

    expect(validateDataChart2DSpec(mismatched)).toMatch(/数量必须与类别数量一致/)
    expect(validateDataChart2DSpec(duplicate)).toMatch(/不能重复/)
    expect(validateDataChart2DSpec(mixed)).toMatch(/不能包含类别数组/)
    expect(validateDataChart2DSpec(invalid)).toMatch(/无效或过大/)
  })

  it('stagger-labels dense categories and skips only labels that still cannot fit', () => {
    const months = Array.from({ length: 12 }, (_, index) => `${index + 1}月`)
    expect(dataChartCategoryLabelLayout(months, 740, 11)).toMatchObject({ rows: 2, stride: 1 })
    expect(dataChartCategoryLabelLayout(
      Array.from({ length: 24 }, (_, index) => `很长的第${index + 1}个类别名称`),
      740,
      11,
    ).stride).toBeGreaterThan(1)
  })

  it('distributes categorical line and bar positions across the full plot width', () => {
    expect(dataChartCategoryPositions('line', 6, 76, 748)).toEqual([76, 225.6, 375.2, 524.8, 674.4, 824])
    expect(dataChartCategoryPositions('bar', 3, 75, 750)).toEqual([200, 450, 700])
    expect(dataChartCategoryPositions('line', 1, 100, 600)).toEqual([400])
    expect(dataChartCategoryPositions('line', 0, 100, 600)).toEqual([])
  })
})
