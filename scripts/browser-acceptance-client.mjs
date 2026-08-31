import { spawn } from 'node:child_process'
import { accessSync, constants, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function normalizePageOrigin(rawPageOrigin) {
  const markdownLink = rawPageOrigin.match(/^\[[^\]]*\]\((https?:\/\/[^)]+)\)$/)
  const pageOrigin = markdownLink?.[1] ?? rawPageOrigin
  try {
    new URL(pageOrigin)
  } catch {
    throw new Error(`应用地址格式不正确：${rawPageOrigin}\n请使用纯 URL，例如 http://127.0.0.1:5173`)
  }
  return pageOrigin
}

export async function connectAcceptanceBrowser({
  debugPort = Number(process.argv[2] ?? 9333),
  rawPageOrigin = process.argv[3] ?? 'http://127.0.0.1:5173',
} = {}) {
  const pageOrigin = normalizePageOrigin(rawPageOrigin)
  let ownedChrome = null
  let chromeProfileDirectory = null
  let cleanedUp = false

  function cleanupOwnedChrome() {
    if (cleanedUp) return
    cleanedUp = true
    ownedChrome?.kill('SIGTERM')
    if (chromeProfileDirectory) {
      try {
        rmSync(chromeProfileDirectory, { recursive: true, force: true })
      } catch {
        // Chrome 退出后由系统清理临时目录。
      }
    }
  }
  process.once('exit', cleanupOwnedChrome)

  async function fetchTargets() {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`)
    if (!response.ok) throw new Error(`Chrome 调试接口返回 HTTP ${response.status}`)
    return response.json()
  }

  async function waitForTarget(maxAttempts = 1) {
    let lastError
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const targets = await fetchTargets()
        const page = targets.find((target) => target.type === 'page' && target.url.startsWith(pageOrigin))
        if (page?.webSocketDebuggerUrl) return { targets, page }
        lastError = new Error(`调试浏览器中没有打开 ${pageOrigin}`)
      } catch (error) {
        lastError = error
      }
      if (attempt + 1 < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return { targets: null, page: null, error: lastError }
  }

  let targetResult = await waitForTarget()
  if (!targetResult.targets) {
    const chromeCandidates = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    const chromeBinary = chromeCandidates.find((candidate) => {
      try {
        accessSync(candidate, constants.X_OK)
        return true
      } catch {
        return false
      }
    })
    if (!chromeBinary) {
      throw new Error(
        `无法连接 127.0.0.1:${debugPort}，并且没有找到可自动启动的 Chrome/Chromium。\n` +
        `请先启动带 --remote-debugging-port=${debugPort} 的 Chrome。`,
        { cause: targetResult.error },
      )
    }
    chromeProfileDirectory = mkdtempSync(join(tmpdir(), 'word2html-acceptance-chrome-'))
    console.log(`未检测到 Chrome 调试端口 ${debugPort}，正在自动启动隔离的无界面 Chrome…`)
    ownedChrome = spawn(chromeBinary, [
      '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${chromeProfileDirectory}`, pageOrigin,
    ], { stdio: 'ignore' })
    targetResult = await waitForTarget(50)
  }

  const { page } = targetResult
  if (!page?.webSocketDebuggerUrl) throw new Error(`找不到 ${pageOrigin} 对应的 Chrome 页面。`)

  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  let requestId = 0
  async function evaluate(expression) {
    requestId += 1
    const id = requestId
    socket.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }))
    const message = await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout)
        socket.removeEventListener('message', handleMessage)
        socket.removeEventListener('error', handleError)
      }
      const handleMessage = (event) => {
        const parsed = JSON.parse(event.data)
        if (parsed.id !== id) return
        cleanup()
        resolve(parsed)
      }
      const handleError = (error) => {
        cleanup()
        reject(error)
      }
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error(`等待 Chrome 执行第 ${id} 个验收步骤超时（20 秒）。`))
      }, 20_000)
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('error', handleError, { once: true })
    })
    if (message.result?.exceptionDetails) {
      throw new Error(message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text)
    }
    return message.result?.result?.value
  }

  try {
    await evaluate(`location.href = ${JSON.stringify(pageOrigin)}; true`)
    await new Promise((resolve) => setTimeout(resolve, 1400))
    const appPage = await evaluate(`({
      href: location.href,
      title: document.title,
      hasRoot: Boolean(document.querySelector('#root')),
      hasAppEntry: Boolean(document.querySelector('script[src^="/src/main.tsx"], script[src^="/assets/"]')),
    })`)
    if (!appPage?.href?.startsWith(pageOrigin) || !appPage.hasRoot || !appPage.hasAppEntry) {
      throw new Error(
        `Chrome 没有加载到 Word2HTML 应用页面：${appPage?.href ?? '未知页面'}。\n` +
        `请先启动应用服务，并确认 ${pageOrigin} 可以打开。`,
      )
    }
  } catch (error) {
    socket.close()
    cleanupOwnedChrome()
    throw error
  }

  return {
    debugPort,
    pageOrigin,
    evaluate,
    close() {
      socket.close()
      process.removeListener('exit', cleanupOwnedChrome)
      cleanupOwnedChrome()
    },
  }
}
