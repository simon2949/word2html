import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { updateObjectAppearance } from '../core/objectAppearance'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { ObjectPropertiesPanel } from './ObjectPropertiesPanel'

describe('ObjectPropertiesPanel scope', () => {
  it('explains local editing and shows inherited overall settings', () => {
    const html = renderToStaticMarkup(createElement(ObjectPropertiesPanel, {
      scene: createEllipseScene(),
      selectedObjectId: 'focusLeft',
      onSelect: () => undefined,
      onChange: () => undefined,
      onReset: () => undefined,
    }))

    expect(html).toContain('对象细调')
    expect(html).toContain('局部设置优先于“显示效果”中的整体默认值')
    expect(html).toContain('当前继承整体设置')
    expect(html).toContain('局部点大小')
    expect(html).toContain('清除局部设置，恢复整体样式')
  })

  it('marks a concrete object after a local override is added', () => {
    const scene = updateObjectAppearance(createEllipseScene(), 'focusLeft', {
      color: '#2244AA', pointRadius: 12,
    })
    const html = renderToStaticMarkup(createElement(ObjectPropertiesPanel, {
      scene,
      selectedObjectId: 'focusLeft',
      onSelect: () => undefined,
      onChange: () => undefined,
      onReset: () => undefined,
    }))

    expect(html).toContain('已有 2 项局部设置')
    expect(html).toContain('has-local-override')
    expect(html).toContain('value="#2244AA"')
  })
})
