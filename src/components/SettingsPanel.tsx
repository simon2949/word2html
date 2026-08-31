import { useEffect, useState } from 'react'
import { QUADRATIC_TEMPLATE_ID } from '../core/quadratic'
import { GENERIC_FUNCTION_TEMPLATE_ID } from '../core/genericFunction'
import { TIME_EXPERIMENT_TEMPLATE_ID } from '../core/timeExperiment'
import { GEOMETRY_2D_TEMPLATE_ID } from '../core/geometry2d'
import { COLLISION_2D_TEMPLATE_ID } from '../core/collision2d'
import { RELATION_CURVE_2D_TEMPLATE_ID } from '../core/relationCurve2d'
import { DATA_CHART_2D_TEMPLATE_ID } from '../core/dataChart2d'
import type {
  LessonScene,
  NumberParameter,
  ObjectAppearanceOverride,
  SceneAppearance,
} from '../types/lessonScene'
import { isNumberParameter } from '../types/lessonScene'
import { ObjectPropertiesPanel } from './ObjectPropertiesPanel'
import { AppearancePresetsPanel } from './AppearancePresetsPanel'
import type { StylePresetId } from '../core/appearancePresets'
import type { LayoutPresetId } from '../types/lessonScene'

interface SettingsPanelProps {
  scene: LessonScene
  onParameterChange: (id: string, value: number) => void
  onAppearanceChange: <K extends keyof SceneAppearance>(key: K, value: SceneAppearance[K]) => void
  selectedObjectId?: string | null
  onObjectSelect?: (objectId: string | null) => void
  onObjectAppearanceChange?: (objectId: string, patch: Partial<ObjectAppearanceOverride>) => void
  onObjectAppearanceReset?: (objectId: string) => void
  onStylePresetApply?: (presetId: StylePresetId, resetObjectStyles: boolean) => void
  onLayoutPresetApply?: (presetId: LayoutPresetId) => void
  onAppearanceReset?: (resetObjectStyles: boolean) => void
  error: string | null
}

interface ToggleProps {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}

function Toggle({ checked, label, onChange }: ToggleProps) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-track" aria-hidden="true"><span /></span>
    </label>
  )
}

export function SettingsPanel({
  scene,
  onParameterChange,
  onAppearanceChange,
  selectedObjectId = null,
  onObjectSelect,
  onObjectAppearanceChange,
  onObjectAppearanceReset,
  onStylePresetApply,
  onLayoutPresetApply,
  onAppearanceReset,
  error,
}: SettingsPanelProps) {
  const objectEditing = Boolean(onObjectSelect && onObjectAppearanceChange && onObjectAppearanceReset)
  const [tab, setTab] = useState<'parameters' | 'appearance' | 'object'>('parameters')
  const quadratic = scene.templateRef.id === QUADRATIC_TEMPLATE_ID
  const genericFunction = scene.templateRef.id === GENERIC_FUNCTION_TEMPLATE_ID
  const timeExperiment = scene.templateRef.id === TIME_EXPERIMENT_TEMPLATE_ID
  const geometry2D = scene.templateRef.id === GEOMETRY_2D_TEMPLATE_ID
  const collision2D = scene.templateRef.id === COLLISION_2D_TEMPLATE_ID
  const relationCurve2D = scene.templateRef.id === RELATION_CURVE_2D_TEMPLATE_ID
  const dataChart2D = scene.templateRef.id === DATA_CHART_2D_TEMPLATE_ID
  const curveOnly = genericFunction || relationCurve2D
  const animatedExperiment = timeExperiment || collision2D
  const ellipse = !quadratic && !curveOnly && !timeExperiment && !geometry2D && !collision2D && !dataChart2D

  useEffect(() => {
    if (selectedObjectId && objectEditing) setTab('object')
  }, [objectEditing, selectedObjectId])

  const parameterControl = (
    id: string,
    parameter: NumberParameter,
    min = parameter.min,
    max = parameter.max,
  ) => (
    <div className="control-block" key={id}>
      <div className="control-heading">
        <label htmlFor={`${id}-range`}>{parameter.label}</label>
        <div className="number-input-wrap">
          <input
            aria-label={`${parameter.label}数值`}
            type="number"
            min={min}
            max={max}
            step={parameter.step}
            value={parameter.value}
            onChange={(event) => {
              if (event.target.value !== '') onParameterChange(id, Number(event.target.value))
            }}
          />
        </div>
      </div>
      <input
        id={`${id}-range`}
        className="range-input"
        type="range"
        min={min}
        max={max}
        step={parameter.step}
        value={parameter.value}
        onChange={(event) => onParameterChange(id, Number(event.target.value))}
      />
      <div className="range-labels"><span>{min}</span><span>{max}</span></div>
    </div>
  )

  const renderParameterPanel = () => {
    if (curveOnly || timeExperiment || geometry2D || collision2D || dataChart2D) {
      const parameters = Object.entries(scene.parameters)
        .filter((entry): entry is [string, NumberParameter] => isNumberParameter(entry[1]))
      if (collision2D && parameters.length > 0) {
        const bodies = scene.objects.filter((object) => object.kind === 'collision-body')
        const owners = new Map<string, string[]>()
        for (const [id] of parameters) {
          const matchingBodies = bodies.filter((body) => Object.values(body.bindings).some((expression) => (
            expression.match(/[A-Za-z][A-Za-z0-9_]*/g)?.some((identifier) => identifier === id) ?? false
          )))
          owners.set(id, matchingBodies.map((body) => body.id))
        }
        const globalParameters = parameters.filter(([id]) => owners.get(id)?.length !== 1)
        return (
          <>
            <div className="collision-parameter-groups">
              {globalParameters.length > 0 && (
                <section className="collision-parameter-group" aria-label="碰撞全局参数">
                  <h3>实验全局</h3>
                  {globalParameters.map(([id, parameter]) => parameterControl(id, parameter))}
                </section>
              )}
              {bodies.map((body) => {
                const bodyParameters = parameters.filter(([id]) => owners.get(id)?.length === 1 && owners.get(id)?.[0] === body.id)
                return bodyParameters.length > 0 ? (
                  <section className="collision-parameter-group" aria-label={`${body.label ?? body.id} 参数`} key={body.id}>
                    <h3>{body.label ?? body.id}</h3>
                    {bodyParameters.map(([id, parameter]) => parameterControl(id, parameter))}
                  </section>
                ) : null
              })}
            </div>
            {error && <div className="inline-error" role="alert">{error}</div>}
          </>
        )
      }
      return (
        <>
          {parameters.length > 0
            ? parameters.map(([id, parameter]) => parameterControl(id, parameter))
            : <div className="inline-notice">这个场景没有可调参数，仍可使用缩放和显示设置。</div>}
          {error && <div className="inline-error" role="alert">{error}</div>}
        </>
      )
    }
    if (quadratic) {
      const coefficientA = scene.parameters.coefficientA
      const vertexH = scene.parameters.vertexH
      const vertexK = scene.parameters.vertexK
      if (!isNumberParameter(coefficientA) || !isNumberParameter(vertexH) || !isNumberParameter(vertexK)) return null
      return (
        <>
          {parameterControl('coefficientA', coefficientA)}
          {parameterControl('vertexH', vertexH)}
          {parameterControl('vertexK', vertexK)}
          {error && <div className="inline-error" role="alert">{error}</div>}
          <div className="derived-grid">
            <div><span>开口方向</span><strong>{coefficientA.value > 0 ? '向上' : '向下'}</strong></div>
            <div><span>顶点</span><strong>({vertexH.value}, {vertexK.value})</strong></div>
            <div><span>对称轴</span><strong>x = {vertexH.value}</strong></div>
          </div>
        </>
      )
    }

    const major = scene.parameters.majorAxis
    const minor = scene.parameters.minorAxis
    if (!isNumberParameter(major) || !isNumberParameter(minor)) return null
    return (
      <>
        {parameterControl('majorAxis', major, Math.max(major.min, minor.value), major.max)}
        {parameterControl('minorAxis', minor, minor.min, Math.min(minor.max, major.value))}
        {error && <div className="inline-error" role="alert">{error}</div>}
        {major.value === minor.value && (
          <div className="inline-notice">长短轴相等：当前图形为圆，两个焦点重合。</div>
        )}
        <div className="derived-grid">
          <div><span>半长轴 a</span><strong>{(major.value / 2).toFixed(2)}</strong></div>
          <div><span>半短轴 b</span><strong>{(minor.value / 2).toFixed(2)}</strong></div>
          <div><span>半焦距 c</span><strong>{Math.sqrt(Math.max(0, major.value ** 2 - minor.value ** 2) / 4).toFixed(2)}</strong></div>
        </div>
      </>
    )
  }

  return (
    <aside className="settings-panel" aria-label="场景设置">
      <div className="panel-title-row">
        <div><span className="eyebrow">场景设置</span><h2>调整内容</h2></div>
        <span className="live-badge"><i /> 实时</span>
      </div>

      <div className={`segmented-tabs ${objectEditing ? 'segmented-tabs--three' : ''}`} role="tablist" aria-label="设置分类">
        <button className={tab === 'parameters' ? 'active' : ''} type="button" role="tab" aria-selected={tab === 'parameters'} onClick={() => setTab('parameters')}>参数</button>
        <button className={tab === 'appearance' ? 'active' : ''} type="button" role="tab" aria-selected={tab === 'appearance'} onClick={() => setTab('appearance')}>显示效果</button>
        {objectEditing && <button className={tab === 'object' ? 'active' : ''} type="button" role="tab" aria-selected={tab === 'object'} onClick={() => setTab('object')}>对象</button>}
      </div>

      {tab === 'object' && objectEditing ? (
        <div className="panel-section" role="tabpanel">
          <ObjectPropertiesPanel
            scene={scene}
            selectedObjectId={selectedObjectId}
            onSelect={onObjectSelect!}
            onChange={onObjectAppearanceChange!}
            onReset={onObjectAppearanceReset!}
          />
        </div>
      ) : tab === 'parameters' ? (
        <div className="panel-section" role="tabpanel">
          <p className="section-help">修改数值会直接重新计算图形，不消耗 AI token。</p>
          {renderParameterPanel()}
        </div>
      ) : (
        <div className="panel-section" role="tabpanel">
          <div className="setting-scope-card setting-scope-card--global">
            <span>整体显示</span>
            <strong>统一设置整个场景的默认效果</strong>
            <p>这里调整预设、辅助内容以及各类点线的整体默认样式。“对象”中的局部设置优先于这里的整体设置。</p>
          </div>
          {onStylePresetApply && onLayoutPresetApply && onAppearanceReset && (
            <AppearancePresetsPanel
              scene={scene}
              onApplyStyle={onStylePresetApply}
              onApplyLayout={onLayoutPresetApply}
              onReset={onAppearanceReset}
            />
          )}
          <div className="settings-group">
            <h3>整体显示内容</h3>
            <Toggle checked={scene.appearance.showAxes} label="坐标轴" onChange={(value) => onAppearanceChange('showAxes', value)} />
            <Toggle checked={scene.appearance.showGrid} label="背景网格" onChange={(value) => onAppearanceChange('showGrid', value)} />
            {!curveOnly && !dataChart2D && <Toggle checked={scene.appearance.showHelperLines} label={collision2D ? '速度矢量' : timeExperiment ? '矢量与绳/弹簧约束' : geometry2D ? '测量与约束辅助线' : quadratic ? '对称轴' : '焦点辅助线'} onChange={(value) => onAppearanceChange('showHelperLines', value)} />}
            {ellipse && <Toggle checked={scene.appearance.showIndividualDistances} label="单段距离" onChange={(value) => onAppearanceChange('showIndividualDistances', value)} />}
            {ellipse && <Toggle checked={scene.appearance.showDistanceSum} label="距离和" onChange={(value) => onAppearanceChange('showDistanceSum', value)} />}
            {ellipse && <Toggle checked={scene.appearance.showFocusLabels} label="焦点标签" onChange={(value) => onAppearanceChange('showFocusLabels', value)} />}
            {!curveOnly && <Toggle checked={scene.appearance.showPointLabel} label={dataChart2D ? '数据值标签' : animatedExperiment ? '运动物体标签' : geometry2D ? '几何点标签' : quadratic ? '顶点标签' : '动点标签'} onChange={(value) => onAppearanceChange('showPointLabel', value)} />}
            <Toggle checked={scene.appearance.showFormula} label="公式说明" onChange={(value) => onAppearanceChange('showFormula', value)} />
            {(ellipse || animatedExperiment || geometry2D) && <Toggle checked={scene.appearance.showTrail} label={geometry2D ? '几何轨迹' : '运动轨迹'} onChange={(value) => onAppearanceChange('showTrail', value)} />}
          </div>

          <div className="settings-group">
            <h3>整体默认颜色</h3>
            <label className="color-row"><span>{dataChart2D ? '首个数据系列' : collision2D ? '所有圆盘轨迹' : timeExperiment ? '所有主物体轨迹' : curveOnly ? '所有函数曲线' : geometry2D ? '所有几何线' : quadratic ? '抛物线' : '椭圆'}</span><input type="color" value={scene.appearance.curveColor} onChange={(event) => onAppearanceChange('curveColor', event.target.value)} /></label>
            {ellipse && <label className="color-row"><span>所有焦点</span><input type="color" value={scene.appearance.focusColor} onChange={(event) => onAppearanceChange('focusColor', event.target.value)} /></label>}
            {!curveOnly && !dataChart2D && <label className="color-row"><span>{animatedExperiment ? '所有运动物体' : geometry2D ? '所有几何点' : quadratic ? '顶点' : '所有动点'}</span><input type="color" value={scene.appearance.pointColor} onChange={(event) => onAppearanceChange('pointColor', event.target.value)} /></label>}
            {!curveOnly && !dataChart2D && <label className="color-row"><span>{collision2D ? '接触边界' : timeExperiment ? '所有基准线' : geometry2D ? '所有测量辅助线' : quadratic ? '对称轴' : '所有辅助线'}</span><input type="color" value={scene.appearance.helperColor} onChange={(event) => onAppearanceChange('helperColor', event.target.value)} /></label>}
          </div>

          {(ellipse || animatedExperiment) && (
            <div className="control-block compact-control">
              <div className="control-heading"><label htmlFor="speed-range">动画速度</label><strong>{scene.appearance.animationSpeed.toFixed(2)}×</strong></div>
              <input id="speed-range" className="range-input" type="range" min="0.2" max="2" step="0.05" value={scene.appearance.animationSpeed} onChange={(event) => onAppearanceChange('animationSpeed', Number(event.target.value))} />
            </div>
          )}

        </div>
      )}
    </aside>
  )
}
