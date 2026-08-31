import { resetSceneValues } from './ellipse'
import { GENERIC_FUNCTION_TEMPLATE_ID, resetGenericFunctionScene } from './genericFunction'
import { QUADRATIC_TEMPLATE_ID, resetQuadraticScene } from './quadratic'
import { TIME_EXPERIMENT_TEMPLATE_ID, resetTimeExperimentScene } from './timeExperiment'
import { ELLIPSE_TEMPLATE_ID } from '../templates/ellipseTemplate'
import { DATA_CHART_2D_TEMPLATE_ID, resetDataChartScene } from './dataChart2d'
import type {
  LayoutPresetId,
  LessonScene,
  LineStyle,
  PointStyle,
  SceneAppearance,
} from '../types/lessonScene'

export type StylePresetId =
  | 'teaching-clean'
  | 'focus-emphasis'
  | 'projected-high-contrast'
  | 'dark-presentation'
  | 'print-friendly'

export interface StylePresetDefinition {
  id: StylePresetId
  label: string
  description: string
}

export interface LayoutPresetDefinition {
  id: LayoutPresetId
  label: string
  description: string
}

type StylePresetPatch = Pick<
  SceneAppearance,
  | 'theme'
  | 'curveColor'
  | 'focusColor'
  | 'pointColor'
  | 'helperColor'
  | 'lineWidth'
  | 'lineStyle'
  | 'helperLineWidth'
  | 'helperLineStyle'
  | 'pointRadius'
  | 'pointStyle'
  | 'fontScale'
>

export const STYLE_PRESETS: readonly StylePresetDefinition[] = [
  { id: 'teaching-clean', label: '教学简洁', description: '清晰网格与克制配色，适合日常讲解。' },
  { id: 'focus-emphasis', label: '重点突出', description: '提高主图、重点对象与标签的视觉层级。' },
  { id: 'projected-high-contrast', label: '投影高对比', description: '加粗线条和投影点，适合教室投影。' },
  { id: 'dark-presentation', label: '深色演示', description: '暗色画布与高亮配色，适合低光环境。' },
  { id: 'print-friendly', label: '打印友好', description: '黑灰线条与轮廓点，适合纸面和灰度打印。' },
] as const

export const LAYOUT_PRESETS: readonly LayoutPresetDefinition[] = [
  { id: 'centered', label: '图像居中', description: '突出画布，隐藏测量卡和参数区。' },
  { id: 'with-metrics', label: '图像 + 测量值', description: '显示画布与测量结论，不显示参数区。' },
  { id: 'with-parameters', label: '图像 + 参数区', description: '完整展示画布、测量值和可调参数。' },
  { id: 'compact', label: '紧凑控制', description: '缩小留白和控制区，适合较窄窗口。' },
] as const

function teachingCleanPatch(scene: LessonScene): StylePresetPatch {
  if (scene.templateRef.id === TIME_EXPERIMENT_TEMPLATE_ID) {
    return {
      theme: 'light', curveColor: '#5B5BD6', focusColor: '#E15C48',
      pointColor: '#E15C48', helperColor: '#64748B', lineWidth: 3,
      lineStyle: 'solid', helperLineWidth: 3, helperLineStyle: 'solid',
      pointRadius: 8, pointStyle: 'shadow', fontScale: 1,
    }
  }
  const helperLineWidth = scene.templateRef.id === ELLIPSE_TEMPLATE_ID ? 2.25 : 2
  const helperLineStyle: LineStyle = scene.templateRef.id === GENERIC_FUNCTION_TEMPLATE_ID ? 'solid' : 'dashed'
  return {
    theme: 'light', curveColor: '#5B5BD6', focusColor: '#E15C48',
    pointColor: '#087E8B', helperColor: '#F3A712', lineWidth: 3,
    lineStyle: 'solid', helperLineWidth, helperLineStyle,
    pointRadius: 7, pointStyle: 'outlined', fontScale: 1,
  }
}

export function stylePresetPatch(scene: LessonScene, presetId: StylePresetId): StylePresetPatch {
  if (presetId === 'teaching-clean') return teachingCleanPatch(scene)
  if (presetId === 'focus-emphasis') {
    return {
      theme: 'light', curveColor: '#4F46C8', focusColor: '#D9473F',
      pointColor: '#007C83', helperColor: '#D88700', lineWidth: 4,
      lineStyle: 'solid', helperLineWidth: 2.75, helperLineStyle: 'dashed',
      pointRadius: 10, pointStyle: 'outlined', fontScale: 1.1,
    }
  }
  if (presetId === 'projected-high-contrast') {
    return {
      theme: 'light', curveColor: '#25206F', focusColor: '#C92824',
      pointColor: '#006A70', helperColor: '#9A5A00', lineWidth: 5,
      lineStyle: 'solid', helperLineWidth: 4, helperLineStyle: 'dash-dot',
      pointRadius: 12, pointStyle: 'shadow', fontScale: 1.2,
    }
  }
  if (presetId === 'dark-presentation') {
    return {
      theme: 'dark', curveColor: '#A9A7FF', focusColor: '#FF7A70',
      pointColor: '#5EEAD4', helperColor: '#F6C453', lineWidth: 3.5,
      lineStyle: 'solid', helperLineWidth: 2.5, helperLineStyle: 'dashed',
      pointRadius: 9, pointStyle: 'shadow', fontScale: 1.08,
    }
  }
  return {
    theme: 'light', curveColor: '#111111', focusColor: '#444444',
    pointColor: '#111111', helperColor: '#666666', lineWidth: 2.5,
    lineStyle: 'solid', helperLineWidth: 1.5, helperLineStyle: 'dashed',
    pointRadius: 7, pointStyle: 'outlined', fontScale: 1.05,
  }
}

export function activeStylePresetId(scene: LessonScene): StylePresetId | null {
  for (const preset of STYLE_PRESETS) {
    const patch = stylePresetPatch(scene, preset.id)
    const matches = (Object.entries(patch) as Array<[keyof StylePresetPatch, StylePresetPatch[keyof StylePresetPatch]]>)
      .every(([key, value]) => scene.appearance[key] === value)
    if (matches) return preset.id
  }
  return null
}

export function layoutPresetOf(appearance: SceneAppearance): LayoutPresetId {
  return appearance.layoutPreset ?? 'with-parameters'
}

export function applyStylePreset(
  scene: LessonScene,
  presetId: StylePresetId,
  resetObjectStyles = false,
): LessonScene {
  const next = structuredClone(scene)
  Object.assign(next.appearance, stylePresetPatch(scene, presetId))
  if (resetObjectStyles) delete next.appearance.objectStyles
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function applyLayoutPreset(scene: LessonScene, presetId: LayoutPresetId): LessonScene {
  const next = structuredClone(scene)
  next.appearance.layoutPreset = presetId
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

function resetScene(scene: LessonScene): LessonScene {
  if (scene.templateRef.id === ELLIPSE_TEMPLATE_ID) return resetSceneValues(scene)
  if (scene.templateRef.id === QUADRATIC_TEMPLATE_ID) return resetQuadraticScene(scene)
  if (scene.templateRef.id === GENERIC_FUNCTION_TEMPLATE_ID) return resetGenericFunctionScene(scene)
  if (scene.templateRef.id === TIME_EXPERIMENT_TEMPLATE_ID) return resetTimeExperimentScene(scene)
  if (scene.templateRef.id === DATA_CHART_2D_TEMPLATE_ID) return resetDataChartScene(scene)
  return structuredClone(scene)
}

export function resetAppearanceToTemplate(
  scene: LessonScene,
  resetObjectStyles = false,
): LessonScene {
  const next = structuredClone(scene)
  const objectStyles = structuredClone(scene.appearance.objectStyles)
  next.appearance = resetScene(scene).appearance
  next.appearance.layoutPreset = 'with-parameters'
  if (!resetObjectStyles && objectStyles && Object.keys(objectStyles).length > 0) {
    next.appearance.objectStyles = objectStyles
  } else {
    delete next.appearance.objectStyles
  }
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function presetPreview(scene: LessonScene, presetId: StylePresetId): {
  colors: [string, string, string, string]
  lineWidth: number
  pointRadius: number
  pointStyle: PointStyle
  theme: 'light' | 'dark'
} {
  const patch = stylePresetPatch(scene, presetId)
  return {
    colors: [patch.curveColor, patch.pointColor, patch.focusColor, patch.helperColor],
    lineWidth: patch.lineWidth,
    pointRadius: patch.pointRadius,
    pointStyle: patch.pointStyle ?? 'outlined',
    theme: patch.theme,
  }
}
