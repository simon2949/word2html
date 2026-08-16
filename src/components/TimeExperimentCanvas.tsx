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

export function TimeExperimentCanvas({ scene, time, zoom }: TimeExperimentCanvasProps) {
  const runtime = useMemo(() => createTimeExperimentRuntime(scene), [scene])
  const snapshot = useMemo(() => runtime.snapshot(time), [runtime, time])
  const trail = useMemo(
    () => snapshot.time > 0 ? runtime.sample(snapshot.time, 181) : [],
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
  const body = toSvg({ x: snapshot.x, y: snapshot.y })
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
  const trailPoints = trail.map((sample) => {
    const point = toSvg(sample)
    return `${point.x.toFixed(2)},${point.y.toFixed(2)}`
  }).join(' ')
  const vectors = snapshot.vectors.map((vector, index) => {
    const rawTip = toSvg({
      x: snapshot.x + vector.x * vector.scale,
      y: snapshot.y + vector.y * vector.scale,
    })
    const rawDx = rawTip.x - body.x
    const rawDy = rawTip.y - body.y
    const rawLength = Math.hypot(rawDx, rawDy)
    if (rawLength < 0.75) return null
    const displayLength = Math.min(rawLength, 130)
    const ux = rawDx / rawLength
    const uy = rawDy / rawLength
    const tip = { x: body.x + ux * displayLength, y: body.y + uy * displayLength }
    const headLength = Math.min(12, Math.max(8, displayLength * 0.22))
    const headWidth = headLength * 0.48
    const base = { x: tip.x - ux * headLength, y: tip.y - uy * headLength }
    const perpendicular = { x: -uy, y: ux }
    const color = VECTOR_COLORS[index % VECTOR_COLORS.length]!
    return {
      ...vector,
      color,
      tip,
      head: `${tip.x},${tip.y} ${base.x + perpendicular.x * headWidth},${base.y + perpendicular.y * headWidth} ${base.x - perpendicular.x * headWidth},${base.y - perpendicular.y * headWidth}`,
      labelX: Math.min(SVG_WIDTH - 10, Math.max(10, tip.x + perpendicular.x * (16 + index * 4))),
      labelY: Math.min(SVG_HEIGHT - 8, Math.max(15, tip.y + perpendicular.y * (16 + index * 4))),
      textAnchor: perpendicular.x < -0.2 ? 'end' as const : 'start' as const,
    }
  }).filter((vector): vector is NonNullable<typeof vector> => vector !== null)

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
            <radialGradient id="time-experiment-body" cx="35%" cy="28%" r="72%">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.86" />
              <stop offset="0.24" stopColor={appearance.pointColor} />
              <stop offset="1" stopColor={appearance.pointColor} stopOpacity="0.72" />
            </radialGradient>
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
            {appearance.showTrail && trail.length > 1 && (
              <polyline
                points={trailPoints} fill="none" stroke={appearance.curveColor}
                strokeWidth={appearance.lineWidth} strokeLinecap="round" opacity="0.48"
              />
            )}
            {appearance.showHelperLines && vectors.map((vector) => (
              <g key={vector.id}>
                <line
                  x1={body.x} y1={body.y} x2={vector.tip.x} y2={vector.tip.y}
                  stroke={vector.color} strokeWidth="3" strokeLinecap="round"
                />
                <polygon points={vector.head} fill={vector.color} />
              </g>
            ))}
            <circle
              cx={body.x} cy={body.y} r={appearance.pointRadius + 3}
              fill="url(#time-experiment-body)" stroke={dark ? '#17212B' : '#FFFFFF'} strokeWidth="3"
            />
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

          {appearance.showPointLabel && (
            <text
              x={body.x + 17} y={body.y - 15} fill={textColor}
              fontSize={14 * appearance.fontScale} fontWeight="750"
            >
              P({snapshot.x.toFixed(2)}, {snapshot.y.toFixed(2)})
            </text>
          )}
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
