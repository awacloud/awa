# `@awacloud/graphic-anim` — generated dual-surface bundles

> Output of `bun run gen:bundles` (wrapper `tools/generate-bundles.mjs` over
> `@awacloud/tool-prebuild-generator`). `dist/**` is **generated, committed and
> lint-excluded** — never hand-edit; re-run `gen:bundles` instead.

Two surfaces are produced for the package's **14 frozen engine roots**, from
the single source of truth `src/main.js`:

| Surface | Path | fw coupling | Import via |
|---|---|---|---|
| **standalone** | `dist/standalone/*-bundled.js` | none (factories inlined) | `@awacloud/graphic-anim/standalone/<id>-bundled.js` |
| **build** (fw-mode) | `dist/build/index.js` | registered on `@awacloud/fw` | `@awacloud/graphic-anim/build/index.js` |

`src/main.js` is not the only source, though: the **three composed extension
modules** — `graphic.pageflip`, `graphic.hypertree`, `graphic.svg3d` — each
add one more `dist/standalone/*-bundled.js` root (17 total) plus their own
assembled `dist/build/graphic-<mod>.{standalone,fw}.*` pair, both emitted
directly by `tools/generate-bundles.mjs` via the
same `generatePrebuilds` call shape, with each module's own off-registry pure
kernels passed as generator `extras` — not through `src/main.js`'s own
`bundle` export, which stays exactly the 14 frozen per-root cores. See
"Prebuilt roots" in `docs/pageflip.md`, `docs/hypertree.md`, `docs/svg3d.md`.

`package.json` `exports` map: `./standalone/*` → `./dist/standalone/*` and
`./build/*` → `./dist/build/*` (both cover every root regardless of which
mechanism produced it — the subpath is generic).

## Standalone bundles (`dist/standalone/`)

One framework-free bundle per public resolution root. Each file exports a single
module descriptor `{ name, dependencies: [], factory }` whose `factory()` runs an
inlined mini-DI (`__register`/`__resolve`) that rebuilds the core value from every
transitively-reachable factory — zero `@awacloud/fw` imports.

The table below is the FULL generated set — enumerate it from `dist/standalone/`
after a `gen:bundles` run, never from memory. Seventeen roots ship today: the
fourteen engine roots declared by `src/main.js`'s frozen `bundle` export, plus
the three composed **extension** roots appended by `tools/generate-bundles.mjs`
.

| Bundle file | Export | Resolves to | Inlines fw | Worker-safe |
|---|---|---|---|---|
| `graphic-lerp-bundled.js` | `graphicLerpBundled` | `(a,b,t)=>number` | none | yes |
| `graphic-easing-bundled.js` | `graphicEasingBundled` | 31-curve easing table | none | yes |
| `graphic-units-bundled.js` | `graphicUnitsBundled` | `{ split, format }` | none | yes |
| `graphic-matrix-bundled.js` | `graphicMatrixBundled` | `{ Matrix, lerpDecomposition }` | none | yes |
| `graphic-color-bundled.js` | `graphicColorBundled` | `{ parse, lerp, format, CSS_NAMED_COLORS }` | none | yes |
| `graphic-scoped-ids-bundled.js` | `graphicScopedIdsBundled` | `{ createScope }` | none | yes |
| `graphic-interpolate-bundled.js` | `graphicInterpolateBundled` | `{ detect, interpolator, parseTransform, parsePath }` | none | yes |
| `graphic-svg-apply-bundled.js` | `graphicSvgApplyBundled` | `{ SVG_NS, svgAttr }` | `secPolicy`+`dom` | no |
| `graphic-svg-build-bundled.js` | `graphicSvgBuildBundled` | `{ build, SVG_TAGS }` | `secPolicy`+`dom` | no |
| `graphic-scheduler-bundled.js` | `graphicSchedulerBundled` | `{ Scheduler, scheduler }` | none | no |
| `graphic-tween-bundled.js` | `graphicTweenBundled` | `{ Tween, tween, resolveEasing }` | `secPolicy`+`dom` | no |
| `graphic-timeline-bundled.js` | `graphicTimelineBundled` | `{ Timeline }` | `secPolicy`+`dom` | no |
| `graphic-scene-bundled.js` | `graphicSceneBundled` | `{ createScene }` | `secPolicy`+`dom` | no |
| `graphic-frames-bundled.js` | `graphicFramesBundled` | `{ Frames, frames }` | `secPolicy`+`dom` | no |
| `graphic-pageflip-bundled.js` | `graphicPageflipBundled` | `{ Pageflip, pageflip }` | `secPolicy`+`dom` | no |
| `graphic-hypertree-bundled.js` | `graphicHypertreeBundled` | `{ Hypertree, hypertree }` | `secPolicy`+`dom` | no |
| `graphic-svg3d-bundled.js` | `graphicSvg3dBundled` | `{ Svg3d, createTerrain }` | `secPolicy`+`dom` | no |

The three extension bundles additionally inline their own off-registry DI
kernels — `pageflip.fold`/`pageflip.compose`, `hypertree.layout`/
`hypertree.measure`, `svg3d.vec3`/`mesh`/`project`/`apply` — which reach the
generator as `extras`, not as `graphicModules` members. Those kernels are
reachable on their own (`@awacloud/graphic-anim/kernels/<path>`); all but
`svg3d.apply` (the svg3d rig builder, which writes the DOM) are Worker-safe,
and the composed class around them is DOM-bound.

### fw inlining rule

A standalone bundle inlines **only the fw modules its core transitively reaches**
(`inlineReachableFwOnly` in the generator). The six pure-math leaves reach no fw
module, so they inline none and stay **Worker-safe slices**. The DOM-bound roots
that depend (transitively) on fw `dom` inline `secPolicy`+`dom`.

> **`graphic-scheduler` note**: per the frozen contract `graphic.scheduler` has
> `dependencies: []` — it touches `requestAnimationFrame` ambient globals, not fw
> `dom`. It therefore inlines **no** fw module yet is **not** Worker-safe (it
> needs the rAF main-thread loop). "Inlines fw" and "Worker-safe" are independent
> axes here.

> **`dom.attr` scope**: `graphic.svgApply` writes attributes via `dom.attr()` →
> raw `setAttribute`, which does **not** run `secPolicy` sanitization. Only
> `dom.style`/visibility paths sanitize through `secPolicy`. Do not assume SVG
> attribute values are XSS-filtered beyond what `setAttribute` enforces.

### Using a standalone bundle

```js
import { graphicTimelineBundled } from '@awacloud/graphic-anim/standalone/graphic-timeline-bundled.js';

// Run the inlined mini-DI to build the core value — no @awacloud/fw needed.
const { Timeline } = graphicTimelineBundled.factory();

// A pure-leaf slice is safe to import inside a Worker:
import { graphicInterpolateBundled } from '@awacloud/graphic-anim/standalone/graphic-interpolate-bundled.js';
const { interpolator } = graphicInterpolateBundled.factory();
```

## Build barrel (`dist/build/index.js`)

The fw-mode surface. Re-exports the canonical `graphicModules` registration array
and every individual module descriptor from `src/main.js`, for registration on an
`@awacloud/fw` runtime:

```js
import { graphicModules } from '@awacloud/graphic-anim/build/index.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';

const rt = new ModuleRuntime();
rt.registerAllDeep(graphicModules); // pulls fw dom + secPolicy via svgApply's deps
const { Timeline } = rt.resolve('graphic.timeline');
```

`dist/build/index.js` is not the only fw-mode artifact either. Four **assembled
root pairs** live alongside it, each self-contained (no `ModuleRuntime`
wiring needed): `graphic-anim.{standalone,fw}.*` (the frozen 14-module
aggregate) and, `graphic-svg3d.*`,
`graphic-pageflip.*` and `graphic-hypertree.*` (one composed extension each).
The `.fw.js` twin of a pair still expects `@awacloud/fw` as a peer
(`dependencies` in its `meta.json` is non-empty); the `.standalone.js` twin
inlines fw the same way a `dist/standalone/*-bundled.js` root does. For the
three composed extensions the `.fw.js` additionally expects the `graphic-anim`
registry itself: It DECLARES the `graphic.*`
siblings it reaches (`meta.json` → `siblingDependencies.modules`) rather than
inlining a private duplicate of them, which is what makes it under half the
size of its `.standalone` twin:

```js
import { graphicSvg3dPackage } from '@awacloud/graphic-anim/build/graphic-svg3d.fw.js';
import { fw_require, graphicModules } from '@awacloud/graphic-anim';

runtime.registerAllDeep([...fw_require, ...graphicModules, graphicSvg3dPackage]);
const { createTerrain } = runtime.resolve('graphicSvg3dPackage'); // resolved by the descriptor's OWN name
```

(The `graphic-anim.fw.js` aggregate declares no siblings — it *is* the core a
consumer holds — so `[...fw_require, graphicAnimPackage]` remains enough there.)

See "Prebuilt roots" in `docs/svg3d.md`/`docs/pageflip.md`/`docs/hypertree.md`
for each extension's full pair (both variants, both `.min.js` twins).

The same descriptors are also available directly from the package root
(`@awacloud/graphic-anim`), which `dist/build/index.js` re-exports verbatim.

## Regeneration & invariants

```bash
bun run gen:bundles            # from packages/front/graphic/anim
```

- **Deterministic**: a second run is byte-identical for EVERY emitted file,
  `*.meta.json` included — no build stamp is written (covered by
  `tests/standalone-bundles.integration.test.js` and
  `tests/dist-build-aggregate.integration.test.js`, both raw-byte comparisons).
- **Capture backstop**: each bundle's `factory()` is exercised in the test suite;
  a captured (undefined) free variable would throw a `ReferenceError` at resolve
  time. Capture-freedom is primarily enforced upstream by the package-local
  `fw/no-factory-capture` ESLint rule over `src/**`.
- **Shared tool**: the generator is `@awacloud/tool-prebuild-generator`, shared with
  the office packages and `crypto-suite`. The graphic surface uses its
  `variants`, `inlineReachableFwOnly` and — for the three composed extension
  roots only — `externalSiblings`/`siblingPackage` options (all default-off, so
  every other consumer's output is byte-identical; proven by
  `tools/prebuild-generator/tests/byte-inertness.integration.test.mjs`).
