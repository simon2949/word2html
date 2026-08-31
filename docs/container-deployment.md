# Docker Compose 单实例部署

文档版本：0.1

实现状态：首批生产打包已完成，包括非 root 应用镜像、只读根文件系统、Caddy 自动 HTTPS、文件型密钥、健康检查、日志轮转、持久数据卷和隔离维护容器。当前仍是单实例方案，不支持水平扩容或自动故障切换。

自动配置验收、真实镜像构建和隔离运行记录见 [container-deployment-acceptance.md](container-deployment-acceptance.md)。当前机器尚未使用真实域名启动完整 Compose 或验证公网 HTTPS，因此隔离运行通过不等于生产域名发布已经完成。

## 架构与边界

默认 Compose 包含三个服务：

- `app`：以 `node` 用户直接运行生产服务，只在内部网络暴露 5173；
- `caddy`：唯一发布宿主机 80/443，等待应用健康后反向代理并自动申请 HTTPS 证书；
- `maintenance`：默认不启动，仅在显式指定时执行备份、验证或恢复，没有网络访问。

业务数据保存在 `word2html-data` 卷的 `data` 子目录。卷根本身保持稳定，使恢复工具可以在同一文件系统中原子重命名和回滚 `data` 子目录。Caddy 证书、配置状态和业务备份使用独立卷。

应用容器根文件系统只读、删除全部 Linux capabilities、启用 `no-new-privileges`，并限制进程数量。密钥目录只读挂载到 `/run/secrets`；应用启动后通过 `*_FILE` 读取，Compose 和镜像不包含密钥值。

Compose 只在应用端口未发布、请求必经同一 Caddy 的条件下设置 `WORD2HTML_TRUST_PROXY=true`。应用使用 `X-Forwarded-For` 最后一项作为登录、提交和匿名模型限流地址，并拒绝无效 IP。直接暴露应用端口时不得启用该选项，否则客户端可以伪造限流来源。

## 部署前准备

要求：

- 一台能够运行 Docker Engine 和 Docker Compose v2 的 Linux 主机；
- 一个已经解析到主机公网地址的域名；
- 公网能够访问 TCP 80 和 443，主机能够访问所选模型 API；
- 生产环境只运行一个 `app` 实例。

复制非敏感配置：

```bash
cp deploy/config.env.example deploy/config.env
```

编辑 `deploy/config.env`，至少设置真实域名。不要在其中写 API Key 或管理员令牌。若 `WORD2HTML_BACKUP_DIRECTORY` 使用宿主机绝对路径，应提前创建目录并让 UID/GID 1000 可写，例如：

```bash
sudo install -d -m 700 -o 1000 -g 1000 /srv/word2html/backups
```

在 `deploy/secrets` 创建四个文件：

```bash
umask 077
openssl rand -base64 48 | tr -d '\n' > deploy/secrets/admin-token
openssl rand -base64 48 | tr -d '\n' > deploy/secrets/user-session-secret
openssl rand -base64 48 | tr -d '\n' > deploy/secrets/model-usage-hash-secret
```

把模型 API Key 单独写入 `deploy/secrets/model-api-key`，然后检查：

```bash
chmod 600 deploy/secrets/admin-token \
  deploy/secrets/user-session-secret \
  deploy/secrets/model-usage-hash-secret \
  deploy/secrets/model-api-key
```

四个文件都只放一个值。除说明文件外，`deploy/secrets` 已同时被 Git 和 Docker 构建上下文排除。

## 构建与启动

先执行不启动容器的部署配置验收：

```bash
npm run acceptance:deployment
docker compose --env-file deploy/config.env config --quiet
```

构建并启动：

```bash
docker compose --env-file deploy/config.env build --pull
docker compose --env-file deploy/config.env up -d
docker compose --env-file deploy/config.env ps
```

Caddy 首次申请证书需要 DNS 和 80/443 可达。服务就绪后检查：

```bash
curl -fsS https://你的域名/api/health
curl -fsS https://你的域名/api/ready
```

然后访问 `https://你的域名/admin/models`，使用 `admin-token` 文件中的值登录，确认模型、运行告警、存储和用量状态。连接测试会产生少量模型 token。

查看日志：

```bash
docker compose --env-file deploy/config.env logs --tail=200 app caddy
```

应用日志和 Caddy 访问日志都是逐行 JSON，Docker 本地日志驱动限制为单文件 10 MB、最多 5 个文件。长期保留或主动通知仍应接入组织已有日志平台，且不得取消应用侧脱敏。

## 一致性备份

当前 JSON 存储是单实例文件存储。为避免四个文件在写入期间形成不一致快照，推荐短暂停止公开服务后备份：

```bash
docker compose --env-file deploy/config.env stop caddy app
docker compose --env-file deploy/config.env --profile maintenance run --rm maintenance
docker compose --env-file deploy/config.env up -d app caddy
```

命令输出会给出 `word2html-backup-*` 目录。若配置了宿主机绝对备份目录，应把该目录继续同步到另一台主机或对象存储；与业务数据位于同一块磁盘不能算灾难恢复备份。

复验某份备份：

```bash
docker compose --env-file deploy/config.env --profile maintenance run --rm maintenance \
  npm run verify:data-backup -- \
  /var/backups/word2html-volume/backups/word2html-backup-具体时间
```

首次发布前或修改备份恢复逻辑后，可运行不接触真实业务卷的容器恢复演练：

```bash
npm run acceptance:container-recovery
```

该命令使用随机命名的临时数据卷和备份卷，依次执行写入、备份、清单验证、数据修改、恢复、恢复前副本验证，并在结束时删除临时卷。它要求本机已经构建 `word2html:local`；也可通过 `WORD2HTML_IMAGE` 指定待发布镜像。

还可以在不启动 Caddy、不开放公网端口的情况下验收生产镜像中的管理员登录、脱敏运行告警和官方场景零模型调用路径：

```bash
npm run acceptance:container-runtime
```

该命令只把临时应用端口绑定到 `127.0.0.1` 的随机端口，默认从 `deploy/secrets/admin-token` 读取浏览器验收所需令牌，使用隔离的临时数据卷，并在结束时删除临时容器、Chrome 配置和数据卷。若 `19333` 已被其他 Chrome 调试会话占用，可追加其他端口，例如 `npm run acceptance:container-runtime -- 19334`。

## 安全恢复

恢复前停止服务并先验证目标备份：

```bash
docker compose --env-file deploy/config.env stop caddy app
docker compose --env-file deploy/config.env --profile maintenance run --rm maintenance \
  npm run verify:data-backup -- \
  /var/backups/word2html-volume/backups/word2html-backup-具体时间
```

确认无请求后执行：

```bash
docker compose --env-file deploy/config.env --profile maintenance run --rm maintenance \
  npm run restore:data -- \
  /var/backups/word2html-volume/backups/word2html-backup-具体时间 \
  /var/lib/word2html-volume/data \
  /var/backups/word2html-volume/restore-rollbacks \
  --maintenance-confirmed
```

恢复工具会在卷内旁路校验、保留旧 `data` 目录并原子切换；失败时自动切回。成功后重新启动并检查：

```bash
docker compose --env-file deploy/config.env up -d app caddy
curl -fsS https://你的域名/api/ready
```

## 升级与回退

升级前先完成一致性备份，并使用新镜像标签保留旧镜像：

```bash
WORD2HTML_IMAGE=word2html:新版本 \
  docker compose --env-file deploy/config.env build --pull app maintenance
WORD2HTML_IMAGE=word2html:新版本 \
  docker compose --env-file deploy/config.env up -d app caddy
```

检查健康、管理员页面和一个不调用模型的官方场景后再清理旧镜像。应用回退时重新指定旧镜像标签；若升级同时改变了数据格式，还必须按上一节恢复与旧版本匹配的已验证备份。

`docker compose down` 默认保留命名卷，但不要执行 `docker compose down -v`，它会删除业务数据、备份和 Caddy 证书卷。删除卷不属于常规卸载或回退步骤。

## 当前限制

- 不执行 `docker compose up --scale app=2`；JSON 和 SQLite active 均只允许一个写实例；
- Compose 首批固定使用 JSON 主存储；SQLite active 切换仍需单独完成候选库、演练和回退准备；
- Caddy 自动 HTTPS 适合直接管理域名证书；若组织已有负载均衡器，应由最外层统一终止 HTTPS，并相应调整 Compose 入口；
- 当前没有 Kubernetes 清单、PostgreSQL、Redis、跨实例任务队列或自动外部告警。
