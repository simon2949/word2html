import { describe, expect, it } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { createTimeExperimentScene } from '../templates/timeExperimentTemplate'
import {
  activeStylePresetId,
  applyLayoutPreset,
  applyStylePreset,
  layoutPresetOf,
  resetAppearanceToTemplate,
} from './appearancePresets'

describe('appearance presets', () => {
  it('applies a controlled style patch and preserves object overrides by default', () => {
    const scene = createEllipseScene()
    scene.appearance.objectStyles = { focusLeft: { color: '#2244AA' } }
    const next = applyStylePreset(scene, 'projected-high-contrast')

    expect(next.appearance.theme).toBe('light')
    expect(next.appearance.lineWidth).toBe(5)
    expect(next.appearance.pointStyle).toBe('shadow')
    expect(next.appearance.objectStyles?.focusLeft?.color).toBe('#2244AA')
    expect(activeStylePresetId(next)).toBe('projected-high-contrast')
  })

  it('only clears object overrides after explicit confirmation', () => {
    const scene = createEllipseScene()
    scene.appearance.objectStyles = { focusLeft: { color: '#2244AA' } }
    expect(applyStylePreset(scene, 'dark-presentation', true).appearance.objectStyles).toBeUndefined()
  })

  it('treats missing layout as the backward-compatible parameter layout', () => {
    const scene = createEllipseScene()
    expect(layoutPresetOf(scene.appearance)).toBe('with-parameters')
    expect(layoutPresetOf(applyLayoutPreset(scene, 'compact').appearance)).toBe('compact')
  })

  it('restores renderer-specific template appearance without resetting parameters', () => {
    const scene = createTimeExperimentScene({
      durationExpression: '2', bodyId: 'ball', bodyLabel: '小球',
      xExpression: 't', yExpression: '1', formula: 'x=t', conclusion: '匀速运动。',
      parameters: [{ id: 'speed', label: '速度', value: 2, min: 1, max: 4, step: 1 }],
      metrics: [], vectors: [],
    }, { title: '匀速运动', topic: '运动', subject: 'physics', summary: '观察运动。' })
    scene.parameters.speed!.value = 4
    scene.appearance = applyStylePreset(scene, 'print-friendly').appearance
    scene.appearance.objectStyles = { 'body.ball': { pointRadius: 14 } }

    const next = resetAppearanceToTemplate(scene)
    expect(next.parameters.speed?.value).toBe(4)
    expect(next.appearance.pointColor).toBe('#E15C48')
    expect(next.appearance.helperLineWidth).toBe(3)
    expect(next.appearance.objectStyles?.['body.ball']?.pointRadius).toBe(14)
    expect(next.appearance.layoutPreset).toBe('with-parameters')
  })
})
