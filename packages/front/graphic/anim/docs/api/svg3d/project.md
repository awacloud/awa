---
module: svg3d/project
category: svg3d
name: svg3d.project
type: lib.graphic.svg3d
dependencies: [svg3d.vec3]
returns: "{ SHADE_LEVELS, createCamera, createFrameBuffers, projectFrame }"
worker-safe: true
status: complete
---

# svg3d/project — `svg3d.project`

> Per-frame projection: rotate, perspective divide, backface cull, shade, painter sort.

**Module** `svg3d.project` | **Type** `lib.graphic.svg3d` | **Source** `packages/front/graphic/anim/src/svg3d/project.js` | **Deps** `svg3d.vec3` | **Worker-safe** yes

## Descriptor

`svg3d.project` is a capture-free descriptor. Its factory takes the resolved
`svg3d.vec3` as `vec3` and returns the constant and three functions. It has a
non-`graphic.*` name on purpose and is not a `graphicModules` member.

```js
export const svg3dProjectModule = {
    name: 'svg3d.project',
    type: 'lib.graphic.svg3d',
    version: '0.1.0',
    dependencies: ['svg3d.vec3'],
    deps: [svg3dVec3Module],
    factory(vec3) { /* … */ return { SHADE_LEVELS, createCamera, createFrameBuffers, projectFrame }; },
};
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `SHADE_LEVELS` | `33` | Fallback shade levels; a mesh from `svg3d.mesh` carries its own `shadeLevels`, which wins. |
| `createCamera` | `(opts?) => Camera` | Build a camera. Options: `width` (1280), `height` (800), `depth` (900), `near` (1), `x` (0), `y` (−900), `z` (0), `rx` (0.55), `ry` (0), `rz` (0). |
| `createFrameBuffers` | `(mesh) => FrameBuffers` | Allocate the reusable per-frame buffers, once per mesh. |
| `projectFrame` | `(mesh, camera, buf?) => number` | Project one frame; returns the number of visible faces. Allocates nothing. |

`Camera`: `{ x, y, z, rx, ry, rz, depth, near, offsetX, offsetY }`, where
`offsetX = width/2` and `offsetY = height/2`, `rx` pitch, `ry` yaw and `rz` roll
in radians.

`FrameBuffers`: `px`, `py` (projected screen coordinates per vertex), `pz`
(projected scale, the painter key), `depth` (per-face mean scale), `shadeQ`
(per-face quantised shade), `order` (face indices, only `[0, count)` meaningful),
`scratch` (sort scratch) and `m` (the reusable 3×3 matrix).

After `projectFrame`, `buf.order[0..count)` lists the visible faces far to near;
for face `f`, `buf.depth[f]` is its painter key and `buf.shadeQ[f]` its shade.

## Notes

- **Pipeline**: rotate every vertex about the camera by the composed matrix;
  perspective divide `scale = camera.depth / rotatedZ`, then `x' = scale·rx +
  offsetX`, `y' = scale·ry + offsetY`; backface cull keeping faces with
  `n · (camera − centroid) > 0`; shade `1 − dp/|c|/|n|` quantised into
  `SHADE_LEVELS`; painter sort by ascending mean depth (far first).
- **Near-distance drop, no clipping**: a triangle with any vertex behind the
  camera plane or nearer than `camera.near` is dropped whole, never split. A
  triangle straddling the camera plane therefore disappears. Keep the camera far
  enough back; the default camera frames meshes up to 8192 triangles safely.
- The sort is stable (bottom-up merge over the scratch buffer): equal depths keep
  ascending face index.
- **Without `buf`**: `projectFrame(mesh, camera)` uses a per-mesh buffer cache
  (a `WeakMap`), created on the first frame and reused after.
- No `@throws`: arguments are not validated.
- Types: `src/svg3d/project.d.ts` declares only `svg3dProjectModule` as a
  `GraphicModuleDescriptor`.

## See also

- [svg3d/vec3](./vec3.md) — `rotationMatrix3`
- [svg3d/mesh](./mesh.md) — the mesh this module projects
- [svg3d/apply](./apply.md) — paints the projected frame
- [svg3d/svg3d](./svg3d.md) — the composed module
- [svg3d guide](../../svg3d.md) — the long form
