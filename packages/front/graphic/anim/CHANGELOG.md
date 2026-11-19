# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-11-19

### Added

- **Timeline control** — a `Timeline` keeps its own clock: `time` and
  `duration` are readable; `seek(ms)` renders the whole timeline's state at
  a time (every opened child at its progress, a child not yet started at its
  `from`, in the order live play leaves) without firing any `onComplete`;
  `pause()`/`resume()` hold and continue (`resume()` on an idle timeline
  plays from `time`); `timeScale` sets the playback rate (a finite number
  ≥ 0, else it throws). `play()` still restarts at 0.
- **`Timeline#stagger` options** — besides the number form, `{ each, from,
  ease, at }`: the wave starts from `'start'`, `'end'`, `'center'`,
  `'edges'` or an item index; `ease` redistributes the offsets; `at` is a
  base offset.
- **CSS timing functions** — a tween's `easing` also accepts
  `cubic-bezier(x1, y1, x2, y2)`, `steps(n[, position])` and the keywords
  `ease`, `ease-in`, `ease-out`, `ease-in-out`, `step-start`, `step-end`
  (the easing table keeps priority); `graphic.tween` also returns
  `resolveEasing(spec)`.
- **Neon Grid showcase demo** (`demos/neon-boot/`) — an 11 s boot sequence
  on one timeline, then a pure function of time: scrub, slow motion, act
  captions, the code of each act, an outline view, full screen, reduced
  motion, and a `graphic.svg3d` terrain hologram.
- **Real-browser smoke** — `bun run test:e2e` loads every demo and
  playground page in Chromium and Firefox and fails on a page error or a
  readiness timeout.
- **`dist` type declarations** — `gen:bundles` writes a `.d.ts` beside every
  `dist/standalone` and `dist/build` JavaScript file, so a TypeScript
  consumer of `@awacloud/graphic-anim/standalone/*` and `/build/*` gets the
  descriptor's literal `name` and `dependencies` and a typed `factory`
  (`Pageflip`/`Hypertree` surfaces for those roots, `unknown` elsewhere)
  instead of an implicit `any`.
- **14-module `graphic.anim` engine aggregate** — tween, timeline,
  scheduler, scene, frames, interpolate, svg, math.
- **Three off-aggregate extension modules** — `graphic.pageflip`,
  `graphic.hypertree`, `graphic.svg3d` — plus their eight public pure
  kernels (`./kernels/*` subpaths).
- **Dual dist surfaces** — `dist/standalone` self-contained roots and
  `dist/build` assembled `.standalone`/`.fw` pairs, with each extension's
  `.fw` bundle declaring the core as a DI sibling.
- **Constructible helpers** — `createPageflip`, `createHypertree`.
- **Demos family** and package-local `dev-portal serve` mode.
- **Hand-authored root types** — `types/main.d.ts`.
- **`graphic.pageflip` `backFill` option** — the fill of the turning leaf's
  back (plain paper, default `#e9e6df`).
- **`graphic.pageflip` `spread` option** — the two-page spread of the old
  aJSFlip book: the leaf carries the next spread's left page and crosses the
  spine; a backward turn replays the forward turn in reverse.
- **`graphic.pageflip` spread shading and `shadow` option** — the old book's
  gutter shadows at the spine (widths following the reading progress),
  gradient-stroked stack edges and leaf edge; `shadow` sets the gutter width.
- **`graphic.pageflip` pointer corners** (spread, opt-in through the
  `events` option, the resolved fw `dom/query/events` module): four corner
  zones, hover peel, corner drag with complete-or-revert release, click to
  turn; bottom corners mirror y.
- **`graphic.hypertree` `labelDepth` option** — show only the labels within a
  graph distance of the focus; the default shows every label.
- **`graphic.hypertree` styling model** (opt-in `styled`): colour per branch
  (`color`, inherited; a palette on the root's children; `nodeStyle` hook),
  coloured links and dots, dot radius shrinking with the distance from the
  focus, label pills, and a `rootGlyph` slot that shrinks off-centre
  (`rootGlyphRadius`). Its content defaults are neutral (palette,
  `system-ui, sans-serif`); a consumer's colours and font are passed
  through `styled`.
- **`graphic.pageflip` image pages** — a page may give `src`: a placeholder
  until the image is decoded, a preload window (`cache`, default 8) loaded at
  most `preloadConcurrency` at a time (default 1), turn targets first, an
  injectable `loadImage`, and `imageState(id)`.
- **`graphic.svg3d` face colours, water and pointer look** — opt-in
  `faceColors` (per-face altitude and shade classes on the bucketed rig,
  water faces at height 0), opt-in `events` (the legacy drag-to-look), and
  `camera.near`.
- **`graphic.hypertree` detail badges** — in styled mode, nodes with `action`
  and/or `info` get a link and an info badge; a badge click calls
  `onNodeDetail(id, kind, value, event)` without focusing the node. The
  glyphs are neutral built-ins (an arrow, an "i"), replaced per kind through
  `badgeGlyphs` (`graphic.svgBuild` templates).
- **`graphic.hypertree` forest input** — an array of roots is wrapped in an
  internal origin (`Hypertree.FOREST_ORIGIN`): no dot, no label, the
  `rootGlyph` when there is one; `focus(t.rootId)` returns to the initial
  view.
- **`hypertree.layout` `focusMove` `zoom` argument** — the focus fan
  (default `3π/2`), exported as `DEFAULT_ZOOM`.

### Fixed

- **fw specifier** — the barrel and the `createHypertree` helper import
  `@awacloud/fw/core/runtime.js`, a declared export of `@awacloud/fw`,
  instead of the extensionless `@awacloud/fw/core/runtime`. An import map
  maps the `@awacloud/fw/` prefix (or that exact `.js` key); a map that
  carried only the extensionless key must add one of them.
- **Robustness** — `Tween` throws `Tween: unknown easing "<name>"` for an
  easing name not in the table instead of silently playing `linear` (an
  absent easing is still `linear`). `createScene` uses an explicit `prefix`
  verbatim, `''` included, as its documentation said. Every throw site of the
  shipped modules is documented with `@throws`.
- **fw first: easing, lerp and the clock** — `graphic.easing`, `graphic.lerp`
  and `graphic.scheduler` are now built on fw's `io/calc/easing`,
  `io/math/interp` and `io/timing/clock` (their `dependencies` are
  `['easing']`, `['interp']`, `['clock']`; `fw_require` lists the three).
  The package no longer carries its own copy of the 31 easing curves. The
  scheduler's default clock is fw's `clock.monotonic`, so a default
  `Scheduler` works under fw's sanity lockdown, where `performance.now`
  throws. A direct `factory()` call now passes the fw module
  (`lerpModule.factory(interp.factory())`); a runtime resolves it as before.
  The pure-leaf `dist/standalone` roots inline fw's pure `io` modules and
  still no DOM-bound one.
- **Types** — `createPageflip` / `createHypertree` take a required `opts`
  with the constructor's required fields (`pages`/`width`/`height`, `tree`),
  and their handles carry typed `Pageflip` / `Hypertree` instances instead of
  `any` (`types/main.d.ts` also exports `PageSpec`, `PageflipOptions`,
  `TreeNode`, `HypertreeOptions`). Each `./kernels/*` key names its `.d.ts`
  as an explicit `types` condition.
- **Lifecycle** — `Hypertree#dispose()` and `Svg3d#dispose()` detach the
  subtree their constructor appended (`el` / `node` stay readable). A scene's
  looping event can be stopped after its first cycle: new `Scene#stop(name?)`
  and `Scene#dispose()` (which also detaches `root`). `createPageflip` and
  `createHypertree` share one runtime, so they run on one scheduler instead
  of one each.
- **`graphic.interpolate` transform lists** — two lists that match function
  by function (same length, same function at each position) interpolate
  each function on its own and are written back as the list, as CSS
  Transforms does; a `matrix()` pair goes through the decomposition in
  place. Other lists keep the decomposition and `matrix(…)`. The matrix
  path moved a `scale(…) translate(…)` tween along another trajectory.
- **`graphic.pageflip` turn rendering** — during a turn the page underneath is
  drawn and the lifted page is clipped to its unlifted part, so no frame shows
  a hole the colour of the stage; the leaf follows the full two-leg corner path
  and lies past the spine at the end of the turn.
- **`pageflip.fold` FLAT case** — a corner on the diagonal (`dx = dy`) now
  gives the triangle under the crease; the leaf no longer reaches far above
  the page.
- **`svg3d.project` vertices on the camera plane** — a vertex nearer than
  `camera.near` drops its triangles; one exactly on the plane used to scale
  to `+Infinity` and reach the path data.
- **`hypertree.layout` focus geometry** — `focusMove` re-roots the tree at the
  focus (its children over 270° around it, the rest of the tree opposite)
  instead of injecting the ancestors as a spoke that overlapped the focus's own
  children.
- **`graphic.hypertree` links** — each link's control point lies on its outer
  end's angle at the mean distance of its ends, so links no longer loop back
  after a focus.
