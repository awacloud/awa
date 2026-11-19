# Documentation `@awacloud/graphic-anim`

SVG-first animation engine — fw add-on, Worker-aware. See the
[package README](../README.md) for the pitch, install and quick start.

> **Current state** — **L3** (`awa.maturity`). 18 registered `graphic.*` fw
> module descriptors under a frozen contract (see [CONTRACT](./CONTRACT.md)):
> pure Worker-safe math/interpolation, the tween/timeline/scheduler engine,
> the declarative scene DSL, and three composed extension modules —
> pageflip, hypertree, svg3d. Both an fw-DI surface and a fully
> framework-free `dist/standalone/` surface ship from the same source
> (the monorepo's "fw add-on packages" packaging convention).

## Guides

| Guide | Topic |
|-------|-------|
| [Getting started](./guide/getting-started.md) | Install, boot, first tween — animate a few elements. |
| [Engine](./guide/engine.md) | Tween · Timeline · Scheduler — the core animation primitives. |
| [Frames](./guide/frames.md) | Discrete frame-sequence stepping (sprite/scrub). |
| [Scene](./guide/scene.md) | JSON→SVG scene builder + declarative named-event DSL. |

## Extension module guides

Composed modules outside the frozen 14-module `graphic.anim` aggregate, each
shipping its own pure kernels and prebuilt roots. These three live directly
under `docs/`, not `docs/guide/`:

| Guide | Topic |
|-------|-------|
| [pageflip](./pageflip.md) | Page-curl book (`graphic.pageflip`). |
| [hypertree](./hypertree.md) | Radial/hyperbolic tree with animated focus (`graphic.hypertree`). |
| [svg3d](./svg3d.md) | Software-3D heightmap terrain in SVG (`graphic.svg3d`). |

## API reference

Mirrors `src/` — one page per module, grouped by area.

### Main

| Page | Covers |
|---|---|
| [`main`](./api/main.md) | Public entry point — generator contract, fw-mode barrel, constructible helpers (`createPageflip`/`createHypertree`). |
| [`aggregator`](./api/aggregator.md) | `graphic.anim` — whole-package resolve of the 14 core modules in one namespace object. |

### Math (5)

| Page | Covers |
|---|---|
| [`lerp`](./api/math/scalar.md) | Scalar linear interpolation — the shared numeric primitive for all tween math. |
| [`easing`](./api/math/easing.md) | 31 normalized Penner curves — shaped clock for value-agnostic interpolation. |
| [`units`](./api/math/units.md) | CSS unit split and format — parse `"50px"` and round-trip back to string. |
| [`matrix`](./api/math/matrix.md) | 2D affine `Matrix` + decomposition for transform interpolation. |
| [`color`](./api/math/color.md) | CSS colour parse / lerp / format. |

### Interpolate (3)

| Page | Covers |
|---|---|
| [`index`](./api/interpolate/index.md) | Value-type detection → typed interpolator seam. |
| [`path`](./api/interpolate/path.md) | Parse SVG path `d` data to a canonical segment list, for morphing. |
| [`transform`](./api/interpolate/transform.md) | Parse an SVG/CSS transform function-list into a single affine `Matrix`. |

### Anim (3)

| Page | Covers |
|---|---|
| [`scheduler`](./api/anim/scheduler.md) | One shared rAF loop ticking all active tweens — the single-scheduler invariant. |
| [`tween`](./api/anim/tween.md) | Reference-bound single-property tween driven by the shared scheduler. |
| [`timeline`](./api/anim/timeline.md) | Compose tweens with computed start offsets, on the same shared scheduler. |

### Svg (3)

| Page | Covers |
|---|---|
| [`apply`](./api/svg/apply.md) | SVG attribute writing, routed through fw `dom.attr`. |
| [`build`](./api/svg/build.md) | JSON→SVG builder — recursively constructs a namespace-correct `SVGElement` subtree. |
| [`scoped-ids`](./api/svg/scoped-ids.md) | Collision-free scoped id generation and reference rewriting for repeated SVG templates. |

### Scene (2)

| Page | Covers |
|---|---|
| [`scene`](./api/scene/scene.md) | Instance-scoped scene / named-event DSL, wiring declarative animations to elements. |
| [`parity`](./api/scene/parity.md) | Both-surfaces parity + perf gate note for the scene builder DSL. |

### Frames (1)

| Page | Covers |
|---|---|
| [`frames`](./api/frames/frames.md) | Reference-bound frame-sequence primitive — steps discrete SVG frame elements. |

### Helpers (1)

| Page | Covers |
|---|---|
| [`shared-runtime`](./api/helpers/shared-runtime.md) | The one reference-counted `ModuleRuntime` shared by `createPageflip` and `createHypertree`. |

### Pageflip (4)

| Page | Covers |
|---|---|
| [`pageflip`](./api/pageflip/pageflip.md) | `graphic.pageflip` — page-curl book as SVG, single page or two-page spread. |
| [`fold`](./api/pageflip/fold.md) | `pageflip.fold` — pure page-curl fold solver (turn and under polygons). |
| [`compose`](./api/pageflip/compose.md) | `pageflip.compose` — serialize a fold polygon to a closed path `d` string. |
| [`create`](./api/pageflip/create.md) | `createPageflip` — build a book and mount it without wiring the descriptor by hand. |

### Hypertree (4)

| Page | Covers |
|---|---|
| [`hypertree`](./api/hypertree/hypertree.md) | `graphic.hypertree` — radial tree as SVG with animated re-rooting focus. |
| [`layout`](./api/hypertree/layout.md) | `hypertree.layout` — pure radial layout and focus re-rooting solver. |
| [`measure`](./api/hypertree/measure.md) | `hypertree.measure` — deterministic character-budget label word-wrap. |
| [`create`](./api/hypertree/create.md) | `createHypertree` — build a tree into an element, creating the SVG root when needed. |

### Svg3d (5)

| Page | Covers |
|---|---|
| [`svg3d`](./api/svg3d/svg3d.md) | `graphic.svg3d` — software-3D heightmap terrain in SVG with an orbiting camera. |
| [`vec3`](./api/svg3d/vec3.md) | `svg3d.vec3` — pure 3D vector and 3×3 rotation kernel. |
| [`mesh`](./api/svg3d/mesh.md) | `svg3d.mesh` — heightmap decode and grid mesh with precomputed normals and colours. |
| [`project`](./api/svg3d/project.md) | `svg3d.project` — per-frame rotate, perspective, cull, shade and painter sort. |
| [`apply`](./api/svg3d/apply.md) | `svg3d.apply` — the bucketed-path and per-polygon SVG write strategies. |

### Perf (1)

| Page | Covers |
|---|---|
| [`perf`](./api/perf.md) | ms/frame perf harness — the standing regression gate (500 tweens / 16.67 ms). |

### Standalone (1)

| Page | Covers |
|---|---|
| [`standalone`](./api/standalone.md) | Generated dual-surface `dist/` bundles — standalone and fw-mode. |

## Contracts & internals

| Page | Topic |
|------|-------|
| [CONTRACT](./CONTRACT.md) | Frozen module descriptor table (name/type/deps) — the normative source. |
| [aggregator](./aggregator.md) | `graphic.anim` — whole-package resolve of the frozen 14-module core. |

## See also

- [README package](../README.md)
- [`@awacloud/fw` doc format spec](https://github.com/awacloud/awa/blob/main/packages/front/fw/docs/guide/doc-format.md)
