import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { createLessonPackageFromScene } from './lessonPackage'
import {
  loadSharedSubmissionStatus,
  loadSharedLessonLibrary,
  submitSceneToSharedLibrary,
} from './sharedLessonLibrary'

afterEach(() => vi.unstubAllGlobals())

describe('shared lesson library client', () => {
  it('revalidates verified packages before exposing them as shared entries', async () => {
    const scene = createEllipseScene()
    const lessonPackage = createLessonPackageFromScene(scene)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      apiVersion: 'lesson-plan-1.4',
      entries: [{
        id: 'community.abc',
        reviewStatus: 'verified',
        title: lessonPackage.plan.topic,
        subject: lessonPackage.plan.subject,
        summary: lessonPackage.plan.reason,
        createdAt: '2026-08-20T08:00:00.000Z',
        updatedAt: '2026-08-20T08:00:00.000Z',
        lessonPackage,
      }],
    }), { status: 200 })))

    const entries = await loadSharedLessonLibrary()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ catalog: 'shared', reviewStatus: 'verified' })
    expect(entries[0]?.scene.templateRef.id).toBe('math.conic.ellipse-focus-sum')
  })

  it('does not accept pending content from the public endpoint', async () => {
    const scene = createEllipseScene()
    const lessonPackage = createLessonPackageFromScene(scene)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      apiVersion: 'lesson-plan-1.4',
      entries: [{
        id: 'community.pending',
        reviewStatus: 'pending',
        title: lessonPackage.plan.topic,
        subject: lessonPackage.plan.subject,
        summary: lessonPackage.plan.reason,
        createdAt: '2026-08-20T08:00:00.000Z',
        updatedAt: '2026-08-20T08:00:00.000Z',
        lessonPackage,
      }],
    }), { status: 200 })))

    await expect(loadSharedLessonLibrary()).rejects.toThrow(/无效条目|元数据/)
  })

  it('submits only the compact package and returns the review state', async () => {
    let sentBody: Record<string, unknown> | undefined
    let sentHeaders: HeadersInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body))
      sentHeaders = init?.headers
      return new Response(JSON.stringify({
        duplicate: false,
        entry: {
          id: 'community.new', reviewStatus: 'pending',
          preReview: {
            status: 'completed',
            result: {
              verdict: 'issues-found', summary: '发现一个单位问题。',
              issues: [{ problem: '单位不一致。' }],
            },
          },
        },
      }), { status: 201 })
    }))

    const result = await submitSceneToSharedLibrary(
      createEllipseScene(),
      'ellipse.json',
      'community.1234567890abcdef12345678',
    )
    expect(result).toEqual({
      id: 'community.new', duplicate: false, reviewStatus: 'pending',
      preReview: {
        status: 'completed', verdict: 'issues-found',
        summary: '发现一个单位问题。', issueCount: 1,
      },
    })
    expect(sentBody?.lessonPackage).toMatchObject({ format: 'word2html.lesson-package' })
    expect(sentBody?.revisionParentId).toBe('community.1234567890abcdef12345678')
    expect(sentBody).not.toHaveProperty('scene')
    expect(sentHeaders).toMatchObject({
      'X-Word2HTML-Client-ID': expect.stringMatching(/^browser-/),
      'Idempotency-Key': expect.stringMatching(/^w2h-/),
    })
  })

  it('loads a change request and its actionable feedback for the exact local scene', async () => {
    let sentBody: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({
        entry: {
          id: 'community.returned',
          reviewStatus: 'needs-changes',
          reviewNote: '请连接动点与两个焦点，并标注距离。',
          reviewedAt: '2026-08-20T09:00:00.000Z',
          updatedAt: '2026-08-20T09:00:00.000Z',
          preReview: {
            status: 'completed', standardVersion: '0.1',
            result: {
              verdict: 'issues-found', summary: '距离关系不够清晰。',
              issues: [{
                category: 'interaction-clarity', severity: 'warning',
                location: '/experimentSpec/vectors', finding: '缺少距离连线。',
                suggestedAction: '增加两条 distance 矢量。',
              }],
            },
          },
        },
      }), { status: 200 })
    }))

    const result = await loadSharedSubmissionStatus(createEllipseScene())
    expect(result).toMatchObject({
      reviewStatus: 'needs-changes',
      reviewNote: '请连接动点与两个焦点，并标注距离。',
      preReview: {
        verdict: 'issues-found',
        issues: [{ location: '/experimentSpec/vectors', severity: 'warning' }],
      },
    })
    expect(sentBody?.lessonPackage).toMatchObject({ format: 'word2html.lesson-package' })
    expect(sentBody).not.toHaveProperty('scene')
  })

  it('returns null when the current local revision has never been submitted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ entry: null }), { status: 200 })))
    await expect(loadSharedSubmissionStatus(createEllipseScene())).resolves.toBeNull()
  })
})
