import { useEffect, useState } from 'react'
import {
  activeStylePresetId,
  LAYOUT_PRESETS,
  layoutPresetOf,
  presetPreview,
  STYLE_PRESETS,
  type StylePresetId,
} from '../core/appearancePresets'
import type { LayoutPresetId, LessonScene } from '../types/lessonScene'

interface AppearancePresetsPanelProps {
  scene: LessonScene
  onApplyStyle: (presetId: StylePresetId, resetObjectStyles: boolean) => void
  onApplyLayout: (presetId: LayoutPresetId) => void
  onReset: (resetObjectStyles: boolean) => void
}

export function AppearancePresetsPanel({
  scene,
  onApplyStyle,
  onApplyLayout,
  onReset,
}: AppearancePresetsPanelProps) {
  const activeStyle = activeStylePresetId(scene)
  const activeLayout = layoutPresetOf(scene.appearance)
  const [styleChoice, setStyleChoice] = useState<StylePresetId>(activeStyle ?? 'teaching-clean')
  const [layoutChoice, setLayoutChoice] = useState<LayoutPresetId>(activeLayout)
  const [resetObjectStyles, setResetObjectStyles] = useState(false)

  useEffect(() => {
    if (activeStyle) setStyleChoice(activeStyle)
  }, [activeStyle])

  useEffect(() => setLayoutChoice(activeLayout), [activeLayout])

  return (
    <div className="appearance-presets" data-active-style-preset={activeStyle ?? 'custom'} data-active-layout-preset={activeLayout}>
      <div className="preset-heading">
        <div><h3>样式预设</h3><p>先选择预览，再应用到场景。全部在本地完成，AI token：0。</p></div>
        <span>{activeStyle ? STYLE_PRESETS.find((item) => item.id === activeStyle)?.label : '自定义'}</span>
      </div>

      <div className="style-preset-grid" aria-label="样式预设">
        {STYLE_PRESETS.map((preset) => {
          const preview = presetPreview(scene, preset.id)
          return (
            <button
              key={preset.id}
              type="button"
              className={styleChoice === preset.id ? 'active' : ''}
              aria-pressed={styleChoice === preset.id}
              data-style-preset-id={preset.id}
              onClick={() => setStyleChoice(preset.id)}
            >
              <span className={`preset-mini-canvas preset-mini-canvas--${preview.theme}`} aria-hidden="true">
                <i style={{ borderColor: preview.colors[0], borderWidth: Math.min(4, preview.lineWidth) }} />
                <b style={{ backgroundColor: preview.colors[1], width: preview.pointRadius, height: preview.pointRadius }} />
                <em>{preview.colors.map((color) => <u key={color} style={{ backgroundColor: color }} />)}</em>
              </span>
              <strong>{preset.label}</strong>
              <small>{preset.description}</small>
              {activeStyle === preset.id && <mark>当前</mark>}
            </button>
          )
        })}
      </div>

      <label className="preset-object-reset">
        <input type="checkbox" checked={resetObjectStyles} onChange={(event) => setResetObjectStyles(event.target.checked)} />
        <span>同时清除对象局部样式</span>
      </label>
      <div className="preset-action-row">
        <button
          className="preset-apply-button"
          type="button"
          disabled={styleChoice === activeStyle && (!resetObjectStyles || !scene.appearance.objectStyles)}
          onClick={() => onApplyStyle(styleChoice, resetObjectStyles)}
        >
          应用“{STYLE_PRESETS.find((item) => item.id === styleChoice)?.label}”
        </button>
        <button className="preset-reset-button" type="button" onClick={() => onReset(resetObjectStyles)}>恢复模板外观</button>
      </div>

      <div className="preset-heading preset-heading--layout">
        <div><h3>布局预设</h3><p>控制画布、测量值与参数区的组合方式。</p></div>
      </div>
      <div className="layout-preset-grid" aria-label="布局预设">
        {LAYOUT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={layoutChoice === preset.id ? 'active' : ''}
            aria-pressed={layoutChoice === preset.id}
            data-layout-preset-id={preset.id}
            onClick={() => setLayoutChoice(preset.id)}
          >
            <i className={`layout-preset-icon layout-preset-icon--${preset.id}`} aria-hidden="true"><b /><em /><span /></i>
            <span><strong>{preset.label}</strong><small>{preset.description}</small></span>
            {activeLayout === preset.id && <mark>当前</mark>}
          </button>
        ))}
      </div>
      <button
        className="layout-apply-button"
        type="button"
        disabled={layoutChoice === activeLayout}
        onClick={() => onApplyLayout(layoutChoice)}
      >
        应用“{LAYOUT_PRESETS.find((item) => item.id === layoutChoice)?.label}”布局
      </button>
    </div>
  )
}
