---
module: svg3d/svg3d
category: svg3d
name: graphic.svg3d
type: fw.dom.graphic
dependencies: [svg3d.vec3, svg3d.mesh, svg3d.project, svg3d.apply, graphic.svgBuild, graphic.scopedIds, graphic.timeline, graphic.tween, graphic.svgApply, graphic.scheduler]
returns: "{ Svg3d, createTerrain }"
worker-safe: false
status: complete
---

# svg3d/svg3d — `graphic.svg3d`

> A software-3D heightmap terrain in SVG, orbited by a camera on the shared scheduler.

**Module** `graphic.svg3d` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/svg3d/svg3d.js` | **Deps** `svg3d.vec3`, `svg3d.mesh`, `svg3d.project`, `svg3d.apply`, `graphic.svgBuild`, `graphic.scopedIds`, `graphic.timeline`, `graphic.tween`, `graphic.svgApply`, `graphic.scheduler` | **Worker-safe** no

## Descriptor

`graphic.svg3d` is one capture-free fw module descriptor. Its factory takes the ten
resolved dependencies as parameters (`vec3Api`, `meshApi`, `projectApi`,
`applyApi`, `svgBuild`, `scopedIds`, `timelineMod`, `tweenMod`, `svgApply`,
`schedulerMod`) and returns `{ Svg3d, createTerrain }`. `vec3Api` is resolved but
not called directly: rotation and projection go through `svg3d.project`.

```js
export const svg3dModule = {
    name: 'graphic.svg3d',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['svg3d.vec3', 'svg3d.mesh', 'svg3d.project', 'svg3d.apply',
        'graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline',
        'graphic.tween', 'graphic.svgApply', 'graphic.scheduler'],
    deps: [svg3dVec3Module, svg3dMeshModule, svg3dProjectModule, svg3dApplyModule,
        svgBuildModule, scopedIdsModule, timelineModule, tweenModule,
        svgApplyModule, schedulerModule],
    factory(vec3Api, meshApi, projectApi, applyApi, svgBuild, scopedIds,
        timelineMod, tweenMod, svgApply, schedulerMod) { /* … */ return { Svg3d, createTerrain }; },
};
```

`deps.map(d => d.name) === dependencies` (same order). The four `svg3d.*` kernels
are not `graphicModules` members.

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `Svg3d` | `class Svg3d(host?, heightmap, opts?)` | Decodes the heightmap, builds the mesh and the SVG rig, renders the rest pose at once. |
| `createTerrain` | `(host?, heightmap, opts?) => Svg3d` | Convenience: `new Svg3d(...)`. |
| `Svg3d#node` | `SVGElement` | The built `<svg>` root; appended to `host` when it has `appendChild`. |
| `Svg3d#mode` | `'path' \| 'polygons'` | The DOM strategy in force. |
| `Svg3d#mesh` | `Mesh` | The static precomputed mesh. |
| `Svg3d#camera` | `Camera` | The live camera, mutated in place by the orbit. |
| `Svg3d#prefix` | `string` | The id-scope prefix in force. |
| `Svg3d#play` | `() => this` | Start or resume the orbit from the current angle. No-op if playing or disposed. |
| `Svg3d#pause` | `() => this` | Unregister the orbit timeline and render tickable; the camera stays. No-op if not playing or disposed. |
| `Svg3d#seek` | `(ms) => this` | Set the camera from a linear fraction of `ms` (wrapped into `[0, duration)`) and render now. |
| `Svg3d#setCamera` | `(partial) => this` | `Object.assign` a partial camera and render now. No-op when disposed. |
| `Svg3d#dispose` | `() => void` | Unregister from the scheduler, unbind the pointer look, detach `node`. Idempotent. |

### Options (`Svg3dOptions`)

| Option | Default | Meaning |
|--------|---------|---------|
| `mode` | `'path'` | `'path'`: bucketed path rewrite. `'polygons'`: one `<polygon>` per face, at most 2048 triangles. |
| `maxTriangles` | `8192` | Path-mode ceiling; may be raised up to 51200. |
| `buckets` | `16` | Path-mode bucket count (shading fidelity). |
| `faceColors` | `false` | Path mode: per-face colour classes; `true` is `{ base: 6, shade: 6 }`, or pass `{ base?, shade? }`. |
| `events` | none | The resolved fw `dom/query/events` module: enables the pointer look. |
| `spacing`, `heightScale` | mesh defaults (`40`, `220`) | Forwarded to `svg3d.mesh` `buildGridMesh`. |
| `width`, `height` | `1280`, `800` | Viewport size, px. |
| `camera` | see below | Partial override merged over `createCamera`'s defaults. |
| `duration` | `4000` | Milliseconds for one full orbit cycle. |
| `yawTurns` | `1` | Yaw revolutions per cycle. |
| `pitchSpan` | `0` | Pitch change (radians) per cycle; `0` keeps the pitch fixed. |
| `loop` | `true` | Start the next cycle automatically, from the current angle. |
| `prefix` | `svg3d-<n>` | Id-scope prefix; distinct per instance by default. |
| `scheduler` | shared | Override the scheduler (tests, isolation). |

`heightmap` is one of the two shapes `svg3d.mesh` accepts: `{ side, heights }` or
`{ data, width, height }`.

## Notes

- **Throws**: `TypeError` / `RangeError` from `decodeHeightmap` on a malformed
  heightmap; `graphic.svg3d: heightmap side <n> is too small (needs >= 2)`;
  `graphic.svg3d: mode:'polygons' supports at most 2048 triangles, got <n> — …`;
  `graphic.svg3d: maxTriangles <n> exceeds the measured hard ceiling 51200 …`;
  `graphic.svg3d: mesh has <n> triangles, exceeds the <ceiling>-triangle ceiling …`.
  A mesh of `cells` quads per side has `2·cells²` triangles (64 cells is 8192).
- **Orbit on the frozen engine**: each cycle is a `Timeline` of two linear
  `Tween`s on `camera.ry` (yaw) and `camera.rx` (pitch). A separate render
  tickable is added to the same scheduler immediately after the timeline, so
  both angles are updated before the frame is projected and painted. No second
  animation-frame loop.
- Without `loop`, a finished orbit also unregisters the render tickable, leaving
  the scheduler clean.
- `seek` is deliberately linear whatever easing applies elsewhere, and does not
  start or stop the orbit. Its zero reference is the camera angle at the first
  `seek`, so repeated seeks do not drift.
- **Default camera** (from `svg3d.project`): `rx` 0.55, `y` −900, `depth` 900.
- **Pointer look** (with `events`): a transparent rect is inserted behind the
  faces so the whole viewport takes the press. A press pauses the orbit; a drag
  sets `ry = ry₀ + (x₀ − x)/width · π` and `rx = clamp(rx₀ − (y₀ − y)/height ·
  π/2, −π/2, π/2)` from the drag distance (not accumulated); `play()` resumes
  the orbit.
- Triangles nearer than `camera.near` are dropped whole (no near-plane
  clipping); see [svg3d/project](./project.md).
- Colours come only from the mesh's build-time lookup table; no colour string is
  built per frame.
- Not Worker-safe; the pure kernels `svg3d.vec3`, `svg3d.mesh` and `svg3d.project`
  are.
- Types: `types/main.d.ts` does not declare `Svg3d`, `createTerrain` or
  `Svg3dOptions`; the tables above are taken from the source JSDoc.

## See also

- [svg3d/mesh](./mesh.md) — heightmap decode and grid mesh
- [svg3d/project](./project.md) — the per-frame projection
- [svg3d/apply](./apply.md) — the two DOM write strategies
- [svg3d/vec3](./vec3.md) — the rotation kernel
- [anim/timeline](../anim/timeline.md) — the orbit's timeline
- [svg3d guide](../../svg3d.md) — the long form
