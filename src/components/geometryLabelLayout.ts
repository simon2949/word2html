export interface GeometryLabelCandidate {
  id: string
  anchorX: number
  anchorY: number
  width: number
  height: number
}

export interface GeometryLabelRect {
  x: number
  y: number
  width: number
  height: number
}

export interface GeometryLabelPlacement extends GeometryLabelRect {
  id: string
  anchorX: number
  anchorY: number
}

function overlaps(first: GeometryLabelRect, second: GeometryLabelRect, margin = 5): boolean {
  return first.x < second.x + second.width + margin
    && first.x + first.width + margin > second.x
    && first.y < second.y + second.height + margin
    && first.y + first.height + margin > second.y
}

function inside(rect: GeometryLabelRect, bounds: GeometryLabelRect): GeometryLabelRect {
  return {
    ...rect,
    x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - rect.width, rect.x)),
    y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - rect.height, rect.y)),
  }
}

export function layoutGeometryLabels(
  candidates: readonly GeometryLabelCandidate[],
  bounds: GeometryLabelRect,
  initialObstacles: readonly GeometryLabelRect[] = [],
): GeometryLabelPlacement[] {
  const occupied = [...initialObstacles]
  return candidates.map((candidate, index) => {
    const offsets = [
      [12, -candidate.height - 8],
      [12, 12],
      [-candidate.width - 12, -candidate.height - 8],
      [-candidate.width - 12, 12],
      [12, -candidate.height * 2 - 15],
      [-candidate.width - 12, -candidate.height * 2 - 15],
    ]
    let placement: GeometryLabelRect | undefined
    for (const [dx, dy] of offsets) {
      const proposed = inside({
        x: candidate.anchorX + dx!, y: candidate.anchorY + dy!,
        width: candidate.width, height: candidate.height,
      }, bounds)
      if (!occupied.some((rect) => overlaps(proposed, rect))) {
        placement = proposed
        break
      }
    }
    if (!placement) {
      const fallback = inside({
        x: bounds.x + bounds.width - candidate.width - 8,
        y: bounds.y + 8 + index * (candidate.height + 7),
        width: candidate.width,
        height: candidate.height,
      }, bounds)
      placement = fallback
    }
    occupied.push(placement)
    return { ...placement, id: candidate.id, anchorX: candidate.anchorX, anchorY: candidate.anchorY }
  })
}
