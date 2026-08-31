# Runtime capability matrix

| Runtime | Suitable content | Limits |
|---|---|---|
| `math.conic.ellipse-focus-sum` | Ellipse axes, foci, draggable point, constant distance sum | Reviewed template; only major/minor axes are planned |
| `math.function.quadratic-vertex` | `y=a(x-h)^2+k`, vertex, symmetry, opening | Reviewed template; `a`, `h`, `k` only |
| `math.function.generic-2d` | Explicit single-variable `y=f(x)` curves | One curve, at most 6 numeric parameters, `-50 <= x <= 50` |
| `math.curve.relation-2d` | Parametric `x(t), y(t)`, polar `r(theta)`, or implicit `F(x,y)=0` curves | One curve, at most 8 numeric parameters; viewport `[-100,100]`; deterministic local sampling |
| `math.geometry.primitives-2d` | Plane constructions, point transformations, drag constraints, locally sampled loci, segments, rays, vectors, arcs, polygons, and measurements | 12 parameters, 12 points, 4 loci, 16 connections, 6 arcs, 4 polygons, 6 measurements |
| `math.data.chart-2d` | Data tables, grouped bar charts, line charts, and scatter plots | Math only; 1–4 series; 1–24 categories or 1–60 points per scatter series; finite values with absolute value at most `1e9` |
| `experiment.motion.point-2d` | Mathematical parametric traces, free fall, projectile, oscillators, analytic one-dimensional motion, up to 4 points | Explicit `x(t)`, `y(t)`; math or physics; up to 6 parameters, 4 arrow/distance vectors, 4 metrics, 4 rope/spring constraints |
| `physics.collision.discs-2d` | Actual contact and rebound among circular bodies and a rectangular boundary | Physics only; 2–8 discs, 12 parameters, 0.2–20 s, safe expressions for initial state, gravity, restitution, bounds, radius, and mass |

Supported math functions are the allowlisted functions in `src/core/mathExpression.ts`, including common trigonometric, square-root, absolute-value, exponential/logarithmic, and min/max operations. Check that file when using a less common function.

For `relationSpec`, select exactly one mode. Parametric mode requires `variableMin`, `variableMax`, `xExpression`, and `yExpression` and uses only `t`; polar mode requires `variableMin`, `variableMax`, and `radialExpression` and uses only `theta`; implicit mode requires only `implicitExpression` and uses `x` and `y`. Do not include fields belonging to another mode, sampled points, SVG paths, or contour data. Polar angles are radians.

For point labels, supply only the short prefix such as `P`, `Q`, or `F1`; the renderer appends coordinates. Distance vectors support `labelMode: "full"` for label/value/unit and `labelMode: "value"` for a numeric-only annotation.

In `geometrySpec`, every point uses either coordinate expressions or exactly one construction. Supported constructions are `midpoint`, `translation`, `rotation`, `reflection`, `dilation`, and `projection`; rotation angles are radians. Only coordinate points can be draggable or constrained to a `line`, `segment`, or `circle`. Construction and constraint references use the unprefixed IDs declared in `points`, cannot reference the point itself, and cannot form cycles. A locus declares only `pointId`, `parameterId`, and optional paired `min`/`max`; the browser samples 241 points locally. Never write samples or paths into the file. `distance` measurements reference exactly two points; `angle` references three points with the vertex in the middle; `area` references polygon vertices in boundary order. Only `expression` measurements include an expression.

Use `collisionSpec` instead of an `experimentSpec` whenever the request needs real two-dimensional contact. Bodies contain initial `x/y`, `vx/vy`, `radius`, and `mass` expressions. The trusted runtime advances them at a fixed rate, resolves wall and disc impulses, and rejects initial overlap, boundary escape, excessive projected speed, or unresolved penetration.

For `dataChartSpec`, choose `table`, `bar`, or `line` with one shared `categories` array and equally sized numeric `values` arrays. Choose `scatter` without `categories`; every series then contains only numeric `{x,y}` points. IDs are stable ASCII identifiers. The runtime owns axes, legends, scales, marks, and table markup; never include SVG, paths, rendering options, or code.

## Not currently native

- multiple independently styled relation curves, animated implicit contours, or curve intersections that require a symbolic solver;
- pie/donut charts, stacked bars, histograms with automatic binning, box plots, heatmaps, and statistical fitting;
- electrical circuits and live circuit solvers;
- molecule geometry, chemical bonds, reaction particles, and laboratory apparatus;
- maps, layers, terrain, atmospheric circulation, and geospatial data;
- non-circular rigid-body dynamics, torque/orientation simulation, fluids, fields, contact deformation, friction, and arbitrary collision geometry;
- arbitrary HTML, CSS, JavaScript, network calls, or third-party libraries.

For these requests, describe the missing primitive. Do not emit a package that will fail import. A later sandboxed extension runtime may support them under a separate security protocol.
