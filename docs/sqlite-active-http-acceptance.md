# SQLite 单实例 active HTTP 验收

文档版本：0.1

实现状态：双重显式激活、真实服务就绪检查、四类存储 HTTP 写入、写后 JSON 导出和 JSON 回退服务启动已完成隔离验收。

## 安全方式

验收命令不会直接用输入候选库启动 active 服务。它先复制候选库到权限为 `0600` 的临时目录，只把副本交给临时服务，并为该进程生成临时管理员令牌、用户会话密钥和模型目录。结束后停止进程并删除运行库副本、JSON 回退数据和临时凭据。

```bash
npm run acceptance:sqlite-active -- \
  /srv/word2html/migrations/word2html-runtime-candidate.sqlite \
  /srv/word2html/migrations/rehearsals/本次-active-http-报告.json
```

第二个参数可省略。报告使用 `0600` 权限且拒绝覆盖已有文件。

## 验收内容

- 用 `active-single-instance` 和第二确认值启动 SQLite 服务；
- `/api/health` 明确返回 active 模式，`/api/ready` 返回 HTTP 200 且全部存储就绪；
- 建立管理员 `HttpOnly` 会话；
- 管理员运行告警接口返回有效聚合和事件列表，且不泄露敏感字段或本机路径；
- 通过管理员 HTTP 接口保存模型设置；
- 创建轻量账号，并使用一次性登录码建立用户会话；
- 使用用户 Cookie 和 CSRF Token 提交既有共享场景，确认身份边界；
- 通过管理员 HTTP 接口写入实验审核和能力学科复核；
- 管理员状态接口返回 `runtime-active`，且不泄露路径、摘要和业务内容；
- 对五次实际存储写入逐一核对全局修订号；
- 导出写后 SQLite、验证、恢复为 JSON，并以 JSON 主存储启动回退服务；
- 确认回退服务能读取 active 阶段新增账号；
- 确认 JSON 旁路文件未在 active 阶段被使用，源候选库字节保持不变。

共享提交使用已有场景的精确重复项，所以不会调用真实 AI 预审模型；实验目录的持久化写入由管理员审核接口覆盖。临时模型密钥和一次性登录码不会进入报告或导出物。

## 本地执行记录

2026-08-30 已对 `.word2html-migrations/current-runtime-candidate.sqlite` 的副本重新执行：15 项检查全部通过，其中包含管理员运行告警接口脱敏检查；隔离副本全局修订号从 0 精确增加到 5，JSON 回退服务成功读取写后状态，源候选库复验后仍为修订号 0。

最新报告保存在 `.word2html-migrations/rehearsals/sqlite-active-http-2026-08-30_12-24-01-259-86f0c2.json`。报告中的 `sourceRuntimeChanged` 和 `productionTrafficChanged` 均为 `false`。

同日另用候选库副本启动 active 服务并完成 `/admin/models` 真实浏览器验收：页面返回 `runtime-active`，显示“SQLite 正在承接业务读写”，活动状态响应未泄露路径、摘要或密钥；验收后临时服务和副本已删除。新增运行告警卡片随后在隔离的 JSON 开发服务与无界面浏览器中通过显示、接口和隐私边界验收；active 隔离服务则通过上述第 15 项接口脱敏检查。

## 边界

active 模式只支持单服务实例、单 SQLite 文件。禁止两个 Word2HTML 进程同时打开同一运行库，禁止在线双写和自动故障切换。多实例部署仍需 PostgreSQL，并使用 Redis 承接短会话、限流、幂等和任务状态。
