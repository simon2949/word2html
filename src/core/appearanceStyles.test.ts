import { describe, expect, it } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import {
  helperLineStyleOf,
  helperLineWidthOf,
  lineDashArray,
  lineWidthOf,
  objectColorOf,
  pointRadiusOf,
  pointSvgAppearance,
} from './appearanceStyles'

describe('appearance style helpers', () => {
  it('maps semantic line styles to scalable SVG dash patterns', () => {
    expect(lineDashArray('solid', 3)).toBeUndefined()
    expect(lineDashArray('dashed', 2)).toBe('8 5')
    expect(lineDashArray('dash-dot', 2)).toBe('10 4.8 2 4.8')
  })

  it('supports solid, outlined, and shadow points', () => {
    const appearance = createEllipseScene().appearance
    appearance.pointStyle = 'solid'
    expect(pointSvgAppearance(appearance, '#123456', '#ffffff', 'shadow')).toMatchObject({
      fill: '#123456', stroke: 'none', strokeWidth: 0,
    })

    appearance.pointStyle = 'outlined'
    expect(pointSvgAppearance(appearance, '#123456', '#ffffff', 'shadow')).toMatchObject({
      stroke: '#ffffff', filter: undefined,
    })

    appearance.pointStyle = 'shadow'
    expect(pointSvgAppearance(appearance, '#123456', '#ffffff', 'shadow').filter)
      .toBe('url(#shadow)')
  })

  it('keeps safe fallbacks for older LessonScene 0.1 files', () => {
    const appearance = createEllipseScene().appearance
    delete appearance.helperLineStyle
    delete appearance.helperLineWidth
    expect(helperLineStyleOf(appearance)).toBe('dashed')
    expect(helperLineWidthOf(appearance)).toBe(2.25)
  })

  it('resolves object overrides before scene-level appearance', () => {
    const appearance = createEllipseScene().appearance
    appearance.objectStyles = {
      focusLeft: { color: '#112233', pointRadius: 15, pointStyle: 'solid' },
      distanceLeft: { lineWidth: 6, lineStyle: 'dash-dot' },
    }

    expect(objectColorOf(appearance, 'focusLeft', appearance.focusColor)).toBe('#112233')
    expect(pointRadiusOf(appearance, 'focusLeft')).toBe(15)
    expect(lineWidthOf(appearance, 'distanceLeft')).toBe(6)
    expect(pointSvgAppearance(appearance, appearance.focusColor, '#ffffff', 'shadow', 'focusLeft'))
      .toMatchObject({ fill: '#112233', stroke: 'none' })
  })
})
