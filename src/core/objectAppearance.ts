import type {
  LessonScene,
  ObjectAppearanceOverride,
  SceneObject,
  SceneObjectKind,
} from '../types/lessonScene'

export type ObjectAppearanceKind = 'point' | 'line' | 'label'

const POINT_KINDS = new Set<SceneObjectKind>(['point', 'time-point', 'chart-scatter-series'])
const LINE_KINDS = new Set<SceneObjectKind>([
  'ellipse',
  'parabola',
  'function-curve',
  'relation-curve',
  'locus',
  'vector',
  'constraint',
  'ground-line',
  'segment',
  'ray',
  'arc',
  'polygon',
  'collision-body',
  'contact-surface',
  'chart-bar-series',
  'chart-line-series',
  'trail',
])

const SECONDARY_BODY_COLORS = ['#3B82C4', '#8B5CF6', '#16A085']
const SECONDARY_TRAIL_COLORS = ['#60A5FA', '#A78BFA', '#34D399']
const VECTOR_COLORS = ['#087E8B', '#E08B2D', '#7C3AED', '#D13C64']

export function objectAppearanceKind(object: SceneObject): ObjectAppearanceKind | null {
  if (POINT_KINDS.has(object.kind)) return 'point'
  if (LINE_KINDS.has(object.kind)) return 'line'
  if (object.kind === 'label' || object.kind === 'chart-table-series') return 'label'
  return null
}

export function editableSceneObjects(scene: LessonScene): SceneObject[] {
  return scene.objects.filter((object) => objectAppearanceKind(object) !== null)
}

export function findEditableSceneObject(scene: LessonScene, objectId: string): SceneObject {
  const object = scene.objects.find((candidate) => candidate.id === objectId)
  if (!object) throw new Error(`场景对象不存在：${objectId}`)
  if (!objectAppearanceKind(object)) throw new Error(`对象不支持外观编辑：${object.role}`)
  return object
}

export function objectAppearanceOverride(
  scene: LessonScene,
  objectId: string,
): ObjectAppearanceOverride {
  return scene.appearance.objectStyles?.[objectId] ?? {}
}

export function objectIsVisible(scene: LessonScene, objectId: string): boolean {
  return objectAppearanceOverride(scene, objectId).visible ?? true
}

function objectIndex(scene: LessonScene, kind: SceneObjectKind, objectId: string): number {
  return scene.objects.filter((object) => object.kind === kind).findIndex((object) => object.id === objectId)
}

export function defaultObjectColor(scene: LessonScene, object: SceneObject): string {
  const { appearance } = scene
  if (object.kind === 'point') {
    return object.id === 'focusLeft' || object.id === 'focusRight'
      ? appearance.focusColor
      : appearance.pointColor
  }
  if (object.kind === 'time-point') {
    const index = objectIndex(scene, 'time-point', object.id)
    return index <= 0
      ? appearance.pointColor
      : SECONDARY_BODY_COLORS[(index - 1) % SECONDARY_BODY_COLORS.length]!
  }
  if (object.kind === 'collision-body') {
    const index = objectIndex(scene, 'collision-body', object.id)
    return index <= 0
      ? appearance.pointColor
      : SECONDARY_BODY_COLORS[(index - 1) % SECONDARY_BODY_COLORS.length]!
  }
  if (object.kind === 'trail') {
    const index = objectIndex(scene, 'trail', object.id)
    return index <= 0
      ? appearance.curveColor
      : SECONDARY_TRAIL_COLORS[(index - 1) % SECONDARY_TRAIL_COLORS.length]!
  }
  if (object.kind === 'chart-bar-series' || object.kind === 'chart-line-series' || object.kind === 'chart-scatter-series' || object.kind === 'chart-table-series') {
    const chartSeries = scene.objects.filter((candidate) => ['chart-bar-series', 'chart-line-series', 'chart-scatter-series', 'chart-table-series'].includes(candidate.kind))
    const index = chartSeries.findIndex((candidate) => candidate.id === object.id)
    return index <= 0
      ? appearance.curveColor
      : SECONDARY_BODY_COLORS[(index - 1) % SECONDARY_BODY_COLORS.length]!
  }
  if (object.kind === 'vector') {
    if (object.role === '几何距离') return appearance.helperColor
    const index = objectIndex(scene, 'vector', object.id)
    return VECTOR_COLORS[Math.max(0, index) % VECTOR_COLORS.length]!
  }
  if (object.kind === 'constraint') {
    return object.constraintType === 'spring' ? '#D97706' : appearance.helperColor
  }
  if (object.kind === 'segment' || object.kind === 'ray' || object.kind === 'arc' || object.kind === 'ground-line') return appearance.helperColor
  if (object.kind === 'polygon') return appearance.curveColor
  if (object.kind === 'contact-surface') return appearance.helperColor
  if (object.kind === 'label') return appearance.pointColor
  return appearance.curveColor
}

export function resolvedObjectColor(scene: LessonScene, object: SceneObject): string {
  return objectAppearanceOverride(scene, object.id).color ?? defaultObjectColor(scene, object)
}

function allowedKeys(kind: ObjectAppearanceKind): Set<keyof ObjectAppearanceOverride> {
  if (kind === 'point') return new Set(['color', 'pointRadius', 'pointStyle', 'visible'])
  if (kind === 'line') return new Set(['color', 'lineWidth', 'lineStyle', 'visible'])
  return new Set(['color', 'fontScale', 'visible'])
}

export function updateObjectAppearance(
  scene: LessonScene,
  objectId: string,
  patch: Partial<ObjectAppearanceOverride>,
): LessonScene {
  const object = findEditableSceneObject(scene, objectId)
  const kind = objectAppearanceKind(object)!
  const allowed = allowedKeys(kind)
  for (const key of Object.keys(patch) as Array<keyof ObjectAppearanceOverride>) {
    if (!allowed.has(key)) throw new Error(`${object.role}不支持修改 ${key}`)
  }

  const next = structuredClone(scene)
  const current = next.appearance.objectStyles?.[objectId] ?? {}
  const merged: ObjectAppearanceOverride = { ...current, ...patch }
  for (const key of Object.keys(merged) as Array<keyof ObjectAppearanceOverride>) {
    if (merged[key] === undefined) delete merged[key]
  }
  next.appearance.objectStyles = { ...(next.appearance.objectStyles ?? {}) }
  if (Object.keys(merged).length === 0) delete next.appearance.objectStyles[objectId]
  else next.appearance.objectStyles[objectId] = merged
  if (Object.keys(next.appearance.objectStyles).length === 0) delete next.appearance.objectStyles
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function resetObjectAppearance(scene: LessonScene, objectId: string): LessonScene {
  findEditableSceneObject(scene, objectId)
  const next = structuredClone(scene)
  if (next.appearance.objectStyles) {
    delete next.appearance.objectStyles[objectId]
    if (Object.keys(next.appearance.objectStyles).length === 0) delete next.appearance.objectStyles
  }
  next.lineage.updatedAt = new Date().toISOString()
  return next
}
