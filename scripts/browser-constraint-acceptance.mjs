const debugPort = Number(process.argv[2] ?? 9333)
const pageOrigin = process.argv[3] ?? 'http://127.0.0.1:5181'
const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()
const page = targets.find((target) => target.type === 'page' && target.url.startsWith(pageOrigin))
if (!page?.webSocketDebuggerUrl) throw new Error(`找不到 ${pageOrigin} 对应的 Chrome 页面。`)

const modelExperimentSpec = {
  additionalBodies: [],
  bodyId: 'bob',
  bodyLabel: '摆球',
  conclusion: '在小角度近似下，摆绳长度始终保持为 L。',
  constraints: [{
    anchorXExpression: '0', anchorYExpression: 'H', bodyId: 'bob', id: 'rope',
    label: '摆绳', restLengthExpression: 'L', type: 'rope',
  }],
  durationExpression: '4*sqrt(L/g)',
  formula: 'theta=theta0*cos(sqrt(g/L)*t); x=L*sin(theta); y=H-L*cos(theta)',
  metrics: [
    { expression: 'theta0*cos(sqrt(g/L)*t)', id: 'theta', label: '当前摆角', unit: 'rad' },
    { expression: 'sqrt(g/L)', id: 'omega', label: '角频率', unit: 'rad/s' },
    { expression: '2*pi*sqrt(L/g)', id: 'period', label: '周期', unit: 's' },
    { expression: 'sqrt((L*sin(theta))^2+(H-L*cos(theta)-H)^2)', id: 'ropeLen', label: '实际绳长', unit: 'm' },
  ],
  parameters: [
    { id: 'L', label: '摆长 L', max: 3, min: 0.5, step: 0.1, value: 1.6 },
    { id: 'g', label: '重力加速度 g', max: 20, min: 1.6, step: 0.1, value: 9.8 },
    { id: 'theta0', label: '初始摆角', max: 0.349, min: 0.02, step: 0.01, value: 0.2 },
    { id: 'H', label: '悬挂点高度 H', max: 6, min: 1, step: 0.1, value: 3 },
  ],
  vectors: [],
  xExpression: 'L*sin(theta)',
  yExpression: 'H-L*cos(theta)',
}

const springSpec = {
  durationExpression: '4', bodyId: 'block', bodyLabel: '滑块',
  xExpression: '2*cos(t)', yExpression: '0', formula: 'x=2*cos(t)',
  conclusion: '弹簧长度随滑块运动变化。', parameters: [], metrics: [], vectors: [],
  constraints: [{
    id: 'spring', label: '弹簧', type: 'spring', bodyId: 'block',
    anchorXExpression: '0-5', anchorYExpression: '0', restLengthExpression: '5',
  }],
}

const dualPendulumSpec = {
  durationExpression: '4*pi*sqrt(max(L1,L2)/g)', bodyId: 'pendulum1', bodyLabel: '左摆球',
  xExpression: '0-2+L1*sin(theta1)', yExpression: '0-L1*cos(theta1)',
  formula: 'T=2*pi*sqrt(L/g)', conclusion: '两个钟摆独立运动。',
  parameters: [
    { id: 'g', label: '重力加速度', value: 9.8, min: 1, max: 20, step: 0.1 },
    { id: 'L1', label: '左摆长', value: 1, min: 0.3, max: 3, step: 0.1 },
    { id: 'L2', label: '右摆长', value: 1.5, min: 0.3, max: 3, step: 0.1 },
    { id: 'theta01', label: '左初始角', value: 0.25, min: 0.05, max: 0.35, step: 0.01 },
    { id: 'theta02', label: '右初始角', value: 0.2, min: 0.05, max: 0.35, step: 0.01 },
  ],
  metrics: [
    { id: 'theta1', label: '左摆角', expression: 'theta01*cos(sqrt(g/L1)*t)', unit: 'rad' },
    { id: 'theta2', label: '右摆角', expression: 'theta02*cos(sqrt(g/L2)*t)', unit: 'rad' },
  ],
  additionalBodies: [{
    id: 'pendulum2', label: '右摆球',
    xExpression: '2+L2*sin(theta2)', yExpression: '0-L2*cos(theta2)',
  }],
  vectors: [],
  constraints: [
    { id: 'rope1', label: '左摆绳', type: 'rope', bodyId: 'pendulum1', anchorXExpression: '0-2', anchorYExpression: '0', restLengthExpression: 'L1' },
    { id: 'rope2', label: '右摆绳', type: 'rope', bodyId: 'pendulum2', anchorXExpression: '2', anchorYExpression: '0', restLengthExpression: 'L2' },
  ],
}

const browserExpression = `
(async function () {
  const [React, ReactDom, canvasModule, templateModule, runtimeModule] = await Promise.all([
    import('/node_modules/.vite/deps/react.js'),
    import('/node_modules/.vite/deps/react-dom_client.js'),
    import('/src/components/TimeExperimentCanvas.tsx'),
    import('/src/templates/timeExperimentTemplate.ts'),
    import('/src/core/timeExperiment.ts')
  ])
  const container = document.createElement('div')
  document.body.replaceChildren(container)
  const root = ReactDom.default.createRoot(container)
  const metadata = { title: '约束验收', topic: '机械振动', subject: 'physics', summary: '浏览器约束原语验收。' }
  const pendulum = templateModule.createTimeExperimentScene(${JSON.stringify(modelExperimentSpec)}, metadata)
  root.render(React.default.createElement(canvasModule.TimeExperimentCanvas, { scene: pendulum, time: 0, zoom: 1 }))
  await new Promise((resolve) => setTimeout(resolve, 250))
  const startBody = document.querySelector('[data-body-id="bob"]')
  const startPosition = [startBody?.getAttribute('cx'), startBody?.getAttribute('cy')]
  root.render(React.default.createElement(canvasModule.TimeExperimentCanvas, { scene: pendulum, time: 1.2, zoom: 1 }))
  await new Promise((resolve) => setTimeout(resolve, 250))
  const rope = document.querySelector('[data-constraint-id="rope"]')
  const movedBody = document.querySelector('[data-body-id="bob"]')
  const ropeResult = {
    element: rope?.tagName.toLowerCase(),
    label: [...document.querySelectorAll('text')].find((node) => node.textContent?.includes('摆绳'))?.textContent,
    bodyMoved: startPosition.join(',') !== [movedBody?.getAttribute('cx'), movedBody?.getAttribute('cy')].join(','),
    actualLength: [...document.querySelectorAll('.metric-card strong')].find((node) => node.textContent?.includes('m'))?.textContent
  }
  const spring = templateModule.createTimeExperimentScene(${JSON.stringify(springSpec)}, metadata)
  root.render(React.default.createElement(canvasModule.TimeExperimentCanvas, { scene: spring, time: 0, zoom: 1 }))
  await new Promise((resolve) => setTimeout(resolve, 250))
  const springElement = document.querySelector('[data-constraint-id="spring"] polyline')
  const springResult = {
    element: springElement?.tagName.toLowerCase(),
    pointCount: springElement?.getAttribute('points')?.trim().split(/\\s+/).length,
    label: [...document.querySelectorAll('text')].find((node) => node.textContent?.includes('弹簧'))?.textContent
  }
  const dualPendulum = templateModule.createTimeExperimentScene(${JSON.stringify(dualPendulumSpec)}, metadata)
  root.render(React.default.createElement(canvasModule.TimeExperimentCanvas, { scene: dualPendulum, time: 0.8, zoom: 1 }))
  await new Promise((resolve) => setTimeout(resolve, 250))
  const dualBefore = [...document.querySelectorAll('text')]
    .filter((node) => node.textContent?.includes('摆绳'))
    .map((node) => node.textContent)
  const adjustedDualPendulum = runtimeModule.updateTimeExperimentParameter(dualPendulum, 'L1', 2.2)
  root.render(React.default.createElement(canvasModule.TimeExperimentCanvas, { scene: adjustedDualPendulum, time: 0.8, zoom: 1 }))
  await new Promise((resolve) => setTimeout(resolve, 250))
  const dualAfter = [...document.querySelectorAll('text')]
    .filter((node) => node.textContent?.includes('摆绳'))
    .map((node) => node.textContent)
  return {
    rope: ropeResult,
    spring: springResult,
    dualPendulum: {
      bodies: document.querySelectorAll('[data-body-id]').length,
      ropes: document.querySelectorAll('[data-constraint-id]').length,
      before: dualBefore,
      afterChangingL1: dualAfter
    },
    svgViewBox: document.querySelector('svg')?.getAttribute('viewBox')
  }
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
  socket.addEventListener('message', (event) => resolve(JSON.parse(event.data)), { once: true })
  socket.addEventListener('error', reject, { once: true })
})
socket.close()
if (message.result?.exceptionDetails) {
  throw new Error(message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text)
}
console.log(JSON.stringify(message.result?.result?.value, null, 2))
