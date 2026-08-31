import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ellipseAngleFromPoint,
  getEllipseGeometry,
  getEllipseSnapshot,
  pointOnEllipse,
  type Point2D,
} from '../core/ellipse'
import {
  helperLineStyleOf,
  helperLineWidthOf,
  lineDashArray,
  lineWidthOf,
  lineStyleOf,
  objectColorOf,
  objectVisibleOf,
  pointRadiusOf,
  pointSvgAppearance,
} from '../core/appearanceStyles'
import type { LessonScene } from '../types/lessonScene'
import { sceneObjectSelectionProps } from './sceneObjectSelection'
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
  selectedObjectId?: string | null
  onObjectSelect?: (objectId: string) => void
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
  selectedObjectId,
  onObjectSelect,
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
  const ellipseLineWidth = lineWidthOf(appearance, 'ellipse')
  const ellipseLineStyle = lineStyleOf(appearance, 'ellipse')
  const ellipseColor = objectColorOf(appearance, 'ellipse', appearance.curveColor)
  const helperLineWidth = helperLineWidthOf(appearance, 2.25)
  const helperLineStyle = helperLineStyleOf(appearance, 'dashed')
  const pointRadius = pointRadiusOf(appearance, 'point')
  const focusLeftRadius = pointRadiusOf(appearance, 'focusLeft')
  const focusRightRadius = pointRadiusOf(appearance, 'focusRight')
  const pointAppearance = pointSvgAppearance(appearance, appearance.pointColor, background, 'ellipse-point-shadow', 'point')
  const focusLeftAppearance = pointSvgAppearance(appearance, appearance.focusColor, background, 'ellipse-point-shadow', 'focusLeft')
  const focusRightAppearance = pointSvgAppearance(appearance, appearance.focusColor, background, 'ellipse-point-shadow', 'focusRight')

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
    onObjectSelect?.('point')
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
        <defs>
          <filter id="ellipse-point-shadow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0F172A" floodOpacity="0.38" />
          </filter>
        </defs>
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

        {appearance.showTrail && objectVisibleOf(appearance, 'trail') && trailAngles.length > 1 && (
          <polyline
            {...sceneObjectSelectionProps('trail', '运动轨迹', selectedObjectId, onObjectSelect)}
            data-appearance-role="trail"
            points={trailAngles
              .map((trailAngle) => toSvg(pointOnEllipse(geometry, trailAngle)))
              .map((trailPoint) => `${trailPoint.x},${trailPoint.y}`)
              .join(' ')}
            fill="none"
            stroke={objectColorOf(appearance, 'trail', appearance.pointColor)}
            strokeWidth={lineWidthOf(appearance, 'trail')}
            strokeDasharray={lineDashArray(lineStyleOf(appearance, 'trail'), lineWidthOf(appearance, 'trail'))}
            strokeLinecap="round"
            opacity="0.18"
            aria-hidden="true"
          />
        )}

        {objectVisibleOf(appearance, 'ellipse') && <ellipse
          {...sceneObjectSelectionProps('ellipse', '椭圆', selectedObjectId, onObjectSelect)}
          data-appearance-role="main-line"
          cx={origin.x}
          cy={origin.y}
          rx={ellipseRx}
          ry={ellipseRy}
          fill="none"
          stroke={ellipseColor}
          strokeWidth={ellipseLineWidth}
          strokeDasharray={lineDashArray(ellipseLineStyle, ellipseLineWidth)}
          strokeLinecap="round"
        />}

        {appearance.showHelperLines && (
          <g
            data-appearance-role="helper-lines"
            stroke={appearance.helperColor}
            strokeWidth={helperLineWidth}
            strokeDasharray={lineDashArray(helperLineStyle, helperLineWidth)}
            strokeLinecap="round"
          >
            {objectVisibleOf(appearance, 'distanceLeft') && <line
              {...sceneObjectSelectionProps('distanceLeft', '左焦点距离线', selectedObjectId, onObjectSelect)}
              x1={focusLeft.x} y1={focusLeft.y} x2={point.x} y2={point.y}
              stroke={objectColorOf(appearance, 'distanceLeft', appearance.helperColor)}
              strokeWidth={helperLineWidthOf(appearance, 2.25, 'distanceLeft')}
              strokeDasharray={lineDashArray(helperLineStyleOf(appearance, 'dashed', 'distanceLeft'), helperLineWidthOf(appearance, 2.25, 'distanceLeft'))}
            />}
            {objectVisibleOf(appearance, 'distanceRight') && <line
              {...sceneObjectSelectionProps('distanceRight', '右焦点距离线', selectedObjectId, onObjectSelect)}
              x1={focusRight.x} y1={focusRight.y} x2={point.x} y2={point.y}
              stroke={objectColorOf(appearance, 'distanceRight', appearance.helperColor)}
              strokeWidth={helperLineWidthOf(appearance, 2.25, 'distanceRight')}
              strokeDasharray={lineDashArray(helperLineStyleOf(appearance, 'dashed', 'distanceRight'), helperLineWidthOf(appearance, 2.25, 'distanceRight'))}
            />}
          </g>
        )}

        <g data-appearance-role="secondary-points">
          {objectVisibleOf(appearance, 'focusLeft') && <circle
            {...sceneObjectSelectionProps('focusLeft', '左焦点', selectedObjectId, onObjectSelect)}
            cx={focusLeft.x} cy={focusLeft.y} r={Math.max(2, focusLeftRadius - 1)} {...focusLeftAppearance}
          />}
          {objectVisibleOf(appearance, 'focusRight') && <circle
            {...sceneObjectSelectionProps('focusRight', '右焦点', selectedObjectId, onObjectSelect)}
            cx={focusRight.x} cy={focusRight.y} r={Math.max(2, focusRightRadius - 1)} {...focusRightAppearance}
          />}
        </g>

        {appearance.showFocusLabels && (
          <g fill={textColor} fontSize={14 * appearance.fontScale} fontWeight="650">
            {objectVisibleOf(appearance, 'focusLeft') && <text x={focusLeft.x - focusLeftRadius} y={focusLeft.y - focusLeftRadius - 6} textAnchor="middle">F₁</text>}
            {objectVisibleOf(appearance, 'focusRight') && <text x={focusRight.x + focusRightRadius} y={focusRight.y - focusRightRadius - 6} textAnchor="middle">F₂</text>}
          </g>
        )}

        {appearance.showIndividualDistances && appearance.showHelperLines && (
          <g fill={textColor} fontSize={13 * appearance.fontScale} fontWeight="650">
            {objectVisibleOf(appearance, 'distanceLeft') && <text className="distance-label" x={leftLabel.x} y={leftLabel.y - 10} textAnchor="middle">
              {snapshot.distanceLeft.toFixed(2)}
            </text>}
            {objectVisibleOf(appearance, 'distanceRight') && <text className="distance-label" x={rightLabel.x} y={rightLabel.y - 10} textAnchor="middle">
              {snapshot.distanceRight.toFixed(2)}
            </text>}
          </g>
        )}

        {objectVisibleOf(appearance, 'point') && <circle
          {...sceneObjectSelectionProps('point', '椭圆动点', selectedObjectId, onObjectSelect, 'draggable-point')}
          data-appearance-role="primary-point"
          cx={point.x}
          cy={point.y}
          r={pointRadius + (dragging ? 2 : 0)}
          {...pointAppearance}
          tabIndex={0}
          role="slider"
          aria-label="椭圆上的动点 P"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round((angle * 180) / Math.PI)}
          onPointerDown={handlePointerDown}
          onKeyDown={(event) => {
            onObjectSelect?.('point')
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
              event.preventDefault()
              onAngleChange(angle - 0.05)
            }
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
              event.preventDefault()
              onAngleChange(angle + 0.05)
            }
          }}
        />}

        {appearance.showPointLabel && objectVisibleOf(appearance, 'point') && (
          <text
            x={point.x + pointRadius + 8}
            y={point.y - pointRadius - 7}
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
