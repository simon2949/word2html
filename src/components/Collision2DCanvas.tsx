import { useMemo } from 'react'
import { createCollision2DRuntime } from '../core/collision2d'
import {
  lineDashArray,
  lineStyleOf,
  lineWidthOf,
  objectColorOf,
  objectVisibleOf,
} from '../core/appearanceStyles'
import { defaultObjectColor } from '../core/objectAppearance'
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

interface Collision2DCanvasProps {
  scene: LessonScene
  time: number
  zoom: number
  selectedObjectId?: string | null
  onObjectSelect?: (objectId: string) => void
}

const SVG_WIDTH = 900
const SVG_HEIGHT = 590
const PADDING = 24

export function Collision2DCanvas({
  scene,
  time,
  zoom,
  selectedObjectId,
  onObjectSelect,
}: Collision2DCanvasProps) {
  const runtime = useMemo(() => createCollision2DRuntime(scene), [scene])
  const snapshot = useMemo(() => runtime.snapshot(time), [runtime, time])
  const trailSamples = useMemo(
    () => snapshot.time > 0 ? runtime.samples(snapshot.time, 151) : [],
    [runtime, snapshot.time],
  )
  const effectiveViewport = useMemo(() => zoomViewport(scene.viewport, zoom), [scene.viewport, zoom])
  const transform = useMemo(
    () => createPlotTransform(effectiveViewport, SVG_WIDTH, SVG_HEIGHT, PADDING),
    [effectiveViewport],
  )
  const { appearance } = scene
  const { scale, xOffset, yOffset, contentWidth, contentHeight, viewport, toSvg } = transform
  const dark = appearance.theme === 'dark'
  const background = dark ? '#17212B' : '#FBFCFE'
  const gridColor = dark ? '#2D3B47' : '#E7EAF0'
  const axisColor = dark ? '#7D8D9C' : '#9AA3AE'
  const textColor = dark ? '#E8EEF3' : '#36404A'
  const origin = toSvg({ x: 0, y: 0 })
  const gridStep = squareGridStep(scale)
  const gridX = coordinateTicks(viewport.xMin, viewport.xMax, gridStep)
  const gridY = coordinateTicks(viewport.yMin, viewport.yMax, gridStep)
  const tickStride = labelStride(gridStep, scale)
  const showXAxis = viewport.yMin <= 0 && viewport.yMax >= 0
  const showYAxis = viewport.xMin <= 0 && viewport.xMax >= 0
  const objects = new Map(scene.objects.map((object) => [object.id, object]))
  const surfaceObject = objects.get('contactSurface')
  const surfaceColor = surfaceObject ? defaultObjectColor(scene, surfaceObject) : appearance.helperColor
  const surfaceWidth = lineWidthOf(appearance, 'contactSurface', appearance.helperLineWidth)
  const surfaceTopLeft = toSvg({ x: runtime.bounds.xMin, y: runtime.bounds.yMax })
  const surfaceBottomRight = toSvg({ x: runtime.bounds.xMax, y: runtime.bounds.yMin })
  const bodies = snapshot.bodies.map((body) => {
    const objectId = `collisionBody.${body.id}`
    const object = objects.get(objectId)
    const color = objectColorOf(
      appearance,
      objectId,
      object ? defaultObjectColor(scene, object) : appearance.pointColor,
    )
    return { ...body, objectId, color, point: toSvg(body) }
  })

  return (
    <div className="canvas-stack" data-theme={appearance.theme}>
      <div className="canvas-shell" data-theme={appearance.theme}>
        <svg
          className="collision-2d-canvas"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          role="img"
          aria-label={`${scene.metadata.title}。当前时间 ${snapshot.time.toFixed(2)} 秒，累计接触 ${snapshot.collisionCount} 次`}
        >
          <title>{scene.metadata.title}</title>
          <defs>
            <clipPath id="collision-2d-plot-clip">
              <rect x={xOffset} y={yOffset} width={contentWidth} height={contentHeight} />
            </clipPath>
            <marker id="collision-2d-velocity-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 9 4.5 L 0 9 z" fill="context-stroke" />
            </marker>
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
              {showXAxis && <text x={xOffset + contentWidth - 5} y={origin.y - 10} textAnchor="end" fontWeight="700">x / m</text>}
              {showYAxis && <text x={origin.x + 10} y={yOffset + 13} fontWeight="700">y / m</text>}
            </g>
          </g>}

          <g clipPath="url(#collision-2d-plot-clip)">
            {surfaceObject && objectVisibleOf(appearance, surfaceObject.id) && <rect
              {...sceneObjectSelectionProps(surfaceObject.id, surfaceObject.label ?? surfaceObject.role, selectedObjectId, onObjectSelect)}
              x={surfaceTopLeft.x}
              y={surfaceTopLeft.y}
              width={surfaceBottomRight.x - surfaceTopLeft.x}
              height={surfaceBottomRight.y - surfaceTopLeft.y}
              rx="5"
              fill={surfaceColor}
              fillOpacity=".035"
              stroke={objectColorOf(appearance, surfaceObject.id, surfaceColor)}
              strokeWidth={surfaceWidth}
              strokeDasharray={lineDashArray(lineStyleOf(appearance, surfaceObject.id), surfaceWidth)}
            />}

            {appearance.showTrail && trailSamples.length > 1 && bodies.map((body) => {
              if (!objectVisibleOf(appearance, body.objectId)) return null
              const points = trailSamples.map((sample) => {
                const state = sample.bodies.find((item) => item.id === body.id)
                if (!state) return ''
                const point = toSvg(state)
                return `${point.x.toFixed(2)},${point.y.toFixed(2)}`
              }).filter(Boolean).join(' ')
              return <polyline key={`trail-${body.id}`} points={points} fill="none" stroke={body.color} strokeWidth={Math.max(1.25, lineWidthOf(appearance, body.objectId) * 0.65)} strokeLinecap="round" opacity=".38" />
            })}

            {appearance.showHelperLines && bodies.map((body) => {
              if (!objectVisibleOf(appearance, body.objectId)) return null
              const speed = Math.hypot(body.vx, body.vy)
              if (speed < 1e-6) return null
              const vectorScale = Math.min(1.2, 2.8 / speed)
              const tip = toSvg({ x: body.x + body.vx * vectorScale, y: body.y + body.vy * vectorScale })
              return <line
                key={`velocity-${body.id}`}
                x1={body.point.x} y1={body.point.y} x2={tip.x} y2={tip.y}
                stroke={body.color} strokeWidth={Math.max(1.5, (appearance.helperLineWidth ?? 2.25) * 0.8)}
                strokeLinecap="round" markerEnd="url(#collision-2d-velocity-arrow)" opacity=".9"
              />
            })}

            {bodies.map((body) => {
              if (!objectVisibleOf(appearance, body.objectId)) return null
              const width = lineWidthOf(appearance, body.objectId)
              return <circle
                key={body.id}
                {...sceneObjectSelectionProps(body.objectId, body.label, selectedObjectId, onObjectSelect)}
                data-body-id={body.id}
                cx={body.point.x} cy={body.point.y} r={body.radius * scale}
                fill={body.color} fillOpacity=".82"
                stroke={dark ? '#F8FAFC' : '#FFFFFF'} strokeWidth={width}
                strokeDasharray={lineDashArray(lineStyleOf(appearance, body.objectId), width)}
              />
            })}
          </g>

          {appearance.showPointLabel && bodies.map((body) => objectVisibleOf(appearance, body.objectId) ? <text
            key={`label-${body.id}`}
            x={body.point.x + body.radius * scale + 7}
            y={body.point.y - body.radius * scale - 6}
            fill={body.color || textColor}
            fontSize={13 * appearance.fontScale}
            fontWeight="750"
          >{body.label} · m={Number(body.mass.toFixed(2))}</text> : null)}
        </svg>
      </div>

      <div className="metric-row experiment-metrics" aria-live="polite">
        <div className="metric-card metric-card--sum">
          <span>时间</span>
          <strong>{snapshot.time.toFixed(2)} s</strong>
          <small>总时长 {snapshot.duration.toFixed(2)} s</small>
        </div>
        <div className="metric-card"><span>累计接触</span><strong>{snapshot.collisionCount}</strong></div>
        <div className="metric-card"><span>总动能</span><strong>{snapshot.kineticEnergy.toFixed(2)} J</strong></div>
        <div className="metric-card"><span>总动量</span><strong>({snapshot.momentumX.toFixed(2)}, {snapshot.momentumY.toFixed(2)})</strong></div>
      </div>
    </div>
  )
}
