import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getOfficialLibraryEntries } from '../core/lessonLibrary'
import { SettingsPanel } from './SettingsPanel'

describe('SettingsPanel', () => {
  it('groups independently adjustable collision mass and velocity parameters by body', () => {
    const entry = getOfficialLibraryEntries().find((item) => item.id === 'official.collision-discs-2d')
    if (!entry) throw new Error('二维圆盘官方场景缺失')

    const html = renderToStaticMarkup(createElement(SettingsPanel, {
      scene: entry.scene,
      onParameterChange: () => undefined,
      onAppearanceChange: () => undefined,
      error: null,
    }))

    expect(html).toContain('aria-label="碰撞全局参数"')
    for (const body of ['A', 'B', 'C']) {
      expect(html).toContain(`aria-label="圆盘 ${body} 参数"`)
      expect(html).toContain(`圆盘 ${body} 质量（kg）`)
      expect(html).toContain(`圆盘 ${body} 水平初速度 vx（m/s）`)
      expect(html).toContain(`圆盘 ${body} 竖直初速度 vy（m/s）`)
    }
  })
})
