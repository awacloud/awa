# IO / Math

Mathematical modules for graphics, statistics, geometry and interpolation. All worker-safe.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [linalg](./linalg.md) | `{vec2, vec3, vec4, mat3, mat4}` | none | Linear algebra 2D/3D/4D (gl-matrix-style, column-major) |
| [stats](./stats.md) | object | none | Descriptive statistics (mean, median, quantile, variance, ...) |
| [geom](./geom.md) | `{Point, Rect, Circle, Line, Polygon, hitTest, transform}` | `linalg` | 2D geometry — hit-test, intersection, simplification |
| [interp](./interp.md) | object | none | Spatial interpolation (linear, bicubic, Bézier, barycentric) |
| [fixedPoint](./fixed-point.md) | `{fixed16ToFloat, floatToFixed16, …}` | none | Fixed-point ↔ float conversions (Fixed16.16, F2Dot14, FUnit) for binary I/O |

## Common pattern

```js
const linalg = runtime.resolve('linalg');

const v = linalg.vec3.create([1, 0, 0]);
const m = linalg.mat4.create(); // identity
linalg.mat4.rotate(m, m, Math.PI / 4, [0, 1, 0]);

const out = linalg.vec3.create();
linalg.mat4.transform(out, m, v);
```
