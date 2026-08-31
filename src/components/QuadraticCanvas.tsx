import { useMemo } from 'react'
import { evaluateQuadratic, getQuadraticSnapshot } from '../core/quadratic'
import {
  helperLineStyleOf,
  helperLineWidthOf,
  lineDashArray,
  lineWidthOf,
  lineStyleOf,
  objectColorOf,
  objectStyleOf,
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

interface QuadraticCanvasProps {
  scene: LessonScene
  zoom: number
  selectedObjectId?: string | null
  onObjectSelect?: (objectId: string) => void
}

const SVG_WIDTH = 900
const SVG_HEIGHT = 590
const PADDING = 24

export function QuadraticCanvas({ scene, zoom, selectedObjectId, onObjectSelect }: QuadraticCanvasProps) {
  const snapshot = useMemo(() => getQuadraticSnapshot(scene), [scene])
  const effectiveViewport = useMemo(() => zoomViewport(scene.viewport, zoom), [scene.viewport, zoom])
  const transform = useMemo(
    () => createPlotTransform(effectiveViewport, SVG_WIDTH, SVG_HEIGHT, PADDING),
    [effectiveViewport],
  )
  const { appearance } = scene
  const { scale, xOffset, yOffset, contentWidth, contentHeight, viewport: plotViewport, toSvg } = transform
  const origin = toSvg({ x: 0, y: 0 })
  const vertex = toSvg(snapshot.vertex)
  const gridStep = squareGridStep(scale)
  const gridX = coordinateTicks(plotViewport.xMin, plotViewport.xMax, gridStep)
  const gridY = coordinateTicks(plotViewport.yMin, plotViewport.yMax, gridStep)
  const tickLabelStride = labelStride(gridStep, scale)
  const dark = appearance.theme === 'dark'
  const background = dark ? '#17212B' : '#FBFCFE'
  const gridColor = dark ? '#2D3B47' : '#E7EAF0'
  const axisColor = dark ? '#7D8D9C' : '#9AA3AE'
  const textColor = dark ? '#E8EEF3' : '#36404A'
  const showXAxis = plotViewport.yMin <= 0 && plotViewport.yMax >= 0
  const showYAxis = plotViewport.xMin <= 0 && plotViewport.xMax >= 0
  const curveWidth = lineWidthOf(appearance, 'parabola')
  const curveStyle = lineStyleOf(appearance, 'parabola')
  const helperLineWidth = helperLineWidthOf(appearance, 2, 'symmetryAxis')
  const helperLineStyle = helperLineStyleOf(appearance, 'dashed', 'symmetryAxis')
  const vertexRadius = pointRadiusOf(appearance, 'vertex')
  const vertexAppearance = pointSvgAppearance(appearance, appearance.pointColor, background, 'quadratic-point-shadow', 'vertex')
  const labelStyle = objectStyleOf(appearance, 'vertexLabel')

  const curvePath = useMemo(() => {
    const points: string[] = []
    for (let index = 0; index <= 240; index += 1) {
      const x = plotViewport.xMin
        + ((plotViewport.xMax - plotViewport.xMin) * index) / 240
      const y = evaluateQuadratic(snapshot.a, snapshot.h, snapshot.k, x)
      const point = toSvg({ x, y })
      points.push(`${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    }
    return points.join(' ')
  }, [plotViewport, snapshot.a, snapshot.h, snapshot.k, toSvg])

  const rootsText = snapshot.roots.length === 0
    ? '无实数根'
    : snapshot.roots.map((root) => root.toFixed(2)).join('，')

  return (
    <div className="canvas-stack" data-theme={appearance.theme}>
      <div className="canvas-shell" data-theme={appearance.theme}>
        <svg
        className="quadratic-canvas"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-label={`二次函数交互图。a 为 ${snapshot.a}，顶点为 (${snapshot.h}, ${snapshot.k})，开口${snapshot.opensUpward ? '向上' : '向下'}`}
      >
        <title>二次函数顶点式交互图</title>
        <defs>
          <clipPath id="quadratic-plot-clip">
            <rect x={xOffset} y={yOffset} width={contentWidth} height={contentHeight} />
          </clipPath>
          <filter id="quadratic-point-shadow" x="-80%" y="-80%" width="260%" height="260%">
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
              {showXAxis && <text x={xOffset + contentWidth - 5} y={origin.y - 10} textAnchor="end" fontWeight="700">x</text>}
              {showYAxis && <text x={origin.x + 10} y={yOffset + 13} fontWeight="700">y</text>}
            </g>
          </g>
        )}

        <g clipPath="url(#quadratic-plot-clip)">
          {appearance.showHelperLines && objectVisibleOf(appearance, 'symmetryAxis') && (
            <line
              {...sceneObjectSelectionProps('symmetryAxis', '对称轴', selectedObjectId, onObjectSelect)}
              data-appearance-role="helper-line"
              x1={vertex.x}
              x2={vertex.x}
              y1={yOffset}
              y2={yOffset + contentHeight}
              stroke={objectColorOf(appearance, 'symmetryAxis', appearance.helperColor)}
              strokeWidth={helperLineWidth}
              strokeDasharray={lineDashArray(helperLineStyle, helperLineWidth)}
              strokeLinecap="round"
            />
          )}
          {objectVisibleOf(appearance, 'parabola') && <path
            {...sceneObjectSelectionProps('parabola', '抛物线', selectedObjectId, onObjectSelect)}
            data-appearance-role="main-line"
            d={curvePath}
            fill="none"
            stroke={objectColorOf(appearance, 'parabola', appearance.curveColor)}
            strokeWidth={curveWidth}
            strokeDasharray={lineDashArray(curveStyle, curveWidth)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />}
        </g>

        {objectVisibleOf(appearance, 'vertex') && <circle
          {...sceneObjectSelectionProps('vertex', '顶点', selectedObjectId, onObjectSelect)}
          data-appearance-role="primary-point"
          cx={vertex.x}
          cy={vertex.y}
          r={vertexRadius}
          {...vertexAppearance}
        />}
        {appearance.showPointLabel && objectVisibleOf(appearance, 'vertexLabel') && (
          <text
            {...sceneObjectSelectionProps('vertexLabel', '顶点标签', selectedObjectId, onObjectSelect)}
            x={vertex.x + vertexRadius + 8}
            y={vertex.y - vertexRadius - 7}
            fill={objectColorOf(appearance, 'vertexLabel', textColor)}
            fontSize={15 * (labelStyle.fontScale ?? appearance.fontScale)}
            fontWeight="750"
          >
            V({snapshot.h.toFixed(2)}, {snapshot.k.toFixed(2)})
          </text>
        )}
        </svg>
      </div>

      <div className="metric-row" aria-live="polite">
        <div className="metric-card">
          <span>开口</span>
          <strong>{snapshot.opensUpward ? '向上' : '向下'}</strong>
        </div>
        <div className="metric-card metric-card--sum">
          <span>顶点 (h, k)</span>
          <strong>({snapshot.h.toFixed(2)}, {snapshot.k.toFixed(2)})</strong>
          <small>对称轴 x = {snapshot.h.toFixed(2)}</small>
        </div>
        <div className="metric-card">
          <span>与 x 轴交点</span>
          <strong className="metric-text-value">{rootsText}</strong>
        </div>
      </div>
    </div>
  )
}
