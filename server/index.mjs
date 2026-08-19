import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GENERATION_API_VERSION,
  editLessonPlan,
  generateLessonPlan,
  publicModelStatus,
  repairLessonPlan,
} from './minimax.mjs'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const production = process.argv.includes('--production')

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const host = argument('--host', process.env.HOST || '127.0.0.1')
const port = Number(argument('--port', process.env.PORT || '5173'))
const maxBodyBytes = 128 * 1024

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBodyBytes) throw new Error('请求内容过大。')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return JSON.parse(text || '{}')
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health' && req.method === 'GET') {
    json(res, 200, {
      ok: true,
      apiVersion: GENERATION_API_VERSION,
      capabilities: [
        'reviewed-templates',
        'generic-function-2d',
        'time-experiment-point-2d',
        'time-experiment-vectors',
        'time-experiment-distance-lines',
        'time-experiment-label-modes',
        'time-experiment-multi-body',
        'time-experiment-constraints',
        'derived-metric-reuse',
        'contextual-scene-edit',
      ],
      model: publicModelStatus(),
    })
    return true
  }

  if (url.pathname === '/api/generate' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
      if (!prompt) {
        json(res, 400, { error: '请输入教学内容描述。' })
        return true
      }
      if (prompt.length > 12000) {
        json(res, 400, { error: '教学内容描述不能超过 12000 个字符。' })
        return true
      }
      const correction = body.correction
      const edit = body.edit
      const result = correction !== undefined
        ? await repairLessonPlan(
            prompt,
            correction && typeof correction === 'object' ? correction.previousPlan : undefined,
            correction && typeof correction === 'object' ? correction.validationError : undefined,
            {
              basePlan: correction && typeof correction === 'object'
                ? correction.basePlan
                : undefined,
            },
          )
        : edit !== undefined
          ? await editLessonPlan(
              prompt,
              edit && typeof edit === 'object' ? edit.basePlan : undefined,
            )
          : await generateLessonPlan(prompt)
      json(res, 200, result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MiniMax-M3 生成失败。'
      const missingConfig = message.includes('MINIMAX_API_KEY')
      json(res, missingConfig ? 503 : 502, { error: message })
    }
    return true
  }

  if (url.pathname.startsWith('/api/')) {
    json(res, 404, { error: 'API 路径不存在。' })
    return true
  }
  return false
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

async function serveProductionFile(req, res, url) {
  const distRoot = resolve(projectRoot, 'dist')
  const pathname = decodeURIComponent(url.pathname)
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  let filePath = resolve(distRoot, requested)
  if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${sep}`)) {
    json(res, 403, { error: '禁止访问该路径。' })
    return
  }

  try {
    if (!(await stat(filePath)).isFile()) throw new Error('not a file')
  } catch {
    filePath = resolve(distRoot, 'index.html')
  }

  try {
    const content = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    })
    if (req.method === 'HEAD') res.end()
    else res.end(content)
  } catch {
    json(res, 500, { error: '请先运行 npm run build。' })
  }
}

let vite
if (!production) {
  const { createServer: createViteServer } = await import('vite')
  vite = await createViteServer({
    root: projectRoot,
    server: { middlewareMode: true },
    appType: 'spa',
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  try {
    if (await handleApi(req, res, url)) return
    if (vite) {
      vite.middlewares(req, res, (error) => {
        if (error) {
          vite.ssrFixStacktrace(error)
          json(res, 500, { error: '开发服务器渲染失败。' })
        }
      })
      return
    }
    await serveProductionFile(req, res, url)
  } catch {
    json(res, 500, { error: '服务器处理请求时发生错误。' })
  }
})

server.listen(port, host, () => {
  const model = publicModelStatus()
  console.log(`Word2HTML ${production ? 'production' : 'development'} server: http://${host}:${port}`)
  console.log(`MiniMax: ${model.configured ? `${model.model} ready` : 'not configured'}`)
})

async function shutdown() {
  await vite?.close()
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
