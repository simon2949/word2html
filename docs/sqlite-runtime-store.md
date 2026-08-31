# SQLite 可写运行库

文档版本：0.1

实现状态：Schema v2 晋升、四类事务写适配器、运行库复验、维护试运行、安全 JSON 回导、隔离故障演练和单实例 active HTTP 验收已完成。JSON 仍是默认主存储；SQLite 只在双重显式确认后承接单实例正常读写。

## 与影子数据库的区别

- Schema v1 影子数据库是不可变快照，用于证明某批 JSON 备份已被正确迁移；
- Schema v2 运行数据库是从一个已复验的 v1 影子文件复制并显式晋升得到的新文件；
- 晋升不会修改影子文件，也不会覆盖已有输出；
- v1 复验命令会拒绝 v2 运行库，v2 复验命令也会拒绝普通 SQLite 或 v1 影子库；
- 创建 v2 文件不等于应用已经切换；维护试运行需要显式设置 SQLite 后端并开启维护模式，active 读写还需要单独的模式值和第二确认值。

## 生成候选运行库

先按 [sqlite-migration.md](sqlite-migration.md) 生成并验证影子数据库，再执行：

```bash
npm run promote:sqlite-runtime -- \
  /srv/word2html/migrations/word2html-shadow.sqlite \
  /srv/word2html/migrations/word2html-runtime-candidate.sqlite
```

命令会先完整复验输入影子库，再复制到同目录临时文件，建立 `runtime_store_state`、设置 `user_version=2` 和运行库角色，复验成功后才原子发布输出。输出已存在时拒绝覆盖。

独立复验：

```bash
npm run verify:sqlite-runtime -- \
  /srv/word2html/migrations/word2html-runtime-candidate.sqlite
```

复验检查 Word2HTML `application_id`、Schema、存储角色、`PRAGMA integrity_check`、四类记录及历史数量、规范化列、当前记录摘要，以及分存储修订号与全局修订号。

## 已覆盖的存储接口

- 用户目录：列表、读取、创建、修改、重新签发和消费一次性登录码；
- 共享实验：公开/管理员列表、提交状态、首次提交、重复提交、修改版本关联、AI 预审排队/完成/失败和人工审核；
- 能力复核：完整列表和追加审核快照；
- 模型设置：公开目录、读取、保存、生成/预审配置解析和公开状态。

适配器通过可注入状态存储复用现有 JSON 实现的业务校验和返回语义。每次写入使用 `BEGIN IMMEDIATE`，在同一事务内重写对应业务表、更新规范化列、摘要、该存储修订号和全局修订号。任一步失败都会回滚业务记录和修订号。同一服务进程、同一运行库实例中的同类并发修改会排队执行，自动测试会确认不会丢失记录。

自动测试还会比较两种实现的校验错误、版本关联、审核历史、模型设置，以及 SQL 中途失败后的回滚结果。随机生成的账号 ID、登录码和审核事件 ID 只比较其语义，不要求两次独立调用生成相同随机值。

## 服务端维护试运行

候选库复验成功后，可以在停止旧进程的情况下设置：

```bash
export WORD2HTML_MAINTENANCE_MODE=true
export WORD2HTML_STORAGE_BACKEND=sqlite
export WORD2HTML_SQLITE_RUNTIME_FILE=/srv/word2html/migrations/word2html-runtime-candidate.sqlite
npm run start
```

启动时会完整复验 Schema v2；文件缺失、角色错误、摘要/规范化列或修订号不一致都会导致进程拒绝启动。维护试运行期间：

- `/api/health` 返回不含路径的 `storage.backend=sqlite` 和 `pilot=true`；
- `/api/ready` 检查四类 SQLite 读取和运行库完整性，但因维护模式仍返回 HTTP 503；
- 管理员可以建立短期会话并访问 `/admin/models` 查看四类记录和修订号；
- 所有业务 POST/PATCH/DELETE 仍由维护模式拒绝，不会修改候选库；
- 未开启维护模式、又没有完成 active 双重确认时，服务会在监听端口前拒绝启动。

回退只需停止试运行服务，恢复 `WORD2HTML_STORAGE_BACKEND=json`、关闭维护模式并重启。由于试运行从未接受业务写入，原 JSON 仍是完整回退源。

## 导出当前运行库并准备 JSON 回退

在服务已停止，或确认维护模式已经拒绝全部业务写入后执行：

```bash
npm run export:sqlite-runtime -- \
  /srv/word2html/migrations/word2html-runtime.sqlite \
  /srv/word2html/backups
```

命令读取四类 SQLite 状态，生成与现有恢复工具兼容的标准 JSON 备份，并立即再次读取 SQLite 和备份做独立对账。导出清单的 `sourceRuntime` 会绑定：

- `storageRole=runtime`；
- SQLite Schema 版本；
- 晋升时间；
- 导出时的全局修订号；
- 导出时间。

用户、共享实验和能力复核文件即使没有记录也会生成。若模型设置从未持久化、当前完全由环境变量派生，则不生成 `model-settings.json`，恢复后仍由部署环境给出默认值。API Key 和一次性登录码原文不会进入导出物。

保存命令返回的备份目录，然后独立复验：

```bash
npm run verify:sqlite-export -- \
  /srv/word2html/migrations/word2html-runtime.sqlite \
  /srv/word2html/backups/word2html-backup-某个时间
```

复验会同时检查备份字节、业务格式、记录数量、审核历史数量、规范化摘要和清单绑定的修订号。SQLite 在导出期间或导出后发生任何已提交业务修改，旧导出与当前运行库的修订号不再一致，复验会拒绝；应保持写流量停止并重新导出，不要修改清单。

需要切回 JSON 时，先保持服务停止或维护模式，再把刚刚复验通过的精确导出交给现有恢复命令：

```bash
npm run restore:data -- \
  /srv/word2html/backups/word2html-backup-某个时间 \
  /srv/word2html/data \
  /srv/word2html/pre-restore-backups \
  --maintenance-confirmed
```

先在副本目录完成一次恢复和启动级校验，再切换真实数据目录。`verify:data-backup` 只能证明备份自身未被改动；涉及 SQLite 当前状态时还必须先运行 `verify:sqlite-export`。

## 切换前隔离故障演练

在候选运行库通过复验后执行：

```bash
npm run rehearse:sqlite-cutover -- \
  /srv/word2html/migrations/word2html-runtime-candidate.sqlite
```

命令复制候选库到临时目录，在副本上完成真实事务写入和强制失败回滚，并验证损坏库启动拒绝、一次性登录码原文不落盘、SQLite→JSON 导出、JSON 恢复、再迁移晋升及源文件不变性。临时业务数据和数据库会自动删除，只保留权限为 `0600` 的结构化演练报告。

该报告的 `productionActivationChanged` 必须为 `false`。它证明数据层和回退链路具备切换前条件，但不代表正常 HTTP 写请求已经开放。完整检查项、报告字段和本地演练记录见 [sqlite-cutover-rehearsal.md](sqlite-cutover-rehearsal.md)。

## 单实例 active 模式

只有完成最终 JSON 备份、候选库复验、隔离故障演练和 active HTTP 验收后，才设置：

```bash
export WORD2HTML_STORAGE_BACKEND=sqlite
export WORD2HTML_SQLITE_RUNTIME_FILE=/srv/word2html/migrations/word2html-runtime.sqlite
export WORD2HTML_MAINTENANCE_MODE=false
export WORD2HTML_SQLITE_MODE=active-single-instance
export WORD2HTML_SQLITE_ACTIVATION_CONFIRM=confirm-single-instance-sqlite-writes
npm run start
```

后两个值构成第二层明确确认，确认值不是密钥。缺少任一项、值拼错，或者把 active 与维护模式同时打开，服务都会拒绝启动。成功后：

- `/api/health` 返回 `storage.active=true` 和 `mode=active-single-instance`；
- `/api/ready` 必须返回 HTTP 200；
- `/admin/models` 显示“SQLite 正在承接业务读写”及四类记录和修订号；
- JSON 配置路径不会承接旁路写入，不进行双写；
- 每次业务写入都在 SQLite 事务中更新对应存储修订号和全局修订号。

真实 HTTP 写入和 JSON 回退服务验收命令如下，固定使用候选库副本，不修改输入文件：

```bash
npm run acceptance:sqlite-active -- \
  /srv/word2html/migrations/word2html-runtime-candidate.sqlite
```

验收内容和本地报告见 [sqlite-active-http-acceptance.md](sqlite-active-http-acceptance.md)。

## 安全边界

- API Key 仍只从环境变量解析，不写入 SQLite；
- 一次性登录码只返回一次，数据库仅保存 SHA-256 摘要；
- 运行库包含账号、审核内容和登录码摘要，应与 JSON 数据目录、备份采用相同或更严格的文件权限；
- `source_documents` 和 `migration_audits` 保留为晋升来源证据，运行写入后的当前一致性由 `runtime_store_state` 验证；
- 不要手工编辑表、摘要或修订号，也不要把数据库提交到 Git。

## 单实例切换与回退门槛

切换真实单实例前必须逐项完成：

1. 在维护模式停止所有写流量并创建最终 JSON 备份；
2. 重新迁移、晋升并复验候选运行库；
3. 完成使用 SQLite 维护后端的服务端 API 与真实浏览器回归并保存演练记录；
4. [已完成] 使用绑定运行库修订号的导出工具生成 JSON，逐格式对账，并在隔离目录通过现有恢复器完成恢复演练；
5. [已完成前置演练] 在隔离副本完成真实写入、事务故障、损坏库拒绝、JSON 回退和再晋升，并保存结构化报告；
6. [已完成] 增加 active 双重确认，在隔离服务完成四类 HTTP 写接口、修订号对账、写后导出、JSON 回退服务和管理员页面真实浏览器验收；
7. 真实切换时停止旧进程，只启动一个 active 实例，并在放量前确认健康、就绪和管理员存储状态。

active 是显式人工切换，不设置自动切换或双写逻辑。

当前并发保证只面向单服务实例。不要让多个 Word2HTML 进程同时使用同一候选 SQLite 文件；多实例和高并发部署仍按路线图迁移 PostgreSQL，并用 Redis 承接短会话、计数和幂等状态。
