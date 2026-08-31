# 场景生成 Skill 与实验库

## 当前实现

Word2HTML 提供两条无需再次调用在线模型的复用路径：

1. 官方库：随应用版本发布，当前包含椭圆焦点距离和、二次函数顶点、正弦函数参数、自由落体、双单摆、极坐标玫瑰线、可拖动三角形、旋转圆周轨迹和二维圆盘接触演示。
2. 第三方库：任何 LessonScene 0.1 或 `.word2html.json` 文件通过完整导入校验后，先自动保存在当前浏览器中并标记为“本地未审核”；用户可以明确提交到共享审核目录。

用户可以从任一库打开实验，随后使用相同的参数、显示、播放、缩放和 HTML 导出能力。相同场景指纹的重复导入会更新原条目，不会无限复制。

工作台也可以把当前场景重新导出为 `.word2html.json`。该过程复用应用内部的 LessonScene → LessonPlan 反向转换，包含用户通过“修改当前”得到的对象标签、公式、表达式、矢量、约束以及右侧设置的当前参数值，不调用大模型。导出的文件重新导入后会按普通外部文件进入本地第三方库，并可继续二次编辑。

三种导出格式的用途不同：

- “场景包”：紧凑、适合分享和复用，保留声明式教学结构与当前参数值，外观使用运行时默认值；
- “完整数据”：保留 LessonScene 中的颜色、字号、网格开关等全部当前外观；
- “导出 HTML”：生成无需应用和 AI 服务即可运行的交互成品。

## Skill

项目 Skill 位于 `skills/word2html-scene-author`。它生成下面的紧凑信封：

```json
{
  "format": "word2html.lesson-package",
  "formatVersion": "0.1",
  "kind": "lesson-plan",
  "apiVersion": "lesson-plan-1.4",
  "plan": {}
}
```

采用 LessonPlan 而不是完整 LessonScene，可以减少输出 token，并把模板实例化、默认外观、对象生成和安全检查留给应用。Skill 包含能力矩阵、格式说明、代表性示例和确定性校验脚本。

## 信任边界

- “导入成功”只证明协议、表达式、数值和当前渲染器兼容，不证明知识点、单位、结论或教学方式正确。
- 外部文件不能声明自己是官方内容。导入器拒绝场景包信封中的额外审核字段。
- 浏览器 `localStorage` 中的条目一律视为未审核，即使数据被手工改成 `verified` 也会在读取时降级。
- 导入不会静默上传。只有用户点击“提交共享审核”并在确认框同意后，才上传紧凑 LessonPlan 包；完整外观和 API 密钥不会进入请求。
- 共享公共接口只返回服务端状态为 `verified` 的内容，浏览器仍会重新实例化并执行协议、表达式、数值和渲染能力校验。
- 官方条目只能通过源码修改、自动测试和人工审查加入。
- 不执行模型生成的 HTML、JavaScript、URL 或第三方依赖。

## 共享第三方库 MVP

当前状态流：

```text
本地导入成功
  → 用户明确同意提交
  → 服务端协议校验与 SHA-256 去重
  → 按版本化文档执行 AI 预审
  → pending（隔离、待人工审核）
  → needs-changes / verified / rejected / deprecated
```

AI 预审标准位于 [third-party-ai-review-standard.md](third-party-ai-review-standard.md)。结果随目录条目保存：`no-issues` 表示模型在声明式数据中未发现明确问题；`issues-found` 包含问题分类、严重程度、JSON 位置、原因和处理建议。两种结果都会列出管理员仍需检查的视觉、交互、版权与课堂事项。AI 没有修改 `reviewStatus` 的能力，最终状态只能由管理员接口设置。

每个新 SHA-256 内容哈希只自动预审一次；模型输出未通过 Schema 时最多纠错一次。模型未配置、请求失败或两次输出仍无效时记录 `failed`，文件仍安全保留为 `pending`。管理员可在服务恢复或审核标准升级后手动触发重新预审。

普通用户打开第三方库时，应用会用本地精确场景包调用 `POST /api/library/submission-status` 刷新该版本的审核结果。被设为 `needs-changes` 时，卡片直接显示管理员意见和最多三条 AI 建议；“打开并修改”会载入场景，并把管理员意见预填到左侧描述。用户完成自然语言或参数修改后点击顶部“保存修改”，再从实验库提交修改版本。状态按场景包内容匹配，因此旧版本的退回结论不会附着到已经改变的新版本上。

保存修改版时，本地条目会记录原退回提交 ID；重新提交将该 ID 作为 `revisionParentId` 发送。服务端只允许关联同学科且状态为 `needs-changes`、`rejected` 或 `deprecated` 的原条目，并保存新条目的 `revisionOf` 与原条目的 `supersededBy`。管理员审核页使用本地 `describeLessonPlanChanges` 比较新旧 LessonPlan，直接列出参数、表达式、标签、测量量、矢量和约束的变化，不额外消耗模型 token。

服务端数据默认写入 `.word2html-data/lesson-directory.json`，采用临时文件加原子重命名，场景包上限受 HTTP 128 KiB 请求限制，并默认按连接地址限制为每 10 分钟 20 次提交；可用 `WORD2HTML_LIBRARY_FILE` 指向持久卷，用 `WORD2HTML_SUBMISSION_LIMIT` 调整单实例限额。新内容不会出现在公共接口；管理员必须检查学科正确性、K12 适龄性、单位和结论、可操作性及版权来源后再设为 `verified`。

启动服务前从操作系统环境配置管理员令牌：

```bash
export WORD2HTML_ADMIN_TOKEN='使用足够长的随机令牌'
npm run dev
```

服务启动后直接访问 `http://127.0.0.1:5173/admin/reviews`，输入同一个管理员令牌即可进入可视化审核台。页面会把队列、交互预览、参数测试、AI 问题、人工清单和最终操作集中在同一屏；浏览器只保留服务端签发的 HttpOnly 会话 Cookie，不把原始令牌写入本地存储。生产环境通过 HTTPS 提供服务时设置 `WORD2HTML_SECURE_COOKIES=true`。

管理员接口：

```text
POST  /api/admin/session
GET   /api/admin/session
DELETE /api/admin/session
GET   /api/admin/library/submissions
PATCH /api/admin/library/submissions/:id
POST  /api/admin/library/submissions/:id/pre-review
Authorization: Bearer <WORD2HTML_ADMIN_TOKEN>
```

管理员列表会同时返回场景包、结构化 `preReview` 和追加式 `reviewHistory`。`POST .../pre-review` 重新运行当前标准；`PATCH` 请求体示例为 `{"reviewStatus":"verified","reviewNote":"已结合 AI 意见复核公式、单位和交互。"}`。可使用 `pending`、`needs-changes`、`verified`、`rejected` 或 `deprecated`；退回修改和拒绝必须填写意见。公共 `/api/library/entries` 只返回 `verified`，不公开内部预审、token 或审核历史。

当前实现是单实例 MVP：已有 JSON 内的追加式审核时间线，但没有普通用户身份、提交者追踪、多管理员账号、具体审核人署名、数据库事务和防篡改审计。生产部署前应接入身份认证与授权、持久数据库、签名或不可变审核日志、备份及多实例并发控制。

## 官方内容晋升

稳定的第三方实验可以按以下流程晋升：

1. 管理员选择高复用且已验证的条目；
2. 固定表达式、参数范围、教学说明和能力指纹；
3. 增加学科不变量与边界测试；
4. 将条目加入官方源码目录；
5. 随应用版本发布，第三方旧版本标记为已被官方版本替代。
