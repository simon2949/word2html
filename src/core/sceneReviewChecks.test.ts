import { describe, expect, it } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { createGenericFunctionScene } from '../templates/genericFunctionTemplate'
import { createTimeExperimentScene } from '../templates/timeExperimentTemplate'
import { createGeometry2DScene } from '../templates/geometry2dTemplate'
import { createRelationCurve2DScene } from '../templates/relationCurve2dTemplate'
import { createDataChart2DScene } from '../templates/dataChart2dTemplate'
import { runSceneReviewChecks } from './sceneReviewChecks'

describe('scene review checks', () => {
  it('checks the official ellipse across its coupled axis boundaries', () => {
    const report = runSceneReviewChecks(createEllipseScene())

    expect(report.testedCases).toBe(7)
    expect(report.results.some((result) => result.status === 'failed')).toBe(false)
    expect(report.results.find((result) => result.id === 'runtime-sampling')?.status).toBe('passed')
    expect(report.results.find((result) => result.id === 'parameter-boundaries')?.status).toBe('warning')
  })

  it('passes a safe parameterized sine function at all declared boundaries', () => {
    const scene = createGenericFunctionScene({
      expression: 'A*sin(B*x)', formula: 'y=A sin(Bx)', xMin: -10, xMax: 10,
      parameters: [
        { id: 'A', label: '振幅 A', value: 2, min: 0.5, max: 5, step: 0.1 },
        { id: 'B', label: '频率 B', value: 1, min: 0.2, max: 3, step: 0.1 },
      ],
    }, { title: '正弦函数', topic: '三角函数', summary: '观察参数影响。' })

    const report = runSceneReviewChecks(scene)

    expect(report.status).toBe('passed')
    expect(report.testedCases).toBe(7)
    expect(report.results.every((result) => result.status === 'passed')).toBe(true)
  })

  it('finds a duration failure that only occurs at a declared parameter maximum', () => {
    const scene = createTimeExperimentScene({
      durationExpression: 'T',
      xExpression: 't',
      yExpression: '0',
      formula: 'x=t',
      conclusion: '物体做匀速直线运动。',
      parameters: [{ id: 'T', label: '实验时长', value: 1, min: 0.2, max: 100, step: 0.1 }],
      metrics: [],
      vectors: [],
    }, {
      title: '边界测试实验', topic: '匀速运动', subject: 'physics', summary: '测试持续时间边界。',
    })

    const report = runSceneReviewChecks(scene)
    const boundaries = report.results.find((result) => result.id === 'parameter-boundaries')

    expect(report.status).toBe('failed')
    expect(boundaries?.status).toBe('failed')
    expect(boundaries?.findings.some((finding) => finding.includes('60 秒'))).toBe(true)
  })

  it('warns when an editable parameter has no matching control', () => {
    const scene = createEllipseScene()
    scene.controls = scene.controls.filter((control) => control.target !== 'majorAxis')

    const report = runSceneReviewChecks(scene)
    const controls = report.results.find((result) => result.id === 'controls')

    expect(controls?.status).toBe('warning')
    expect(controls?.findings).toContain('缺少控件：长轴全长')
  })

  it('stops runtime sampling when the current scene is invalid', () => {
    const scene = createEllipseScene()
    scene.viewport.xMax = scene.viewport.xMin

    const report = runSceneReviewChecks(scene)

    expect(report.status).toBe('failed')
    expect(report.results.find((result) => result.id === 'protocol')?.status).toBe('failed')
    expect(report.results.find((result) => result.id === 'runtime-sampling')?.detail).toContain('停止')
  })

  it('checks geometry points, measurements, controls, and parameter boundaries', () => {
    const scene = createGeometry2DScene({
      formula: 'AB', conclusion: '观察线段长度。',
      parameters: [
        { id: 'Ax', label: 'A 点横坐标', value: 0, min: -2, max: 2, step: 0.1 },
        { id: 'Ay', label: 'A 点纵坐标', value: 0, min: -2, max: 2, step: 0.1 },
      ],
      points: [
        { id: 'A', label: 'A', xExpression: 'Ax', yExpression: 'Ay', draggable: true },
        { id: 'B', label: 'B', xExpression: '3', yExpression: '4' },
      ],
      connections: [{ id: 'AB', label: 'AB', kind: 'segment', fromPointId: 'A', toPointId: 'B' }],
      arcs: [], polygons: [],
      measurements: [{ id: 'length', label: 'AB', kind: 'distance', pointIds: ['A', 'B'], unit: '' }],
    }, { title: '线段测量', topic: '平面几何', summary: '测量线段。' })

    const report = runSceneReviewChecks(scene)
    expect(report.status).toBe('passed')
    expect(report.testedCases).toBe(7)
    expect(report.results.find((result) => result.id === 'runtime-sampling')).toMatchObject({
      status: 'passed', label: '几何状态计算',
    })
  })

  it('reports deterministic paths and visible points for a relation curve', () => {
    const scene = createRelationCurve2DScene({
      mode: 'implicit', formula: 'x²+y²=a²', conclusion: '零等值线是半径为 a 的圆。',
      parameters: [{ id: 'a', label: '半径 a', value: 2, min: 1, max: 3, step: 0.25 }],
      xMin: -4, xMax: 4, yMin: -4, yMax: 4, implicitExpression: 'x^2+y^2-a^2',
    }, { title: '隐函数圆', topic: '隐函数', summary: '观察零等值线。' })

    const report = runSceneReviewChecks(scene)
    const sampling = report.results.find((result) => result.id === 'runtime-sampling')
    expect(report.status).toBe('passed')
    expect(sampling).toMatchObject({ status: 'passed', label: '关系曲线采样' })
    expect(sampling?.detail).toMatch(/路径.*视口内/)
  })

  it('checks all finite values in a compact data chart', () => {
    const scene = createDataChart2DScene({
      mode: 'bar', formula: '比较柱形高度', conclusion: '第二项数量更多。',
      xLabel: '项目', yLabel: '人数', unit: '人', categories: ['第一项', '第二项'],
      series: [
        { id: 'groupA', label: '甲组', values: [12, 18] },
        { id: 'groupB', label: '乙组', values: [10, 21] },
      ],
    }, { title: '分组柱状图', topic: '统计图', summary: '比较两组数据。' })

    const report = runSceneReviewChecks(scene)
    const sampling = report.results.find((result) => result.id === 'runtime-sampling')
    expect(report.status).toBe('passed')
    expect(report.testedCases).toBe(0)
    expect(sampling).toMatchObject({ status: 'passed' })
    expect(sampling?.detail).toContain('2 个系列和 4 个有限数据值')
  })
})
