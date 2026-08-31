const debugPort = Number(process.argv[2] ?? 9333)
const pageOrigin = process.argv[3] ?? 'http://127.0.0.1:5181'
const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()
const page = targets.find((target) => target.type === 'page' && target.url.startsWith(pageOrigin))
if (!page?.webSocketDebuggerUrl) throw new Error(`找不到 ${pageOrigin} 对应的 Chrome 页面。`)

const browserExpression = `
(async function () {
  const [React, ReactDom, settingsModule, canvasModule, templateModule, exportModule, storageModule] = await Promise.all([
    import('/node_modules/.vite/deps/react.js'),
    import('/node_modules/.vite/deps/react-dom_client.js'),
    import('/src/components/SettingsPanel.tsx'),
    import('/src/components/EllipseCanvas.tsx'),
    import('/src/templates/ellipseTemplate.ts'),
    import('/src/core/exportHtml.ts'),
    import('/src/core/storage.ts')
  ])
  const waitForRender = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const container = document.createElement('div')
  document.body.replaceChildren(container)
  const root = ReactDom.default.createRoot(container)

  let currentScene = templateModule.createEllipseScene()
  function renderHarness() {
    window.__appearanceAcceptanceScene = currentScene
    root.render(React.default.createElement('main', { style: { display: 'grid', gridTemplateColumns: '360px 1fr' } },
      React.default.createElement(settingsModule.SettingsPanel, {
        scene: currentScene,
        error: null,
        onParameterChange: () => undefined,
        onAppearanceChange: (key, value) => {
          currentScene = { ...currentScene, appearance: { ...currentScene.appearance, [key]: value } }
          renderHarness()
        }
      }),
      React.default.createElement(canvasModule.EllipseCanvas, {
        scene: currentScene,
        angle: 0.72,
        trailAngles: [],
        zoom: 1,
        onAngleChange: () => undefined
      })
    ))
  }

  renderHarness()
  await waitForRender()

  const displayTab = [...document.querySelectorAll('[role="tab"]')]
    .find((element) => element.textContent?.trim() === '显示效果')
  if (!displayTab) throw new Error('找不到显示效果标签页。')
  displayTab.click()
  await waitForRender()

  function choose(controlId, text) {
    const group = document.querySelector('[data-style-control="' + controlId + '"]')
    const button = [...(group?.querySelectorAll('button') ?? [])]
      .find((element) => element.textContent?.trim() === text)
    if (!button) throw new Error('找不到样式选项：' + controlId + ' / ' + text)
    button.click()
  }

  function changeRange(id, value) {
    const input = document.getElementById(id)
    if (!(input instanceof HTMLInputElement)) throw new Error('找不到范围控件：' + id)
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    valueSetter?.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  choose('point-style', '投影')
  choose('main-line-style', '点划线')
  choose('helper-line-style', '实线')
  changeRange('point-radius-range', 16)
  changeRange('line-width-range', 7)
  changeRange('helper-line-width-range', 4.5)
  await waitForRender()

  const scene = window.__appearanceAcceptanceScene
  const mainLine = document.querySelector('[data-appearance-role="main-line"]')
  const helperLines = document.querySelector('[data-appearance-role="helper-lines"]')
  const primaryPoint = document.querySelector('[data-appearance-role="primary-point"]')

  const draftKey = 'word2html.lesson-scene.draft.v0.1'
  const previousDraft = localStorage.getItem(draftKey)
  storageModule.saveDraft(scene)
  const restored = storageModule.loadDraft()
  if (previousDraft === null) localStorage.removeItem(draftKey)
  else localStorage.setItem(draftKey, previousDraft)

  const exported = exportModule.exportSceneAsStandaloneHtml(scene)
  const frame = document.createElement('iframe')
  const frameLoaded = new Promise((resolve, reject) => {
    frame.addEventListener('load', resolve, { once: true })
    frame.addEventListener('error', reject, { once: true })
  })
  frame.srcdoc = exported
  document.body.append(frame)
  await frameLoaded
  await new Promise((resolve) => setTimeout(resolve, 100))
  const exportedDocument = frame.contentDocument
  const exportedPoint = exportedDocument?.getElementById('point')
  const exportedMainLine = exportedDocument?.querySelector('ellipse[stroke="' + scene.appearance.curveColor + '"]')
  const exportedHelperLine = exportedDocument?.querySelector('line[stroke="' + scene.appearance.helperColor + '"]')

  const result = {
    scene: {
      pointRadius: scene.appearance.pointRadius,
      pointStyle: scene.appearance.pointStyle,
      lineWidth: scene.appearance.lineWidth,
      lineStyle: scene.appearance.lineStyle,
      helperLineWidth: scene.appearance.helperLineWidth,
      helperLineStyle: scene.appearance.helperLineStyle
    },
    canvas: {
      pointRadius: primaryPoint?.getAttribute('r'),
      pointFilter: primaryPoint?.getAttribute('filter'),
      mainLineWidth: mainLine?.getAttribute('stroke-width'),
      mainLineDash: mainLine?.getAttribute('stroke-dasharray'),
      helperLineWidth: helperLines?.getAttribute('stroke-width'),
      helperLineDash: helperLines?.getAttribute('stroke-dasharray')
    },
    restored: restored ? {
      pointRadius: restored.appearance.pointRadius,
      pointStyle: restored.appearance.pointStyle,
      lineWidth: restored.appearance.lineWidth,
      lineStyle: restored.appearance.lineStyle,
      helperLineWidth: restored.appearance.helperLineWidth,
      helperLineStyle: restored.appearance.helperLineStyle
    } : null,
    standalone: {
      serialized: exported.includes('"pointStyle":"shadow"')
        && exported.includes('"lineStyle":"dash-dot"')
        && exported.includes('"helperLineStyle":"solid"'),
      pointRadius: exportedPoint?.getAttribute('r'),
      pointHasShadow: exportedPoint?.getAttribute('style')?.includes('drop-shadow') ?? false,
      mainLineWidth: exportedMainLine?.getAttribute('stroke-width'),
      mainLineDash: exportedMainLine?.getAttribute('stroke-dasharray'),
      helperLineWidth: exportedHelperLine?.getAttribute('stroke-width'),
      helperLineDash: exportedHelperLine?.getAttribute('stroke-dasharray')
    }
  }
  frame.remove()
  return result
}())`

const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

socket.send(JSON.stringify({
  id: 1,
  method: 'Runtime.evaluate',
  params: { expression: browserExpression, awaitPromise: true, returnByValue: true },
}))
const message = await new Promise((resolve, reject) => {
  const handleMessage = (event) => {
    const parsed = JSON.parse(event.data)
    if (parsed.id !== 1) return
    socket.removeEventListener('message', handleMessage)
    resolve(parsed)
  }
  socket.addEventListener('message', handleMessage)
  socket.addEventListener('error', reject, { once: true })
})
socket.close()

if (message.result?.exceptionDetails) {
  throw new Error(message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text)
}
const result = message.result?.result?.value
const assert = (condition, message) => {
  if (!condition) throw new Error(`点线样式浏览器验收失败：${message}\n${JSON.stringify(result, null, 2)}`)
}

assert(result?.scene?.pointRadius === 16 && result.scene.pointStyle === 'shadow', '设置面板未更新点外观。')
assert(result?.scene?.lineWidth === 7 && result.scene.lineStyle === 'dash-dot', '设置面板未更新主图线外观。')
assert(result?.scene?.helperLineWidth === 4.5 && result.scene.helperLineStyle === 'solid', '设置面板未更新辅助线外观。')
assert(result?.canvas?.pointRadius === '16' && result.canvas.pointFilter === 'url(#ellipse-point-shadow)', '画布未显示点大小或投影。')
assert(result?.canvas?.mainLineWidth === '7' && result.canvas.mainLineDash === '35 16.8 7 16.8', '画布未显示主图点划线。')
assert(result?.canvas?.helperLineWidth === '4.5' && result.canvas.helperLineDash === null, '画布未显示辅助实线。')
assert(JSON.stringify(result?.restored) === JSON.stringify(result?.scene), '草稿恢复未保留点线外观。')
assert(result?.standalone?.serialized, '独立 HTML 未序列化点线外观。')
assert(result?.standalone?.pointRadius === '16' && result.standalone.pointHasShadow, '独立 HTML 未显示点大小或投影。')
assert(result?.standalone?.mainLineWidth === '7' && result.standalone.mainLineDash === '35 16.8 7 16.8', '独立 HTML 未显示主图点划线。')
assert(result?.standalone?.helperLineWidth === '4.5' && result.standalone.helperLineDash === null, '独立 HTML 未显示辅助实线。')

console.log(JSON.stringify(result, null, 2))
