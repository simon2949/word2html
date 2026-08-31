import type { GenericFunctionParameterSpec } from './genericFunction'
import { compileMathExpression } from './mathExpression'
import type { LessonScene, NumberParameter } from '../types/lessonScene'
import { isNumberParameter } from '../types/lessonScene'

export const COLLISION_2D_TEMPLATE_ID = 'physics.collision.discs-2d'

export interface CollisionBodySpec {
  id: string
  label: string
  xExpression: string
  yExpression: string
  vxExpression: string
  vyExpression: string
  radiusExpression: string
  massExpression: string
}

export interface CollisionBoundsSpec {
  xMinExpression: string
  xMaxExpression: string
  yMinExpression: string
  yMaxExpression: string
}

export interface Collision2DSpec {
  durationExpression: string
  gravityXExpression: string
  gravityYExpression: string
  restitutionExpression: string
  formula: string
  conclusion: string
  parameters: GenericFunctionParameterSpec[]
  bounds: CollisionBoundsSpec
  bodies: CollisionBodySpec[]
}

export interface CollisionBodyState {
  id: string
  label: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  mass: number
}

export interface Collision2DSnapshot {
  time: number
  duration: number
  bodies: CollisionBodyState[]
  collisionCount: number
  kineticEnergy: number
  momentumX: number
  momentumY: number
}

interface EvaluatedCollisionConfig {
  duration: number
  gravityX: number
  gravityY: number
  restitution: number
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number }
  bodies: CollisionBodyState[]
}

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
const RESERVED = new Set(['pi', 'e', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'log', 'ln', 'min', 'max', 'pow', 'step'])
// A fixed rate keeps playback deterministic. Combined with the radius and
// projected-speed limits below, a body cannot cross another body or a wall in
// a single step without first producing a resolvable overlap.
const SIMULATION_RATE = 240

function parameterScope(spec: Collision2DSpec): Record<string, number> {
  return Object.fromEntries(spec.parameters.map((parameter) => [parameter.id, parameter.value]))
}

function evaluateCollisionConfig(spec: Collision2DSpec): EvaluatedCollisionConfig {
  const scope = parameterScope(spec)
  const parameterIds = Object.keys(scope)
  const evaluate = (expression: string) => compileMathExpression(expression, parameterIds).evaluate(scope)
  return {
    duration: evaluate(spec.durationExpression),
    gravityX: evaluate(spec.gravityXExpression),
    gravityY: evaluate(spec.gravityYExpression),
    restitution: evaluate(spec.restitutionExpression),
    bounds: {
      xMin: evaluate(spec.bounds.xMinExpression),
      xMax: evaluate(spec.bounds.xMaxExpression),
      yMin: evaluate(spec.bounds.yMinExpression),
      yMax: evaluate(spec.bounds.yMaxExpression),
    },
    bodies: spec.bodies.map((body) => ({
      id: body.id, label: body.label,
      x: evaluate(body.xExpression), y: evaluate(body.yExpression),
      vx: evaluate(body.vxExpression), vy: evaluate(body.vyExpression),
      radius: evaluate(body.radiusExpression), mass: evaluate(body.massExpression),
    })),
  }
}

function cloneBodies(bodies: CollisionBodyState[]): CollisionBodyState[] {
  return bodies.map((body) => ({ ...body }))
}

function snapshotMetrics(time: number, duration: number, bodies: CollisionBodyState[], collisionCount: number): Collision2DSnapshot {
  return {
    time, duration, bodies: cloneBodies(bodies), collisionCount,
    kineticEnergy: bodies.reduce((sum, body) => sum + 0.5 * body.mass * (body.vx ** 2 + body.vy ** 2), 0),
    momentumX: bodies.reduce((sum, body) => sum + body.mass * body.vx, 0),
    momentumY: bodies.reduce((sum, body) => sum + body.mass * body.vy, 0),
  }
}

function solveWallContacts(body: CollisionBodyState, config: EvaluatedCollisionConfig): number {
  let contacts = 0
  const { bounds, restitution } = config
  if (body.x - body.radius < bounds.xMin) {
    body.x = bounds.xMin + body.radius
    if (body.vx < 0) { body.vx = -body.vx * restitution; contacts += 1 }
  }
  if (body.x + body.radius > bounds.xMax) {
    body.x = bounds.xMax - body.radius
    if (body.vx > 0) { body.vx = -body.vx * restitution; contacts += 1 }
  }
  if (body.y - body.radius < bounds.yMin) {
    body.y = bounds.yMin + body.radius
    if (body.vy < 0) { body.vy = -body.vy * restitution; contacts += 1 }
  }
  if (body.y + body.radius > bounds.yMax) {
    body.y = bounds.yMax - body.radius
    if (body.vy > 0) { body.vy = -body.vy * restitution; contacts += 1 }
  }
  return contacts
}

function solveBodyContact(first: CollisionBodyState, second: CollisionBodyState, restitution: number): number {
  let dx = second.x - first.x
  let dy = second.y - first.y
  let distance = Math.hypot(dx, dy)
  const minimumDistance = first.radius + second.radius
  if (distance >= minimumDistance) return 0
  if (distance < 1e-10) {
    dx = second.vx - first.vx
    dy = second.vy - first.vy
    distance = Math.hypot(dx, dy)
    if (distance < 1e-10) { dx = 1; dy = 0; distance = 1 }
  }
  const nx = dx / distance
  const ny = dy / distance
  const inverseFirst = 1 / first.mass
  const inverseSecond = 1 / second.mass
  const inverseSum = inverseFirst + inverseSecond
  const correction = Math.max(0, minimumDistance - distance - 1e-7) / inverseSum
  first.x -= nx * correction * inverseFirst
  first.y -= ny * correction * inverseFirst
  second.x += nx * correction * inverseSecond
  second.y += ny * correction * inverseSecond
  const relativeNormalVelocity = (second.vx - first.vx) * nx + (second.vy - first.vy) * ny
  if (relativeNormalVelocity >= -1e-9) return 0
  const impulse = -(1 + restitution) * relativeNormalVelocity / inverseSum
  first.vx -= impulse * nx * inverseFirst
  first.vy -= impulse * ny * inverseFirst
  second.vx += impulse * nx * inverseSecond
  second.vy += impulse * ny * inverseSecond
  return 1
}

function buildCollisionFrames(config: EvaluatedCollisionConfig): Collision2DSnapshot[] {
  const steps = Math.max(1, Math.ceil(config.duration * SIMULATION_RATE))
  const dt = config.duration / steps
  const bodies = cloneBodies(config.bodies)
  const frames = [snapshotMetrics(0, config.duration, bodies, 0)]
  let collisionCount = 0
  for (let step = 1; step <= steps; step += 1) {
    for (const body of bodies) {
      body.vx += config.gravityX * dt
      body.vy += config.gravityY * dt
      body.x += body.vx * dt
      body.y += body.vy * dt
      collisionCount += solveWallContacts(body, config)
    }
    // Repeated deterministic solver passes converge simultaneous multi-body
    // and inelastic corner contacts without depending on browser frame rate.
    for (let iteration = 0; iteration < 32; iteration += 1) {
      for (let first = 0; first < bodies.length; first += 1) {
        for (let second = first + 1; second < bodies.length; second += 1) {
          collisionCount += solveBodyContact(bodies[first]!, bodies[second]!, config.restitution)
        }
      }
      for (const body of bodies) {
        collisionCount += solveWallContacts(body, config)
      }
    }
    frames.push(snapshotMetrics(step * dt, config.duration, bodies, collisionCount))
  }
  return frames
}

function validLabel(label: string): boolean {
  return label.length >= 1 && label.length <= 40
}

export function validateCollision2DSpec(spec: Collision2DSpec): string | null {
  if (!spec.formula || spec.formula.length > 200) return '碰撞公式长度必须在 1–200 个字符之间。'
  if (!spec.conclusion || spec.conclusion.length > 400) return '碰撞结论长度必须在 1–400 个字符之间。'
  if (spec.parameters.length > 12) return '二维碰撞最多支持 12 个可调参数。'
  if (spec.bodies.length < 2 || spec.bodies.length > 8) return '二维碰撞必须包含 2–8 个圆形物体。'
  const parameterIds = new Set<string>()
  for (const parameter of spec.parameters) {
    if (!ID_PATTERN.test(parameter.id) || parameterIds.has(parameter.id)) return `碰撞参数 ID 不合法或重复：${parameter.id}`
    if (RESERVED.has(parameter.id)) return `碰撞参数 ID 与保留名称冲突：${parameter.id}`
    if (!validLabel(parameter.label)) return `参数 ${parameter.id} 的名称不合法。`
    if (![parameter.value, parameter.min, parameter.max, parameter.step].every(Number.isFinite)) return `参数 ${parameter.label} 包含无效数字。`
    if (parameter.min >= parameter.max || parameter.step <= 0 || parameter.value < parameter.min || parameter.value > parameter.max) return `参数 ${parameter.label} 的范围或初值无效。`
    parameterIds.add(parameter.id)
  }
  const expressions = [
    ['实验时长', spec.durationExpression], ['水平重力', spec.gravityXExpression],
    ['竖直重力', spec.gravityYExpression], ['恢复系数', spec.restitutionExpression],
    ['边界左侧', spec.bounds.xMinExpression], ['边界右侧', spec.bounds.xMaxExpression],
    ['边界下侧', spec.bounds.yMinExpression], ['边界上侧', spec.bounds.yMaxExpression],
  ] as const
  for (const [label, expression] of expressions) {
    try { compileMathExpression(expression, parameterIds) } catch (error) {
      return error instanceof Error ? `${label}：${error.message}` : `${label}表达式无效。`
    }
  }
  const bodyIds = new Set<string>()
  for (const body of spec.bodies) {
    if (!ID_PATTERN.test(body.id) || bodyIds.has(body.id)) return `碰撞物体 ID 不合法或重复：${body.id}`
    if (!validLabel(body.label)) return `物体 ${body.id} 的名称不合法。`
    for (const [label, expression] of [
      ['x 坐标', body.xExpression], ['y 坐标', body.yExpression],
      ['x 速度', body.vxExpression], ['y 速度', body.vyExpression],
      ['半径', body.radiusExpression], ['质量', body.massExpression],
    ] as const) {
      try { compileMathExpression(expression, parameterIds) } catch (error) {
        return error instanceof Error ? `物体 ${body.label} 的${label}：${error.message}` : `物体 ${body.label} 的${label}表达式无效。`
      }
    }
    bodyIds.add(body.id)
  }
  try {
    const config = evaluateCollisionConfig(spec)
    const scalars = [
      config.duration, config.gravityX, config.gravityY, config.restitution,
      config.bounds.xMin, config.bounds.xMax, config.bounds.yMin, config.bounds.yMax,
      ...config.bodies.flatMap((body) => [body.x, body.y, body.vx, body.vy, body.radius, body.mass]),
    ]
    if (!scalars.every(Number.isFinite)) return '二维碰撞初始状态必须全部是有限数。'
    if (config.duration < 0.2 || config.duration > 20) return '二维碰撞演示时长必须在 0.2–20 秒之间。'
    if (Math.abs(config.gravityX) > 100 || Math.abs(config.gravityY) > 100) return '重力加速度绝对值不能超过 100。'
    if (config.restitution < 0 || config.restitution > 1) return '恢复系数必须在 0–1 之间。'
    const width = config.bounds.xMax - config.bounds.xMin
    const height = config.bounds.yMax - config.bounds.yMin
    if (width < 2 || height < 2 || width > 100 || height > 100) return '碰撞边界宽高必须在 2–100 之间。'
    for (const body of config.bodies) {
      if (body.radius < 0.2 || body.radius > Math.min(width, height) / 4) return `物体 ${body.label} 的半径必须在 0.2 到边界较短边四分之一之间。`
      if (body.mass < 0.05 || body.mass > 1000) return `物体 ${body.label} 的质量无效。`
      const projectedSpeed = Math.hypot(body.vx, body.vy) + Math.hypot(config.gravityX, config.gravityY) * config.duration
      if (projectedSpeed > 40) return `物体 ${body.label} 的预计最大速度过大，请降低初速度、重力或实验时长。`
      if (body.x - body.radius < config.bounds.xMin || body.x + body.radius > config.bounds.xMax || body.y - body.radius < config.bounds.yMin || body.y + body.radius > config.bounds.yMax) return `物体 ${body.label} 的初始位置超出接触边界。`
    }
    for (let first = 0; first < config.bodies.length; first += 1) {
      for (let second = first + 1; second < config.bodies.length; second += 1) {
        const left = config.bodies[first]!
        const right = config.bodies[second]!
        if (Math.hypot(left.x - right.x, left.y - right.y) < left.radius + right.radius - 1e-7) return `物体 ${left.label} 与 ${right.label} 的初始位置重叠。`
      }
    }
    const frames = buildCollisionFrames(config)
    if (frames.some((frame) => [frame.kineticEnergy, frame.momentumX, frame.momentumY, ...frame.bodies.flatMap((body) => [body.x, body.y, body.vx, body.vy])].some((value) => !Number.isFinite(value) || Math.abs(value) > 1e8))) return '二维碰撞运行过程中出现无效或过大的数值。'
    for (const frame of frames) {
      for (const body of frame.bodies) {
        if (
          body.x - body.radius < config.bounds.xMin - 1e-5
          || body.x + body.radius > config.bounds.xMax + 1e-5
          || body.y - body.radius < config.bounds.yMin - 1e-5
          || body.y + body.radius > config.bounds.yMax + 1e-5
        ) return `物体 ${body.label} 在运行过程中穿过了接触边界。`
      }
      for (let first = 0; first < frame.bodies.length; first += 1) {
        for (let second = first + 1; second < frame.bodies.length; second += 1) {
          const left = frame.bodies[first]!
          const right = frame.bodies[second]!
          if (Math.hypot(left.x - right.x, left.y - right.y) < left.radius + right.radius - 5e-4) {
            return `物体 ${left.label} 与 ${right.label} 在运行过程中发生了未解算穿透。`
          }
        }
      }
    }
  } catch (error) {
    return error instanceof Error ? error.message : '二维碰撞场景无法计算。'
  }
  return null
}

export function getCollision2DSpec(scene: LessonScene): Collision2DSpec {
  if (scene.templateRef.id !== COLLISION_2D_TEMPLATE_ID) throw new Error('当前场景不是二维圆盘碰撞场景。')
  const surface = scene.objects.find((object) => object.kind === 'contact-surface')
  if (!surface) throw new Error('二维碰撞场景缺少接触边界。')
  return {
    durationExpression: surface.bindings.durationExpression ?? '',
    gravityXExpression: surface.bindings.gravityXExpression ?? '',
    gravityYExpression: surface.bindings.gravityYExpression ?? '',
    restitutionExpression: surface.bindings.restitutionExpression ?? '',
    formula: scene.annotations.formula,
    conclusion: scene.annotations.conclusion,
    parameters: Object.entries(scene.parameters)
      .filter((entry): entry is [string, NumberParameter] => isNumberParameter(entry[1]))
      .map(([id, parameter]) => ({ id, label: parameter.label, value: parameter.value, min: parameter.min, max: parameter.max, step: parameter.step })),
    bounds: {
      xMinExpression: surface.bindings.xMinExpression ?? '', xMaxExpression: surface.bindings.xMaxExpression ?? '',
      yMinExpression: surface.bindings.yMinExpression ?? '', yMaxExpression: surface.bindings.yMaxExpression ?? '',
    },
    bodies: scene.objects.filter((object) => object.kind === 'collision-body').map((body) => ({
      id: body.id.replace(/^collisionBody\./, ''), label: body.label ?? body.id,
      xExpression: body.bindings.xExpression ?? '', yExpression: body.bindings.yExpression ?? '',
      vxExpression: body.bindings.vxExpression ?? '', vyExpression: body.bindings.vyExpression ?? '',
      radiusExpression: body.bindings.radiusExpression ?? '', massExpression: body.bindings.massExpression ?? '',
    })),
  }
}

export function validateCollision2DScene(scene: LessonScene): string | null {
  try { return validateCollision2DSpec(getCollision2DSpec(scene)) } catch (error) {
    return error instanceof Error ? error.message : '二维碰撞场景无效。'
  }
}

export function createCollision2DRuntime(scene: LessonScene) {
  const spec = getCollision2DSpec(scene)
  const error = validateCollision2DSpec(spec)
  if (error) throw new Error(error)
  const config = evaluateCollisionConfig(spec)
  const frames = buildCollisionFrames(config)
  return {
    duration: config.duration,
    bounds: config.bounds,
    gravityX: config.gravityX,
    gravityY: config.gravityY,
    restitution: config.restitution,
    snapshot(time: number): Collision2DSnapshot {
      const clamped = Math.min(config.duration, Math.max(0, time))
      const index = Math.min(frames.length - 1, Math.round(clamped / config.duration * (frames.length - 1)))
      return frames[index]!
    },
    samples(time: number, count = 121): Collision2DSnapshot[] {
      const end = Math.min(config.duration, Math.max(0, time))
      return Array.from({ length: count }, (_, index) => this.snapshot(count === 1 ? end : end * index / (count - 1)))
    },
  }
}

export function collisionViewport(scene: LessonScene): LessonScene['viewport'] {
  const runtime = createCollision2DRuntime(scene)
  const width = runtime.bounds.xMax - runtime.bounds.xMin
  const height = runtime.bounds.yMax - runtime.bounds.yMin
  const margin = Math.max(0.5, Math.min(width, height) * 0.06)
  return { xMin: runtime.bounds.xMin - margin, xMax: runtime.bounds.xMax + margin, yMin: runtime.bounds.yMin - margin, yMax: runtime.bounds.yMax + margin, allowZoom: true }
}

export function updateCollisionParameter(scene: LessonScene, id: string, value: number): LessonScene {
  const parameter = scene.parameters[id]
  if (!isNumberParameter(parameter)) throw new Error(`二维碰撞场景缺少参数：${id}`)
  if (!Number.isFinite(value) || value < parameter.min || value > parameter.max) throw new Error(`${parameter.label}必须在 ${parameter.min} 到 ${parameter.max} 之间。`)
  const next = structuredClone(scene)
  ;(next.parameters[id] as NumberParameter).value = value
  const error = validateCollision2DScene(next)
  if (error) throw new Error(error)
  next.viewport = collisionViewport(next)
  next.lineage.updatedAt = new Date().toISOString()
  return next
}

export function resetCollisionScene(scene: LessonScene): LessonScene {
  const next = structuredClone(scene)
  for (const parameter of Object.values(next.parameters)) if (isNumberParameter(parameter)) parameter.value = parameter.default
  delete next.appearance.objectStyles
  next.viewport = collisionViewport(next)
  next.lineage.updatedAt = new Date().toISOString()
  return next
}
