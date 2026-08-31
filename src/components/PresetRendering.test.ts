import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { STYLE_PRESETS, applyStylePreset } from '../core/appearancePresets'
import { validateLessonScene } from '../core/validateScene'
import { createEllipseScene } from '../templates/ellipseTemplate'
import { createGenericFunctionScene } from '../templates/genericFunctionTemplate'
import { createQuadraticScene } from '../templates/quadraticTemplate'
import { createTimeExperimentScene } from '../templates/timeExperimentTemplate'
import { EllipseCanvas } from './EllipseCanvas'
import { GenericFunctionCanvas } from './GenericFunctionCanvas'
import { QuadraticCanvas } from './QuadraticCanvas'
import { TimeExperimentCanvas } from './TimeExperimentCanvas'

describe('preset rendering across installed runtimes', () => {
  it('renders every controlled style in ellipse, quadratic, function, and experiment canvases', () => {
    const sources = [
      {
        scene: createEllipseScene(),
        render: (scene: ReturnType<typeof createEllipseScene>) => renderToStaticMarkup(createElement(EllipseCanvas, {
          scene, angle: 0.72, trailAngles: [], zoom: 1, onAngleChange: () => undefined,
        })),
      },
      {
        scene: createQuadraticScene(),
        render: (scene: ReturnType<typeof createQuadraticScene>) => renderToStaticMarkup(createElement(QuadraticCanvas, { scene, zoom: 1 })),
      },
      {
        scene: createGenericFunctionScene({
          expression: 'sin(x)', formula: 'y=sin(x)', xMin: -6, xMax: 6, parameters: [],
        }, { title: '正弦函数', topic: '三角函数', summary: '观察曲线。' }),
        render: (scene: ReturnType<typeof createEllipseScene>) => renderToStaticMarkup(createElement(GenericFunctionCanvas, { scene, zoom: 1 })),
      },
      {
        scene: createTimeExperimentScene({
          durationExpression: '2', bodyId: 'ball', bodyLabel: '小球',
          xExpression: 't', yExpression: '1', formula: 'x=t', conclusion: '匀速运动。',
          parameters: [], metrics: [], vectors: [],
        }, { title: '匀速运动', topic: '运动', subject: 'physics', summary: '观察运动。' }),
        render: (scene: ReturnType<typeof createEllipseScene>) => renderToStaticMarkup(createElement(TimeExperimentCanvas, { scene, time: 1, zoom: 1 })),
      },
    ]

    for (const source of sources) {
      for (const preset of STYLE_PRESETS) {
        const scene = applyStylePreset(source.scene, preset.id)
        expect(validateLessonScene(scene).valid, `${scene.templateRef.id}/${preset.id}`).toBe(true)
        const html = source.render(scene)
        expect(html).toContain(`data-theme="${scene.appearance.theme}"`)
        expect(html).toContain(scene.appearance.curveColor)
      }
    }
  })
})
