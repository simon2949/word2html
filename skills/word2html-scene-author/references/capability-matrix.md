# Runtime capability matrix

| Runtime | Suitable content | Limits |
|---|---|---|
| `math.conic.ellipse-focus-sum` | Ellipse axes, foci, draggable point, constant distance sum | Reviewed template; only major/minor axes are planned |
| `math.function.quadratic-vertex` | `y=a(x-h)^2+k`, vertex, symmetry, opening | Reviewed template; `a`, `h`, `k` only |
| `math.function.generic-2d` | Explicit single-variable `y=f(x)` curves | One curve, at most 6 numeric parameters, `-50 <= x <= 50` |
| `experiment.motion.point-2d` | Mathematical parametric traces, free fall, projectile, oscillators, simple collisions, up to 4 points | Explicit `x(t)`, `y(t)`; math or physics; up to 6 parameters, 4 arrow/distance vectors, 4 metrics, 4 rope/spring constraints |

Supported math functions are the allowlisted functions in `src/core/mathExpression.ts`, including common trigonometric, square-root, absolute-value, exponential/logarithmic, and min/max operations. Check that file when using a less common function.

For point labels, supply only the short prefix such as `P`, `Q`, or `F1`; the renderer appends coordinates. Distance vectors support `labelMode: "full"` for label/value/unit and `labelMode: "value"` for a numeric-only annotation.

## Not currently native

- implicit curves or parametric plots that cannot be decomposed into at most four point trails;
- electrical circuits and live circuit solvers;
- molecule geometry, chemical bonds, reaction particles, and laboratory apparatus;
- maps, layers, terrain, atmospheric circulation, and geospatial data;
- rigid bodies, rotation, fluids, fields, contact deformation, and arbitrary collision geometry;
- arbitrary HTML, CSS, JavaScript, network calls, or third-party libraries.

For these requests, describe the missing primitive. Do not emit a package that will fail import. A later sandboxed extension runtime may support them under a separate security protocol.
