import { describe, expect, it } from 'vitest'
import {
  coordinateTicks,
  createPlotTransform,
  formatCoordinate,
  squareGridStep,
  zoomViewport,
} from './viewport'

describe('plot viewport and square grid', () => {
  const base = { xMin: -7, xMax: 7, yMin: -4.5, yMax: 4.5 }

  it('uses one equal scale for x and y so grid cells remain square', () => {
    const transform = createPlotTransform(base, 900, 590, 48)
    const step = squareGridStep(transform.scale)
    const origin = transform.toSvg({ x: 0, y: 0 })
    const xStep = transform.toSvg({ x: step, y: 0 })
    const yStep = transform.toSvg({ x: 0, y: step })
    expect(Math.abs(xStep.x - origin.x)).toBeCloseTo(Math.abs(yStep.y - origin.y), 10)
  })

  it('expands the world viewport to fill the complete plot rectangle', () => {
    const transform = createPlotTransform(base, 900, 590, 24)
    expect(transform.xOffset).toBeCloseTo(24, 10)
    expect(transform.yOffset).toBeCloseTo(24, 10)
    expect(transform.contentWidth).toBeCloseTo(852, 10)
    expect(transform.contentHeight).toBeCloseTo(542, 10)
  })

  it('produces readable integer ticks for the default viewport', () => {
    const transform = createPlotTransform(base, 900, 590, 48)
    const step = squareGridStep(transform.scale)
    const ticks = coordinateTicks(base.xMin, base.xMax, step)
    expect(step).toBe(1)
    expect(ticks).toContain(5)
    expect(formatCoordinate(5, step)).toBe('5')
  })

  it('supports zoom out, zoom in, and fit at 100%', () => {
    const zoomedOut = zoomViewport(base, 0.5)
    const fitted = zoomViewport(base, 1)
    const zoomedIn = zoomViewport(base, 1.6)
    expect(zoomedOut.xMax - zoomedOut.xMin).toBeGreaterThan(fitted.xMax - fitted.xMin)
    expect(zoomedIn.xMax - zoomedIn.xMin).toBeLessThan(fitted.xMax - fitted.xMin)
    expect(fitted).toEqual(base)
  })
})
