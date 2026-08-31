import { describe, expect, it } from 'vitest'
import { layoutGeometryLabels, type GeometryLabelRect } from './geometryLabelLayout'

function overlap(first: GeometryLabelRect, second: GeometryLabelRect): boolean {
  return first.x < second.x + second.width && first.x + first.width > second.x
    && first.y < second.y + second.height && first.y + first.height > second.y
}

describe('geometry measurement label layout', () => {
  it('keeps labels inside the plot and separates labels sharing one anchor', () => {
    const placements = layoutGeometryLabels([
      { id: 'a', anchorX: 200, anchorY: 180, width: 100, height: 26 },
      { id: 'b', anchorX: 200, anchorY: 180, width: 120, height: 26 },
      { id: 'c', anchorX: 200, anchorY: 180, width: 90, height: 26 },
    ], { x: 24, y: 24, width: 852, height: 542 })
    expect(placements.every((item) => item.x >= 24 && item.y >= 24 && item.x + item.width <= 876 && item.y + item.height <= 566)).toBe(true)
    for (let index = 0; index < placements.length; index += 1) {
      for (let other = index + 1; other < placements.length; other += 1) {
        expect(overlap(placements[index]!, placements[other]!)).toBe(false)
      }
    }
  })

  it('avoids point-label obstacles when another position is available', () => {
    const [placement] = layoutGeometryLabels(
      [{ id: 'a', anchorX: 100, anchorY: 100, width: 100, height: 26 }],
      { x: 0, y: 0, width: 400, height: 300 },
      [{ x: 112, y: 66, width: 100, height: 30 }],
    )
    expect(overlap(placement!, { x: 112, y: 66, width: 100, height: 30 })).toBe(false)
  })
})
