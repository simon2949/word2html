# JSON 到 SQLite 影子迁移

文档版本：0.1

实现状态：SQLite Schema v1、事务迁移、只读审计和运行时影子对比已完成；独立 Schema v2 可写候选库也已实现，但应用仍以 JSON 为唯一主存储。

## 为什么先做影子迁移

直接把正在使用的 JSON 切换成数据库，会同时改变数据格式、读写实现和部署方式，出现问题时难以判断是迁移错误还是运行时适配错误。当前阶段只从一个不可变的已验证备份生成新的 SQLite 文件，然后逐项对账。它不会修改源备份、当前 `.word2html-data` 或服务端存储配置。

## 前置条件

1. 使用 `npm run backup:data` 创建单实例数据备份；
2. 使用 `npm run verify:data-backup -- 备份目录` 验证备份；
3. 确保输出文件不存在，并且不位于源备份目录内部；
4. 使用 Node.js 22.12 或更高版本。当前实现使用 Node 内置 `node:sqlite`，Node 22 可能显示实验功能警告。

## 生成影子数据库

```bash
npm run migrate:sqlite -- \
  /srv/word2html/backups/word2html-backup-某个时间 \
  /srv/word2html/migrations/word2html-shadow.sqlite
```

命令只接受 `.sqlite` 或 `.db` 输出。已存在的输出文件不会被覆盖。迁移先写入同目录的 `.migrating` 文件，全部事务提交和只读复验通过后才原子重命名为正式输出。

## Schema v1

数据库设置固定的 Word2HTML `application_id` 和 `user_version=1`，并使用 SQLite `STRICT` 表：

- `word2html_meta`：Schema 和源备份信息；
- `source_documents`：每个 JSON 业务格式的版本、文件摘要、规范化记录摘要、记录数和审核历史数；
- `users`：账号状态、额度、邀请摘要和完整原始记录；
- `lesson_entries`：共享提交元数据、场景包、AI 预审、人工审核历史和完整原始记录；
- `capability_reviews`：学科复核结论、审核身份、检查项、历史和完整原始记录；
- `model_settings`：启用模型 ID 和生成/预审分工，不包含 API Key；
- `migration_audits`：版本化迁移报告及其 SHA-256。

完整原始记录用于精确回溯，规范化列为下一阶段的运行时查询准备。两者在迁移和复验时必须一致。

## 自动对账内容

每种业务格式都会比较：

- JSON `formatVersion` 与 `source_documents` 记录；
- 源记录数与目标表行数；
- 共享实验 `reviewHistory` 和能力复核 `history` 的总数量；
- 源记录集合与 SQLite `payload_json` 的规范化 SHA-256；
- 规范化列与完整原始记录中的对应字段；
- 单条 `payload_json` 与其 SHA-256；
- SQLite `PRAGMA integrity_check`、应用 ID 和 Schema 版本；
- 数据库内迁移报告与重新计算结果。

任何一项失败都不会生成正式输出文件。

## 独立复验

```bash
npm run verify:sqlite -- /srv/word2html/migrations/word2html-shadow.sqlite
```

复验以只读方式打开数据库，重新执行完整性检查、数量/历史/摘要/字段映射对账。管理员可以把 JSON 备份、影子数据库和命令输出的报告作为同一迁移批次保存。

## 启用只读运行时对比

确认影子数据库来自当前四类 JSON 数据的同一批已验证备份后，设置：

```bash
export WORD2HTML_SQLITE_SHADOW_FILE=/srv/word2html/migrations/word2html-shadow.sqlite
npm run start
```

管理员登录 `/admin/models`，在“存储影子对比”卡片查看结果。服务端会先只读复验 SQLite 的完整性和迁移审计，再分别通过两套存储接口读取：

- 用户目录的管理员公开字段，不包含登录码摘要；
- 共享实验的管理员列表和审核历史；
- 能力复核列表；
- 模型设置最终公开结果，不包含 API Key。

状态含义：

- `全部一致`：四类查询返回值一致；SQLite 仍然只读；
- `检测到差异`：至少一类数据不同，页面显示该类 JSON/SQLite 记录数；
- `影子数据库无法读取`：文件不存在、格式错误或完整性/迁移审计失败；
- `尚未启用`：未设置 `WORD2HTML_SQLITE_SHADOW_FILE`。

管理 API 只返回状态、Schema 版本、检查时间和记录数量，不返回数据库路径、业务记录、摘要或底层错误。SQLite 不参与任何用户请求的返回或写入；影子异常不会中断 JSON 主存储。

影子数据库是一次快照。生成后只要 JSON 有新增账号、提交、审核或模型设置变更，对比就会显示差异，这是预期行为。应重新创建并验证备份，再生成一个新的影子文件；不要覆盖旧文件，也不要通过手工修改 SQLite 来追平数据。

## 安全与隐私

- 迁移工具不会读取操作系统中的 API Key 内容到数据库；模型设置只保存可信目录 ID；
- 用户登录码原文原本就不在 JSON 中，数据库只可能包含其摘要；
- 影子数据库包含账号、用户提交和审核记录，必须视为敏感业务数据保护；
- 不要把影子数据库提交到 Git，默认建议放在已忽略的 `.word2html-migrations/`；
- 迁移源必须是备份目录，不接受直接把线上数据目录当成已切换数据库使用。

## 下一阶段切换门槛

在应用改用 SQLite 前，还需要：

1. 已完成四类存储的只读适配、事务写接口和 JSON/SQLite 行为对等测试；
2. 已完成从 v1 影子文件复制晋升独立 v2 候选运行库，原影子保持不可变；具体见 [sqlite-runtime-store.md](sqlite-runtime-store.md)；
3. 在真实部署中完成一段只读影子观察并保存管理员检查记录；
4. 增加显式后端配置和 SQLite 就绪检查，在维护模式下再次备份、迁移、晋升并完成 API/浏览器回归后才允许切换；
5. 保留经过验证的 JSON 备份和回退说明，禁止自动切换、在线双写或自动删除。
