---
module: aggregator
category: core
name: graphic.anim
type: fw.dom.graphic
dependencies: [graphic.lerp, graphic.easing, graphic.units, graphic.matrix, graphic.color, graphic.scopedIds, graphic.interpolate, graphic.svgApply, graphic.svgBuild, graphic.scheduler, graphic.tween, graphic.timeline, graphic.scene, graphic.frames]
returns: "{ lerp, easing, units, matrix, color, scopedIds, interpolate, svgApply, svgBuild, scheduler, tween, timeline, scene, frames }"
worker-safe: partial
status: complete
---

# aggregator — `graphic.anim`

> Whole-package resolve of the frozen 14-module `@awacloud/graphic-anim` core.

**Module** `graphic.anim` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/aggregator.js` | **Deps** `graphic.lerp`, `graphic.easing`, `graphic.units`, `graphic.matrix`, `graphic.color`, `graphic.scopedIds`, `graphic.interpolate`, `graphic.svgApply`, `graphic.svgBuild`, `graphic.scheduler`, `graphic.tween`, `graphic.timeline`, `graphic.scene`, `graphic.frames` | **Worker-safe** partial (the pure-math slice is Worker-safe; the aggregate as a whole is not, because it transitively pulls DOM-bound members)

`graphic.anim` is a single capture-free fw module descriptor that resolves to a
namespace containing every one of the **frozen 14 core modules** at once —
one `runtime.resolve('graphic.anim')` call instead of 14 individual resolves.
It performs no work of its own: the factory re-exports its 14 injected
dependencies by reference, so `resolve('graphic.anim').tween` is the exact
same instance as `resolve('graphic.tween')` (fw's `ModuleRuntime` memoizes
resolution per name — no re-instantiation, no duplicated singletons).

## The frozen 14 — NOT the full 16-entry registry

The aggregate's namespace is **exactly** the 14 modules named in the
`graphic-anim-packaging` plan (`graphic.lerp` … `graphic.frames`), in their
frozen topo order:

| Key | Full name |
|---|---|
| `lerp` | `graphic.lerp` |
| `easing` | `graphic.easing` |
| `units` | `graphic.units` |
| `matrix` | `graphic.matrix` |
| `color` | `graphic.color` |
| `scopedIds` | `graphic.scopedIds` |
| `interpolate` | `graphic.interpolate` |
| `svgApply` | `graphic.svgApply` |
| `svgBuild` | `graphic.svgBuild` |
| `scheduler` | `graphic.scheduler` |
| `tween` | `graphic.tween` |
| `timeline` | `graphic.timeline` |
| `scene` | `graphic.scene` |
| `frames` | `graphic.frames` |

**`graphic.pageflip` and `graphic.hypertree` are deliberately NOT in this
namespace.** The `graphicModules` registry grew to 16 entries after this
aggregator was first drafted (the two page/tree extensions were appended
topo-last later); the packaging decision resolved the resulting drift by
keeping the aggregator scoped to the original 14. Widening it to cover all 16 (or
future) registry members is a possible dated increment, not done here —
consumers that need `pageflip`/`hypertree` resolve them individually
(`runtime.resolve('graphic.pageflip')` / `'graphic.hypertree'`).

## Descriptor

`graphic.anim` is registered **topo-last** in `graphicModules` (after
`graphic.hypertree`, position 17 of 17) — a pure registry addition. The
frozen 16-order that precedes it is an untouched strict prefix; no existing
descriptor is reordered.

Capture-free by construction: every returned member is a factory PARAMETER,
so `factory.toString()` references no module-scope binding
(`fw/no-factory-capture` clean, verified by the package-local ESLint config
over `src/**/*.js`). `deps.map(d => d.name) === dependencies` (same order),
mirroring the `deps`/`dependencies` pairing convention of the other 16
descriptors.

## No standalone root

`graphic.anim` ships **only** as a `graphicModules` / `dist/build` registry
member — there is **no** `dist/standalone/graphic-anim-bundled.js` and no
`bundle`/`ROOTS` entry (a packaging decision: no aggregate standalone root):

1. The mutualized `@awacloud/tool-fw-bundler`'s `standalone` path has no
   cross-package `fw_require` inline seam, so it cannot inline the DOM-bound
   members' fw deps (`dom`/`secPolicy`) into a single aggregate bundle
   without the fw-tools-P2 generalization.
2. `@awacloud/graphic-anim` already ships **both** surfaces a consumer could want:
   17 per-root `dist/standalone/*-bundled.js` files (framework-free) and the
   `dist/build` fw-mode barrel. An aggregate standalone would duplicate one
   of these for no new consumer need — Worker-safe callers want the pure
   slice (`lerp`/`easing`/`units`/`matrix`/`color`/`scopedIds`/`interpolate`),
   not `scene`/`frames`; fw-runtime callers register the barrel.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { graphicModules } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(graphicModules);
const anim = runtime.resolve('graphic.anim');
// Returns: { lerp, easing, units, matrix, color, scopedIds, interpolate,
//            svgApply, svgBuild, scheduler, tween, timeline, scene, frames }
```

Or resolve the aggregator's own transitive graph directly (without the
`pageflip`/`hypertree` extensions in the runtime):

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { animAggregatorModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerDeep(animAggregatorModule);   // pulls the 14 core deps only
const anim = runtime.resolve('graphic.anim');
```

## API

| Key | Signature | Description |
|---|---|---|
| `lerp` | `(a, b, t) => number` | Resolved `graphic.lerp` — see [math/scalar](./CONTRACT.md). |
| `easing` | `Record<string, (t) => number>` | Resolved `graphic.easing` — the curve table. |
| `units` | `{ split, format }` | Resolved `graphic.units`. |
| `matrix` | `{ Matrix, lerpDecomposition }` | Resolved `graphic.matrix`. |
| `color` | `{ parse, lerp, format, CSS_NAMED_COLORS }` | Resolved `graphic.color`. |
| `scopedIds` | `{ createScope }` | Resolved `graphic.scopedIds`. |
| `interpolate` | `{ detect, interpolator, parseTransform, parsePath }` | Resolved `graphic.interpolate`. |
| `svgApply` | `{ SVG_NS, svgAttr }` | Resolved `graphic.svgApply`. |
| `svgBuild` | `{ build, SVG_TAGS }` | Resolved `graphic.svgBuild`. |
| `scheduler` | `{ Scheduler, scheduler }` | Resolved `graphic.scheduler` (shared singleton). |
| `tween` | `{ Tween, tween, resolveEasing }` | Resolved `graphic.tween`. |
| `timeline` | `{ Timeline }` | Resolved `graphic.timeline`. |
| `scene` | `{ createScene }` | Resolved `graphic.scene`. |
| `frames` | `{ Frames, frames }` | Resolved `graphic.frames`. |

Every value is the **same instance** whether reached through `graphic.anim`
or through the individual `graphic.<name>` resolve — there is exactly one
shared `scheduler` singleton per `ModuleRuntime`, for example.

## Examples

```js
import { runtime } from '@awacloud/fw';
import { graphicModules } from '@awacloud/graphic-anim';

runtime.registerAllDeep(graphicModules);
const { timeline, tween } = runtime.resolve('graphic.anim');

const { Timeline } = timeline;
const tl = new Timeline();
tl.add({ target: rect, property: 'width', from: 0, to: 200, duration: 600, easing: 'easeOutCubic' });
tl.play();
```

## Worker Usage

The aggregate as a whole is only PARTIALLY Worker-safe: it transitively pulls
DOM-bound members (`svgApply`, `svgBuild`, `scheduler`, `tween`, `timeline`,
`scene`, `frames`). Its factory is nonetheless capture-free and fully
serializable — `ModuleRuntime.serialize(['graphic.anim'])` round-trips
cleanly through a bare Worker-side `new Function` scope, and this survives
`Bun.build({minify:true})` minification (a minifier can rename a captured
module-scope binding but cannot move it into factory scope, so the capture
— and its detection — both survive). What is NOT Worker-safe is *running*
the DOM-bound members inside the Worker (`svgApply.svgAttr` etc. still
require `document`); only the pure-math slice
(`lerp`/`easing`/`units`/`matrix`/`color`/`scopedIds`/`interpolate`) can
actually execute inside a Worker.

## Notes

- **Perf budget (frozen acceptance).** A cold eager resolve-all (fresh
  `ModuleRuntime` + `registerAllDeep(graphicModules)` +
  `resolve('graphic.anim')`, forcing every transitive factory to
  instantiate) must average **≤ 1.0 ms/op** (`RESOLVE_ALL_BUDGET_MS = 1.0`,
  N=500 with a 20-iteration JIT warmup). The first measure was 0.034–0.043 ms —
  about 25× headroom. This folds the standing BACKLOG "graphic-anim compile-cost
  perf budget" item. A memoized `resolve()` after registration is
  effectively free (< 0.05 ms/op).
- **happy-dom floor caveat.** Factory instantiation touches no DOM (DOM is
  referenced only at first tick / `apply`), so the perf number above needs
  no happy-dom registration and is a faithful compile-cost floor — it is not
  a real-browser paint/reflow measurement.

## Assembled build — pick your file by its name

`dist/build/` ships **three** whole-package surfaces. Each name states what it
needs at runtime, so no file's requirements ever have to be guessed:

```
dist/build/
  index.js                        fw-mode barrel (descriptors)
  graphic-anim.standalone.js      assembled aggregate — fw INLINED
  graphic-anim.standalone.min.js
  graphic-anim.standalone.meta.json
  graphic-anim.fw.js              assembled aggregate — fw INJECTED
  graphic-anim.fw.min.js
  graphic-anim.fw.meta.json
```

### Choice table

| Surface | Needs at runtime | What you get | Pick it when |
|---|---|---|---|
| `index.js` (barrel) | `@awacloud/fw` + you call `registerAllDeep` | The 18 raw module descriptors — register some or all, resolve à la carte, share instances with the rest of your runtime | You already run an `@awacloud/fw` `ModuleRuntime` and want per-module control (or only a subset of the package) |
| `graphic-anim.fw.*` | `@awacloud/fw` (supplies `secPolicy` + `dom`) | ONE descriptor, `dependencies: ["secPolicy","dom"]`; register it and `resolve()` gives the whole 14-key namespace in a single call. fw is **not** duplicated into the file — the smallest of the two aggregates | You run on `@awacloud/fw` and want the whole package in one registration, without shipping a second copy of fw's code |
| `graphic-anim.standalone.*` | **Nothing** — zero imports | ONE descriptor, `dependencies: []`; call `factory()` and you have the 14-key namespace. Every reachable fw factory (`secPolicy`, `dom`) is inlined | There is no fw runtime in the page/host at all, or you want a single self-contained file to drop in |

Rule of thumb: **`.fw.` = fw required, `.standalone.` = nothing required.** The
bare `graphic-anim.js` name of the first draft is retired precisely because it
did not say which.

```js
// fw variant — registered on your own runtime
import { graphicAnimPackage } from '@awacloud/graphic-anim/build/graphic-anim.fw.js';
import { fw_require } from '@awacloud/graphic-anim';

runtime.registerAllDeep([...fw_require, graphicAnimPackage]);
const { timeline, tween } = runtime.resolve('graphicAnimPackage');

// standalone variant — no runtime, no imports
import { graphicAnimBundled } from '@awacloud/graphic-anim/build/graphic-anim.standalone.js';
const { timeline: timelineStandalone, tween: tweenStandalone } = graphicAnimBundled.factory();
```

### How the pair is produced

- **One generator, two variants.** Both files come out of a single
  `@awacloud/tool-prebuild-generator` call (`variants: ['bundled', 'package']`,
  `inlineReachableFwOnly: true`) against a throwaway `bundle` entry scoped to
  the `graphic.anim` aggregator root — the same "factories inlined via a
  mini-DI" machinery that produces each `dist/standalone/*-bundled.js` file,
  just pointed at the aggregate root. `bundled` becomes
  `graphic-anim.standalone.*`; `package` becomes `graphic-anim.fw.*`. Neither
  descriptor is hand-written.
- **Not a `dist/standalone` root.** Both files live under `dist/build/`, not
  `dist/standalone/` — the "no aggregate standalone root" decision is about the `dist/standalone/graphic-anim-bundled.js` naming slot
  specifically (a `ROOTS`/`bundle`-entry addition, which would duplicate the
  per-root standalone surface). The assembled builds are distinct, additive
  artifacts: `src/main.js`'s own `bundle` export (the 14 per-root bare cores)
  and the `dist/standalone/` `ROOTS`/`DOM_BOUND` tables are untouched by them.
- **Minification.** `@awacloud/tool-prebuild-generator` has no minify path, so
  `tools/generate-bundles.mjs` falls back to `Bun.build({ minify: true })`
  exactly like the aggregator's own worker-serializability
  test (`src/aggregator-min.test.js`) do. The `/* GENERATED — do not edit */`
  banner is a plain comment a minifier is free to drop, so it is re-prepended
  verbatim from the unminified file rather than trusted to survive
  minification.
- **Generated, never hand-edited.** All four JS files carry the standard
  banner and are byte-idempotent across `gen:bundles` runs — with **no**
  exception: the driver writes no build stamp,
  so the `*.meta.json` files are byte-identical too and the determinism tests
  compare raw bytes without stripping anything.
- **Meta shape** (identical for both files): `kind`,
  `variant` (`"standalone"` | `"fw"` — the discriminator), `name`
  (`"graphic-anim"`), `package` (`"@awacloud/graphic-anim"`), `aggregate`
  (`"graphic.anim"`), `modules` (the frozen 14, in order), `fwDependencies`
  (`[]` for standalone, `["secPolicy","dom"]` for fw — read back from the
  emitted descriptor, never hardcoded), `bytes` (`{ dev, min }`, measured per
  variant), `domBound` (`true` — the aggregate as a whole transitively pulls
  DOM-bound members), `workerSafeSlice` (the 7 pure-leaf names also listed
  above), `builtBy`. There is no `builtAt` key (determinism ruling) and no
  `siblingDependencies` key: the aggregate declares no siblings — it *is* the
  core a consumer holds. Only the three composed extension roots carry that key
  (`docs/CONTRACT.md` §"Declared-sibling `.fw` variant").

Consumers already registering `graphicModules` (e.g. via `dist/build/index.js`)
keep resolving `graphic.anim` normally; the assembled builds are alternative
entry points, not a replacement for the registry member.

## See also

- [Frozen module contract](./CONTRACT.md) — the descriptor table for the 13
  originally-frozen modules (the 14th, `graphic.frames`, and the later
  `graphic.pageflip`/`graphic.hypertree` extensions are documented in their
  own module pages, not the contract).
- [hypertree/hypertree](./hypertree.md) · [pageflip/pageflip](./pageflip.md) —
  the two registry members NOT covered by this aggregate.
- [fw module pattern](https://github.com/awacloud/awa/blob/main/packages/front/fw/docs/guide/module-pattern.md)
