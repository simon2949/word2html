import { createEllipseScene } from '../templates/ellipseTemplate'
import { createQuadraticScene } from '../templates/quadraticTemplate'
import type { LessonScene, Subject } from '../types/lessonScene'
import {
  assertSceneRendererSupported,
  instantiateLessonPlan,
  type LessonPlan,
} from './modelGateway'
import { assertLessonScene } from './validateScene'

const THIRD_PARTY_LIBRARY_KEY = 'word2html.lesson-library.third-party.v0.1'
const MAX_THIRD_PARTY_ENTRIES = 30
const OFFICIAL_UPDATED_AT = '2026-08-26T00:00:00.000Z'

export type LessonLibrarySource = 'official' | 'third-party'
export type LessonReviewStatus = 'official' | 'pending' | 'verified'

export interface LessonLibraryEntry {
  id: string
  source: LessonLibrarySource
  catalog?: 'bundled' | 'local' | 'shared'
  reviewStatus: LessonReviewStatus
  title: string
  subject: Subject
  topic: string
  summary: string
  sourceFilename?: string
  revisionOfSubmissionId?: string
  createdAt: string
  updatedAt: string
  reuseHints?: {
    aliases: string[]
    conceptTerms: string[]
    keywords: string[]
    interactionSignature: string[]
  }
  scene: LessonScene
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function officialScene(id: string, scene: LessonScene): LessonScene {
  const next = structuredClone(scene)
  next.id = `scene.official.${id}`
  next.lineage = {
    source: 'built-in',
    matchLevel: 'template',
    fingerprint: `official|${id}|${next.lineage.fingerprint}`.slice(0, 200),
    updatedAt: OFFICIAL_UPDATED_AT,
  }
  assertLessonScene(next)
  assertSceneRendererSupported(next)
  return next
}

function officialEntry(
  id: string,
  scene: LessonScene,
  reuseHints: NonNullable<LessonLibraryEntry['reuseHints']>,
): LessonLibraryEntry {
  const reviewed = officialScene(id, scene)
  return {
    id: `official.${id}`,
    source: 'official',
    catalog: 'bundled',
    reviewStatus: 'official',
    title: reviewed.metadata.title,
    subject: reviewed.metadata.subject,
    topic: reviewed.metadata.topic,
    summary: reviewed.metadata.summary,
    createdAt: OFFICIAL_UPDATED_AT,
    updatedAt: OFFICIAL_UPDATED_AT,
    reuseHints,
    scene: reviewed,
  }
}

const sinePlan: LessonPlan = {
  schemaVersion: '0.1',
  status: 'matched',
  subject: 'math',
  topic: '正弦函数的振幅与频率',
  templateId: 'math.function.generic-2d',
  parameterOverrides: {},
  functionSpec: {
    expression: 'A*sin(B*x)',
    formula: 'y = A sin(Bx)',
    xMin: -10,
    xMax: 10,
    parameters: [
      { id: 'A', label: '振幅 A', value: 2, min: 0.5, max: 5, step: 0.1 },
      { id: 'B', label: '频率 B', value: 1, min: 0.2, max: 3, step: 0.1 },
    ],
  },
  reason: '调节 A 和 B，观察振幅与频率对正弦函数图像的影响。',
}

const hyperbolaFocusDifferencePlan: LessonPlan = {
  schemaVersion: '0.1',
  status: 'matched',
  subject: 'math',
  topic: '双曲线的焦点距离差',
  templateId: 'experiment.motion.point-2d',
  parameterOverrides: {},
  experimentSpec: {
    durationExpression: 'T',
    bodyId: 'hyperbolaRight',
    bodyLabel: 'P',
    xExpression: 'a*(exp(u)+exp(0-u))/2',
    yExpression: 'b*(exp(u)-exp(0-u))/2',
    formula: 'x^2/a^2 - y^2/b^2 = 1, |PF1 - PF2| = 2a',
    conclusion: '播放轨迹可描出双曲线左右两支；任一支上的动点到两个焦点的距离差绝对值始终等于 2a。',
    parameters: [
      { id: 'a', label: '半实轴 a', value: 3, min: 1, max: 6, step: 0.25 },
      { id: 'b', label: '半虚轴 b', value: 2, min: 0.5, max: 5, step: 0.25 },
      { id: 'U', label: '轨迹范围 U', value: 2.4, min: 1, max: 3.2, step: 0.1 },
      { id: 'T', label: '描绘时间 T', value: 8, min: 3, max: 15, step: 0.5 },
    ],
    metrics: [
      { id: 'c', label: '焦半距 c', expression: 'sqrt(a^2+b^2)', unit: '' },
      { id: 'u', label: '轨迹参数 u', expression: '0-U+2*U*t/T', unit: '' },
      {
        id: 'distanceDifference', label: '距离差绝对值', unit: '',
        expression: 'abs(sqrt((a*(exp(u)+exp(0-u))/2-c)^2+(b*(exp(u)-exp(0-u))/2)^2)-sqrt((a*(exp(u)+exp(0-u))/2+c)^2+(b*(exp(u)-exp(0-u))/2)^2))',
      },
      { id: 'expectedDifference', label: '理论常量 2a', expression: '2*a', unit: '' },
    ],
    additionalBodies: [
      {
        id: 'hyperbolaLeft', label: 'Q',
        xExpression: '0-a*(exp(u)+exp(0-u))/2', yExpression: 'b*(exp(u)-exp(0-u))/2',
      },
      { id: 'focusRight', label: 'F2', xExpression: 'c', yExpression: '0' },
      { id: 'focusLeft', label: 'F1', xExpression: '0-c', yExpression: '0' },
    ],
    vectors: [
      {
        id: 'toRightFocus', label: 'PF2', bodyId: 'hyperbolaRight',
        xExpression: 'c-a*(exp(u)+exp(0-u))/2',
        yExpression: '0-b*(exp(u)-exp(0-u))/2',
        scale: 1, unit: '长度单位', display: 'distance', labelMode: 'value',
      },
      {
        id: 'toLeftFocus', label: 'PF1', bodyId: 'hyperbolaRight',
        xExpression: '0-c-a*(exp(u)+exp(0-u))/2',
        yExpression: '0-b*(exp(u)-exp(0-u))/2',
        scale: 1, unit: '长度单位', display: 'distance', labelMode: 'value',
      },
    ],
    constraints: [],
  },
  reason: '复用受限时间轨迹运行时，描出双曲线两支并实时验证焦点距离差不变量。',
}

const geometryPlan: LessonPlan = {
  schemaVersion: '0.1',
  status: 'matched',
  subject: 'math',
  topic: '可拖动三角形的边、角与面积',
  templateId: 'math.geometry.primitives-2d',
  parameterOverrides: {},
  geometrySpec: {
    formula: 'S = 1/2 |(B-A) × (C-A)|',
    conclusion: '拖动三个顶点，观察边长、夹角和面积如何随几何位置同步变化。',
    parameters: [
      { id: 'Ax', label: 'A 点横坐标', value: -3, min: -8, max: 8, step: 0.1 },
      { id: 'Ay', label: 'A 点纵坐标', value: -2, min: -6, max: 6, step: 0.1 },
      { id: 'Bx', label: 'B 点横坐标', value: 3, min: -8, max: 8, step: 0.1 },
      { id: 'By', label: 'B 点纵坐标', value: -2, min: -6, max: 6, step: 0.1 },
      { id: 'Cx', label: 'C 点横坐标', value: 1, min: -8, max: 8, step: 0.1 },
      { id: 'Cy', label: 'C 点纵坐标', value: 3, min: -6, max: 6, step: 0.1 },
    ],
    points: [
      { id: 'A', label: 'A', xExpression: 'Ax', yExpression: 'Ay', draggable: true },
      { id: 'B', label: 'B', xExpression: 'Bx', yExpression: 'By', draggable: true },
      { id: 'C', label: 'C', xExpression: 'Cx', yExpression: 'Cy', draggable: true },
    ],
    connections: [
      { id: 'AB', label: '线段 AB', kind: 'segment', fromPointId: 'A', toPointId: 'B' },
      { id: 'BC', label: '向量 BC', kind: 'vector', fromPointId: 'B', toPointId: 'C' },
      { id: 'AC', label: '射线 AC', kind: 'ray', fromPointId: 'A', toPointId: 'C' },
    ],
    arcs: [
      { id: 'angleB', label: '∠ABC', centerPointId: 'B', startPointId: 'A', endPointId: 'C' },
    ],
    polygons: [
      { id: 'triangleABC', label: '三角形 ABC', pointIds: ['A', 'B', 'C'], filled: true },
    ],
    measurements: [
      { id: 'lengthAB', label: 'AB', kind: 'distance', pointIds: ['A', 'B'], unit: '' },
      { id: 'angleABC', label: '∠ABC', kind: 'angle', pointIds: ['A', 'B', 'C'], unit: '°' },
      { id: 'areaABC', label: '面积', kind: 'area', pointIds: ['A', 'B', 'C'], unit: '' },
    ],
    loci: [],
  },
  reason: '用统一二维几何原语构造可拖动三角形，并实时计算边长、角度和面积。',
}

const freeFallPlan: LessonPlan = {
  schemaVersion: '0.1',
  status: 'matched',
  subject: 'physics',
  topic: '自由落体运动',
  templateId: 'experiment.motion.point-2d',
  parameterOverrides: {},
  experimentSpec: {
    durationExpression: 'sqrt(2*h0/g)',
    xExpression: '0',
    yExpression: 'max(0,h0-0.5*g*t^2)',
    formula: 'h(t) = h0 - 0.5gt^2',
    conclusion: '忽略空气阻力时，下落加速度保持为 g，速度随时间线性增加。',
    parameters: [
      { id: 'h0', label: '初始高度', value: 20, min: 2, max: 50, step: 1 },
      { id: 'g', label: '重力加速度', value: 9.8, min: 1, max: 15, step: 0.1 },
    ],
    metrics: [
      { id: 'height', label: '当前高度', expression: 'max(0,h0-0.5*g*t^2)', unit: 'm' },
      { id: 'speed', label: '当前速度', expression: 'g*t', unit: 'm/s' },
    ],
    vectors: [
      { id: 'velocity', label: '速度', xExpression: '0', yExpression: '0-g*t', scale: 0.1, unit: 'm/s' },
      { id: 'gravity', label: '重力加速度', xExpression: '0', yExpression: '0-g', scale: 0.15, unit: 'm/s^2' },
    ],
  },
  reason: '用受限点运动运行时演示自由落体。',
}

const dualPendulumPlan: LessonPlan = {
  schemaVersion: '0.1',
  status: 'matched',
  subject: 'physics',
  topic: '两个独立单摆的周期比较',
  templateId: 'experiment.motion.point-2d',
  parameterOverrides: {},
  experimentSpec: {
    durationExpression: '4*pi*sqrt(max(L1,L2)/g)',
    bodyId: 'pendulum1',
    bodyLabel: '左摆球',
    xExpression: '0-2+L1*sin(theta1)',
    yExpression: '0-L1*cos(theta1)',
    formula: 'T = 2pi sqrt(L/g)',
    conclusion: '在小角度近似下，摆长越长周期越大；两个摆长均可独立调节。',
    parameters: [
      { id: 'g', label: '重力加速度', value: 9.8, min: 1, max: 20, step: 0.1 },
      { id: 'L1', label: '左摆长', value: 1, min: 0.3, max: 3, step: 0.1 },
      { id: 'L2', label: '右摆长', value: 1.5, min: 0.3, max: 3, step: 0.1 },
      { id: 'theta01', label: '左初始角', value: 0.25, min: 0.05, max: 0.35, step: 0.01 },
      { id: 'theta02', label: '右初始角', value: 0.2, min: 0.05, max: 0.35, step: 0.01 },
    ],
    metrics: [
      { id: 'theta1', label: '左摆角', expression: 'theta01*cos(sqrt(g/L1)*t)', unit: 'rad' },
      { id: 'theta2', label: '右摆角', expression: 'theta02*cos(sqrt(g/L2)*t)', unit: 'rad' },
    ],
    additionalBodies: [{
      id: 'pendulum2',
      label: '右摆球',
      xExpression: '2+L2*sin(theta2)',
      yExpression: '0-L2*cos(theta2)',
    }],
    vectors: [],
    constraints: [
      {
        id: 'rope1', label: '左摆绳', type: 'rope', bodyId: 'pendulum1',
        anchorXExpression: '0-2', anchorYExpression: '0', restLengthExpression: 'L1',
      },
      {
        id: 'rope2', label: '右摆绳', type: 'rope', bodyId: 'pendulum2',
        anchorXExpression: '2', anchorYExpression: '0', restLengthExpression: 'L2',
      },
    ],
  },
  reason: '用两个受绳长约束的质点比较单摆周期。',
}

const collision2DPlan: LessonPlan = {
  schemaVersion: '0.1',
  status: 'matched',
  subject: 'physics',
  topic: '二维圆盘接触与碰撞',
  templateId: 'physics.collision.discs-2d',
  parameterOverrides: {},
  collisionSpec: {
    durationExpression: 'duration',
    gravityXExpression: '0',
    gravityYExpression: '0',
    restitutionExpression: 'restitution',
    formula: 'Σp(碰前) = Σp(碰后)',
    conclusion: '圆盘接触时，法线方向的冲量改变速度；孤立系统总动量守恒，恢复系数决定法向相对速度的保留程度。',
    parameters: [
      { id: 'duration', label: '实验时长', value: 6, min: 2, max: 10, step: 0.25 },
      { id: 'restitution', label: '恢复系数', value: 0.9, min: 0, max: 1, step: 0.05 },
      { id: 'massA', label: '圆盘 A 质量（kg）', value: 1, min: 0.25, max: 5, step: 0.25 },
      { id: 'vxA', label: '圆盘 A 水平初速度 vx（m/s）', value: 3, min: -5, max: 5, step: 0.25 },
      { id: 'vyA', label: '圆盘 A 竖直初速度 vy（m/s）', value: 0.75, min: -5, max: 5, step: 0.25 },
      { id: 'massB', label: '圆盘 B 质量（kg）', value: 2, min: 0.25, max: 5, step: 0.25 },
      { id: 'vxB', label: '圆盘 B 水平初速度 vx（m/s）', value: -0.5, min: -5, max: 5, step: 0.25 },
      { id: 'vyB', label: '圆盘 B 竖直初速度 vy（m/s）', value: 0, min: -5, max: 5, step: 0.25 },
      { id: 'massC', label: '圆盘 C 质量（kg）', value: 1.5, min: 0.25, max: 5, step: 0.25 },
      { id: 'vxC', label: '圆盘 C 水平初速度 vx（m/s）', value: -1, min: -5, max: 5, step: 0.25 },
      { id: 'vyC', label: '圆盘 C 竖直初速度 vy（m/s）', value: 1, min: -5, max: 5, step: 0.25 },
    ],
    bounds: {
      xMinExpression: '0-8', xMaxExpression: '8',
      yMinExpression: '0-5', yMaxExpression: '5',
    },
    bodies: [
      {
        id: 'discA', label: '圆盘 A', xExpression: '0-4', yExpression: '0-1',
        vxExpression: 'vxA', vyExpression: 'vyA', radiusExpression: '0.6', massExpression: 'massA',
      },
      {
        id: 'discB', label: '圆盘 B', xExpression: '0', yExpression: '0',
        vxExpression: 'vxB', vyExpression: 'vyB', radiusExpression: '0.6', massExpression: 'massB',
      },
      {
        id: 'discC', label: '圆盘 C', xExpression: '3', yExpression: '0-2',
        vxExpression: 'vxC', vyExpression: 'vyC', radiusExpression: '0.55', massExpression: 'massC',
      },
    ],
  },
  reason: '用固定时间步的二维圆盘接触求解器演示多体碰撞、边界反弹、动量和动能变化。',
}

const polarRosePlan: LessonPlan = {
  schemaVersion: '0.1', status: 'matched', subject: 'math',
  topic: '极坐标三瓣玫瑰线', templateId: 'math.curve.relation-2d', parameterOverrides: {},
  relationSpec: {
    mode: 'polar', formula: 'r = a cos(3θ)',
    conclusion: '当 θ 转动一周时，极径按 cos(3θ) 周期变化，形成三片对称花瓣；a 控制整体尺度。',
    parameters: [{ id: 'a', label: '尺度 a', value: 3, min: 1, max: 5, step: 0.25 }],
    xMin: -4, xMax: 4, yMin: -4, yMax: 4,
    variableMin: 0, variableMax: Math.PI * 2,
    radialExpression: 'a*cos(3*theta)',
  },
  reason: '用受控极坐标表达式演示角频率与对称花瓣数量，并允许本地调整尺度。',
}

const monthlyTemperatureChartPlan: LessonPlan = {
  schemaVersion: '0.1', status: 'matched', subject: 'math',
  topic: '两地月平均气温比较', templateId: 'math.data.chart-2d', parameterOverrides: {},
  dataChartSpec: {
    mode: 'line',
    formula: '用折线的方向和斜率比较数据变化趋势',
    conclusion: '甲地气温上升更快；两地在四月的平均气温最接近。',
    xLabel: '月份', yLabel: '月平均气温', unit: '℃',
    categories: ['一月', '二月', '三月', '四月', '五月', '六月'],
    series: [
      { id: 'placeA', label: '甲地', values: [-2, 1, 7, 14, 20, 24] },
      { id: 'placeB', label: '乙地', values: [6, 8, 11, 15, 19, 22] },
    ],
  },
  reason: '用两个数据系列演示如何从折线图读取变化趋势、比较增减速度和接近程度。',
}

const geometryTransformationPlan: LessonPlan = {
  schemaVersion: '0.1', status: 'matched', subject: 'math',
  topic: '旋转、圆周轨迹与垂足', templateId: 'math.geometry.primitives-2d', parameterOverrides: {},
  geometrySpec: {
    formula: 'R = Rotate(O, A, θ)，OR = OA',
    conclusion: '点 A 绕中心 O 旋转 θ 得到 R；当 θ 取完整范围时，R 的轨迹是以 O 为圆心、OA 为半径的圆。',
    parameters: [
      { id: 'theta', label: '旋转角 θ（弧度）', value: 0.8, min: -3.141592653589793, max: 3.141592653589793, step: 0.05 },
      { id: 'Px', label: '约束点 P 横坐标', value: 2.2, min: -5, max: 5, step: 0.1 },
      { id: 'Py', label: '约束点 P 纵坐标', value: 1.8, min: -5, max: 5, step: 0.1 },
      { id: 'k', label: '位似比 k', value: 0.6, min: 0.2, max: 1.8, step: 0.1 },
    ],
    points: [
      { id: 'O', label: 'O', xExpression: '0', yExpression: '0' },
      { id: 'X', label: 'X', xExpression: '1', yExpression: '0' },
      { id: 'A', label: 'A', xExpression: '3', yExpression: '0' },
      { id: 'P', label: 'P', xExpression: 'Px', yExpression: 'Py', draggable: true, constraint: { kind: 'circle', centerPointId: 'O', radiusExpression: '3' } },
      { id: 'R', label: 'R', construction: { kind: 'rotation', sourcePointId: 'A', centerPointId: 'O', angleExpression: 'theta' } },
      { id: 'M', label: 'M', construction: { kind: 'midpoint', pointAId: 'A', pointBId: 'R' } },
      { id: 'H', label: 'H', construction: { kind: 'projection', sourcePointId: 'R', linePointAId: 'O', linePointBId: 'X' } },
      { id: 'S', label: 'S', construction: { kind: 'reflection', sourcePointId: 'R', linePointAId: 'O', linePointBId: 'X' } },
      { id: 'D', label: 'D', construction: { kind: 'dilation', sourcePointId: 'R', centerPointId: 'O', scaleExpression: 'k' } },
    ],
    connections: [
      { id: 'OA', label: 'OA', kind: 'segment', fromPointId: 'O', toPointId: 'A' },
      { id: 'OR', label: 'OR', kind: 'segment', fromPointId: 'O', toPointId: 'R' },
      { id: 'RH', label: '垂线 RH', kind: 'segment', fromPointId: 'R', toPointId: 'H' },
      { id: 'RS', label: '对称连线 RS', kind: 'segment', fromPointId: 'R', toPointId: 'S' },
      { id: 'OP', label: '圆半径 OP', kind: 'segment', fromPointId: 'O', toPointId: 'P' },
    ],
    arcs: [{ id: 'angleAOR', label: '旋转角 θ', centerPointId: 'O', startPointId: 'A', endPointId: 'R' }],
    polygons: [],
    measurements: [
      { id: 'OR', label: 'OR', kind: 'distance', pointIds: ['O', 'R'], unit: '' },
      { id: 'angleAOR', label: '∠AOR', kind: 'angle', pointIds: ['A', 'O', 'R'], unit: '°' },
    ],
    loci: [{ id: 'rotationCircle', label: '点 R 的圆周轨迹', pointId: 'R', parameterId: 'theta' }],
  },
  reason: '用声明式构造依赖演示旋转、中点、垂足、轴对称、位似、圆约束拖动与本地采样轨迹。',
}

const officialEntries = [
  officialEntry('ellipse-focus-sum', createEllipseScene(), {
    aliases: ['演示椭圆焦点距离和', '绘制椭圆并演示两个焦点的距离和'],
    conceptTerms: ['椭圆'], keywords: ['焦点', '距离和', '长轴', '短轴'],
    interactionSignature: ['drag:set-angle', 'animation:play'],
  }),
  officialEntry('quadratic-vertex', createQuadraticScene(), {
    aliases: ['演示二次函数顶点变化', '绘制二次函数顶点式图像'],
    conceptTerms: ['二次函数', '抛物线'], keywords: ['顶点', '开口', '对称轴', '平移'],
    interactionSignature: ['slider:coefficientA', 'slider:vertexH', 'slider:vertexK'],
  }),
  officialEntry('sine-parameters', instantiateLessonPlan(sinePlan), {
    aliases: ['绘制 y=A*sin(B*x)，可调 A 和 B', '演示正弦函数振幅和频率'],
    conceptTerms: ['正弦函数', 'sin'], keywords: ['振幅', '频率', '周期', 'A', 'B'],
    interactionSignature: ['slider:A', 'slider:B'],
  }),
  officialEntry('hyperbola-focus-difference', instantiateLessonPlan(hyperbolaFocusDifferencePlan), {
    aliases: ['制作双曲线函数图像，演示任一点到两个焦点的距离差绝对值不变', '演示双曲线焦点距离差'],
    conceptTerms: ['双曲线', '双曲线焦点性质'], keywords: ['焦点', '距离差', '绝对值', '参数轨迹', '两支'],
    interactionSignature: ['animation:play', 'drag:trajectory', 'snap:coordinate', 'trail:2', 'distance-line:2', 'metric:distance-difference'],
  }),
  officialEntry('polar-rose', instantiateLessonPlan(polarRosePlan), {
    aliases: ['绘制极坐标三瓣玫瑰线，可调尺度', '演示 r=a*cos(3*theta) 的极坐标图像'],
    conceptTerms: ['极坐标', '玫瑰线'], keywords: ['极径', '极角', '对称性', '花瓣', 'cos'],
    interactionSignature: ['slider:a', 'curve:polar'],
  }),
  officialEntry('monthly-temperature-chart', instantiateLessonPlan(monthlyTemperatureChartPlan), {
    aliases: ['制作两地月平均气温折线图', '用折线图比较两组月度数据'],
    conceptTerms: ['折线图', '数据图表', '统计图'], keywords: ['数据趋势', '两组数据', '月份', '气温', '比较'],
    interactionSignature: ['chart:line', 'series:2', 'labels:value'],
  }),
  officialEntry('geometry-triangle', instantiateLessonPlan(geometryPlan), {
    aliases: ['制作一个可以拖动顶点的三角形，显示边长角度和面积', '演示三角形的线段射线向量和角度'],
    conceptTerms: ['平面几何', '三角形'], keywords: ['点', '线段', '射线', '向量', '角度', '面积'],
    interactionSignature: ['drag:set-point:3', 'measure:distance', 'measure:angle', 'measure:area'],
  }),
  officialEntry('geometry-rotation-locus', instantiateLessonPlan(geometryTransformationPlan), {
    aliases: ['演示点绕中心旋转并画出圆周轨迹', '制作旋转、轴对称、位似和垂足的几何构造'],
    conceptTerms: ['几何变换', '旋转', '圆周轨迹'], keywords: ['中点', '垂足', '轴对称', '位似', '约束点'],
    interactionSignature: ['slider:theta', 'slider:k', 'drag:circle-constraint', 'locus:rotation'],
  }),
  officialEntry('free-fall', instantiateLessonPlan(freeFallPlan), {
    aliases: ['模拟自由落体运动，可调初始高度和重力加速度', '演示自由落体运动'],
    conceptTerms: ['自由落体'], keywords: ['初始高度', '重力加速度', '速度', '下落'],
    interactionSignature: ['animation:play', 'vector:velocity', 'vector:gravity'],
  }),
  officialEntry('dual-pendulum', instantiateLessonPlan(dualPendulumPlan), {
    aliases: ['制作钟摆运动的实验，同时有两个钟摆，分别都可以调节摆长等参数', '演示两个独立单摆'],
    conceptTerms: ['双钟摆', '两个钟摆', '两个独立单摆'], keywords: ['摆长', '周期比较', '左摆', '右摆'],
    interactionSignature: ['animation:play', 'constraint:rope:2'],
  }),
  officialEntry('collision-discs-2d', instantiateLessonPlan(collision2DPlan), {
    aliases: ['制作三个小球在二维平面碰撞的实验', '演示二维圆盘接触和边界反弹'],
    conceptTerms: ['二维碰撞', '多体碰撞', '圆盘碰撞'],
    keywords: ['接触', '冲量', '恢复系数', '动量', '动能', '边界反弹', '质量', '初速度'],
    interactionSignature: ['animation:play', 'contact:disc-disc', 'contact:disc-boundary', 'parameter:mass:3', 'parameter:velocity-2d:3'],
  }),
]

function validThirdPartyEntry(value: unknown): value is LessonLibraryEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Partial<LessonLibraryEntry>
  if (
    typeof entry.id !== 'string' || entry.source !== 'third-party' ||
    (entry.catalog !== undefined && entry.catalog !== 'local') ||
    !['pending', 'verified'].includes(entry.reviewStatus ?? '') ||
    typeof entry.title !== 'string' || typeof entry.topic !== 'string' ||
    typeof entry.summary !== 'string' ||
    !['math', 'physics', 'chemistry', 'geography'].includes(entry.subject ?? '') ||
    (entry.sourceFilename !== undefined && typeof entry.sourceFilename !== 'string') ||
    (entry.revisionOfSubmissionId !== undefined && !/^community\.[a-f0-9]{24}$/.test(entry.revisionOfSubmissionId)) ||
    typeof entry.createdAt !== 'string' || typeof entry.updatedAt !== 'string'
  ) return false
  try {
    assertLessonScene(entry.scene)
    assertSceneRendererSupported(entry.scene)
    return true
  } catch {
    return false
  }
}

export function getOfficialLibraryEntries(): LessonLibraryEntry[] {
  return structuredClone(officialEntries)
}

export function loadThirdPartyLibrary(): LessonLibraryEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(THIRD_PARTY_LIBRARY_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    const entries = value.filter(validThirdPartyEntry).slice(0, MAX_THIRD_PARTY_ENTRIES)
    if (entries.length !== value.length) {
      localStorage.setItem(THIRD_PARTY_LIBRARY_KEY, JSON.stringify(entries))
    }
    return structuredClone(entries.map((entry) => ({
      ...entry,
      catalog: 'local' as const,
      reviewStatus: 'pending' as const,
    })))
  } catch {
    return []
  }
}

export function saveThirdPartyScene(
  scene: LessonScene,
  sourceFilename?: string,
  replaceEntryId?: string,
  revisionOfSubmissionId?: string,
): LessonLibraryEntry {
  assertLessonScene(scene)
  assertSceneRendererSupported(scene)
  const now = new Date().toISOString()
  const fingerprint = scene.lineage.fingerprint || `${scene.templateRef.id}|${scene.metadata.topic}`
  const entries = loadThirdPartyLibrary()
  const replaceEntry = replaceEntryId
    ? entries.find((entry) => entry.id === replaceEntryId && entry.catalog === 'local')
    : undefined
  const id = replaceEntry?.id ?? `third-party.${stableHash(fingerprint)}`
  const existing = entries.find((entry) => entry.id === id)
  const imported = structuredClone(scene)
  imported.lineage.source = 'imported'
  imported.lineage.updatedAt = now
  const entry: LessonLibraryEntry = {
    id,
    source: 'third-party',
    catalog: 'local',
    reviewStatus: 'pending',
    title: imported.metadata.title,
    subject: imported.metadata.subject,
    topic: imported.metadata.topic,
    summary: imported.metadata.summary,
    sourceFilename: sourceFilename || existing?.sourceFilename,
    revisionOfSubmissionId: revisionOfSubmissionId ?? existing?.revisionOfSubmissionId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    scene: imported,
  }
  const next = [entry, ...entries.filter((item) => item.id !== id)]
    .slice(0, MAX_THIRD_PARTY_ENTRIES)
  localStorage.setItem(THIRD_PARTY_LIBRARY_KEY, JSON.stringify(next))
  return structuredClone(entry)
}

export function removeThirdPartyEntry(id: string): LessonLibraryEntry[] {
  const next = loadThirdPartyLibrary().filter((entry) => entry.id !== id)
  localStorage.setItem(THIRD_PARTY_LIBRARY_KEY, JSON.stringify(next))
  return next
}
