import { describe, expect, it } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import type { LessonPlan } from './modelGateway'
import {
  createLessonPackage,
  parseLessonImport,
} from './lessonPackage'

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

  it('rejects a package generated for a different app API', () => {
    const value = { ...createLessonPackage(ellipsePlan()), apiVersion: 'lesson-plan-9.9' }

    expect(() => parseLessonImport(value)).toThrow(/当前应用需要 lesson-plan-0.9/)
  })

  it('does not trust extra provenance or official-review claims', () => {
    const value = { ...createLessonPackage(ellipsePlan()), reviewStatus: 'official' }

    expect(() => parseLessonImport(value)).toThrow(/未知字段/)
  })
})
