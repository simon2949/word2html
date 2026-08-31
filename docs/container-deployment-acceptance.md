# 容器部署验收记录

文档版本：0.1

## 自动配置验收

2026-08-30 执行：

```bash
npm run acceptance:deployment
```

验收通过，覆盖：

- `app`、`caddy`、`maintenance` 三个服务可由 Docker Compose 完整渲染；
- 应用使用非 root 用户、只读根文件系统、删除 capabilities 并启用 `no-new-privileges`；
- 应用端口仅在容器网络暴露，Caddy 等待健康检查并发布 HTTPS；
- 四类密钥只使用 `/run/secrets/*` 文件引用，Compose 响应不包含密钥值；
- 数据卷、卷内原子恢复子目录和独立备份卷已配置；
- 维护容器没有网络，默认执行备份；
- 应用和代理日志均设置容量轮转；
- Docker 构建上下文排除环境文件、真实数据、备份、迁移库和部署密钥。

文件型密钥、可信代理地址解析和模型匿名客户端哈希另有单元测试，覆盖直接环境变量优先、文件缺失/空值/过大拒绝、错误信息不暴露路径、无效转发地址回退，以及不信任代理时忽略转发头。

## 当前机器的镜像与隔离运行结果

2026-08-31，在 Docker daemon 正确读取 `192.168.1.20:7890` HTTP/HTTPS 代理后执行：

```bash
docker compose --env-file deploy/config.env build --pull app
```

真实镜像构建通过：成功拉取固定摘要的 `node:22-bookworm-slim` 基础镜像，生产前端完成构建，生产依赖审计为 0 个漏洞，生成 `word2html:local`。前端仍有单个压缩前 JavaScript chunk 超过 500 kB 的既有性能警告，不影响本轮部署正确性。

随后以临时容器进行隔离运行验收。容器只绑定 `127.0.0.1:15173`，使用只读根文件系统、删除全部 capabilities、`no-new-privileges`、非 root `node` 用户和临时内存数据目录，未开放公网端口、未创建业务数据卷。验收结果：

- 镜像声明用户为 `node`，运行 UID/GID 均为 1000，`/app` 不可写；
- 临时数据目录可由运行用户首次创建并以 `0600` 写入文件；
- 四个部署密钥文件均可读且非空，验收过程未输出密钥值；
- `/api/health` 与 `/api/ready` 均返回 200，JSON 主存储五项就绪检查全部通过；
- 成功拉取 `caddy:2-alpine`，Caddyfile 在无网络、只读临时容器内通过 `caddy validate`。

同日新增并执行：

```bash
npm run acceptance:container-recovery
```

容器恢复验收使用随机命名的独立数据卷和备份卷，在非 root、只读维护容器内完成测试账号写入、备份、SHA-256 清单验证、源数据修改、安全恢复和恢复前副本复验。六项检查全部通过，两个临时卷在结束时均已删除；没有挂载部署密钥、真实数据目录或正式业务卷。

随后执行生产镜像浏览器冒烟验收：

```bash
npm run acceptance:container-runtime
```

临时应用只绑定 `127.0.0.1` 随机端口，并使用隔离的无界面 Chrome 和数据卷。管理员通过文件型令牌成功登录，模型用量与脱敏运行告警接口均返回 200，告警状态为健康，响应和浏览器存储未发现令牌或敏感上下文。随后从生产页面的官方库打开“椭圆的焦点距离和”，确认两个焦点、两条距离线和场景校验状态；把长轴从 10 改为 12 后距离和同步变为 12，模型调用和 token 增量均为 0。临时容器、Chrome 配置和数据卷均在结束时删除。

临时应用容器在验收后删除。由于 `deploy/config.env` 中仍是示例域名 `lesson.example.edu`，本轮没有启动正式 Compose，也没有申请公网 HTTPS 证书。正式发布前仍须：

1. 将 `WORD2HTML_DOMAIN` 改为真实、已解析到部署主机的域名；
2. 启动完整 Compose 并验证外部 HTTPS；公开发布后再从外部网络重复一次健康、管理员登录和官方场景检查。

若其他部署主机同样需要代理，应在 Docker daemon 或 BuildKit 层配置代理并按组织变更流程重启相应服务；只给 `docker compose` 命令增加 `HTTP_PROXY` 不一定影响基础镜像解析。
