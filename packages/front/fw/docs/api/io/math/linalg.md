---
module: linalg
category: io/math
dependencies: []
returns: object
worker-safe: true
status: complete
---

# linalg

> 2D/3D/4D linear algebra — vectors + column-major matrices, gl-matrix style.

**Module** `linalg` | **Source** `packages/front/fw/src/io/math/linalg.js` | **Deps** none | **Worker-safe** yes

Linear algebra primitives for graphics, physics, and geometric computation. [gl-matrix](https://github.com/toji/gl-matrix) style: `Float32Array`, functions with out-parameter for zero allocation in hot paths. Column-major matrices (compatible with WebGL/OpenGL).

## Resolve

```js
const linalg = runtime.resolve('linalg');
// Returns: { vec2, vec3, vec4, mat3, mat4 }
```

## API

### Vectors (`vec2`, `vec3`, `vec4`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `(arr?) => Float32Array` | Vector (zeros or initial values) |
| `add` | `(out, a, b) => out` | `a + b` |
| `sub` | `(out, a, b) => out` | `a - b` |
| `mul` | `(out, a, b) => out` | Component-wise |
| `scale` | `(out, v, s) => out` | `v * s` |
| `dot` | `(a, b) => number` | Dot product |
| `cross` | `(out, a, b) => out` | Cross product (vec3 only) |
| `length` | `(v) => number` | Norm |
| `normalize` | `(out, v) => out` | Unit vector |
| `distance` | `(a, b) => number` | Euclidean distance |
| `lerp` | `(out, a, b, t) => out` | Linear interpolation |
| `equals` | `(a, b, eps?) => boolean` | Comparison with epsilon |

### Matrices (`mat3`, `mat4`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `() => Float32Array` | Identity matrix |
| `identity` | `(out) => out` | Resets to identity |
| `multiply` | `(out, a, b) => out` | `a * b` |
| `translate` | `(out, m, v) => out` | Translation |
| `rotate` | `(out, m, rad, axis?) => out` | Rotation (axis = vec3 for mat4) |
| `scale` | `(out, m, v) => out` | Scale |
| `invert` | `(out, m) => boolean` | Inverse; `false` if singular |
| `transpose` | `(out, m) => out` | Transpose |
| `transform` | `(out, m, v) => out` | Applies the matrix to the vector |

**Additional mat4 methods**:

| Method | Description |
|--------|-------------|
| `perspective(out, fovY, aspect, near, far)` | Perspective matrix |
| `ortho(out, l, r, b, t, near, far)` | Orthographic projection |
| `lookAt(out, eye, center, up)` | View matrix |
| `transform4(out, m, vec4)` | Transforms without perspective divide |

## Examples

### Basic 3D pipeline

```js
const linalg = runtime.resolve('linalg');
const { vec3, mat4 } = linalg;

// Matrices
const model = mat4.create();
mat4.translate(model, model, [0, 0, -5]);
mat4.rotate(model, model, Math.PI / 4, [0, 1, 0]);

const view = mat4.create();
mat4.lookAt(view, [0, 2, 5], [0, 0, 0], [0, 1, 0]);

const proj = mat4.create();
mat4.perspective(proj, Math.PI / 3, 16 / 9, 0.1, 1000);

// MVP
const mvp = mat4.create();
mat4.multiply(mvp, proj, view);
mat4.multiply(mvp, mvp, model);

// Transform a point
const point = vec3.create([1, 0, 0]);
const result = vec3.create();
mat4.transform(result, mvp, point);
```

### Vectors

```js
const { vec3 } = linalg;

const a = vec3.create([3, 4, 0]);
const b = vec3.create([1, 0, 0]);

console.log(vec3.length(a));          // 5
console.log(vec3.dot(a, b));           // 3
const n = vec3.create();
vec3.normalize(n, a);                  // [0.6, 0.8, 0]
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const { mat4, vec3 } = libs.linalg;
        const m = mat4.create();
        mat4.rotate(m, m, args.angle, args.axis);
        const out = vec3.create();
        mat4.transform(out, m, args.point);
        return Array.from(out);
    },
    { dependencies: ['linalg'], args: { angle: Math.PI / 2, axis: [0, 1, 0], point: [1, 0, 0] } }
);
```

## Notes

- Aliasing safe: `add(a, a, b)` is valid — operations read inputs before writing.
- Column-major: the 4th column of mat4 contains the translation (`m[12]`, `m[13]`, `m[14]`). Pass directly to `gl.uniformMatrix4fv(loc, false, mat4)`.
- No quaternions — for chained rotations without gimbal lock, see the separate `linalg-quat` plan.
- `Float32Array` precision: for high-precision computation, use `Float64Array` + adapted functions.

## See also

- [geom](./geom.md) — 2D geometry (Rect, Circle, hit-test)
- [interp](./interp.md) — spatial interpolation (Bézier, bicubic)
- [stats](./stats.md) — descriptive statistics
