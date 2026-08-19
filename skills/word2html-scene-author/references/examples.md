# Compact package examples

## Generic sine function

```json
{
  "format": "word2html.lesson-package",
  "formatVersion": "0.1",
  "kind": "lesson-plan",
  "apiVersion": "lesson-plan-0.9",
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
  "apiVersion": "lesson-plan-0.9",
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

## Multi-trail mathematical curve

For a curve that is not a single-valued `y=f(x)` but can be traced by at most four explicit points, use `experiment.motion.point-2d` with `subject: "math"`. Put reusable parameter expressions in `metrics`, use fixed additional bodies for notable points, and use vectors for geometric helper lines. The reviewed hyperbola example is `../../examples/lesson-packages/06-hyperbola-focus-difference.word2html.json`.
