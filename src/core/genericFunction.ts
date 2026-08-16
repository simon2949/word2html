import type { LessonScene, NumberParameter } from '../types/lessonScene'
import { compileMathExpression, SAFE_MATH_CONSTANTS, SAFE_MATH_FUNCTIONS } from './mathExpression'

export const GENERIC_FUNCTION_TEMPLATE_ID = 'math.function.generic-2d'

export interface GenericFunctionParameterSpec {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
}

export interface GenericFunctionSpec {
  expression: string
  formula: string
  xMin: number
  xMax: number
  parameters: GenericFunctionParameterSpec[]
}

export interface FunctionSample {
  x: number
  y: number
}

const RESERVED_IDENTIFIERS = new Set([
  'x',
  ...SAFE_MATH_FUNCTIONS,
  ...SAFE_MATH_CONSTANTS,
])

export function validateGenericFunctionSpec(spec: GenericFunctionSpec): string | null {
  if (!Number.isFinite(spec.xMin) || !Number.isFinite(spec.xMax) || spec.xMin >= spec.xMax) {
    return '函数定义域必须是有效且递增的数值区间。'
  }
  if (spec.xMin < -50 || spec.xMax > 50 || spec.xMax - spec.xMin > 100) {
    return '函数定义域必须位于 -50 到 50 之间。'
  }
  if (spec.formula.length < 1 || spec.formula.length > 160) return '函数显示公式长度不合法。'
  if (spec.parameters.length > 6) return '通用函数最多支持 6 个可调参数。'

  const ids = new Set<string>()
  for (const parameter of spec.parameters) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(parameter.id)) return `参数 ID 不合法：${parameter.id}`
    if (RESERVED_IDENTIFIERS.has(parameter.id)) return `参数 ID 与保留名称冲突：${parameter.id}`
    if (ids.has(parameter.id)) return `参数 ID 重复：${parameter.id}`
    ids.add(parameter.id)
    if (!parameter.label || parameter.label.length > 40) return `参数 ${parameter.id} 的名称不合法。`
    if (![parameter.value, parameter.min, parameter.max, parameter.step].every(Number.isFinite)) {
      return `参数 ${parameter.label} 包含无效数字。`
    }
    if (parameter.min >= parameter.max || parameter.step <= 0) return `参数 ${parameter.label} 的范围或步长无效。`
    if (parameter.value < parameter.min || parameter.value > parameter.max) return `参数 ${parameter.label} 的初始值超出范围。`
  }

  try {
    compileMathExpression(spec.expression, ['x', ...ids])
  } catch (error) {
    return error instanceof Error ? error.message : '函数表达式无效。'
  }
  return null
}

export function parameterScope(spec: GenericFunctionSpec): Record<string, number> {
  return Object.fromEntries(spec.parameters.map((parameter) => [parameter.id, parameter.value]))
}

export function sampleGenericFunction(
  spec: GenericFunctionSpec,
  sampleCount = 401,
): FunctionSample[] {
  const error = validateGenericFunctionSpec(spec)
  if (error) throw new Error(error)
  const compiled = compileMathExpression(spec.expression, ['x', ...spec.parameters.map((parameter) => parameter.id)])
  const scope = parameterScope(spec)
  const samples: FunctionSample[] = []
  for (let index = 0; index < sampleCount; index += 1) {
    const x = spec.xMin + ((spec.xMax - spec.xMin) * index) / (sampleCount - 1)
    const y = compiled.evaluate({ ...scope, x })
    samples.push({ x, y })
  }
  return samples
}

export function estimateGenericFunctionViewport(spec: GenericFunctionSpec): LessonScene['viewport'] {
  const finiteValues = sampleGenericFunction(spec)
    .map((sample) => sample.y)
    .filter((value) => Number.isFinite(value) && Math.abs(value) <= 1e6)
    .sort((a, b) => a - b)
  let yMin = -5
  let yMax = 5
  if (finiteValues.length >= 2) {
    const low = finiteValues[Math.floor((finiteValues.length - 1) * 0.05)]!
    const high = finiteValues[Math.ceil((finiteValues.length - 1) * 0.95)]!
    yMin = Math.min(0, low)
    yMax = Math.max(0, high)
    if (yMax - yMin < 2) {
      const center = (yMin + yMax) / 2
      yMin = center - 1
      yMax = center + 1
    }
    const margin = (yMax - yMin) * 0.12
    yMin -= margin
    yMax += margin
  }
  return { xMin: spec.xMin, xMax: spec.xMax, yMin, yMax, allowZoom: true }
}

export function getGenericFunctionSpec(scene: LessonScene): GenericFunctionSpec {
  const curve = scene.objects.find((object) => object.kind === 'function-curve')
  if (!curve) throw new Error('通用函数场景缺少函数曲线对象。')
  const parameters = Object.entries(scene.parameters)
    .filter((entry): entry is [string, NumberParameter] => entry[1].type === 'number')
    .map(([id, parameter]) => ({
      id,
      label: parameter.label,
      value: parameter.value,
      min: parameter.min,
      max: parameter.max,
      step: parameter.step,
    }))
  return {
    expression: curve.bindings.expression ?? '',
    formula: scene.annotations.formula,
    xMin: Number(curve.bindings.xMin),
    xMax: Number(curve.bindings.xMax),
    parameters,
  }
}

export function updateGenericFunctionParameter(scene: LessonScene, id: string, value: number): LessonScene {
  const next = structuredClone(scene)
  const parameter = next.parameters[id]
  if (parameter?.type !== 'number') throw new Error(`场景缺少数值参数：${id}`)
  if (!Number.isFinite(value) || value < parameter.min || value > parameter.max) {
    throw new Error(`${parameter.label}必须在 ${parameter.min} 到 ${parameter.max} 之间。`)
  }
  parameter.value = value
  const spec = getGenericFunctionSpec(next)
  const error = validateGenericFunctionSpec(spec)
  if (error) throw new Error(error)
  next.viewport = estimateGenericFunctionViewport(spec)
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function resetGenericFunctionScene(scene: LessonScene): LessonScene {
  const next = structuredClone(scene)
  for (const parameter of Object.values(next.parameters)) parameter.value = parameter.default
  next.appearance = {
    ...next.appearance,
    theme: 'light', showAxes: true, showGrid: true, showPointLabel: false,
    showHelperLines: false, showFormula: true, showTrail: false,
    curveColor: '#5B5BD6', lineWidth: 3, fontScale: 1,
  }
  next.viewport = estimateGenericFunctionViewport(getGenericFunctionSpec(next))
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function validateGenericFunctionScene(scene: LessonScene): string | null {
  try {
    const spec = getGenericFunctionSpec(scene)
    const error = validateGenericFunctionSpec(spec)
    if (error) return error
    const samples = sampleGenericFunction(spec, 201)
    const finiteCount = samples.filter((sample) => Number.isFinite(sample.y)).length
    if (finiteCount < 2) return '函数在当前定义域内没有足够的可绘制点。'
    return null
  } catch (error) {
    return error instanceof Error ? error.message : '通用函数场景无效。'
  }
}
