import { useMemo, useRef, useState, type PointerEvent } from 'react'
import {
  applyGeometryDragAssists,
  evaluateGeometry2D,
  getGeometry2DSpec,
  sampleGeometryLoci,
  type GeometryAxisLock,
  type GeometryPointState,
  type GeometrySnapStep,
} from '../core/geometry2d'
import {
  helperLineStyleOf,
  helperLineWidthOf,
  lineDashArray,
  lineStyleOf,
  lineWidthOf,
  objectColorOf,
  objectStyleOf,
  objectVisibleOf,
  pointRadiusOf,
  pointSvgAppearance,
} from '../core/appearanceStyles'
import {
  coordinateTicks,
  createPlotTransform,
  formatCoordinate,
  labelStride,
  squareGridStep,
  zoomViewport,
  type PlotViewport,
} from '../core/viewport'
import type { LessonScene } from '../types/lessonScene'
import { layoutGeometryLabels } from './geometryLabelLayout'
import { sceneObjectSelectionProps } from './sceneObjectSelection'

interface Geometry2DCanvasProps {
  scene: LessonScene
  zoom: number
  selectedObjectId?: string | null
  onObjectSelect?: (objectId: string) => void
  onPointChange?: (pointId: string, x: number, y: number) => void
}

const SVG_WIDTH = 900
const SVG_HEIGHT = 590
const PADDING = 24

function pointById(points: GeometryPointState[], id: string): GeometryPointState {
  const point = points.find((candidate) => candidate.id === id)
  if (!point) throw new Error(`几何点不存在：${id}`)
  return point
}

function rayEndpoint(
  from: GeometryPointState,
  through: GeometryPointState,
  viewport: PlotViewport,
): GeometryPointState {
  const dx = through.x - from.x
  const dy = through.y - from.y
  const candidates: number[] = []
  if (Math.abs(dx) > 1e-10) {
    candidates.push((viewport.xMin - from.x) / dx, (viewport.xMax - from.x) / dx)
  }
  if (Math.abs(dy) > 1e-10) {
    candidates.push((viewport.yMin - from.y) / dy, (viewport.yMax - from.y) / dy)
  }
  const t = candidates
    .filter((value) => value > 1 && Number.isFinite(value))
    .filter((value) => {
      const x = from.x + dx * value
      const y = from.y + dy * value
      return x >= viewport.xMin - 1e-7 && x <= viewport.xMax + 1e-7
        && y >= viewport.yMin - 1e-7 && y <= viewport.yMax + 1e-7
    })
    .sort((left, right) => left - right)[0] ?? 1
  return { ...through, x: from.x + dx * t, y: from.y + dy * t }
}

function measurementAnchor(points: GeometryPointState[]): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 }
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

export function Geometry2DCanvas({
  scene,
  zoom,
  selectedObjectId,
  onObjectSelect,
  onPointChange,
}: Geometry2DCanvasProps) {
  const spec = useMemo(() => getGeometry2DSpec(scene), [scene])
  const snapshot = useMemo(() => evaluateGeometry2D(spec), [spec])
  const loci = useMemo(() => sampleGeometryLoci(spec), [spec])
  const effectiveViewport = useMemo(() => zoomViewport(scene.viewport, zoom), [scene.viewport, zoom])
  const transform = useMemo(
    () => createPlotTransform(effectiveViewport, SVG_WIDTH, SVG_HEIGHT, PADDING),
    [effectiveViewport],
  )
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null)
  const [snapStep, setSnapStep] = useState<GeometrySnapStep>(0.5)
  const [axisLock, setAxisLock] = useState<GeometryAxisLock>('none')
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)
  const { appearance } = scene
  const { scale, xOffset, yOffset, contentWidth, contentHeight, viewport, toSvg, fromSvg } = transform
  const origin = toSvg({ x: 0, y: 0 })
  const gridStep = squareGridStep(scale)
  const gridX = coordinateTicks(viewport.xMin, viewport.xMax, gridStep)
  const gridY = coordinateTicks(viewport.yMin, viewport.yMax, gridStep)
  const tickStride = labelStride(gridStep, scale)
  const dark = appearance.theme === 'dark'
  const background = dark ? '#17212B' : '#FBFCFE'
  const gridColor = dark ? '#2D3B47' : '#E7EAF0'
  const axisColor = dark ? '#7D8D9C' : '#9AA3AE'
  const textColor = dark ? '#D9E2EA' : '#596674'
  const showXAxis = viewport.yMin <= 0 && viewport.yMax >= 0
  const showYAxis = viewport.xMin <= 0 && viewport.xMax >= 0
  const measurementPlacements = useMemo(() => {
    const obstacles = appearance.showPointLabel ? snapshot.points
      .filter((point) => objectVisibleOf(appearance, `point.${point.id}`))
      .map((point) => {
        const position = toSvg(point)
        const radius = pointRadiusOf(appearance, `point.${point.id}`)
        return {
          x: position.x + radius + 4,
          y: position.y - radius - 22 * appearance.fontScale,
          width: Math.max(18, point.label.length * 10 * appearance.fontScale),
          height: 22 * appearance.fontScale,
        }
      }) : []
    const candidates = snapshot.measurements
      .filter((measurement) => objectVisibleOf(appearance, `measurement.${measurement.id}`))
      .map((measurement) => {
        const objectId = `measurement.${measurement.id}`
        const anchor = toSvg(measurementAnchor(measurement.pointIds.map((id) => pointById(snapshot.points, id))))
        const fontScale = objectStyleOf(appearance, objectId).fontScale ?? appearance.fontScale
        const label = `${measurement.label} = ${Number(measurement.value.toFixed(3))}${measurement.unit}`
        return {
          id: measurement.id,
          anchorX: anchor.x,
          anchorY: anchor.y,
          width: Math.max(82, label.length * 8.2 * fontScale),
          height: 25 * fontScale,
        }
      })
    return new Map(layoutGeometryLabels(candidates, {
      x: xOffset + 4,
      y: yOffset + 4,
      width: contentWidth - 8,
      height: contentHeight - 8,
    }, obstacles).map((placement) => [placement.id, placement]))
  }, [appearance, contentHeight, contentWidth, snapshot, toSvg, xOffset, yOffset])

  const pointerCoordinates = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return fromSvg({
      x: (event.clientX - rect.left) / rect.width * SVG_WIDTH,
      y: (event.clientY - rect.top) / rect.height * SVG_HEIGHT,
    })
  }

  return (
    <div className="canvas-stack" data-theme={appearance.theme}>
      <div className="geometry-drag-tools" aria-label="几何拖点辅助">
        <label>
          <span>坐标吸附</span>
          <select aria-label="坐标吸附" value={snapStep} onChange={(event) => setSnapStep(Number(event.target.value) as GeometrySnapStep)}>
            <option value={0}>关闭</option>
            <option value={0.1}>0.1 单位</option>
            <option value={0.5}>0.5 单位</option>
            <option value={1}>1 单位</option>
          </select>
        </label>
        <label>
          <span>坐标锁定</span>
          <select aria-label="坐标锁定" value={axisLock} onChange={(event) => setAxisLock(event.target.value as GeometryAxisLock)}>
            <option value="none">自由拖动</option>
            <option value="x">锁定横坐标</option>
            <option value="y">锁定纵坐标</option>
          </select>
        </label>
        <small>只影响画布拖点；参数输入仍可精确编辑。</small>
      </div>
      <div className="canvas-shell" data-theme={appearance.theme}>
        <svg
          className="geometry-2d-canvas"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          role="img"
          aria-label={`二维几何图：${scene.annotations.formula}`}
          data-geometry-snap-step={snapStep}
          data-geometry-axis-lock={axisLock}
          onPointerMove={(event) => {
            if (!draggingPointId || !onPointChange) return
            const point = pointerCoordinates(event)
            const assisted = applyGeometryDragAssists(point, dragOrigin.current ?? point, snapStep, axisLock)
            onPointChange(draggingPointId, assisted.x, assisted.y)
          }}
          onPointerUp={(event) => {
            if (draggingPointId) event.currentTarget.releasePointerCapture(event.pointerId)
            setDraggingPointId(null)
            dragOrigin.current = null
          }}
          onPointerCancel={() => { setDraggingPointId(null); dragOrigin.current = null }}
        >
          <title>{scene.metadata.title}</title>
          <defs>
            <clipPath id="geometry-2d-plot-clip">
              <rect x={xOffset} y={yOffset} width={contentWidth} height={contentHeight} />
            </clipPath>
            <filter id="geometry-2d-point-shadow" x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#101828" floodOpacity=".28" />
            </filter>
            <marker id="geometry-2d-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
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
              {showXAxis && <text x={xOffset + contentWidth - 5} y={origin.y - 10} textAnchor="end" fontWeight="700">x</text>}
              {showYAxis && <text x={origin.x + 10} y={yOffset + 13} fontWeight="700">y</text>}
            </g>
          </g>}

          <g clipPath="url(#geometry-2d-plot-clip)">
            {appearance.showHelperLines && snapshot.points.map((point) => {
              const constraint = point.constraint
              if (!constraint) return null
              const width = helperLineWidthOf(appearance, 1.75)
              const stroke = appearance.helperColor
              if (constraint.kind === 'circle') {
                const center = pointById(snapshot.points, constraint.centerPointId)
                const centerSvg = toSvg(center)
                const radius = Math.hypot(point.x - center.x, point.y - center.y) * scale
                return <circle key={`guide-${point.id}`} cx={centerSvg.x} cy={centerSvg.y} r={radius} fill="none" stroke={stroke} strokeWidth={width} strokeDasharray={lineDashArray('dashed', width)} opacity=".58" pointerEvents="none" />
              }
              const first = pointById(snapshot.points, constraint.pointAId)
              const second = pointById(snapshot.points, constraint.pointBId)
              const start = constraint.kind === 'segment' ? first : rayEndpoint(second, first, viewport)
              const end = constraint.kind === 'segment' ? second : rayEndpoint(first, second, viewport)
              const startSvg = toSvg(start)
              const endSvg = toSvg(end)
              return <line key={`guide-${point.id}`} x1={startSvg.x} y1={startSvg.y} x2={endSvg.x} y2={endSvg.y} stroke={stroke} strokeWidth={width} strokeDasharray={lineDashArray('dashed', width)} opacity=".58" pointerEvents="none" />
            })}

            {appearance.showTrail && loci.map((locus) => {
              const objectId = `locus.${locus.id}`
              if (!objectVisibleOf(appearance, objectId)) return null
              const width = lineWidthOf(appearance, objectId)
              const path = locus.points.map((point, index) => {
                const mapped = toSvg(point)
                return `${index === 0 ? 'M' : 'L'} ${mapped.x.toFixed(2)} ${mapped.y.toFixed(2)}`
              }).join(' ')
              return <path
                key={locus.id}
                {...sceneObjectSelectionProps(objectId, locus.label, selectedObjectId, onObjectSelect)}
                d={path}
                fill="none"
                stroke={objectColorOf(appearance, objectId, appearance.curveColor)}
                strokeWidth={width}
                strokeDasharray={lineDashArray(lineStyleOf(appearance, objectId), width)}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            })}

            {spec.polygons.map((polygon) => {
              const objectId = `polygon.${polygon.id}`
              if (!objectVisibleOf(appearance, objectId)) return null
              const color = objectColorOf(appearance, objectId, appearance.curveColor)
              const width = lineWidthOf(appearance, objectId)
              const points = polygon.pointIds.map((id) => toSvg(pointById(snapshot.points, id))).map((point) => `${point.x},${point.y}`).join(' ')
              return <polygon
                key={polygon.id}
                {...sceneObjectSelectionProps(objectId, polygon.label, selectedObjectId, onObjectSelect)}
                points={points}
                fill={polygon.filled ? color : 'none'}
                fillOpacity={polygon.filled ? 0.13 : undefined}
                stroke={color}
                strokeWidth={width}
                strokeDasharray={lineDashArray(lineStyleOf(appearance, objectId), width)}
                strokeLinejoin="round"
              />
            })}

            {spec.arcs.map((arc) => {
              const objectId = `arc.${arc.id}`
              if (!objectVisibleOf(appearance, objectId)) return null
              const center = pointById(snapshot.points, arc.centerPointId)
              const startRef = pointById(snapshot.points, arc.startPointId)
              const endRef = pointById(snapshot.points, arc.endPointId)
              const firstRadius = Math.hypot(startRef.x - center.x, startRef.y - center.y)
              const secondRadius = Math.hypot(endRef.x - center.x, endRef.y - center.y)
              const radius = Math.max(0.2, Math.min(firstRadius, secondRadius) * 0.32)
              const firstAngle = Math.atan2(startRef.y - center.y, startRef.x - center.x)
              const secondAngle = Math.atan2(endRef.y - center.y, endRef.x - center.x)
              const start = toSvg({ x: center.x + Math.cos(firstAngle) * radius, y: center.y + Math.sin(firstAngle) * radius })
              const end = toSvg({ x: center.x + Math.cos(secondAngle) * radius, y: center.y + Math.sin(secondAngle) * radius })
              let delta = secondAngle - firstAngle
              if (arc.clockwise && delta > 0) delta -= Math.PI * 2
              if (!arc.clockwise && delta < 0) delta += Math.PI * 2
              const largeArc = Math.abs(delta) > Math.PI ? 1 : 0
              const sweep = arc.clockwise ? 1 : 0
              const width = helperLineWidthOf(appearance, 2.25, objectId)
              return <path
                key={arc.id}
                {...sceneObjectSelectionProps(objectId, arc.label, selectedObjectId, onObjectSelect)}
                d={`M ${start.x} ${start.y} A ${radius * scale} ${radius * scale} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`}
                fill="none"
                stroke={objectColorOf(appearance, objectId, appearance.helperColor)}
                strokeWidth={width}
                strokeDasharray={lineDashArray(helperLineStyleOf(appearance, 'solid', objectId), width)}
                strokeLinecap="round"
              />
            })}

            {spec.connections.map((connection) => {
              const objectId = `connection.${connection.id}`
              if (!objectVisibleOf(appearance, objectId)) return null
              const from = pointById(snapshot.points, connection.fromPointId)
              const through = pointById(snapshot.points, connection.toPointId)
              const to = connection.kind === 'ray' ? rayEndpoint(from, through, viewport) : through
              const start = toSvg(from)
              const end = toSvg(to)
              const width = helperLineWidthOf(appearance, 2.25, objectId)
              return <line
                key={connection.id}
                {...sceneObjectSelectionProps(objectId, connection.label, selectedObjectId, onObjectSelect)}
                x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                stroke={objectColorOf(appearance, objectId, appearance.helperColor)}
                strokeWidth={width}
                strokeDasharray={lineDashArray(helperLineStyleOf(appearance, 'solid', objectId), width)}
                strokeLinecap="round"
                markerEnd={connection.kind === 'vector' || connection.kind === 'ray' ? 'url(#geometry-2d-arrow)' : undefined}
              />
            })}

            {snapshot.measurements.map((measurement) => {
              const objectId = `measurement.${measurement.id}`
              if (!appearance.showHelperLines || !objectVisibleOf(appearance, objectId)) return null
              const placement = measurementPlacements.get(measurement.id)
              if (!placement) return null
              const fontScale = objectStyleOf(appearance, objectId).fontScale ?? appearance.fontScale
              const label = `${measurement.label} = ${Number(measurement.value.toFixed(3))}${measurement.unit}`
              const connectorX = Math.max(placement.x, Math.min(placement.x + placement.width, placement.anchorX))
              const connectorY = Math.max(placement.y, Math.min(placement.y + placement.height, placement.anchorY))
              return <g key={measurement.id} {...sceneObjectSelectionProps(objectId, measurement.label, selectedObjectId, onObjectSelect)}>
                <line x1={placement.anchorX} y1={placement.anchorY} x2={connectorX} y2={connectorY} stroke={objectColorOf(appearance, objectId, appearance.pointColor)} strokeOpacity=".38" strokeWidth="1" pointerEvents="none" />
                <g data-measurement-label="true" data-label-x={placement.x} data-label-y={placement.y} transform={`translate(${placement.x} ${placement.y})`}>
                  <rect x={0} y={0} width={placement.width} height={placement.height} rx={8} fill={dark ? '#273541' : '#FFFFFF'} stroke={objectColorOf(appearance, objectId, appearance.pointColor)} strokeOpacity=".34" />
                  <text x={8} y={17 * fontScale} fill={objectColorOf(appearance, objectId, textColor)} fontSize={11 * fontScale} fontWeight="700">{label}</text>
                </g>
              </g>
            })}

            {snapshot.points.map((point) => {
              const objectId = `point.${point.id}`
              if (!objectVisibleOf(appearance, objectId)) return null
              const position = toSvg(point)
              const radius = pointRadiusOf(appearance, objectId)
              const color = objectColorOf(appearance, objectId, appearance.pointColor)
              const visual = pointSvgAppearance(appearance, color, background, 'geometry-2d-point-shadow', objectId)
              return <g key={point.id}>
                <circle
                  {...sceneObjectSelectionProps(objectId, `点 ${point.label}`, selectedObjectId, onObjectSelect)}
                  cx={position.x} cy={position.y} r={radius}
                  fill={visual.fill} stroke={visual.stroke} strokeWidth={visual.strokeWidth} filter={visual.filter}
                  style={{ cursor: point.draggable && onPointChange ? 'grab' : 'pointer', touchAction: 'none' }}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onObjectSelect?.(objectId)
                    if (!point.draggable || !onPointChange) return
                    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId)
                    dragOrigin.current = { x: point.x, y: point.y }
                    setDraggingPointId(point.id)
                  }}
                />
                {appearance.showPointLabel && <text x={position.x + radius + 7} y={position.y - radius - 5} fill={textColor} fontSize={14 * appearance.fontScale} fontWeight="750" pointerEvents="none">{point.label}</text>}
              </g>
            })}
          </g>
        </svg>
      </div>

      {snapshot.measurements.length > 0 && <div className="metric-row experiment-metrics" aria-live="polite">
        {snapshot.measurements.map((measurement) => <div className="metric-card" key={measurement.id}>
          <span>{measurement.label}</span>
          <strong>{Number(measurement.value.toFixed(3))}{measurement.unit}</strong>
        </div>)}
      </div>}
    </div>
  )
}
