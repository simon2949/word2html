# MiniMax-M3 接入说明

> MiniMax 仍是默认模型。项目现已增加提供商中立的服务端配置层，包括 OpenAI 兼容协议和独立 AI 预审档案；详见 [model-provider-configuration.md](model-provider-configuration.md)。本文继续保留 MiniMax 专项配置、真实验证和排查记录。

## 架构

浏览器不直接访问 MiniMax，也不接触 API Key：

```text
浏览器 POST /api/generate
        ↓
Word2HTML Node 服务
        ↓
MiniMax Anthropic 兼容接口
        ↓
紧凑 LessonPlan JSON Schema 校验
        ↓
浏览器使用审核模板、安全函数或时间实验运行时实例化 LessonScene
        ↓
语义、数学与渲染能力校验
```

MiniMax 官方 Anthropic 兼容 Base URL 为 `https://api.minimaxi.com/anthropic`，当前模型名为 `MiniMax-M3`。

## 环境变量

API Key 只通过启动 Word2HTML 服务的操作系统进程环境传入：

```bash
export MINIMAX_API_KEY='你的密钥'
npm run dev
```

Node 服务使用 `process.env.MINIMAX_API_KEY` 读取它，这与 Python 中的 `os.getenv("MINIMAX_API_KEY")` 等价。不要把 API Key 写入 `.env.example`、`.env.local`、前端代码或任何 `VITE_` 变量。

以下可选的非敏感配置也通过系统环境传入：

```dotenv
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic
MINIMAX_MODEL=MiniMax-M3
MINIMAX_MAX_TOKENS=2048
MINIMAX_TIMEOUT_MS=120000
MINIMAX_TEMPERATURE=1
```

系统环境中的 API Key 仅由 Node 服务读取，不会进入 Vite 浏览器构建。部署时可通过 systemd、Docker、容器平台或云服务的 Secret/Environment 配置注入同名变量。

## 本地启动

```bash
npm run dev
```

该命令同时启动 Vite 中间件和同源 API。只运行 `npm run dev:vite` 时可以编辑已有场景，但模型状态接口和生成接口不可用。修改服务端源码或生成协议后，需要按 `Ctrl+C` 停止旧进程，再重新执行 `npm run dev`；前端会通过 `apiVersion` 检测旧服务并给出重启提示。

生产运行：

```bash
npm run build
npm start
```

## API

### `GET /api/health`

返回服务和模型配置状态，但不返回 API Key。

### `POST /api/generate`

请求：

```json
{
  "prompt": "演示二次函数顶点随参数变化"
}
```

基于当前场景二次编辑时，浏览器先从当前已校验 LessonScene 重建紧凑 LessonPlan，再发送：

```json
{
  "prompt": "动点到两个焦点通过直线连接，并标注距离",
  "edit": {
    "basePlan": { "schemaVersion": "0.1", "status": "matched" }
  }
}
```

服务端要求模型返回修改后的完整 LessonPlan，而不是不完整补丁。二次编辑的工具 Schema 会按当前模板动态收窄：关系曲线必须返回 `relationSpec`，二维几何必须返回 `geometrySpec`，时间/参数轨迹必须返回 `experimentSpec`，通用函数必须返回 `functionSpec`，并禁止返回其他运行时的规格；`templateId`、`subject` 和 `matched` 状态被固定为当前值。用户未要求修改的字段、参数及对象 ID 应保持不变。浏览器重新实例化并校验结果，同时保留当前场景的颜色、网格、字号等本地显示设置。导入场景、官方库、第三方库以及在右侧调整过参数的场景都使用同一流程。

成功响应包含：

- `plan`：LessonPlan 0.1，包含模板 ID、学科、主题、少量参数覆盖、当前运行时唯一的声明式规格（如 `functionSpec`、`relationSpec`、`geometrySpec`、`experimentSpec`），以及原因；
- `usage`：输入、缓存输入和输出 token；
- `usage.modelCalls`：本次生成实际模型调用次数；`usage.repaired` 表示是否经过自动纠错；
- `provider`：模型供应商及模型名。

服务端通过强制工具调用要求 MiniMax 返回紧凑 LessonPlan，并执行 JSON Schema 与状态一致性校验。浏览器只允许把计划映射到已安装的本地模板与固定安全运行时，然后对 LessonScene 再执行表达式白名单、对象引用、数值范围和渲染能力校验。函数、关系曲线、几何构造和实验表达式都不会通过 `eval` 或 `new Function` 执行。关系曲线只传递表达式、参数和范围；几何轨迹只传递目标点、驱动参数和可选范围，浏览器固定采样 241 点，模型不能返回点列或路径。参数轨迹矢量可用 `display: "distance"` 声明几何距离，渲染器会绘制无箭头直线并在中点标注实际长度；`labelMode: "value"` 只显示数值，默认 `full` 显示标签、数值与单位。运动点标签只保存 `P`、`Q` 等短名称，画布自动追加坐标。

首次规划或二次编辑失败时，系统先执行无歧义的本地规范化；仍未通过服务端校验时，服务端把精确错误作为工具结果反馈给 MiniMax。若服务端计划通过、但浏览器的数学或物理校验失败，浏览器将上一版结构、错误以及二次编辑前的基准计划发送到同源服务进行一次纠错。浏览器还会比较编辑前后的语义结构；没有实际变化的结果同样视为失败并纠错，不会显示虚假的“修改成功”。整个用户操作流程最多调用模型两次；第二次仍失败时保留原场景。两次调用的 token 会合并显示。

新场景使用规范化描述作为缓存上下文；二次编辑同时使用规范化修改要求和当前紧凑 LessonPlan 的哈希。只有两者都相同时才复用已校验且确有语义变化的结果，避免把其他场景或空修改误套到当前场景。缓存命中和新编辑都会在状态区显示实际变更摘要。缓存最多保留最近 30 项。当前规划输出上限为 2048 token，这是复杂多物体规划的容量上限而非固定消耗；已命中的模板请求、所有参数与纯显示修改完全在本地完成，模型 token 为 0。

## Skill、场景包与实验库

项目内的 `skills/word2html-scene-author` 可以指导其他大模型生成紧凑 `.word2html.json` 文件。文件封装 LessonPlan 0.1，不携带可执行 HTML 或 JavaScript；导入后仍由浏览器中的审核模板或安全通用运行时实例化，并经过与在线 MiniMax 规划相同的本地校验。

应用保留旧 LessonScene JSON 导入兼容性。两类外部文件导入成功后都会自动进入浏览器本地第三方库并标记为“本地未审核”；文件中伪造的官方来源或审核状态不会被接受。用户必须在实验库中点击“提交共享审核”并确认，浏览器才会把反向压缩后的 LessonPlan 包发送到 `/api/library/submissions`。公共 `/api/library/entries` 只返回管理员审核通过的内容，浏览器还会再次执行完整导入校验。详细维护边界见 [lesson-library-and-skill.md](lesson-library-and-skill.md)。

用户完成生成或“修改当前”后，可直接从工作台导出紧凑 `.word2html.json`。此操作在浏览器内把已校验 LessonScene 反向转换为 LessonPlan，不产生模型调用或 token；对象标签、表达式、矢量、约束和当前参数值会进入场景包，颜色等纯显示设置仅由完整 LessonScene 导出保留。

共享目录中的每个新内容哈希会执行一套 AI 预审，默认使用 MiniMax，也可通过 `WORD2HTML_REVIEW_MODEL_*` 选用独立的兼容模型。服务端从 [third-party-ai-review-standard.md](third-party-ai-review-standard.md) 读取版本化标准，并强制模型通过 `LessonPreReview 0.1` 工具 Schema 返回 `no-issues` 或 `issues-found`、问题位置、严重程度、处理建议和管理员复核重点。首次发现问题时，第二次调用逐条对照原始 JSON 与运行时契约，删除无证据或自相矛盾的误报；首次输出格式无效时，第二次调用只负责结构纠错，因此整个流程最多两次。相同哈希重复提交不重复预审。预审输出和 token 用量只附加到审核记录，绝不自动设置 `verified`。可通过 `WORD2HTML_REVIEW_MODEL_MAX_TOKENS` 调整单次预审输出上限，旧 `MINIMAX_REVIEW_MAX_TOKENS` 仍兼容，默认 1600。

2026-08-20 使用双曲线场景包进行真实预审验证：首次工具输出需要结构兼容纠错，最终结果为 `no-issues`，同时返回 5 项管理员人工复核重点；合计输入 3424、缓存输入 3368、输出 580 token，共 2 次调用。运行时契约与第二遍事实核对可避免把正确的双曲线左支参数化或“目标坐标减动点坐标”的距离线误报为错误。数值会随场景复杂度、缓存和模型版本变化。

早期真实烟雾测试中，完整 LessonScene 方案需要 4391 个输出 token，而紧凑模板 LessonPlan 对同类目标只需要 168 个输出 token。2026-08-16 的通用函数测试使用输入 1277、缓存输入 132、输出 346 token；加入速度与加速度矢量后的自由落体测试使用输入 2254、缓存输入 128、输出 825 token。2026-08-19 的双球弹性碰撞成功规划使用输入 2629、缓存输入 128、输出 1560 token；其中 `tc`、`v1`、`v2` 作为派生量在多个位置和矢量表达式间复用。同日的小角度单摆计划使用输入 3022、缓存输入 128、输出 1129 token，并返回可验证的绳约束；一次真实纠错使用输入 3587、缓存输入 128、输出 464 token，成功移除了自由落体中错误的恒长绳约束。双曲线“修改当前”真实测试使用输入 4155、缓存输入 128、输出 1298 token，一次调用把两条焦点连线改为距离直线并保持原运行模板；0.9 标签简化回归使用输入 4003、缓存输入 128、输出 1474 token，一次调用保留实验规格并返回简洁点标签和数值标签模式。相同规范化描述或相同场景上下文修改命中浏览器缓存后为 0 token。数值会随输入与模型版本波动。

## 当前能力边界

当前浏览器完整实现 `math.conic.ellipse-focus-sum`、`math.function.quadratic-vertex`、`math.function.generic-2d`、`math.curve.relation-2d`、`math.geometry.primitives-2d`、`experiment.motion.point-2d` 与 `physics.collision.discs-2d`。二维关系曲线运行时承接一条参数方程、极坐标或隐函数零等值线及最多 8 个参数；参数轨迹运行时则用于需要播放、动点、距离线或最多 4 条独立轨迹的内容。二维几何运行时承接有限的坐标点/构造点、拖动约束、轨迹、连线、多边形和测量；专用碰撞运行时承接 2–8 个圆盘，并由本地固定 240 Hz 求解器生成状态。旋转圆周轨迹、极坐标玫瑰线、隐函数圆、双曲线轨迹、自由落体、抛体、单摆、弹簧振子和二维圆盘接触已经覆盖。多条独立样式关系曲线、符号求交、带转矩/方向或摩擦的任意刚体、电路、化学、地理和三维图形目前返回 `unsupported`。

## 协议升级排查

如果页面提示 `parameters/A/value must be number`、`editable must be boolean`，或出现“MiniMax 返回的场景未通过 LessonScene Schema”，说明浏览器连接的仍是升级前启动的旧 Node 进程。停止该进程并重新运行 `npm run dev`，随后刷新浏览器。当前接口的 `/api/health` 会返回 `apiVersion: "lesson-plan-1.4"`；前端发现版本缺失或不一致时会直接提示重启，不再继续解析旧响应。1.4 新增 `dataChartSpec` 及表格、柱状图、折线图、散点图固定运行时；1.3 新增声明式几何构造点、拖点约束与本地采样轨迹；1.2 新增 `relationSpec`、参数/极坐标/隐函数曲线运行时及收窄生成 Schema；1.1 新增声明式 `collisionSpec`；1.0 新增声明式二维几何规格。0.9 的模板限定二次编辑及简洁标签模式继续保留，并兼容导入 0.6–1.3 场景包。

生成新规划时，浏览器会在已命中能力注册表的情况下附加 `capabilityId`。服务端仅接受允许列表中的稳定能力 ID，并把工具 Schema 及系统提示收窄到对应学科和运行时。该字段不包含密钥、用户身份或任意提示词；未知能力 ID 会被拒绝。官方库、已审核第三方库或精确缓存命中时不会发出模型请求。
