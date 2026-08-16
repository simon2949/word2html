import type { LessonScene } from '../types/lessonScene'
import type { Point2D } from './ellipse'

export interface PlotViewport {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface PlotTransform {
  scale: number
  xOffset: number
  yOffset: number
  contentWidth: number
  contentHeight: number
  viewport: PlotViewport
  toSvg: (point: Point2D) => Point2D
  fromSvg: (point: Point2D) => Point2D
}

export function fitViewportToAspect(
  viewport: PlotViewport,
  pixelWidth: number,
  pixelHeight: number,
): PlotViewport {
  const centerX = (viewport.xMin + viewport.xMax) / 2
  const centerY = (viewport.yMin + viewport.yMax) / 2
  let width = viewport.xMax - viewport.xMin
  let height = viewport.yMax - viewport.yMin
  const targetAspect = pixelWidth / pixelHeight
  if (width / height < targetAspect) width = height * targetAspect
  else height = width / targetAspect
  return {
    xMin: centerX - width / 2,
    xMax: centerX + width / 2,
    yMin: centerY - height / 2,
    yMax: centerY + height / 2,
  }
}

export function zoomViewport(
  viewport: LessonScene['viewport'] | PlotViewport,
  zoom: number,
): PlotViewport {
  const safeZoom = Math.min(1.6, Math.max(0.5, zoom))
  const centerX = (viewport.xMin + viewport.xMax) / 2
  const centerY = (viewport.yMin + viewport.yMax) / 2
  const halfWidth = (viewport.xMax - viewport.xMin) / 2 / safeZoom
  const halfHeight = (viewport.yMax - viewport.yMin) / 2 / safeZoom
  return {
    xMin: centerX - halfWidth,
    xMax: centerX + halfWidth,
    yMin: centerY - halfHeight,
    yMax: centerY + halfHeight,
  }
}

export function createPlotTransform(
  viewport: PlotViewport,
  width: number,
  height: number,
  padding: number,
): PlotTransform {
  const plotWidth = width - padding * 2
  const plotHeight = height - padding * 2
  const fittedViewport = fitViewportToAspect(viewport, plotWidth, plotHeight)
  const xSpan = fittedViewport.xMax - fittedViewport.xMin
  const ySpan = fittedViewport.yMax - fittedViewport.yMin
  const scale = Math.min(plotWidth / xSpan, plotHeight / ySpan)
  const contentWidth = xSpan * scale
  const contentHeight = ySpan * scale
  const xOffset = (width - contentWidth) / 2
  const yOffset = (height - contentHeight) / 2

  return {
    scale,
    xOffset,
    yOffset,
    contentWidth,
    contentHeight,
    viewport: fittedViewport,
    toSvg: (point) => ({
      x: xOffset + (point.x - fittedViewport.xMin) * scale,
      y: yOffset + (fittedViewport.yMax - point.y) * scale,
    }),
    fromSvg: (point) => ({
      x: fittedViewport.xMin + (point.x - xOffset) / scale,
      y: fittedViewport.yMax - (point.y - yOffset) / scale,
    }),
  }
}

function nearestNiceNumber(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value))
  const normalized = value / power
  const choices = [1, 2, 5, 10]
  const closest = choices.reduce((best, choice) =>
    Math.abs(choice - normalized) < Math.abs(best - normalized) ? choice : best,
  )
  return closest * power
}

/** One world-unit step is shared by both axes, so every grid cell is square. */
export function squareGridStep(scale: number, targetPixels = 62): number {
  return nearestNiceNumber(targetPixels / scale)
}

export function coordinateTicks(min: number, max: number, step: number): number[] {
  const first = Math.ceil((min - step * 1e-9) / step) * step
  const ticks: number[] = []
  for (let value = first; value <= max + step * 1e-9; value += step) {
    ticks.push(Number(value.toFixed(10)))
  }
  return ticks
}

export function labelStride(step: number, scale: number, minimumPixels = 42): number {
  return Math.max(1, Math.ceil(minimumPixels / (step * scale)))
}

export function formatCoordinate(value: number, step: number): string {
  if (Math.abs(value) < step * 1e-8) return '0'
  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)))
  return Number(value.toFixed(decimals)).toString()
}
