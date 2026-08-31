# Word2HTML

一个将 K12 教学描述转换成可修改参数、可调整显示效果并可导出为独立 HTML 的交互场景工作台。

当前实现包含两个审核模板、“无预置模板”二维显函数运行时、参数/极坐标/隐函数关系曲线运行时、数据表与统计图表运行时、声明式二维几何构造运行时、固定步长二维圆盘接触运行时，以及可承接自由落体、抛体、一维解析碰撞、单摆和弹簧振子等最多 4 个质点运动、物理矢量和绳/弹簧约束的通用时间实验运行时。应用还提供官方实验库、本地第三方库、服务端共享审核目录，以及用于生成紧凑导入文件的项目 Skill。

## 已实现

- LessonScene 0.1 JSON Schema；
- 紧凑 LessonPlan 0.1 模型规划协议；
- 结构、引用、表达式白名单和数学不变量校验；
- 可复用的椭圆焦点距离和模板；
- 可复用的二次函数顶点式模板；
- 通用二维显式函数运行时：白名单表达式、动态参数滑块、自动取景和不连续点分段；
- 二维关系曲线运行时：参数方程 `x(t), y(t)`、极坐标 `r(theta)`、隐函数零等值线 `F(x,y)=0`、动态参数、固定本地采样和对象级曲线样式；
- 数据表与统计图表运行时：表格、分组柱状图、折线图和散点图，支持 1–4 个系列、自动量程、图例、数值标签、缩放和系列级样式；
- 二维几何原语运行时：坐标点、中点、平移、旋转、轴对称、位似、垂足、圆/直线/线段拖动约束、最多 4 条本地采样轨迹，以及连线、多边形和测量；
- 二维圆盘接触运行时：2–8 个有半径和质量的圆盘、矩形边界、二维重力、恢复系数、边界反弹、速度矢量、轨迹、动量与动能读数；
- 通用参数轨迹与多质点实验：声明式 `x(t)`/`y(t)`、动态持续时间、可复用派生量、独立轨迹、带箭头物理矢量、无箭头距离连线、绳/弹簧约束与播放控制；
- 自然语言生成路由：区分模板复用、右侧设置和大模型生成；
- 基于当前场景的结构化二次编辑：支持导入及库内场景，保留本地显示设置，并限制在原学科与原运行模板内；
- 按当前模板收窄的二次编辑 Schema，以及可选的仅数值距离标注；
- 二次编辑语义差异摘要和空修改拦截，避免模型未改变场景却显示成功；
- 大模型规划未通过校验时最多自动纠错一次，成功结果继续进入本地缓存；
- Anthropic/OpenAI 兼容模型适配、生成/预审默认模型分工和不泄露密钥的管理员模型设置页；
- 模型调用的匿名设备与网络来源约束、分范围限流、单客户端/平台并发、短期幂等复用、每日调用/token/可选费用熔断及管理员用量看板；
- 普通用户可从管理员可信目录选择模型并使用仅存在于当前页面内存的临时 API Key；Key 不进入浏览器存储、场景文件或导出物；
- `guest`、`user`、`admin` 轻量身份边界：管理员签发一次性登录码，平台模型和共享提交要求登录，账号可暂停并配置每日调用与 Token 额度；
- 生产运行首批保障：存储就绪检查、安全响应头，以及带 SHA-256 清单和写入后复验的单机 JSON 数据备份；
- SQLite Schema v1 影子迁移与只读对比、Schema v2 事务运行库、安全 JSON 回导、切换前故障演练，以及需要双重确认的单实例 active 模式；JSON 仍是默认主存储，不自动切换或在线双写；
- 长轴、短轴、颜色、辅助项和动画速度设置；
- 点大小与实心、轮廓、投影样式，以及主图线/辅助线独立线宽和实线、虚线、点划线样式；
- 画布对象选择与对象属性面板：可分别修改点、曲线、距离线、标签、矢量、约束和实验物体，支持局部颜色、大小、线型、显示状态及恢复默认；
- 五种本地样式预设和四种布局预设：支持先预览再应用、保留或明确清除对象覆盖、恢复模板外观及独立 HTML 还原；
- 拖动约束点、播放、暂停、轨迹、缩放、适应窗口和重置；
- 等比例正方形网格和自适应坐标刻度；
- 撤销、重做和浏览器本地自动保存；
- 完整 LessonScene JSON 导入导出；
- `.word2html.json` 紧凑 LessonPlan 场景包导入，以及当前场景反向压缩导出；
- 内置官方实验库，以及成功导入后自动保存的本地第三方待审核库；
- 用户确认后提交共享审核、SHA-256 去重、管理员令牌审核，以及只读取 `verified` 条目的共享第三方目录；
- 基于版本化审核标准的 MiniMax AI 预审：标记未发现问题或输出具体问题、位置和处理建议，最终状态仍由管理员决定；
- 不依赖 AI 服务的单文件交互 HTML 导出；
- 数学属性、协议、解析器和导出器测试。

## 本地运行

需要 Node.js 22.12 或更高版本。

```bash
npm install
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`。

### 配置大模型

```bash
export MINIMAX_API_KEY='你的密钥'
npm run dev
```

服务端直接通过 Node.js 的 `process.env.MINIMAX_API_KEY` 读取操作系统进程环境变量（等价于 Python 的 `os.getenv("MINIMAX_API_KEY")`），不需要也不建议把密钥写入 `.env.example` 或 `.env.local`。现有 `MINIMAX_*` 配置继续可用；服务端同时支持统一 `WORD2HTML_MODEL_*` 配置、独立 AI 预审档案，以及 `anthropic-compatible` / `openai-compatible` 两类协议。修改配置或服务端源码后需要重启 `npm run dev`。统一配置见 [docs/model-provider-configuration.md](docs/model-provider-configuration.md)，MiniMax 专项接入和生成流程见 [docs/minimax-integration.md](docs/minimax-integration.md)。

公开部署可用 `WORD2HTML_MODEL_CATALOG_JSON` 声明不含密钥的可信模型目录。管理员登录 `http://127.0.0.1:5173/admin/models` 后可启用目录项、分别选择生成与 AI 预审模型，并查看当日调用、token、估算费用、并发、熔断和脱敏运行告警。管理员页面不接收或返回 API Key。调用控制配置见 [docs/model-usage-control.md](docs/model-usage-control.md)，告警边界见 [docs/operational-observability.md](docs/operational-observability.md)。

普通用户可在应用左侧“模型来源”中选择可信模型并临时输入自己的 API Key。该 Key 只存在于当前页面内存，刷新即清除；详细安全边界见 [docs/temporary-user-api-key.md](docs/temporary-user-api-key.md)。

平台有限模型额度和共享审核提交需要轻量账号。管理员设置 `WORD2HTML_ADMIN_TOKEN` 后访问 `http://127.0.0.1:5173/admin/users`，创建账号并把只显示一次的登录码交给用户；应用右上角“登录”入口使用该码建立 `HttpOnly` 会话。账号与额度说明见 [docs/lightweight-user-management.md](docs/lightweight-user-management.md)。

生产运行的就绪检查、备份和安全边界见 [docs/production-operations.md](docs/production-operations.md)。

需要在单台服务器公开部署时，可使用仓库内的 `Dockerfile`、`compose.yaml` 和 Caddy 自动 HTTPS 配置。模型 Key、管理员令牌、会话密钥均通过只读文件注入，业务数据和备份使用独立持久卷；完整准备、启动和回退流程见 [docs/container-deployment.md](docs/container-deployment.md)。部署前运行 `npm run acceptance:deployment`；镜像构建后可运行 `npm run acceptance:container-recovery` 验证临时卷备份恢复，并运行 `npm run acceptance:container-runtime` 验证管理员登录、脱敏告警和官方场景零模型调用路径。两项命令均不接触真实业务数据。

若要观察 SQLite 影子一致性，先按 [docs/sqlite-migration.md](docs/sqlite-migration.md) 从同批备份生成并复验数据库，再设置 `WORD2HTML_SQLITE_SHADOW_FILE` 并重启服务。管理员可在 `/admin/models` 查看对比；JSON 仍负责全部读写，影子文件不会自动成为主数据库。

Schema v2 候选库可以在维护模式下读取试运行，并可导出为绑定当前修订号的 JSON 备份。完成演练后，可通过 `active-single-instance` 和第二确认值显式切换单实例读写；配置、校验和回退步骤见 [docs/sqlite-runtime-store.md](docs/sqlite-runtime-store.md)，真实接口验收见 [docs/sqlite-active-http-acceptance.md](docs/sqlite-active-http-acceptance.md)。系统不会自动切换或在线双写。

## 验证

```bash
npm test
npm run build
npm run audit:capabilities
npm run backup:data
# 把上一条命令输出的目录传入：
npm run verify:data-backup -- .word2html-backups/word2html-backup-某个时间
# 仅在服务停止或维护模式下使用：
npm run restore:data -- 备份目录 .word2html-data .word2html-pre-restore-backups --maintenance-confirmed
# 检查旧版共享实验；原地升级必须额外提供内容完全匹配的已验证备份：
npm run upgrade:lesson-directory -- .word2html-data/lesson-directory.json
# 从已验证备份生成影子数据库，不切换当前运行时：
npm run migrate:sqlite -- 备份目录 .word2html-migrations/shadow.sqlite
npm run verify:sqlite -- .word2html-migrations/shadow.sqlite
# 仅生成并复验候选运行库，仍不切换应用：
npm run promote:sqlite-runtime -- .word2html-migrations/shadow.sqlite .word2html-migrations/runtime-candidate.sqlite
npm run verify:sqlite-runtime -- .word2html-migrations/runtime-candidate.sqlite
# 把候选运行库当前状态导出为标准 JSON 备份并与同一运行库独立对账：
npm run export:sqlite-runtime -- .word2html-migrations/runtime-candidate.sqlite .word2html-backups
npm run verify:sqlite-export -- .word2html-migrations/runtime-candidate.sqlite 导出命令返回的备份目录
# 在临时副本中执行写入、故障、回导和再晋升演练，不切换生产后端：
npm run rehearse:sqlite-cutover -- .word2html-migrations/runtime-candidate.sqlite
# 在临时 active 服务中验收四类 HTTP 写入、写后导出和 JSON 回退：
npm run acceptance:sqlite-active -- .word2html-migrations/runtime-candidate.sqlite
# 只渲染并审计容器配置，不启动服务或修改数据卷：
npm run acceptance:deployment
```

点线样式的真实浏览器验收使用已打开远程调试端口的 Chrome 页面：

```bash
npm run acceptance:appearance -- 9333 http://127.0.0.1:5181
npm run acceptance:object-editor -- 9333 http://127.0.0.1:5181
npm run acceptance:presets -- 9333 http://127.0.0.1:5173
npm run acceptance:collision -- 9333 http://127.0.0.1:5173
npm run acceptance:relation-curve -- 9333 http://127.0.0.1:5173
npm run acceptance:parametric-trace -- 9333 http://127.0.0.1:5173
npm run acceptance:quadratic -- 9333 http://127.0.0.1:5173
npm run acceptance:explicit-function -- 9333 http://127.0.0.1:5173
npm run acceptance:geometry-primitives -- 9333 http://127.0.0.1:5173
npm run acceptance:geometry-transform -- 9333 http://127.0.0.1:5173
npm run acceptance:motion-point -- 9333 http://127.0.0.1:5173
npm run acceptance:data-chart -- 9333 http://127.0.0.1:5173
WORD2HTML_ADMIN_TOKEN='与服务端相同的管理员令牌' npm run acceptance:model-settings -- 9333 http://127.0.0.1:5173/admin/models
npm run acceptance:temporary-model-key -- 9333 http://127.0.0.1:5173
WORD2HTML_ADMIN_TOKEN='与服务端相同的管理员令牌' npm run acceptance:user-session -- 9333 http://127.0.0.1:5173/admin/users
```

新专项脚本共用浏览器连接层：检测不到指定调试端口时会自动启动隔离的无头 Chrome；它不会代替应用服务，执行前仍需运行 `npm run dev`。

`audit:capabilities` 汇总每项能力的注册绑定、官方代表场景、自动检查、真实浏览器证据和学科人工复核。管理员可在 `http://127.0.0.1:5173/admin/capabilities` 直接预览官方场景并保存学科复核记录；发布前使用 `npm run audit:capabilities:strict`。当前 9 项能力均应通过严格模式，后续非零结果表示新增能力尚未收口或现有证据发生回退。验收与晋升规则见 [docs/capability-verification.md](docs/capability-verification.md)。

## 主要目录

```text
src/
  components/         工作台设置和 SVG 交互画布
  core/               数学、校验、解析、存储和导出逻辑
  schema/             LessonPlan 与 LessonScene JSON Schema
  templates/          审核过的场景模板
  types/              场景类型定义
docs/                 产品、协议和 MVP 验收文档
skills/               Word2HTML 场景包生成 Skill
```

实验库、审核状态和后续共享服务边界见 [docs/lesson-library-and-skill.md](docs/lesson-library-and-skill.md)。

对象级编辑 R1、样式/布局预设 R2、能力注册表与生成反馈 R3、复用优先生成 R4 已完成；R5 的基础二维几何、几何约束/轨迹/变换、关系曲线、数据图表与二维圆盘接触也已完成实现和验收。R5.1 的全部 9 项能力现已具备官方代表场景、自动检查、专项真实浏览器记录和当前版本学科批准记录，全部为 `verified`。后续可按 [docs/implementation-roadmap.md](docs/implementation-roadmap.md) 推进刚体与光学，以及化学和地理原语。能力清单见 [docs/capability-registry.md](docs/capability-registry.md)，验收门槛见 [docs/capability-verification.md](docs/capability-verification.md)，分项复审标准见 [docs/capability-subject-review-workbook.md](docs/capability-subject-review-workbook.md)，复用和缓存规则见 [docs/reuse-first-generation.md](docs/reuse-first-generation.md)。新的版本分享派生和课堂专项增强暂不进入当前路线。

## 当前边界

自然语言入口先进行确定性路由：椭圆和二次函数顶点诉求复用内置模板，参数和纯显示修改引导到右侧设置，未明确命中的新内容才进入模型规划。用户也可选择“修改当前”，由应用把当前已校验场景反向压缩成紧凑 LessonPlan 作为上下文；模型只能在原学科和原运行模板内修改声明式结构。浏览器只用本地模板或白名单数学解析器创建 LessonScene；模型不能返回或执行 HTML、CSS、JavaScript。

当前通用运行时支持可写成 `y=f(x)` 的二维数学函数、有限平面几何构造与点变换/约束/轨迹、表格/柱状/折线/散点数据，以及最多 4 个质点分别写成 `x(t)`/`y(t)` 的物理运动实验；速度、加速度、动量等从指定质点出发的矢量和绳/弹簧约束可由同一安全表达式协议描述。专用接触运行时另行支持 2–8 个圆盘在矩形边界中的二维碰撞。一维完全弹性碰撞、小角度单摆和水平弹簧振子已覆盖；饼图、自动分箱直方图、带方向和转矩的刚体、摩擦、形变、电路、化学和地理实验仍需后续原语。能力不足时系统会保留当前场景并明确提示，不执行临时生成的代码。

生成端点应由自己的服务端提供，前端只保存端点地址；不要把模型供应商的 API 密钥写入任何 `VITE_` 环境变量。

顶部“场景包”会把当前结构修改和参数值导出为可分享的 `.word2html.json`，重新导入后自动进入本地第三方库并可继续二次编辑；该格式会复用运行时默认外观以减少文件与生成 token。“完整数据”用于保留颜色、字号等纯显示设置，“导出 HTML”用于直接分发可运行成品。

第三方文件导入后仍只保存在当前浏览器，不会静默上传。用户在实验库中明确点击“提交共享审核”并再次确认后，应用才上传紧凑场景包；公共目录只返回管理员标记为 `verified` 的内容，并在浏览器再次执行完整导入校验。当前服务端使用单机原子 JSON 存储和环境变量管理员令牌，适合单实例 MVP；目录会追加保存提交、AI预审、版本关联和人工决定时间线。多管理员身份、具体审核人署名、数据库、防篡改审计和多实例部署仍属于生产化阶段。

管理员启动服务前设置 `WORD2HTML_ADMIN_TOKEN`，随后访问 `http://127.0.0.1:5173/admin/reviews`。审核台在同一页面提供提交队列、真实交互预览、AI 预审问题、确定性自动检查、操作时间线、人工检查清单以及通过、退回修改、拒绝和下架操作。网页登录使用短期 HttpOnly 会话，令牌不会写入地址栏或浏览器本地存储；原 Bearer 接口继续保留给命令行使用。详细说明见 [docs/admin-review-workspace.md](docs/admin-review-workspace.md)。

提交者再次打开第三方实验库时会自动刷新自己精确版本的审核状态。退回内容会显示管理员意见和 AI 建议，可直接“打开并修改”；审核要求会预填到自然语言输入框，修改后通过顶部“保存修改”更新本地版本，再提交新的审核版本。

修改版本会关联原退回提交。管理员审核新版本时可直接查看原意见、确定性结构差异，并在原版本和修改版之间跳转；差异比较完全在本地完成，不消耗 AI token。
