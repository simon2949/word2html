import { useMemo, useState, type PointerEvent } from 'react'
import {
  createTimeExperimentRuntime,
  nearestTimeOnTrajectory,
  type TimeTraceSnapStep,
} from '../core/timeExperiment'
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
import { defaultObjectColor } from '../core/objectAppearance'
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

interface TimeExperimentCanvasProps {
  scene: LessonScene
  time: number
  zoom: number
  selectedObjectId?: string | null
  onObjectSelect?: (objectId: string) => void
  onTimeChange?: (time: number) => void
}

const SVG_WIDTH = 900
const SVG_HEIGHT = 590
const PADDING = 24

function springPolyline(
  start: { x: number; y: number },
  end: { x: number; y: number },
): string {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length < 2) return `${start.x},${start.y} ${end.x},${end.y}`
  const ux = dx / length
  const uy = dy / length
  const px = -uy
  const py = ux
  const lead = Math.min(14, length * 0.16)
  const amplitude = Math.min(8, Math.max(3, length * 0.055))
  const turns = Math.max(5, Math.min(12, Math.round(length / 18)))
  const points = [start, { x: start.x + ux * lead, y: start.y + uy * lead }]
  for (let index = 1; index < turns * 2; index += 1) {
    const distance = lead + (length - lead * 2) * index / (turns * 2)
    const offset = index % 2 === 0 ? -amplitude : amplitude
    points.push({
      x: start.x + ux * distance + px * offset,
      y: start.y + uy * distance + py * offset,
    })
  }
  points.push({ x: end.x - ux * lead, y: end.y - uy * lead }, end)
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
}

export function TimeExperimentCanvas({
  scene,
  time,
  zoom,
  selectedObjectId,
  onObjectSelect,
  onTimeChange,
}: TimeExperimentCanvasProps) {
  const runtime = useMemo(() => createTimeExperimentRuntime(scene), [scene])
  const [snapStep, setSnapStep] = useState<TimeTraceSnapStep>(0.5)
  const [draggingBodyId, setDraggingBodyId] = useState<string | null>(null)
  const [snappedAxis, setSnappedAxis] = useState<'x' | 'y' | null>(null)
  const snapshot = useMemo(() => runtime.snapshot(time), [runtime, time])
  const trailSamples = useMemo(
    () => snapshot.time > 0 ? runtime.sampleBodies(snapshot.time, 181) : [],
    [runtime, snapshot.time],
  )
  const effectiveViewport = useMemo(() => zoomViewport(scene.viewport, zoom), [scene.viewport, zoom])
  const transform = useMemo(
    () => createPlotTransform(effectiveViewport, SVG_WIDTH, SVG_HEIGHT, PADDING),
    [effectiveViewport],
  )
  const { appearance } = scene
  const { scale, xOffset, yOffset, contentWidth, contentHeight, viewport, toSvg, fromSvg } = transform
  const origin = toSvg({ x: 0, y: 0 })
  const dark = appearance.theme === 'dark'
  const background = dark ? '#17212B' : '#FBFCFE'
  const gridColor = dark ? '#2D3B47' : '#E7EAF0'
  const axisColor = dark ? '#7D8D9C' : '#9AA3AE'
  const textColor = dark ? '#E8EEF3' : '#36404A'
  const sceneObjectById = new Map(scene.objects.map((object) => [object.id, object]))
  const defaultColor = (objectId: string, fallback: string): string => {
    const object = sceneObjectById.get(objectId)
    return object ? defaultObjectColor(scene, object) : fallback
  }
  const bodies = snapshot.bodies.map((body) => {
    const objectId = `body.${body.id}`
    const trailObjectId = `trail.${body.id}`
    const color = objectColorOf(appearance, objectId, defaultColor(objectId, appearance.pointColor))
    return {
      ...body,
      objectId,
      point: toSvg(body),
      color,
      radius: pointRadiusOf(appearance, objectId),
      pointAppearance: pointSvgAppearance(appearance, color, background, 'time-experiment-point-shadow', objectId),
      trailObjectId,
      trailColor: objectColorOf(appearance, trailObjectId, defaultColor(trailObjectId, appearance.curveColor)),
    }
  })
  const gridStep = squareGridStep(scale)
  const gridX = coordinateTicks(viewport.xMin, viewport.xMax, gridStep)
  const gridY = coordinateTicks(viewport.yMin, viewport.yMax, gridStep)
  const tickLabelStride = labelStride(gridStep, scale)
  const showXAxis = viewport.yMin <= 0 && viewport.yMax >= 0
  const showYAxis = viewport.xMin <= 0 && viewport.xMax >= 0
  const traceInteractive = scene.metadata.subject === 'math' && Boolean(onTimeChange)
  const movingBodyIds = useMemo(() => {
    if (!traceInteractive) return new Set<string>()
    const samples = runtime.sampleBodies(runtime.duration, 9)
    return new Set(samples[0]!.bodies.filter((body) => samples.slice(1).some((sample) => {
      const candidate = sample.bodies.find((item) => item.id === body.id)
      return candidate && Math.hypot(candidate.x - body.x, candidate.y - body.y) > 1e-7
    })).map((body) => body.id))
  }, [runtime, traceInteractive])
  const trails = bodies.map((body) => ({
    id: body.id,
    objectId: body.trailObjectId,
    color: body.trailColor,
    visible: objectVisibleOf(appearance, body.trailObjectId),
    width: lineWidthOf(appearance, body.trailObjectId),
    style: lineStyleOf(appearance, body.trailObjectId),
    points: trailSamples.map((sample) => {
      const state = sample.bodies.find((item) => item.id === body.id)
      if (!state) return ''
      const point = toSvg(state)
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`
    }).filter(Boolean).join(' '),
  }))
  const vectors = snapshot.vectors.map((vector, index) => {
    const objectId = `vector.${vector.id}`
    const anchorBody = bodies.find((body) => body.id === vector.bodyId) ?? bodies[0]!
    const anchor = anchorBody.point
    const rawTip = toSvg({
      x: anchorBody.x + vector.x * vector.scale,
      y: anchorBody.y + vector.y * vector.scale,
    })
    const rawDx = rawTip.x - anchor.x
    const rawDy = rawTip.y - anchor.y
    const rawLength = Math.hypot(rawDx, rawDy)
    if (rawLength < 0.75) return null
    const isDistance = vector.display === 'distance'
    const displayLength = isDistance ? rawLength : Math.min(rawLength, 130)
    const ux = rawDx / rawLength
    const uy = rawDy / rawLength
    const tip = { x: anchor.x + ux * displayLength, y: anchor.y + uy * displayLength }
    const headLength = Math.min(12, Math.max(8, displayLength * 0.22))
    const headWidth = headLength * 0.48
    const base = { x: tip.x - ux * headLength, y: tip.y - uy * headLength }
    const perpendicular = { x: -uy, y: ux }
    const color = objectColorOf(appearance, objectId, defaultColor(objectId, appearance.helperColor))
    const labelBase = isDistance
      ? { x: (anchor.x + tip.x) / 2, y: (anchor.y + tip.y) / 2 }
      : tip
    return {
      ...vector,
      objectId,
      isDistance,
      displayLabel: vector.labelMode === 'value'
        ? vector.magnitude.toFixed(2)
        : [vector.label, vector.magnitude.toFixed(2), vector.unit].filter(Boolean).join(' '),
      color,
      visible: objectVisibleOf(appearance, objectId),
      width: helperLineWidthOf(appearance, 3, objectId),
      style: helperLineStyleOf(appearance, 'solid', objectId),
      anchor,
      tip,
      head: `${tip.x},${tip.y} ${base.x + perpendicular.x * headWidth},${base.y + perpendicular.y * headWidth} ${base.x - perpendicular.x * headWidth},${base.y - perpendicular.y * headWidth}`,
      labelX: Math.min(SVG_WIDTH - 10, Math.max(10, labelBase.x + perpendicular.x * (16 + index * 4))),
      labelY: Math.min(SVG_HEIGHT - 8, Math.max(15, labelBase.y + perpendicular.y * (16 + index * 4))),
      textAnchor: perpendicular.x < -0.2 ? 'end' as const : 'start' as const,
    }
  }).filter((vector): vector is NonNullable<typeof vector> => vector !== null)
  const constraints = snapshot.constraints.map((constraint, index) => {
    const objectId = `constraint.${constraint.id}`
    const anchor = toSvg({ x: constraint.anchorX, y: constraint.anchorY })
    const body = toSvg({ x: constraint.bodyX, y: constraint.bodyY })
    const dx = body.x - anchor.x
    const dy = body.y - anchor.y
    const length = Math.hypot(dx, dy)
    const perpendicular = length > 0 ? { x: -dy / length, y: dx / length } : { x: 0, y: -1 }
    const color = objectColorOf(appearance, objectId, defaultColor(objectId, appearance.helperColor))
    return {
      ...constraint,
      objectId,
      anchor,
      body,
      color,
      visible: objectVisibleOf(appearance, objectId),
      width: helperLineWidthOf(appearance, 3, objectId),
      style: helperLineStyleOf(appearance, 'solid', objectId),
      anchorAppearance: pointSvgAppearance(appearance, color, background, 'time-experiment-point-shadow'),
      points: springPolyline(anchor, body),
      labelX: Math.min(SVG_WIDTH - 10, Math.max(10, (anchor.x + body.x) / 2 + perpendicular.x * (15 + index * 3))),
      labelY: Math.min(SVG_HEIGHT - 8, Math.max(15, (anchor.y + body.y) / 2 + perpendicular.y * (15 + index * 3))),
      textAnchor: perpendicular.x < -0.2 ? 'end' as const : 'start' as const,
    }
  })

  const pointerCoordinates = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return fromSvg({
      x: (event.clientX - rect.left) / rect.width * SVG_WIDTH,
      y: (event.clientY - rect.top) / rect.height * SVG_HEIGHT,
    })
  }

  return (
    <div className="canvas-stack" data-theme={appearance.theme}>
      {traceInteractive && <div className="geometry-drag-tools time-trace-drag-tools" aria-label="参数轨迹拖点辅助">
        <label>
          <span>坐标吸附</span>
          <select aria-label="轨迹坐标吸附" value={snapStep} onChange={(event) => {
            setSnapStep(Number(event.target.value) as TimeTraceSnapStep)
            setSnappedAxis(null)
          }}>
            <option value={0}>关闭</option>
            <option value={0.1}>0.1 单位</option>
            <option value={0.5}>0.5 单位</option>
            <option value={1}>1 单位</option>
          </select>
        </label>
        <small>拖动后动点的 x 或 y 坐标吸附到所选网格；关联动点同步更新。{snappedAxis ? `当前吸附 ${snappedAxis} 坐标。` : ''}</small>
      </div>}
      <div className="canvas-shell" data-theme={appearance.theme}>
        <svg
          className="time-experiment-canvas"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          role="img"
          aria-label={`${scene.metadata.title}。当前时间 ${snapshot.time.toFixed(2)} 秒`}
          data-time-trace-snap-step={traceInteractive ? snapStep : undefined}
          data-time-trace-snap-axis={traceInteractive ? snappedAxis ?? '' : undefined}
          data-time-trace-dragging-body={draggingBodyId ?? undefined}
          onPointerMove={(event) => {
            if (!draggingBodyId || !onTimeChange) return
            const target = pointerCoordinates(event)
            const result = nearestTimeOnTrajectory(runtime, draggingBodyId, target, snapStep, 361)
            setSnappedAxis(result.snappedAxis)
            onTimeChange(result.time)
          }}
          onPointerUp={(event) => {
            if (draggingBodyId) event.currentTarget.releasePointerCapture(event.pointerId)
            setDraggingBodyId(null)
          }}
          onPointerCancel={() => setDraggingBodyId(null)}
        >
          <title>{scene.metadata.title}</title>
          <defs>
            <clipPath id="time-experiment-plot-clip">
              <rect x={xOffset} y={yOffset} width={contentWidth} height={contentHeight} />
            </clipPath>
            <filter id="time-experiment-point-shadow" x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0F172A" floodOpacity="0.38" />
            </filter>
          </defs>
          <rect width={SVG_WIDTH} height={SVG_HEIGHT} rx="22" fill={background} />

          {appearance.showGrid && (
            <g aria-hidden="true">
              {gridX.map((value) => {
                const x = toSvg({ x: value, y: 0 }).x
                return <line key={`gx-${value}`} x1={x} x2={x} y1={yOffset} y2={yOffset + contentHeight} stroke={gridColor} />
              })}
              {gridY.map((value) => {
                const y = toSvg({ x: 0, y: value }).y
                return <line key={`gy-${value}`} x1={xOffset} x2={xOffset + contentWidth} y1={y} y2={y} stroke={gridColor} />
              })}
            </g>
          )}

          {appearance.showAxes && (
            <g aria-hidden="true">
              <g stroke={axisColor} strokeWidth="1.5">
                {showXAxis && <line x1={xOffset} x2={xOffset + contentWidth} y1={origin.y} y2={origin.y} />}
                {showYAxis && <line x1={origin.x} x2={origin.x} y1={yOffset} y2={yOffset + contentHeight} />}
              </g>
              <g className="axis-tick-labels" fill={axisColor} fontSize={11 * appearance.fontScale}>
                {showXAxis && gridX.map((value, index) => value !== 0 && index % tickLabelStride === 0 ? (
                  <text key={`xl-${value}`} x={toSvg({ x: value, y: 0 }).x} y={origin.y + 17} textAnchor="middle">
                    {formatCoordinate(value, gridStep)}
                  </text>
                ) : null)}
                {showYAxis && gridY.map((value, index) => value !== 0 && index % tickLabelStride === 0 ? (
                  <text key={`yl-${value}`} x={origin.x - 9} y={toSvg({ x: 0, y: value }).y + 4} textAnchor="end">
                    {formatCoordinate(value, gridStep)}
                  </text>
                ) : null)}
                {showXAxis && showYAxis && <text x={origin.x - 7} y={origin.y + 16} textAnchor="end">0</text>}
                {showXAxis && <text x={xOffset + contentWidth - 5} y={origin.y - 10} textAnchor="end" fontWeight="700">x / m</text>}
                {showYAxis && <text x={origin.x + 10} y={yOffset + 13} fontWeight="700">y / m</text>}
              </g>
            </g>
          )}

          <g clipPath="url(#time-experiment-plot-clip)">
            {showXAxis && objectVisibleOf(appearance, 'ground') && (
              <line
                {...sceneObjectSelectionProps('ground', '地面或基准线', selectedObjectId, onObjectSelect)}
                data-appearance-role="helper-line"
                x1={xOffset} x2={xOffset + contentWidth} y1={origin.y} y2={origin.y}
                stroke={objectColorOf(appearance, 'ground', appearance.helperColor)}
                strokeWidth={helperLineWidthOf(appearance, 3, 'ground')} opacity="0.72"
                strokeDasharray={lineDashArray(helperLineStyleOf(appearance, 'solid', 'ground'), helperLineWidthOf(appearance, 3, 'ground'))} strokeLinecap="round"
              />
            )}
            {appearance.showTrail && trailSamples.length > 1 && trails.filter((trail) => trail.visible).map((trail) => (
              <polyline
                {...sceneObjectSelectionProps(trail.objectId, `${trail.id} 的运动轨迹`, selectedObjectId, onObjectSelect)}
                data-appearance-role="main-line"
                key={trail.id} points={trail.points} fill="none" stroke={trail.color}
                strokeWidth={trail.width} strokeLinecap="round" opacity="0.48"
                strokeDasharray={lineDashArray(trail.style, trail.width)}
              />
            ))}
            {appearance.showHelperLines && constraints.filter((constraint) => constraint.visible).map((constraint) => (
              <g key={constraint.id} data-constraint-id={constraint.id}>
                {constraint.type === 'spring' ? (
                  <polyline
                    {...sceneObjectSelectionProps(constraint.objectId, constraint.label, selectedObjectId, onObjectSelect)}
                    data-appearance-role="helper-line"
                    points={constraint.points} fill="none" stroke={constraint.color}
                    strokeWidth={constraint.width} strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray={lineDashArray(constraint.style, constraint.width)}
                  />
                ) : (
                  <line
                    {...sceneObjectSelectionProps(constraint.objectId, constraint.label, selectedObjectId, onObjectSelect)}
                    data-appearance-role="helper-line"
                    x1={constraint.anchor.x} y1={constraint.anchor.y}
                    x2={constraint.body.x} y2={constraint.body.y}
                    stroke={constraint.color} strokeWidth={constraint.width} strokeLinecap="round"
                    strokeDasharray={lineDashArray(constraint.style, constraint.width)}
                  />
                )}
                <circle
                  {...sceneObjectSelectionProps(constraint.objectId, `${constraint.label}固定点`, selectedObjectId, onObjectSelect)}
                  data-appearance-role="secondary-point"
                  cx={constraint.anchor.x} cy={constraint.anchor.y}
                  r={Math.max(3, appearance.pointRadius * 0.65)}
                  {...constraint.anchorAppearance}
                />
              </g>
            ))}
            {appearance.showHelperLines && vectors.filter((vector) => vector.visible).map((vector) => (
              <g key={vector.id} data-vector-display={vector.isDistance ? 'distance' : 'arrow'}>
                <line
                  {...sceneObjectSelectionProps(vector.objectId, vector.label, selectedObjectId, onObjectSelect)}
                  data-appearance-role="helper-line"
                  x1={vector.anchor.x} y1={vector.anchor.y} x2={vector.tip.x} y2={vector.tip.y}
                  stroke={vector.color} strokeWidth={vector.width} strokeLinecap="round"
                  strokeDasharray={lineDashArray(vector.style, vector.width)}
                />
                {!vector.isDistance && <polygon
                  {...sceneObjectSelectionProps(vector.objectId, `${vector.label}箭头`, selectedObjectId, onObjectSelect)}
                  points={vector.head} fill={vector.color}
                />}
              </g>
            ))}
            {bodies.filter((body) => objectVisibleOf(appearance, body.objectId)).map((body) => (
              <circle
                {...sceneObjectSelectionProps(body.objectId, body.label, selectedObjectId, onObjectSelect)}
                data-appearance-role="primary-point"
                key={body.id} data-body-id={body.id}
                data-trace-draggable={movingBodyIds.has(body.id) ? 'true' : 'false'}
                data-world-x={body.x}
                data-world-y={body.y}
                cx={body.point.x} cy={body.point.y} r={body.radius}
                {...body.pointAppearance}
                style={{ cursor: movingBodyIds.has(body.id) ? 'grab' : 'pointer', touchAction: 'none' }}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  onObjectSelect?.(body.objectId)
                  if (!movingBodyIds.has(body.id) || !onTimeChange) return
                  event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId)
                  onTimeChange(snapshot.time)
                  setDraggingBodyId(body.id)
                }}
              />
            ))}
          </g>

          {appearance.showHelperLines && vectors.filter((vector) => vector.visible).map((vector) => (
            <text
              key={`label-${vector.id}`} x={vector.labelX} y={vector.labelY}
              fill={vector.color} fontSize={12 * appearance.fontScale}
              fontWeight="750" textAnchor={vector.textAnchor}
            >
              {vector.displayLabel}
            </text>
          ))}

          {appearance.showHelperLines && constraints.filter((constraint) => constraint.visible).map((constraint) => (
            <text
              key={`constraint-label-${constraint.id}`}
              x={constraint.labelX} y={constraint.labelY}
              fill={constraint.color} fontSize={12 * appearance.fontScale}
              fontWeight="750" textAnchor={constraint.textAnchor}
            >
              {constraint.label} L={constraint.currentLength.toFixed(2)} m
            </text>
          ))}

          {appearance.showPointLabel && bodies.filter((body) => objectVisibleOf(appearance, body.objectId)).map((body, index) => (
            <text
              key={`body-label-${body.id}`}
              x={body.point.x + body.radius + 8}
              y={body.point.y - body.radius - 7 - index * 3}
              fill={body.color || textColor} fontSize={14 * appearance.fontScale} fontWeight="750"
            >
              {body.label}({body.x.toFixed(2)}, {body.y.toFixed(2)})
            </text>
          ))}
        </svg>
      </div>

      <div className="metric-row experiment-metrics" aria-live="polite">
        <div className="metric-card metric-card--sum">
          <span>时间</span>
          <strong>{snapshot.time.toFixed(2)} s</strong>
          <small>总时长 {snapshot.duration.toFixed(2)} s</small>
        </div>
        {snapshot.metrics.map((metric) => (
          <div className="metric-card" key={metric.id}>
            <span>{metric.label}</span>
            <strong>{metric.value.toFixed(2)} {metric.unit}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
