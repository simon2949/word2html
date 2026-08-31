import type { SceneReuseDecision } from '../core/sceneReuse'

interface GenerationReuseDetailsProps {
  decision: SceneReuseDecision
}

const SOURCE_LABELS = {
  official: '官方库',
  'verified-third-party': '已审核第三方库',
  none: '未命中',
} as const

const LEVEL_LABELS = {
  exact: '精确匹配',
  capability: '同能力复用',
  similar: '相似场景',
  none: '需要新规划',
} as const

export function GenerationReuseDetails({ decision }: GenerationReuseDetailsProps) {
  return (
    <div className={`reuse-decision reuse-decision--${decision.action}`} aria-label="新场景复用判断">
      <div className="reuse-decision-heading">
        <b>新场景复用</b>
        <span>{LEVEL_LABELS[decision.matchLevel]}</span>
      </div>
      <dl>
        <div><dt>来源</dt><dd>{SOURCE_LABELS[decision.source]}</dd></div>
        <div><dt>处理</dt><dd>{decision.action === 'reuse-directly' ? '本地直接复用' : decision.action === 'use-as-model-base' ? '基于场景修改' : decision.action === 'stop' ? '本地停止' : '生成新规划'}</dd></div>
      </dl>
      {decision.candidate && (
        <p className="reuse-candidate">基础场景：<strong>{decision.candidate.title}</strong></p>
      )}
      <p>{decision.reason}</p>
      <small>
        {decision.estimatedModelCallsSaved > 0
          ? `预计减少 ${decision.estimatedModelCallsSaved} 次模型调用`
          : decision.action === 'use-as-model-base'
            ? '仍调用模型，但只修改已校验的同运行时规划'
            : '没有可安全直接复用的已审核内容'}
      </small>
    </div>
  )
}
