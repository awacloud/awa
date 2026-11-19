---
module: svg3d/svg3d
category: svg3d
name: graphic.svg3d
type: fw.dom.graphic
dependencies: [svg3d.vec3, svg3d.mesh, svg3d.project, svg3d.apply, graphic.svgBuild, graphic.scopedIds, graphic.timeline, graphic.tween, graphic.svgApply, graphic.scheduler]
returns: "{ Svg3d, createTerrain }"
worker-safe: partial
status: complete
---

# svg3d/svg3d — `graphic.svg3d`

> Software-3D terrain viewer in SVG — heightmap → orbiting camera → bucketed path-`d` paint.

**Module** `graphic.svg3d` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/svg3d/svg3d.js` | **Deps** `svg3d.vec3`, `svg3d.mesh`, `svg3d.project`, `svg3d.apply`, `graphic.svgBuild`, `graphic.scopedIds`, `graphic.timeline`, `graphic.tween`, `graphic.svgApply`, `graphic.scheduler` | **Worker-safe** partial (the three pure `svg3d.*` kernels are Worker-safe; this DOM/engine layer is not)

`graphic.svg3d` decodes a heightmap, builds a static grid mesh with build-time
precompute (`svg3d.mesh`), then every frame rotates/projects/culls/shades/
painter-sorts it (`svg3d.project`) and paints the result into SVG through one
of two DOM strategies (`svg3d.apply`). It is productized from a measured de-risking
spike. `graphic.matrix` is 2D-affine only — it cannot
express a 3-axis rotation or a perspective divide, which is why this software-3D
pipeline carries its own kernel.

## Worker-safe split

| File | Surface | Worker-safe |
|------|---------|-------------|
| `src/svg3d/vec3.js` (`svg3d.vec3`) | dot/cross/length + composed 3×3 rotation | **yes** |
| `src/svg3d/mesh.js` (`svg3d.mesh`) | heightmap decode + grid-mesh build + colour LUT | **yes** |
| `src/svg3d/project.js` (`svg3d.project`) | per-frame rotate/project/cull/shade/sort | **yes** |
| `src/svg3d/apply.js` (`svg3d.apply`) | the two DOM rig builders (path-`d` / polygon) | **no** — builds/mutates SVG DOM nodes |
| `src/svg3d/svg3d.js` (`graphic.svg3d`) | the composed terrain viewer | **no** — main-thread, like the other visual modules |

`svg3d.vec3`/`svg3d.mesh`/`svg3d.project` carry a **non-`graphic.*` name** on
purpose: pure sibling kernels pulled by `registerDeep`, **not** members of the
public `graphicModules` registry. `svg3d.apply` is DOM-bound but is injected
via DI for the same reason `pageflip.fold`/`pageflip.compose` are injected
into `graphic.pageflip` — it keeps `graphic.svg3d`'s own factory capture-free
(`fw/no-factory-capture`).

All four are directly importable, framework-free, through the package's
`./kernels/*` exports subpath (see "ESM / standalone surface" below and
`docs/CONTRACT.md`'s "Kernel export surface" section) — reachable from outside
the monorepo, not only by a relative import from inside this package's own
`src/`.

## Descriptor

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
            timelineMod, tweenMod, svgApply, schedulerMod) {
        /* Svg3d, createTerrain defined here */ return { Svg3d, createTerrain };
    },
};
```

`deps.map(d => d.name) === dependencies` (same order).

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { svg3dModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerDeep(svg3dModule);   // pulls svgBuild/scopedIds/timeline/tween/
                                      // svgApply/scheduler + the injected
                                      // svg3d.vec3/mesh/project/apply kernels + fw dom
const { Svg3d, createTerrain } = runtime.resolve('graphic.svg3d');
```

Or register the whole package: `new ModuleRuntime().registerAllDeep(graphicModules)`
then `resolve('graphic.svg3d')`. `graphic.svg3d` is a registry + `dist/build`
barrel member; it ships a **dedicated `dist/build` root pair** — see
[Prebuilt roots](#prebuilt-roots) below. It is **also** a bare `dist/standalone` bundle
root (`graphic-svg3d-bundled.js`), the same additional mechanism
`graphic.pageflip`/`graphic.hypertree` gained in the same task (see
[pageflip](./pageflip.md#prebuilt-roots) /
[hypertree](./hypertree.md#prebuilt-roots)) — `graphic.anim` (the aggregator)
remains the only composed root with neither.

### ESM / standalone surface

The four pure/bare-import-free leaf kernels are directly importable,
framework-free, through the package's `./kernels/*` exports subpath — a real
package specifier, never a relative import into this package's own `src/`.
(For the **composed** `Svg3d`/`createTerrain` class use the prebuilt roots
below: `src/svg3d/svg3d.js` itself reaches `src/svg/apply.js`'s bare
`@awacloud/fw/dom/query/dom.js` specifier and so needs an import map or a bundler.)

```js
import { svg3dVec3Module } from '@awacloud/graphic-anim/kernels/svg3d/vec3.js';
import { svg3dMeshModule } from '@awacloud/graphic-anim/kernels/svg3d/mesh.js';
import { svg3dProjectModule } from '@awacloud/graphic-anim/kernels/svg3d/project.js';
import { svg3dApplyModule } from '@awacloud/graphic-anim/kernels/svg3d/apply.js';

const vec3 = svg3dVec3Module.factory();
const { buildGridMesh } = svg3dMeshModule.factory(vec3);       // deps:['svg3d.vec3']
const { createCamera, createFrameBuffers, projectFrame } = svg3dProjectModule.factory(vec3);
const { createPathRig, createPolygonRig } = svg3dApplyModule.factory();

const mesh = buildGridMesh({ cells: 16 });
const camera = createCamera({});
const buf = createFrameBuffers(mesh);
const visibleCount = projectFrame(mesh, camera, buf);   // rotate/project/cull/shade/sort
```

## Prebuilt roots

The kernel imports above are the *pure* half. To get the **composed**
`Svg3d`/`createTerrain` class with no import map and no bundler, take the
bare `dist/standalone/` root, or one of the two assembled `dist/build/`
roots. Each `dist/build` name states what it needs at runtime —
**`.fw.` = fw required, `.standalone.` = nothing required** — the same
convention the whole-package aggregate and `graphic.pageflip`/
`graphic.hypertree` follow (the monorepo's front-package convention §"fw add-on
packages",
[aggregator](./aggregator.md#assembled-build--pick-your-file-by-its-name)):

```
dist/standalone/
  graphic-svg3d-bundled.js          bare framework-free root (no runtime, no import map)
dist/build/
  graphic-svg3d.standalone.js       composed svg3d root — fw INLINED
  graphic-svg3d.standalone.min.js
  graphic-svg3d.standalone.meta.json
  graphic-svg3d.fw.js               composed svg3d root — fw INJECTED
  graphic-svg3d.fw.min.js
  graphic-svg3d.fw.meta.json
```

| Variant | Needs at runtime | How you use it |
|---|---|---|
| `graphic-svg3d-bundled.js` (standalone dir) | **Nothing** — zero imports | `graphicSvg3dBundled.factory()` → `{ Svg3d, createTerrain }` |
| `graphic-svg3d.standalone.*` (build dir) | **Nothing** — zero imports | Same shape, produced by the assembled-pair mechanism instead of the bare-root one (see Notes) |
| `graphic-svg3d.fw.*` | `@awacloud/fw` (supplies `secPolicy` + `dom`) **and the `graphic-anim` registry** (supplies the `graphic.*` siblings this build declares — see the meta's `siblingDependencies.modules`) | Register `graphicSvg3dPackage` on a `ModuleRuntime` that also carries `graphicModules`, or hand it one resolved value per entry of its own `dependencies`. Neither fw nor the declared siblings are duplicated into the file — the smaller artifact |

```js
// standalone — no runtime, no import map, no bundler
import { graphicSvg3dBundled } from '@awacloud/graphic-anim/standalone/graphic-svg3d-bundled.js';

const { createTerrain } = graphicSvg3dBundled.factory();
const heights = new Float64Array(17 * 17);        // your decoded heightmap samples
const terrain = createTerrain(document.querySelector('#host'), { side: 17, heights });
terrain.play();

// fw variant — registered on your own runtime ALONGSIDE the core registry.
// This build DECLARES its `graphic.*` siblings
// instead of shipping a private copy of them, so the runtime must hold them.
import { graphicSvg3dPackage } from '@awacloud/graphic-anim/build/graphic-svg3d.fw.js';
import { fw_require, graphicModules } from '@awacloud/graphic-anim';

runtime.registerAllDeep([...fw_require, ...graphicModules, graphicSvg3dPackage]);
const { createTerrain: createTerrainFw } = runtime.resolve('graphicSvg3dPackage');
```

Notes on the pair:

- **Same generator, no bespoke build path.** Both files come out of ONE
  `@awacloud/tool-prebuild-generator` call (`variants: ['bundled', 'package']`,
  `inlineReachableFwOnly: true`) against a throwaway `bundle` entry scoped to
  the `graphic.svg3d` root, driven by `tools/generate-bundles.mjs` — the same
  machinery, and the same relocate-and-minify step, that emits the
  `graphic-anim.*` aggregate pair. The four injected `svg3d.*` sibling kernels
  ride in as generator `extras` (they are not `graphicModules` members, so the
  generator cannot reach them through `modules`).
- **Additive.** This assembled `dist/build` pair touches neither the frozen
  14-module `graphic.anim` aggregate (`AGGREGATE_NAMES`), nor `graphicModules`
  (still 18), nor `src/main.js`'s `bundle` export. It is also a SEPARATE
  mechanism from the bare `dist/standalone/graphic-svg3d-bundled.js` root
  mentioned above: that one *does* extend the `dist/standalone/`
  `ROOTS`/`DOM_BOUND` tables, while this
  assembled pair's own generation never touches them.
- **No asset resolution.** Neither variant contains an `import.meta.url`
  reference: the heightmap always arrives already decoded (`svg3d.mesh`'s
  Canvas-free contract), so there is nothing for a prebuilt file to resolve
  relative to itself.
- **`.min.js` twins** are minified with `Bun.build({ minify: true })` and are
  constructible exactly like their unminified counterparts; each `.meta.json`
  records `variant`, `root`, `modules`, `fwDependencies`, `bytes` and the
  Worker-safe slice (`svg3d.vec3`/`svg3d.mesh`/`svg3d.project`); the `fw` one
  additionally records `siblingDependencies`. Neither carries a `builtAt`
  stamp — `gen:bundles` is bit-for-bit deterministic.

Proven by `tests/svg3d-prebuilt-root.integration.test.js`: per variant, the
built file carries no `import` statement and no `@awacloud/fw` specifier, and the
composed class constructs and paints one frame of projected geometry from the
built file alone.

## API

| Export | Signature | Description |
|--------|-----------|--------------|
| `Svg3d` | `class Svg3d(host?, heightmap, opts?)` | The terrain viewer. Decodes the heightmap, builds the mesh, builds the SVG subtree, renders the rest pose. |
| `createTerrain` | `(host?, heightmap, opts?) => Svg3d` | Convenience: `new Svg3d(host, heightmap, opts)`. |
| `Svg3d#play` | `() => this` | Start (or resume) the orbit from the camera's current angle. No-op if already playing or disposed. |
| `Svg3d#pause` | `() => this` | Unregister the in-flight timeline + render tickable from the scheduler, freezing the camera. No-op if not playing or disposed. |
| `Svg3d#seek` | `(ms: number) => this` | Scrub to an absolute elapsed position (linear fraction of the cycle, wraps mod `duration`), re-rendering immediately without touching the scheduler. |
| `Svg3d#setCamera` | `(partial: object) => this` | Merge a partial camera override and re-render immediately. |
| `Svg3d#dispose` | `() => void` | Unregister the in-flight timeline and the render tickable from the scheduler. Idempotent. |

### State

| Field | Type | Description |
|-------|------|--------------|
| `.node` | `SVGElement` | The built `<svg>` root, appended into `host` when one is provided. |
| `.mesh` | `object` | The static precomputed mesh (`svg3d.mesh.buildGridMesh`'s return). |
| `.camera` | `object` | The live camera state (`{x,y,z,rx,ry,rz,depth,offsetX,offsetY}`), mutated in place by the orbit. |
| `.mode` | `'path'\|'polygons'` | The active DOM strategy. |
| `.prefix` | `string` | The DISTINCT per-instance id-scope prefix. |

### `Svg3dOptions`

| Field | Type | Default | Description |
|-------|------|---------|--------------|
| `mode` | `'path'\|'polygons'` | `'path'` | DOM strategy (see below). |
| `maxTriangles` | `number` | `8192` | Path-mode ceiling override (up to the measured hard ceiling ~51200). |
| `buckets` | `number` | `16` | Path-mode bucket count (shading fidelity; near-free to raise). |
| `faceColors` | `boolean \| { base?, shade? }` | `false` | Path mode: per-face colour classes (altitude classes + water, × shade classes; `true` is `{ base: 6, shade: 6 }`) instead of the slice-mean colour. See "Face colours" below. |
| `events` | `object` | — | The resolved fw `dom/query/events` module: enables the pointer look (see "Pointer look" below). |
| `spacing` / `heightScale` | `number` | mesh defaults | Forwarded to `svg3d.mesh.buildGridMesh`. |
| `width` / `height` | `number` | `1280` / `800` | Viewport / SVG size (px). |
| `camera` | `object` | — | Partial camera override merged over the default (`rx=0.55`, `y=-900`, `depth=900`, `near=1`). |
| `duration` | `number` | `4000` | Milliseconds for one full orbit cycle. |
| `yawTurns` | `number` | `1` | Yaw revolutions per cycle. |
| `pitchSpan` | `number` | `0` | Pitch delta (radians) per cycle; `0` keeps pitch fixed. |
| `loop` | `boolean` | `true` | Whether a completed cycle automatically starts the next one. |
| `prefix` | `string` | distinct `svg3d-<n>` | Id-scope prefix. |
| `scheduler` | `object` | shared singleton | Override the scheduler (tests / isolation). |

**Errors**: a malformed heightmap propagates `svg3d.mesh.decodeHeightmap`'s
`TypeError`/`RangeError`; a heightmap too small (`side < 2`) throws; exceeding
the active mode's triangle ceiling throws `Error('graphic.svg3d: …')`.

## Accepted heightmap shapes

`heightmap` is one of `svg3d.mesh`'s two Canvas-free shapes (by design,
`graphic.svg3d` never depends on Canvas; decode is a one-time init cost
paid by the caller):

```js
{ side: number, heights: Float64Array | number[] }        // a plain sample grid
{ data: Uint8ClampedArray, width: number, height: number }  // an ImageData-shaped view
```

A caller starting from a `.png` performs the four-line Canvas decode itself
and hands over the bytes:

```js
const ctx = canvas.getContext('2d');
ctx.drawImage(img, 0, 0);
const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
const terrain = createTerrain(host, { data, width, height });
```

## DOM strategies + ceilings

Frozen by measure:

| layer | measured @ 8192 tris | recommended ceiling (>= 3x headroom) | hard ceiling (measured) |
|---|---:|---:|---:|
| path-`d` rewrite (default, 16 buckets) | 3.34 ms/frame | **8 192** triangles — 5.0x headroom | ~51 200 triangles |
| per-polygon attrs (opt-in `mode:'polygons'`) | 12.52 ms/frame | **2 048** triangles — 4.8x headroom | ~8 192 triangles |

The bucketed path-`d` rewrite is the frozen default: `buckets: 16` `<path>`
elements, each carrying a contiguous painter-rank slice of the visible faces
as one multi-subpath `d` (raise the bucket count for shading fidelity — near
free, measured +4% at 16 vs 1 bucket). `mode: 'polygons'` is an opt-in
alternative for call sites that genuinely need per-face DOM identity,
restricted to **≤ 2048 triangles** (throws above — 3.75x-5x more expensive per
the spike). `maxTriangles` can raise the path-mode ceiling above the
recommended 8192, up to the measured hard ceiling **~51 200** — beyond that is
unmeasured territory (`graphic.svg3d` throws rather than silently degrade).

**Floor-vs-browser caveat**: `bun:test` runs on happy-dom, which has no real
layout/paint/compositor and no browser frame pump. The DOM-strategy numbers
above are a FLOOR (they measure attribute write-path dispatch only); a real
browser additionally rasterises, which is strictly more expensive. The
recommended ceilings already build in a >= 3x margin against this uncertainty;
a real-browser perf run remains a standing follow-up, not built here.

Both rigs implement **slot mapping, never DOM reordering**: a fixed number of
DOM elements in fixed document order, the k-th element receiving the
k-th painter-ordered face (or painter-rank slice); surplus slots blank
(`points=''` / empty `d`) when the visible count shrinks. Construction goes
through `graphic.svgBuild` + a FRESH `graphic.scopedIds` scope with a DISTINCT
per-instance prefix; every write routes through `graphic.svgApply.svgAttr` (fw
`parser` has no SVG namespace — no raw `setAttribute`). Emitted coordinates
are quantised to **1 decimal**. Colours come exclusively from the mesh's
build-time LUT (`mesh.colorLut`/`mesh.baseQ`/`mesh.shadeLevels`) — no colour
string is ever built per frame.

## Face colours (`faceColors`)

The default rig fills each painter slice with the slice's **mean** colour, so
altitude and shading average out and the terrain reads as one hue per depth
band. With `faceColors`, each slice is split into colour classes — `base`
altitude classes plus water, times `shade` shade classes — one `<path>` per
class with a **fixed** fill (the class-centre LUT colour), stroked with that
fill (width 1) so the seams close, as the legacy renderer stroked every face.
Every face goes to its slice's class path, so each face keeps its altitude
colour and its own shading. A path whose `d` did not change is not written.
Painter order stays exact between slices and approximate inside one, as with
the default rig. The DOM holds `buckets × (base + 1) × shade` paths (8 buckets:
336).

**Water** is the legacy rule: a face whose three samples are exactly 0
(`mesh.water`), coloured from `mesh.waterLut` (`#0000dd`, shaded like the
land). Lower a heightmap's sea to 0 to get water.

Measured in Chromium (1280 × 800, the legacy heightmap, 4 802 triangles,
8 buckets): 1.96 ms of task time per frame while dragging, against 11.95 ms
for the legacy page (whose DOM grows to 69 259 nodes); a measurement, not a
gate.

## Pointer look (`events`)

With `events` (the resolved fw `dom/query/events` module, passed as an option
so the barrel gains no import), the terrain takes the legacy drag-to-look:

- a press anywhere in the viewport (a transparent hit rect lies behind the
  faces) pauses the orbit;
- a drag sets `ry = ry₀ + (x₀ − x) / width · π` and
  `rx = clamp(rx₀ − (y₀ − y) / height · π/2, −π/2, π/2)` — by the drag
  distance, never accumulated per event (the legacy speed depended on the event
  rate) — and renders;
- a release leaves the camera where it is; `play()` resumes the orbit;
- `dispose()` clears the listeners, and detaches `node` from the host it was
  appended to (the reference stays readable).

## The near-distance drop

A triangle with **any** vertex nearer than `camera.near` (default 1 world unit)
to the camera plane, or behind it, is **dropped whole** by `svg3d.project` — it
is **not** clipped. A vertex exactly on the plane would otherwise scale to
`+Infinity` (the legacy page's `L-Infinity` path data, which a camera standing
among the vertices meets). Near-plane clipping is an explicit non-goal.
Near-plane clipping is an explicit non-goal. Practical consequence: a triangle
straddling the camera plane disappears rather than being split, which reads as
a hole in the terrain. The default camera (`y=-900`, `depth=900`, `rx=0.55`)
is framed so the recommended mesh sizes stay in front of it; keep a custom
camera far enough back to avoid this at your own mesh size.

## Rotation seam

`graphic.timeline` composes two `graphic.tween`s writing `camera.ry` (yaw) /
`camera.rx` (pitch); the timeline registers as ONE tickable, and a SEPARATE
render tickable is added to the SAME scheduler immediately AFTER it — so
within one tick the camera is fully updated (both angles) before the frame is
projected and painted. There is no second `requestAnimationFrame` loop.
`opts.scheduler` threads a manual clock through tests; the shared production
singleton (`graphic.scheduler`) is the default.

## Examples

```js
const terrain = createTerrain(document.querySelector('#stage'),
    { side: 65, heights: myHeightSamples },
    { duration: 6000, yawTurns: 1 });

terrain.play();          // starts the orbit
terrain.setCamera({ depth: 1100 });  // zoom, re-renders immediately
terrain.seek(1500);      // scrub to 1.5s into the cycle
terrain.pause();
terrain.dispose();       // clean scheduler teardown
```

## Notes

- **Distinct per-instance prefix** — each terrain mints a distinct id-scope
  prefix (`svg3d-0`, `svg3d-1`, …) unless one is passed, so two terrains in the
  same document never mint colliding ids (the per-instance id prefix collision
  lesson).
- **No Canvas dependency** — the heightmap arrives already decoded; the module
  never calls `getContext`/`drawImage`/`getImageData` (by design).
- **Zero per-frame allocation in the projection kernel** — `svg3d.project`
  reuses typed-array buffers created once per mesh; the kernel is never the
  frame-budget constraint (73 728 triangles project/cull/shade/sort in 5.48 ms
  against the 16.67 ms budget — the DOM write leg is the binding constraint).
- **Secure-writer routing** — writes go through `svgApply.svgAttr` → fw
  `dom.attr` → raw `setAttribute`; `dom.attr` does **not** invoke secPolicy
  sanitization.

## Deferred follow-ups (OUT of this build)

- **Near-plane clipping** — an explicit non-goal; keyboard moves (the legacy
  arrow keys) are not ported.
- **Texture/marker overlays, multi-mesh scenes, a general 3D scene graph** —
  explicit non-goals.
- **Real-browser perf run** — the DOM-strategy numbers above are a happy-dom
  floor; a real compositor run is a standing follow-up, not built here.

## See also

- [svg/build](./api/svg/build.md) — the JSON→SVG builder the terrain is built with
- [svg/scoped-ids](./api/svg/scoped-ids.md) — the per-instance id scope
- [anim/timeline](./api/anim/timeline.md) · [anim/tween](./api/anim/tween.md) — the frozen orbit driver
- [anim/scheduler](./api/anim/scheduler.md) — the shared rAF loop
- [aggregator](./aggregator.md#assembled-build--pick-your-file-by-its-name) — the same two-variant `dist/build` naming convention, applied to the whole-package aggregate
- [pageflip](./pageflip.md) · [hypertree](./hypertree.md) — sibling composed modules following the same injected-pure-kernel pattern
