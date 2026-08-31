import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModelAccessPanel } from './ModelAccessPanel'

const status = {
  reachable: true, configured: true, apiCompatible: true,
  provider: 'MiniMax', protocol: 'anthropic-compatible' as const,
  model: 'MiniMax-M3', baseURL: 'https://api.minimaxi.com/anthropic',
}
const options = [{
  id: 'minimax-m3', label: 'MiniMax M3', provider: 'MiniMax',
  protocol: 'anthropic-compatible' as const, model: 'MiniMax-M3', platformKeyAvailable: true,
}]

describe('ModelAccessPanel', () => {
  it('explains platform and temporary-key boundaries', () => {
    const html = renderToStaticMarkup(
      <ModelAccessPanel modelStatus={status} options={options} userAuthenticated onApply={() => undefined} onClear={() => undefined} />,
    )
    expect(html).toContain('平台额度')
    expect(html).toContain('只用于当前页面中的模型请求')
    expect(html).toContain('不会写入浏览器存储')
  })

  it('never renders an active secret back into the page', () => {
    const html = renderToStaticMarkup(
      <ModelAccessPanel
        modelStatus={status}
        options={options}
        access={{ modelId: 'minimax-m3', apiKey: 'top-secret-user-key' }}
        onApply={() => undefined}
        onClear={() => undefined}
      />,
    )
    expect(html).toContain('本页临时')
    expect(html).not.toContain('top-secret-user-key')
  })
})
