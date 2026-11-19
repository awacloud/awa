# `@awacloud/graphic-anim` — playground

Interactive author testbeds for the animation engine — pick an easing curve
and watch it move, or drive a staged `Timeline` with Play/Stop. Governed by
the source repository's demo-playground convention (`docs/demo-playground.md`,
frozen) — this file states only what is family-specific; the rules
themselves live there.

## Run it

Two documented serve modes:

**Package-local (primary for a standalone install)**:

```bash
cd packages/front/graphic/anim && bun run serve
```

Portal on `http://localhost:3020/` — lists this family's two surfaces under
its "Playground" section, alongside `demos/` and the package docs.

**Monorepo (secondary)**: from the root of the source repository, run its
`local_web` dev server on the `dev` entry of `cnf/local_web/dev.config.json`.

Port `3001` (the canonical `dev` entry — no narrowed entry needed for this
family; per the convention's own default, "use `dev`"). Family URL:
`http://localhost:3001/packages/front/graphic/anim/playground/index.html`.

`cnf/**` is gitignored; the `dev` entry's tracked seed is the source
repository's `tools/local_web/local_web.config.example.json`.
That seed routes `/tools/dev-portal/assets/`, which the shared shell's
stylesheet (below) needs.

## Loading mode

Every surface loads the shared demo-shell stylesheet root-absolute
(`/tools/dev-portal/assets/demo-shell/demo-shell.css`) and the canonical
sanity lockdown (`applyBase()` from `/packages/front/fw/src/sanity/base.js`),
first, before any application module — both canonical (§4).

The `@awacloud/graphic-anim` package itself is loaded through the
**canonical** form of the convention's §2 (fw loading doctrine): an import
map to the ESM **source**, `@awacloud/graphic-anim` → `/packages/front/graphic/anim/src/main.js`,
not a prebuilt `dist/build/*` artefact — unlike the `demos/` family, which
uses the declared *prebuilt-artefact* alternate. Each surface's `main.js`
resolves its own `@awacloud/fw` `ModuleRuntime` directly
(`new ModuleRuntime(); runtime.registerAllDeep(graphicModules); runtime.resolve('graphic.anim')`)
— it does **not** reuse the `demos/` family's `_boot.js`, which is
family-shared plumbing local to that family (underscore-prefixed, excluded
from discovery by construction, per §1).

The import map on each page is **derived by walking the real module graph**
from `./main.js`, not copied from the `demos/hypertree` map that an earlier
draft of this task would have mirrored verbatim. The walk starts at
`main.js`'s own two bare imports (`@awacloud/fw/core/runtime.js`,
`@awacloud/graphic-anim`), then follows `@awacloud/graphic-anim` into
`src/main.js`, which itself imports two more real fw modules
(`@awacloud/fw/dom/query/dom.js`, `@awacloud/fw/dom/rendering/secPolicy.js`,
`src/main.js:27-28`) and — via its own `createPageflip`/`createHypertree`
re-exports (`src/main.js:223-224`) — reaches
`src/{pageflip,hypertree}/create.js`. Both of those import
`@awacloud/fw/core/runtime.js`, the key `main.js` already needs. Every key
declared is therefore load-bearing (never a `"@awacloud/fw/": ".../src/"`
prefix, which would blunt the browser-resolution gate below):

| Key | Value |
|---|---|
| `@awacloud/fw/core/runtime.js` | `/packages/front/fw/src/core/runtime.js` |
| `@awacloud/fw/dom/query/dom.js` | `/packages/front/fw/src/dom/query/dom.js` |
| `@awacloud/fw/dom/rendering/secPolicy.js` | `/packages/front/fw/src/dom/rendering/secPolicy.js` |
| `@awacloud/graphic-anim` | `/packages/front/graphic/anim/src/main.js` |

The package writes every fw specifier with the `.js` suffix, and an import
map matches specifiers exactly, so these four keys are the whole map.

## Surfaces

| Slug | Summary | Static |
|---|---|---|
| `easing-lab` | Pick any of the 31 `graphic.easing` curves; watch a dot glide along a track using it, next to the curve's own shape plotted as an SVG polyline | no |
| `timeline-lab` | Three staged rects driven by one `Timeline` (three offset `.add()` steps); Play/Stop controls, re-enabled through `onSettle` on either ending | no |

## Lint

Real rules, non-vacuous (verified live):

```bash
bunx eslint --print-config packages/front/graphic/anim/playground/easing-lab/main.js
# → JSON, rules: 67 resolved
bunx eslint packages/front/graphic/anim/playground/easing-lab/main.js
# → no output, no "ignored" warning
```

`packages/front/graphic/anim/eslint.config.js` is the resolving config — the
same browser/ESM baseline block that already covers `demos/**/*.js`,
extended to `playground/**/*.js` (mirrored, not forked;
`ecmaVersion: 'latest'` stays).

## Tests

```bash
bun test packages/front/graphic/anim/tests/playground-smoke.integration.test.js
```

Scan-driven (`Bun.Glob('*/main.js')`, no hardcoded slug list) smoke suite:
per surface, `main.js` has no side effect on import, exports a `run`
function, `run(ctx)` executes without throwing under happy-dom, and its
returned handle's `dispose()` runs clean — plus two behavioural legs
(`easing-lab`'s animated dot stops moving once `dispose()` has run;
`timeline-lab`'s Play button starts the timeline and a mid-flight
`dispose()` does not throw) and the **browser module-graph resolution
gate**: it re-walks each page's module graph the way a browser would (entry
points = the page's own `<script type="module">` blocks; relative/
root-absolute specifiers resolve as URLs against the repo document root;
**bare specifiers resolve through that page's import map and nowhere
else**) and fails on an undeclared bare specifier or an import-map value
pointing at a missing file. That gate is itself falsified in the suite:
stripping the fw core-runtime key from an in-memory copy of the page
reddens the walk naming the exact specifier, proving the gate can actually
detect the defect it exists to catch.
