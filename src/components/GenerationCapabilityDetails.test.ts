import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { routeGenerationRequest } from '../core/intentParser'
import { GenerationCapabilityDetails } from './GenerationCapabilityDetails'
import { decideSceneReuse } from '../core/sceneReuse'
import { getOfficialLibraryEntries } from '../core/lessonLibrary'

describe('GenerationCapabilityDetails', () => {
  it('explains a registered runtime and its model decision', () => {
    const html = renderToStaticMarkup(createElement(GenerationCapabilityDetails, {
      route: routeGenerationRequest('绘制 y=A*sin(B*x)，可调 A 和 B'),
    }))
    expect(html).toContain('数学')
    expect(html).toContain('二维显函数图像')
    expect(html).toContain('已注册运行时')
    expect(html).toContain('模型调用')
    expect(html).toContain('需要')
    expect(html).toContain('为何调用模型')
  })

  it('lists actionable primitive gaps before generation', () => {
    const html = renderToStaticMarkup(createElement(GenerationCapabilityDetails, {
      route: routeGenerationRequest('展示酸碱中和过程'),
    }))
    expect(html).toContain('化学')
    expect(html).toContain('缺失能力')
    expect(html).toContain('实验容器')
    expect(html).toContain('反应进度')
    expect(html).toContain('暂时导入经过审核的化学场景文件')
    expect(html).toContain('为何不调用模型')
  })

  it('shows the final zero-call decision after an official-library hit', () => {
    const route = routeGenerationRequest('演示自由落体运动')
    const reuseDecision = decideSceneReuse('演示自由落体运动', route, getOfficialLibraryEntries())
    const html = renderToStaticMarkup(createElement(GenerationCapabilityDetails, {
      route, reuseDecision,
    }))
    expect(html).toContain('最终模型调用')
    expect(html).toContain('不需要')
    expect(html).toContain('为何不调用模型')
    expect(html).toContain('精确匹配')
  })
})
