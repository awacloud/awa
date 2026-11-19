# `@awacloud/graphic-anim` — demos

Runnable, self-contained pages proving each `graphic.anim` capability works,
one page per capability. Governed by
the source repository's demo-playground convention (`docs/demo-playground.md`,
frozen) — this file states only what is family-specific; the rules
themselves live there.

## Run it

Two documented serve modes:

**Package-local (primary for a standalone install)**:

```bash
cd packages/front/graphic/anim && bun run serve
```

Portal on `http://localhost:3020/` (the package's `serve` script).

**Monorepo (secondary)**: from the root of the source repository, run its
`local_web` dev server on the `dev` entry of `cnf/local_web/dev.config.json`.

Port `3001` (the canonical `dev` entry — no narrowed entry needed for this
family; per the convention's own default, "use `dev`"). Family URL:
`http://localhost:3001/packages/front/graphic/anim/demos/index.html`.

`cnf/**` is gitignored; the `dev` entry's tracked seed is the source
repository's `tools/local_web/local_web.config.example.json`.
That seed routes `/tools/dev-portal/assets/`, which the shared shell's
stylesheet (below) needs.

## Loading mode

Every surface loads the shared demo-shell stylesheet root-absolute
(`/tools/dev-portal/assets/demo-shell/demo-shell.css`) and the canonical sanity
lockdown (`applyBase()` from `/packages/front/fw/src/sanity/base.js`),
applied unconditionally on every page load — this family's `?variant=`
switch (below) is resolved only AFTER the sanity script has already run, so
applying it every time is the only way to guarantee the realm is hardened
whichever variant a page ends up booting.

The `graphic.anim` aggregate itself is loaded through the **declared
alternate** of the convention's §2 (fw loading doctrine), not the
import-map-to-source canonical form: `demos/_boot.js` resolves it from the
package's own prebuilt roots, `dist/build/graphic-anim.{standalone,fw}.js`,
selected by a `?variant=standalone|fw` URL query param (default
`standalone`). The frozen convention names this family explicitly as the
one that qualifies: *"a surface whose purpose is to demonstrate a prebuilt
artefact loads `dist/build/<pkg>.{standalone,fw}.js` instead... The
graphic-anim demos qualify: their `?variant=` switch exists precisely to
prove both surfaces boot."* `_boot.js` is therefore **kept as-is**: no behaviour
change, no path change.

Three demos (`svg3d`, `pageflip`, `hypertree`) additionally consume pure,
DOM-free kernel modules that are NOT part of the `graphic.anim` aggregate
(`graphic.svg3d`/`graphic.pageflip`/`graphic.hypertree` sit outside its
frozen 14-module set). Those kernels are PUBLIC via `package.json` `exports`
(`./kernels/<module>/*.js`) and are consumed the canonical way — bare
specifiers (`@awacloud/graphic-anim/kernels/...`) resolved by each page's
own `<script type="importmap">`, which Bun's own package resolution mirrors
exactly (verified live: the same specifier resolves under `bun test` via
`package.json` `exports` with no import map needed there). `pageflip` and
`hypertree` additionally reach their own COMPOSED module descriptor
(`pageflipModule`/`hypertreeModule`) — also public: the package's root entry
(`exports["."]` → `src/main.js`) imports and re-exports both by name, so
`@awacloud/graphic-anim` (the bare package specifier itself, mapped in both
pages' import maps) resolves them too. No relative `src`-tree reach-around
is left anywhere in this family (the convention's row-2 mechanical check
over this directory returns empty).

Because that root entry (`src/main.js`) and its own graph write three **bare
`@awacloud/fw/*` specifiers** of their own, `pageflip/index.html` and
`hypertree/index.html` also declare those three fw modules in their import
maps — `@awacloud/fw/dom/query/dom.js`,
`@awacloud/fw/dom/rendering/secPolicy.js`, `@awacloud/fw/core/runtime.js`
(the package writes every fw specifier with `.js`, and an import map
matches specifiers exactly), each mapped root-absolute to
`/packages/front/fw/src/…`. This is the
convention's §2 canonical form (import map to fw's ESM source) applied to
the fw dependency these two pages genuinely have; it adds **zero** modules
to either page graph, since `_boot.js` already imports the identical three
URLs. The keys are deliberately **exact**, not the `"@awacloud/fw/"`
trailing-slash prefix of §2's sample: a prefix key would make every present
and future fw specifier trivially "declared" and blunt the browser-resolution
gate below over exactly the package whose undeclared specifiers had killed
both pages. Without those entries a browser throws *"Failed to resolve
module specifier"* before the demo runs — a failure `bun test` cannot see,
because Bun resolves bare specifiers through workspace `node_modules`. Both
pages were in that state at git HEAD before this task too (the old relative
`../../src/<module>/<module>.js` import reaches the same undeclared
`@awacloud/fw/dom/query/dom.js` through `src/svg/apply.js`); the gate below
is what stops it recurring.

**Map order.** The import map is the first script in `<head>`, strictly
before any module script: one major engine discards an import map that
arrives after a module load has started (the sanity-lockdown script used to
sit above it on three pages). Measured in real Chromium and Firefox (a dated
baseline record, kept in the source repository).

## Surfaces

| Slug | Summary | Static |
|---|---|---|
| `clock` | Analog clock — legacy `clock.js` reproduction (`scene` + `tween` + `scheduler`) | no |
| `engine` | Tween + timeline + stagger on real `<svg>` shapes | no |
| `frames` | Discrete frame-sequence primitive, play/pause/scrub | no |
| `hypertree` | Radial tree, click-to-focus, re-entrancy guard | no |
| `lumen-rail` | Lumen Rail — a one-minute rail shooter: pooled sprites (no DOM node per frame), the svg3d kernels for the perspective, keys or drag to steer, an autopilot | no |
| `neon-boot` | Neon Grid — an 11 s, five-act boot sequence on one timeline, then a pure function of time: scrub, slow motion, captions, the act's code, a `graphic.svg3d` hologram | no |
| `pageflip` | Six-page book, page-curl fold, rapid-turn guard | no |
| `scene` | JSON → SVG scene/event DSL, a traffic light | no |
| `svg3d` | Software-3D heightmap terrain in SVG, orbiting camera | no |
| `towards-anm` | Acceptance demo — legacy TOWARDS-ANM choreography, modern engine only | no |

Family-shared plumbing: `_boot.js` (both-surfaces resolver, underscore-prefixed,
excluded from discovery). Each demo's own `*-notes.md` is read-only
reference material, not a surface.

## Lint

Real rules, non-vacuous (verified live):

```bash
bunx eslint --print-config packages/front/graphic/anim/demos/clock/main.js
# → JSON, rules: 67 resolved
bunx eslint packages/front/graphic/anim/demos/clock/main.js
# → no output, no "ignored" warning
```

`packages/front/graphic/anim/eslint.config.js` is the resolving config (the
package's own browser/ESM baseline, `ecmaVersion: 'latest'` for the JSON
import-attribute syntax the `scene`/`hypertree` demos use).

## Tests

```bash
bun test packages/front/graphic/anim/tests/demos-smoke.integration.test.js
```

Scan-driven (`Bun.Glob('*/main.js')`, no hardcoded slug list) both-surfaces
smoke suite: 23 cases (1 self-check + 8 slugs × 2 variants + 5 extended
functional legs + 1 browser-resolution gate), asserting per non-static
surface that `main.js` has no side effect on import, exports a `run`
function, `run(ctx)` executes without throwing, and its returned handle's
`dispose()` runs clean.

The last case is the **browser module-graph resolution gate**. Everything
else in the suite runs under Bun, which resolves bare specifiers through
workspace `node_modules` and has no notion of an import map — so a page can
be green here and dead in a browser. The gate re-walks every page's module
graph the way a browser would (entry points = the page's own
`<script type="module">` blocks; relative/root-absolute specifiers resolve
as URLs against the repo document root; **bare specifiers resolve through
that page's import map and nowhere else**) and fails on an undeclared bare
specifier or an import-map value pointing at a missing file. It covers all
8 slugs plus the family index, glob-driven. Specifier extraction uses
`Bun.Transpiler#scanImports` (a real parser, so bare specifiers quoted
inside comments do not false-positive); it sees static imports and dynamic
`import()` with a literal specifier, and would not see a computed
`import(expr)`.
