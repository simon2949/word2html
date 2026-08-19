#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'

const filename = process.argv[2]
if (!filename) {
  console.error('Usage: node scripts/validate-package.mjs <lesson.word2html.json>')
  process.exit(2)
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(scriptDirectory, '../../../src/schema/lesson-plan.schema.json')

try {
  const [source, schemaSource] = await Promise.all([
    readFile(resolve(process.cwd(), filename), 'utf8'),
    readFile(schemaPath, 'utf8'),
  ])
  const value = JSON.parse(source)
  const errors = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('/: package must be an object')
  } else {
    const allowed = new Set(['format', 'formatVersion', 'kind', 'apiVersion', 'plan'])
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) errors.push(`/${key}: additional property is not allowed`)
    }
    if (value.format !== 'word2html.lesson-package') errors.push('/format: unsupported package format')
    if (value.formatVersion !== '0.1') errors.push('/formatVersion: unsupported format version')
    if (value.kind !== 'lesson-plan') errors.push('/kind: only lesson-plan is supported')
    if (!['lesson-plan-0.6', 'lesson-plan-0.7', 'lesson-plan-0.8', 'lesson-plan-0.9'].includes(value.apiVersion)) {
      errors.push('/apiVersion: app API version mismatch')
    }

    const schema = JSON.parse(schemaSource)
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
    if (!validate(value.plan)) {
      for (const error of validate.errors ?? []) {
        errors.push(`/plan${error.instancePath || '/'}: ${error.message ?? 'invalid value'}`)
      }
    }

    const plan = value.plan
    if (plan?.templateId === 'math.function.generic-2d' && plan.subject !== 'math') {
      errors.push('/plan/subject: generic functions must use math')
    }
    if (
      plan?.templateId === 'experiment.motion.point-2d' &&
      plan.subject !== 'physics' && plan.subject !== 'math'
    ) {
      errors.push('/plan/subject: point traces must use math or physics')
    }
    if (plan?.status === 'unsupported') {
      errors.push('/plan/status: unsupported plans are not importable demonstrations')
    }
  }

  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log(`OK: ${filename} is a Word2HTML lesson package 0.1`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
