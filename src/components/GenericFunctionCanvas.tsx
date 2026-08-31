import { useMemo } from 'react'
import { getGenericFunctionSpec, sampleGenericFunction } from '../core/genericFunction'
import {
  lineDashArray,
  lineStyleOf,
  lineWidthOf,
  objectColorOf,
  objectVisibleOf,
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

interface GenericFunctionCanvasProps {
  scene: LessonScene
  zoom: number
  selectedObjectId?: string | null
  onObjectSelect?: (objectId: string) => void
}

const SVG_WIDTH = 900
const SVG_HEIGHT = 590
const PADDING = 24

export function GenericFunctionCanvas({ scene, zoom, selectedObjectId, onObjectSelect }: GenericFunctionCanvasProps) {
  const spec = useMemo(() => getGenericFunctionSpec(scene), [scene])
  const samples = useMemo(() => sampleGenericFunction(spec, 801), [spec])
  const effectiveViewport = useMemo(() => zoomViewport(scene.viewport, zoom), [scene.viewport, zoom])
  const transform = useMemo(
    () => createPlotTransform(effectiveViewport, SVG_WIDTH, SVG_HEIGHT, PADDING),
    [effectiveViewport],
  )
  const { appearance } = scene
  const { scale, xOffset, yOffset, contentWidth, contentHeight, viewport: plotViewport, toSvg } = transform
  const origin = toSvg({ x: 0, y: 0 })
  const gridStep = squareGridStep(scale)
  const gridX = coordinateTicks(plotViewport.xMin, plotViewport.xMax, gridStep)
  const gridY = coordinateTicks(plotViewport.yMin, plotViewport.yMax, gridStep)
  const tickLabelStride = labelStride(gridStep, scale)
  const dark = appearance.theme === 'dark'
  const background = dark ? '#17212B' : '#FBFCFE'
  const gridColor = dark ? '#2D3B47' : '#E7EAF0'
  const axisColor = dark ? '#7D8D9C' : '#9AA3AE'
  const showXAxis = plotViewport.yMin <= 0 && plotViewport.yMax >= 0
  const showYAxis = plotViewport.xMin <= 0 && plotViewport.xMax >= 0
  const curveWidth = lineWidthOf(appearance, 'functionCurve')

  const curvePath = useMemo(() => {
    const parts: string[] = []
    let drawing = false
    let previousY: number | null = null
    for (const sample of samples) {
      const finite = Number.isFinite(sample.y)
      const discontinuous = finite && previousY !== null
        && Math.abs(sample.y - previousY) * scale > SVG_HEIGHT * 1.5
      if (!finite || discontinuous) {
        drawing = false
        previousY = finite ? sample.y : null
        continue
      }
      const point = toSvg(sample)
      parts.push(`${drawing ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      drawing = true
      previousY = sample.y
    }
    return parts.join(' ')
  }, [samples, scale, toSvg])

  return (
    <div className="canvas-stack" data-theme={appearance.theme}>
      <div className="canvas-shell" data-theme={appearance.theme}>
        <svg
          className="generic-function-canvas"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          role="img"
          aria-label={`通用函数图像：${scene.annotations.formula}`}
        >
          <title>{scene.metadata.title}</title>
          <defs>
            <clipPath id="generic-function-plot-clip">
              <rect x={xOffset} y={yOffset} width={contentWidth} height={contentHeight} />
            </clipPath>
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

          <g clipPath="url(#generic-function-plot-clip)">
            {objectVisibleOf(appearance, 'functionCurve') && <path
              {...sceneObjectSelectionProps('functionCurve', '函数曲线', selectedObjectId, onObjectSelect)}
              data-appearance-role="main-line"
              d={curvePath}
              fill="none"
              stroke={objectColorOf(appearance, 'functionCurve', appearance.curveColor)}
              strokeWidth={curveWidth}
              strokeDasharray={lineDashArray(lineStyleOf(appearance, 'functionCurve'), curveWidth)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />}
          </g>
        </svg>
      </div>

      <div className="metric-row" aria-live="polite">
        <div className="metric-card metric-card--sum">
          <span>函数</span>
          <strong className="metric-text-value">{scene.annotations.formula}</strong>
        </div>
        <div className="metric-card">
          <span>定义域</span>
          <strong className="metric-text-value">[{spec.xMin}, {spec.xMax}]</strong>
        </div>
        <div className="metric-card">
          <span>当前参数</span>
          <strong className="metric-text-value">
            {spec.parameters.length > 0
              ? spec.parameters.map((parameter) => `${parameter.label}=${parameter.value}`).join('，')
              : '无可调参数'}
          </strong>
        </div>
      </div>
    </div>
  )
}
