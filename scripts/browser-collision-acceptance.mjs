import { connectAcceptanceBrowser } from './browser-acceptance-client.mjs'

const { evaluate, close } = await connectAcceptanceBrowser()

await evaluate(`(async function () {
  const library = await import('/src/core/lessonLibrary.ts')
  const entry = library.getOfficialLibraryEntries().find((item) => item.id === 'official.collision-discs-2d')
  if (!entry) throw new Error('找不到二维圆盘官方场景。')
  localStorage.setItem('word2html.lesson-scene.draft.v0.1', JSON.stringify(entry.scene))
  return true
}())`)
await evaluate('location.reload(); true')
await new Promise((resolve) => setTimeout(resolve, 1400))

const result = await evaluate(`(async function () {
  const waitForRender = () => new Promise((resolve) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      resolve()
    }
    requestAnimationFrame(() => requestAnimationFrame(finish))
    setTimeout(finish, 300)
  })
  await waitForRender()
  const circles = [...document.querySelectorAll('.collision-2d-canvas [data-body-id]')]
  const before = circles.map((circle) => Number(circle.getAttribute('cx')))
  const viewBox = document.querySelector('.collision-2d-canvas')?.getAttribute('viewBox')
  const surface = document.querySelector('[data-scene-object-id="contactSurface"]')
  const play = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '▶播放')
    ?? [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('播放'))
  if (!(play instanceof HTMLButtonElement)) throw new Error('找不到碰撞播放按钮。')
  play.click()
  await new Promise((resolve) => setTimeout(resolve, 3200))
  const afterCircles = [...document.querySelectorAll('.collision-2d-canvas [data-body-id]')]
  const after = afterCircles.map((circle) => Number(circle.getAttribute('cx')))
  const metrics = Object.fromEntries([...document.querySelectorAll('.experiment-metrics .metric-card')].map((card) => [
    card.querySelector('span')?.textContent?.trim(),
    card.querySelector('strong')?.textContent?.trim(),
  ]))
  play.click()

  const parameterTab = [...document.querySelectorAll('[role="tab"]')]
    .find((element) => element.textContent?.trim() === '参数')
  parameterTab?.click()
  await waitForRender()
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  const updateNumber = async (label, value) => {
    const input = document.querySelector('input[aria-label="' + label + '数值"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('找不到参数输入框：' + label)
    valueSetter?.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await waitForRender()
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  const parameterUpdates = [
    ['恢复系数', 0.5],
    ['圆盘 A 质量（kg）', 1.25], ['圆盘 A 水平初速度 vx（m/s）', 2.5], ['圆盘 A 竖直初速度 vy（m/s）', 0.5],
    ['圆盘 B 质量（kg）', 1.75], ['圆盘 B 水平初速度 vx（m/s）', -0.75], ['圆盘 B 竖直初速度 vy（m/s）', 0.25],
    ['圆盘 C 质量（kg）', 2.25], ['圆盘 C 水平初速度 vx（m/s）', -1.25], ['圆盘 C 竖直初速度 vy（m/s）', 0.75],
  ]
  const parameterGroups = [...document.querySelectorAll('.collision-parameter-group')].map((group) => group.getAttribute('aria-label'))
  for (const [label, value] of parameterUpdates) await updateNumber(label, value)
  await new Promise((resolve) => setTimeout(resolve, 360))
  const draft = JSON.parse(localStorage.getItem('word2html.lesson-scene.draft.v0.1') || 'null')

  const collisionModule = await import('/src/core/collision2d.ts')
  const changedBodies = collisionModule.createCollision2DRuntime(draft).snapshot(0).bodies.map((body) => ({
    id: body.id, mass: body.mass, vx: body.vx, vy: body.vy,
  }))

  const exportModule = await import('/src/core/exportHtml.ts')
  const html = exportModule.exportSceneAsStandaloneHtml(draft)
  return {
    bodyCount: circles.length,
    before,
    after,
    viewBox,
    surfaceVisible: Boolean(surface),
    metrics,
    restitution: draft?.parameters?.restitution?.value,
    parameterGroups,
    adjustableParameters: Object.fromEntries(['massA', 'vxA', 'vyA', 'massB', 'vxB', 'vyB', 'massC', 'vxC', 'vyC'].map((id) => [id, draft?.parameters?.[id]?.value])),
    changedBodies,
    standalone: {
      hasRuntime: html.includes('function contact') && html.includes('function buildRuntime'),
      hasControls: html.includes('累计接触') && html.includes('恢复系数') && html.includes('圆盘 A 质量（kg）') && html.includes('圆盘 C 竖直初速度 vy（m/s）'),
      hasParameterGroups: html.includes('function bodyUses(body,id)') && html.includes("addGroup('实验全局'") && html.includes('parameter-group'),
      hasNetworkDependency: /<script[^>]+src=|<link[^>]+href=/i.test(html),
    },
  }
}())`)
close()

const assert = (condition, detail) => {
  if (!condition) throw new Error(`二维碰撞浏览器验收失败：${detail}\n${JSON.stringify(result, null, 2)}`)
}
assert(result?.bodyCount === 3, '官方场景没有显示三个圆盘。')
assert(result?.viewBox === '0 0 900 590' && result.surfaceVisible, '画布或矩形接触边界未显示。')
assert(result?.before?.some((value, index) => Math.abs(value - result.after[index]) > 2), '播放后圆盘没有移动。')
assert(Number.parseInt(result?.metrics?.累计接触 ?? '0', 10) > 0, '播放期间没有记录接触。')
assert(result?.metrics?.总动能?.includes('J') && result.metrics?.总动量?.startsWith('('), '动能或二维动量读数缺失。')
assert(result?.restitution === 0.5, '参数修改没有写入本地草稿。')
assert(JSON.stringify(result?.parameterGroups) === JSON.stringify(['碰撞全局参数', '圆盘 A 参数', '圆盘 B 参数', '圆盘 C 参数']), '碰撞参数没有按全局和 A/B/C 圆盘分组。')
assert(JSON.stringify(result?.adjustableParameters) === JSON.stringify({ massA: 1.25, vxA: 2.5, vyA: 0.5, massB: 1.75, vxB: -0.75, vyB: 0.25, massC: 2.25, vxC: -1.25, vyC: 0.75 }), 'A/B/C 的独立质量或二维初速度没有全部写入草稿。')
assert(JSON.stringify(result?.changedBodies) === JSON.stringify([
  { id: 'discA', mass: 1.25, vx: 2.5, vy: 0.5 },
  { id: 'discB', mass: 1.75, vx: -0.75, vy: 0.25 },
  { id: 'discC', mass: 2.25, vx: -1.25, vy: 0.75 },
]), '独立质量或速度参数没有进入碰撞运行时。')
assert(result?.standalone?.hasRuntime && result.standalone.hasControls && result.standalone.hasParameterGroups && !result.standalone.hasNetworkDependency, '独立 HTML 缺少运行时、分组控件或包含网络依赖。')

console.log(JSON.stringify(result, null, 2))
