import { describe, expect, it } from 'vitest'
import { CAPABILITY_REGISTRY } from './capabilityRegistry'
import { auditCapabilityReadiness, CAPABILITY_VERIFICATION_EVIDENCE } from './capabilityReadiness'

describe('capability verification readiness', () => {
  it('keeps one evidence record for every installed capability', () => {
    expect(CAPABILITY_VERIFICATION_EVIDENCE).toHaveLength(CAPABILITY_REGISTRY.length)
    expect(new Set(CAPABILITY_VERIFICATION_EVIDENCE.map((item) => item.capabilityId))).toEqual(
      new Set(CAPABILITY_REGISTRY.map((item) => item.id)),
    )
    expect(CAPABILITY_VERIFICATION_EVIDENCE.every((item) => item.acceptanceDocs.length > 0)).toBe(true)
  })

  it('audits bindings, official examples, automatic checks, browser evidence, and subject review separately', () => {
    const report = auditCapabilityReadiness(new Date('2026-08-26T00:00:00.000Z'))

    expect(report.integrityIssues).toEqual([])
    expect(report.summary.total).toBe(CAPABILITY_REGISTRY.length)
    expect(report.items.find((item) => item.capabilityId === 'math.ellipse.focus-distance-sum')).toMatchObject({
      readinessStatus: 'verified', automatedSceneChecksPassed: true,
      browserStatus: 'passed', subjectReviewStatus: 'approved',
    })
    expect(report.items.find((item) => item.capabilityId === 'math.function.quadratic-vertex')).toMatchObject({
      readinessStatus: 'verified', automatedSceneChecksPassed: true,
      browserStatus: 'passed', subjectReviewStatus: 'approved',
    })
    expect(report.items.find((item) => item.capabilityId === 'math.function.explicit-2d')).toMatchObject({
      readinessStatus: 'technical-ready', automatedSceneChecksPassed: true,
      browserStatus: 'passed', subjectReviewStatus: 'pending',
    })
    expect(report.items.find((item) => item.capabilityId === 'math.data.chart-2d')).toMatchObject({
      readinessStatus: 'technical-ready', automatedSceneChecksPassed: true,
      browserStatus: 'passed', subjectReviewStatus: 'pending',
    })
    expect(report.items.find((item) => item.capabilityId === 'math.geometry.parametric-trace-2d')).toMatchObject({
      readinessStatus: 'technical-ready', automatedSceneChecksPassed: true,
      browserStatus: 'passed', subjectReviewStatus: 'pending',
      officialExampleIds: ['official.hyperbola-focus-difference'],
    })
    expect(report.items.find((item) => item.capabilityId === 'math.geometry.primitives-2d')).toMatchObject({
      readinessStatus: 'technical-ready', automatedSceneChecksPassed: true,
      browserStatus: 'passed', subjectReviewStatus: 'pending',
    })
    expect(report.items.find((item) => item.capabilityId === 'physics.collision.discs-2d')).toMatchObject({
      readinessStatus: 'technical-ready', automatedSceneChecksPassed: true,
      browserStatus: 'passed', subjectReviewStatus: 'pending',
      officialExampleIds: ['official.collision-discs-2d'],
    })
    expect(report.items.find((item) => item.capabilityId === 'physics.motion.point-2d')).toMatchObject({
      readinessStatus: 'technical-ready', automatedSceneChecksPassed: true,
      browserStatus: 'passed', subjectReviewStatus: 'pending',
    })
    expect(report.summary).toMatchObject({
      verified: 2, technicalReady: 7, evidenceIncomplete: 0, blocked: 0, pendingSubjectReview: 7,
    })
  })

  it('never treats a pending human review as verified', () => {
    const report = auditCapabilityReadiness()
    expect(report.items.filter((item) => item.readinessStatus === 'verified').every(
      (item) => item.subjectReviewStatus === 'approved' && item.browserStatus === 'passed',
    )).toBe(true)
  })

  it('recognizes a persisted approval after the registry promotion', () => {
    const report = auditCapabilityReadiness(new Date('2026-08-29T00:00:00.000Z'), [{
      capabilityId: 'math.function.explicit-2d',
      status: 'approved',
      detail: '数学教师已审核。',
    }])
    expect(report.items.find((item) => item.capabilityId === 'math.function.explicit-2d')).toMatchObject({
      readinessStatus: 'verified',
      subjectReviewStatus: 'approved',
    })
    expect(report.summary.pendingSubjectReview).toBe(6)
  })

  it('recognizes all reviewed-version promotions declared by the registry', () => {
    const report = auditCapabilityReadiness(new Date('2026-08-30T00:00:00.000Z'), [
      { capabilityId: 'math.function.explicit-2d', status: 'approved', detail: 'word2html@0.1.0 已审核。' },
      { capabilityId: 'math.data.chart-2d', status: 'approved', detail: 'word2html@0.1.0 已审核。' },
      { capabilityId: 'math.geometry.primitives-2d', status: 'approved', detail: 'word2html@0.1.0 已审核。' },
      { capabilityId: 'math.curve.relation-2d', status: 'approved', detail: 'word2html@0.1.0 已审核。' },
      { capabilityId: 'math.geometry.parametric-trace-2d', status: 'approved', detail: 'word2html@0.1.0 已审核。' },
      { capabilityId: 'physics.collision.discs-2d', status: 'approved', detail: 'word2html@0.1.0 已审核。' },
      { capabilityId: 'physics.motion.point-2d', status: 'approved', detail: 'word2html@0.1.0 已审核。' },
    ])
    expect(report.items.find((item) => item.capabilityId === 'math.function.explicit-2d')?.readinessStatus).toBe('verified')
    expect(report.items.find((item) => item.capabilityId === 'math.data.chart-2d')?.readinessStatus).toBe('verified')
    expect(report.items.find((item) => item.capabilityId === 'math.geometry.primitives-2d')?.readinessStatus).toBe('verified')
    expect(report.items.find((item) => item.capabilityId === 'math.curve.relation-2d')?.readinessStatus).toBe('verified')
    expect(report.items.find((item) => item.capabilityId === 'math.geometry.parametric-trace-2d')?.readinessStatus).toBe('verified')
    expect(report.items.find((item) => item.capabilityId === 'physics.collision.discs-2d')?.readinessStatus).toBe('verified')
    expect(report.items.find((item) => item.capabilityId === 'physics.motion.point-2d')?.readinessStatus).toBe('verified')
    expect(report.summary).toMatchObject({ verified: 9, technicalReady: 0, pendingSubjectReview: 0 })
  })

  it('reports needs-changes as outstanding subject review work', () => {
    const report = auditCapabilityReadiness(new Date('2026-08-29T00:00:00.000Z'), [{
      capabilityId: 'physics.motion.point-2d',
      status: 'needs-changes',
      detail: '需要修正单位。',
    }])
    const item = report.items.find((candidate) => candidate.capabilityId === 'physics.motion.point-2d')
    expect(item?.subjectReviewStatus).toBe('needs-changes')
    expect(item?.nextActions).toContain('需要修正单位。')
    expect(report.summary.pendingSubjectReview).toBe(7)
  })
})
