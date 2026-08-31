import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { AppearancePresetsPanel } from './AppearancePresetsPanel'

describe('AppearancePresetsPanel', () => {
  it('renders all controlled presets and identifies the current defaults', () => {
    const html = renderToStaticMarkup(createElement(AppearancePresetsPanel, {
      scene: createEllipseScene(),
      onApplyStyle: () => undefined,
      onApplyLayout: () => undefined,
      onReset: () => undefined,
    }))

    expect(html).toContain('data-active-style-preset="teaching-clean"')
    expect(html).toContain('data-active-layout-preset="with-parameters"')
    expect(html.match(/data-style-preset-id=/g)).toHaveLength(5)
    expect(html.match(/data-layout-preset-id=/g)).toHaveLength(4)
    expect(html).toContain('同时清除对象局部样式')
    expect(html).toContain('AI token：0')
  })
})
