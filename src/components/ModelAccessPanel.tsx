import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  ModelServiceStatus,
  PublicModelOption,
  TemporaryModelAccess,
} from '../core/modelGateway'

interface ModelAccessPanelProps {
  modelStatus: ModelServiceStatus
  options: PublicModelOption[]
  optionsError?: string
  access?: TemporaryModelAccess
  userAuthenticated?: boolean
  onApply: (access: TemporaryModelAccess) => void
  onClear: () => void
}

export function ModelAccessPanel({
  modelStatus,
  options,
  optionsError,
  access,
  userAuthenticated = false,
  onApply,
  onClear,
}: ModelAccessPanelProps) {
  const secureTransport = typeof window === 'undefined' || window.location.protocol === 'https:' ||
    ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname)
  const [modelId, setModelId] = useState(access?.modelId ?? options[0]?.id ?? '')
  const [draftKey, setDraftKey] = useState('')
  const selected = useMemo(
    () => options.find((option) => option.id === (access?.modelId ?? modelId)),
    [access?.modelId, modelId, options],
  )

  useEffect(() => {
    if (access?.modelId) setModelId(access.modelId)
    else if (!options.some((option) => option.id === modelId)) setModelId(options[0]?.id ?? '')
  }, [access?.modelId, modelId, options])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const apiKey = draftKey.trim()
    if (!secureTransport || !modelId || apiKey.length < 8) return
    onApply({ modelId, apiKey })
    setDraftKey('')
  }

  return (
    <details className={`model-access-panel ${access ? 'using-user-key' : ''}`}>
      <summary>
        <span aria-hidden="true">⌁</span>
        <div>
          <strong>模型来源</strong>
          <small>{access
            ? `自带 API Key · ${selected?.model ?? access.modelId}`
            : modelStatus.configured
              ? userAuthenticated ? `平台额度 · ${modelStatus.model}` : `平台模型 · 登录后可用`
              : '平台模型尚未配置'}</small>
        </div>
        <b>{access ? '本页临时' : '设置'}</b>
      </summary>
      <div className="model-access-content">
        <div className="model-access-current">
          <strong>{access ? '当前使用用户临时 Key' : '当前使用平台默认模型'}</strong>
          <p>{access
            ? '仅保存在当前页面内存；刷新或关闭页面后自动清除。'
            : userAuthenticated
              ? '使用当前账号的平台有限额度，并受每日调用量和 Token 熔断限制。'
              : '登录后可使用平台有限额度；游客可以在下方临时提供自己的 Key。'}</p>
          {access && <button type="button" onClick={onClear}>清除临时 Key，恢复平台模型</button>}
        </div>
        <form onSubmit={submit}>
          <label>
            <span>可信模型</span>
            <select value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={!secureTransport || options.length === 0}>
              {options.map((option) => (
                <option value={option.id} key={option.id}>{option.label} · {option.model}</option>
              ))}
            </select>
          </label>
          <label>
            <span>临时 API Key</span>
            <input
              type="password"
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              autoComplete="off"
              data-1p-ignore="true"
              placeholder="只用于当前页面中的模型请求"
              maxLength={4096}
              disabled={!secureTransport}
            />
          </label>
          <button className="model-access-apply" type="submit" disabled={!secureTransport || !modelId || draftKey.trim().length < 8}>应用到当前页面</button>
        </form>
        {!secureTransport && <p className="model-access-error">当前页面不是 HTTPS 或本机地址，已禁用临时 API Key。</p>}
        {optionsError && <p className="model-access-error">{optionsError}</p>}
        <p className="model-access-warning">请仅在 HTTPS 或本机地址使用。Key 不会写入浏览器存储、场景文件和导出 HTML，但会经同源服务端转发给所选模型提供商。</p>
      </div>
    </details>
  )
}
