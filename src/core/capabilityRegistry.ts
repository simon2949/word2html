import { GENERIC_FUNCTION_TEMPLATE_ID } from './genericFunction'
import { QUADRATIC_TEMPLATE_ID } from './quadratic'
import { TIME_EXPERIMENT_TEMPLATE_ID } from './timeExperiment'
import { ELLIPSE_TEMPLATE_ID } from '../templates/ellipseTemplate'
import { GEOMETRY_2D_TEMPLATE_ID } from './geometry2d'
import { COLLISION_2D_TEMPLATE_ID } from './collision2d'
import { RELATION_CURVE_2D_TEMPLATE_ID } from './relationCurve2d'
import { DATA_CHART_2D_TEMPLATE_ID } from './dataChart2d'
import type { Subject } from '../types/lessonScene'

export type CapabilityStatus = 'built-in' | 'experimental' | 'verified'
export type CapabilityMatchSource =
  | 'verified-template'
  | 'registered-runtime'
  | 'settings-panel'
  | 'capability-gap'
  | 'unclassified'

export interface CapabilityLimit {
  label: string
  value: string
}

export interface CapabilityDefinition {
  id: string
  label: string
  subject: Subject
  topic: string
  status: CapabilityStatus
  priority: number
  intentTerms: readonly string[]
  intent: {
    allOf?: readonly RegExp[]
    anyOf: readonly RegExp[]
  }
  source: Exclude<CapabilityMatchSource, 'settings-panel' | 'capability-gap' | 'unclassified'>
  templateId: string
  rendererId: string
  validatorId: string
  exporterId: string
  primitives: readonly string[]
  parameterTypes: readonly string[]
  expectedParameters: readonly string[]
  interactions: readonly string[]
  measurements: readonly string[]
  invariants: readonly string[]
  limits: readonly CapabilityLimit[]
  alternative: string
}

export interface CapabilityGapDefinition {
  id: string
  label: string
  subject: Subject
  topic: string
  intentTerms: readonly string[]
  intent: {
    allOf?: readonly RegExp[]
    anyOf: readonly RegExp[]
  }
  missingPrimitives: readonly string[]
  reason: string
  suggestion: string
}

export interface CapabilityReference {
  id: string
  label: string
  status: CapabilityStatus
}

export interface CapabilityGap {
  id: string
  label: string
  reason: string
  suggestion: string
}

export interface CapabilityResolution {
  subject?: Subject
  topic: string
  matchSource: CapabilityMatchSource
  capabilities: CapabilityReference[]
  missingCapabilities: CapabilityGap[]
  expectedParameters: string[]
  interactions: string[]
  templateId?: string
  needsModel: boolean
}

const sharedExporter = 'export.standalone-html.v1'
const sharedValidator = 'validate.lesson-scene.v0.1'

/**
 * Local source of truth for every teaching capability the current build can
 * actually validate, render and export. Intent matching is deliberately kept
 * beside the runtime declaration so the router cannot promise an absent
 * renderer.
 */
export const CAPABILITY_REGISTRY: readonly CapabilityDefinition[] = [
  {
    id: 'math.ellipse.focus-distance-sum',
    label: '椭圆焦点距离和',
    subject: 'math',
    topic: '椭圆的定义与焦点性质',
    status: 'verified',
    priority: 100,
    intentTerms: ['椭圆', '焦点', '距离和', '长轴', '短轴'],
    intent: {
      allOf: [/椭圆/],
      anyOf: [/焦点|核心|距离|定义|函数|图像|轨迹/],
    },
    source: 'verified-template',
    templateId: ELLIPSE_TEMPLATE_ID,
    rendererId: 'renderer.ellipse-svg.v1',
    validatorId: sharedValidator,
    exporterId: sharedExporter,
    primitives: ['坐标轴', '椭圆曲线', '焦点', '受约束动点', '距离线段', '测量卡'],
    parameterTypes: ['number', 'boolean'],
    expectedParameters: ['长轴全长', '短轴全长', '动点位置'],
    interactions: ['拖动椭圆上的点', '播放轨迹', '缩放与适应窗口'],
    measurements: ['PF₁', 'PF₂', 'PF₁ + PF₂'],
    invariants: ['PF₁ + PF₂ = 2a'],
    limits: [
      { label: '长短轴范围', value: '0.5–40，且长轴不小于短轴' },
      { label: '运动对象', value: '1 个受约束动点' },
    ],
    alternative: '复杂圆锥曲线可先使用参数轨迹运行时，或导入经过审核的场景包。',
  },
  {
    id: 'math.function.quadratic-vertex',
    label: '二次函数顶点式',
    subject: 'math',
    topic: '二次函数图像与顶点变化',
    status: 'verified',
    priority: 95,
    intentTerms: ['二次函数', '抛物线', '顶点', '开口', '对称轴'],
    intent: {
      allOf: [/二次函数|抛物线/],
      anyOf: [/顶点|开口|对称轴|图像|函数|平移|变化/],
    },
    source: 'verified-template',
    templateId: QUADRATIC_TEMPLATE_ID,
    rendererId: 'renderer.quadratic-svg.v1',
    validatorId: sharedValidator,
    exporterId: sharedExporter,
    primitives: ['坐标轴', '函数曲线', '顶点', '对称轴', '测量卡'],
    parameterTypes: ['number', 'boolean'],
    expectedParameters: ['二次项系数 a', '顶点横坐标 h', '顶点纵坐标 k'],
    interactions: ['调节 a、h、k', '缩放与适应窗口'],
    measurements: ['顶点', '对称轴', '开口方向', '零点'],
    invariants: ['a ≠ 0', '顶点始终为 (h, k)'],
    limits: [{ label: '可调参数', value: '固定为 a、h、k 三项' }],
    alternative: '其他显函数使用安全通用函数运行时。',
  },
  {
    id: 'math.function.explicit-2d',
    label: '二维显函数图像',
    subject: 'math',
    topic: '可调参数函数图像',
    status: 'verified',
    priority: 70,
    intentTerms: ['y=', '函数图像', '正弦函数', '余弦函数', '指数函数', '对数函数'],
    intent: {
      anyOf: [/\by\s*=/i, /函数图像|正弦函数|余弦函数|三角函数|指数函数|对数函数|反比例函数/],
    },
    source: 'registered-runtime',
    templateId: GENERIC_FUNCTION_TEMPLATE_ID,
    rendererId: 'renderer.generic-function-svg.v1',
    validatorId: sharedValidator,
    exporterId: sharedExporter,
    primitives: ['坐标轴', '安全表达式曲线', '参数控件'],
    parameterTypes: ['number'],
    expectedParameters: ['表达式中的自定义数值参数（最多 6 个）'],
    interactions: ['调节函数参数', '缩放与适应窗口'],
    measurements: [],
    invariants: ['定义域内存在有限可绘制样本'],
    limits: [
      { label: '函数形式', value: '单值显函数 y=f(x)' },
      { label: '定义域', value: '-50 到 50，总跨度不超过 100' },
      { label: '可调参数', value: '最多 6 个数值参数' },
      { label: '表达式', value: '仅允许白名单数学函数与运算符' },
    ],
    alternative: '多分支或参数曲线可使用参数轨迹运行时。',
  },
  {
    id: 'math.data.chart-2d',
    label: '数据表与统计图表',
    subject: 'math',
    topic: '数据整理、比较、趋势与相关性',
    status: 'verified',
    priority: 91,
    intentTerms: ['数据表', '统计表', '柱状图', '条形图', '折线图', '散点图', '统计图', '数据图表'],
    intent: {
      anyOf: [/数据表|统计表|柱状图|条形图|折线图|散点图|统计图|数据图表|数据.*(?:比较|趋势|相关性)/],
    },
    source: 'registered-runtime',
    templateId: DATA_CHART_2D_TEMPLATE_ID,
    rendererId: 'renderer.data-chart-svg.v1',
    validatorId: sharedValidator,
    exporterId: sharedExporter,
    primitives: ['数据表格', '分组柱状图', '多系列折线图', '多系列散点图', '坐标轴', '图例', '数值标注'],
    parameterTypes: [],
    expectedParameters: ['类别标签、1–4 个数据系列及单位'],
    interactions: ['缩放与适应窗口', '显示或隐藏数值标签', '对象级系列颜色和样式'],
    measurements: ['系列数', '数据点数量', '数值范围'],
    invariants: ['每个数值为有限数', '非散点系列长度与类别数量一致'],
    limits: [
      { label: '类别', value: '最多 24 个' },
      { label: '数据系列', value: '最多 4 个' },
      { label: '散点', value: '每个系列最多 60 个点' },
      { label: '图表类型', value: '表格、分组柱状图、折线图或散点图' },
    ],
    alternative: '饼图、堆叠图、箱线图、回归拟合和动态数据仍需后续图表原语。',
  },
  {
    id: 'math.geometry.primitives-2d',
    label: '二维几何构造与测量',
    subject: 'math',
    topic: '平面几何构造、变换、轨迹与测量',
    status: 'verified',
    priority: 90,
    intentTerms: ['几何图形', '三角形', '多边形', '线段', '射线', '向量', '圆弧', '角度', '面积', '中点', '垂足', '平移', '旋转', '轴对称', '位似', '几何轨迹', '约束点'],
    intent: {
      anyOf: [/几何图形|几何构造|三角形|四边形|多边形|线段|射线|向量|圆弧|测量.*角|测量.*面积|距离.*角度|中点|垂足|正射影|平移|旋转|轴对称|位似|几何轨迹|约束点|点.*(?:圆|直线|线段).*运动/],
    },
    source: 'registered-runtime',
    templateId: GEOMETRY_2D_TEMPLATE_ID,
    rendererId: 'renderer.geometry-primitives-svg.v1',
    validatorId: sharedValidator,
    exporterId: sharedExporter,
    primitives: ['自由点', '中点', '平移点', '旋转点', '轴对称点', '位似点', '垂足', '圆/直线/线段约束点', '本地采样轨迹', '线段', '射线', '向量', '圆弧', '多边形', '测量标注'],
    parameterTypes: ['number'],
    expectedParameters: ['点坐标、几何尺度、变换角度与轨迹驱动量（最多 12 项）'],
    interactions: ['拖动自由点或受约束点', '调节坐标、尺度、旋转角与位似比', '显示或隐藏几何轨迹', '缩放与适应窗口'],
    measurements: ['点间距离', '三点夹角', '多边形面积', '安全表达式值'],
    invariants: ['全部点坐标和测量值为有限数', '构造依赖无循环', '受约束点始终位于指定圆、直线或线段', '轨迹由浏览器按驱动参数固定采样，不接收模型生成的路径点'],
    limits: [
      { label: '几何点', value: '1–12 个' },
      { label: '连线', value: '最多 16 条' },
      { label: '圆弧', value: '最多 6 条' },
      { label: '多边形', value: '最多 4 个' },
      { label: '测量量', value: '最多 6 项' },
      { label: '几何轨迹', value: '最多 4 条，每条固定采样 241 点' },
    ],
    alternative: '连续函数仍使用函数运行时；随时间运动且需要播放的对象使用时间实验运行时；复杂动态约束可导入经过审核的扩展场景包。',
  },
  {
    id: 'math.curve.relation-2d',
    label: '参数、极坐标与隐函数曲线',
    subject: 'math',
    topic: '二维关系曲线与等值线',
    status: 'verified',
    priority: 88,
    intentTerms: ['参数方程', '参数曲线', '极坐标', '极坐标方程', '隐函数', '隐式曲线', '等值线', '玫瑰线', '心形线'],
    intent: {
      anyOf: [/隐函数|隐式曲线|等值线|极坐标|极坐标方程|玫瑰线|心形线|参数方程.*(?:图像|曲线)|参数曲线.*(?:图像|绘制)/],
    },
    source: 'registered-runtime',
    templateId: RELATION_CURVE_2D_TEMPLATE_ID,
    rendererId: 'renderer.relation-curve-svg.v1',
    validatorId: sharedValidator,
    exporterId: sharedExporter,
    primitives: ['参数曲线采样', '极坐标转换', '隐函数等值线', '坐标轴', '正方形网格'],
    parameterTypes: ['number'],
    expectedParameters: ['曲线尺度、频率或形状参数（最多 8 项）'],
    interactions: ['调节曲线参数', '缩放与适应窗口', '对象级线条样式'],
    measurements: ['曲线模式', '当前采样点数量'],
    invariants: ['当前范围内存在有限可绘制曲线'],
    limits: [
      { label: '曲线数量', value: '每个场景 1 条关系曲线，可含多个隐式分支' },
      { label: '视口', value: 'x、y 均位于 -100 到 100' },
      { label: '参数', value: '最多 8 个数值参数' },
      { label: '表达式', value: '仅允许白名单数学函数与运算符' },
    ],
    alternative: '需要运动点、焦点距离或其他动态测量时，使用参数轨迹运行时组合辅助对象。',
  },
  {
    id: 'math.geometry.parametric-trace-2d',
    label: '二维参数轨迹与几何测量',
    subject: 'math',
    topic: '参数曲线与轨迹性质',
    status: 'verified',
    priority: 85,
    intentTerms: ['双曲线', '参数方程', '参数曲线', '轨迹', '焦点距离差'],
    intent: {
      anyOf: [/双曲线|参数方程|参数曲线|焦点.*距离差|距离差.*焦点/],
    },
    source: 'registered-runtime',
    templateId: TIME_EXPERIMENT_TEMPLATE_ID,
    rendererId: 'renderer.time-experiment-svg.v4',
    validatorId: sharedValidator,
    exporterId: sharedExporter,
    primitives: ['坐标轴', '时间/参数动点', '可拖动轨迹投影', '轨迹', '距离线段', '测量卡'],
    parameterTypes: ['number'],
    expectedParameters: ['曲线尺度参数', '动点参数范围'],
    interactions: ['播放或暂停动点', '拖动动点并吸附坐标', '调节参数', '缩放与适应窗口'],
    measurements: ['点坐标', '点间距离', '自定义表达式测量值'],
    invariants: ['声明式数值不变量'],
    limits: [
      { label: '运动对象', value: '最多 4 个点' },
      { label: '测量量', value: '最多 4 项' },
      { label: '矢量/距离线', value: '最多 4 条' },
      { label: '持续时间', value: '0.2–60 秒' },
    ],
    alternative: '超出数量限制时应拆分场景，或导入经审核的新运行时场景包。',
  },
  {
    id: 'physics.collision.discs-2d',
    label: '二维圆盘接触碰撞',
    subject: 'physics',
    topic: '二维碰撞、动量与恢复系数',
    status: 'verified',
    priority: 92,
    intentTerms: ['二维碰撞', '多球碰撞', '小球碰撞', '斜碰', '恢复系数'],
    intent: {
      allOf: [/碰撞|相撞/],
      anyOf: [/二维|平面|多体|多个|三个|四个|球.*球|小球|斜碰/],
    },
    source: 'registered-runtime',
    templateId: COLLISION_2D_TEMPLATE_ID,
    rendererId: 'renderer.collision-discs-svg.v1',
    validatorId: sharedValidator,
    exporterId: sharedExporter,
    primitives: ['圆形刚体', '矩形接触边界', '圆盘接触检测', '冲量响应', '运动轨迹', '状态测量'],
    parameterTypes: ['number'],
    expectedParameters: ['各圆盘独立质量', '各圆盘独立 x/y 初速度', '半径', '恢复系数或重力（合计最多 12 项）'],
    interactions: ['播放、暂停与重置', '按物体分组调节碰撞参数', '缩放与适应窗口'],
    measurements: ['碰撞次数', '总动能', '总动量分量', '物体速度'],
    invariants: ['物体不穿透边界', '状态保持有限', '恢复系数在 0–1'],
    limits: [
      { label: '圆形物体', value: '2–8 个' },
      { label: '可调参数', value: '最多 12 个' },
      { label: '持续时间', value: '0.2–20 秒' },
      { label: '碰撞形状', value: '仅圆盘与矩形边界' },
    ],
    alternative: '非圆刚体、铰链、旋转和连续接触堆叠仍需要专用刚体原语。',
  },
  {
    id: 'physics.motion.point-2d',
    label: '二维质点运动实验',
    subject: 'physics',
    topic: '质点运动与受限简谐模型',
    status: 'verified',
    priority: 75,
    intentTerms: ['自由落体', '平抛', '斜抛', '单摆', '钟摆', '弹簧振子', '一维碰撞'],
    intent: {
      anyOf: [/自由落体|平抛|斜抛|抛体|单摆|钟摆|摆运动|弹簧振子|简谐运动|一维.*碰撞|碰撞.*一维/],
    },
    source: 'registered-runtime',
    templateId: TIME_EXPERIMENT_TEMPLATE_ID,
    rendererId: 'renderer.time-experiment-svg.v4',
    validatorId: sharedValidator,
    exporterId: sharedExporter,
    primitives: ['坐标轴', '时间运动点', '轨迹', '矢量', '绳/弹簧约束', '测量卡'],
    parameterTypes: ['number'],
    expectedParameters: ['初始条件', '物理常量', '实验时长（合计最多 6 项）'],
    interactions: ['播放、暂停与重置', '调节实验参数', '缩放与适应窗口'],
    measurements: ['位置', '速度/加速度或力学量'],
    invariants: ['声明式运动学或守恒量不变量'],
    limits: [
      { label: '运动对象', value: '最多 4 个质点' },
      { label: '可调参数', value: '最多 6 个数值参数' },
      { label: '矢量', value: '最多 4 个' },
      { label: '绳/弹簧约束', value: '最多 4 个' },
      { label: '持续时间', value: '0.2–60 秒' },
    ],
    alternative: '刚体、流体、电路或接触碰撞需要新增专用原语。',
  },
] as const

/** Known requests that must stop before model invocation because no installed
 * renderer can honestly fulfil them. */
export const CAPABILITY_GAP_REGISTRY: readonly CapabilityGapDefinition[] = [
  {
    id: 'gap.physics.circuit-network',
    label: '缺少电路实验原语',
    subject: 'physics',
    topic: '电路连接与电学测量',
    intentTerms: ['电路', '电阻', '电流表', '电压表', '灯泡'],
    intent: { anyOf: [/电路|电阻|电流表|电压表|灯泡.*串联|灯泡.*并联/] },
    missingPrimitives: ['电路元件', '导线与端口', '电表', '电路求解器'],
    reason: '当前时间实验运行时只能绘制质点轨迹，不能表达电路拓扑和电学连接。',
    suggestion: '暂时导入经过审核的电路场景文件；后续新增电路元件和电路求解运行时。',
  },
  {
    id: 'gap.chemistry.lab-and-reaction',
    label: '缺少化学实验原语',
    subject: 'chemistry',
    topic: '化学反应与实验装置',
    intentTerms: ['酸碱中和', '化学反应', '烧杯', '试管', '分子', '滴定'],
    intent: { anyOf: [/酸碱|中和|化学|反应|烧杯|试管|分子|原子|滴定|溶液|沉淀/] },
    missingPrimitives: ['实验容器', '物质与粒子', '反应进度', '颜色/状态变化规则'],
    reason: '当前函数和质点运行时不能表达物质、容器及反应过程。',
    suggestion: '暂时导入经过审核的化学场景文件；后续新增容器、粒子和反应进度原语。',
  },
  {
    id: 'gap.geography.map-and-profile',
    label: '缺少地理可视化原语',
    subject: 'geography',
    topic: '地图、地形与地理过程',
    intentTerms: ['地图', '气候', '地形', '等高线', '板块', '经纬度'],
    intent: { anyOf: [/地图|气候|地形|等高线|板块|经纬|洋流|季风|地球公转|地球自转/] },
    missingPrimitives: ['地图图层', '经纬坐标投影', '剖面/等值线', '时间图层'],
    reason: '当前笛卡尔函数与质点运行时不能表达地图图层和地理空间关系。',
    suggestion: '暂时导入经过审核的地理场景文件；后续新增地图和地理过程运行时。',
  },
] as const

export const INSTALLED_CAPABILITY_BINDINGS = {
  templateIds: [
    ELLIPSE_TEMPLATE_ID,
    QUADRATIC_TEMPLATE_ID,
    GENERIC_FUNCTION_TEMPLATE_ID,
    RELATION_CURVE_2D_TEMPLATE_ID,
    DATA_CHART_2D_TEMPLATE_ID,
    TIME_EXPERIMENT_TEMPLATE_ID,
    GEOMETRY_2D_TEMPLATE_ID,
    COLLISION_2D_TEMPLATE_ID,
  ],
  rendererIds: [
    'renderer.ellipse-svg.v1',
    'renderer.quadratic-svg.v1',
    'renderer.generic-function-svg.v1',
    'renderer.relation-curve-svg.v1',
    'renderer.data-chart-svg.v1',
    'renderer.time-experiment-svg.v4',
    'renderer.geometry-primitives-svg.v1',
    'renderer.collision-discs-svg.v1',
  ],
  validatorIds: [sharedValidator],
  exporterIds: [sharedExporter],
} as const

function matchesIntent(
  text: string,
  intent: { allOf?: readonly RegExp[]; anyOf: readonly RegExp[] },
): boolean {
  return (intent.allOf ?? []).every((pattern) => pattern.test(text))
    && intent.anyOf.some((pattern) => pattern.test(text))
}

function referenceOf(capability: CapabilityDefinition): CapabilityReference {
  return { id: capability.id, label: capability.label, status: capability.status }
}

export function resolveCapabilityRequest(text: string): CapabilityResolution | null {
  const gap = CAPABILITY_GAP_REGISTRY.find((candidate) => matchesIntent(text, candidate.intent))
  if (gap) {
    return {
      subject: gap.subject,
      topic: gap.topic,
      matchSource: 'capability-gap',
      capabilities: [],
      missingCapabilities: gap.missingPrimitives.map((primitive, index) => ({
        id: `${gap.id}.${index + 1}`,
        label: primitive,
        reason: gap.reason,
        suggestion: gap.suggestion,
      })),
      expectedParameters: [],
      interactions: [],
      needsModel: false,
    }
  }

  const capability = CAPABILITY_REGISTRY
    .filter((candidate) => matchesIntent(text, candidate.intent))
    .sort((left, right) => right.priority - left.priority)[0]
  if (!capability) return null
  return {
    subject: capability.subject,
    topic: capability.topic,
    matchSource: capability.source,
    capabilities: [referenceOf(capability)],
    missingCapabilities: [],
    expectedParameters: [...capability.expectedParameters],
    interactions: [...capability.interactions],
    templateId: capability.templateId,
    needsModel: capability.source === 'registered-runtime',
  }
}

export function isRegisteredTemplateId(templateId: string): boolean {
  return INSTALLED_CAPABILITY_BINDINGS.templateIds.some((candidate) => candidate === templateId)
}

export function getCapabilityDefinition(id: string): CapabilityDefinition | undefined {
  return CAPABILITY_REGISTRY.find((capability) => capability.id === id)
}

export function inferRequestSubject(text: string): Subject | undefined {
  if (/化学|反应|溶液|分子|原子|酸碱|滴定|沉淀/.test(text)) return 'chemistry'
  if (/地理|地图|气候|地形|经纬|板块|洋流|季风/.test(text)) return 'geography'
  if (/物理|力学|速度|加速度|重力|牛顿|电磁|电路|运动|碰撞|摆|振子/.test(text)) return 'physics'
  if (/数学|函数|方程|几何|定理|曲线|坐标|三角|代数|概率|统计/.test(text)) return 'math'
  return undefined
}

export const SUBJECT_LABELS: Readonly<Record<Subject, string>> = {
  math: '数学',
  physics: '物理',
  chemistry: '化学',
  geography: '地理',
}

export const MATCH_SOURCE_LABELS: Readonly<Record<CapabilityMatchSource, string>> = {
  'verified-template': '已审核模板',
  'registered-runtime': '已注册运行时',
  'settings-panel': '右侧本地设置',
  'capability-gap': '能力缺口',
  unclassified: '待模型识别',
}
