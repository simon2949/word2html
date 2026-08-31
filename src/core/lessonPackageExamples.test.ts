import { describe, expect, it } from 'vitest'
import ellipsePackage from '../../examples/lesson-packages/01-ellipse-focus-sum.word2html.json'
import sinePackage from '../../examples/lesson-packages/02-sine-wave-parameters.word2html.json'
import projectilePackage from '../../examples/lesson-packages/03-projectile-motion.word2html.json'
import pendulumsPackage from '../../examples/lesson-packages/04-two-pendulums.word2html.json'
import springPackage from '../../examples/lesson-packages/05-spring-oscillator.word2html.json'
import hyperbolaPackage from '../../examples/lesson-packages/06-hyperbola-focus-difference.word2html.json'
import geometryPackage from '../../examples/lesson-packages/07-draggable-triangle-measurements.word2html.json'
import collisionPackage from '../../examples/lesson-packages/08-collision-discs-2d.word2html.json'
import implicitPackage from '../../examples/lesson-packages/09-implicit-circle.word2html.json'
import rotationLocusPackage from '../../examples/lesson-packages/10-geometry-rotation-locus.word2html.json'
import dataChartPackage from '../../examples/lesson-packages/11-monthly-temperature-chart.word2html.json'
import { parseLessonImport } from './lessonPackage'
import { createTimeExperimentRuntime } from './timeExperiment'
import { evaluateGeometry2D, getGeometry2DSpec, sampleGeometryLoci } from './geometry2d'
import { getRelationCurve2DSpec, sampleRelationCurve } from './relationCurve2d'
import { validateLessonScene } from './validateScene'
import { getDataChart2DSpec } from './dataChart2d'

const examples: Array<[string, unknown]> = [
  ['01-ellipse-focus-sum.word2html.json', ellipsePackage],
  ['02-sine-wave-parameters.word2html.json', sinePackage],
  ['03-projectile-motion.word2html.json', projectilePackage],
  ['04-two-pendulums.word2html.json', pendulumsPackage],
  ['05-spring-oscillator.word2html.json', springPackage],
  ['06-hyperbola-focus-difference.word2html.json', hyperbolaPackage],
  ['07-draggable-triangle-measurements.word2html.json', geometryPackage],
  ['08-collision-discs-2d.word2html.json', collisionPackage],
  ['09-implicit-circle.word2html.json', implicitPackage],
  ['10-geometry-rotation-locus.word2html.json', rotationLocusPackage],
  ['11-monthly-temperature-chart.word2html.json', dataChartPackage],
]

describe('importable lesson package examples', () => {
  it('keeps a representative set of third-party import fixtures', () => {
    expect(examples.length).toBeGreaterThanOrEqual(6)
  })

  for (const [filename, lessonPackage] of examples) {
    it(`imports ${filename} through the complete trusted runtime`, () => {
      const imported = parseLessonImport(lessonPackage)

      expect(imported.sourceFormat).toBe('lesson-package')
      expect(imported.scene.lineage.source).toBe('imported')
      expect(validateLessonScene(imported.scene).valid).toBe(true)
    })
  }

  it('keeps the focal-distance difference equal to 2a on both hyperbola branches', () => {
    const imported = parseLessonImport(hyperbolaPackage)
    const runtime = createTimeExperimentRuntime(imported.scene)

    for (let index = 0; index <= 24; index += 1) {
      const snapshot = runtime.snapshot(runtime.duration * index / 24)
      const focusLeft = snapshot.bodies.find((body) => body.id === 'focusLeft')
      const focusRight = snapshot.bodies.find((body) => body.id === 'focusRight')
      const expected = snapshot.metrics.find((metric) => metric.id === 'expectedDifference')?.value
      if (!focusLeft || !focusRight || expected === undefined) throw new Error('双曲线测试对象缺失')

      for (const id of ['hyperbolaRight', 'hyperbolaLeft']) {
        const point = snapshot.bodies.find((body) => body.id === id)
        if (!point) throw new Error(`双曲线分支测试点缺失：${id}`)
        const toLeft = Math.hypot(point.x - focusLeft.x, point.y - focusLeft.y)
        const toRight = Math.hypot(point.x - focusRight.x, point.y - focusRight.y)
        expect(Math.abs(toLeft - toRight)).toBeCloseTo(expected, 8)
      }
    }
  })

  it('computes all measurements in the draggable triangle example', () => {
    const scene = parseLessonImport(geometryPackage).scene
    const snapshot = evaluateGeometry2D(getGeometry2DSpec(scene))
    expect(snapshot.points).toHaveLength(3)
    expect(snapshot.measurements).toHaveLength(3)
    expect(snapshot.measurements.every((measurement) => Number.isFinite(measurement.value))).toBe(true)
  })

  it('extracts a non-empty implicit contour from the relation-curve example', () => {
    const scene = parseLessonImport(implicitPackage).scene
    const sample = sampleRelationCurve(getRelationCurve2DSpec(scene))
    expect(sample.paths.length).toBeGreaterThan(100)
    expect(sample.pointCount).toBeGreaterThan(200)
  })

  it('keeps rotation distance invariant and samples its locus locally', () => {
    const scene = parseLessonImport(rotationLocusPackage).scene
    const spec = getGeometry2DSpec(scene)
    const snapshot = evaluateGeometry2D(spec)
    const rotated = snapshot.points.find((point) => point.id === 'R')
    expect(Math.hypot(rotated?.x ?? 0, rotated?.y ?? 0)).toBeCloseTo(3, 10)
    const [locus] = sampleGeometryLoci(spec)
    expect(locus?.points).toHaveLength(241)
    expect(locus?.points.every((point) => Math.abs(Math.hypot(point.x, point.y) - 3) < 1e-10)).toBe(true)
  })

  it('keeps the chart dataset compact and reconstructs both series locally', () => {
    const scene = parseLessonImport(dataChartPackage).scene
    const spec = getDataChart2DSpec(scene)
    expect(spec.mode).toBe('line')
    expect(spec.categories).toHaveLength(6)
    expect(spec.series.map((series) => series.values)).toEqual([
      [-2, 1, 7, 14, 20, 24],
      [6, 8, 11, 15, 19, 22],
    ])
  })
})
