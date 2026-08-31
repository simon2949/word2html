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
    if (!['lesson-plan-0.6', 'lesson-plan-0.7', 'lesson-plan-0.8', 'lesson-plan-0.9', 'lesson-plan-1.0', 'lesson-plan-1.1', 'lesson-plan-1.2', 'lesson-plan-1.3', 'lesson-plan-1.4'].includes(value.apiVersion)) {
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
    if (plan?.templateId === 'math.curve.relation-2d') {
      if (plan.subject !== 'math') errors.push('/plan/subject: relation curves must use math')
      const spec = plan.relationSpec
      const reserved = new Set(['x', 'y', 't', 'theta', 'pi', 'e', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'log', 'ln', 'min', 'max', 'pow', 'step'])
      const parameterIds = new Set()
      for (const [index, parameter] of (spec?.parameters ?? []).entries()) {
        if (reserved.has(parameter.id)) errors.push(`/plan/relationSpec/parameters/${index}/id: reserved identifier ${parameter.id}`)
        if (parameterIds.has(parameter.id)) errors.push(`/plan/relationSpec/parameters/${index}/id: duplicate identifier ${parameter.id}`)
        parameterIds.add(parameter.id)
      }
      const commonAllowed = new Set(['pi', 'e', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'log', 'ln', 'min', 'max', 'pow', 'step', ...parameterIds])
      const checkExpression = (location, expression, modeVariables) => {
        const allowed = new Set([...commonAllowed, ...modeVariables])
        for (const identifier of typeof expression === 'string' ? expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [] : []) {
          if (!allowed.has(identifier)) errors.push(`${location}: unknown identifier ${identifier}`)
        }
      }
      if (spec?.mode === 'parametric') {
        if (spec.variableMin === undefined || spec.variableMax === undefined || !spec.xExpression || !spec.yExpression) {
          errors.push('/plan/relationSpec: parametric mode requires variableMin, variableMax, xExpression, and yExpression')
        }
        if (spec.radialExpression !== undefined || spec.implicitExpression !== undefined) errors.push('/plan/relationSpec: parametric mode contains fields from another mode')
        checkExpression('/plan/relationSpec/xExpression', spec.xExpression, ['t'])
        checkExpression('/plan/relationSpec/yExpression', spec.yExpression, ['t'])
      } else if (spec?.mode === 'polar') {
        if (spec.variableMin === undefined || spec.variableMax === undefined || !spec.radialExpression) {
          errors.push('/plan/relationSpec: polar mode requires variableMin, variableMax, and radialExpression')
        }
        if (spec.xExpression !== undefined || spec.yExpression !== undefined || spec.implicitExpression !== undefined) errors.push('/plan/relationSpec: polar mode contains fields from another mode')
        checkExpression('/plan/relationSpec/radialExpression', spec.radialExpression, ['theta'])
      } else if (spec?.mode === 'implicit') {
        if (!spec.implicitExpression) errors.push('/plan/relationSpec: implicit mode requires implicitExpression')
        if (spec.variableMin !== undefined || spec.variableMax !== undefined || spec.xExpression !== undefined || spec.yExpression !== undefined || spec.radialExpression !== undefined) {
          errors.push('/plan/relationSpec: implicit mode contains fields from another mode')
        }
        checkExpression('/plan/relationSpec/implicitExpression', spec.implicitExpression, ['x', 'y'])
      }
    }
    if (plan?.templateId === 'math.geometry.primitives-2d') {
      if (plan.subject !== 'math') errors.push('/plan/subject: two-dimensional geometry must use math')
      const spec = plan.geometrySpec
      const parameterIds = new Set((spec?.parameters ?? []).map((parameter) => parameter.id))
      const allowed = new Set(['pi', 'e', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'log', 'ln', 'min', 'max', 'pow', 'step', ...parameterIds])
      const checkExpression = (location, expression) => {
        for (const identifier of typeof expression === 'string' ? expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [] : []) {
          if (!allowed.has(identifier)) errors.push(`${location}: unknown identifier ${identifier}`)
        }
      }
      const points = spec?.points ?? []
      const pointIds = new Set(points.map((point) => point.id))
      const dependencies = new Map()
      for (const [index, point] of points.entries()) {
        const location = `/plan/geometrySpec/points/${index}`
        let references = []
        const construction = point.construction
        if (!construction) {
          checkExpression(`${location}/xExpression`, point.xExpression)
          checkExpression(`${location}/yExpression`, point.yExpression)
          if (point.draggable && (!parameterIds.has(point.xExpression) || !parameterIds.has(point.yExpression))) {
            errors.push(`${location}: draggable coordinates must directly reference two parameters`)
          }
        } else if (construction.kind === 'midpoint') references = [construction.pointAId, construction.pointBId]
        else if (construction.kind === 'translation') {
          references = [construction.sourcePointId]
          checkExpression(`${location}/construction/dxExpression`, construction.dxExpression)
          checkExpression(`${location}/construction/dyExpression`, construction.dyExpression)
        } else if (construction.kind === 'rotation') {
          references = [construction.sourcePointId, construction.centerPointId]
          checkExpression(`${location}/construction/angleExpression`, construction.angleExpression)
        } else if (construction.kind === 'dilation') {
          references = [construction.sourcePointId, construction.centerPointId]
          checkExpression(`${location}/construction/scaleExpression`, construction.scaleExpression)
        } else references = [construction.sourcePointId, construction.linePointAId, construction.linePointBId]
        if (point.constraint) {
          const constraintReferences = point.constraint.kind === 'circle'
            ? [point.constraint.centerPointId]
            : [point.constraint.pointAId, point.constraint.pointBId]
          references.push(...constraintReferences)
          if (point.constraint.kind === 'circle') checkExpression(`${location}/constraint/radiusExpression`, point.constraint.radiusExpression)
        }
        if (references.some((id) => !pointIds.has(id) || id === point.id)) errors.push(`${location}: construction or constraint references are invalid`)
        dependencies.set(point.id, references)
      }
      const visiting = new Set()
      const visited = new Set()
      const visit = (id) => {
        if (visiting.has(id)) {
          errors.push(`/plan/geometrySpec/points: cyclic point dependency at ${id}`)
          return
        }
        if (visited.has(id)) return
        visiting.add(id)
        for (const dependency of dependencies.get(id) ?? []) visit(dependency)
        visiting.delete(id)
        visited.add(id)
      }
      for (const id of pointIds) visit(id)
      for (const [index, connection] of (spec?.connections ?? []).entries()) {
        if (!pointIds.has(connection.fromPointId) || !pointIds.has(connection.toPointId)) {
          errors.push(`/plan/geometrySpec/connections/${index}: endpoint must reference a declared point`)
        }
      }
      for (const [index, arc] of (spec?.arcs ?? []).entries()) {
        if (![arc.centerPointId, arc.startPointId, arc.endPointId].every((id) => pointIds.has(id))) errors.push(`/plan/geometrySpec/arcs/${index}: point references must be declared`)
      }
      for (const [index, polygon] of (spec?.polygons ?? []).entries()) {
        if (!polygon.pointIds.every((id) => pointIds.has(id))) errors.push(`/plan/geometrySpec/polygons/${index}: pointIds must reference declared points`)
      }
      for (const [index, measurement] of (spec?.measurements ?? []).entries()) {
        if (!measurement.pointIds.every((id) => pointIds.has(id))) {
          errors.push(`/plan/geometrySpec/measurements/${index}: pointIds must reference declared points`)
        }
        if (measurement.kind === 'expression') checkExpression(`/plan/geometrySpec/measurements/${index}/expression`, measurement.expression)
      }
      for (const [index, locus] of (spec?.loci ?? []).entries()) {
        if (!pointIds.has(locus.pointId)) errors.push(`/plan/geometrySpec/loci/${index}/pointId: must reference a declared point`)
        const parameter = (spec?.parameters ?? []).find((candidate) => candidate.id === locus.parameterId)
        if (!parameter) errors.push(`/plan/geometrySpec/loci/${index}/parameterId: must reference a declared parameter`)
        if ((locus.min === undefined) !== (locus.max === undefined)) errors.push(`/plan/geometrySpec/loci/${index}: min and max must be supplied together`)
        if (parameter && locus.min !== undefined && (locus.min < parameter.min || locus.max > parameter.max || locus.min >= locus.max)) {
          errors.push(`/plan/geometrySpec/loci/${index}: sampling range must be increasing and inside the parameter range`)
        }
      }
    }
    if (plan?.templateId === 'math.data.chart-2d') {
      if (plan.subject !== 'math') errors.push('/plan/subject: data charts must use math')
      const spec = plan.dataChartSpec
      const series = spec?.series ?? []
      const seriesIds = series.map((item) => item.id)
      if (new Set(seriesIds).size !== seriesIds.length) errors.push('/plan/dataChartSpec/series: series IDs must be unique')
      if (spec?.mode === 'scatter') {
        if (spec.categories !== undefined) errors.push('/plan/dataChartSpec/categories: scatter mode must omit categories')
        for (const [index, item] of series.entries()) {
          if (item.values !== undefined) errors.push(`/plan/dataChartSpec/series/${index}/values: scatter series must omit values`)
          if (!Array.isArray(item.points) || item.points.length < 1 || item.points.length > 60) {
            errors.push(`/plan/dataChartSpec/series/${index}/points: scatter series require 1–60 points`)
          }
        }
      } else if (['table', 'bar', 'line'].includes(spec?.mode)) {
        const categories = spec.categories ?? []
        if (new Set(categories).size !== categories.length) errors.push('/plan/dataChartSpec/categories: category labels must be unique')
        if (spec.mode === 'line' && categories.length < 2) errors.push('/plan/dataChartSpec/categories: line charts require at least two categories')
        for (const [index, item] of series.entries()) {
          if (item.points !== undefined) errors.push(`/plan/dataChartSpec/series/${index}/points: categorical series must omit points`)
          if (!Array.isArray(item.values) || item.values.length !== categories.length) {
            errors.push(`/plan/dataChartSpec/series/${index}/values: value count must equal category count`)
          }
        }
      }
    }
    if (plan?.templateId === 'physics.collision.discs-2d') {
      if (plan.subject !== 'physics') errors.push('/plan/subject: two-dimensional collision must use physics')
      const spec = plan.collisionSpec
      const parameterIds = new Set((spec?.parameters ?? []).map((parameter) => parameter.id))
      const allowed = new Set(['pi', 'e', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'log', 'ln', 'min', 'max', 'pow', 'step', ...parameterIds])
      const expressions = [
        ['/plan/collisionSpec/durationExpression', spec?.durationExpression],
        ['/plan/collisionSpec/gravityXExpression', spec?.gravityXExpression],
        ['/plan/collisionSpec/gravityYExpression', spec?.gravityYExpression],
        ['/plan/collisionSpec/restitutionExpression', spec?.restitutionExpression],
        ['/plan/collisionSpec/bounds/xMinExpression', spec?.bounds?.xMinExpression],
        ['/plan/collisionSpec/bounds/xMaxExpression', spec?.bounds?.xMaxExpression],
        ['/plan/collisionSpec/bounds/yMinExpression', spec?.bounds?.yMinExpression],
        ['/plan/collisionSpec/bounds/yMaxExpression', spec?.bounds?.yMaxExpression],
        ...(spec?.bodies ?? []).flatMap((body, index) => [
          [`/plan/collisionSpec/bodies/${index}/xExpression`, body.xExpression],
          [`/plan/collisionSpec/bodies/${index}/yExpression`, body.yExpression],
          [`/plan/collisionSpec/bodies/${index}/vxExpression`, body.vxExpression],
          [`/plan/collisionSpec/bodies/${index}/vyExpression`, body.vyExpression],
          [`/plan/collisionSpec/bodies/${index}/radiusExpression`, body.radiusExpression],
          [`/plan/collisionSpec/bodies/${index}/massExpression`, body.massExpression],
        ]),
      ]
      for (const [location, expression] of expressions) {
        for (const identifier of typeof expression === 'string' ? expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [] : []) {
          if (!allowed.has(identifier)) errors.push(`${location}: unknown identifier ${identifier}`)
        }
      }
      const bodyIds = (spec?.bodies ?? []).map((body) => body.id)
      if (new Set(bodyIds).size !== bodyIds.length) errors.push('/plan/collisionSpec/bodies: body IDs must be unique')
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
