# 模型提供商配置

文档版本：0.1

实现状态：服务端统一配置、两类协议适配、可信模型目录、管理员可视化设置、连接测试、调用限流、每日熔断与用户当前页面临时自带 Key 已完成。

## 1. 配置边界

Word2HTML 的模型只生成受 LessonPlan Schema 约束的声明式规划。更换提供商不会放宽能力注册、表达式白名单、对象引用、数值边界或固定运行时校验。

浏览器只访问同源 `/api/generate` 和 `/api/health`，不直接接触平台 API Key。密钥只通过启动 Node 服务的操作系统环境注入，不写入 `.env.example`、`.env.local`、任何 `VITE_` 变量、场景包或独立 HTML。

## 2. 支持的协议

- `anthropic-compatible`：使用 Anthropic Messages/工具调用契约。MiniMax-M3 是当前默认配置。
- `openai-compatible`：使用 `POST {baseURL}/chat/completions` 和 function tools 契约。适用于符合该接口的托管模型或校内网关。

第一版不根据厂商名猜测协议。管理员必须明确选择协议，且 OpenAI 兼容端点必须支持 function tool call。

## 3. 生成模型环境变量

API Key 建议在启动命令之前从系统环境注入：

```bash
export WORD2HTML_MODEL_API_KEY='你的密钥'
npm run dev
```

| 环境变量 | 含义 | 默认值 |
| --- | --- | --- |
| `WORD2HTML_MODEL_PROVIDER` | 用于状态和记录的提供商名称 | `MiniMax` |
| `WORD2HTML_MODEL_PROTOCOL` | `anthropic-compatible` 或 `openai-compatible` | `anthropic-compatible` |
| `WORD2HTML_MODEL_BASE_URL` | 不含最终请求路径的基础地址 | MiniMax Anthropic 地址 |
| `WORD2HTML_MODEL_MODEL` | 提供商接口使用的模型 ID | `MiniMax-M3` |
| `WORD2HTML_MODEL_MAX_TOKENS` | 单次规划输出上限，限制在 256–4096 | `2048` |
| `WORD2HTML_MODEL_TEMPERATURE` | 温度，限制在 0–2 | `1` |
| `WORD2HTML_MODEL_TIMEOUT_MS` | 请求超时，限制在 10–600 秒 | `120000` |
| `WORD2HTML_MODEL_ALLOWED_HOSTS` | 可选的逗号分隔域名白名单 | 空 |
| `WORD2HTML_MODEL_INPUT_COST_PER_MILLION_USD` | 输入 token 估算价格，美元/百万 token | `0` |
| `WORD2HTML_MODEL_OUTPUT_COST_PER_MILLION_USD` | 输出 token 估算价格，美元/百万 token | `0` |

OpenAI 兼容示例：

```bash
export WORD2HTML_MODEL_API_KEY='你的密钥'
export WORD2HTML_MODEL_PROVIDER='校内模型网关'
export WORD2HTML_MODEL_PROTOCOL='openai-compatible'
export WORD2HTML_MODEL_BASE_URL='https://models.example.edu/v1'
export WORD2HTML_MODEL_MODEL='lesson-planner'
npm run dev
```

## 4. AI 预审独立档案

AI 预审使用同一适配层，但可以通过 `WORD2HTML_REVIEW_MODEL_*` 覆盖上表的任何字段。未覆盖的字段继承 `WORD2HTML_MODEL_*`，因此可以只单独设置预审模型和 token 上限：

```bash
export WORD2HTML_REVIEW_MODEL_MODEL='review-model'
export WORD2HTML_REVIEW_MODEL_MAX_TOKENS='1600'
```

如需分开计费，可额外设置 `WORD2HTML_REVIEW_MODEL_API_KEY`。预审的默认温度为 0.3，token 上限范围为 512–3072。

## 5. MiniMax 旧配置兼容

现有 `MINIMAX_API_KEY`、`MINIMAX_BASE_URL`、`MINIMAX_MODEL`、`MINIMAX_MAX_TOKENS`、`MINIMAX_REVIEW_MAX_TOKENS`、`MINIMAX_TIMEOUT_MS` 和 `MINIMAX_TEMPERATURE` 继续可用。当同一字段同时存在时，`WORD2HTML_MODEL_*` 优先。

因此已有的 MiniMax 启动方式无需立即修改：

```bash
export MINIMAX_API_KEY='你的密钥'
npm run dev
```

## 6. URL 安全约束

默认只允许 HTTPS，并拒绝包含用户名/密码的 URL、回环、局域网、链路本地和 IPv6 本地地址。这一限制用于防止日后可视化配置或用户自带 Key 把服务端变成任意网络请求代理。

本地私有网关只能由部署管理员显式设置 `WORD2HTML_MODEL_ALLOW_HTTP=true` 和/或 `WORD2HTML_MODEL_ALLOW_PRIVATE_BASE_URL=true`。公共部署不应启用这两项。

`GET /api/health` 只返回 `configured`、`provider`、`protocol`、`model`、`baseURL` 和档案名，不返回 API Key。

## 7. 调用控制与费用熔断

所有平台模型调用都经过同一个服务端控制器。浏览器保存一个不含个人信息的匿名设备 ID，服务端将其与网络来源通过带部署密钥的 SHA-256 摘要组合；管理页面和日志只使用摘要，不保存原始 IP 或设备 ID。

默认值如下，完整变量和说明见 `.env.example`：

- 10 分钟内：生成 8 次、编辑 12 次、纠错 8 次、AI 预审 20 次、连接测试 10 次；
- 单客户端并发 1，平台全局并发 4；
- 单客户端每日 50 次、250,000 token；平台每日 1,000 次、5,000,000 token；
- 平台每日费用熔断默认关闭。设置 `WORD2HTML_MODEL_PLATFORM_DAILY_COST_USD` 且为目录模型提供输入/输出价格后启用；
- 幂等结果默认保留 5 分钟。相同请求重复点击会复用结果，响应标记 `deduplicated`，新增模型调用和 token 均为 0；管理员主动连接测试使用唯一键，每次都会真实测试。

管理员登录 `/admin/models` 后可查看当日调用、token、估算费用、并发和熔断状态。日期按 UTC 切换。

当前计数和幂等缓存保存在 Node 单实例内存中，重启会清空。它适合当前单机 MVP；多进程或多实例公开部署前必须迁移到 Redis，不能把多个进程各自的上限当作平台总上限。详细设计见 [model-usage-control.md](model-usage-control.md)。

## 8. 当前完成与下一增量

已完成：统一环境变量契约、MiniMax 向后兼容、生成/预审双档案、Anthropic/OpenAI 兼容适配、公开脱敏状态、URL 基础安全校验、可信目录、管理员默认模型选择和极小工具调用连接测试。

R6.4 首批轻量登录已接入：平台额度按登录账号约束，游客临时自带 Key 继续按匿名设备与网络来源约束。账号签发和会话边界见 [lightweight-user-management.md](lightweight-user-management.md)，临时自带 Key 的详细边界见 [temporary-user-api-key.md](temporary-user-api-key.md)。

## 9. 可信模型目录

未配置目录时，管理员页面至少显示当前环境的生成和预审模型。需要在多个模型间切换时，由部署者设置 `WORD2HTML_MODEL_CATALOG_JSON`：

```bash
export WORD2HTML_MODEL_CATALOG_JSON='[
  {
    "id":"minimax-m3",
    "label":"MiniMax M3",
    "provider":"MiniMax",
    "protocol":"anthropic-compatible",
    "baseURL":"https://api.minimaxi.com/anthropic",
    "model":"MiniMax-M3",
    "apiKeyEnv":"MINIMAX_API_KEY",
    "inputCostPerMillion":0,
    "outputCostPerMillion":0
  },
  {
    "id":"school-gateway",
    "label":"校内模型网关",
    "provider":"校内模型网关",
    "protocol":"openai-compatible",
    "baseURL":"https://models.example.edu/v1",
    "model":"lesson-planner",
    "apiKeyEnv":"SCHOOL_MODEL_API_KEY"
  }
]'
export MINIMAX_API_KEY='密钥由部署平台注入'
export SCHOOL_MODEL_API_KEY='密钥由部署平台注入'
```

目录内不允许出现 `apiKey` 字段，只能使用 `apiKeyEnv` 引用操作系统环境变量。服务端启动时校验 ID、协议、HTTPS/私网边界、模型名和重复项；无效目录会阻止服务启动。

生产容器也可以为任意密钥环境变量增加 `_FILE` 后缀。例如目录使用 `SCHOOL_MODEL_API_KEY` 时，可设置 `SCHOOL_MODEL_API_KEY_FILE=/run/secrets/school-model-key`。如果直接环境变量和对应 `_FILE` 同时存在，直接环境变量优先；文件读取后，`*_FILE` 路径会从进程环境移除。密钥文件上限 16 KiB，缺失、空文件或无效内容都会在服务监听前拒绝启动，错误响应不会返回文件路径。

## 10. 管理员操作

1. 设置 `WORD2HTML_ADMIN_TOKEN` 并启动 `npm run dev`。
2. 访问 `http://127.0.0.1:5173/admin/models`。
3. 登录后启用目录内模型，分别选择“场景生成”和“AI 预审”默认模型，再保存。
4. 在“今日模型用量”查看平台调用、token、估算费用、并发和熔断状态。
5. 按需点击连接测试。测试会产生一次极小工具调用及少量 token，页面会显示延迟和返回的 token 用量。

管理员保存的 `.word2html-data/model-settings.json` 只包含启用 ID、生成 ID、预审 ID 和更新时间。不保存密钥、Base URL 或任何模型输入/输出。

真实浏览器验收需传入与当前服务一致的管理员令牌：

```bash
WORD2HTML_ADMIN_TOKEN='与服务端相同的管理员令牌' \
  npm run acceptance:model-settings -- 9333 http://127.0.0.1:5173/admin/models
```

验收脚本只测试登录、显示、启用状态保存、脱敏响应和文字可读性，不会点击真实模型连接测试，因此不产生模型 token。
