import { describe, expect, it } from 'vitest'
import ellipsePackage from '../../examples/lesson-packages/01-ellipse-focus-sum.word2html.json'
import sinePackage from '../../examples/lesson-packages/02-sine-wave-parameters.word2html.json'
import projectilePackage from '../../examples/lesson-packages/03-projectile-motion.word2html.json'
import pendulumsPackage from '../../examples/lesson-packages/04-two-pendulums.word2html.json'
import springPackage from '../../examples/lesson-packages/05-spring-oscillator.word2html.json'
import hyperbolaPackage from '../../examples/lesson-packages/06-hyperbola-focus-difference.word2html.json'
import { parseLessonImport } from './lessonPackage'
import { createTimeExperimentRuntime } from './timeExperiment'
import { validateLessonScene } from './validateScene'

const examples: Array<[string, unknown]> = [
  ['01-ellipse-focus-sum.word2html.json', ellipsePackage],
  ['02-sine-wave-parameters.word2html.json', sinePackage],
  ['03-projectile-motion.word2html.json', projectilePackage],
  ['04-two-pendulums.word2html.json', pendulumsPackage],
  ['05-spring-oscillator.word2html.json', springPackage],
  ['06-hyperbola-focus-difference.word2html.json', hyperbolaPackage],
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
})
