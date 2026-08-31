import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { createCapabilitySubjectReviewStore } from '../server/capability-subject-reviews.mjs'

const strict = process.argv.includes('--strict')
const root = process.cwd()
function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}
const reviewDataFile = resolve(
  root,
  argument(
    '--capability-review-file',
    process.env.WORD2HTML_CAPABILITY_REVIEWS_FILE || '.word2html-data/capability-subject-reviews.json',
  ),
)
const vite = await createServer({ root, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })

try {
  const module = await vite.ssrLoadModule('/src/core/capabilityReadiness.ts')
  const storedReviews = await createCapabilitySubjectReviewStore({ dataFile: reviewDataFile }).list()
  const report = module.auditCapabilityReadiness(new Date(), storedReviews.map((record) => ({
    capabilityId: record.capabilityId,
    status: record.status,
    detail: record.status === 'needs-changes'
      ? `学科审核要求修改：${record.reviewComment}`
      : record.status === 'approved'
        ? `由 ${record.reviewer}（${record.reviewerRole}）审核 ${record.reviewedVersion} 并批准。`
        : undefined,
  })))
  const missingDocs = []
  for (const item of report.items) {
    for (const filename of item.acceptanceDocs) {
      try { await access(resolve(root, filename)) } catch { missingDocs.push(`${item.capabilityId}: ${filename}`) }
    }
  }
  const integrityIssues = [...report.integrityIssues, ...missingDocs.map((item) => `验收文档不存在：${item}`)]
  const rows = report.items.map((item) => ({
    capability: item.capabilityId,
    declared: item.declaredStatus,
    readiness: item.readinessStatus,
    examples: item.officialExampleIds.length,
    automatic: item.officialExampleIds.length === 0 ? 'not-run' : item.automatedSceneChecksPassed ? 'passed' : 'failed',
    browser: item.browserStatus,
    subject: item.subjectReviewStatus,
  }))

  console.log('Word2HTML capability readiness audit')
  console.table(rows)
  console.log(`Summary: ${JSON.stringify(report.summary)}`)
  if (integrityIssues.length > 0) {
    console.error('Integrity issues:')
    for (const issue of integrityIssues) console.error(`- ${issue}`)
  }
  const outstanding = report.items.filter((item) => item.readinessStatus !== 'verified')
  if (outstanding.length > 0) {
    console.log('Outstanding work:')
    for (const item of outstanding) {
      const actions = [...item.blockers, ...item.nextActions]
      console.log(`- ${item.capabilityId}: ${actions.join('；') || '尚未满足 verified 晋升条件。'}`)
    }
  }
  if (integrityIssues.length > 0 || (strict && outstanding.length > 0)) process.exitCode = 1
} finally {
  await vite.close()
}
