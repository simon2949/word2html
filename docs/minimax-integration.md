# MiniMax-M3 接入说明

## 架构

浏览器不直接访问 MiniMax，也不接触 API Key：

```text
浏览器 POST /api/generate
        ↓
Word2HTML Node 服务
        ↓
MiniMax Anthropic 兼容接口
        ↓
紧凑 LessonPlan JSON Schema 校验
        ↓
浏览器使用审核模板、安全函数或时间实验运行时实例化 LessonScene
        ↓
语义、数学与渲染能力校验
```

MiniMax 官方 Anthropic 兼容 Base URL 为 `https://api.minimaxi.com/anthropic`，当前模型名为 `MiniMax-M3`。

## 环境变量

API Key 只通过启动 Word2HTML 服务的操作系统进程环境传入：

```bash
export MINIMAX_API_KEY='你的密钥'
npm run dev
```

Node 服务使用 `process.env.MINIMAX_API_KEY` 读取它，这与 Python 中的 `os.getenv("MINIMAX_API_KEY")` 等价。不要把 API Key 写入 `.env.example`、`.env.local`、前端代码或任何 `VITE_` 变量。

以下可选的非敏感配置也通过系统环境传入：

```dotenv
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic
MINIMAX_MODEL=MiniMax-M3
MINIMAX_MAX_TOKENS=2048
MINIMAX_TIMEOUT_MS=120000
MINIMAX_TEMPERATURE=1
```

系统环境中的 API Key 仅由 Node 服务读取，不会进入 Vite 浏览器构建。部署时可通过 systemd、Docker、容器平台或云服务的 Secret/Environment 配置注入同名变量。

## 本地启动

```bash
npm run dev
```

该命令同时启动 Vite 中间件和同源 API。只运行 `npm run dev:vite` 时可以编辑已有场景，但模型状态接口和生成接口不可用。修改服务端源码或生成协议后，需要按 `Ctrl+C` 停止旧进程，再重新执行 `npm run dev`；前端会通过 `apiVersion` 检测旧服务并给出重启提示。

生产运行：

```bash
npm run build
npm start
```

## API

### `GET /api/health`

返回服务和模型配置状态，但不返回 API Key。

### `POST /api/generate`

请求：

```json
{
  "prompt": "演示二次函数顶点随参数变化"
}
```

成功响应包含：

- `plan`：LessonPlan 0.1，包含模板 ID、学科、主题、少量参数覆盖、声明式 `functionSpec` 或 `experimentSpec`，以及原因；
- `usage`：输入、缓存输入和输出 token；
- `usage.modelCalls`：本次生成实际模型调用次数；`usage.repaired` 表示是否经过自动纠错；
- `provider`：模型供应商及模型名。

服务端通过强制工具调用要求 MiniMax 返回紧凑 LessonPlan，并执行 JSON Schema 与状态一致性校验。浏览器只允许把计划映射到已安装的本地模板、`math.function.generic-2d` 或 `experiment.motion.point-2d` 安全运行时，然后对 LessonScene 再执行表达式白名单、对象引用、数值范围和渲染能力校验。函数和实验表达式都不会通过 `eval` 或 `new Function` 执行。

首次规划失败时，系统先执行无歧义的本地规范化；仍未通过服务端校验时，服务端把精确错误作为工具结果反馈给 MiniMax。若服务端计划通过、但浏览器的数学或物理校验失败，浏览器将上一版已验证结构和错误发送到同源服务进行一次纠错。整个用户生成流程最多调用模型两次；第二次仍失败时保留原场景。两次调用的 token 会合并显示，纠错成功的场景按原始规范化描述缓存，之后相同请求为 0 token。

相同规范化请求会复用浏览器中已校验的场景，不再次调用模型；缓存最多保留最近 30 项。当前规划输出上限为 2048 token，这是复杂多物体规划的容量上限而非固定消耗；已命中的模板请求、所有参数与显示修改完全在本地完成，模型 token 为 0。

早期真实烟雾测试中，完整 LessonScene 方案需要 4391 个输出 token，而紧凑模板 LessonPlan 对同类目标只需要 168 个输出 token。2026-08-16 的通用函数测试使用输入 1277、缓存输入 132、输出 346 token；加入速度与加速度矢量后的自由落体测试使用输入 2254、缓存输入 128、输出 825 token。2026-08-19 的双球弹性碰撞成功规划使用输入 2629、缓存输入 128、输出 1560 token；其中 `tc`、`v1`、`v2` 作为派生量在多个位置和矢量表达式间复用。同日的小角度单摆计划使用输入 3022、缓存输入 128、输出 1129 token，并返回可验证的绳约束；一次真实纠错使用输入 3587、缓存输入 128、输出 464 token，成功移除了自由落体中错误的恒长绳约束。相同规范化描述命中浏览器缓存后为 0 token。数值会随输入与模型版本波动。

## 当前能力边界

当前浏览器完整实现 `math.conic.ellipse-focus-sum`、`math.function.quadratic-vertex`、`math.function.generic-2d` 与 `experiment.motion.point-2d`。时间实验承接最多 4 个可写成 `x(t)`/`y(t)` 的质点，限制为 6 个参数、4 个可复用测量量、4 个质点矢量、4 个绳/弹簧约束和 60 秒；自由落体、抛体、一维完全弹性碰撞、小角度单摆和水平弹簧振子已经覆盖。二维接触碰撞、电路、化学、地理、隐式曲线和三维图形目前返回 `unsupported`。

## 协议升级排查

如果页面提示 `parameters/A/value must be number`、`editable must be boolean`，或出现“MiniMax 返回的场景未通过 LessonScene Schema”，说明浏览器连接的仍是升级前启动的旧 Node 进程。停止该进程并重新运行 `npm run dev`，随后刷新浏览器。当前接口的 `/api/health` 会返回 `apiVersion: "lesson-plan-0.6"`；前端发现版本缺失或不一致时会直接提示重启，不再继续解析旧响应。
