import { describe, expect, it } from 'vitest'
import type { LessonPlan } from './modelGateway'
import { describeLessonPlanChanges } from './lessonPlanDiff'

function hyperbolaPlan(): LessonPlan {
  return {
    schemaVersion: '0.1', status: 'matched', subject: 'math',
    topic: '双曲线焦点距离差', templateId: 'experiment.motion.point-2d',
    parameterOverrides: {}, reason: '演示双曲线焦点性质。',
    experimentSpec: {
      durationExpression: 'T', bodyId: 'right', bodyLabel: '右支动点 P',
      xExpression: 'exp(t)', yExpression: 't', formula: 'x^2/a^2-y^2/b^2=1',
      conclusion: '焦点距离差保持不变。',
      parameters: [{ id: 'T', label: '时长', value: 4, min: 2, max: 8, step: 0.5 }],
      metrics: [], constraints: [],
      additionalBodies: [{ id: 'left', label: '左支动点 Q', xExpression: '0-exp(t)', yExpression: 't' }],
      vectors: [{
        id: 'toFocus', label: 'PF1', bodyId: 'right', xExpression: '0-exp(t)',
        yExpression: '0-t', scale: 1, unit: '长度单位', display: 'distance',
      }],
    },
  }
}

describe('LessonPlan semantic changes', () => {
  it('describes label and distance annotation edits in user-facing terms', () => {
    const before = hyperbolaPlan()
    const after = structuredClone(before)
    after.experimentSpec!.bodyLabel = 'P'
    after.experimentSpec!.additionalBodies![0]!.label = 'Q'
    after.experimentSpec!.vectors[0]!.labelMode = 'value'

    expect(describeLessonPlanChanges(before, after)).toEqual([
      '主运动点标签：右支动点 P → P',
      '运动点 left：标签 左支动点 Q → Q',
      '矢量/距离 toFocus：标注 标签、数值和单位 → 仅数值',
    ])
  })

  it('treats omitted vector defaults as semantically unchanged', () => {
    const before = hyperbolaPlan()
    const after = structuredClone(before)
    delete before.experimentSpec!.vectors[0]!.display
    after.experimentSpec!.vectors[0]!.display = 'arrow'
    after.experimentSpec!.vectors[0]!.labelMode = 'full'

    expect(describeLessonPlanChanges(before, after)).toEqual([])
  })

  it('returns no changes for an identical plan and caps long summaries', () => {
    const before = hyperbolaPlan()
    expect(describeLessonPlanChanges(before, structuredClone(before))).toEqual([])

    const after = structuredClone(before)
    after.topic = '新主题'
    after.reason = '新摘要'
    after.experimentSpec!.bodyLabel = 'P'
    expect(describeLessonPlanChanges(before, after, 2)).toEqual([
      '主题：双曲线焦点距离差 → 新主题',
      '另有 2 项结构修改',
    ])
  })
})
