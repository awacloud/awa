---
module: interp
category: io/math
dependencies: []
returns: object
worker-safe: true
status: complete
---

# interp

> Spatial interpolation — linear, bicubic, Bézier, Catmull-Rom, barycentric.

**Module** `interp` | **Source** `packages/front/fw/src/io/math/interp.js` | **Deps** none | **Worker-safe** yes

Non-temporal interpolation for 2D fields (textures, heightmaps), path splines, pose blending. Distinct from [`easing`](../calc/easing.md) (temporal animations). All functions are pure — no mutation except `vec` which takes an `out`.

## Resolve

```js
const interp = runtime.resolve('interp');
// Returns: { linear, smoothstep, smootherstep, cubicHermite, catmullRom, bezier2, bezier3, bilinear, bicubic, vec, barycentric, sample, sample2D }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `linear` | `(a, b, t) => number` | `a + t*(b-a)` |
| `smoothstep` | `(edge0, edge1, x) => number` | GLSL standard, clamped |
| `smootherstep` | `(edge0, edge1, x) => number` | 6t⁵ - 15t⁴ + 10t³ |
| `cubicHermite` | `(p0, p1, m0, m1, t) => number` | Hermite cubic |
| `catmullRom` | `(p0, p1, p2, p3, t, alpha?) => number` | Centripetal by default (α=0.5) |
| `bezier2` | `(p0, p1, p2, t) => number` | Quadratic Bézier |
| `bezier3` | `(p0, p1, p2, p3, t) => number` | Cubic Bézier |
| `bilinear` | `(q11, q21, q12, q22, x, y) => number` | 2D bilinear interpolation |
| `bicubic` | `(samples4x4, x, y) => number` | 4×4 Catmull-Rom |
| `vec` | `(out, a, b, t) => out` | Vector lerp (n-dimensional) |
| `barycentric` | `(p, a, b, c) => {u, v, w}` | Barycentric coordinates |
| `sample` | `(samples, t) => number` | Lerp over indexed 1D array |
| `sample2D` | `(samples, w, h, x, y) => number` | Bilinear over 2D grid |

## Examples

### Path spline (Catmull-Rom)

```js
const interp = runtime.resolve('interp');

const controlPoints = [0, 1, 4, 2, 5]; // y values
const t = 0.5; // position within segment p1..p2

const y = interp.catmullRom(
    controlPoints[0], controlPoints[1],
    controlPoints[2], controlPoints[3],
    t
);
```

### Bézier UI (S-curve)

```js
// Cubic Bézier for ease-in-out animation
function easeInOut(t) {
    return interp.bezier3(0, 0.25, 0.75, 1, t);
}
```

### Bilinear heightmap

```js
// 3x3 height grid
const grid = [1, 2, 1, 3, 5, 3, 1, 2, 1];
const height = interp.sample2D(grid, 3, 3, 0.5, 0.5); // centre = 5

// 4x4 grid for bicubic (smoother)
const height2 = interp.bicubic(grid4x4, 0.5, 0.5);
```

### Pose blending (barycentric)

```js
const { u, v, w } = interp.barycentric(cursor, vertA, vertB, vertC);
const blended = {
    x: u * poseA.x + v * poseB.x + w * poseC.x,
    y: u * poseA.y + v * poseB.y + w * poseC.y,
};
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const interp = libs.interp;
        // Interpolate a grid of values in a worker
        const result = interp.bilinear(args.grid, args.x, args.y);
        self.postMessage(result);
    },
    { dependencies: ['interp'], args: { grid: [[0, 1], [1, 2]], x: 0.5, y: 0.5 } }
);
```

## Notes

- `t` is free — extrapolation outside `[0, 1]` is allowed for `linear`, `bezier*`, `catmullRom`. `smoothstep`/`smootherstep` clamp.
- Catmull-Rom α=0.5 (centripetal) recommended for visual splines — avoids loops on close points. α=0 (uniform), α=1 (chordal).
- `bicubic` more expensive than `bilinear` — prefer `bilinear` for real-time sampling, `bicubic` for image upscaling.
- **Distinct from `easing`** (io/calc): `easing` is for animations (time), `interp` is for space (positions, fields).

## See also

- [easing](../calc/easing.md) — temporal interpolation for animations
- [geom](./geom.md) — 2D geometry (Bézier paths in geom)
- [linalg](./linalg.md) — linear algebra for transforms
