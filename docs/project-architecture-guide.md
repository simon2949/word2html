# Word2HTML 项目结构与架构导读

文档日期：2026-08-31

适用范围：当前工作区代码

## 1. 项目是什么

Word2HTML 不是传统的 Word 文档转 HTML 工具。它是一个把 K12 教学描述转换成可修改参数、可交互、可审核、可导出为独立 HTML 的教学场景工作台。

理解整个项目时，先记住下面这条主线：

```text
自然语言 / .word2html.json 场景包
                │
                ▼
       紧凑声明式 LessonPlan
                │
                ▼
     受信任模板与本地运行时实例化
                │
                ▼
          完整 LessonScene
                │
       ┌────────┼────────┐
       ▼        ▼        ▼
   React 预览  本地编辑  独立 HTML
```

这里最重要的安全边界是：模型只负责生成 `LessonPlan`，不会直接生成或执行 HTML、CSS、JavaScript。浏览器使用受信任模板和白名单数学运行时，把规划实例化为 `LessonScene`，再次校验后才渲染。

## 2. 框架与技术栈

### 2.1 总览

| 层级 | 技术 | 在项目中的用途 |
|---|---|---|
| 运行环境 | Node.js 22.12+、ES Modules | 服务端、构建、测试、运维脚本 |
| 前端框架 | React 19.2、React DOM 19.2 | 普通工作台和四个管理页面 |
| 开发语言 | TypeScript 7、JavaScript `.mjs` | `src/` 使用 TS/TSX，`server/` 和 `scripts/` 使用现代 JavaScript |
| 构建工具 | Vite 8、`@vitejs/plugin-react` | 前端开发中间件和生产构建 |
| 样式与绘图 | 原生 CSS、SVG、语义化 HTML | 场景画布、图表和管理界面；未使用 UI 组件库或图形库 |
| Schema 校验 | Ajv 8、JSON Schema 2020-12 | 校验 LessonPlan、LessonScene 和 AI 预审结果 |
| 模型接入 | Anthropic SDK、原生 `fetch` | Anthropic-compatible 与 OpenAI-compatible 两类协议 |
| 服务端 | Node 内置 `http` | API 路由、Vite 中间件、生产静态文件；未使用 Express/Koa |
| 浏览器存储 | `localStorage` | 自动草稿、生成缓存、本地第三方实验库 |
| 服务端存储 | 原子 JSON 文件、Node `node:sqlite` | 默认单实例 JSON 主存储，SQLite 影子迁移和候选/active 运行库 |
| 测试 | Vitest 4、React DOM Server | 领域逻辑、组件静态渲染和服务端模块测试 |
| 浏览器验收 | Chrome DevTools Protocol | 通过调试端口和 WebSocket 执行真实页面验收，未使用 Playwright |
| 部署 | Docker、Docker Compose、Caddy | 两阶段构建、只读应用容器、HTTPS 反向代理、维护容器 |

依赖和常用命令以 [`package.json`](../package.json) 为准，锁定的实际安装版本记录在 [`package-lock.json`](../package-lock.json)。

### 2.2 几个刻意保持轻量的技术选择

- 没有 React Router：[`src/main.tsx`](../src/main.tsx) 直接根据 `window.location.pathname` 选择根应用。
- 没有 Redux/Zustand：普通工作台主要使用 React `useState`、`useMemo`、`useEffect` 和 `useCallback` 管理状态。
- 没有 Express：[`server/index.mjs`](../server/index.mjs) 使用 Node `createServer` 和显式路径判断处理 API。
- 没有图形框架：二维图形主要由 React 组件直接生成 SVG，数据表使用语义化 HTML。
- 没有任意表达式执行：数学表达式由项目自己的白名单解析器计算，不使用 `eval`。

这些选择降低了依赖复杂度，但也让 `App.tsx` 和 `server/index.mjs` 承担了较多总编排职责。

## 3. 根目录结构

```text
word2html/
├── src/                         前端、领域模型和受信任场景运行时
│   ├── components/              画布和界面组件
│   ├── core/                    业务、数学、验证、导入导出和 API 客户端
│   ├── schema/                  三套 JSON Schema
│   ├── templates/               受信任场景模板/实例化器
│   ├── types/                   TypeScript 场景类型
│   ├── *App.tsx                 普通工作台和管理页面
│   ├── main.tsx                 浏览器入口
│   └── styles.css               全局样式
├── server/                      Node 服务、模型、账号、审核和存储
├── scripts/                     验收、审计、备份、恢复、迁移 CLI
├── docs/                        产品、协议、验收和运维文档
├── examples/lesson-packages/    可导入的紧凑场景包示例
├── skills/word2html-scene-author/
│                                  面向 AI/Codex 的场景包创作 Skill
├── deploy/                      Caddy、部署配置和密钥说明
├── .word2html-data/             当前本地 JSON 业务数据，Git 忽略
├── .word2html-backups/          数据备份，Git 忽略
├── .word2html-migrations/       SQLite 文件和演练记录，Git 忽略
├── index.html                   Vite HTML 入口
├── package.json                 依赖和命令入口
├── vite.config.ts               Vite/Vitest 配置
├── tsconfig*.json               TypeScript 工程配置
├── Dockerfile                   生产镜像
└── compose.yaml                 应用、Caddy、维护容器和持久卷
```

`.venv/`、`.agents/` 和 `.codex/` 不是当前 Node 产品运行链的一部分，可视为本地工具或环境目录。

## 4. 浏览器入口与页面关系

[`index.html`](../index.html) 只提供 `#root` 挂载点，并加载 [`src/main.tsx`](../src/main.tsx)。`main.tsx` 根据路径选择五个根应用：

| URL | 根组件 | 作用 |
|---|---|---|
| `/` | `App.tsx` | 普通教学场景工作台 |
| `/admin/reviews` | `AdminReviewApp.tsx` | 第三方场景审核 |
| `/admin/capabilities` | `CapabilityReviewApp.tsx` | 已注册能力的学科人工复核 |
| `/admin/models` | `ModelSettingsApp.tsx` | 模型选择、连接测试、用量、事件和存储状态 |
| `/admin/users` | `AdminUsersApp.tsx` | 用户、登录码、状态和额度管理 |

这些页面共用同一份 [`src/styles.css`](../src/styles.css)，管理端网络请求主要集中在 [`src/core/adminReviewApi.ts`](../src/core/adminReviewApi.ts)。

## 5. `src/` 内部的分层

### 5.1 `types/`：代码中的核心数据模型

[`src/types/lessonScene.ts`](../src/types/lessonScene.ts) 定义完整的 `LessonScene`，包括：

- `metadata`：标题、学科、知识点、年级和说明；
- `viewport`：可视区域和缩放能力；
- `parameters`：数值或布尔输入参数；
- `derivedValues`：由安全表达式计算的派生值；
- `objects`：点、线、曲线、图表、物体、约束等声明式对象；
- `controls` 和 `interactions`：滑块、按钮、拖动、播放和重置；
- `annotations` 和 `invariants`：公式、结论和必须满足的规律；
- `appearance`：场景级和对象级外观；
- `lineage`：来源、复用级别、指纹和父场景。

`LessonScene` 是模板、运行时、保存、审核预览和 HTML 导出之间的稳定边界。

### 5.2 `schema/`：运行时协议边界

| 文件 | 校验对象 | 主要使用位置 |
|---|---|---|
| `lesson-plan.schema.json` | 模型和场景包中的紧凑 `LessonPlan` | `server/minimax.mjs`、`src/core/modelGateway.ts` |
| `lesson-scene.schema.json` | 完整 `LessonScene` | `src/core/validateScene.ts` |
| `lesson-pre-review.schema.json` | AI 预审结果 | `server/lesson-pre-review.mjs` |

TypeScript 类型负责开发期约束；JSON Schema 负责检查文件、模型和网络等不可信运行时输入。

### 5.3 `templates/`、`core/`、`components/` 的纵向关系

一个场景能力通常由下面的文件共同组成：

```text
templates/<能力>Template.ts
        │ 创建默认或规划实例化后的 LessonScene
        ▼
core/<能力>.ts
        │ 参数更新、数学计算、语义校验、运行时状态
        ▼
components/<能力>Canvas.tsx
        │ React/SVG/HTML 渲染与指针交互
        ▼
App.tsx / ReviewScenePreview.tsx
        │ 根据 templateRef.id 选择渲染器
        ▼
core/exportHtml.ts
          为同一模板生成独立 HTML
```

当前模板映射如下：

| 模板 ID | 模板/实例化器 | 领域逻辑 | 工作台渲染器 |
|---|---|---|---|
| `math.conic.ellipse-focus-sum` | `ellipseTemplate.ts` | `ellipse.ts` | `EllipseCanvas.tsx` |
| `math.function.quadratic-vertex` | `quadraticTemplate.ts` | `quadratic.ts` | `QuadraticCanvas.tsx` |
| `math.function.generic-2d` | `genericFunctionTemplate.ts` | `genericFunction.ts` | `GenericFunctionCanvas.tsx` |
| `math.curve.relation-2d` | `relationCurve2dTemplate.ts` | `relationCurve2d.ts` | `RelationCurve2DCanvas.tsx` |
| `experiment.motion.point-2d` | `timeExperimentTemplate.ts` | `timeExperiment.ts` | `TimeExperimentCanvas.tsx` |
| `math.geometry.primitives-2d` | `geometry2dTemplate.ts` | `geometry2d.ts` | `Geometry2DCanvas.tsx` |
| `physics.collision.discs-2d` | `collision2dTemplate.ts` | `collision2d.ts` | `Collision2DCanvas.tsx` |
| `math.data.chart-2d` | `dataChart2dTemplate.ts` | `dataChart2d.ts` | `DataChart2DCanvas.tsx` |

数学参数轨迹和物理质点运动是两项不同的产品能力，但共享 `experiment.motion.point-2d` 时间实验运行时，因此能力数会多于模板数。

### 5.4 `core/` 的横向模块

`core/` 不只放数学算法，还包含前端领域基础设施：

| 模块组 | 代表文件 | 作用 |
|---|---|---|
| 生成路由 | `intentParser.ts`、`capabilityRegistry.ts` | 判断模板、设置、模型或暂不支持 |
| 模型网关 | `modelGateway.ts`、`modelRequestIdentity.ts` | 模型 HTTP 请求、幂等头、Plan/Scene 转换 |
| 场景验证 | `validateScene.ts`、`mathExpression.ts` | Schema、表达式、引用、循环依赖和领域语义 |
| 复用 | `sceneReuse.ts`、`lessonPlanDiff.ts` | 缓存键、库匹配、相似场景修改和差异说明 |
| 导入导出 | `lessonPackage.ts`、`exportHtml.ts` | 紧凑场景包、完整场景和独立 HTML |
| 实验库 | `lessonLibrary.ts`、`sharedLessonLibrary.ts` | 官方库、本地第三方库、共享审核目录 |
| 浏览器存储 | `storage.ts` | 自动草稿和最多 30 项的提示词缓存 |
| 外观系统 | `objectAppearance.ts`、`appearanceStyles.ts`、`appearancePresets.ts` | 整体样式、对象覆盖和预设 |
| 管理/会话 API | `adminReviewApi.ts`、`userSessionApi.ts` | 管理页面与普通用户会话的 API 客户端 |
| 能力发布证据 | `capabilityReadiness.ts`、`sceneReviewChecks.ts` | 汇总自动检查、浏览器证据和人工复核 |

## 6. `LessonPlan`、`LessonScene` 与运行状态

这三个概念容易混淆：

| 概念 | 是否持久化 | 内容 | 产生位置 |
|---|---|---|---|
| `LessonPlan` | 场景包和模型响应中持久化 | 紧凑的模板选择、参数和领域规格 | 模型、Skill、导入包、Scene 反向压缩 |
| `LessonScene` | 草稿、完整 JSON、库和 HTML 中持久化 | 完整对象、控件、交互、不变量和外观 | `modelGateway.instantiateLessonPlan()` 或内置模板 |
| Runtime State | 通常不持久化 | 当前播放时间、缩放、拖动角度、选中对象、面板开关 | `App.tsx` 和各 Canvas 的 React state |

[`src/core/modelGateway.ts`](../src/core/modelGateway.ts) 是两种协议之间的核心桥梁：

- `instantiateLessonPlan(plan)`：把紧凑规划转换为安装好的受信任模板场景；
- `lessonPlanFromScene(scene)`：把当前完整场景反向压缩，用于二次编辑和场景包导出；
- `generateSceneWithModel()`：调用模型并处理首次生成后的自动纠错；
- `editSceneWithModel()`：限制二次编辑不能跨学科或更换运行模板，并保留当前外观。

## 7. 普通工作台的主调用链

[`src/App.tsx`](../src/App.tsx) 是普通工作台的总编排器。

### 7.1 初始化

```text
main.tsx
  → <App />
  → storage.loadDraft()
  → 草稿有效且渲染器已安装：恢复草稿
  → 否则 templates.createEllipseScene()
```

初始化后，`App` 读取模型状态、可信模型目录、普通用户会话、共享实验目录和本地实验库。

### 7.2 生成或修改场景

`handleGenerate('create' | 'edit')` 的执行顺序是：

```text
用户描述
  │
  ▼
intentParser.routeGenerationRequest()
  ├─ settings：提示使用右侧本地设置
  ├─ unsupported：显示缺少的运行时原语
  ├─ template：加载内置模板，模型调用为 0
  └─ model：继续
       │
       ▼
sceneReuse.decideSceneReuse()
  ├─ 本地精确缓存：直接恢复
  ├─ 官方/已审核场景直接命中：直接复用
  └─ 相似场景：作为收窄的模型修改基础
       │
       ▼
modelGateway.generateSceneWithModel()
或 modelGateway.editSceneWithModel()
       │
       ▼
POST /api/generate
       │
       ▼
LessonPlan → LessonScene → validateLessonScene()
       │
       ▼
commitScene() 写入撤销历史并保存草稿/缓存
```

### 7.3 本地修改

参数、拖动、样式、对象外观、布局预设、播放和缩放都在浏览器本地完成。各操作调用对应的 `core/` 更新函数，返回一个克隆后的新 `LessonScene`，再通过 `commitScene()` 统一验证并写入历史。

### 7.4 渲染与导出

`App.tsx` 根据 `scene.templateRef.id` 计算布尔标志，再选择对应 Canvas。审核页面的 `ReviewScenePreview.tsx` 使用同样的模板分派思想。

导出有三种：

- 完整数据：完整 `LessonScene`，保留结构、参数和外观；
- 场景包：`LessonPlan` 包装成 `.word2html.json`，更紧凑，不保留纯外观；
- 独立 HTML：`exportHtml.ts` 按模板 ID 选择专用导出器，文件不依赖模型服务。

## 8. 能力注册、实验库和审核的关系

### 8.1 能力注册表

[`src/core/capabilityRegistry.ts`](../src/core/capabilityRegistry.ts) 描述系统“声称能做什么”：

- 能力 ID、模板 ID、学科和优先级；
- 意图关键词；
- 渲染器、校验器和导出器绑定；
- 可调参数、交互、测量、不变量和上限；
- 暂不支持能力缺少的原语及替代建议。

它不直接实现渲染，而是生成路由和能力说明的目录。

### 8.2 能力就绪审计

[`src/core/capabilityReadiness.ts`](../src/core/capabilityReadiness.ts) 把下面几类证据合并：

```text
能力注册
 + 官方代表场景
 + 自动场景检查
 + 真实浏览器验收状态
 + docs/*-acceptance.md
 + 学科人工复核记录
 = 能力 readiness 状态
```

[`scripts/capability-readiness-audit.mjs`](../scripts/capability-readiness-audit.mjs) 是命令行审计入口，`/admin/capabilities` 是人工复核页面。

### 8.3 三类实验库

| 类型 | 保存位置 | 信任状态 |
|---|---|---|
| 官方库 | `src/core/lessonLibrary.ts` 源码 | `official`，随版本发布 |
| 本地第三方库 | 浏览器 `localStorage` | `pending`，仅当前浏览器可见 |
| 共享第三方库 | 服务端 lesson directory | 只有管理员标记为 `verified` 才公开返回 |

导入成功只说明协议兼容，不代表教学内容正确。第三方内容必须显式提交，服务端去重并进行 AI 预审，最终仍由管理员决定审核状态。

## 9. 前端到服务端的 API 链

开发和生产都由 [`server/index.mjs`](../server/index.mjs) 接收 HTTP 请求：

```text
浏览器 core/*Api.ts 或 modelGateway.ts
                │
                ▼
         server/index.mjs
                │
       ┌────────┼──────────┬────────────┐
       ▼        ▼          ▼            ▼
   会话/用户   模型调用   实验库/审核   运维/存储状态
```

主要 API 组：

- `/api/health`、`/api/ready`：存活、模型和存储状态；
- `/api/model-options`：浏览器可见的非敏感可信模型目录；
- `/api/generate`：生成、二次编辑和纠错共用入口；
- `/api/user/session`：普通用户登录、恢复和退出；
- `/api/library/*`：公共已审核目录、提交和提交状态；
- `/api/admin/*`：管理员会话、审核、模型、用户、能力复核和运行状态。

开发模式下，同一个 Node 服务创建 Vite middleware server；生产模式下，它从 `dist/` 返回静态资源，并把未知页面路径回退到 `index.html`。

## 10. 模型调用链

### 10.1 浏览器侧

[`src/core/modelGateway.ts`](../src/core/modelGateway.ts) 发送：

- 教学描述和目标能力 ID；
- 创建时的规划请求，或编辑时的 `basePlan`；
- 匿名设备 ID、请求指纹和幂等键；
- 平台模式的 CSRF Token，或仅在当前页面内存存在的临时模型 ID/API Key。

### 10.2 服务端侧

```text
POST /api/generate
  → modelSettings.config() 选择可信模型
  → temporary-model-access 判断平台 Key / 用户自带 Key
  → 平台 Key 要求普通用户登录
  → controlledModelCall()
       ├─ 请求指纹和幂等复用
       ├─ 窗口限流
       ├─ 账号/匿名客户端日额度
       ├─ 客户端和平台并发限制
       └─ token/估算费用记账与熔断
  → minimax.mjs
       ├─ generateLessonPlan()
       ├─ editLessonPlan()
       └─ repairLessonPlan()
  → model-provider.mjs
       ├─ Anthropic-compatible：@anthropic-ai/sdk
       └─ OpenAI-compatible：fetch /chat/completions
```

`server/minimax.mjs` 是历史保留名称，现在承担的是通用 LessonPlan 提示、能力收窄 Schema、响应归一化和校验，并不只支持 MiniMax。

当前 [`docs/model-usage-control.md`](model-usage-control.md) 对应的主要实现是：

- 浏览器：`src/core/modelRequestIdentity.ts`；
- 服务端控制器：`server/model-usage-guard.mjs`；
- 总入口：`server/index.mjs` 中的 `controlledModelCall()`；
- 管理看板：`src/ModelSettingsApp.tsx`；
- 配置：`.env.example` 中的 `WORD2HTML_MODEL_*`。

模板、本地缓存、参数修改、样式修改和独立 HTML 不经过模型控制器。

## 11. 身份、会话与权限

项目有三类身份：

| 身份 | 能力 |
|---|---|
| `guest` | 本地模板、导入导出、浏览器本地编辑；可使用临时自带 Key |
| `user` | 使用平台模型额度、提交共享审核 |
| `admin` | 审核、模型配置、用户管理、能力复核和运行状态 |

普通用户目录由 `server/user-directory.mjs` 管理，一次性登录码只保存 SHA-256 摘要。普通用户和管理员分别使用 `user-session.mjs`、`admin-session.mjs` 创建 HttpOnly Cookie 会话；写操作使用 CSRF Token。

## 12. 存储关系

### 12.1 浏览器存储

```text
localStorage
├── 当前 LessonScene 自动草稿
├── 提示词/能力/模型隔离的场景缓存
└── 本地第三方实验库
```

这些数据不会因为导入成功而自动上传。临时 API Key 只在 React 内存状态中，不写入浏览器存储。

### 12.2 服务端默认 JSON 存储

`server/index.mjs` 创建四类 store，再交给 `storage-backend.mjs` 统一选择后端：

- `lesson-directory.json`：共享实验、预审和人工审核时间线；
- `capability-subject-reviews.json`：能力学科复核；
- `model-settings.json`：启用模型 ID 和生成/预审选择，不含 API Key；
- `users.json`：用户和额度配置，不含登录码原文。

默认 JSON store 使用临时文件加原子重命名，适合单实例 MVP。

### 12.3 SQLite 路线

```text
已验证 JSON 备份
       │
       ▼
SQLite Schema v1 影子库 ── 与 JSON 只读对账
       │
       ▼
SQLite Schema v2 候选运行库
       │
       ├─ 维护模式试运行
       ├─ 导出 JSON 回退备份
       ├─ 隔离故障演练
       └─ 双重确认后 active-single-instance
```

`storage-backend.mjs` 为 JSON 和 SQLite 暴露相同的 `users`、`lessons`、`capabilityReviews`、`modelSettings` 接口，因此 API 上层不需要关心具体存储。

模型限流、幂等结果、当日用量和结构化运行事件当前主要保存在单个 Node 进程内存中，服务重启会清零，多实例阶段需要迁移到共享原子存储。

## 13. `scripts/`、测试和 `docs/` 的关系

### 13.1 自动测试

- `src/**/*.test.ts`：领域逻辑、协议和组件静态渲染；
- `server/**/*.test.mjs`：服务端 store、会话、模型、备份和 SQLite；
- `npm test`：由 Vitest 统一执行；
- `npm run build`：TypeScript 工程检查后执行 Vite 构建。

测试文件通常与实现文件并列，便于从实现跳转到行为约束。

### 13.2 真实浏览器验收

`scripts/browser-*-acceptance.mjs` 共用 `browser-acceptance-client.mjs`：

1. 连接已有 Chrome 调试端口；
2. 若端口不存在，启动隔离的无头 Chrome/Chromium；
3. 通过 Chrome DevTools Protocol 的 WebSocket 执行页面表达式；
4. 检查真实 DOM、SVG、交互和导出行为。

这些脚本不会代替应用服务，运行前仍需启动 `npm run dev`。

### 13.3 运维脚本

备份、恢复、SQLite 迁移和复验脚本通常是 CLI 包装，真正实现放在 `server/`，例如：

```text
scripts/backup-data.mjs
        → server/data-backup.mjs

scripts/migrate-json-to-sqlite.mjs
        → server/sqlite-shadow-migration.mjs
```

这样浏览器/API 验收、测试和运维命令可以复用同一份实现。

### 13.4 文档分类

| 文档类型 | 代表文件 |
|---|---|
| 产品与架构 | `product-requirements.md`、`implementation-roadmap.md`、`lesson-scene-spec.md` |
| 能力定义与发布 | `capability-registry.md`、`capability-verification.md`、`capability-subject-review-workbook.md` |
| 分项验收 | `*-acceptance.md` |
| 模型与审核 | `minimax-integration.md`、`model-provider-configuration.md`、`model-usage-control.md`、`third-party-ai-review-standard.md` |
| 实验库与复用 | `lesson-library-and-skill.md`、`reuse-first-generation.md` |
| 账号与运维 | `lightweight-user-management.md`、`production-operations.md`、`operational-observability.md` |
| 部署与数据 | `container-deployment.md`、`sqlite-*.md` |

部分 `*-acceptance.md` 会被 `capabilityReadiness.ts` 注册为能力发布证据，因此它们不仅是说明材料，也是发布审计链的一部分。

## 14. `examples/` 与项目 Skill

[`examples/lesson-packages/`](../examples/lesson-packages) 中的文件都是紧凑的 `word2html.lesson-package`：

```text
format + formatVersion + kind + apiVersion + plan
```

它们用于：

- 手动导入和产品演示；
- LessonPlan 兼容性测试；
- 官方实验库的代表内容参考；
- `word2html-scene-author` Skill 的创作示例。

[`skills/word2html-scene-author/SKILL.md`](../skills/word2html-scene-author/SKILL.md) 指导 AI 选择已安装运行时、生成场景包并调用 `skills/.../scripts/validate-package.mjs` 校验。Skill 生成的是第三方候选包，不能自行声明为官方或已审核内容。

## 15. 构建与部署链

### 15.1 本地开发

```text
npm run dev
  → node server/index.mjs
  → 创建 API 和存储
  → 创建 Vite middleware server
  → http://127.0.0.1:5173 同时提供页面和 API
```

`npm run dev:vite` 只启动 Vite，一般不能覆盖模型、共享库和账号等完整功能。

### 15.2 生产构建

```text
npm run build
  → tsc -b
  → vite build
  → dist/

npm start
  → server/index.mjs --production
  → /api/* 由 Node 处理
  → 其他路径从 dist/ 返回
```

### 15.3 容器

[`Dockerfile`](../Dockerfile) 使用两阶段构建：构建阶段安装开发依赖并生成 `dist/`，运行阶段只复制生产依赖、服务端、脚本、必要 Schema 和预审标准。

[`compose.yaml`](../compose.yaml) 包含：

- `app`：只读、非 root、移除 Linux capabilities 的 Node 应用；
- `caddy`：HTTPS 和反向代理；
- `maintenance`：无网络的备份维护容器；
- 业务数据、备份、Caddy 证书与状态的独立持久卷。

## 16. 当前打开的几个入口文件如何串起来

```text
package.json
  │ npm run dev
  ▼
server/index.mjs
  │ 开发模式挂载 Vite，浏览器请求 index.html
  ▼
src/main.tsx
  │ 根据 URL 选择根应用
  ▼
src/App.tsx
  │ 保存当前 LessonScene、编排生成/编辑/渲染/导出
  ▼
src/types/lessonScene.ts
    定义贯穿模板、core、Canvas、存储和导出的核心数据结构
```

阅读 `server/index.mjs` 时，先看顶部初始化和 `handleApi()` 的路由列表，再进入具体模块；阅读 `App.tsx` 时，先找 `initialScene()`、`commitScene()`、`handleGenerate()` 和 JSX 中的 Canvas 分派，不必一开始逐行阅读全部 UI 状态。

## 17. 推荐阅读顺序

1. [`README.md`](../README.md)：了解产品范围、运行方法和当前边界。
2. [`docs/product-requirements.md`](product-requirements.md)：从用户流程理解需求。
3. [`docs/lesson-scene-spec.md`](lesson-scene-spec.md)：理解 Template、Plan、Scene、Appearance 和 Runtime State。
4. [`src/types/lessonScene.ts`](../src/types/lessonScene.ts) 与 `src/schema/`：理解数据契约。
5. [`src/core/modelGateway.ts`](../src/core/modelGateway.ts)：理解 Plan/Scene 转换和模型边界。
6. [`src/App.tsx`](../src/App.tsx) 的 `initialScene()`、`commitScene()` 和 `handleGenerate()`。
7. 选择一条纵向能力阅读，建议顺序为：`ellipseTemplate.ts → ellipse.ts → EllipseCanvas.tsx → ellipse.test.ts → exportHtml.ts`。
8. [`src/core/capabilityRegistry.ts`](../src/core/capabilityRegistry.ts) 和 [`src/core/capabilityReadiness.ts`](../src/core/capabilityReadiness.ts)。
9. [`server/index.mjs`](../server/index.mjs)，再按需要进入模型、审核、账号和存储模块。
10. 最后阅读 `scripts/`、部署和 SQLite 文档。

## 18. 新增能力时需要修改哪些地方

新增一个完整运行时通常需要同时考虑：

1. 扩展 `lesson-plan.schema.json` 的紧凑规格；
2. 如有新的完整对象字段或类型，扩展 `lesson-scene.schema.json` 和 `lessonScene.ts`；
3. 新增 `templates/*Template.ts` 实例化器；
4. 新增 `core/<能力>.ts` 的计算、更新和语义验证；
5. 在 `validateScene.ts` 接入领域验证；
6. 新增 `components/*Canvas.tsx`；
7. 在 `App.tsx` 和 `ReviewScenePreview.tsx` 注册渲染分派；
8. 在 `modelGateway.ts` 接入 Plan/Scene 双向转换；
9. 在 `exportHtml.ts` 注册独立 HTML 导出器；
10. 在 `capabilityRegistry.ts` 注册能力和安装绑定；
11. 在模型的能力收窄 Schema/提示中接入；
12. 增加官方代表场景、单元测试、浏览器验收、验收文档和学科复核定义；
13. 运行 `npm test`、`npm run build`、能力审计和专项浏览器验收。

遗漏其中任何一层，都可能出现“模型能生成但浏览器不能渲染”“工作台能预览但不能导出”或“实现存在但能力审计未就绪”的情况。

## 19. 一句话总结

Word2HTML 的架构本质是一个受约束的互动教学内容编译器：`LessonPlan` 是紧凑源格式，`LessonScene` 是稳定中间表示，模板与 `core/` 是受信任运行时，Canvas 和独立 HTML 是两类输出端，能力注册、测试和审核系统共同决定一种内容是否真正可以发布。
