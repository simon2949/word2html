# 单实例生产运行与数据备份

文档版本：0.1

实现状态：R6.5 单实例运行保障、离线安全恢复、SQLite 只读影子对比、事务运行库、安全回导、故障演练、显式 active 切换、首批结构化告警和 Docker Compose 生产打包已完成；多实例存储、自动故障切换和外部告警通知仍待后续增量。

## 存活与就绪

- `GET /api/health` 是进程存活和公开能力检查，同时返回不含密钥的模型状态；
- `GET /api/ready` 是数据依赖就绪检查，验证实验目录、能力复核、模型设置和用户目录能否读取并通过各自格式校验；
- 全部可用时 `/api/ready` 返回 HTTP 200 和 `ok: true`；任一依赖不可用时返回 HTTP 503；
- 就绪响应只包含 `ready` 或 `unavailable`，不会返回绝对文件路径、JSON 内容或底层异常。

反向代理或容器平台可以使用 `/api/health` 作为存活探针、`/api/ready` 作为就绪探针。不要因为模型供应商临时不可达而重启整个应用；模型可用性由健康响应里的公开模型状态单独表达。

## 结构化日志与运行告警

服务端将启动停止、存储就绪、HTTP 500、模型故障、平台熔断和进程异常输出为逐行 JSON，并递归屏蔽请求正文、提示词、密钥、令牌、Cookie、登录码和本机路径。`/api/health` 只返回聚合状态；管理员登录 `/admin/models` 后可查看有限内存中的脱敏事件、合并次数和恢复状态。

默认保留最近 200 条，可用 `WORD2HTML_OPERATIONAL_EVENT_LIMIT` 调整为 20–2000。内存事件随重启清空，因此生产环境仍应由 systemd、Docker 或组织日志平台收集 stdout/stderr。当前不会向外部服务发送内容，也不会自动邮件或 Webhook 通知。字段、事件覆盖和告警建议见 [operational-observability.md](operational-observability.md)。

## 安全响应头

API 响应和生产静态资源包含防嵌入、内容类型嗅探防护、来源策略、同源资源策略及摄像头/麦克风/定位权限禁用。生产 HTML 额外使用 CSP，脚本来源和网络连接只允许同源。

当前前端使用 Ajv 在浏览器启动时编译固定的本地 JSON Schema，因此 `script-src` 暂时包含 `unsafe-eval`；这不会允许外部脚本来源，但仍是需要收紧的兼容例外。后续应在构建阶段预编译验证器，然后移除 `unsafe-eval`。

生产环境应由 Nginx、Caddy、Traefik 或托管平台终止 HTTPS，并设置：

```bash
export WORD2HTML_SECURE_COOKIES=true
```

HSTS 应由确认全站长期使用 HTTPS 的最外层反向代理设置，应用本身不擅自发送，以免本地或错误域名配置被浏览器长期锁定。

## 容器化单实例部署

仓库根目录提供多阶段 `Dockerfile`、`compose.yaml` 和 Caddy 配置。应用以非 root 用户运行，只在容器网络暴露端口；Caddy 发布 80/443 并等待健康检查。模型 Key、管理员令牌和两类会话/哈希密钥通过只读文件注入，不进入镜像或 Compose 渲染结果。默认 JSON 数据、备份和 Caddy 状态使用独立持久卷。

部署前置条件、密钥准备、启动、备份、恢复、升级和禁止删除卷的要求见 [container-deployment.md](container-deployment.md)。生产前应执行 `npm run acceptance:deployment`；该命令只验证配置，不会启动服务或修改 Docker 卷。

## 创建备份

默认数据文件均在 `.word2html-data`，建议先停止应用或切换到维护状态，再执行：

```bash
npm run backup:data
```

也可以传入数据目录和备份根目录：

```bash
npm run backup:data -- /srv/word2html/data /srv/word2html/backups
```

命令仅复制数据目录第一层已有的 `.json` 文件。每个文件必须能够解析为 JSON，否则备份失败。备份过程会：

1. 写入权限为 `0700` 的临时目录；
2. 以 `0600` 写入每个数据文件；
3. 生成记录文件名、字节数和 SHA-256 的 `manifest.json`；
4. 立即重新读取并验证全部文件；
5. 全部通过后，把临时目录原子重命名为正式备份目录。

操作系统环境中的模型 API Key、管理员令牌和会话签名密钥不在 JSON 数据目录中，因此不会进入备份。用户目录包含登录码摘要和账号信息，审核目录包含用户提交内容，备份本身仍应按敏感业务数据保护。

## 验证备份

```bash
npm run verify:data-backup -- /srv/word2html/backups/word2html-backup-2026-01-01_00-00-00-000-abcdef
```

验证会检查清单格式、文件集合、字节数、SHA-256 和 JSON 语法。任何文件被修改、缺失或额外加入都会失败。

## 安全恢复

恢复必须在停止服务后执行，或者先以维护模式重启服务：

```bash
export WORD2HTML_MAINTENANCE_MODE=true
npm run start
```

维护模式允许读取页面和数据，但会让 `/api/ready` 返回 HTTP 503，并以 `maintenance-mode` 拒绝所有 API 写操作。确认流量已经摘除且没有写请求后，在另一个终端执行：

```bash
npm run restore:data -- \
  /srv/word2html/backups/word2html-backup-某个时间 \
  /srv/word2html/data \
  /srv/word2html/pre-restore-backups \
  --maintenance-confirmed
```

`--maintenance-confirmed` 是必需的人工确认。命令无法替管理员判断线上进程是否真的停止或进入维护状态；没有该参数时恢复会直接拒绝，且不会写入目标目录。

恢复顺序如下：

1. 验证备份清单、文件集合、字节数、SHA-256 和 JSON 语法；
2. 根据文件内的 `format` 调用实验目录、能力复核、模型设置或用户目录的真实业务校验器；未知格式和重复格式都会拒绝；
3. 如果目标目录已有 JSON 数据，先在第三个参数指定的位置创建一份新的可验证备份；
4. 把恢复文件写入目标同级的旁路目录，并再次执行业务校验；
5. 将原目标目录重命名为 `.目标名.pre-restore-*`，再把旁路目录原子切换为目标目录；
6. 对新目标进行第三次业务校验；如失败，将原目录切换回来，失败数据保留在 `.目标名.failed-restore-*` 供排查。

成功结果会返回：

- `currentBackupDirectory`：切换前自动创建的当前数据备份；
- `previousDirectory`：原目标目录的完整保留副本；
- `restored`：已验证的业务格式和记录数量。

命令不会自动删除这些回滚材料。管理员应在正常模式重启、访问 `/api/ready`、抽查用户和审核记录并完成一次模型外的功能验收后，再按组织的数据保留制度处理旧目录。

当前恢复仅面向单实例 JSON 数据目录。若四个数据文件通过环境变量分散到不同目录，应先统一制作和验证快照，不要把单目录恢复命令分别运行成多个无法保证一致性的步骤。

## SQLite 影子迁移

SQLite 首批生成并审计影子数据库，也可通过 `WORD2HTML_SQLITE_SHADOW_FILE` 在管理员模型设置页进行四类存储的只读对比；应用仍以 JSON 为唯一主存储。影子快照落后于 JSON 时会显示差异，异常不会影响用户请求。具体流程和切换边界见 [sqlite-migration.md](sqlite-migration.md)。不要把“全部一致”理解为已经完成存储切换。

开发和迁移演练可以把已验证影子复制晋升为独立的 Schema v2 可写候选库，并运行四类事务写适配器测试；命令和安全边界见 [sqlite-runtime-store.md](sqlite-runtime-store.md)。生成候选库本身不会改变线上后端。

当前服务端支持 SQLite 维护模式试运行，以及经过双重确认的单实例 active 模式。维护试运行必须同时设置 `WORD2HTML_STORAGE_BACKEND=sqlite`、`WORD2HTML_SQLITE_RUNTIME_FILE` 和 `WORD2HTML_MAINTENANCE_MODE=true`；active 模式的完整配置与回退要求见下文。生成候选库本身不会改变当前后端。

## SQLite 当前状态回导为 JSON

如果未来 SQLite 接受过业务写入，不能直接恢复它晋升前的旧 JSON。先停止服务或阻断全部业务写入，再导出并绑定当前修订号：

```bash
npm run export:sqlite-runtime -- \
  /srv/word2html/migrations/word2html-runtime.sqlite \
  /srv/word2html/backups

npm run verify:sqlite-export -- \
  /srv/word2html/migrations/word2html-runtime.sqlite \
  /srv/word2html/backups/word2html-backup-某个时间
```

导出使用标准备份目录格式，因此复验通过后可直接交给 `restore:data`。清单额外记录 SQLite Schema、晋升时间、导出时间和全局修订号；校验会比较四类记录、审核历史和规范化摘要。运行库修订号变化、文件篡改、格式缺失或数据差异都会拒绝回导。

推荐先恢复到隔离副本目录并执行启动级校验，确认后再恢复真实 JSON 数据目录。模型密钥仍只来自环境变量，不进入导出；未持久化的环境默认模型设置不会生成空文件。完整步骤和当前切换限制见 [sqlite-runtime-store.md](sqlite-runtime-store.md)。

## SQLite 切换前隔离演练

每次准备新的生产候选库时执行：

```bash
npm run rehearse:sqlite-cutover -- \
  /srv/word2html/migrations/word2html-runtime-candidate.sqlite \
  /srv/word2html/migrations/rehearsals/本次演练报告.json
```

演练只操作候选库的临时副本，覆盖正常事务写入、强制写入失败回滚、损坏库启动拒绝、JSON 回导与恢复、再晋升和源文件不变性。全部通过后生成结构化报告；任何检查失败都会返回非零并且不生成“通过”报告。详细检查项见 [sqlite-cutover-rehearsal.md](sqlite-cutover-rehearsal.md)。

这仍是切换前演练，不是生产激活命令。还应继续执行 `npm run acceptance:sqlite-active`，确认真实 HTTP 写入和 JSON 回退服务；验收说明见 [sqlite-active-http-acceptance.md](sqlite-active-http-acceptance.md)。

## 显式切换到 SQLite active

只适用于单实例。完成最终 JSON 备份、候选库复验和两类演练后，停止旧服务并设置：

```bash
export WORD2HTML_STORAGE_BACKEND=sqlite
export WORD2HTML_SQLITE_RUNTIME_FILE=/srv/word2html/migrations/word2html-runtime.sqlite
export WORD2HTML_MAINTENANCE_MODE=false
export WORD2HTML_SQLITE_MODE=active-single-instance
export WORD2HTML_SQLITE_ACTIVATION_CONFIRM=confirm-single-instance-sqlite-writes
npm run start
```

确认 `/api/health` 的 `storage.active=true`、`/api/ready` 返回 HTTP 200，并在 `/admin/models` 确认 SQLite 活动状态后再恢复流量。不要同时启动 JSON 和 SQLite 写实例，也不要让两个进程打开同一 SQLite 文件。

回退时必须先停止流量和 active 进程，然后依次执行 `export:sqlite-runtime`、`verify:sqlite-export` 和 `restore:data`。最后设置 `WORD2HTML_STORAGE_BACKEND=json`，清除 SQLite mode/确认变量并重启；不得直接恢复晋升前的旧 JSON 快照，否则会丢失 active 阶段写入。

## 旧版共享实验目录升级

历史 `lesson-plan-0.6`–`1.3` 场景包虽然可由浏览器导入，但服务端共享目录只接受当前版本。升级前必须先创建并验证备份：

```bash
npm run backup:data
npm run upgrade:lesson-directory -- .word2html-data/lesson-directory.json
npm run upgrade:lesson-directory -- \
  .word2html-data/lesson-directory.json \
  --in-place .word2html-backups/word2html-backup-某个时间
```

第一条升级命令只检查并报告，不写文件。`--in-place` 会确认当前文件与给定备份摘要完全一致，在旁路文件把兼容旧信封升级为当前 API 版本、重新计算 `contentHash`，通过真实目录校验后再原子替换。条目 ID、状态、时间、版本关联和审核历史保持不变；不在兼容范围或当前 Schema 已不接受的计划会拒绝升级。
