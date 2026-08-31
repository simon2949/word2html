import {
  helperLineStyleOf,
  helperLineWidthOf,
  lineStyleOf,
  lineWidthOf,
  pointRadiusOf,
  pointStyleOf,
} from '../core/appearanceStyles'
import {
  editableSceneObjects,
  objectAppearanceKind,
  objectAppearanceOverride,
  resolvedObjectColor,
} from '../core/objectAppearance'
import type {
  LessonScene,
  LineStyle,
  ObjectAppearanceOverride,
  PointStyle,
  SceneObject,
} from '../types/lessonScene'

interface ObjectPropertiesPanelProps {
  scene: LessonScene
  selectedObjectId: string | null
  onSelect: (objectId: string | null) => void
  onChange: (objectId: string, patch: Partial<ObjectAppearanceOverride>) => void
  onReset: (objectId: string) => void
}

const LINE_OPTIONS: Array<{ value: LineStyle; label: string }> = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dash-dot', label: '点划线' },
]

const POINT_OPTIONS: Array<{ value: PointStyle; label: string }> = [
  { value: 'solid', label: '实心' },
  { value: 'outlined', label: '轮廓' },
  { value: 'shadow', label: '投影' },
]

function objectIcon(object: SceneObject): string {
  const kind = objectAppearanceKind(object)
  if (kind === 'point') return '●'
  if (kind === 'label') return 'T'
  return object.kind === 'collision-body' ? '◉' : object.kind === 'contact-surface' ? '▱' : object.kind === 'vector' ? '↗' : object.kind === 'constraint' ? '⌁' : '╱'
}

function usesHelperDefaults(object: SceneObject): boolean {
  return ['segment', 'ray', 'arc', 'vector', 'constraint', 'ground-line', 'contact-surface'].includes(object.kind)
}

function ChoiceButtons<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="object-choice-block">
      <span>{label}</span>
      <div className="object-choice-grid" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={option.value === value ? 'active' : ''}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ObjectPropertiesPanel({
  scene,
  selectedObjectId,
  onSelect,
  onChange,
  onReset,
}: ObjectPropertiesPanelProps) {
  const objects = editableSceneObjects(scene)
  const selected = objects.find((object) => object.id === selectedObjectId) ?? null
  const override = selected ? objectAppearanceOverride(scene, selected.id) : {}
  const kind = selected ? objectAppearanceKind(selected) : null
  const hasOverride = Object.keys(override).length > 0

  return (
    <div className="object-properties-panel">
      <div className="setting-scope-card setting-scope-card--object">
        <span>对象细调</span>
        <strong>只修改一个具体对象</strong>
        <p>点击画布对象或从列表选择。局部设置优先于“显示效果”中的整体默认值，AI token：0。</p>
      </div>

      <div className="scene-object-list" aria-label="可编辑场景对象">
        {objects.map((object) => {
          const visible = objectAppearanceOverride(scene, object.id).visible ?? true
          return (
            <button
              key={object.id}
              type="button"
              className={selected?.id === object.id ? 'active' : ''}
              aria-pressed={selected?.id === object.id}
              onClick={() => onSelect(object.id)}
            >
              <i aria-hidden="true">{objectIcon(object)}</i>
              <span><strong>{object.label ?? object.role}</strong><small>{object.id}</small></span>
              <em title={visible ? '已显示' : '已隐藏'}>{visible ? '◉' : '○'}</em>
            </button>
          )
        })}
      </div>

      {!selected ? (
        <div className="object-empty-state">
          <span aria-hidden="true">◇</span>
          <strong>请选择一个对象</strong>
          <p>可以分别修改两个焦点、两条距离线、函数曲线或不同实验物体。</p>
        </div>
      ) : (
        <div className="object-inspector" data-selected-object-id={selected.id}>
          <div className="object-inspector-heading">
            <div>
              <span>{selected.kind}</span><h3>{selected.label ?? selected.role}</h3><small>{selected.id}</small>
              <em className={hasOverride ? 'has-local-override' : ''}>{hasOverride ? `已有 ${Object.keys(override).length} 项局部设置` : '当前继承整体设置'}</em>
            </div>
            <button type="button" onClick={() => onSelect(null)} aria-label="取消对象选择">×</button>
          </div>

          <label className="toggle-row object-visible-toggle">
            <span>局部显示状态</span>
            <input
              type="checkbox"
              checked={override.visible ?? true}
              onChange={(event) => onChange(selected.id, { visible: event.target.checked })}
            />
            <span className="toggle-track" aria-hidden="true"><span /></span>
          </label>

          <label className="color-row object-color-row">
            <span>局部颜色</span>
            <input
              aria-label={`${selected.label ?? selected.role}颜色`}
              type="color"
              value={resolvedObjectColor(scene, selected)}
              onChange={(event) => onChange(selected.id, { color: event.target.value })}
            />
          </label>

          {kind === 'point' && (
            <>
              <div className="control-block compact-control">
                <div className="control-heading"><label htmlFor="object-point-radius">局部点大小</label><strong>{pointRadiusOf(scene.appearance, selected.id).toFixed(0)} px</strong></div>
                <input
                  id="object-point-radius"
                  className="range-input"
                  type="range"
                  min="3"
                  max="18"
                  step="1"
                  value={pointRadiusOf(scene.appearance, selected.id)}
                  onChange={(event) => onChange(selected.id, { pointRadius: Number(event.target.value) })}
                />
              </div>
              <ChoiceButtons<PointStyle>
                label="局部点样式"
                value={pointStyleOf(scene.appearance, selected.id)}
                options={POINT_OPTIONS}
                onChange={(value) => onChange(selected.id, { pointStyle: value })}
              />
            </>
          )}

          {kind === 'line' && (() => {
            const helper = usesHelperDefaults(selected)
            const width = helper
              ? helperLineWidthOf(scene.appearance, 2.25, selected.id)
              : lineWidthOf(scene.appearance, selected.id)
            const style = helper
              ? helperLineStyleOf(scene.appearance, 'dashed', selected.id)
              : lineStyleOf(scene.appearance, selected.id)
            return (
              <>
                <div className="control-block compact-control">
                  <div className="control-heading"><label htmlFor="object-line-width">局部线宽</label><strong>{width.toFixed(1)} px</strong></div>
                  <input
                    id="object-line-width"
                    className="range-input"
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={width}
                    onChange={(event) => onChange(selected.id, { lineWidth: Number(event.target.value) })}
                  />
                </div>
                <ChoiceButtons<LineStyle>
                  label="局部线型"
                  value={style}
                  options={LINE_OPTIONS}
                  onChange={(value) => onChange(selected.id, { lineStyle: value })}
                />
              </>
            )
          })()}

          {kind === 'label' && (
            <div className="control-block compact-control">
              <div className="control-heading"><label htmlFor="object-font-scale">局部文字大小</label><strong>{(override.fontScale ?? scene.appearance.fontScale).toFixed(2)}×</strong></div>
              <input
                id="object-font-scale"
                className="range-input"
                type="range"
                min="0.8"
                max="1.5"
                step="0.05"
                value={override.fontScale ?? scene.appearance.fontScale}
                onChange={(event) => onChange(selected.id, { fontScale: Number(event.target.value) })}
              />
            </div>
          )}

          <button
            className="object-reset-button"
            type="button"
            disabled={!hasOverride}
            onClick={() => onReset(selected.id)}
          >
            清除局部设置，恢复整体样式
          </button>
        </div>
      )}
    </div>
  )
}
