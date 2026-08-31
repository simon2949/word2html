import type { Subject } from '../types/lessonScene'

export interface CapabilitySubjectReviewDefinition {
  capabilityId: string
  title: string
  subject: Subject
  reviewerRole: string
  officialExampleIds: readonly string[]
  browserCommand: string
  focusItems: readonly string[]
}

export const CAPABILITY_SUBJECT_REVIEW_DEFINITIONS: readonly CapabilitySubjectReviewDefinition[] = [
  {
    capabilityId: 'math.function.explicit-2d',
    title: '二维显函数',
    subject: 'math',
    reviewerRole: '中学数学教师',
    officialExampleIds: ['official.sine-parameters'],
    browserCommand: 'npm run acceptance:explicit-function -- 9333 http://127.0.0.1:5173',
    focusItems: [
      'A 对振幅、B 对周期 2π/|B| 的影响表述准确。',
      '定义域、间断点和不在当前参数范围内的数学边界说明清楚。',
      '极值参数、自动量程和采样不会产生错误极值或错误连线。',
      '公式、坐标刻度、参数单位、交互结果和教学结论一致。',
    ],
  },
  {
    capabilityId: 'math.data.chart-2d',
    title: '数据表与统计图',
    subject: 'math',
    reviewerRole: '中学数学或数据素养教师',
    officialExampleIds: ['official.monthly-temperature-chart'],
    browserCommand: 'npm run acceptance:data-chart -- 9333 http://127.0.0.1:5173',
    focusItems: [
      '原始数据、标签、单位和数据来源准确、可追溯。',
      '图表类型适合数据，不暗示数据没有支持的连续性或因果关系。',
      '缺失值、负值、相同值、极端值和多系列量程不会造成误判。',
      '表格、图例、数值标签、图形和教学结论一一对应。',
    ],
  },
  {
    capabilityId: 'math.geometry.primitives-2d',
    title: '二维几何构造',
    subject: 'math',
    reviewerRole: '中学数学几何教师',
    officialExampleIds: ['official.geometry-triangle', 'official.geometry-rotation-locus'],
    browserCommand: 'npm run acceptance:geometry-primitives -- 9333 http://127.0.0.1:5173；npm run acceptance:geometry-transform -- 9333 http://127.0.0.1:5173',
    focusItems: [
      '基本图元、中点、垂足、旋转、轴对称和位似的构造语义正确。',
      '角度方向、距离、面积、单位与有效数字正确。',
      '共线、重合、零长度、负位似和临界角等退化状态处理合理。',
      '约束拖点、轨迹、公式、读数和构造关系始终一致。',
    ],
  },
  {
    capabilityId: 'math.curve.relation-2d',
    title: '二维关系曲线',
    subject: 'math',
    reviewerRole: '高中数学教师',
    officialExampleIds: ['official.polar-rose'],
    browserCommand: 'npm run acceptance:relation-curve -- 9333 http://127.0.0.1:5173',
    focusItems: [
      '负极径、花瓣数量、对称性和极坐标参数范围解释正确。',
      '参数范围不会漏掉必要分支，也不混淆轨迹方向与几何性质。',
      '隐函数多分支、不连续点、尖点和自交点没有被错误连接。',
      '明确固定采样和等值线是数值近似，不是符号证明或精确求交。',
    ],
  },
  {
    capabilityId: 'math.geometry.parametric-trace-2d',
    title: '数学参数轨迹',
    subject: 'math',
    reviewerRole: '高中数学解析几何教师',
    officialExampleIds: ['official.hyperbola-focus-difference'],
    browserCommand: 'npm run acceptance:parametric-trace -- 9333 http://127.0.0.1:5173',
    focusItems: [
      '双曲线两支、c²=a²+b² 和焦点位置正确。',
      '动点到两个焦点均有直线连接与清晰距离标注。',
      '默认值和 a、b、轨迹范围极值均满足 |PF1-PF2|=2a。',
      '有限描绘范围、播放方向和对应点不会造成定义上的误解。',
    ],
  },
  {
    capabilityId: 'physics.collision.discs-2d',
    title: '二维圆盘碰撞',
    subject: 'physics',
    reviewerRole: '中学物理力学教师',
    officialExampleIds: ['official.collision-discs-2d'],
    browserCommand: 'npm run acceptance:collision -- 9333 http://127.0.0.1:5173',
    focusItems: [
      '动量守恒只用于孤立系统，边界冲量的影响表述清楚。',
      '恢复系数及 e=0、e=1 的物理含义准确。',
      '动能守恒条件、非弹性碰撞和能量表述准确。',
      '圆盘 A、B、C 的质量、水平/竖直初速度可分别修改且不串用；擦碰、连续接触、边界角落和当前不含摩擦/转矩等限制已检查。',
    ],
  },
  {
    capabilityId: 'physics.motion.point-2d',
    title: '二维质点运动',
    subject: 'physics',
    reviewerRole: '中学物理力学教师',
    officialExampleIds: ['official.free-fall', 'official.dual-pendulum'],
    browserCommand: 'npm run acceptance:motion-point -- 9333 http://127.0.0.1:5173',
    focusItems: [
      '自由落体的理想条件、方向约定、终止时间、速度和单位正确。',
      '双摆场景明确表示两个独立单摆，而非相互耦合的双摆。',
      '单摆小角度近似、摆长约束、弧度和重力参数一致。',
      '抛体、弹簧和多物体等未覆盖子类型已补录或明确列为接受限制。',
    ],
  },
]
