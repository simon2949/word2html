import { describe, expect, it } from 'vitest'
import { CAPABILITY_VERIFICATION_EVIDENCE } from './capabilityReadiness'
import { CAPABILITY_SUBJECT_REVIEW_DEFINITIONS } from './capabilitySubjectReviewDefinitions'
import { getOfficialLibraryEntries } from './lessonLibrary'

describe('capability subject review definitions', () => {
  it('covers every capability still requiring human review exactly once', () => {
    const pendingIds = CAPABILITY_VERIFICATION_EVIDENCE
      .filter((item) => item.subjectReview.status === 'pending')
      .map((item) => item.capabilityId)
    expect(new Set(CAPABILITY_SUBJECT_REVIEW_DEFINITIONS.map((item) => item.capabilityId))).toEqual(new Set(pendingIds))
    expect(CAPABILITY_SUBJECT_REVIEW_DEFINITIONS).toHaveLength(pendingIds.length)
  })

  it('only references available official examples and complete review prompts', () => {
    const officialIds = new Set(getOfficialLibraryEntries().map((entry) => entry.id))
    for (const definition of CAPABILITY_SUBJECT_REVIEW_DEFINITIONS) {
      expect(definition.officialExampleIds.length).toBeGreaterThan(0)
      expect(definition.officialExampleIds.every((id) => officialIds.has(id))).toBe(true)
      expect(definition.focusItems).toHaveLength(4)
      expect(definition.browserCommand).toContain('npm run acceptance:')
    }
  })
})
