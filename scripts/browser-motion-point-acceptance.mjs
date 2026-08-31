import { connectAcceptanceBrowser } from './browser-acceptance-client.mjs'

const { evaluate, close } = await connectAcceptanceBrowser()

async function loadOfficialScene(entryId) {
  await evaluate(`(async function () {
    const library = await import('/src/core/lessonLibrary.ts')
    const entry = library.getOfficialLibraryEntries().find((item) => item.id === ${JSON.stringify(entryId)})
    if (!entry) throw new Error('找不到官方场景：' + ${JSON.stringify(entryId)})
    localStorage.setItem('word2html.lesson-scene.draft.v0.1', JSON.stringify(entry.scene))
    return true
  }())`)
  await evaluate('location.reload(); true')
  await new Promise((resolve) => setTimeout(resolve, 1400))
}

try {
  await loadOfficialScene('official.free-fall')
  const freeFall = await evaluate(`(async function () {
    const waitForRender = (delay = 320) => new Promise((resolve) => {
      let finished = false
      const finish = () => { if (!finished) { finished = true; resolve() } }
      requestAnimationFrame(() => requestAnimationFrame(finish))
      setTimeout(finish, delay)
    })
    const metricValue = (label) => {
      const card = [...document.querySelectorAll('.experiment-metrics .metric-card')]
        .find((element) => element.querySelector('span')?.textContent?.trim() === label)
      return Number.parseFloat(card?.querySelector('strong')?.textContent || 'NaN')
    }
    const setNumber = async (label, value) => {
      const input = document.querySelector('input[aria-label="' + label + '数值"]')
      if (!(input instanceof HTMLInputElement)) throw new Error('找不到参数输入框：' + label)
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, String(value))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await waitForRender(420)
    }

    await waitForRender()
    const svg = document.querySelector('svg.time-experiment-canvas')
    const shell = svg?.closest('.canvas-shell')
    const formula = document.querySelector('.formula-card--above')
    if (!(svg instanceof SVGElement) || !(shell instanceof HTMLElement)) throw new Error('自由落体画布未显示。')
    const formulaBeforeCanvas = Boolean(formula && (formula.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING))
    const grid = svg.querySelector('g[aria-hidden="true"]')
    const vertical = [...(grid?.querySelectorAll('line') || [])].filter((line) => line.getAttribute('x1') === line.getAttribute('x2'))
    const horizontal = [...(grid?.querySelectorAll('line') || [])].filter((line) => line.getAttribute('y1') === line.getAttribute('y2'))
    const gridDx = Math.abs(Number(vertical[1]?.getAttribute('x1')) - Number(vertical[0]?.getAttribute('x1')))
    const gridDy = Math.abs(Number(horizontal[1]?.getAttribute('y1')) - Number(horizontal[0]?.getAttribute('y1')))
    const initialBody = svg.querySelector('[data-body-id="primary"]')
    const initialCy = Number(initialBody?.getAttribute('cy'))
    const initial = {
      time: metricValue('时间'), height: metricValue('当前高度'), speed: metricValue('当前速度'),
      gravityVisible: Boolean(svg.querySelector('[data-scene-object-id="vector.gravity"]')),
      velocityVisible: Boolean(svg.querySelector('[data-scene-object-id="vector.velocity"]')),
      vectorLabelText: [...svg.querySelectorAll('text')].map((item) => item.textContent?.trim()).filter(Boolean),
    }

    const play = document.querySelector('.play-button')
    if (!(play instanceof HTMLButtonElement)) throw new Error('找不到自由落体播放按钮。')
    play.click()
    await new Promise((resolve) => setTimeout(resolve, 760))
    const pause = document.querySelector('.play-button')
    if (!(pause instanceof HTMLButtonElement) || !pause.textContent?.includes('暂停')) throw new Error('自由落体没有进入播放状态。')
    pause.click()
    await waitForRender()
    const movingSvg = document.querySelector('svg.time-experiment-canvas')
    const moving = {
      time: metricValue('时间'), height: metricValue('当前高度'), speed: metricValue('当前速度'),
      cy: Number(movingSvg?.querySelector('[data-body-id="primary"]')?.getAttribute('cy')),
      velocityVisible: Boolean(movingSvg?.querySelector('[data-scene-object-id="vector.velocity"]')),
      gravityVisible: Boolean(movingSvg?.querySelector('[data-scene-object-id="vector.gravity"]')),
      trailLength: movingSvg?.querySelector('[data-scene-object-id="trail.primary"]')?.getAttribute('points')?.length || 0,
    }

    await setNumber('初始高度', 32)
    const resetTimeAfterParameter = metricValue('时间')
    const playToEnd = document.querySelector('.play-button')
    if (!(playToEnd instanceof HTMLButtonElement)) throw new Error('修改参数后播放按钮消失。')
    playToEnd.click()
    await new Promise((resolve) => setTimeout(resolve, 2850))
    await waitForRender()
    const end = {
      time: metricValue('时间'), height: metricValue('当前高度'), speed: metricValue('当前速度'),
      buttonText: document.querySelector('.play-button')?.textContent?.trim() || '',
    }

    const gravity = document.querySelector('[data-scene-object-id="vector.gravity"]')
    if (!(gravity instanceof SVGLineElement)) throw new Error('找不到重力加速度矢量对象。')
    gravity.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitForRender()
    const dashed = [...document.querySelectorAll('[role="radio"]')]
      .find((element) => element.textContent?.trim() === '虚线')
    if (!(dashed instanceof HTMLButtonElement)) throw new Error('找不到重力矢量对象级虚线选项。')
    dashed.click()
    await waitForRender(420)
    const styledGravity = document.querySelector('[data-scene-object-id="vector.gravity"]')

    await new Promise((resolve) => setTimeout(resolve, 360))
    const draft = JSON.parse(localStorage.getItem('word2html.lesson-scene.draft.v0.1') || 'null')
    const runtimeModule = await import('/src/core/timeExperiment.ts')
    const runtime = runtimeModule.createTimeExperimentRuntime(draft)
    const finalSnapshot = runtime.snapshot(runtime.duration)
    const exportModule = await import('/src/core/exportHtml.ts')
    const html = exportModule.exportSceneAsStandaloneHtml(draft)
    const script = [...html.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/g)].at(-1)?.[1] || ''
    return {
      viewBox: svg.getAttribute('viewBox'), formulaBeforeCanvas,
      canvasFillsShell: Math.abs(svg.getBoundingClientRect().width - (shell.getBoundingClientRect().width - 2)) < 0.5,
      gridDx, gridDy, initialCy, initial, moving, resetTimeAfterParameter, end,
      parameterH0: draft?.parameters?.h0?.value,
      gravityStyle: draft?.appearance?.objectStyles?.['vector.gravity']?.lineStyle,
      gravityDashArray: styledGravity?.getAttribute('stroke-dasharray') || '',
      finalRuntime: {
        duration: runtime.duration,
        height: finalSnapshot.metrics.find((item) => item.id === 'height')?.value,
        speed: finalSnapshot.metrics.find((item) => item.id === 'speed')?.value,
      },
      standalone: {
        hasRuntime: html.includes('INTERACTIVE EXPERIMENT') && html.includes('function state(t)'),
        hasVectors: html.includes('data-vector-display') && html.includes('vector.gravity'),
        hasPlay: html.includes('id="play"') && html.includes('requestAnimationFrame(frame)'),
        validScript: Boolean(script),
        hasDynamicCode: /\\beval\\s*\\(|\\bnew\\s+Function\\b/.test(script),
        hasNetworkDependency: /<script[^>]+src=|<link[^>]+href=/i.test(html),
      },
    }
  }())`)

  await loadOfficialScene('official.dual-pendulum')
  const dualPendulum = await evaluate(`(async function () {
    const waitForRender = (delay = 320) => new Promise((resolve) => {
      let finished = false
      const finish = () => { if (!finished) { finished = true; resolve() } }
      requestAnimationFrame(() => requestAnimationFrame(finish))
      setTimeout(finish, delay)
    })
    const setNumber = async (label, value) => {
      const input = document.querySelector('input[aria-label="' + label + '数值"]')
      if (!(input instanceof HTMLInputElement)) throw new Error('找不到参数输入框：' + label)
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, String(value))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await waitForRender(420)
    }
    const constraintLabels = () => [...document.querySelectorAll('svg.time-experiment-canvas text')]
      .map((item) => item.textContent?.trim() || '').filter((text) => text.includes('摆绳'))

    await waitForRender()
    const svg = document.querySelector('svg.time-experiment-canvas')
    const formula = document.querySelector('.formula-card--above')
    if (!(svg instanceof SVGElement)) throw new Error('双摆画布未显示。')
    const formulaBeforeCanvas = Boolean(formula && (formula.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING))
    const initialBodies = [...svg.querySelectorAll('[data-body-id]')].map((item) => ({
      id: item.getAttribute('data-body-id'), cx: Number(item.getAttribute('cx')), cy: Number(item.getAttribute('cy')),
    }))
    const initialConstraints = [...svg.querySelectorAll('[data-constraint-id]')].map((item) => item.getAttribute('data-constraint-id'))
    const initialConstraintLabels = constraintLabels()

    const play = document.querySelector('.play-button')
    if (!(play instanceof HTMLButtonElement)) throw new Error('找不到双摆播放按钮。')
    play.click()
    await new Promise((resolve) => setTimeout(resolve, 820))
    const pause = document.querySelector('.play-button')
    if (!(pause instanceof HTMLButtonElement) || !pause.textContent?.includes('暂停')) throw new Error('双摆没有进入播放状态。')
    pause.click()
    await waitForRender()
    const movingSvg = document.querySelector('svg.time-experiment-canvas')
    const movingBodies = [...(movingSvg?.querySelectorAll('[data-body-id]') || [])].map((item) => ({
      id: item.getAttribute('data-body-id'), cx: Number(item.getAttribute('cx')), cy: Number(item.getAttribute('cy')),
    }))
    const trailLengths = [...(movingSvg?.querySelectorAll('[data-scene-object-id^="trail."]') || [])]
      .map((item) => item.getAttribute('points')?.length || 0)

    await setNumber('左摆长', 2.2)
    const changedLabels = constraintLabels()
    const rightLengthInput = document.querySelector('input[aria-label="右摆长数值"]')
    const timeAfterParameter = Number.parseFloat(document.querySelector('.metric-card--sum strong')?.textContent || 'NaN')

    const rope1 = document.querySelector('[data-scene-object-id="constraint.rope1"]')
    if (!(rope1 instanceof SVGLineElement)) throw new Error('找不到左摆绳对象。')
    rope1.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitForRender()
    const dashDot = [...document.querySelectorAll('[role="radio"]')]
      .find((element) => element.textContent?.trim() === '点划线')
    if (!(dashDot instanceof HTMLButtonElement)) throw new Error('找不到左摆绳对象级点划线选项。')
    dashDot.click()
    await waitForRender(420)
    const styledRope = document.querySelector('[data-scene-object-id="constraint.rope1"]')

    const zoomBefore = document.querySelector('.zoom-value')?.textContent?.trim()
    document.querySelector('button[aria-label="放大画布"]')?.click()
    await waitForRender()
    const zoomAfter = document.querySelector('.zoom-value')?.textContent?.trim()

    await new Promise((resolve) => setTimeout(resolve, 360))
    const draft = JSON.parse(localStorage.getItem('word2html.lesson-scene.draft.v0.1') || 'null')
    const runtimeModule = await import('/src/core/timeExperiment.ts')
    const runtime = runtimeModule.createTimeExperimentRuntime(draft)
    const first = runtime.snapshot(0)
    const middle = runtime.snapshot(runtime.duration * 0.37)
    const ropeLengths = [first, middle].flatMap((snapshot) => snapshot.constraints.map((item) => ({
      id: item.id, current: item.currentLength, rest: item.restLength,
    })))
    const exportModule = await import('/src/core/exportHtml.ts')
    const html = exportModule.exportSceneAsStandaloneHtml(draft)
    const script = [...html.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/g)].at(-1)?.[1] || ''
    return {
      viewBox: svg.getAttribute('viewBox'), formulaBeforeCanvas,
      initialBodies, initialConstraints, initialConstraintLabels,
      movingBodies, trailLengths,
      parameterValues: { L1: draft?.parameters?.L1?.value, L2: draft?.parameters?.L2?.value },
      rightLengthInput: Number(rightLengthInput?.value), timeAfterParameter, changedLabels,
      ropeLengths,
      ropeStyle: draft?.appearance?.objectStyles?.['constraint.rope1']?.lineStyle,
      ropeDashArray: styledRope?.getAttribute('stroke-dasharray') || '',
      ropeSelected: styledRope?.getAttribute('data-scene-selected'),
      zoomBefore, zoomAfter,
      standalone: {
        hasRuntime: html.includes('INTERACTIVE EXPERIMENT') && html.includes('function state(t)'),
        hasTwoBodies: html.includes('body.pendulum1') && html.includes('body.pendulum2'),
        hasConstraints: html.includes('data-constraint-id') && html.includes('constraint.rope1') && html.includes('constraint.rope2'),
        hasMultiTrails: html.includes("screenBodies.forEach") && html.includes("trailId='trail.'"),
        validScript: Boolean(script),
        hasDynamicCode: /\\beval\\s*\\(|\\bnew\\s+Function\\b/.test(script),
        hasNetworkDependency: /<script[^>]+src=|<link[^>]+href=/i.test(html),
      },
    }
  }())`)

  const assert = (condition, detail, data) => {
    if (!condition) throw new Error(`二维质点运动浏览器验收失败：${detail}\n${JSON.stringify(data, null, 2)}`)
  }

  assert(freeFall?.viewBox === '0 0 900 590' && freeFall.formulaBeforeCanvas && freeFall.canvasFillsShell, '自由落体画布或公式布局不正确。', freeFall)
  assert(freeFall?.gridDx > 0 && Math.abs(freeFall.gridDx - freeFall.gridDy) < 0.05, '自由落体网格不是正方形。', freeFall)
  assert(freeFall?.initial?.time === 0 && freeFall.initial.height === 20 && freeFall.initial.speed === 0 && freeFall.initial.gravityVisible && !freeFall.initial.velocityVisible, '自由落体初始状态或恒定重力矢量不正确。', freeFall)
  assert(freeFall?.moving?.time > 0 && freeFall.moving.height < 20 && freeFall.moving.speed > 0 && freeFall.moving.cy !== freeFall.initialCy && freeFall.moving.velocityVisible && freeFall.moving.gravityVisible && freeFall.moving.trailLength > 100, '播放后自由落体位置、指标、矢量或轨迹没有同步变化。', freeFall)
  assert(freeFall?.resetTimeAfterParameter === 0 && freeFall.parameterH0 === 32, '修改初始高度后没有回到 t=0 或保存参数。', freeFall)
  assert(freeFall?.end?.buttonText.includes('播放') && Math.abs(freeFall.end.height) < 0.011 && Math.abs(freeFall.end.time - freeFall.finalRuntime.duration) < 0.011 && Math.abs(freeFall.end.speed - freeFall.finalRuntime.speed) < 0.011, '自由落体没有在理论落地时刻自动停止。', freeFall)
  assert(freeFall?.gravityStyle === 'dashed' && freeFall.gravityDashArray, '重力矢量对象级虚线没有生效。', freeFall)
  assert(freeFall?.standalone?.hasRuntime && freeFall.standalone.hasVectors && freeFall.standalone.hasPlay && freeFall.standalone.validScript && !freeFall.standalone.hasDynamicCode && !freeFall.standalone.hasNetworkDependency, '自由落体独立 HTML 不完整或不安全。', freeFall)

  const initialById = Object.fromEntries((dualPendulum?.initialBodies || []).map((item) => [item.id, item]))
  const movingById = Object.fromEntries((dualPendulum?.movingBodies || []).map((item) => [item.id, item]))
  assert(dualPendulum?.viewBox === '0 0 900 590' && dualPendulum.formulaBeforeCanvas, '双摆画布或公式布局不正确。', dualPendulum)
  assert(['pendulum1', 'pendulum2'].every((id) => id in initialById) && ['rope1', 'rope2'].every((id) => dualPendulum.initialConstraints.includes(id)), '两个摆球或两条摆绳没有完整显示。', dualPendulum)
  assert(dualPendulum?.initialConstraintLabels.some((text) => text.includes('1.00 m')) && dualPendulum.initialConstraintLabels.some((text) => text.includes('1.50 m')), '默认双摆绳长标签不正确。', dualPendulum)
  assert(['pendulum1', 'pendulum2'].every((id) => Math.hypot(movingById[id].cx - initialById[id].cx, movingById[id].cy - initialById[id].cy) > 0.5) && dualPendulum.trailLengths.length === 2 && dualPendulum.trailLengths.every((length) => length > 100), '播放后两个摆球或两条轨迹没有独立变化。', dualPendulum)
  assert(dualPendulum?.parameterValues?.L1 === 2.2 && dualPendulum.parameterValues.L2 === 1.5 && dualPendulum.rightLengthInput === 1.5 && dualPendulum.timeAfterParameter === 0, '修改左摆长错误影响右摆长或没有重置时间。', dualPendulum)
  assert(dualPendulum?.changedLabels.some((text) => text.includes('2.20 m')) && dualPendulum.changedLabels.some((text) => text.includes('1.50 m')), '修改后的两条摆绳标签不正确。', dualPendulum)
  assert(dualPendulum?.ropeLengths.length === 4 && dualPendulum.ropeLengths.every((item) => Math.abs(item.current - item.rest) < 1e-8), '两条绳在运行区间内没有保持各自长度。', dualPendulum)
  assert(dualPendulum?.ropeStyle === 'dash-dot' && dualPendulum.ropeDashArray && dualPendulum.ropeSelected === 'true', '左摆绳对象选择或点划线样式没有生效。', dualPendulum)
  assert(dualPendulum?.zoomBefore === '100%' && dualPendulum.zoomAfter === '110%', '双摆画布缩放没有生效。', dualPendulum)
  assert(dualPendulum?.standalone?.hasRuntime && dualPendulum.standalone.hasTwoBodies && dualPendulum.standalone.hasConstraints && dualPendulum.standalone.hasMultiTrails && dualPendulum.standalone.validScript && !dualPendulum.standalone.hasDynamicCode && !dualPendulum.standalone.hasNetworkDependency, '双摆独立 HTML 的多物体、约束、轨迹或安全能力不完整。', dualPendulum)

  console.log(JSON.stringify({ freeFall, dualPendulum }, null, 2))
} finally {
  close()
}
