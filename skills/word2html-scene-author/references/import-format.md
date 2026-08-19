# Word2HTML lesson package 0.1

Use UTF-8 JSON and the `.word2html.json` suffix.

```json
{
  "format": "word2html.lesson-package",
  "formatVersion": "0.1",
  "kind": "lesson-plan",
  "apiVersion": "lesson-plan-0.9",
  "plan": {}
}
```

All five properties are required and no other top-level properties are allowed. `plan` must satisfy `src/schema/lesson-plan.schema.json` in the Word2HTML repository and the semantic restrictions enforced by `src/core/modelGateway.ts`.

The application also accepts legacy raw LessonScene 0.1 JSON files. New model-authored artifacts must use the compact package above because it costs fewer tokens and lets the trusted local runtime construct the full scene.
Packages authored for `lesson-plan-0.6`, `lesson-plan-0.7`, and `lesson-plan-0.8` remain import-compatible, but all newly authored packages must use `lesson-plan-0.9`.

## Import behavior

- The importer validates the envelope, API version, LessonPlan schema, safe expressions, physical constraints, resulting LessonScene, and installed renderer.
- A successful import is cloned with imported lineage and automatically saved to the local third-party library as `pending`.
- An imported file cannot mark itself `official` or `verified`. Trust status comes from the application catalog or a future review service.
- Import failure leaves the current scene unchanged.

## Expressions

- Use only numbers, ASCII identifiers, `+ - * / ^`, parentheses, commas, spaces, safe constants, and safe math functions.
- Do not use assignment, property access, arrays, strings, statements, HTML, or JavaScript.
- Declare a value before referencing it. Parameters and earlier metrics may be reused in later expressions.
- Keep identifiers stable and use letters, digits, and underscore, beginning with a letter.

For `experimentSpec.vectors`, use optional `display: "distance"` when the line represents a geometric distance. Set `scale` to `1` and make `(xExpression, yExpression)` equal to target coordinates minus the anchored body's coordinates. The renderer draws a straight segment without an arrowhead and labels its actual magnitude. Omit `display` or use `"arrow"` for physical vectors. Use `labelMode: "value"` to show only the numeric magnitude; omit it or use `"full"` to show label, value, and unit.

Body labels are coordinate prefixes: the renderer appends `(x,y)`. Use `bodyLabel: "P"` or an additional body `label: "Q"` to display `P(x,y)` or `Q(x,y)`; do not put coordinate placeholders in the label itself.
