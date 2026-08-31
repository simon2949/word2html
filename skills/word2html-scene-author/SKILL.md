---
name: word2html-scene-author
description: Generate, validate, repair, and reuse compact `.word2html.json` lesson packages for the Word2HTML K12 interactive teaching app. Use when a user asks to create an importable math or physics demonstration, turn a lesson idea into the app's LessonPlan format, diagnose a package import error, or prepare a candidate for the official or third-party experiment library.
---

# Word2HTML Scene Author

Create compact declarative lesson packages that the app instantiates with trusted local runtimes. Never generate executable HTML, JavaScript, `eval`, remote dependencies, or a claimed official-review status.

## Workflow

1. Read `references/capability-matrix.md` and classify the request.
2. Read `references/import-format.md` before writing a package. Read `references/examples.md` only for the selected runtime.
3. Prefer the closest reviewed template. Otherwise use a generic function, relation curve, data chart, two-dimensional geometry, point-motion, or circular-contact plan when the capability matrix permits it.
4. Write one `word2html.lesson-package` JSON object. Keep teaching text concise and reuse parameter IDs and derived expressions.
5. Run `node scripts/validate-package.mjs <file>` from this skill directory. Repair every reported error before handing off the file.
6. Report the output path, chosen runtime, editable parameters, and any genuine capability limitation.

## Capability decisions

- Use `math.conic.ellipse-focus-sum` for the reviewed ellipse focus-sum demonstration.
- Use `math.function.quadratic-vertex` for reviewed vertex-form quadratic demonstrations.
- Use `math.function.generic-2d` for a single explicit curve `y=f(x)` with at most six numeric parameters.
- Use `math.curve.relation-2d` for one parametric curve `x(t), y(t)`, polar curve `r(theta)`, or implicit zero contour `F(x,y)=0`. Supply only expressions, parameters, ranges, and teaching text; the trusted runtime owns sampling and contour extraction.
- Use `math.geometry.primitives-2d` for plane constructions made from up to 12 points, including midpoint, translation, rotation, reflection, dilation, perpendicular projection, circle/line/segment drag constraints, and up to four locally sampled loci. A draggable point must bind its x/y expressions directly to two numeric parameter IDs; never author locus samples.
- Use `math.data.chart-2d` for a data table, grouped bar chart, line chart, or scatter plot. Supply compact categories and numeric series only; never author SVG, paths, chart-library options, or executable drawing code.
- Use `experiment.motion.point-2d` for up to four mathematical trace points or physical bodies whose positions are explicit `x(t)` and `y(t)` expressions, with supported metrics, vectors, ropes, and springs.
- Use `physics.collision.discs-2d` when 2–8 circular bodies need actual body-body or body-boundary contact, impulse response, restitution, and deterministic playback. Declare only initial state and physical properties; never hand-author frames or collision times.
- Stop and identify the missing renderer primitive for pie charts, histograms with automatic binning, circuits, molecule/reaction visuals, maps, fields, fluids, physical rigid-body dynamics, collision deformation, non-circular contact geometry, multiple independently styled relation curves, or requests requiring arbitrary code. Point rotation as a geometry construction is supported; rotating physical bodies with orientation and torque is not. Do not disguise unsupported content as a supported plan.

## Library trust rules

- Treat every externally generated package as third-party content. A successful import proves compatibility, not teaching correctness.
- Do not add provenance fields that claim a package is official or reviewed; the app ignores such claims.
- Add an experiment to the official library only through a reviewed source-code change with tests.
- Preserve stable topic, expression, and parameter IDs so equivalent packages share a reusable fingerprint.

## Token discipline

- Output a LessonPlan package, never a full LessonScene.
- Load only the reference for the selected runtime.
- Reuse a nearby example and change only topic-specific expressions, parameters, metrics, and annotations.
- Keep `reason`, `formula`, and `conclusion` short; do not duplicate explanations in multiple fields.
