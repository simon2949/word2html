import Ajv2020 from 'ajv/dist/2020.js'
import lessonSceneSchema from '../schema/lesson-scene.schema.json'
import type {
  LessonScene,
  SceneValidationIssue,
  SceneValidationResult,
} from '../types/lessonScene'
import { isNumberParameter } from '../types/lessonScene'
import { sampleEllipseInvariant, validateAxisValues } from './ellipse'
import {
  QUADRATIC_TEMPLATE_ID,
  sampleQuadraticInvariant,
  validateQuadraticValues,
} from './quadratic'
import {
  GENERIC_FUNCTION_TEMPLATE_ID,
  validateGenericFunctionScene,
} from './genericFunction'
import { SAFE_MATH_CONSTANTS, SAFE_MATH_FUNCTIONS } from './mathExpression'
import {
  TIME_EXPERIMENT_TEMPLATE_ID,
  validateTimeExperimentScene,
} from './timeExperiment'

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  formats: { 'date-time': true },
})

const validateSchema = ajv.compile(lessonSceneSchema)
const allowedFunctions = new Set([...SAFE_MATH_FUNCTIONS, 'distance'])

function structuralIssues(value: unknown): SceneValidationIssue[] {
  if (validateSchema(value)) return []
  return (validateSchema.errors ?? []).map((error) => ({
    path: error.instancePath || '/',
    message: error.message ?? '不符合 LessonScene 协议',
    severity: 'error' as const,
  }))
}

function uniqueIdIssues(scene: LessonScene): SceneValidationIssue[] {
  const issues: SceneValidationIssue[] = []
  const groups = [
    ['objects', scene.objects.map((item) => item.id)],
    ['derivedValues', scene.derivedValues.map((item) => item.id)],
    ['controls', scene.controls.map((item) => item.id)],
    ['interactions', scene.interactions.map((item) => item.id)],
    ['invariants', scene.invariants.map((item) => item.id)],
  ] as const

  for (const [path, ids] of groups) {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) {
        issues.push({ path: `/${path}`, message: `ID 重复：${id}`, severity: 'error' })
      }
      seen.add(id)
    }
  }
  return issues
}

function expressionIdentifiers(expression: string): string[] {
  return expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
}

function expressionIssues(scene: LessonScene): SceneValidationIssue[] {
  const issues: SceneValidationIssue[] = []
  const parameterIds = new Set(Object.keys(scene.parameters))
  const derivedIds = new Set(scene.derivedValues.map((value) => value.id))
  const objectIds = new Set(scene.objects.map((object) => object.id))
  const allowedIdentifiers = new Set([...parameterIds, ...derivedIds, ...objectIds])
  SAFE_MATH_CONSTANTS.forEach((identifier) => allowedIdentifiers.add(identifier))
  if (scene.templateRef.id === GENERIC_FUNCTION_TEMPLATE_ID) allowedIdentifiers.add('x')
  if (scene.templateRef.id === TIME_EXPERIMENT_TEMPLATE_ID) allowedIdentifiers.add('t')

  const inspect = (expression: string, path: string) => {
    if (/[;{}[\]`'"=:]|\b(?:new|function|window|document|fetch|import|eval)\b/.test(expression)) {
      issues.push({ path, message: '表达式包含不允许的语法', severity: 'error' })
      return
    }
    for (const identifier of expressionIdentifiers(expression)) {
      if (!allowedIdentifiers.has(identifier) && !allowedFunctions.has(identifier)) {
        issues.push({ path, message: `表达式引用了未知标识：${identifier}`, severity: 'error' })
      }
    }
  }

  scene.derivedValues.forEach((value, index) =>
    inspect(value.expression, `/derivedValues/${index}/expression`),
  )
  scene.invariants.forEach((invariant, index) => {
    inspect(invariant.expression, `/invariants/${index}/expression`)
    inspect(invariant.expectedExpression, `/invariants/${index}/expectedExpression`)
  })
  scene.objects.forEach((object, objectIndex) => {
    Object.entries(object.bindings).forEach(([binding, expression]) =>
      inspect(expression, `/objects/${objectIndex}/bindings/${binding}`),
    )
  })

  const graph = new Map<string, string[]>()
  for (const value of scene.derivedValues) {
    graph.set(
      value.id,
      expressionIdentifiers(value.expression).filter((identifier) => derivedIds.has(identifier)),
    )
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const dependency of graph.get(id) ?? []) {
      if (visit(dependency)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  for (const id of graph.keys()) {
    if (visit(id)) {
      issues.push({ path: '/derivedValues', message: '派生值依赖存在循环', severity: 'error' })
      break
    }
  }
  return issues
}

function semanticIssues(scene: LessonScene): SceneValidationIssue[] {
  const issues: SceneValidationIssue[] = []

  if (scene.viewport.xMin >= scene.viewport.xMax || scene.viewport.yMin >= scene.viewport.yMax) {
    issues.push({ path: '/viewport', message: '视口最小值必须小于最大值', severity: 'error' })
  }

  for (const [id, parameter] of Object.entries(scene.parameters)) {
    if (isNumberParameter(parameter)) {
      if (parameter.min > parameter.max) {
        issues.push({ path: `/parameters/${id}`, message: '参数最小值不能大于最大值', severity: 'error' })
      }
      if (parameter.value < parameter.min || parameter.value > parameter.max) {
        issues.push({ path: `/parameters/${id}/value`, message: '参数值超出允许范围', severity: 'error' })
      }
    }
  }

  const major = scene.parameters.majorAxis
  const minor = scene.parameters.minorAxis
  if (isNumberParameter(major) && isNumberParameter(minor)) {
    const axisError = validateAxisValues(scene, major.value, minor.value)
    if (axisError) {
      issues.push({ path: '/parameters', message: axisError, severity: 'error' })
    } else if (major.value === minor.value) {
      issues.push({
        path: '/parameters',
        message: '长短轴相等，此时图形是圆，两个焦点重合。',
        severity: 'warning',
      })
    }
  }

  const objectIds = new Set(scene.objects.map((object) => object.id))
  const parameterIds = new Set(Object.keys(scene.parameters))
  const appearanceIds = new Set(Object.keys(scene.appearance))
  for (const control of scene.controls) {
    if (
      !objectIds.has(control.target) &&
      !parameterIds.has(control.target) &&
      !appearanceIds.has(control.target)
    ) {
      issues.push({
        path: `/controls/${control.id}`,
        message: `控件目标不存在：${control.target}`,
        severity: 'error',
      })
    }
  }
  for (const object of scene.objects) {
    if (object.anchorId && !objectIds.has(object.anchorId)) {
      issues.push({
        path: `/objects/${object.id}/anchorId`,
        message: `对象锚点不存在：${object.anchorId}`,
        severity: 'error',
      })
    }
  }
  for (const interaction of scene.interactions) {
    if (!objectIds.has(interaction.target)) {
      issues.push({
        path: `/interactions/${interaction.id}`,
        message: `交互目标不存在：${interaction.target}`,
        severity: 'error',
      })
    }
  }

  if (scene.templateRef.id === 'math.conic.ellipse-focus-sum' && issues.every((issue) => issue.severity !== 'error')) {
    const invariant = sampleEllipseInvariant(scene)
    if (!invariant.passed) {
      issues.push({
        path: '/invariants',
        message: `椭圆焦点距离和校验失败，最大误差为 ${invariant.maxError}`,
        severity: 'error',
      })
    }
  }

  if (scene.templateRef.id === QUADRATIC_TEMPLATE_ID) {
    const coefficientA = scene.parameters.coefficientA
    const vertexH = scene.parameters.vertexH
    const vertexK = scene.parameters.vertexK
    if (
      !isNumberParameter(coefficientA) ||
      !isNumberParameter(vertexH) ||
      !isNumberParameter(vertexK)
    ) {
      issues.push({
        path: '/parameters',
        message: '二次函数模板缺少 a、h 或 k 数值参数。',
        severity: 'error',
      })
    } else {
      const parameterError = validateQuadraticValues(scene, {
        coefficientA: coefficientA.value,
        vertexH: vertexH.value,
        vertexK: vertexK.value,
      })
      if (parameterError) {
        issues.push({ path: '/parameters', message: parameterError, severity: 'error' })
      } else if (issues.every((issue) => issue.severity !== 'error')) {
        const invariant = sampleQuadraticInvariant(scene)
        if (!invariant.passed) {
          issues.push({
            path: '/invariants',
            message: `二次函数顶点与对称性校验失败，最大误差为 ${invariant.maxError}`,
            severity: 'error',
          })
        }
      }
    }
  }

  if (scene.templateRef.id === GENERIC_FUNCTION_TEMPLATE_ID) {
    const functionError = validateGenericFunctionScene(scene)
    if (functionError) {
      issues.push({ path: '/objects/functionCurve', message: functionError, severity: 'error' })
    }
  }

  if (scene.templateRef.id === TIME_EXPERIMENT_TEMPLATE_ID) {
    const experimentError = validateTimeExperimentScene(scene)
    if (experimentError) {
      issues.push({ path: '/objects/movingBody', message: experimentError, severity: 'error' })
    }
  }

  return issues
}

export function validateLessonScene(value: unknown): SceneValidationResult {
  const issues = structuralIssues(value)
  if (issues.length > 0) return { valid: false, issues }

  const scene = value as LessonScene
  issues.push(...uniqueIdIssues(scene), ...expressionIssues(scene), ...semanticIssues(scene))
  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
  }
}

export function assertLessonScene(value: unknown): asserts value is LessonScene {
  const result = validateLessonScene(value)
  if (!result.valid) {
    const message = result.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('；')
    throw new Error(message || '场景验证失败')
  }
}
