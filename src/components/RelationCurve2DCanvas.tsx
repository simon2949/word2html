import { useMemo } from 'react'
import {
  getRelationCurve2DSpec,
  sampleRelationCurve,
} from '../core/relationCurve2d'
import {
  lineDashArray,
  lineStyleOf,
  lineWidthOf,
  objectColorOf,
  objectVisibleOf,
} from '../core/appearanceStyles'
import {
  coordinateTicks,
  createPlotTransform,
  formatCoordinate,
  labelStride,
  squareGridStep,
  zoomViewport,
} from '../core/viewport'
import type { LessonScene } from '../types/lessonScene'
import { sceneObjectSelectionProps } from './sceneObjectSelection'

interface RelationCurve2DCanvasProps {
  scene: LessonScene
  zoom: number
  selectedObjectId?: string | null
  onObjectSelect?: (objectId: string) => void
}

const SVG_WIDTH = 900
const SVG_HEIGHT = 590
const PADDING = 24

export function RelationCurve2DCanvas({ scene, zoom, selectedObjectId, onObjectSelect }: RelationCurve2DCanvasProps) {
  const spec = useMemo(() => getRelationCurve2DSpec(scene), [scene])
  const sample = useMemo(() => sampleRelationCurve(spec), [spec])
  const viewport = useMemo(() => zoomViewport(scene.viewport, zoom), [scene.viewport, zoom])
  const transform = useMemo(() => createPlotTransform(viewport, SVG_WIDTH, SVG_HEIGHT, PADDING), [viewport])
  const { appearance } = scene
  const { xOffset, yOffset, contentWidth, contentHeight, scale, toSvg } = transform
  const dark = appearance.theme === 'dark'
  const background = dark ? '#17212B' : '#FBFCFE'
  const gridColor = dark ? '#2D3B47' : '#E7EAF0'
  const axisColor = dark ? '#7D8D9C' : '#9AA3AE'
  const origin = toSvg({ x: 0, y: 0 })
  const gridStep = squareGridStep(scale)
  const gridX = coordinateTicks(transform.viewport.xMin, transform.viewport.xMax, gridStep)
  const gridY = coordinateTicks(transform.viewport.yMin, transform.viewport.yMax, gridStep)
  const tickStride = labelStride(gridStep, scale)
  const showXAxis = transform.viewport.yMin <= 0 && transform.viewport.yMax >= 0
  const showYAxis = transform.viewport.xMin <= 0 && transform.viewport.xMax >= 0
  const curveObject = scene.objects.find((object) => object.id === 'relationCurve')!
  const width = lineWidthOf(appearance, curveObject.id)
  const color = objectColorOf(appearance, curveObject.id, appearance.curveColor)
  const pathData = useMemo(() => sample.paths.map((path) => path.map((point, index) => {
    const mapped = toSvg(point)
    return `${index === 0 ? 'M' : 'L'} ${mapped.x.toFixed(2)} ${mapped.y.toFixed(2)}`
  }).join(' ')).join(' '), [sample.paths, toSvg])
  const modeLabel = spec.mode === 'parametric' ? '参数方程' : spec.mode === 'polar' ? '极坐标' : '隐函数等值线'

  return (
    <div className="canvas-stack" data-theme={appearance.theme}>
      <div className="canvas-shell" data-theme={appearance.theme}>
        <svg
          className="relation-curve-2d-canvas"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          role="img"
          aria-label={`${scene.metadata.title}。${modeLabel}，当前绘制 ${sample.pointCount} 个采样点。`}
          data-curve-mode={spec.mode}
        >
          <title>{scene.metadata.title}</title>
          <defs>
            <clipPath id="relation-curve-plot-clip">
              <rect x={xOffset} y={yOffset} width={contentWidth} height={contentHeight} />
            </clipPath>
          </defs>
          <rect width={SVG_WIDTH} height={SVG_HEIGHT} rx="22" fill={background} />
          {appearance.showGrid && <g aria-hidden="true">
            {gridX.map((value) => <line key={`gx-${value}`} x1={toSvg({ x: value, y: 0 }).x} x2={toSvg({ x: value, y: 0 }).x} y1={yOffset} y2={yOffset + contentHeight} stroke={gridColor} />)}
            {gridY.map((value) => <line key={`gy-${value}`} x1={xOffset} x2={xOffset + contentWidth} y1={toSvg({ x: 0, y: value }).y} y2={toSvg({ x: 0, y: value }).y} stroke={gridColor} />)}
          </g>}
          {appearance.showAxes && <g aria-hidden="true">
            <g stroke={axisColor} strokeWidth="1.5">
              {showXAxis && <line x1={xOffset} x2={xOffset + contentWidth} y1={origin.y} y2={origin.y} />}
              {showYAxis && <line x1={origin.x} x2={origin.x} y1={yOffset} y2={yOffset + contentHeight} />}
            </g>
            <g fill={axisColor} fontSize={11 * appearance.fontScale}>
              {showXAxis && gridX.map((value, index) => value !== 0 && index % tickStride === 0 ? <text key={`xl-${value}`} x={toSvg({ x: value, y: 0 }).x} y={origin.y + 17} textAnchor="middle">{formatCoordinate(value, gridStep)}</text> : null)}
              {showYAxis && gridY.map((value, index) => value !== 0 && index % tickStride === 0 ? <text key={`yl-${value}`} x={origin.x - 9} y={toSvg({ x: 0, y: value }).y + 4} textAnchor="end">{formatCoordinate(value, gridStep)}</text> : null)}
              {showXAxis && showYAxis && <text x={origin.x - 7} y={origin.y + 16} textAnchor="end">0</text>}
              {showXAxis && <text x={xOffset + contentWidth - 5} y={origin.y - 10} textAnchor="end" fontWeight="700">x</text>}
              {showYAxis && <text x={origin.x + 10} y={yOffset + 13} fontWeight="700">y</text>}
            </g>
          </g>}
          {objectVisibleOf(appearance, curveObject.id) && <path
            {...sceneObjectSelectionProps(curveObject.id, curveObject.label ?? modeLabel, selectedObjectId, onObjectSelect)}
            d={pathData}
            clipPath="url(#relation-curve-plot-clip)"
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeDasharray={lineDashArray(lineStyleOf(appearance, curveObject.id), width)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />}
          <g transform={`translate(${xOffset + 10} ${yOffset + 10})`} aria-hidden="true">
            <rect width="112" height="28" rx="14" fill={dark ? '#243441' : '#FFFFFF'} opacity=".94" />
            <text x="56" y="18.5" fill={dark ? '#E8EEF3' : '#4A5662'} fontSize="12" fontWeight="750" textAnchor="middle">{modeLabel}</text>
          </g>
        </svg>
      </div>
    </div>
  )
}
