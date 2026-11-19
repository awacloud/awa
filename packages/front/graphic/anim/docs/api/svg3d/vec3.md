---
module: svg3d/vec3
category: svg3d
name: svg3d.vec3
type: lib.graphic.svg3d
dependencies: []
returns: "{ dot3, cross3, length3, rotationMatrix3, applyMatrix3 }"
worker-safe: true
status: complete
---

# svg3d/vec3 — `svg3d.vec3`

> Pure 3D vector and 3×3 rotation kernel, with caller-owned output buffers.

**Module** `svg3d.vec3` | **Type** `lib.graphic.svg3d` | **Source** `packages/front/graphic/anim/src/svg3d/vec3.js` | **Deps** none | **Worker-safe** yes

## Descriptor

`svg3d.vec3` is a capture-free descriptor with no dependencies, no DOM and no
Canvas. Its factory takes no parameter and returns five functions. It carries a
non-`graphic.*` name on purpose: it is a sibling kernel injected into
`svg3d.mesh` and `svg3d.project` and pulled by `registerDeep`, not a
`graphicModules` member.

```js
export const svg3dVec3Module = {
    name: 'svg3d.vec3',
    type: 'lib.graphic.svg3d',
    version: '0.1.0',
    dependencies: [],
    deps: [],
    factory() { /* … */ return { dot3, cross3, length3, rotationMatrix3, applyMatrix3 }; },
};
```

`graphic.matrix` is 2D-affine only; a 3-axis rotation needs this separate kernel.

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `dot3` | `(ax, ay, az, bx, by, bz) => number` | Dot product. |
| `cross3` | `(ax, ay, az, bx, by, bz, out) => out` | Cross product `a × b` written into the 3-slot `out`. |
| `length3` | `(x, y, z) => number` | Euclidean length. |
| `rotationMatrix3` | `(rx, ry, rz, out?) => Float64Array` | Composed row-major 3×3 for the axis order `ry`, then `rx`, then `rz` (`M = Rz · Rx · Ry`); `rx` pitch, `ry` yaw, `rz` roll, in radians. Allocates a `Float64Array(9)` when `out` is omitted. |
| `applyMatrix3` | `(m, x, y, z, out) => out` | Apply a row-major 3×3 to a vector, writing `out[0..2]`. |

## Notes

- Scalar arguments and caller-owned output arrays: no `{x,y,z}` objects are
  allocated. Output is `out` itself.
- Row-major layout: `m[0..2]` is the first row.
- `cross3` follows the face-normal convention `n = (p1 − p2) × (p3 − p2)` used
  by `svg3d.mesh`.
- Hoisting the trig into one composed matrix was kept for allocation discipline
  and Worker portability; the JSDoc states it measured within noise on speed.
- No `@throws`: arguments are not validated.
- The source references no `document`, `window` or Canvas API.
- Types: `src/svg3d/vec3.d.ts` declares only `svg3dVec3Module` as a
  `GraphicModuleDescriptor`.

## See also

- [svg3d/mesh](./mesh.md) — uses `cross3` and `length3`
- [svg3d/project](./project.md) — uses `rotationMatrix3`
- [svg3d guide](../../svg3d.md) — the long form
