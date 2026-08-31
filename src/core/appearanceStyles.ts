import type {
  LineStyle,
  ObjectAppearanceOverride,
  PointStyle,
  SceneAppearance,
} from '../types/lessonScene'

export interface PointSvgAppearance {
  fill: string
  stroke: string
  strokeWidth: number
  filter?: string
}

export function objectStyleOf(
  appearance: SceneAppearance,
  objectId?: string,
): ObjectAppearanceOverride {
  return objectId ? appearance.objectStyles?.[objectId] ?? {} : {}
}

export function objectColorOf(
  appearance: SceneAppearance,
  objectId: string,
  fallback: string,
): string {
  return objectStyleOf(appearance, objectId).color ?? fallback
}

export function objectVisibleOf(appearance: SceneAppearance, objectId: string): boolean {
  return objectStyleOf(appearance, objectId).visible ?? true
}

export function lineWidthOf(
  appearance: SceneAppearance,
  objectId?: string,
  fallback = appearance.lineWidth,
): number {
  return objectStyleOf(appearance, objectId).lineWidth ?? fallback
}

export function lineStyleOf(appearance: SceneAppearance, objectId?: string): LineStyle {
  return objectStyleOf(appearance, objectId).lineStyle ?? appearance.lineStyle ?? 'solid'
}

export function helperLineStyleOf(
  appearance: SceneAppearance,
  fallback: LineStyle = 'dashed',
  objectId?: string,
): LineStyle {
  return objectStyleOf(appearance, objectId).lineStyle ?? appearance.helperLineStyle ?? fallback
}

export function helperLineWidthOf(
  appearance: SceneAppearance,
  fallback = 2.25,
  objectId?: string,
): number {
  return objectStyleOf(appearance, objectId).lineWidth ?? appearance.helperLineWidth ?? fallback
}

export function pointRadiusOf(appearance: SceneAppearance, objectId?: string): number {
  return objectStyleOf(appearance, objectId).pointRadius ?? appearance.pointRadius
}

export function pointStyleOf(appearance: SceneAppearance, objectId?: string): PointStyle {
  return objectStyleOf(appearance, objectId).pointStyle ?? appearance.pointStyle ?? 'outlined'
}

export function lineDashArray(style: LineStyle | undefined, width = 2): string | undefined {
  if (!style || style === 'solid') return undefined
  const unit = Math.max(1, width)
  if (style === 'dashed') return `${unit * 4} ${unit * 2.5}`
  return `${unit * 5} ${unit * 2.4} ${unit} ${unit * 2.4}`
}

export function pointSvgAppearance(
  appearance: SceneAppearance,
  color: string,
  contrastingColor: string,
  shadowFilterId: string,
  objectId?: string,
): PointSvgAppearance {
  const style = pointStyleOf(appearance, objectId)
  const radius = pointRadiusOf(appearance, objectId)
  const outlined = style !== 'solid'
  return {
    fill: objectId ? objectColorOf(appearance, objectId, color) : color,
    stroke: outlined ? contrastingColor : 'none',
    strokeWidth: outlined ? Math.max(2, Math.min(4, radius * 0.32)) : 0,
    filter: style === 'shadow' ? `url(#${shadowFilterId})` : undefined,
  }
}
