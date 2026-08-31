import { describe, expect, it } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { updateAppearance } from './ellipse'
import {
  editableSceneObjects,
  objectAppearanceOverride,
  resetObjectAppearance,
  updateObjectAppearance,
} from './objectAppearance'

describe('object appearance overrides', () => {
  it('updates one object without changing scene defaults or sibling objects', () => {
    const scene = createEllipseScene()
    const next = updateObjectAppearance(scene, 'focusLeft', {
      color: '#2244AA', pointRadius: 14, pointStyle: 'shadow',
    })

    expect(next.appearance.pointRadius).toBe(7)
    expect(objectAppearanceOverride(next, 'focusLeft')).toMatchObject({
      color: '#2244AA', pointRadius: 14, pointStyle: 'shadow',
    })
    expect(objectAppearanceOverride(next, 'focusRight')).toEqual({})
    expect(scene.appearance.objectStyles).toBeUndefined()
  })

  it('limits editable fields by object kind and rejects invalid IDs', () => {
    const scene = createEllipseScene()
    expect(() => updateObjectAppearance(scene, 'focusLeft', { lineWidth: 4 })).toThrow('不支持修改')
    expect(() => updateObjectAppearance(scene, 'ellipse', { pointRadius: 12 })).toThrow('不支持修改')
    expect(() => updateObjectAppearance(scene, 'missing', { color: '#123456' })).toThrow('不存在')
    expect(() => updateObjectAppearance(scene, 'grid', { color: '#123456' })).toThrow('不支持外观编辑')
  })

  it('resets one override and exposes only editable scene objects', () => {
    const scene = updateObjectAppearance(createEllipseScene(), 'distanceLeft', {
      lineWidth: 6, lineStyle: 'dash-dot',
    })
    const reset = resetObjectAppearance(scene, 'distanceLeft')

    expect(reset.appearance.objectStyles).toBeUndefined()
    expect(editableSceneObjects(reset).map((object) => object.id)).toContain('distanceLeft')
    expect(editableSceneObjects(reset).map((object) => object.id)).not.toContain('grid')
  })

  it('keeps local overrides above later overall appearance changes', () => {
    const local = updateObjectAppearance(createEllipseScene(), 'focusLeft', { color: '#2244AA' })
    const next = updateAppearance(local, 'focusColor', '#CC3300')

    expect(next.appearance.focusColor).toBe('#CC3300')
    expect(objectAppearanceOverride(next, 'focusLeft').color).toBe('#2244AA')
    expect(objectAppearanceOverride(next, 'focusRight')).toEqual({})
  })
})
