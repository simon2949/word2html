import { useMemo } from 'react'
import {
  DATA_CHART_2D_TEMPLATE_ID,
  dataChartCategoryLabelLayout,
  dataChartCategoryPositions,
  formatDataChartValue,
  getDataChart2DSpec,
  type DataChartSeriesSpec,
} from '../core/dataChart2d'
import {
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
} from '../core/viewport'
import type { LessonScene, SceneObject } from '../types/lessonScene'
import { sceneObjectSelectionProps } from './sceneObjectSelection'

interface DataChart2DCanvasProps {
  scene: LessonScene
  zoom: number
  selectedObjectId?: string | null
  onObjectSelect?: (objectId: string) => void
}

const SVG_WIDTH = 900
const SVG_HEIGHT = 590
const PADDING = 76
const SERIES_COLORS = ['#5B5BD6', '#087E8B', '#E08B2D', '#D13C64']

function seriesObject(scene: LessonScene, series: DataChartSeriesSpec): SceneObject {
  return scene.objects.find((object) => object.id === `chart.series.${series.id}`)!
}

function seriesColor(scene: LessonScene, object: SceneObject, index: number): string {
  return objectColorOf(scene.appearance, object.id, index === 0 ? scene.appearance.curveColor : SERIES_COLORS[index % SERIES_COLORS.length]!)
}

export function DataChart2DCanvas({ scene, zoom, selectedObjectId, onObjectSelect }: DataChart2DCanvasProps) {
  if (scene.templateRef.id !== DATA_CHART_2D_TEMPLATE_ID) throw new Error('DataChart2DCanvas 只能渲染数据图表场景。')
  const spec = useMemo(() => getDataChart2DSpec(scene), [scene])
  const { appearance } = scene
  const dark = appearance.theme === 'dark'
  const background = dark ? '#17212B' : '#FBFCFE'
  const gridColor = dark ? '#2D3B47' : '#E7EAF0'
  const axisColor = dark ? '#8A9AA8' : '#8E99A5'
  const textColor = dark ? '#E8EEF3' : '#4A5662'
  const viewport = useMemo(() => zoomViewport(scene.viewport, zoom), [scene.viewport, zoom])
  const transform = useMemo(() => createPlotTransform(viewport, SVG_WIDTH, SVG_HEIGHT, PADDING), [viewport])

  if (spec.mode === 'table') {
    return (
      <div className="canvas-stack" data-theme={appearance.theme}>
        <div className="canvas-shell data-table-shell" data-theme={appearance.theme}>
          <div className="data-table-canvas" style={{ fontSize: `${appearance.fontScale * zoom}em` }}>
            <table aria-label={scene.metadata.title}>
              <caption>{scene.metadata.title}</caption>
              <thead><tr>
                <th scope="col">{spec.xLabel}</th>
                {spec.series.map((series, index) => {
                  const object = seriesObject(scene, series)
                  const selected = object.id === selectedObjectId
                  if (!objectVisibleOf(appearance, object.id)) return null
                  return <th
                    key={series.id} scope="col" tabIndex={onObjectSelect ? 0 : undefined}
                    role={onObjectSelect ? 'button' : undefined}
                    aria-label={onObjectSelect ? `选择数据系列${series.label}` : undefined}
                    data-scene-object-id={object.id} data-scene-selected={selected ? 'true' : 'false'}
                    className={selected ? 'scene-editable-object is-object-selected' : 'scene-editable-object'}
                    style={{ color: seriesColor(scene, object, index), fontSize: `${objectStyleOf(appearance, object.id).fontScale ?? 1}em` }}
                    onClick={() => onObjectSelect?.(object.id)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault(); onObjectSelect?.(object.id)
                    }}
                  >{series.label}{spec.unit ? `（${spec.unit}）` : ''}</th>
                })}
              </tr></thead>
              <tbody>{spec.categories!.map((category, categoryIndex) => <tr key={category}>
                <th scope="row">{category}</th>
                {spec.series.map((series, seriesIndex) => {
                  const object = seriesObject(scene, series)
                  if (!objectVisibleOf(appearance, object.id)) return null
                  return <td key={series.id} style={{ color: seriesColor(scene, object, seriesIndex) }}>{formatDataChartValue(series.values![categoryIndex]!)}</td>
                })}
              </tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  const { xOffset, yOffset, contentWidth, contentHeight, scale, toSvg } = transform
  const origin = toSvg({ x: 0, y: 0 })
  const gridStep = squareGridStep(scale)
  const yTicks = coordinateTicks(transform.viewport.yMin, transform.viewport.yMax, gridStep)
  const xTicks = spec.mode === 'scatter' ? coordinateTicks(transform.viewport.xMin, transform.viewport.xMax, gridStep) : []
  const yStride = labelStride(gridStep, scale)
  const xStride = labelStride(gridStep, scale)
  const baselineY = Math.max(yOffset, Math.min(yOffset + contentHeight, origin.y))
  const categoryCount = spec.categories?.length ?? 0
  const categoryXs = spec.mode === 'bar' || spec.mode === 'line'
    ? dataChartCategoryPositions(spec.mode, categoryCount, xOffset, contentWidth)
    : []
  const categoryPixelSpan = categoryXs.length > 1
    ? categoryXs.at(-1)! - categoryXs[0]!
    : contentWidth
  const categorySpacing = categoryXs.length > 1 ? categoryPixelSpan / (categoryXs.length - 1) : contentWidth
  const categoryLabelLayout = spec.mode === 'scatter'
    ? null
    : dataChartCategoryLabelLayout(spec.categories ?? [], categoryPixelSpan, 11 * appearance.fontScale)

  return (
    <div className="canvas-stack" data-theme={appearance.theme}>
      <div className="canvas-shell" data-theme={appearance.theme}>
        <svg className="data-chart-2d-canvas" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img" aria-label={`${scene.metadata.title}，${spec.mode} 数据图表`} data-chart-mode={spec.mode} data-category-scale={spec.mode === 'scatter' ? undefined : 'distributed'}>
          <title>{scene.metadata.title}</title>
          <defs>
            <clipPath id="data-chart-plot-clip"><rect x={xOffset} y={yOffset} width={contentWidth} height={contentHeight} /></clipPath>
            <filter id="data-chart-point-shadow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#101828" floodOpacity=".28" /></filter>
          </defs>
          <rect width={SVG_WIDTH} height={SVG_HEIGHT} rx="22" fill={background} />
          {appearance.showGrid && <g aria-hidden="true">
            {yTicks.map((value) => <line key={`gy-${value}`} x1={xOffset} x2={xOffset + contentWidth} y1={toSvg({ x: 0, y: value }).y} y2={toSvg({ x: 0, y: value }).y} stroke={gridColor} />)}
            {spec.mode === 'scatter' && xTicks.map((value) => <line key={`gx-${value}`} x1={toSvg({ x: value, y: 0 }).x} x2={toSvg({ x: value, y: 0 }).x} y1={yOffset} y2={yOffset + contentHeight} stroke={gridColor} />)}
            {spec.mode !== 'scatter' && categoryXs.map((x, index) => <line key={`gc-${index}`} data-category-guide="true" x1={x} x2={x} y1={yOffset} y2={yOffset + contentHeight} stroke={gridColor} />)}
          </g>}
          {appearance.showAxes && <g aria-hidden="true">
            <g stroke={axisColor} strokeWidth="1.5">
              <line x1={xOffset} x2={xOffset + contentWidth} y1={baselineY} y2={baselineY} />
              <line x1={xOffset} x2={xOffset} y1={yOffset} y2={yOffset + contentHeight} />
            </g>
            <g fill={axisColor} fontSize={11 * appearance.fontScale}>
              {yTicks.map((value, index) => index % yStride === 0 ? <text key={`yl-${value}`} x={xOffset - 9} y={toSvg({ x: 0, y: value }).y + 4} textAnchor="end">{formatCoordinate(value, gridStep)}</text> : null)}
              {spec.mode === 'scatter'
                ? xTicks.map((value, index) => index % xStride === 0 ? <text key={`xl-${value}`} x={toSvg({ x: value, y: 0 }).x} y={yOffset + contentHeight + 19} textAnchor="middle">{formatCoordinate(value, gridStep)}</text> : null)
                : <g data-category-label-layout={categoryLabelLayout?.rows === 2 ? 'staggered' : 'single-row'} data-category-label-stride={categoryLabelLayout?.stride} data-category-spacing={categorySpacing}>
                    {spec.categories!.map((category, index) => {
                      const stride = categoryLabelLayout?.stride ?? 1
                      if (index % stride !== 0) return null
                      const row = categoryLabelLayout?.rows === 2 ? Math.floor(index / stride) % 2 : 0
                      return <text key={category} data-category-label="true" data-category-label-value={category} data-category-label-row={row} x={categoryXs[index]} y={yOffset + contentHeight + 18 + row * 16} textAnchor="middle">{category}</text>
                    })}
                  </g>}
              <text x={xOffset + contentWidth / 2} y={SVG_HEIGHT - 9} textAnchor="middle" fontWeight="700">{spec.xLabel}</text>
              <text transform={`translate(17 ${yOffset + contentHeight / 2}) rotate(-90)`} textAnchor="middle" fontWeight="700">{spec.yLabel}{spec.unit ? `（${spec.unit}）` : ''}</text>
            </g>
          </g>}

          {spec.mode === 'bar' && spec.series.map((series, seriesIndex) => {
            const object = seriesObject(scene, series)
            if (!objectVisibleOf(appearance, object.id)) return null
            const color = seriesColor(scene, object, seriesIndex)
            const width = lineWidthOf(appearance, object.id, 1.5)
            const slot = Math.max(8, contentWidth / Math.max(1, spec.categories!.length))
            const groupWidth = Math.min(slot * 0.72, 76)
            const barWidth = groupWidth / spec.series.length
            return <g key={series.id} {...sceneObjectSelectionProps(object.id, series.label, selectedObjectId, onObjectSelect)} clipPath="url(#data-chart-plot-clip)">
              {series.values!.map((value, index) => {
                const center = categoryXs[index]!
                const valueY = toSvg({ x: index, y: value }).y
                const x = center - groupWidth / 2 + seriesIndex * barWidth + 1
                const y = Math.min(valueY, baselineY)
                const height = Math.max(1, Math.abs(valueY - baselineY))
                return <g key={spec.categories![index]}>
                  <rect data-category-index={index} x={x} y={y} width={Math.max(2, barWidth - 2)} height={height} rx="3" fill={color} fillOpacity=".82" stroke={dark ? '#F8FAFC' : color} strokeWidth={width} strokeDasharray={lineDashArray(lineStyleOf(appearance, object.id), width)} />
                  {appearance.showPointLabel && <text x={x + (barWidth - 2) / 2} y={value >= 0 ? y - 6 : y + height + 14} textAnchor="middle" fill={textColor} fontSize={10 * appearance.fontScale}>{formatDataChartValue(value)}</text>}
                </g>
              })}
            </g>
          })}

          {spec.mode === 'line' && spec.series.map((series, index) => {
            const object = seriesObject(scene, series)
            if (!objectVisibleOf(appearance, object.id)) return null
            const color = seriesColor(scene, object, index)
            const width = lineWidthOf(appearance, object.id)
            const points = series.values!.map((value, pointIndex) => ({ value, mapped: { x: categoryXs[pointIndex]!, y: toSvg({ x: 0, y: value }).y } }))
            return <g key={series.id} {...sceneObjectSelectionProps(object.id, series.label, selectedObjectId, onObjectSelect)} clipPath="url(#data-chart-plot-clip)">
              <path d={points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${point.mapped.x} ${point.mapped.y}`).join(' ')} fill="none" stroke={color} strokeWidth={width} strokeDasharray={lineDashArray(lineStyleOf(appearance, object.id), width)} strokeLinecap="round" strokeLinejoin="round" />
              {points.map((point, pointIndex) => <g key={spec.categories![pointIndex]}><circle data-category-index={pointIndex} cx={point.mapped.x} cy={point.mapped.y} r={Math.max(3.5, appearance.pointRadius * 0.62)} fill={color} stroke={background} strokeWidth="2" />{appearance.showPointLabel && <text x={point.mapped.x} y={point.mapped.y - 10} textAnchor="middle" fill={textColor} fontSize={10 * appearance.fontScale}>{formatDataChartValue(point.value)}</text>}</g>)}
            </g>
          })}

          {spec.mode === 'scatter' && spec.series.map((series, index) => {
            const object = seriesObject(scene, series)
            if (!objectVisibleOf(appearance, object.id)) return null
            const color = seriesColor(scene, object, index)
            const visual = pointSvgAppearance(appearance, color, background, 'data-chart-point-shadow', object.id)
            const radius = pointRadiusOf(appearance, object.id)
            return <g key={series.id} {...sceneObjectSelectionProps(object.id, series.label, selectedObjectId, onObjectSelect)} clipPath="url(#data-chart-plot-clip)">
              {series.points!.map((point, pointIndex) => { const mapped = toSvg(point); return <g key={`${point.x}-${point.y}-${pointIndex}`}><circle cx={mapped.x} cy={mapped.y} r={radius} fill={visual.fill} stroke={visual.stroke} strokeWidth={visual.strokeWidth} filter={visual.filter} />{appearance.showPointLabel && <text x={mapped.x + radius + 5} y={mapped.y - radius - 3} fill={textColor} fontSize={10 * appearance.fontScale}>({formatDataChartValue(point.x)}, {formatDataChartValue(point.y)})</text>}</g> })}
            </g>
          })}

          <g transform={`translate(${xOffset + 8} ${yOffset + 8})`} aria-label="数据系列图例">
            {spec.series.map((series, index) => {
              const object = seriesObject(scene, series)
              if (!objectVisibleOf(appearance, object.id)) return null
              return <g key={series.id} transform={`translate(${index * 145} 0)`}><rect width="132" height="26" rx="13" fill={dark ? '#243441' : '#FFFFFF'} opacity=".94" /><circle cx="15" cy="13" r="5" fill={seriesColor(scene, object, index)} /><text x="26" y="17" fill={textColor} fontSize="11" fontWeight="700">{series.label}</text></g>
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}
