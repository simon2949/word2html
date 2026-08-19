import { useMemo } from 'react'
import {
  createTimeExperimentRuntime,
} from '../core/timeExperiment'
import type { LessonScene } from '../types/lessonScene'
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
}

const SVG_WIDTH = 900
const SVG_HEIGHT = 590
const PADDING = 24
const VECTOR_COLORS = ['#087E8B', '#E08B2D', '#7C3AED', '#D13C64']
const SECONDARY_BODY_COLORS = ['#3B82C4', '#8B5CF6', '#16A085']
const SECONDARY_TRAIL_COLORS = ['#60A5FA', '#A78BFA', '#34D399']

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

export function TimeExperimentCanvas({ scene, time, zoom }: TimeExperimentCanvasProps) {
  const runtime = useMemo(() => createTimeExperimentRuntime(scene), [scene])
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
  const { scale, xOffset, yOffset, contentWidth, contentHeight, viewport, toSvg } = transform
  const origin = toSvg({ x: 0, y: 0 })
  const bodies = snapshot.bodies.map((body, index) => ({
    ...body,
    point: toSvg(body),
    color: index === 0 ? appearance.pointColor : SECONDARY_BODY_COLORS[(index - 1) % SECONDARY_BODY_COLORS.length]!,
    trailColor: index === 0 ? appearance.curveColor : SECONDARY_TRAIL_COLORS[(index - 1) % SECONDARY_TRAIL_COLORS.length]!,
  }))
  const gridStep = squareGridStep(scale)
  const gridX = coordinateTicks(viewport.xMin, viewport.xMax, gridStep)
  const gridY = coordinateTicks(viewport.yMin, viewport.yMax, gridStep)
  const tickLabelStride = labelStride(gridStep, scale)
  const dark = appearance.theme === 'dark'
  const background = dark ? '#17212B' : '#FBFCFE'
  const gridColor = dark ? '#2D3B47' : '#E7EAF0'
  const axisColor = dark ? '#7D8D9C' : '#9AA3AE'
  const textColor = dark ? '#E8EEF3' : '#36404A'
  const showXAxis = viewport.yMin <= 0 && viewport.yMax >= 0
  const showYAxis = viewport.xMin <= 0 && viewport.xMax >= 0
  const trails = bodies.map((body) => ({
    id: body.id,
    color: body.trailColor,
    points: trailSamples.map((sample) => {
      const state = sample.bodies.find((item) => item.id === body.id)
      if (!state) return ''
      const point = toSvg(state)
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`
    }).filter(Boolean).join(' '),
  }))
  const vectors = snapshot.vectors.map((vector, index) => {
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
    const displayLength = Math.min(rawLength, 130)
    const ux = rawDx / rawLength
    const uy = rawDy / rawLength
    const tip = { x: anchor.x + ux * displayLength, y: anchor.y + uy * displayLength }
    const headLength = Math.min(12, Math.max(8, displayLength * 0.22))
    const headWidth = headLength * 0.48
    const base = { x: tip.x - ux * headLength, y: tip.y - uy * headLength }
    const perpendicular = { x: -uy, y: ux }
    const color = VECTOR_COLORS[index % VECTOR_COLORS.length]!
    return {
      ...vector,
      color,
      anchor,
      tip,
      head: `${tip.x},${tip.y} ${base.x + perpendicular.x * headWidth},${base.y + perpendicular.y * headWidth} ${base.x - perpendicular.x * headWidth},${base.y - perpendicular.y * headWidth}`,
      labelX: Math.min(SVG_WIDTH - 10, Math.max(10, tip.x + perpendicular.x * (16 + index * 4))),
      labelY: Math.min(SVG_HEIGHT - 8, Math.max(15, tip.y + perpendicular.y * (16 + index * 4))),
      textAnchor: perpendicular.x < -0.2 ? 'end' as const : 'start' as const,
    }
  }).filter((vector): vector is NonNullable<typeof vector> => vector !== null)
  const constraints = snapshot.constraints.map((constraint, index) => {
    const anchor = toSvg({ x: constraint.anchorX, y: constraint.anchorY })
    const body = toSvg({ x: constraint.bodyX, y: constraint.bodyY })
    const dx = body.x - anchor.x
    const dy = body.y - anchor.y
    const length = Math.hypot(dx, dy)
    const perpendicular = length > 0 ? { x: -dy / length, y: dx / length } : { x: 0, y: -1 }
    const color = constraint.type === 'spring' ? '#D97706' : appearance.helperColor
    return {
      ...constraint,
      anchor,
      body,
      color,
      points: springPolyline(anchor, body),
      labelX: Math.min(SVG_WIDTH - 10, Math.max(10, (anchor.x + body.x) / 2 + perpendicular.x * (15 + index * 3))),
      labelY: Math.min(SVG_HEIGHT - 8, Math.max(15, (anchor.y + body.y) / 2 + perpendicular.y * (15 + index * 3))),
      textAnchor: perpendicular.x < -0.2 ? 'end' as const : 'start' as const,
    }
  })

  return (
    <div className="canvas-stack" data-theme={appearance.theme}>
      <div className="canvas-shell" data-theme={appearance.theme}>
        <svg
          className="time-experiment-canvas"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          role="img"
          aria-label={`${scene.metadata.title}。当前时间 ${snapshot.time.toFixed(2)} 秒`}
        >
          <title>{scene.metadata.title}</title>
          <defs>
            <clipPath id="time-experiment-plot-clip">
              <rect x={xOffset} y={yOffset} width={contentWidth} height={contentHeight} />
            </clipPath>
            {bodies.map((body) => (
              <radialGradient key={body.id} id={`time-experiment-body-${body.id}`} cx="35%" cy="28%" r="72%">
                <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.86" />
                <stop offset="0.24" stopColor={body.color} />
                <stop offset="1" stopColor={body.color} stopOpacity="0.72" />
              </radialGradient>
            ))}
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
            {showXAxis && (
              <line
                x1={xOffset} x2={xOffset + contentWidth} y1={origin.y} y2={origin.y}
                stroke={appearance.helperColor} strokeWidth="5" opacity="0.72"
              />
            )}
            {appearance.showTrail && trailSamples.length > 1 && trails.map((trail) => (
              <polyline
                key={trail.id} points={trail.points} fill="none" stroke={trail.color}
                strokeWidth={appearance.lineWidth} strokeLinecap="round" opacity="0.48"
              />
            ))}
            {appearance.showHelperLines && constraints.map((constraint) => (
              <g key={constraint.id} data-constraint-id={constraint.id}>
                {constraint.type === 'spring' ? (
                  <polyline
                    points={constraint.points} fill="none" stroke={constraint.color}
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  />
                ) : (
                  <line
                    x1={constraint.anchor.x} y1={constraint.anchor.y}
                    x2={constraint.body.x} y2={constraint.body.y}
                    stroke={constraint.color} strokeWidth="3" strokeLinecap="round"
                  />
                )}
                <circle
                  cx={constraint.anchor.x} cy={constraint.anchor.y} r="5"
                  fill={background} stroke={constraint.color} strokeWidth="3"
                />
              </g>
            ))}
            {appearance.showHelperLines && vectors.map((vector) => (
              <g key={vector.id}>
                <line
                  x1={vector.anchor.x} y1={vector.anchor.y} x2={vector.tip.x} y2={vector.tip.y}
                  stroke={vector.color} strokeWidth="3" strokeLinecap="round"
                />
                <polygon points={vector.head} fill={vector.color} />
              </g>
            ))}
            {bodies.map((body) => (
              <circle
                key={body.id} data-body-id={body.id}
                cx={body.point.x} cy={body.point.y} r={appearance.pointRadius + 3}
                fill={`url(#time-experiment-body-${body.id})`}
                stroke={dark ? '#17212B' : '#FFFFFF'} strokeWidth="3"
              />
            ))}
          </g>

          {appearance.showHelperLines && vectors.map((vector) => (
            <text
              key={`label-${vector.id}`} x={vector.labelX} y={vector.labelY}
              fill={vector.color} fontSize={12 * appearance.fontScale}
              fontWeight="750" textAnchor={vector.textAnchor}
            >
              {vector.label} {vector.magnitude.toFixed(2)} {vector.unit}
            </text>
          ))}

          {appearance.showHelperLines && constraints.map((constraint) => (
            <text
              key={`constraint-label-${constraint.id}`}
              x={constraint.labelX} y={constraint.labelY}
              fill={constraint.color} fontSize={12 * appearance.fontScale}
              fontWeight="750" textAnchor={constraint.textAnchor}
            >
              {constraint.label} L={constraint.currentLength.toFixed(2)} m
            </text>
          ))}

          {appearance.showPointLabel && bodies.map((body, index) => (
            <text
              key={`body-label-${body.id}`} x={body.point.x + 17} y={body.point.y - 15 - index * 3}
              fill={body.color || textColor} fontSize={14 * appearance.fontScale} fontWeight="750"
            >
              {body.label} ({body.x.toFixed(2)}, {body.y.toFixed(2)})
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
