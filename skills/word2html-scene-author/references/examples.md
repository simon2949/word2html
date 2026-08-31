# Compact package examples

## Generic sine function

```json
{
  "format": "word2html.lesson-package",
  "formatVersion": "0.1",
  "kind": "lesson-plan",
  "apiVersion": "lesson-plan-1.4",
  "plan": {
    "schemaVersion": "0.1",
    "status": "matched",
    "subject": "math",
    "topic": "正弦函数的振幅与频率",
    "templateId": "math.function.generic-2d",
    "parameterOverrides": {},
    "functionSpec": {
      "expression": "A*sin(B*x)",
      "formula": "y = A sin(Bx)",
      "xMin": -10,
      "xMax": 10,
      "parameters": [
        { "id": "A", "label": "振幅 A", "value": 2, "min": 0.5, "max": 5, "step": 0.1 },
        { "id": "B", "label": "频率 B", "value": 1, "min": 0.2, "max": 3, "step": 0.1 }
      ]
    },
    "reason": "用安全函数运行时观察振幅和频率变化。"
  }
}
```

## Free fall

```json
{
  "format": "word2html.lesson-package",
  "formatVersion": "0.1",
  "kind": "lesson-plan",
  "apiVersion": "lesson-plan-1.4",
  "plan": {
    "schemaVersion": "0.1",
    "status": "matched",
    "subject": "physics",
    "topic": "自由落体运动",
    "templateId": "experiment.motion.point-2d",
    "parameterOverrides": {},
    "experimentSpec": {
      "durationExpression": "sqrt(2*h0/g)",
      "xExpression": "0",
      "yExpression": "max(0,h0-0.5*g*t^2)",
      "formula": "h(t) = h0 - 0.5gt^2",
      "conclusion": "忽略空气阻力时，下落加速度保持为 g。",
      "parameters": [
        { "id": "h0", "label": "初始高度", "value": 20, "min": 2, "max": 50, "step": 1 },
        { "id": "g", "label": "重力加速度", "value": 9.8, "min": 1, "max": 15, "step": 0.1 }
      ],
      "metrics": [
        { "id": "height", "label": "当前高度", "expression": "max(0,h0-0.5*g*t^2)", "unit": "m" },
        { "id": "speed", "label": "当前速度", "expression": "g*t", "unit": "m/s" }
      ],
      "vectors": [
        { "id": "velocity", "label": "速度", "xExpression": "0", "yExpression": "0-g*t", "scale": 0.1, "unit": "m/s" }
      ]
    },
    "reason": "用点运动运行时演示高度和速度随时间变化。"
  }
}
```

## Relation curves

Use `math.curve.relation-2d` for a single non-explicit curve that does not need playback, helper points, or distance lines. The maintained implicit-circle example is `../../examples/lesson-packages/09-implicit-circle.word2html.json`; copy its compact envelope and change only the mode-specific expressions, ranges, parameters, formula, and conclusion. Never copy runtime-generated samples into a package.

## Animated multi-trail mathematical curve

For a curve that needs playback, moving points, focus-distance helper lines, or up to four independently traced points, use `experiment.motion.point-2d` with `subject: "math"`. Put reusable parameter expressions in `metrics`, use fixed additional bodies for notable points, and use vectors for geometric helper lines. The reviewed hyperbola example is `../../examples/lesson-packages/06-hyperbola-focus-difference.word2html.json`.

## Data table and statistical charts

Use `math.data.chart-2d` for compact categorical or scatter data. The maintained two-series line-chart example is `../../examples/lesson-packages/11-monthly-temperature-chart.word2html.json`; copy its package envelope and change only the teaching text, axis labels, unit, categories, and series. Use `values` for `table`, `bar`, and `line`; use `{x,y}` `points` and omit categories for `scatter`. Never generate SVG or chart-library options.

## Draggable plane geometry

Use `math.geometry.primitives-2d` when the teaching object is a finite construction rather than a continuous function or time trace. This example reuses three points for its polygon and measurements.

```json
{
  "format": "word2html.lesson-package",
  "formatVersion": "0.1",
  "kind": "lesson-plan",
  "apiVersion": "lesson-plan-1.4",
  "plan": {
    "schemaVersion": "0.1",
    "status": "matched",
    "subject": "math",
    "topic": "三角形的边、角与面积",
    "templateId": "math.geometry.primitives-2d",
    "parameterOverrides": {},
    "geometrySpec": {
      "formula": "S = 1/2 |(B-A) × (C-A)|",
      "conclusion": "拖动顶点，观察边长、角度和面积同步变化。",
      "parameters": [
        { "id": "Ax", "label": "A 点横坐标", "value": 0, "min": -8, "max": 8, "step": 0.1 },
        { "id": "Ay", "label": "A 点纵坐标", "value": 0, "min": -6, "max": 6, "step": 0.1 }
      ],
      "points": [
        { "id": "A", "label": "A", "xExpression": "Ax", "yExpression": "Ay", "draggable": true },
        { "id": "B", "label": "B", "xExpression": "3", "yExpression": "0" },
        { "id": "C", "label": "C", "xExpression": "0", "yExpression": "4" }
      ],
      "connections": [
        { "id": "AB", "label": "线段 AB", "kind": "segment", "fromPointId": "A", "toPointId": "B" }
      ],
      "arcs": [
        { "id": "angleA", "label": "∠A", "centerPointId": "A", "startPointId": "B", "endPointId": "C" }
      ],
      "polygons": [
        { "id": "ABC", "label": "三角形 ABC", "pointIds": ["A", "B", "C"], "filled": true }
      ],
      "measurements": [
        { "id": "AB", "label": "AB", "kind": "distance", "pointIds": ["A", "B"], "unit": "" },
        { "id": "angleBAC", "label": "∠BAC", "kind": "angle", "pointIds": ["B", "A", "C"], "unit": "°" },
        { "id": "areaABC", "label": "面积", "kind": "area", "pointIds": ["A", "B", "C"], "unit": "" }
      ],
      "loci": []
    },
    "reason": "用声明式二维几何原语演示三角形测量。"
  }
}
```

For constructed points, constrained dragging, and a locally sampled rotation locus, reuse the maintained `../../examples/lesson-packages/10-geometry-rotation-locus.word2html.json` example. Change the compact construction references, expressions, parameter ranges, teaching text, and locus driver; do not copy any rendered coordinates or path data.

## Deterministic circular contact

For actual body-body and body-boundary contact, use `physics.collision.discs-2d`, not hand-authored piecewise trajectories. The maintained three-disc example is `../../examples/lesson-packages/08-collision-discs-2d.word2html.json`; it demonstrates separate mass, `vx`, and `vy` parameters for all three discs. Copy its envelope and change only the initial-state expressions, physical parameters, teaching formula, and conclusion.
