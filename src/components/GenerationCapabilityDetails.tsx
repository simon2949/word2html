import {
  MATCH_SOURCE_LABELS,
  SUBJECT_LABELS,
} from '../core/capabilityRegistry'
import type { GenerationRoute } from '../core/intentParser'
import type { SceneReuseDecision } from '../core/sceneReuse'

interface GenerationCapabilityDetailsProps {
  route: GenerationRoute
  reuseDecision?: SceneReuseDecision
}

const STATUS_LABELS = {
  'built-in': '内置',
  experimental: '试验中',
  verified: '已验证',
} as const

export function GenerationCapabilityDetails({ route, reuseDecision }: GenerationCapabilityDetailsProps) {
  const subject = route.subject ? SUBJECT_LABELS[route.subject] : '待识别'
  const willCallModel = route.willCallModel
    && reuseDecision?.action !== 'reuse-directly'
    && reuseDecision?.action !== 'stop'
  const modelReason = route.willCallModel && !willCallModel && reuseDecision
    ? reuseDecision.reason
    : route.modelCallReason
  return (
    <div className="capability-details" aria-label="生成能力判断">
      <dl className="capability-facts">
        <div><dt>学科</dt><dd>{subject}</dd></div>
        <div><dt>知识点</dt><dd>{route.topic}</dd></div>
        <div><dt>命中来源</dt><dd>{MATCH_SOURCE_LABELS[route.matchSource]}</dd></div>
        <div><dt>最终模型调用</dt><dd>{willCallModel ? '需要' : '不需要'}</dd></div>
      </dl>

      {route.requiredCapabilities.length > 0 && (
        <div className="capability-detail-row">
          <span>所需能力</span>
          <ul className="capability-chips">
            {route.requiredCapabilities.map((capability) => (
              <li key={capability.id} title={capability.id}>
                {capability.label}<em>{STATUS_LABELS[capability.status]}</em>
              </li>
            ))}
          </ul>
        </div>
      )}

      {route.missingCapabilities.length > 0 && (
        <div className="capability-detail-row capability-detail-row--missing">
          <span>缺失能力</span>
          <ul className="capability-chips">
            {route.missingCapabilities.map((capability) => (
              <li key={capability.id}>{capability.label}</li>
            ))}
          </ul>
          <p>{route.missingCapabilities[0]?.reason}</p>
          <p><b>建议：</b>{route.missingCapabilities[0]?.suggestion}</p>
        </div>
      )}

      {route.expectedParameters.length > 0 && (
        <div className="capability-detail-row">
          <span>预计参数</span>
          <p>{route.expectedParameters.join('、')}</p>
        </div>
      )}

      {route.interactions.length > 0 && (
        <div className="capability-detail-row">
          <span>交互方式</span>
          <p>{route.interactions.join('、')}</p>
        </div>
      )}

      <div className="capability-model-reason">
        <b>{willCallModel ? '为何调用模型' : '为何不调用模型'}</b>
        <p>{modelReason}</p>
      </div>
    </div>
  )
}
