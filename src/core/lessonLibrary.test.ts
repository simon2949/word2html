import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { updateAxisParameter } from './ellipse'
import {
  getOfficialLibraryEntries,
  loadThirdPartyLibrary,
  removeThirdPartyEntry,
  saveThirdPartyScene,
} from './lessonLibrary'
import { createTimeExperimentRuntime, updateTimeExperimentParameter } from './timeExperiment'
import { createCollision2DRuntime, getCollision2DSpec } from './collision2d'
import { isNumberParameter } from '../types/lessonScene'
import { runSceneReviewChecks } from './sceneReviewChecks'

const values = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
})

beforeEach(() => values.clear())
afterAll(() => vi.unstubAllGlobals())

describe('lesson libraries', () => {
  it('ships reviewed official demonstrations as immutable clones', () => {
    const first = getOfficialLibraryEntries()
    const second = getOfficialLibraryEntries()

    expect(first).toHaveLength(11)
    expect(first.every((entry) => entry.reviewStatus === 'official')).toBe(true)
    expect(first.map((entry) => entry.title)).toContain('自由落体运动')
    expect(first.map((entry) => entry.title)).toContain('可拖动三角形的边、角与面积')
    expect(first.map((entry) => entry.title)).toContain('二维圆盘接触与碰撞')
    expect(first.map((entry) => entry.title)).toContain('极坐标三瓣玫瑰线')
    expect(first.map((entry) => entry.title)).toContain('两地月平均气温比较')
    expect(first.map((entry) => entry.title)).toContain('旋转、圆周轨迹与垂足')
    expect(first.map((entry) => entry.title)).toContain('双曲线的焦点距离差')
    expect(first[0]).not.toBe(second[0])
  })

  it('automatically stores a validated import as pending third-party content', () => {
    const entry = saveThirdPartyScene(createEllipseScene(), 'ellipse.word2html.json')
    const stored = loadThirdPartyLibrary()

    expect(entry.reviewStatus).toBe('pending')
    expect(entry.source).toBe('third-party')
    expect(stored).toHaveLength(1)
    expect(stored[0]?.sourceFilename).toBe('ellipse.word2html.json')
    expect(stored[0]?.scene.lineage.source).toBe('imported')
  })

  it('keeps the official hyperbola focal-distance invariant across axis boundaries', () => {
    const official = getOfficialLibraryEntries()
      .find((entry) => entry.id === 'official.hyperbola-focus-difference')
    if (!official) throw new Error('双曲线官方场景缺失')

    expect(official.scene.objects.filter((object) => object.role === '几何距离')).toHaveLength(2)
    const boundaries: Array<[number, number]> = [[1, 0.5], [1, 5], [6, 0.5], [6, 5]]
    for (const [a, b] of boundaries) {
      let scene = updateTimeExperimentParameter(official.scene, 'a', a)
      scene = updateTimeExperimentParameter(scene, 'b', b)
      const runtime = createTimeExperimentRuntime(scene)
      for (let index = 0; index <= 12; index += 1) {
        const snapshot = runtime.snapshot(runtime.duration * index / 12)
        const difference = snapshot.metrics.find((metric) => metric.id === 'distanceDifference')?.value
        const expected = snapshot.metrics.find((metric) => metric.id === 'expectedDifference')?.value
        expect(difference).toBeCloseTo(2 * a, 8)
        expect(expected).toBeCloseTo(2 * a, 8)
      }
    }
  })

  it('binds independent mass and two-dimensional velocity parameters to every official collision disc', () => {
    const official = getOfficialLibraryEntries()
      .find((entry) => entry.id === 'official.collision-discs-2d')
    if (!official) throw new Error('二维圆盘官方场景缺失')

    const spec = getCollision2DSpec(official.scene)
    expect(spec.parameters.map((parameter) => parameter.id)).toEqual([
      'duration', 'restitution',
      'massA', 'vxA', 'vyA',
      'massB', 'vxB', 'vyB',
      'massC', 'vxC', 'vyC',
    ])
    expect(spec.bodies.map((body) => [body.massExpression, body.vxExpression, body.vyExpression])).toEqual([
      ['massA', 'vxA', 'vyA'],
      ['massB', 'vxB', 'vyB'],
      ['massC', 'vxC', 'vyC'],
    ])

    const changed = structuredClone(official.scene)
    const values = { massA: 1.25, vxA: 2.5, vyA: 0.5, massB: 1.75, vxB: -0.75, vyB: 0.25, massC: 2.25, vxC: -1.25, vyC: 0.75 }
    for (const [id, value] of Object.entries(values)) {
      const parameter = changed.parameters[id]
      if (!isNumberParameter(parameter)) throw new Error(`缺少独立碰撞参数：${id}`)
      parameter.value = value
    }
    const bodies = createCollision2DRuntime(changed).snapshot(0).bodies
    expect(bodies.map((body) => [body.mass, body.vx, body.vy])).toEqual([
      [1.25, 2.5, 0.5],
      [1.75, -0.75, 0.25],
      [2.25, -1.25, 0.75],
    ])
    const review = runSceneReviewChecks(official.scene)
    expect(
      review.results.filter((result) => result.status === 'failed'),
      JSON.stringify(review, null, 2),
    ).toEqual([])
  })

  it('deduplicates equivalent imports by reusable scene fingerprint', () => {
    const scene = createEllipseScene()
    saveThirdPartyScene(scene, 'first.json')
    const updated = saveThirdPartyScene(scene, 'second.json')

    expect(loadThirdPartyLibrary()).toHaveLength(1)
    expect(updated.sourceFilename).toBe('second.json')
  })

  it('saves a returned scene revision back into the same local library entry', () => {
    const original = saveThirdPartyScene(createEllipseScene(), 'ellipse.json')
    const revised = updateAxisParameter(createEllipseScene(), 'majorAxis', 16)
    revised.lineage.fingerprint = 'a-new-model-revision'

    const saved = saveThirdPartyScene(
      revised,
      original.sourceFilename,
      original.id,
      'community.1234567890abcdef12345678',
    )

    expect(saved.id).toBe(original.id)
    expect(saved.revisionOfSubmissionId).toBe('community.1234567890abcdef12345678')
    expect(loadThirdPartyLibrary()).toHaveLength(1)
    expect(loadThirdPartyLibrary()[0]?.scene.parameters.majorAxis).toMatchObject({ value: 16 })
  })

  it('does not trust a verified flag written directly into local storage', () => {
    const entry = saveThirdPartyScene(createEllipseScene(), 'ellipse.json')
    values.set('word2html.lesson-library.third-party.v0.1', JSON.stringify([
      { ...entry, reviewStatus: 'verified' },
    ]))

    expect(loadThirdPartyLibrary()[0]?.reviewStatus).toBe('pending')
  })

  it('removes local third-party records without touching official content', () => {
    const entry = saveThirdPartyScene(createEllipseScene())

    expect(removeThirdPartyEntry(entry.id)).toEqual([])
    expect(getOfficialLibraryEntries()).toHaveLength(11)
  })
})
