# @awacloud/graphic-anim — Frozen Module Contract (+ later strict-superset extensions)

> **Locked with the first ten modules. No change may alter a name / type / deps tuple.**
>
> **Extension rule (applies to every extension).** Each extension grows the frozen set as a
> **strict superset**: existing descriptors and their **relative order are never
> changed**, new descriptors are inserted at topo-valid slots (dependencies before
> dependents). The freeze rule applies to the whole current set — **18 modules** — not
> just to the first ten: no change may alter a name / type / deps tuple.
>
> Extension history:
> - **[scene layer]** ratified 2026-07-01 — `graphic.scopedIds`, `graphic.svgBuild`,
>   `graphic.scene` (→ 13).
> - **[frames]** `graphic.frames`, topo-last (→ 14). These **14 are the frozen
>   core** referenced by the aggregator below.
> - **[pageflip]** `graphic.pageflip`, topo-last (→ 15).
> - **[hypertree]** `graphic.hypertree`, topo-last (→ 16).
> - **[aggregator]** `graphic.anim` aggregator, topo-last (→ 17),
>   as a registry member only (see "Aggregator scope" below).
> - **[svg3d]** `graphic.svg3d` terrain viewer, topo-last (→ 18). Its pure
>   `svg3d.vec3`/`svg3d.mesh`/`svg3d.project` kernels and its `svg3d.apply` rig
>   builder are DI-injected, **not** `graphicModules` members.
> - **[fw re-base]** The owner amended three frozen tuples, the one exception
>   to the freeze so far: `graphic.lerp`, `graphic.easing` and
>   `graphic.scheduler` now depend on fw's `interp`, `easing` and `clock`
>   (`io/math`, `io/calc`, `io/timing`) instead of carrying their own copies.
>   Names, types and the registration order are unchanged.
>
> Packaging of the two `dist/` surfaces is governed by the frozen **"fw add-on
> packages"** section of the monorepo's front-package convention; this package is its
> reference implementation.

## Module descriptor table

Every engine capability is **one capture-free fw module descriptor**
`{ name, type, dependencies, deps, factory }`. Factories reference **only**
their parameters, factory-local declarations, or ambient globals — **never** a
module-scope binding (enforced by `fw/no-factory-capture`, wired in
`eslint.config.js`). Pure-data leaves (easing table, `Matrix`,
`CSS_NAMED_COLORS`, parsers) **define their content INSIDE the factory**
(relocation of the single definition, fw's own `io/calc/easing.js` pattern —
NOT re-implementation). `ModuleRuntime#resolve` (fw `core/runtime.js`) calls
`factory.apply({}, resolvedDependencies-by-name)`; `deps[]` is the bundler
mirror (same order as `dependencies`; invariant
`deps.map(d=>d.name)===dependencies`).

**Type regex** `TYPE_RE` (fw `core/runtime.js`) = `/^(fw|sd|sde|sdc|lib)\.[a-z][\w.]*$/` — a
bare `graphic.*` **type** is REJECTED. Names are free-form map keys
(`graphic.*` ok).

| name | type | dependencies (= deps order) | factory(params) → returns | Worker-safe |
|---|---|---|---|---|
| `graphic.lerp` | `lib.graphic.math` | `['interp']` | `(interpApi)=>(a,b,t)=>number` — fw `interp.linear` itself | yes |
| `graphic.easing` | `lib.graphic.math` | `['easing']` | `(fwEasing)=>Record<string,(t)=>number>` — the 31 fw curves normalized, `(t)=>f(t,0,1,1)` | yes |
| `graphic.units` | `lib.graphic.math` | `[]` | `{ split, format }` | yes |
| `graphic.matrix` | `lib.graphic.math` | `['graphic.lerp']` | `(lerp)=>{ Matrix, lerpDecomposition }` | yes |
| `graphic.color` | `lib.graphic.color` | `['graphic.lerp']` | `(lerp)=>{ parse, lerp, format, CSS_NAMED_COLORS }` | yes |
| `graphic.scopedIds` **[scene layer]** | `lib.graphic.svg` | `[]` | `()=>{ createScope }` — `createScope(prefix?)→{ id, ref, prefix, seq }` (per-instance scoped id + `url(#…)`/`href` rewrite) | yes |
| `graphic.interpolate` | `lib.graphic.interpolate` | `['graphic.lerp','graphic.units','graphic.matrix','graphic.color']` | `(lerp,units,matrix,color)=>{ detect, interpolator, parseTransform, parsePath }` | yes |
| `graphic.svgApply` | `fw.dom.graphic` | `['dom']` | `(dom)=>{ SVG_NS, svgAttr }` — `svgAttr=(t,n,v)=>dom.attr(t,n,String(v))` w/ missing-target guard | no |
| `graphic.svgBuild` **[scene layer]** | `fw.dom.graphic` | `['dom','graphic.svgApply']` | `(dom,svgApply)=>{ build, SVG_TAGS }` — JSON→SVG builder over `createElementNS`; every attr via `svgApply.svgAttr`; `opts.idScope` seam | no |
| `graphic.scheduler` | `fw.dom.graphic` | `['clock']` | `(clockApi)=>{ Scheduler, scheduler }` (class + shared singleton; default `now` = fw `clock.monotonic`) | no |
| `graphic.tween` | `fw.dom.graphic` | `['graphic.scheduler','graphic.easing','graphic.interpolate','graphic.svgApply']` | `(scheduler,easing,interpolate,svgApply)=>{ Tween, tween, resolveEasing }` (default writer = `svgApply.svgAttr`; `resolveEasing` adds the CSS timing functions) | no |
| `graphic.timeline` | `fw.dom.graphic` | `['graphic.scheduler','graphic.tween']` | `(scheduler,tweenMod)=>{ Timeline }` | no |
| `graphic.scene` **[scene layer]** | `fw.dom.graphic` | `['graphic.svgBuild','graphic.scopedIds','graphic.timeline','graphic.tween','graphic.scheduler']` | `(svgBuild,scopedIds,timelineMod,tweenMod,scheduler)=>{ createScene }` — instance-scoped scene/event DSL on the shared scheduler | no |
| `graphic.frames` **[frames]** | `fw.dom.graphic` | `['graphic.scheduler','graphic.svgApply']` | `(scheduler,svgApply)=>{ Frames, frames }` — sprite/frame-sequence player on the shared scheduler | no |
| `graphic.pageflip` **[pageflip]** | `fw.dom.graphic` | `['graphic.svgBuild','graphic.scopedIds','graphic.timeline','graphic.tween','graphic.svgApply','pageflip.fold','pageflip.compose']` | `(svgBuild,scopedIds,timelineMod,tweenMod,svgApply,fold,compose)=>{ Pageflip, pageflip }` — page-fold effect; `pageflip.fold`/`pageflip.compose` (`lib.graphic.pageflip`) are DI-injected pure kernels, **not** `graphicModules` members | no |
| `graphic.hypertree` **[hypertree]** | `fw.dom.graphic` | `['graphic.svgBuild','graphic.scopedIds','graphic.timeline','graphic.tween','graphic.svgApply','graphic.scheduler','hypertree.layout','hypertree.measure']` | `(svgBuild,scopedIds,timelineMod,tweenMod,svgApply,scheduler,layout,measure)=>{ Hypertree, hypertree }` — radial/hyperbolic tree; `hypertree.layout`/`hypertree.measure` (`lib.graphic.hypertree`) are DI-injected pure kernels, **not** `graphicModules` members | no |
| `graphic.anim` **[aggregator]** | `fw.dom.graphic` | the **frozen 14 core**, in registry order: `['graphic.lerp','graphic.easing','graphic.units','graphic.matrix','graphic.color','graphic.scopedIds','graphic.interpolate','graphic.svgApply','graphic.svgBuild','graphic.scheduler','graphic.tween','graphic.timeline','graphic.scene','graphic.frames']` | `(…14 params)=>{ …the 14 members }` — capture-free aggregator: every returned member is a factory **parameter**, so `factory.toString()` has zero free identifiers | no (transitively DOM-bound) |
| `graphic.svg3d` **[svg3d]** | `fw.dom.graphic` | `['svg3d.vec3','svg3d.mesh','svg3d.project','svg3d.apply','graphic.svgBuild','graphic.scopedIds','graphic.timeline','graphic.tween','graphic.svgApply','graphic.scheduler']` | `(vec3Api,meshApi,projectApi,applyApi,svgBuild,scopedIds,timelineMod,tweenMod,svgApply,scheduler)=>{ Svg3d, createTerrain }` — software-3D terrain viewer; `svg3d.vec3`/`svg3d.mesh`/`svg3d.project` (pure kernels) and `svg3d.apply` (the DOM rig builder) are DI-injected, **not** `graphicModules` members | no |

## `graphicModules` registration order

```js
export const graphicModules = [
    graphic.lerp,
    graphic.easing,
    graphic.units,
    graphic.matrix,
    graphic.color,
    graphic.scopedIds,   // [scene layer]
    graphic.interpolate,
    graphic.svgApply,
    graphic.svgBuild,    // [scene layer]
    graphic.scheduler,
    graphic.tween,
    graphic.timeline,
    graphic.scene,       // [scene layer]
    graphic.frames,      // [frames]   ← end of the frozen 14 core
    graphic.pageflip,    // [pageflip]
    graphic.hypertree,   // [hypertree]
    graphic.anim,        // [aggregator]   aggregator
    graphic.svg3d,       // [svg3d]   terrain viewer, topo-last
];
```

**18 modules.** Dependencies must precede dependents. This order is the single
canonical registration array exported from `src/main.js`, and it is mirrored by
four coupled sites that must be updated in lockstep on every append:
`tests/registry.integration.test.js` (length + topo `names` + per-module deps row),
`tests/frames.integration.test.js` (total length + frames position),
`tests/standalone-bundles.integration.test.js` (`dist/build` barrel count +
descriptor-name list), and `tools/generate-bundles.mjs` (`DESCRIPTORS`). This
page is the fifth: `tests/contract-doc.integration.test.js` compares its table,
its listing and its counts with the live registry.

Every extension is additive: earlier modules keep their original relative order
(scopedIds slots among the pure leaves; svgBuild directly after its `svgApply` dep;
scene, frames, pageflip, hypertree and finally the aggregator each topo-last at their
wave). Each DOM-bound module has a matching `graphic.<name>Bundle` entry in `bundle`
inlining `secPolicy`+`dom`; pure leaves (e.g. scopedIds) inline no fw code and stay
Worker-safe.

**Aggregator scope (`graphic.anim`).** The aggregator covers the **frozen 14 core
only** — plan-frozen scope; the extensions `graphic.pageflip` and `graphic.hypertree`
are deliberately **not** aggregated (they are opt-in feature modules with their own
injected pure kernels). It is a **strict superset** registration: adding it moves and
alters nothing. It ships as a **registry member only** — present in `graphicModules`
and the `dist/build` barrel, with **no `bundle`/`ROOTS` entry and no
`dist/standalone` root** (no consumer wants an all-in-one
framework-free blob; `dist/standalone` is byte-unchanged by this append).

## `fw_require` and `src/main.js` generator contract

**`'dom'`** is the **fw** module (`@awacloud/fw/dom/query/dom.js`, dep `secPolicy`)
— NOT a graphic descriptor. It is NOT in `graphicModules`, but IS in
`fw_require` (with its transitive `secPolicy`). Both are capture-free +
inlinable (verified).

**secPolicy scope note (accurate)**: `dom.attr()` writes via raw
`setAttribute` — it does NOT invoke secPolicy sanitization. Only
`dom.style`/visibility paths sanitize through secPolicy. Documentation and
code must not claim secPolicy guards `dom.attr` writes.

**`src/main.js` generator contract**:

- `fw_require = [secPolicy, dom, interp, easing, clock]`
- `modules = graphicModules`
- `extras = []`
- `bundle = [ one bare-core entry per public root ]` (per-root + the full
  `graphic.timeline` bundle) + the fw-mode re-export barrel + direct-ESM
  convenience re-exports.

## `exports` map

```json
{
  ".":                              { "types": "./types/main.d.ts", "browser": "./src/main.js", "import": "./src/main.js", "default": "./src/main.js" },
  "./kernels/pageflip/fold.js":     { "types": "./src/pageflip/fold.d.ts",     "default": "./src/pageflip/fold.js" },
  "./kernels/pageflip/compose.js":  { "types": "./src/pageflip/compose.d.ts",  "default": "./src/pageflip/compose.js" },
  "./kernels/hypertree/layout.js":  { "types": "./src/hypertree/layout.d.ts",  "default": "./src/hypertree/layout.js" },
  "./kernels/hypertree/measure.js": { "types": "./src/hypertree/measure.d.ts", "default": "./src/hypertree/measure.js" },
  "./kernels/svg3d/vec3.js":        { "types": "./src/svg3d/vec3.d.ts",        "default": "./src/svg3d/vec3.js" },
  "./kernels/svg3d/mesh.js":        { "types": "./src/svg3d/mesh.d.ts",        "default": "./src/svg3d/mesh.js" },
  "./kernels/svg3d/project.js":     { "types": "./src/svg3d/project.d.ts",     "default": "./src/svg3d/project.js" },
  "./kernels/svg3d/apply.js":       { "types": "./src/svg3d/apply.d.ts",       "default": "./src/svg3d/apply.js" },
  "./build/*":      { "default": "./dist/build/*" },
  "./standalone/*": { "default": "./dist/standalone/*" },
  "./package.json": "./package.json"
}
```

`types: "./types/main.d.ts"` (hand-authored — the barrel plus the two
constructible helpers, see below) and a `files` allowlist (`src/**/*.js` minus
tests and the perf utility, the `src` and `types/` declarations, both `dist/`
surfaces, `docs`, `demos`, `playground`, `README.md`,
`CHANGELOG.md`, `LICENSE`, `NOTICE`) came with the kernel-surface narrowing below;
the dead `./modules` alias (a second route to `./src/main.js`, zero consumers
repo-wide) was removed at the same time. Each
kernel key names its sibling `.d.ts` as a first `types` condition, and
`types/main.d.ts` also types the helpers' instances (`Pageflip`, `Hypertree`)
and options; `tests/types-consumer.integration.test.js` compiles a strict
TypeScript consumer against the whole surface. Every `./build/*` and
`./standalone/*` JavaScript file has a generated `.d.ts` beside it
(`gen:bundles` derives each from the file it writes: the export, the
descriptor's literal `name` and `dependencies`, and a `factory` typed with the
`Pageflip`/`Hypertree` surfaces for those two roots, `unknown` elsewhere);
`tests/dist-types.integration.test.js` holds them to the files.

## Kernel export surface (`./kernels/*`, an explicit allowlist)

The kernels DI-injected into the three off-aggregate composed
modules — `pageflip.fold`/`pageflip.compose`, `hypertree.layout`/
`hypertree.measure`, and `svg3d.vec3`/`svg3d.mesh`/`svg3d.project`/
`svg3d.apply` — are **not** `graphicModules` registry members (see the
per-descriptor notes above and in `graphic.pageflip`/`graphic.hypertree`'s
table rows). Seven are pure and Worker-safe; `svg3d.apply` is the svg3d rig
builder and touches the DOM. A first `./kernels/*` → `./src/*` wildcard
published the whole `src/` tree as a supported subpath; it was narrowed to the
**eight exact keys** shown above — one
per documented kernel, no more, no less — so each kernel resolves through its
own real package specifier, e.g.:

```js
import { foldModule }          from '@awacloud/graphic-anim/kernels/pageflip/fold.js';
import { composeModule }       from '@awacloud/graphic-anim/kernels/pageflip/compose.js';
import { hypertreeLayoutModule }  from '@awacloud/graphic-anim/kernels/hypertree/layout.js';
import { hypertreeMeasureModule } from '@awacloud/graphic-anim/kernels/hypertree/measure.js';
import { svg3dVec3Module }     from '@awacloud/graphic-anim/kernels/svg3d/vec3.js';
import { svg3dMeshModule }     from '@awacloud/graphic-anim/kernels/svg3d/mesh.js';
import { svg3dProjectModule }  from '@awacloud/graphic-anim/kernels/svg3d/project.js';
import { svg3dApplyModule }    from '@awacloud/graphic-anim/kernels/svg3d/apply.js';
```

**Mechanism, and why not a root-barrel re-export.** `src/main.js` imports
`@awacloud/fw/dom/query/dom.js` and `graphic.svgApply` (`src/svg/apply.js`)
unconditionally at its own top level (for the DOM-bound descriptors it also
re-exports); ES module evaluation runs a module's WHOLE top level on any
import from it, not just the requested binding, and this package ships with
no bundler to tree-shake that away. Re-exporting a kernel from `src/main.js`
would therefore always evaluate that DOM-bound code too, on every kernel-only
import. Each of the eight `./kernels/<path>` entries resolves straight to
that kernel's own source file, bypassing `main.js` (and so
`dom.js`/`svg/apply.js`) entirely — the frozen `graphicModules` table and its
dependency tuples above are untouched; this is an additive `exports`-map
entry only, an explicit allowlist rather than a wildcard (no external
consumer used any other `./kernels/*` subpath — measured, zero hits
repo-wide). Verified by a real import-graph walk in
`tests/kernel-exports.integration.test.js`.

## `dist/**` perimeter rule

Normative source: the **"fw add-on packages"** section of
the monorepo's front-package convention (frozen 2026-07-20). `dist/**` is
**generated + committed + lint-excluded**.

### dist surface

```
dist/standalone/
  graphic-<root>-bundled.js         × 17 — one per `src/main.js` `bundle` entry
                                    (the frozen 14-entry ROOTS/DOM_BOUND tables)
                                    PLUS the three composed extension roots
                                    below (`graphic-pageflip`, `graphic-
                                    hypertree`, `graphic-svg3d`)
dist/build/
  index.js                          fw-mode barrel (graphicModules + every descriptor)
  graphic-anim.standalone.{js,min.js,meta.json}       assembled aggregate — fw INLINED
  graphic-anim.fw.{js,min.js,meta.json}               assembled aggregate — fw INJECTED
  graphic-svg3d.standalone.{js,min.js,meta.json}      composed svg3d root — fw INLINED
  graphic-svg3d.fw.{js,min.js,meta.json}              composed svg3d root — fw INJECTED
  graphic-pageflip.standalone.{js,min.js,meta.json}   composed pageflip root — fw INLINED
  graphic-pageflip.fw.{js,min.js,meta.json}           composed pageflip root — fw INJECTED
  graphic-hypertree.standalone.{js,min.js,meta.json}  composed hypertree root — fw INLINED
  graphic-hypertree.fw.{js,min.js,meta.json}          composed hypertree root — fw INJECTED
```

`graphic-svg3d.*`, `graphic-pageflip.*` and
`graphic-hypertree.*` are each a
**DEDICATED root, not an aggregate member**: `AGGREGATE_NAMES` stays the
frozen 14, `graphicModules` stays 18, and `src/main.js`'s `bundle` export
stays the 14 per-root bare cores — none of the three widens it. They exist
because `src/svg3d/svg3d.js`, `src/pageflip/pageflip.js` and
`src/hypertree/hypertree.js` each transitively import `src/svg/apply.js`'s
bare `@awacloud/fw/dom/query/dom.js` specifier, so their composed classes
(`Svg3d`/`createTerrain`, `Pageflip`/`pageflip`, `Hypertree`/`hypertree`) had
no import-map-free, bundler-free entry at all — only their own pure kernel
leaves under `./kernels/<module>/*` did. **`dist/standalone/` is no longer
byte-unchanged by this mechanism**: it grew from 14 to 17 roots — each of
the three extension
roots comes from one additional entry passed to the existing standalone
`generatePrebuilds` call, alongside its `dist/build` assembled pair produced
the same way as `graphic-svg3d`'s. All three variants come out of the same
`generatePrebuilds` call shape as the aggregate pair, with each module's own
off-registry sibling kernels passed as generator `extras`; each `meta.json`
names its root under a `root` key (the aggregate's counterpart key is
`aggregate`). See `docs/svg3d.md`, `docs/pageflip.md`, `docs/hypertree.md`
§"Prebuilt roots".

### Declared-sibling `.fw` variant (the three composed extension roots)

The `.fw.js` of `graphic-pageflip`,
`graphic-hypertree` and `graphic-svg3d` **declares** the public `graphic.*`
modules it reaches instead of inlining a private duplicate of them (generator
option `externalSiblings`, candidate list derived live from `graphicModules` —
never hardcoded). Consequences, all contractual:

- **The consumer must already hold the core registered.** Such a root's
  `dependencies` are `["secPolicy", "dom", …the reached graphic.* siblings]`, in
  that order, and its `factory()` takes one argument per entry. Register it on a
  `ModuleRuntime` that also carries `graphicModules`, or hand it the resolved
  values positionally. A page holding only fw can no longer resolve it — that is
  the trade for the size, and it removes the second private `graphic.scheduler`
  (a second rAF loop) the inlined variant used to build.
- **`meta.json` gains `siblingDependencies: { modules, package }`**, emitted
  ONLY for a root that actually declares siblings (every other `meta.json` keeps
  its exact previous key set). `modules` is the DI contract — the names the
  consumer's runtime must resolve, in `dependencies` order; `package` is
  provenance only (`ModuleRuntime.resolve()` resolves names, never specifiers).
  `fwDependencies` keeps its frozen meaning, the fw closure alone, so
  `fwDependencies ++ siblingDependencies.modules` reconstructs the descriptor's
  own `dependencies` and the inlined set is `modules \ siblingDependencies.modules`.
- **`.standalone.*` is unaffected** and stays fully inlined (owner ruling): the
  option is inert on the generator's `bundled` path by construction, so those
  files — and every `dist/standalone/*-bundled.js` — are byte-identical.
- **Sizes are stated relatively, never locked**: each declared `.fw` is under
  half its `.standalone` twin (measured ≈ −73% dev / −75% min at introduction).

- Generated by `@awacloud/tool-prebuild-generator` via `bun run gen:bundles`.
- Committed to the repo so consumers get pre-built bundles without a build step.
- **Fully deterministic**: `gen:bundles` writes no build stamp, so a second run
  is byte-identical for every file, `*.meta.json` included (the `builtAt` ISO
  timestamp was removed). Any
  run-varying field reintroduced here reddens
  `tests/dist-build-aggregate.integration.test.js`.
- Excluded from ESLint (`ignores: ['dist/**']` in `eslint.config.js`) — the
  inlined `factory.toString()` content in bundles would false-positive on the
  `fw/no-factory-capture` rule.
- Never hand-edit files under `dist/`; re-run `gen:bundles` instead.
