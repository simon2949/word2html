# SQLite 切换前故障与回退演练

文档版本：0.1

实现状态：隔离副本写入、事务失败回滚、损坏库启动拒绝、SQLite→JSON 回导、JSON 恢复、再晋升和源文件不变性检查已自动化；后续单实例 active HTTP 验收也已完成。

## 目标

这个演练用于回答三个问题：

1. 候选运行库能否完成真实事务写入，并正确递增修订号；
2. 写入中途失败或数据库规范化列被篡改时，系统能否完整回滚或拒绝启动；
3. SQLite 当前状态能否导出为 JSON、通过现有恢复器恢复，并再次迁移成有效运行库。

命令只复制输入运行库并操作临时副本，不修改源 SQLite，不切换应用配置，也不开放生产写流量。

## 执行命令

```bash
npm run rehearse:sqlite-cutover -- \
  /srv/word2html/migrations/word2html-runtime-candidate.sqlite \
  /srv/word2html/migrations/rehearsals/本次演练报告.json
```

第二个参数可省略；命令会在 `.word2html-migrations/rehearsals` 下生成带时间和随机后缀的报告。报告权限为 `0600`，已存在的报告拒绝覆盖。临时运行库、故障副本、JSON 导出和恢复目录在结束后自动删除。

## 固定检查项

| 检查编号 | 通过条件 |
| --- | --- |
| `source-runtime-verified` | 源文件通过 Schema、角色、完整性、规范化列、摘要和修订号复验 |
| `normal-mode-activation-guarded` | 未设置 active 模式和第二确认值时，非维护 SQLite 启动会被拒绝 |
| `isolated-write-committed` | 临时副本完成真实账号写入，全局修订号准确增加 1 |
| `transaction-failure-rolled-back` | 触发器强制中断写入后，记录和修订号都保持不变 |
| `plaintext-credential-not-stored` | 临时登录码原文没有出现在 SQLite 文件中 |
| `corrupted-runtime-rejected-at-startup` | 规范化列被篡改的副本无法创建存储后端 |
| `runtime-json-export-reconciled` | SQLite→JSON 导出通过修订号、记录、历史和摘要对账 |
| `json-restore-validated` | 导出备份通过现有恢复器和真实业务校验器 |
| `json-roundtrip-promoted` | JSON 备份可重新迁移、晋升为有效 Schema v2 运行库 |
| `source-runtime-unchanged` | 演练前后的源 SQLite 字节摘要完全一致 |

报告只记录源文件名、Schema、修订号、汇总数量和检查结果，不写入绝对路径、业务内容、摘要、API Key 或一次性登录码。`productionActivationChanged` 固定为 `false`，避免把隔离演练误认为已经切换生产后端。

## 本地候选库演练记录

2026-08-30 已对 `.word2html-migrations/current-runtime-candidate.sqlite` 执行演练：10 项检查全部通过；隔离副本完成一次写入并从修订号 0 增加到 1，源候选库演练后重新复验仍为修订号 0。

报告保存在 `.word2html-migrations/rehearsals/sqlite-cutover-rehearsal-2026-08-30_11-00-52-324-577dad.json`。该目录被 Git 忽略，因为部署演练报告可能包含本地文件名和数据量等运维元数据。

## 与 active HTTP 验收的关系

本命令仍不发送真实 HTTP 写请求，也不改变 `WORD2HTML_STORAGE_BACKEND`，适合作为每个候选库的快速数据层演练。完整 active 服务验收由 `npm run acceptance:sqlite-active` 执行，覆盖用户登录、共享提交、管理员审核、能力复核、模型设置和 JSON 回退服务，详见 [sqlite-active-http-acceptance.md](sqlite-active-http-acceptance.md)。
