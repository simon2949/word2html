export type Subject = 'math' | 'physics' | 'chemistry' | 'geography'

export type MatchLevel = 'exact' | 'template' | 'similar' | 'new'

export interface NumberParameter {
  type: 'number'
  label: string
  description: string
  value: number
  default: number
  min: number
  max: number
  step: number
  unit: string
  editable: boolean
}

export interface BooleanParameter {
  type: 'boolean'
  label: string
  description: string
  value: boolean
  default: boolean
  editable: boolean
}

export type SceneParameter = NumberParameter | BooleanParameter

export type SceneObjectKind =
  | 'axes'
  | 'grid'
  | 'ellipse'
  | 'parabola'
  | 'function-curve'
  | 'time-point'
  | 'vector'
  | 'ground-line'
  | 'point'
  | 'segment'
  | 'label'
  | 'trail'

export interface SceneObject {
  id: string
  kind: SceneObjectKind
  role: string
  label?: string
  unit?: string
  bindings: Record<string, string>
  visibleWhen?: keyof SceneAppearance
  interactive?: boolean
}

export interface DerivedValue {
  id: string
  label: string
  expression: string
  unit: string
}

export interface SceneControl {
  id: string
  label: string
  type: 'slider' | 'number' | 'toggle' | 'button'
  target: string
}

export interface SceneInteraction {
  id: string
  trigger: 'drag' | 'click' | 'animation' | 'reset'
  target: string
  action: 'set-angle' | 'play' | 'pause' | 'reset'
}

export interface SceneInvariant {
  id: string
  label: string
  expression: string
  expectedExpression: string
  tolerance: number
  severity: 'error' | 'warning'
}

export interface SceneAppearance {
  theme: 'light' | 'dark'
  showAxes: boolean
  showGrid: boolean
  showFocusLabels: boolean
  showPointLabel: boolean
  showHelperLines: boolean
  showIndividualDistances: boolean
  showDistanceSum: boolean
  showFormula: boolean
  showTrail: boolean
  curveColor: string
  focusColor: string
  pointColor: string
  helperColor: string
  lineWidth: number
  pointRadius: number
  fontScale: number
  animationSpeed: number
}

export interface LessonScene {
  schemaVersion: '0.1'
  id: string
  templateRef: {
    id: string
    version: number
  }
  metadata: {
    title: string
    subject: Subject
    topic: string
    gradeRange: string
    locale: 'zh-CN'
    summary: string
  }
  viewport: {
    xMin: number
    xMax: number
    yMin: number
    yMax: number
    allowZoom: boolean
  }
  parameters: Record<string, SceneParameter>
  derivedValues: DerivedValue[]
  objects: SceneObject[]
  controls: SceneControl[]
  interactions: SceneInteraction[]
  annotations: {
    formula: string
    conclusion: string
  }
  invariants: SceneInvariant[]
  appearance: SceneAppearance
  lineage: {
    source: 'built-in' | 'local-parser' | 'model' | 'imported'
    matchLevel: MatchLevel
    fingerprint: string
    parentSceneId?: string
    updatedAt: string
  }
}

export interface SceneValidationIssue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface SceneValidationResult {
  valid: boolean
  issues: SceneValidationIssue[]
}

export function isNumberParameter(
  parameter: SceneParameter | undefined,
): parameter is NumberParameter {
  return parameter?.type === 'number'
}
