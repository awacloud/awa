# @awacloud/graphic-anim

SVG-first animation engine, an `@awacloud/fw` add-on — Worker-safe math
kernels, one shared scheduler, zero runtime deps beyond `@awacloud/fw`.

## Installation

```bash
npm install @awacloud/graphic-anim
```

`@awacloud/fw` is a dependency and is installed with it.

## Quick start

The pure kernels run anywhere, Bun included — no fw runtime, no DOM:

```js
import { svg3dVec3Module } from '@awacloud/graphic-anim/kernels/svg3d/vec3.js';

const { cross3, length3 } = svg3dVec3Module.factory();
console.log(cross3(1, 0, 0, 0, 1, 0, [0, 0, 0]), length3(3, 4, 0));   // [ 0, 0, 1 ] 5
```

The animation engine itself is browser-bound (it targets SVG elements):

```js
import { runtime } from '@awacloud/fw';
import { graphicModules } from '@awacloud/graphic-anim';

runtime.registerAllDeep(graphicModules);   // pulls fw dom + secPolicy too
const { Timeline } = runtime.resolve('graphic.timeline');

const tl = new Timeline();
tl.add({ target: rect, property: 'width', from: 0, to: 200, duration: 600, easing: 'easeOutCubic' });
tl.play();
```

Descriptor names are frozen ([docs/CONTRACT.md](docs/CONTRACT.md)); the
`graphic.*` prefix avoids colliding with fw's own bare `easing` module when
both are registered in the same runtime.

## Consumption modes

| Mode | Use when | Docs |
|---|---|---|
| fw DI runtime | You already run `@awacloud/fw` — `registerAllDeep(graphicModules)`, then `resolve('graphic.<name>')`. | [docs/api/main.md](docs/api/main.md) |
| Standalone bundles | No fw runtime — import one `dist/standalone/*-bundled.js`, call its `.factory()`. Pure-leaf bundles are Worker-safe. | [docs/api/standalone.md](docs/api/standalone.md) |
| Assembled `dist/build` pairs | Whole package in one file: `.fw.js` (fw injected) or `.standalone.js` (fw inlined). | [docs/aggregator.md](docs/aggregator.md) |
| Kernels via `./kernels/*` | The kernels behind the three extension modules, reachable without their composed class: seven pure Worker-safe leaves, plus the DOM-bound svg3d rig builder (`svg3d.apply`). | [docs/CONTRACT.md](docs/CONTRACT.md) |

## Structure

```
src/
├── math/ interpolate/   Pure, Worker-safe: lerp, easing, units, matrix, color, interpolator
├── anim/                Scheduler, Tween, Timeline (main-thread)
├── svg/ scene/ frames/  SVG builder, declarative scene DSL, frame-sequence primitive
├── pageflip/ hypertree/ svg3d/   Composed extension modules + their pure kernels
├── aggregator.js        graphic.anim — the frozen 14-module aggregate
└── main.js              Public entry point (generator contract + fw-mode barrel)
dist/
├── build/       fw-mode pre-built modules (register on @awacloud/fw)
└── standalone/  Self-contained bundles (zero @awacloud/fw) — 17 roots
```

## Demos & playground

Runnable pages: [demos/README.md](demos/README.md) (one page per capability)
and [playground/README.md](playground/README.md) (guided walkthroughs). Serve
them locally with `bun run serve` from the package directory.

## Documentation

Full index: [docs/README.md](docs/README.md). New here? Start with
[Getting started](docs/guide/getting-started.md). The module pattern the
package follows is the one documented in `@awacloud/fw`.

## Build

`dist/` is generated and committed; never edit it by hand. From the package
directory of the source repository:

```bash
bun run gen:bundles
```

It writes `dist/standalone/` (17 framework-free roots, one per public module
root, each with its `.d.ts`) and `dist/build/` (the `index.js` barrel, and a
`.standalone`/`.fw` pair — plain, minified, metadata and declarations — for
the `graphic.anim` aggregate and for each composed extension: pageflip,
hypertree, svg3d). The build is deterministic: the package suite regenerates
it into a temporary directory and fails when the committed `dist/` differs.

## Tests

The tests live in the source repository, not in the published package. From
its root:

```bash
bun test packages/front/graphic/anim/   # unit + integration
```

The source repository's coverage gate holds the package to its line-coverage
floor (`awa.coverageFloor` in `package.json`). A real-browser smoke
(`bun run test:e2e`, Chromium and Firefox) runs from the package directory.

## Sub-paths

| Sub-path | Target | Usage |
|---|---|---|
| `.` | `src/main.js` (types `types/main.d.ts`) | The public entry: `graphicModules`, the frozen `graphic.*` descriptors and the fw-mode barrel. |
| `./kernels/pageflip/fold.js` | `src/pageflip/fold.js` | Pure, Worker-safe page-fold kernel. |
| `./kernels/pageflip/compose.js` | `src/pageflip/compose.js` | Pure, Worker-safe page-flip composition kernel. |
| `./kernels/hypertree/layout.js` | `src/hypertree/layout.js` | Pure, Worker-safe hyperbolic-tree layout kernel. |
| `./kernels/hypertree/measure.js` | `src/hypertree/measure.js` | Pure, Worker-safe hypertree measurement kernel. |
| `./kernels/svg3d/vec3.js` | `src/svg3d/vec3.js` | Pure, Worker-safe 3D vector math. |
| `./kernels/svg3d/mesh.js` | `src/svg3d/mesh.js` | Pure, Worker-safe mesh primitives. |
| `./kernels/svg3d/project.js` | `src/svg3d/project.js` | Pure, Worker-safe projection kernel. |
| `./kernels/svg3d/apply.js` | `src/svg3d/apply.js` | DOM-bound svg3d rig builder (`svg3d.apply`). |
| `./build/*` | `dist/build/*` | The assembled `.fw` / `.standalone` pairs and the barrel. |
| `./standalone/*` | `dist/standalone/*` | The framework-free `*-bundled.js` roots. |

## Maturity

L3 (`awa.maturity` in `package.json`) on the monorepo's L0 to L4 scale. The
frozen descriptor contract is [docs/CONTRACT.md](docs/CONTRACT.md); the
package suite runs under an 81 % line-coverage floor (`awa.coverageFloor`).
The version is 0.1.0, the first release: see [CHANGELOG.md](CHANGELOG.md).

## Licence

Apache-2.0 — see [`LICENSE`](./LICENSE) in this package.

Copyright (c) 2026 AwaCloud SAS

The standalone bundles inline fw's easing module, which implements Robert
Penner's easing equations (BSD-3-Clause); the notice and licence text are in
[`NOTICE`](./NOTICE) and
[`third-party/NOTICE-penner-easing`](./third-party/NOTICE-penner-easing).

## Project

- Website: https://awaforge.eu/
- Source: [`packages/front/graphic/anim`](https://github.com/awacloud/awa/tree/main/packages/front/graphic/anim)
- Issues: this package's own repository has issues disabled — report at
  https://github.com/awacloud/awa/issues
- Security policy and release verification:
  https://github.com/awacloud/awa/blob/main/SECURITY.md
- Maintenance policy:
  https://github.com/awacloud/awa/blob/main/MAINTENANCE.md

Developed by AwaCloud.
