import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ellipseAngleFromPoint,
  getEllipseGeometry,
  getEllipseSnapshot,
  pointOnEllipse,
  type Point2D,
} from '../core/ellipse'
import type { LessonScene } from '../types/lessonScene'
import {
  coordinateTicks,
  createPlotTransform,
  formatCoordinate,
  labelStride,
  squareGridStep,
  zoomViewport,
} from '../core/viewport'

interface EllipseCanvasProps {
  scene: LessonScene
  angle: number
  trailAngles: number[]
  zoom: number
  onAngleChange: (angle: number) => void
}

const SVG_WIDTH = 900
const SVG_HEIGHT = 590
const PADDING = 24

function distanceLabelPosition(first: Point2D, second: Point2D): Point2D {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}

export function EllipseCanvas({
  scene,
  angle,
  trailAngles,
  zoom,
  onAngleChange,
}: EllipseCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState(false)
  const snapshot = useMemo(() => getEllipseSnapshot(scene, angle), [scene, angle])
  const geometry = useMemo(() => getEllipseGeometry(scene), [scene])
  const { appearance } = scene
  const effectiveViewport = useMemo(() => zoomViewport(scene.viewport, zoom), [scene.viewport, zoom])
  const transform = useMemo(
    () => createPlotTransform(effectiveViewport, SVG_WIDTH, SVG_HEIGHT, PADDING),
    [effectiveViewport],
  )
  const { scale, xOffset, yOffset, contentWidth, contentHeight, viewport: plotViewport, toSvg, fromSvg } = transform

  const point = toSvg(snapshot.point)
  const focusLeft = toSvg(snapshot.focusLeft)
  const focusRight = toSvg(snapshot.focusRight)
  const origin = toSvg({ x: 0, y: 0 })
  const ellipseRx = geometry.a * scale
  const ellipseRy = geometry.b * scale
  const gridStep = squareGridStep(scale)
  const gridX = coordinateTicks(plotViewport.xMin, plotViewport.xMax, gridStep)
  const gridY = coordinateTicks(plotViewport.yMin, plotViewport.yMax, gridStep)
  const tickLabelStride = labelStride(gridStep, scale)
  const leftLabel = toSvg(distanceLabelPosition(snapshot.point, snapshot.focusLeft))
  const rightLabel = toSvg(distanceLabelPosition(snapshot.point, snapshot.focusRight))
  const dark = appearance.theme === 'dark'
  const background = dark ? '#17212B' : '#FBFCFE'
  const gridColor = dark ? '#2D3B47' : '#E7EAF0'
  const axisColor = dark ? '#7D8D9C' : '#9AA3AE'
  const textColor = dark ? '#E8EEF3' : '#36404A'

  const updateFromPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const bounds = svg.getBoundingClientRect()
    const pointer = {
      x: ((event.clientX - bounds.left) / bounds.width) * SVG_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * SVG_HEIGHT,
    }
    onAngleChange(ellipseAngleFromPoint(geometry, fromSvg(pointer)))
  }

  const handlePointerDown = (event: ReactPointerEvent<SVGCircleElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging) return
    updateFromPointer(event)
  }

  const stopDragging = () => setDragging(false)

  return (
    <div className="canvas-stack" data-theme={appearance.theme}>
      <div className="canvas-shell" data-theme={appearance.theme}>
        <svg
        ref={svgRef}
        className="ellipse-canvas"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-label={`椭圆交互图。长轴全长 ${snapshot.majorAxis}，短轴全长 ${snapshot.minorAxis}，动点到两焦点距离和 ${snapshot.distanceSum.toFixed(2)}`}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onPointerLeave={stopDragging}
      >
        <title>椭圆焦点距离和交互图</title>
        <rect width={SVG_WIDTH} height={SVG_HEIGHT} rx="22" fill={background} />

        {appearance.showGrid && (
          <g aria-hidden="true">
            {gridX.map((value) => {
              const x = toSvg({ x: value, y: 0 }).x
              return <line key={`gx-${value}`} x1={x} x2={x} y1={yOffset} y2={yOffset + contentHeight} stroke={gridColor} strokeWidth="1" />
            })}
            {gridY.map((value) => {
              const y = toSvg({ x: 0, y: value }).y
              return <line key={`gy-${value}`} x1={xOffset} x2={xOffset + contentWidth} y1={y} y2={y} stroke={gridColor} strokeWidth="1" />
            })}
          </g>
        )}

        {appearance.showAxes && (
          <g aria-hidden="true">
            <g stroke={axisColor} strokeWidth="1.5">
              <line x1={xOffset} x2={xOffset + contentWidth} y1={origin.y} y2={origin.y} />
              <line x1={origin.x} x2={origin.x} y1={yOffset} y2={yOffset + contentHeight} />
              <path d={`M ${xOffset + contentWidth - 8} ${origin.y - 4} L ${xOffset + contentWidth} ${origin.y} L ${xOffset + contentWidth - 8} ${origin.y + 4}`} fill="none" />
              <path d={`M ${origin.x - 4} ${yOffset + 8} L ${origin.x} ${yOffset} L ${origin.x + 4} ${yOffset + 8}`} fill="none" />
            </g>
            <g className="axis-tick-labels" fill={axisColor} fontSize={11 * appearance.fontScale}>
              {gridX.map((value, index) => value !== 0 && index % tickLabelStride === 0 ? (
                <text key={`xl-${value}`} x={toSvg({ x: value, y: 0 }).x} y={origin.y + 17} textAnchor="middle">
                  {formatCoordinate(value, gridStep)}
                </text>
              ) : null)}
              {gridY.map((value, index) => value !== 0 && index % tickLabelStride === 0 ? (
                <text key={`yl-${value}`} x={origin.x - 9} y={toSvg({ x: 0, y: value }).y + 4} textAnchor="end">
                  {formatCoordinate(value, gridStep)}
                </text>
              ) : null)}
              <text x={origin.x - 7} y={origin.y + 16} textAnchor="end">0</text>
              <text x={xOffset + contentWidth - 5} y={origin.y - 10} textAnchor="end" fontWeight="700">x</text>
              <text x={origin.x + 10} y={yOffset + 13} fontWeight="700">y</text>
            </g>
          </g>
        )}

        {appearance.showTrail && trailAngles.length > 1 && (
          <polyline
            points={trailAngles
              .map((trailAngle) => toSvg(pointOnEllipse(geometry, trailAngle)))
              .map((trailPoint) => `${trailPoint.x},${trailPoint.y}`)
              .join(' ')}
            fill="none"
            stroke={appearance.pointColor}
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.18"
            aria-hidden="true"
          />
        )}

        <ellipse
          cx={origin.x}
          cy={origin.y}
          rx={ellipseRx}
          ry={ellipseRy}
          fill="none"
          stroke={appearance.curveColor}
          strokeWidth={appearance.lineWidth}
        />

        {appearance.showHelperLines && (
          <g stroke={appearance.helperColor} strokeWidth="2.25" strokeDasharray="7 6">
            <line x1={focusLeft.x} y1={focusLeft.y} x2={point.x} y2={point.y} />
            <line x1={focusRight.x} y1={focusRight.y} x2={point.x} y2={point.y} />
          </g>
        )}

        <g fill={appearance.focusColor}>
          <circle cx={focusLeft.x} cy={focusLeft.y} r={appearance.pointRadius - 1} />
          <circle cx={focusRight.x} cy={focusRight.y} r={appearance.pointRadius - 1} />
        </g>

        {appearance.showFocusLabels && (
          <g fill={textColor} fontSize={14 * appearance.fontScale} fontWeight="650">
            <text x={focusLeft.x - 8} y={focusLeft.y - 13} textAnchor="middle">F₁</text>
            <text x={focusRight.x + 8} y={focusRight.y - 13} textAnchor="middle">F₂</text>
          </g>
        )}

        {appearance.showIndividualDistances && appearance.showHelperLines && (
          <g fill={textColor} fontSize={13 * appearance.fontScale} fontWeight="650">
            <text className="distance-label" x={leftLabel.x} y={leftLabel.y - 10} textAnchor="middle">
              {snapshot.distanceLeft.toFixed(2)}
            </text>
            <text className="distance-label" x={rightLabel.x} y={rightLabel.y - 10} textAnchor="middle">
              {snapshot.distanceRight.toFixed(2)}
            </text>
          </g>
        )}

        <circle
          className="draggable-point"
          cx={point.x}
          cy={point.y}
          r={appearance.pointRadius + (dragging ? 2 : 0)}
          fill={appearance.pointColor}
          stroke={dark ? '#17212B' : '#FFFFFF'}
          strokeWidth="3"
          tabIndex={0}
          role="slider"
          aria-label="椭圆上的动点 P"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round((angle * 180) / Math.PI)}
          onPointerDown={handlePointerDown}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
              event.preventDefault()
              onAngleChange(angle - 0.05)
            }
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
              event.preventDefault()
              onAngleChange(angle + 0.05)
            }
          }}
        />

        {appearance.showPointLabel && (
          <text
            x={point.x + 15}
            y={point.y - 14}
            fill={textColor}
            fontSize={15 * appearance.fontScale}
            fontWeight="750"
            pointerEvents="none"
          >
            P
          </text>
        )}
        </svg>
      </div>

      <div className="metric-row" aria-live="polite">
        {appearance.showIndividualDistances && (
          <>
            <div className="metric-card">
              <span>PF₁</span>
              <strong>{snapshot.distanceLeft.toFixed(2)}</strong>
            </div>
            <div className="metric-plus" aria-hidden="true">+</div>
            <div className="metric-card">
              <span>PF₂</span>
              <strong>{snapshot.distanceRight.toFixed(2)}</strong>
            </div>
          </>
        )}
        {appearance.showDistanceSum && (
          <>
            {appearance.showIndividualDistances && <div className="metric-equals" aria-hidden="true">=</div>}
            <div className="metric-card metric-card--sum">
              <span>距离和</span>
              <strong>{snapshot.distanceSum.toFixed(2)}</strong>
              <small>始终等于长轴 {snapshot.majorAxis.toFixed(2)}</small>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
