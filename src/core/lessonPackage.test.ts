import { describe, expect, it } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import {
  instantiateLessonPlan,
  lessonPlanFromScene,
  type LessonPlan,
} from './modelGateway'
import {
  createLessonPackage,
  createLessonPackageFromScene,
  parseLessonImport,
} from './lessonPackage'
import { updateTimeExperimentParameter } from './timeExperiment'

function ellipsePlan(): LessonPlan {
  return {
    schemaVersion: '0.1',
    status: 'matched',
    subject: 'math',
    topic: '椭圆焦点距离和',
    templateId: 'math.conic.ellipse-focus-sum',
    parameterOverrides: { majorAxis: 12, minorAxis: 8 },
    reason: '复用审核过的椭圆模板。',
  }
}

function distanceExperimentPlan(): LessonPlan {
  return {
    schemaVersion: '0.1',
    status: 'matched',
    subject: 'math',
    topic: '双焦点距离演示',
    templateId: 'experiment.motion.point-2d',
    parameterOverrides: {},
    reason: '验证修改后场景的紧凑导出与重新导入。',
    experimentSpec: {
      durationExpression: '6.28',
      bodyId: 'point',
      bodyLabel: 'Q',
      xExpression: 'A*cos(t)',
      yExpression: 'sin(t)',
      formula: '|QF1-QF2| = constant',
      conclusion: '两条焦点距离的差保持不变。',
      parameters: [{ id: 'A', label: '横向尺度', value: 2, min: 1, max: 5, step: 0.1 }],
      metrics: [],
      additionalBodies: [
        { id: 'focus1', label: 'F1', xExpression: '-1', yExpression: '0' },
        { id: 'focus2', label: 'F2', xExpression: '1', yExpression: '0' },
      ],
      vectors: [
        {
          id: 'distance1',
          label: 'QF1',
          xExpression: '-1-A*cos(t)',
          yExpression: '-sin(t)',
          scale: 1,
          unit: 'cm',
          bodyId: 'point',
          display: 'distance',
          labelMode: 'value',
        },
      ],
      constraints: [],
    },
  }
}

describe('Word2HTML lesson package import', () => {
  it('instantiates a compact LessonPlan package through the trusted runtime', () => {
    const parsed = parseLessonImport(createLessonPackage(ellipsePlan()))

    expect(parsed.sourceFormat).toBe('lesson-package')
    expect(parsed.scene.templateRef.id).toBe('math.conic.ellipse-focus-sum')
    expect(parsed.scene.lineage.source).toBe('imported')
  })

  it('keeps backward compatibility with raw LessonScene files', () => {
    const parsed = parseLessonImport(createEllipseScene())

    expect(parsed.sourceFormat).toBe('lesson-scene')
    expect(parsed.scene.lineage.source).toBe('imported')
  })

  it('exports the current structure and parameter values as a reusable compact package', () => {
    const original = instantiateLessonPlan(distanceExperimentPlan())
    const adjusted = updateTimeExperimentParameter(original, 'A', 3)
    adjusted.appearance.curveColor = '#123456'

    const lessonPackage = createLessonPackageFromScene(adjusted)
    const exportedSpec = lessonPackage.plan.experimentSpec!
    expect(lessonPackage.apiVersion).toBe('lesson-plan-1.4')
    expect(exportedSpec.parameters.find((parameter) => parameter.id === 'A')?.value).toBe(3)
    expect(exportedSpec.bodyLabel).toBe('Q')
    expect(exportedSpec.vectors[0]).toMatchObject({
      label: 'QF1',
      display: 'distance',
      labelMode: 'value',
    })

    const parsed = parseLessonImport(lessonPackage)
    const roundTrippedPlan = lessonPlanFromScene(parsed.scene)
    expect(roundTrippedPlan.experimentSpec?.parameters[0]?.value).toBe(3)
    expect(roundTrippedPlan.experimentSpec?.vectors[0]?.labelMode).toBe('value')
    expect(parsed.scene.appearance.curveColor).toBe('#5B5BD6')
  })

  it('keeps backward compatibility with lesson-plan-0.6 packages', () => {
    const legacy = { ...createLessonPackage(ellipsePlan()), apiVersion: 'lesson-plan-0.6' }
    const parsed = parseLessonImport(legacy)

    expect(parsed.sourceFormat).toBe('lesson-package')
    expect(parsed.scene.templateRef.id).toBe('math.conic.ellipse-focus-sum')
  })

  it('keeps backward compatibility with lesson-plan-0.7 packages', () => {
    const legacy = { ...createLessonPackage(ellipsePlan()), apiVersion: 'lesson-plan-0.7' }
    const parsed = parseLessonImport(legacy)

    expect(parsed.sourceFormat).toBe('lesson-package')
    expect(parsed.scene.templateRef.id).toBe('math.conic.ellipse-focus-sum')
  })

  it('keeps backward compatibility with lesson-plan-0.8 packages', () => {
    const legacy = { ...createLessonPackage(ellipsePlan()), apiVersion: 'lesson-plan-0.8' }
    const parsed = parseLessonImport(legacy)

    expect(parsed.sourceFormat).toBe('lesson-package')
    expect(parsed.scene.templateRef.id).toBe('math.conic.ellipse-focus-sum')
  })

  it('keeps backward compatibility with lesson-plan-0.9 packages', () => {
    const legacy = { ...createLessonPackage(ellipsePlan()), apiVersion: 'lesson-plan-0.9' }
    const parsed = parseLessonImport(legacy)

    expect(parsed.sourceFormat).toBe('lesson-package')
    expect(parsed.scene.templateRef.id).toBe('math.conic.ellipse-focus-sum')
  })

  it.each(['lesson-plan-1.0', 'lesson-plan-1.1', 'lesson-plan-1.2', 'lesson-plan-1.3'] as const)('keeps backward compatibility with %s packages', (apiVersion) => {
    const legacy = { ...createLessonPackage(ellipsePlan()), apiVersion }
    const parsed = parseLessonImport(legacy)

    expect(parsed.sourceFormat).toBe('lesson-package')
    expect(parsed.scene.templateRef.id).toBe('math.conic.ellipse-focus-sum')
  })

  it('rejects a package generated for a different app API', () => {
    const value = { ...createLessonPackage(ellipsePlan()), apiVersion: 'lesson-plan-9.9' }

    expect(() => parseLessonImport(value)).toThrow(/当前应用需要 lesson-plan-1.4/)
  })

  it('does not trust extra provenance or official-review claims', () => {
    const value = { ...createLessonPackage(ellipsePlan()), reviewStatus: 'official' }

    expect(() => parseLessonImport(value)).toThrow(/未知字段/)
  })
})
