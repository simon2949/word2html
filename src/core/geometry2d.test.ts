import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Geometry2DCanvas } from '../components/Geometry2DCanvas'
import { createGeometry2DScene } from '../templates/geometry2dTemplate'
import { exportSceneAsStandaloneHtml } from './exportHtml'
import {
  evaluateGeometry2D,
  applyGeometryDragAssists,
  getGeometry2DSpec,
  sampleGeometryLoci,
  updateGeometryParameter,
  updateGeometryPoint,
  validateGeometry2DSpec,
  type Geometry2DSpec,
} from './geometry2d'
import { validateLessonScene } from './validateScene'

function triangleSpec(): Geometry2DSpec {
  return {
    formula: 'S = 1/2 |(B-A) × (C-A)|',
    conclusion: '拖动顶点，观察边长、角度和面积变化。',
    parameters: [
      { id: 'Ax', label: 'A 点横坐标', value: 0, min: -8, max: 8, step: 0.1 },
      { id: 'Ay', label: 'A 点纵坐标', value: 0, min: -6, max: 6, step: 0.1 },
      { id: 'Bx', label: 'B 点横坐标', value: 3, min: -8, max: 8, step: 0.1 },
      { id: 'By', label: 'B 点纵坐标', value: 0, min: -6, max: 6, step: 0.1 },
      { id: 'Cx', label: 'C 点横坐标', value: 0, min: -8, max: 8, step: 0.1 },
      { id: 'Cy', label: 'C 点纵坐标', value: 4, min: -6, max: 6, step: 0.1 },
    ],
    points: [
      { id: 'A', label: 'A', xExpression: 'Ax', yExpression: 'Ay', draggable: true },
      { id: 'B', label: 'B', xExpression: 'Bx', yExpression: 'By', draggable: true },
      { id: 'C', label: 'C', xExpression: 'Cx', yExpression: 'Cy', draggable: true },
    ],
    connections: [
      { id: 'AB', label: '线段 AB', kind: 'segment', fromPointId: 'A', toPointId: 'B' },
      { id: 'BC', label: '向量 BC', kind: 'vector', fromPointId: 'B', toPointId: 'C' },
      { id: 'AC', label: '射线 AC', kind: 'ray', fromPointId: 'A', toPointId: 'C' },
    ],
    arcs: [{ id: 'angleA', label: '∠BAC', centerPointId: 'A', startPointId: 'B', endPointId: 'C' }],
    polygons: [{ id: 'ABC', label: '三角形 ABC', pointIds: ['A', 'B', 'C'], filled: true }],
    measurements: [
      { id: 'AB', label: 'AB', kind: 'distance', pointIds: ['A', 'B'], unit: '' },
      { id: 'BAC', label: '∠BAC', kind: 'angle', pointIds: ['B', 'A', 'C'], unit: '°' },
      { id: 'area', label: '面积', kind: 'area', pointIds: ['A', 'B', 'C'], unit: '' },
    ],
  }
}

function transformationSpec(): Geometry2DSpec {
  return {
    formula: "R_O(θ): A → A'",
    conclusion: '构造点由基础点和变换参数确定，旋转点的轨迹是圆。',
    parameters: [
      { id: 'theta', label: '旋转角 θ', value: 0, min: 0, max: Math.PI * 2, step: 0.05 },
      { id: 'Px', label: '约束点横坐标', value: 1, min: -5, max: 5, step: 0.1 },
      { id: 'Py', label: '约束点纵坐标', value: 1, min: -5, max: 5, step: 0.1 },
    ],
    points: [
      { id: 'O', label: 'O', xExpression: '0', yExpression: '0' },
      { id: 'A', label: 'A', xExpression: '2', yExpression: '0' },
      { id: 'L1', label: 'L1', xExpression: '0-4', yExpression: '0' },
      { id: 'L2', label: 'L2', xExpression: '4', yExpression: '0' },
      { id: 'P', label: 'P', xExpression: 'Px', yExpression: 'Py', draggable: true, constraint: { kind: 'circle', centerPointId: 'O', radiusExpression: '2' } },
      { id: 'M', label: 'M', construction: { kind: 'midpoint', pointAId: 'O', pointBId: 'A' } },
      { id: 'T', label: "A₁", construction: { kind: 'translation', sourcePointId: 'A', dxExpression: '1', dyExpression: '2' } },
      { id: 'R', label: "A'", construction: { kind: 'rotation', sourcePointId: 'A', centerPointId: 'O', angleExpression: 'theta' } },
      { id: 'D', label: 'D', construction: { kind: 'dilation', sourcePointId: 'A', centerPointId: 'O', scaleExpression: '1.5' } },
      { id: 'F', label: 'F', construction: { kind: 'reflection', sourcePointId: 'P', linePointAId: 'L1', linePointBId: 'L2' } },
      { id: 'H', label: 'H', construction: { kind: 'projection', sourcePointId: 'P', linePointAId: 'L1', linePointBId: 'L2' } },
    ],
    connections: [
      { id: 'OA', label: 'OA', kind: 'segment', fromPointId: 'O', toPointId: 'A' },
      { id: 'OR', label: "OA'", kind: 'segment', fromPointId: 'O', toPointId: 'R' },
    ],
    arcs: [], polygons: [],
    measurements: [{ id: 'OR', label: "OA'", kind: 'distance', pointIds: ['O', 'R'], unit: '' }],
    loci: [{ id: 'rotation', label: '旋转点轨迹', pointId: 'R', parameterId: 'theta' }],
  }
}

describe('declarative two-dimensional geometry runtime', () => {
  it('validates and evaluates distance, angle, and area from shared point state', () => {
    const spec = triangleSpec()
    expect(validateGeometry2DSpec(spec)).toBeNull()
    const snapshot = evaluateGeometry2D(spec)
    expect(snapshot.measurements.map((item) => item.value)).toEqual([3, 90, 6])
  })

  it('creates a schema-valid scene and rejects dangling point references', () => {
    const scene = createGeometry2DScene(triangleSpec(), {
      title: '三角形测量', topic: '平面几何', summary: '观察三角形。',
    })
    expect(validateLessonScene(scene).valid).toBe(true)
    expect(scene.objects.filter((object) => object.kind === 'point')).toHaveLength(3)
    expect(scene.objects.some((object) => object.kind === 'ray')).toBe(true)
    expect(scene.objects.some((object) => object.kind === 'arc')).toBe(true)
    expect(scene.objects.some((object) => object.kind === 'polygon')).toBe(true)

    const invalid = triangleSpec()
    invalid.connections[0]!.toPointId = 'missing'
    expect(validateGeometry2DSpec(invalid)).toMatch(/不存在的点/)
  })

  it('updates parameter values and both coordinates of a draggable point locally', () => {
    const scene = createGeometry2DScene(triangleSpec(), {
      title: '三角形测量', topic: '平面几何', summary: '观察三角形。',
    })
    const parameterEdited = updateGeometryParameter(scene, 'Bx', 4)
    expect(evaluateGeometry2D(getGeometry2DSpec(parameterEdited)).measurements[0]?.value).toBe(4)

    const dragged = updateGeometryPoint(scene, 'C', 2, 5)
    const point = evaluateGeometry2D(getGeometry2DSpec(dragged)).points.find((item) => item.id === 'C')
    expect(point).toMatchObject({ x: 2, y: 5 })
  })

  it('supports deterministic coordinate snapping and axis locking for dragging', () => {
    expect(applyGeometryDragAssists({ x: 2.26, y: -1.74 }, { x: 1.2, y: 3.4 }, 0.5, 'none')).toEqual({ x: 2.5, y: -1.5 })
    expect(applyGeometryDragAssists({ x: 2.26, y: -1.74 }, { x: 1.2, y: 3.4 }, 0.1, 'x')).toEqual({ x: 1.2, y: -1.7 })
    expect(applyGeometryDragAssists({ x: 2.26, y: -1.74 }, { x: 1.2, y: 3.4 }, 1, 'y')).toEqual({ x: 2, y: 3.4 })
  })

  it('evaluates constrained and transformed points from a reusable dependency graph', () => {
    const spec = transformationSpec()
    expect(validateGeometry2DSpec(spec)).toBeNull()
    const points = new Map(evaluateGeometry2D(spec).points.map((point) => [point.id, point]))
    expect(points.get('M')).toMatchObject({ x: 1, y: 0 })
    expect(points.get('T')).toMatchObject({ x: 3, y: 2 })
    expect(points.get('D')).toMatchObject({ x: 3, y: 0 })
    expect(points.get('P')?.x).toBeCloseTo(Math.SQRT2)
    expect(points.get('P')?.y).toBeCloseTo(Math.SQRT2)
    expect(points.get('F')?.y).toBeCloseTo(-Math.SQRT2)
    expect(points.get('H')?.y).toBeCloseTo(0)
  })

  it('samples a transformed point locus locally and projects constrained dragging', () => {
    const spec = transformationSpec()
    const locus = sampleGeometryLoci(spec)[0]!
    expect(locus.points).toHaveLength(241)
    expect(locus.points.every((point) => Math.hypot(point.x, point.y) > 1.9999 && Math.hypot(point.x, point.y) < 2.0001)).toBe(true)

    const scene = createGeometry2DScene(spec, { title: '旋转与约束', topic: '几何变换', summary: '观察旋转轨迹。' })
    const dragged = updateGeometryPoint(scene, 'P', 0, 3)
    const point = evaluateGeometry2D(getGeometry2DSpec(dragged)).points.find((item) => item.id === 'P')
    expect(point).toMatchObject({ x: 0, y: 2 })
    expect(validateLessonScene(dragged).valid).toBe(true)
  })

  it('projects draggable points onto infinite lines and finite segments', () => {
    const lineSpec = transformationSpec()
    lineSpec.points.find((point) => point.id === 'P')!.constraint = { kind: 'line', pointAId: 'L1', pointBId: 'L2' }
    const lineScene = createGeometry2DScene(lineSpec, { title: '直线约束', topic: '几何约束', summary: '点在线上。' })
    const linePoint = evaluateGeometry2D(getGeometry2DSpec(updateGeometryPoint(lineScene, 'P', 2, 3))).points.find((point) => point.id === 'P')
    expect(linePoint).toMatchObject({ x: 2, y: 0 })

    const segmentSpec = transformationSpec()
    segmentSpec.points.find((point) => point.id === 'P')!.constraint = { kind: 'segment', pointAId: 'L1', pointBId: 'L2' }
    const segmentScene = createGeometry2DScene(segmentSpec, { title: '线段约束', topic: '几何约束', summary: '点在线段上。' })
    const segmentPoint = evaluateGeometry2D(getGeometry2DSpec(updateGeometryPoint(segmentScene, 'P', 8, 3))).points.find((point) => point.id === 'P')
    expect(segmentPoint).toMatchObject({ x: 4, y: 0 })
  })

  it('rejects cycles and invalid locus references', () => {
    const cyclic = transformationSpec()
    cyclic.points.find((point) => point.id === 'M')!.construction = { kind: 'midpoint', pointAId: 'R', pointBId: 'A' }
    cyclic.points.find((point) => point.id === 'R')!.construction = { kind: 'rotation', sourcePointId: 'M', centerPointId: 'O', angleExpression: 'theta' }
    expect(validateGeometry2DSpec(cyclic)).toMatch(/循环引用/)

    const invalidLocus = transformationSpec()
    invalidLocus.loci![0]!.parameterId = 'missing'
    expect(validateGeometry2DSpec(invalidLocus)).toMatch(/驱动参数/)
  })

  it('renders every primitive with selection and object-level appearance', () => {
    const scene = createGeometry2DScene(triangleSpec(), {
      title: '三角形测量', topic: '平面几何', summary: '观察三角形。',
    })
    scene.appearance.objectStyles = {
      'point.A': { color: '#113355', pointRadius: 12, pointStyle: 'shadow' },
      'connection.AB': { color: '#AA3300', lineWidth: 5, lineStyle: 'dash-dot' },
    }
    const html = renderToStaticMarkup(createElement(Geometry2DCanvas, {
      scene, zoom: 1, selectedObjectId: 'point.A', onObjectSelect: () => undefined,
    }))
    expect(html).toContain('data-scene-object-id="polygon.ABC"')
    expect(html).toContain('data-scene-object-id="arc.angleA"')
    expect(html).toContain('data-scene-object-id="connection.AC"')
    expect(html).toContain('aria-label="坐标吸附"')
    expect(html).toContain('aria-label="坐标锁定"')
    expect(html).toContain('data-measurement-label="true"')
    expect(html).toMatch(/data-scene-object-id="point\.A"[^>]*data-scene-selected="true"[^>]*r="12"[^>]*fill="#113355"/)
    expect(html).toMatch(/data-scene-object-id="connection\.AB"[^>]*stroke="#AA3300"[^>]*stroke-width="5"/)
  })

  it('renders constraint guides and selectable locus paths', () => {
    const scene = createGeometry2DScene(transformationSpec(), { title: '旋转与约束', topic: '几何变换', summary: '观察旋转轨迹。' })
    scene.appearance.objectStyles = { 'locus.rotation': { color: '#AA3300', lineWidth: 5, lineStyle: 'dash-dot' } }
    const html = renderToStaticMarkup(createElement(Geometry2DCanvas, {
      scene, zoom: 1, selectedObjectId: 'locus.rotation', onObjectSelect: () => undefined,
    }))
    expect(html).toMatch(/data-scene-object-id="locus\.rotation"[^>]*data-scene-selected="true"/)
    expect(html).toContain('stroke="#AA3300"')
    expect(html).toContain('stroke-dasharray=')
  })

  it('exports an offline parser-based HTML runtime with local controls and dragging', () => {
    const scene = createGeometry2DScene(transformationSpec(), {
      title: '旋转与约束', topic: '几何变换', summary: '观察旋转轨迹。',
    })
    const html = exportSceneAsStandaloneHtml(scene)
    expect(html).toContain('INTERACTIVE GEOMETRY')
    expect(html).toContain('data-point-id')
    expect(html).toContain('measurementKind')
    expect(html).toContain('constructionKind')
    expect(html).toContain('function sampleLoci()')
    expect(html).toContain('id="snap-step"')
    expect(html).toContain('id="axis-lock"')
    expect(html).toContain('function layoutLabels(')
    expect(html).toContain('data-measurement-label=')
    expect(html).toContain('测量与约束辅助线')
    expect(html).toContain('几何轨迹')
    expect(html).toContain('function compile(source,allowed)')
    expect(html).not.toContain('eval(')
    expect(html).not.toContain('new Function')
    expect(html).not.toContain('https://')
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    const runtime = scripts.at(-1)?.[1]
    expect(runtime).toBeTruthy()
    if (!runtime) throw new Error('missing standalone geometry runtime')
    expect(() => new Function(runtime)).not.toThrow()
  })
})
