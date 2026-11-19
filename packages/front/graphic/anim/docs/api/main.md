# `@awacloud/graphic-anim` — `src/main.js`

> Public entry point. Two roles: **generator contract** (the prebuild generator's input) and
> **fw-mode barrel** (consumer import surface). No code runs at import.

## Generator contract

Consumed by `@awacloud/tool-prebuild-generator` to produce `dist/build/` and
`dist/standalone/` bundles. Field names and semantics mirror `@awacloud/ooxml/src/main.js`.

| Export | Type | Description |
|---|---|---|
| `fw_require` | `ModuleDefinition[]` | `[secPolicy, dom]` — fw closure inlined by standalone bundles. `secPolicy` precedes `dom` (dom depends on it). |
| `modules` | `ModuleDefinition[]` | `graphicModules` — all **18** descriptors in topo order (grown from the first 10 through later extensions; see `../CONTRACT.md`). |
| `extras` | `ModuleDefinition[]` | `[]` in `src/main.js` itself. `tools/generate-bundles.mjs` (the driver script, not this file) passes its own extended `extras` per extension when producing the three composed roots below — additive, byte-inert for every entry in `bundle`. |
| `bundle` | `{name,dependencies,factory}[]` | One bare-core Bundle entry per **frozen-14-core** public root (`graphic.lerp` … `graphic.frames`; still 14, unchanged since P2). Each `name` ends in `Bundle`; `dependencies[0]` is the core module name; factory is a pass-through (no extras). `graphic.pageflip`, `graphic.hypertree`, `graphic.svg3d` and the `graphic.anim` aggregator are registry (`graphicModules`) members but are **not** in `bundle` — the three composed extensions get a root through a different, driver-level mechanism (see below); the aggregator gets no dedicated root at all. |

### `fw_require` rationale

`secPolicy` and `dom` are the fw modules the DOM-bound graphic descriptors depend
on. They are NOT in `graphicModules` (not graphic logic) but ARE in `fw_require`
so the generator can:

- **`bundled` variant**: inline their factory source so the bundle has zero
  `@awacloud/fw` imports.
- **`package` variant**: declare them as `dependencies` so the fw DI runtime
  injects them.

`@awacloud/tool-prebuild-generator` names these two variants' output
`<id>-bundled.js` / `<id>-package.js` generically, but **this package never
emits a literal `-package.js` file**: the 14 `bundle` entries below are
generated with `variants: ['bundled']` only (fw-mode consumption of those 14
goes through the shared `dist/build/index.js` barrel instead), and the four
dedicated composed roots (`graphic.anim`, `graphic.svg3d`, `graphic.pageflip`,
`graphic.hypertree`) that DO use both variants have their output files
renamed by the driver script to `<root>.standalone.js` / `<root>.fw.js` — a
file's runtime requirement must be readable from its name alone. See
"Beyond the 14" below and `../CONTRACT.md`.

**Scope note** (accurate): `dom.attr()` writes via `setAttribute` directly — it
does NOT invoke secPolicy sanitization. Only `dom.style`/visibility paths sanitize
through secPolicy. Callers must not assume attribute values written by
`graphic.svgApply` are filtered for XSS beyond what `setAttribute` enforces.

### `bundle` entries

The generator uses `bundle[i].dependencies[0]` as the "core name" and the
remaining entries as extras (none here). It derives the output file id by:

1. Stripping the `Bundle` suffix: `graphic.timelineBundle` → `graphic.timeline`
2. Applying kebab-case: `graphic.timeline` → `graphic-timeline`

Each of the 14 `bundle` entries produces exactly **one** framework-free file
under `dist/standalone/` — there is no per-root `-package.js` twin (that
naming does not exist anywhere in this package). fw-mode consumption of these
14 goes through the single shared `dist/build/index.js` barrel instead (see
"fw-mode surface" below), not through a per-root fw file:

```
dist/standalone/graphic-lerp-bundled.js
dist/standalone/graphic-easing-bundled.js
dist/standalone/graphic-units-bundled.js
dist/standalone/graphic-matrix-bundled.js
dist/standalone/graphic-color-bundled.js
dist/standalone/graphic-scoped-ids-bundled.js
dist/standalone/graphic-interpolate-bundled.js
dist/standalone/graphic-svg-apply-bundled.js
dist/standalone/graphic-svg-build-bundled.js
dist/standalone/graphic-scheduler-bundled.js
dist/standalone/graphic-tween-bundled.js
dist/standalone/graphic-timeline-bundled.js
dist/standalone/graphic-scene-bundled.js
dist/standalone/graphic-frames-bundled.js
```

Pure-leaf bundles (`lerp`, `easing`, `units`, `matrix`, `color`, `scopedIds`,
`interpolate`) are Worker-safe: they carry no fw inlining and never touch
`window`/`document`.

**Beyond the 14**: `graphic.pageflip`, `graphic.hypertree` and `graphic.svg3d`
each additionally get their own `dist/standalone/graphic-<mod>-bundled.js`
root **and** a dedicated `dist/build/graphic-<mod>.{standalone,fw}.*`
assembled pair — produced directly by `tools/generate-bundles.mjs` (not by an
entry in this file's `bundle` export) because each module's composed class
transitively imports fw's `dom` module and so has no other bundler-free entry
point. `graphic.anim` (the whole-package aggregator) gets neither: it is a
registry-only member with no `bundle`/root of its own. Full detail:
`../CONTRACT.md` § "`dist/**` perimeter rule" and `standalone.md`.

## fw-mode surface

### `graphicModules`

```js
import { graphicModules } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(graphicModules);
// registerAllDeep follows svgApplyModule.deps:[dom] → dom.deps:[secPolicy]
// so secPolicy and dom are registered automatically.

const timeline = runtime.resolve('graphic.timeline');
```

The registration order is the frozen topo order (deps before dependents),
extended as a strict superset by six later waves (never reordering the
original ten):

```
graphic.lerp → graphic.easing → graphic.units → graphic.matrix → graphic.color
  → graphic.scopedIds → graphic.interpolate → graphic.svgApply → graphic.svgBuild
  → graphic.scheduler → graphic.tween → graphic.timeline → graphic.scene
  → graphic.frames → graphic.pageflip → graphic.hypertree → graphic.anim → graphic.svg3d
```

The exhaustive per-descriptor `{name, type, dependencies}` table — the
frozen, normative source — lives in `../CONTRACT.md`; this page does not
duplicate it a second time to avoid the two drifting apart again.

### Individual descriptor re-exports

```js
import {
    lerpModule, easingModule, unitsModule, matrixModule, colorModule,
    scopedIdsModule, interpolateModule, svgApplyModule, svgBuildModule,
    schedulerModule, tweenModule, timelineModule, sceneModule, framesModule,
    pageflipModule, hypertreeModule, animAggregatorModule, svg3dModule,
} from '@awacloud/graphic-anim';
```

All 18 descriptor consts are re-exported by name for selective imports and
for the generator contract (`tools/generate-bundles.mjs` reads the `modules`
array, which holds these same references).

### Constructible helpers

Two additive, DOM-bound helpers compose the frozen descriptors above a local,
lazily-built `ModuleRuntime` so a consumer can skip manual DI wiring
entirely. They are plain functions, not module descriptors: absent from
`graphicModules`, from `AGGREGATE_NAMES` and from every `bundle` entry, and
deliberately **not** reachable under `./kernels/*` (that subpath carries the
extension modules' kernels: seven pure and Worker-safe, plus the DOM-bound
svg3d rig builder `svg3d.apply`).

```js
import { createPageflip, createHypertree } from '@awacloud/graphic-anim';

const book = createPageflip(el, opts);          // → { instance: Pageflip, dispose }
book.instance.next();
book.dispose();

const tree = createHypertree(rootEl, opts);     // → { instance: Hypertree, root, dispose }
tree.instance.focus('someNodeId');
tree.dispose();
```

Both helpers share ONE lazily built runtime, so they resolve the same
`graphic.scheduler` singleton: a page using both runs one animation-frame
loop. The last `dispose()` of any helper instance releases that runtime.

## Module descriptors covered

| name | docs |
|---|---|
| `graphic.lerp` | [`docs/api/math/`](math/) |
| `graphic.easing` | [`docs/api/math/`](math/) |
| `graphic.units` | [`docs/api/math/`](math/) |
| `graphic.matrix` | [`docs/api/math/`](math/) |
| `graphic.color` | [`docs/api/math/`](math/) |
| `graphic.scopedIds` | [`docs/api/svg/scoped-ids.md`](svg/scoped-ids.md) |
| `graphic.interpolate` | [`docs/api/interpolate/`](interpolate/) |
| `graphic.svgApply` | [`docs/api/svg/`](svg/) |
| `graphic.svgBuild` | [`docs/api/svg/build.md`](svg/build.md) |
| `graphic.scheduler` | [`docs/api/anim/`](anim/) |
| `graphic.tween` | [`docs/api/anim/`](anim/) |
| `graphic.timeline` | [`docs/api/anim/`](anim/) |
| `graphic.scene` | [`docs/api/scene/scene.md`](scene/scene.md) |
| `graphic.frames` | [`docs/api/frames/frames.md`](frames/frames.md) |
| `graphic.pageflip` | [`../pageflip.md`](../pageflip.md) |
| `graphic.hypertree` | [`../hypertree.md`](../hypertree.md) |
| `graphic.anim` (aggregator) | [`../aggregator.md`](../aggregator.md) |
| `graphic.svg3d` | [`../svg3d.md`](../svg3d.md) |

## See also

- [Frozen module contract](../CONTRACT.md) — descriptor names, types, deps (immutable)
- [README](../../README.md) — consumption modes (fw DI vs standalone)
