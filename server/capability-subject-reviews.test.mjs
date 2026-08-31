import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_REVIEW_FORMAT,
  CAPABILITY_SUBJECT_REVIEW_IDS,
  createCapabilitySubjectReviewStore,
} from './capability-subject-reviews.mjs'

async function storeAt(now = () => new Date('2026-08-29T09:00:00.000Z')) {
  const directory = await mkdtemp(join(tmpdir(), 'word2html-capability-review-'))
  const dataFile = join(directory, 'reviews.json')
  return { dataFile, store: createCapabilitySubjectReviewStore({ dataFile, now }) }
}

const completeInput = {
  status: 'approved',
  reviewer: '王老师',
  reviewerRole: '高中数学教师',
  reviewedVersion: 'commit-123',
  reviewComment: '未发现学科错误。',
  checks: { accuracy: true, boundaries: true, teaching: true, interaction: true },
}

describe('capability subject review store', () => {
  it('returns all registered pending reviews before a file exists', async () => {
    const { store } = await storeAt()
    const records = await store.list()
    expect(records).toHaveLength(CAPABILITY_SUBJECT_REVIEW_IDS.length)
    expect(records.every((record) => record.status === 'pending')).toBe(true)
  })

  it('persists an approved review and append-only snapshot', async () => {
    const { dataFile, store } = await storeAt()
    const record = await store.update('math.function.explicit-2d', completeInput)
    expect(record).toMatchObject({ status: 'approved', reviewedAt: '2026-08-29T09:00:00.000Z' })
    expect(record.history).toHaveLength(1)

    const saved = JSON.parse(await readFile(dataFile, 'utf8'))
    expect(saved.format).toBe(CAPABILITY_REVIEW_FORMAT)
    expect((await store.list()).find((item) => item.capabilityId === record.capabilityId)).toEqual(record)
  })

  it('requires identity, role, version and all checks before approval', async () => {
    const { store } = await storeAt()
    await expect(store.update('math.data.chart-2d', {
      ...completeInput,
      reviewer: '',
    })).rejects.toThrow('请填写审核人')
    await expect(store.update('math.data.chart-2d', {
      ...completeInput,
      checks: { accuracy: true, boundaries: false },
    })).rejects.toThrow('全部人工检查项')
  })

  it('requires a review comment when returning a capability for changes', async () => {
    const { store } = await storeAt()
    await expect(store.update('physics.motion.point-2d', {
      ...completeInput,
      status: 'needs-changes',
      reviewComment: '',
    })).rejects.toThrow('审阅意见')
  })

  it('allows an empty review comment when approving', async () => {
    const { store } = await storeAt()
    await expect(store.update('math.function.explicit-2d', {
      ...completeInput,
      reviewComment: '',
    })).resolves.toMatchObject({ status: 'approved', reviewComment: '' })
  })

  it('requires identity, role and version even when saving a pending record', async () => {
    const { store } = await storeAt()
    await expect(store.update('math.function.explicit-2d', {
      ...completeInput,
      status: 'pending',
      reviewer: '',
    })).rejects.toThrow('请填写审核人')
  })

  it('migrates legacy fields to the compact 0.2 record', async () => {
    const { dataFile, store } = await storeAt()
    await writeFile(dataFile, JSON.stringify({
      format: CAPABILITY_REVIEW_FORMAT,
      formatVersion: '0.1',
      records: [{
        capabilityId: 'math.function.explicit-2d', status: 'needs-changes',
        reviewer: '旧审核人', reviewerRole: '数学教师', reviewedVersion: 'old-version',
        coveredBoundaries: '旧边界', findings: '旧意见', acceptedLimitations: '旧限制',
        checks: { accuracy: true }, updatedAt: '2026-08-28T00:00:00.000Z',
        history: [{
          id: 'old-event', at: '2026-08-28T00:00:00.000Z', status: 'needs-changes',
          reviewer: '旧审核人', reviewerRole: '数学教师', reviewedVersion: 'old-version',
          coveredBoundaries: '旧边界', findings: '旧意见', acceptedLimitations: '旧限制',
          checks: { accuracy: true },
        }],
      }],
    }))
    const record = (await store.list()).find((item) => item.capabilityId === 'math.function.explicit-2d')
    expect(record).toMatchObject({ reviewComment: '旧意见' })
    expect(record).not.toHaveProperty('coveredBoundaries')
    expect(record).not.toHaveProperty('acceptedLimitations')
    expect(record?.history[0]).toMatchObject({ reviewComment: '旧意见' })
  })

  it('rejects unknown capability IDs', async () => {
    const { store } = await storeAt()
    await expect(store.update('chemistry.unknown', completeInput)).rejects.toThrow('未知的能力复核编号')
  })
})
