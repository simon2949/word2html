import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getOfficialLibraryEntries, type LessonLibraryEntry } from './lessonLibrary'
import { lessonPlanFromScene } from './modelGateway'
import { routeGenerationRequest } from './intentParser'
import {
  capabilityFingerprintOfScene,
  contextualReuseCacheKey,
  decideSceneReuse,
  materializeReusableScene,
  modelReuseCacheKey,
} from './sceneReuse'
import { GenerationReuseDetails } from '../components/GenerationReuseDetails'
import { isNumberParameter } from '../types/lessonScene'

describe('reuse-first scene planning', () => {
  const official = getOfficialLibraryEntries()

  it('directly reuses exact reviewed content without a model call', () => {
    const prompt = '模拟自由落体运动，可调初始高度和重力加速度'
    const decision = decideSceneReuse(prompt, routeGenerationRequest(prompt), official)
    expect(decision).toMatchObject({
      action: 'reuse-directly', source: 'official', matchLevel: 'exact',
      estimatedModelCallsSaved: 1,
    })
    expect(decision.candidate?.title).toBe('自由落体运动')
  })

  it('directly reuses the official hyperbola trace for focal-distance requests', () => {
    const prompt = '制作双曲线函数图像，演示任一点到两个焦点的距离差绝对值不变'
    const decision = decideSceneReuse(prompt, routeGenerationRequest(prompt), official)
    expect(decision).toMatchObject({
      action: 'reuse-directly', source: 'official', matchLevel: 'exact',
      estimatedModelCallsSaved: 1,
    })
    expect(decision.candidate?.entryId).toBe('official.hyperbola-focus-difference')
  })

  it('reuses the same capability and applies explicit parameter values locally', () => {
    const prompt = '绘制 y=A*sin(B*x)，A=3，B=2'
    const decision = decideSceneReuse(prompt, routeGenerationRequest(prompt), official)
    expect(decision.action).toBe('reuse-directly')
    expect(decision.matchLevel).toBe('capability')
    const result = materializeReusableScene(decision.candidate!, prompt)
    const amplitude = result.scene.parameters.A
    const frequency = result.scene.parameters.B
    expect(isNumberParameter(amplitude) && amplitude.value).toBe(3)
    expect(isNumberParameter(frequency) && frequency.value).toBe(2)
    expect(result.changes).toEqual(expect.arrayContaining(['振幅 A设为 3', '频率 B设为 2']))
  })

  it('uses a similar reviewed scene only as a constrained model-edit base', () => {
    const prompt = '绘制 y=A*cos(B*x)，可调 A 和 B'
    const decision = decideSceneReuse(prompt, routeGenerationRequest(prompt), official)
    expect(decision).toMatchObject({
      action: 'use-as-model-base', source: 'official', matchLevel: 'similar',
    })
    expect(decision.candidate?.title).toContain('正弦函数')
  })

  it('never automatically reuses an unreviewed local third-party entry', () => {
    const source = official.find((entry) => entry.id === 'official.free-fall')!
    const pending: LessonLibraryEntry = {
      ...structuredClone(source),
      id: 'third-party.pending', source: 'third-party', catalog: 'local', reviewStatus: 'pending',
    }
    const prompt = '演示自由落体运动'
    const decision = decideSceneReuse(prompt, routeGenerationRequest(prompt), [pending])
    expect(decision.action).toBe('generate')
    expect(decision.candidate).toBeUndefined()
  })

  it('keeps fingerprints stable across values and cache keys isolated by capability/base', () => {
    const sine = official.find((entry) => entry.id === 'official.sine-parameters')!.scene
    const prompt = '绘制 y=A*sin(B*x)，A=3，B=2'
    const decision = decideSceneReuse(prompt, routeGenerationRequest(prompt), official)
    const changed = materializeReusableScene(decision.candidate!, prompt).scene
    expect(capabilityFingerprintOfScene(changed)).toBe(capabilityFingerprintOfScene(sine))

    expect(modelReuseCacheKey('相同描述', 'math.function.explicit-2d', 'MiniMax', 'M3'))
      .not.toBe(modelReuseCacheKey('相同描述', 'physics.motion.point-2d', 'MiniMax', 'M3'))
    expect(modelReuseCacheKey('相同描述', 'math.function.explicit-2d', '统一网关', 'M3', 'anthropic-compatible'))
      .not.toBe(modelReuseCacheKey('相同描述', 'math.function.explicit-2d', '统一网关', 'M3', 'openai-compatible'))

    const base = lessonPlanFromScene(sine)
    const otherBase = structuredClone(base)
    otherBase.functionSpec!.parameters[0]!.value = 4
    expect(contextualReuseCacheKey('改成余弦', base, 'MiniMax', 'M3'))
      .not.toBe(contextualReuseCacheKey('改成余弦', otherBase, 'MiniMax', 'M3'))
  })

  it('renders the reuse source, candidate and saved call estimate', () => {
    const prompt = '演示自由落体运动'
    const decision = decideSceneReuse(prompt, routeGenerationRequest(prompt), official)
    const html = renderToStaticMarkup(createElement(GenerationReuseDetails, { decision }))
    expect(html).toContain('新场景复用')
    expect(html).toContain('官方库')
    expect(html).toContain('自由落体运动')
    expect(html).toContain('预计减少 1 次模型调用')
  })
})
