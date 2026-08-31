import type { LessonPlan } from './modelGateway'

type Identified = { id: string }

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function valueText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function changedFields(
  before: object,
  after: object,
  fields: Array<[string, string]>,
): string[] {
  const beforeRecord = before as Record<string, unknown>
  const afterRecord = after as Record<string, unknown>
  return fields
    .filter(([field]) => !same(beforeRecord[field], afterRecord[field]))
    .map(([field, label]) => `${label} ${valueText(beforeRecord[field])} → ${valueText(afterRecord[field])}`)
}

function collectionChanges<T extends Identified>(
  before: T[],
  after: T[],
  noun: string,
  describeUpdate: (previous: T, next: T) => string[],
): string[] {
  const changes: string[] = []
  const beforeById = new Map(before.map((item) => [item.id, item]))
  const afterById = new Map(after.map((item) => [item.id, item]))
  for (const item of after) {
    const previous = beforeById.get(item.id)
    if (!previous) {
      changes.push(`新增${noun}：${item.id}`)
      continue
    }
    const details = describeUpdate(previous, item)
    if (details.length > 0) changes.push(`${noun} ${item.id}：${details.join('；')}`)
  }
  for (const item of before) {
    if (!afterById.has(item.id)) changes.push(`移除${noun}：${item.id}`)
  }
  return changes
}

function parameterChanges(
  before: Array<{ id: string; label: string; value: number; min: number; max: number; step: number }>,
  after: Array<{ id: string; label: string; value: number; min: number; max: number; step: number }>,
): string[] {
  return collectionChanges(before, after, '参数', (previous, next) => changedFields(
    previous,
    next,
    [
      ['label', '名称'], ['value', '当前值'], ['min', '下限'],
      ['max', '上限'], ['step', '步长'],
    ],
  ))
}

function functionChanges(before: NonNullable<LessonPlan['functionSpec']>, after: NonNullable<LessonPlan['functionSpec']>): string[] {
  const changes: string[] = []
  if (before.expression !== after.expression) changes.push(`函数表达式：${before.expression} → ${after.expression}`)
  if (before.formula !== after.formula) changes.push('函数公式说明已更新')
  if (before.xMin !== after.xMin || before.xMax !== after.xMax) {
    changes.push(`定义域：[${before.xMin}, ${before.xMax}] → [${after.xMin}, ${after.xMax}]`)
  }
  changes.push(...parameterChanges(before.parameters, after.parameters))
  return changes
}

function relationChanges(before: NonNullable<LessonPlan['relationSpec']>, after: NonNullable<LessonPlan['relationSpec']>): string[] {
  const changes: string[] = []
  changes.push(...changedFields(before, after, [
    ['mode', '曲线类型'], ['formula', '公式说明'], ['conclusion', '观察结论'],
    ['xMin', '视口 x 下限'], ['xMax', '视口 x 上限'],
    ['yMin', '视口 y 下限'], ['yMax', '视口 y 上限'],
    ['variableMin', '变量下限'], ['variableMax', '变量上限'],
    ['xExpression', 'x 表达式'], ['yExpression', 'y 表达式'],
    ['radialExpression', '极径表达式'], ['implicitExpression', '隐函数表达式'],
  ]))
  changes.push(...parameterChanges(before.parameters, after.parameters))
  return changes
}

function experimentChanges(
  before: NonNullable<LessonPlan['experimentSpec']>,
  after: NonNullable<LessonPlan['experimentSpec']>,
): string[] {
  const changes: string[] = []
  if ((before.bodyId ?? 'primary') !== (after.bodyId ?? 'primary')) {
    changes.push(`主运动点 ID：${before.bodyId ?? 'primary'} → ${after.bodyId ?? 'primary'}`)
  }
  if ((before.bodyLabel ?? '运动物体') !== (after.bodyLabel ?? '运动物体')) {
    changes.push(`主运动点标签：${before.bodyLabel ?? '运动物体'} → ${after.bodyLabel ?? '运动物体'}`)
  }
  if (before.durationExpression !== after.durationExpression) changes.push('运行时长表达式已更新')
  if (before.xExpression !== after.xExpression || before.yExpression !== after.yExpression) {
    changes.push('主运动点轨迹表达式已更新')
  }
  if (before.formula !== after.formula) changes.push('实验公式说明已更新')
  if (before.conclusion !== after.conclusion) changes.push('观察结论已更新')
  changes.push(...parameterChanges(before.parameters, after.parameters))
  changes.push(...collectionChanges(
    before.additionalBodies ?? [],
    after.additionalBodies ?? [],
    '运动点',
    (previous, next) => changedFields(previous, next, [
      ['label', '标签'], ['xExpression', 'x(t)'], ['yExpression', 'y(t)'],
    ]),
  ))
  changes.push(...collectionChanges(before.metrics, after.metrics, '测量量', (previous, next) => changedFields(
    previous,
    next,
    [['label', '标签'], ['expression', '表达式'], ['unit', '单位']],
  )))
  changes.push(...collectionChanges(before.vectors, after.vectors, '矢量/距离', (previous, next) => {
    const normalizedPrevious = {
      ...previous,
      bodyId: previous.bodyId ?? before.bodyId ?? 'primary',
      display: previous.display ?? 'arrow',
      labelMode: previous.labelMode ?? 'full',
    }
    const normalizedNext = {
      ...next,
      bodyId: next.bodyId ?? after.bodyId ?? 'primary',
      display: next.display ?? 'arrow',
      labelMode: next.labelMode ?? 'full',
    }
    const details = changedFields(normalizedPrevious, normalizedNext, [
      ['label', '标签'], ['bodyId', '绑定点'],
    ])
    if (normalizedPrevious.display !== normalizedNext.display) {
      const displayName = (value: string) => value === 'distance' ? '距离直线' : '箭头'
      details.push(`线型 ${displayName(normalizedPrevious.display)} → ${displayName(normalizedNext.display)}`)
    }
    if (normalizedPrevious.labelMode !== normalizedNext.labelMode) {
      const modeName = (value: string) => value === 'value' ? '仅数值' : '标签、数值和单位'
      details.push(`标注 ${modeName(normalizedPrevious.labelMode)} → ${modeName(normalizedNext.labelMode)}`)
    }
    details.push(...changedFields(normalizedPrevious, normalizedNext, [
      ['unit', '单位'], ['scale', '比例'],
      ['xExpression', 'x 分量'], ['yExpression', 'y 分量'],
    ]))
    return details
  }))
  changes.push(...collectionChanges(
    before.constraints ?? [],
    after.constraints ?? [],
    '约束',
    (previous, next) => changedFields(previous, next, [
      ['label', '标签'], ['type', '类型'], ['bodyId', '绑定点'],
      ['anchorXExpression', '锚点 x'], ['anchorYExpression', '锚点 y'],
      ['restLengthExpression', '自然长度'],
    ]),
  ))
  return changes
}

function geometryChanges(
  before: NonNullable<LessonPlan['geometrySpec']>,
  after: NonNullable<LessonPlan['geometrySpec']>,
): string[] {
  const changes: string[] = []
  if (before.formula !== after.formula) changes.push('几何公式说明已更新')
  if (before.conclusion !== after.conclusion) changes.push('观察结论已更新')
  changes.push(...parameterChanges(before.parameters, after.parameters))
  changes.push(...collectionChanges(before.points, after.points, '几何点', (previous, next) => changedFields(
    previous, next,
    [['label', '标签'], ['xExpression', 'x 坐标'], ['yExpression', 'y 坐标'], ['draggable', '可拖动'], ['construction', '构造方式'], ['constraint', '运动约束']],
  )))
  changes.push(...collectionChanges(before.connections, after.connections, '几何连线', (previous, next) => changedFields(
    previous, next,
    [['label', '标签'], ['kind', '类型'], ['fromPointId', '起点'], ['toPointId', '终点']],
  )))
  changes.push(...collectionChanges(before.arcs, after.arcs, '圆弧', (previous, next) => changedFields(
    previous, next,
    [['label', '标签'], ['centerPointId', '中心'], ['startPointId', '起始方向'], ['endPointId', '终止方向'], ['clockwise', '顺时针']],
  )))
  changes.push(...collectionChanges(before.polygons, after.polygons, '多边形', (previous, next) => changedFields(
    previous, next,
    [['label', '标签'], ['pointIds', '顶点'], ['filled', '填充']],
  )))
  changes.push(...collectionChanges(before.measurements, after.measurements, '几何测量', (previous, next) => changedFields(
    previous, next,
    [['label', '标签'], ['kind', '类型'], ['pointIds', '引用点'], ['expression', '表达式'], ['unit', '单位']],
  )))
  changes.push(...collectionChanges(before.loci ?? [], after.loci ?? [], '几何轨迹', (previous, next) => changedFields(
    previous, next,
    [['label', '标签'], ['pointId', '目标点'], ['parameterId', '驱动参数'], ['min', '采样下限'], ['max', '采样上限']],
  )))
  return changes
}

function collisionChanges(
  before: NonNullable<LessonPlan['collisionSpec']>,
  after: NonNullable<LessonPlan['collisionSpec']>,
): string[] {
  const changes: string[] = []
  if (before.formula !== after.formula) changes.push('碰撞公式说明已更新')
  if (before.conclusion !== after.conclusion) changes.push('观察结论已更新')
  changes.push(...changedFields(before, after, [
    ['durationExpression', '实验时长'],
    ['gravityXExpression', '水平重力'],
    ['gravityYExpression', '竖直重力'],
    ['restitutionExpression', '恢复系数'],
    ['bounds', '接触边界'],
  ]))
  changes.push(...parameterChanges(before.parameters, after.parameters))
  changes.push(...collectionChanges(before.bodies, after.bodies, '碰撞物体', (previous, next) => changedFields(
    previous,
    next,
    [
      ['label', '标签'], ['xExpression', '初始 x'], ['yExpression', '初始 y'],
      ['vxExpression', '初始 vx'], ['vyExpression', '初始 vy'],
      ['radiusExpression', '半径'], ['massExpression', '质量'],
    ],
  )))
  return changes
}

function dataChartChanges(
  before: NonNullable<LessonPlan['dataChartSpec']>,
  after: NonNullable<LessonPlan['dataChartSpec']>,
): string[] {
  const changes = changedFields(before, after, [
    ['mode', '图表类型'], ['formula', '图表说明'], ['conclusion', '观察结论'],
    ['xLabel', '横轴名称'], ['yLabel', '纵轴名称'], ['unit', '单位'], ['categories', '类别'],
  ])
  changes.push(...collectionChanges(before.series, after.series, '数据系列', (previous, next) => changedFields(
    previous, next, [['label', '名称'], ['values', '数值'], ['points', '散点']],
  )))
  return changes
}

export function describeLessonPlanChanges(
  before: LessonPlan,
  after: LessonPlan,
  limit = 10,
): string[] {
  const changes: string[] = []
  if (before.topic !== after.topic) changes.push(`主题：${before.topic} → ${after.topic}`)
  if (before.reason !== after.reason) changes.push('场景摘要已更新')

  const overrideKeys = new Set([
    ...Object.keys(before.parameterOverrides),
    ...Object.keys(after.parameterOverrides),
  ])
  for (const key of [...overrideKeys].sort()) {
    if (before.parameterOverrides[key as keyof LessonPlan['parameterOverrides']] !== after.parameterOverrides[key as keyof LessonPlan['parameterOverrides']]) {
      changes.push(`模板参数 ${key}：${valueText(before.parameterOverrides[key as keyof LessonPlan['parameterOverrides']])} → ${valueText(after.parameterOverrides[key as keyof LessonPlan['parameterOverrides']])}`)
    }
  }

  if (before.functionSpec && after.functionSpec) {
    changes.push(...functionChanges(before.functionSpec, after.functionSpec))
  }
  if (before.relationSpec && after.relationSpec) {
    changes.push(...relationChanges(before.relationSpec, after.relationSpec))
  }
  if (before.experimentSpec && after.experimentSpec) {
    changes.push(...experimentChanges(before.experimentSpec, after.experimentSpec))
  }
  if (before.geometrySpec && after.geometrySpec) {
    changes.push(...geometryChanges(before.geometrySpec, after.geometrySpec))
  }
  if (before.collisionSpec && after.collisionSpec) {
    changes.push(...collisionChanges(before.collisionSpec, after.collisionSpec))
  }
  if (before.dataChartSpec && after.dataChartSpec) {
    changes.push(...dataChartChanges(before.dataChartSpec, after.dataChartSpec))
  }

  if (changes.length <= limit) return changes
  return [...changes.slice(0, Math.max(1, limit - 1)), `另有 ${changes.length - limit + 1} 项结构修改`]
}
