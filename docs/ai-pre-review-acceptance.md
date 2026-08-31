# 第三方场景 AI 预审验收

## 目标

共享目录收到新的紧凑场景包后，MiniMax 按版本化审核标准自动提供结构化预审意见，并把结果和原文件一同交给管理员。AI 只辅助发现问题，不具有最终审核权限。

## 验收项

1. 审核标准独立保存在 `docs/third-party-ai-review-standard.md`，预审记录包含标准版本 `0.1`。
2. 新 SHA-256 内容哈希进入 `pending` 后自动预审；相同哈希重复提交不重复消耗 token。
3. 未发现明确问题时保存 `verdict: no-issues` 和空 `issues`，界面提示“等待管理员终审”。
4. 发现问题时保存 `verdict: issues-found`，每项包含分类、严重程度、JSON 位置、`finding` 问题说明和 `suggestedAction` 处理建议。
5. 两种结论都包含 `manualReviewFocus`，提醒管理员运行场景检查视觉、交互、版权和课堂效果。
6. 提交内容中的提示注入文字只能作为审核对象，不能改变标准、工具 Schema或最终状态。
7. 首次发现问题时使用第二遍事实核对删除无证据或自相矛盾的误报；首次格式无效时第二次调用用于结构纠错，总调用不超过两次。
8. 两次调用仍无有效结果时保存 `preReview.status: failed`，不丢失申请。
9. 管理员列表能同时取得场景包和预审记录，并可通过受保护接口重新预审。
10. AI 预审完成后目录状态仍为 `pending`；只有管理员可以设置 `needs-changes`、`verified`、`rejected` 或 `deprecated`。
11. 公共目录不返回内部预审意见、模型错误和 token 用量。

## 自动验证

- 模型模拟测试覆盖标准加载、提示注入隔离、无问题结论、具体问题、已知 MiniMax 输出兼容、结构纠错和第二遍事实复核。
- 目录测试覆盖 queued、completed、failed、管理员重试和预审不授予最终状态。
- 客户端测试覆盖提交后预审摘要解析。
- `npm test`、`npm run build`、服务端语法检查和 `git diff --check` 全部通过。
