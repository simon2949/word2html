import { describe, expect, it } from 'vitest'
import { RECOMMENDED_REVIEW_VERSION, reviewVersionState } from './CapabilityReviewApp'

describe('capability review version state', () => {
  it('recognizes only approved records for the recommended application version as current', () => {
    expect(reviewVersionState({ status: 'approved', reviewedVersion: RECOMMENDED_REVIEW_VERSION })).toBe('current')
    expect(reviewVersionState({ status: 'approved', reviewedVersion: '1.0' })).toBe('mismatch')
    expect(reviewVersionState({ status: 'approved', reviewedVersion: ' 2.0 ' })).toBe('mismatch')
  })

  it('does not report pending or needs-changes records as an approved version mismatch', () => {
    expect(reviewVersionState({ status: 'pending', reviewedVersion: '1.0' })).toBe('not-approved')
    expect(reviewVersionState({ status: 'needs-changes', reviewedVersion: '1.0' })).toBe('not-approved')
    expect(reviewVersionState(undefined)).toBe('not-approved')
  })
})
