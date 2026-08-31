# 部署密钥目录

此目录只提交说明文件。实际部署前在该目录创建以下四个权限为 `0600` 的纯文本文件，每个文件只放一个值：

- `admin-token`：管理员登录令牌；
- `user-session-secret`：至少 12 个字符的用户会话签名密钥；
- `model-usage-hash-secret`：模型用量匿名标识的独立哈希密钥；
- `model-api-key`：当前平台模型 API Key。

除本说明外，该目录中的文件都被 `.gitignore` 和 `.dockerignore` 排除。不要把真实值写入 `config.env`、Compose、Dockerfile 或镜像。

如果当前进程已经设置 `MINIMAX_API_KEY` 或 `WORD2HTML_MODEL_API_KEY`，可以在项目根目录执行 `npm run create:deployment-secrets`：命令会随机生成前三项，并把当前模型 Key 写入第四项。它不会输出密钥值，也拒绝覆盖任何已有密钥文件。
