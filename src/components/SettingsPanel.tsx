import { useState } from 'react'
import { QUADRATIC_TEMPLATE_ID } from '../core/quadratic'
import { GENERIC_FUNCTION_TEMPLATE_ID } from '../core/genericFunction'
import { TIME_EXPERIMENT_TEMPLATE_ID } from '../core/timeExperiment'
import type { LessonScene, NumberParameter, SceneAppearance } from '../types/lessonScene'
import { isNumberParameter } from '../types/lessonScene'

interface SettingsPanelProps {
  scene: LessonScene
  onParameterChange: (id: string, value: number) => void
  onAppearanceChange: <K extends keyof SceneAppearance>(key: K, value: SceneAppearance[K]) => void
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
  error,
}: SettingsPanelProps) {
  const [tab, setTab] = useState<'parameters' | 'appearance'>('parameters')
  const quadratic = scene.templateRef.id === QUADRATIC_TEMPLATE_ID
  const genericFunction = scene.templateRef.id === GENERIC_FUNCTION_TEMPLATE_ID
  const timeExperiment = scene.templateRef.id === TIME_EXPERIMENT_TEMPLATE_ID
  const ellipse = !quadratic && !genericFunction && !timeExperiment

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
    if (genericFunction || timeExperiment) {
      const parameters = Object.entries(scene.parameters)
        .filter((entry): entry is [string, NumberParameter] => isNumberParameter(entry[1]))
      return (
        <>
          {parameters.length > 0
            ? parameters.map(([id, parameter]) => parameterControl(id, parameter))
            : <div className="inline-notice">这个函数没有可调参数，仍可使用缩放和显示设置。</div>}
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

      <div className="segmented-tabs" role="tablist" aria-label="设置分类">
        <button className={tab === 'parameters' ? 'active' : ''} type="button" role="tab" aria-selected={tab === 'parameters'} onClick={() => setTab('parameters')}>参数</button>
        <button className={tab === 'appearance' ? 'active' : ''} type="button" role="tab" aria-selected={tab === 'appearance'} onClick={() => setTab('appearance')}>显示效果</button>
      </div>

      {tab === 'parameters' ? (
        <div className="panel-section" role="tabpanel">
          <p className="section-help">修改数值会直接重新计算图形，不消耗 AI token。</p>
          {renderParameterPanel()}
        </div>
      ) : (
        <div className="panel-section" role="tabpanel">
          <div className="settings-group">
            <h3>辅助内容</h3>
            <Toggle checked={scene.appearance.showAxes} label="坐标轴" onChange={(value) => onAppearanceChange('showAxes', value)} />
            <Toggle checked={scene.appearance.showGrid} label="背景网格" onChange={(value) => onAppearanceChange('showGrid', value)} />
            {!genericFunction && <Toggle checked={scene.appearance.showHelperLines} label={timeExperiment ? '速度与加速度矢量' : quadratic ? '对称轴' : '焦点辅助线'} onChange={(value) => onAppearanceChange('showHelperLines', value)} />}
            {ellipse && <Toggle checked={scene.appearance.showIndividualDistances} label="单段距离" onChange={(value) => onAppearanceChange('showIndividualDistances', value)} />}
            {ellipse && <Toggle checked={scene.appearance.showDistanceSum} label="距离和" onChange={(value) => onAppearanceChange('showDistanceSum', value)} />}
            {ellipse && <Toggle checked={scene.appearance.showFocusLabels} label="焦点标签" onChange={(value) => onAppearanceChange('showFocusLabels', value)} />}
            {!genericFunction && <Toggle checked={scene.appearance.showPointLabel} label={timeExperiment ? '运动物体标签' : quadratic ? '顶点标签' : '动点标签'} onChange={(value) => onAppearanceChange('showPointLabel', value)} />}
            <Toggle checked={scene.appearance.showFormula} label="公式说明" onChange={(value) => onAppearanceChange('showFormula', value)} />
            {(ellipse || timeExperiment) && <Toggle checked={scene.appearance.showTrail} label="运动轨迹" onChange={(value) => onAppearanceChange('showTrail', value)} />}
          </div>

          <div className="settings-group">
            <h3>颜色</h3>
            <label className="color-row"><span>{timeExperiment ? '运动轨迹' : genericFunction ? '函数曲线' : quadratic ? '抛物线' : '椭圆'}</span><input type="color" value={scene.appearance.curveColor} onChange={(event) => onAppearanceChange('curveColor', event.target.value)} /></label>
            {ellipse && <label className="color-row"><span>焦点</span><input type="color" value={scene.appearance.focusColor} onChange={(event) => onAppearanceChange('focusColor', event.target.value)} /></label>}
            {!genericFunction && <label className="color-row"><span>{timeExperiment ? '运动物体' : quadratic ? '顶点' : '动点'}</span><input type="color" value={scene.appearance.pointColor} onChange={(event) => onAppearanceChange('pointColor', event.target.value)} /></label>}
            {!genericFunction && <label className="color-row"><span>{timeExperiment ? '基准线' : quadratic ? '对称轴' : '辅助线'}</span><input type="color" value={scene.appearance.helperColor} onChange={(event) => onAppearanceChange('helperColor', event.target.value)} /></label>}
          </div>

          {(ellipse || timeExperiment) && (
            <div className="control-block compact-control">
              <div className="control-heading"><label htmlFor="speed-range">动画速度</label><strong>{scene.appearance.animationSpeed.toFixed(2)}×</strong></div>
              <input id="speed-range" className="range-input" type="range" min="0.2" max="2" step="0.05" value={scene.appearance.animationSpeed} onChange={(event) => onAppearanceChange('animationSpeed', Number(event.target.value))} />
            </div>
          )}

          <div className="control-block compact-control">
            <div className="control-heading"><label htmlFor="line-width-range">{timeExperiment ? '轨迹' : genericFunction ? '函数曲线' : quadratic ? '抛物线' : '椭圆'}线宽</label><strong>{scene.appearance.lineWidth.toFixed(0)} px</strong></div>
            <input id="line-width-range" className="range-input" type="range" min="1" max="8" step="1" value={scene.appearance.lineWidth} onChange={(event) => onAppearanceChange('lineWidth', Number(event.target.value))} />
          </div>
        </div>
      )}
    </aside>
  )
}
