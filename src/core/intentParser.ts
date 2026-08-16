import type { LessonScene } from '../types/lessonScene'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { updateAxisParameter, validateAxisValues } from './ellipse'
import { createQuadraticScene } from '../templates/quadraticTemplate'
import {
  QUADRATIC_TEMPLATE_ID,
  updateQuadraticParameter,
  validateQuadraticValues,
} from './quadratic'

export type GenerationRouteKind = 'template' | 'settings' | 'model'

export interface GenerationRoute {
  kind: GenerationRouteKind
  label: string
  reason: string
  templateId?: string
}

export interface TemplateGenerationResult {
  scene: LessonScene
  changes: string[]
  notices: string[]
  normalizedPrompt: string
}

export function normalizePrompt(prompt: string): string {
  return prompt
    .trim()
    .toLowerCase()
    .replace(/[，。！？、；：,.!?;:\s]+/g, '')
    .replace(/核心/g, '焦点')
}

/**
 * Decide whether the request is an existing scene template, a settings edit that
 * belongs in the right panel, or genuinely new content that needs a model.
 */
export function routeGenerationRequest(prompt: string): GenerationRoute {
  const text = prompt.trim()
  if (!text) {
    return { kind: 'settings', label: '等待描述', reason: '请输入要创建的教学内容。' }
  }

  const hasEllipseConcept = /椭圆/.test(text) && /焦点|核心|距离|定义|函数|图像|轨迹/.test(text)
  if (hasEllipseConcept) {
    return {
      kind: 'template',
      label: '复用椭圆模板',
      reason: '已命中审核过的椭圆焦点距离和模板，无需调用大模型。',
      templateId: 'math.conic.ellipse-focus-sum',
    }
  }

  const hasQuadraticConcept = /二次函数|抛物线/.test(text) && /顶点|开口|对称轴|图像|函数|平移|变化/.test(text)
  if (hasQuadraticConcept) {
    return {
      kind: 'template',
      label: '复用二次函数模板',
      reason: '已命中审核过的二次函数顶点式模板，无需调用大模型。',
      templateId: QUADRATIC_TEMPLATE_ID,
    }
  }

  const settingsAction = /隐藏|显示|关闭|打开|颜色|红色|蓝色|绿色|紫色|橙色|黄色|黑色|线宽|字号|网格|坐标轴|动画速度|长轴|短轴|参数|改成|设为|设置为|放大|缩小/.test(text)
  const contentConcept = /制作|绘制|生成|创建|演示|讲解|模拟|函数|定理|实验|反应|运动|地图|气候|电路/.test(text)
  if (settingsAction && !contentConcept) {
    return {
      kind: 'settings',
      label: '属于场景设置',
      reason: '这是参数或显示修改，请直接使用右侧设置面板，不需要自然语言或大模型。',
    }
  }

  return {
    kind: 'model',
    label: '需要大模型',
    reason: '未命中现有模板，需要大模型选择安全通用运行时或说明能力缺口，再经过协议和学科校验。',
  }
}

function extractAxisValue(prompt: string, axis: '长轴' | '短轴'): number | null {
  const expression = new RegExp(
    `${axis}(?:全长)?(?:的长度)?\\s*(?:为|设为|设置为|=|：|:)?\\s*(-?\\d+(?:\\.\\d+)?)`,
  )
  const match = prompt.match(expression)
  if (!match?.[1]) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

export function createSceneFromTemplate(prompt: string): TemplateGenerationResult {
  const route = routeGenerationRequest(prompt)
  if (route.kind !== 'template') throw new Error(route.reason)

  if (route.templateId === QUADRATIC_TEMPLATE_ID) {
    let scene = createQuadraticScene()
    const changes: string[] = []
    const notices: string[] = []
    const coefficient = scene.parameters.coefficientA
    const vertexH = scene.parameters.vertexH
    const vertexK = scene.parameters.vertexK
    if (coefficient?.type !== 'number' || vertexH?.type !== 'number' || vertexK?.type !== 'number') {
      throw new Error('二次函数模板缺少 a、h 或 k 参数。')
    }

    const vertexMatch = prompt.match(/顶点(?:坐标)?\s*(?:为|是|=|：|:)?\s*[（(]\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*[）)]/)
    const extract = (names: string[]) => {
      for (const name of names) {
        const match = prompt.match(new RegExp(`${name}\\s*(?:为|设为|设置为|=|：|:)?\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'))
        if (match?.[1]) return Number(match[1])
      }
      return null
    }
    const a = extract(['二次项系数', '系数\\s*a', '\\ba']) ?? coefficient.value
    const h = vertexMatch?.[1] !== undefined
      ? Number(vertexMatch[1])
      : extract(['顶点横坐标', '\\bh']) ?? vertexH.value
    const k = vertexMatch?.[2] !== undefined
      ? Number(vertexMatch[2])
      : extract(['顶点纵坐标', '\\bk']) ?? vertexK.value
    const error = validateQuadraticValues(scene, { coefficientA: a, vertexH: h, vertexK: k })
    if (error) throw new Error(error)

    if (a !== coefficient.value) {
      scene = updateQuadraticParameter(scene, 'coefficientA', a)
      changes.push(`二次项系数 a 设为 ${a}`)
    }
    if (h !== vertexH.value) {
      scene = updateQuadraticParameter(scene, 'vertexH', h)
      changes.push(`顶点横坐标 h 设为 ${h}`)
    }
    if (k !== vertexK.value) {
      scene = updateQuadraticParameter(scene, 'vertexK', k)
      changes.push(`顶点纵坐标 k 设为 ${k}`)
    }
    scene.lineage = {
      source: 'local-parser',
      matchLevel: 'template',
      fingerprint: `math|quadratic|vertex-form|a:${a}|h:${h}|k:${k}|zh-CN|v1`,
      updatedAt: new Date().toISOString(),
    }
    if (changes.length === 0) notices.push('已采用二次函数模板默认参数；后续参数和显示效果请在右侧修改。')
    return { scene, changes, notices, normalizedPrompt: normalizePrompt(prompt) }
  }

  let scene = createEllipseScene()
  const changes: string[] = []
  const notices: string[] = []
  const majorParameter = scene.parameters.majorAxis
  const minorParameter = scene.parameters.minorAxis
  if (majorParameter?.type !== 'number' || minorParameter?.type !== 'number') {
    throw new Error('椭圆模板缺少长轴或短轴参数。')
  }

  const majorAxis = extractAxisValue(prompt, '长轴') ?? majorParameter.value
  const minorAxis = extractAxisValue(prompt, '短轴') ?? minorParameter.value
  const axisError = validateAxisValues(scene, majorAxis, minorAxis)
  if (axisError) throw new Error(axisError)

  if (majorAxis !== majorParameter.value) {
    scene = updateAxisParameter(scene, 'majorAxis', majorAxis)
    changes.push(`初始长轴全长设为 ${majorAxis}`)
  }
  if (minorAxis !== minorParameter.value) {
    scene = updateAxisParameter(scene, 'minorAxis', minorAxis)
    changes.push(`初始短轴全长设为 ${minorAxis}`)
  }
  if (prompt.includes('核心')) {
    notices.push('已根据上下文将“核心”规范为数学术语“焦点”。')
  }

  scene.lineage = {
    source: 'local-parser',
    matchLevel: 'template',
    fingerprint: `math|ellipse|focus-distance-sum|major:${majorAxis}|minor:${minorAxis}|zh-CN|v1`,
    updatedAt: new Date().toISOString(),
  }

  if (changes.length === 0) notices.push('已采用模板默认参数；后续参数和显示效果请在右侧修改。')
  return { scene, changes, notices, normalizedPrompt: normalizePrompt(prompt) }
}
