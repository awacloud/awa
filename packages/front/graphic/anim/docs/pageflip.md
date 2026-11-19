---
module: pageflip/pageflip
category: pageflip
name: graphic.pageflip
type: fw.dom.graphic
dependencies: [graphic.svgBuild, graphic.scopedIds, graphic.timeline, graphic.tween, graphic.svgApply, pageflip.fold, pageflip.compose]
returns: "{ Pageflip, pageflip }"
worker-safe: partial
status: complete
---

# pageflip/pageflip — `graphic.pageflip`

> Page-turn book — the aJSFlip page-**curl** fold, driven on the shared scheduler.

**Module** `graphic.pageflip` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/pageflip/pageflip.js` | **Deps** `graphic.svgBuild`, `graphic.scopedIds`, `graphic.timeline`, `graphic.tween`, `graphic.svgApply` (+ injected pure kernels `pageflip.fold`, `pageflip.compose`) | **Worker-safe** partial (the `fold`/`compose` kernels are pure Worker-safe; the book module is main-thread/DOM)

`graphic.pageflip` builds a small SVG **book** and turns its pages with the
salvaged aJSFlip page-**curl** fold, productized from a measured de-risking
spike. It
is a page-turn book — distinct from `graphic.frames` (a frame-sequence
primitive) and `graphic.scene` (a general scene/event DSL).

## Worker-safe split

The module is delivered in two layers with a hard DOM boundary:

| File | Surface | Worker-safe |
|------|---------|-------------|
| `src/pageflip/fold.js` (`pageflip.fold`) | pure fold geometry — `fold(corner, { width, height, … })` | **yes** (no `window`/`document`; executes DOM-free) |
| `src/pageflip/compose.js` (`pageflip.compose`) | pure polygon serializer — `compose(vertices)` | **yes** |
| `src/pageflip/pageflip.js` (`graphic.pageflip`) | builds + mutates the SVG book subtree | **no** — main-thread, like the other visual modules |

`fold` and `compose` are injected into the book module via DI (so the `pageflip`
factory stays capture-free); they are **not** members of the public
`graphicModules` registry — they are pageflip-internal kernels. You can import
and run them standalone (e.g. in a Worker) for geometry precompute — reachable
from outside the monorepo via the package's `./kernels/*` exports subpath (see
Examples below and `docs/CONTRACT.md`'s "Kernel export surface" section).

## Descriptor

`graphic.pageflip` is one capture-free fw module descriptor. Its factory receives
seven resolved dependencies as parameters and returns `{ Pageflip, pageflip }`.
The `Pageflip` class **and** the per-instance prefix counter are defined
**inside** the factory so they reference only the injected dependencies — never a
module-scope binding (`fw/no-factory-capture` clean, verified by the
package-local ESLint config over `src/**/*.js`).

```js
export const pageflipModule = {
    name: 'graphic.pageflip',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline',
                   'graphic.tween', 'graphic.svgApply', 'pageflip.fold', 'pageflip.compose'],
    deps: [svgBuildModule, scopedIdsModule, timelineModule, tweenModule,
           svgApplyModule, foldModule, composeModule],
    factory(svgBuild, scopedIds, timelineMod, tweenMod, svgApply, foldApi, composeApi) {
        /* Pageflip, pageflip defined here */ return { Pageflip, pageflip };
    },
};
```

`deps.map(d => d.name) === dependencies` (same order).

## Resolve

### fw-module surface

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { pageflipModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerDeep(pageflipModule);   // pulls svgBuild/scopedIds/timeline/tween/
                                         // svgApply + the fold/compose kernels + fw dom
const { Pageflip, pageflip } = runtime.resolve('graphic.pageflip');
```

Or register the whole package: `new ModuleRuntime().registerAllDeep(graphicModules)`
then `resolve('graphic.pageflip')`.

### ESM / standalone surface

The pure kernels are directly importable, framework-free, through the
package's `./kernels/*` exports subpath — a real package specifier, not a
relative import into this package's own `src/`:

```js
import { foldModule } from '@awacloud/graphic-anim/kernels/pageflip/fold.js';
import { composeModule } from '@awacloud/graphic-anim/kernels/pageflip/compose.js';

const { fold } = foldModule.factory();
const { compose } = composeModule.factory();

const solved = fold({ x: 128, y: 48 }, { width: 320, height: 480 });
const d = compose(solved.turn);   // "M … L … L … Z"
```

`graphic.pageflip` is a registry + `dist/build` barrel member. It is **also** a `dist/standalone` bundle root
(`graphic-pageflip-bundled.js`) **and** ships a dedicated `dist/build` root
pair (`graphic-pageflip.{standalone,fw}.*`) — see
[Prebuilt roots](#prebuilt-roots) below.

## Prebuilt roots

To get the **composed** `Pageflip`/`pageflip` class with no import map and no
bundler, take one of the prebuilt roots `graphic.pageflip` ships: a bare framework-free root under
`dist/standalone/`, or the `dist/build` assembled pair. Each `dist/build`
name states what it needs at runtime — **`.fw.` = fw required,
`.standalone.` = nothing required** — the same convention the whole-package
aggregate and `graphic.svg3d` follow (the monorepo's front-package convention
§"fw add-on packages",
[aggregator](./aggregator.md#assembled-build--pick-your-file-by-its-name)):

```
dist/standalone/
  graphic-pageflip-bundled.js          bare framework-free root (no runtime, no import map)
dist/build/
  graphic-pageflip.standalone.js       composed pageflip root — fw INLINED
  graphic-pageflip.standalone.min.js
  graphic-pageflip.standalone.meta.json
  graphic-pageflip.fw.js               composed pageflip root — fw INJECTED
  graphic-pageflip.fw.min.js
  graphic-pageflip.fw.meta.json
```

| Variant | Needs at runtime | How you use it |
|---|---|---|
| `graphic-pageflip-bundled.js` (standalone dir) | **Nothing** — zero imports | `graphicPageflipBundled.factory()` → `{ Pageflip, pageflip }` |
| `graphic-pageflip.standalone.*` (build dir) | **Nothing** — zero imports | Same shape, produced by the assembled-pair mechanism instead of the bare-root one (see Notes) |
| `graphic-pageflip.fw.*` | `@awacloud/fw` (supplies `secPolicy` + `dom`) **and the `graphic-anim` registry** (supplies the `graphic.*` siblings this build declares — see the meta's `siblingDependencies.modules`) | Register `graphicPageflipPackage` on a `ModuleRuntime` that also carries `graphicModules`, or hand it one resolved value per entry of its own `dependencies` |

```js
// standalone — no runtime, no import map, no bundler
import { graphicPageflipBundled } from '@awacloud/graphic-anim/standalone/graphic-pageflip-bundled.js';

const { pageflip } = graphicPageflipBundled.factory();
const book = pageflip({ width: 320, height: 480, pages: [{ id: 'p1' }, { id: 'p2' }] });
book.mountInto(document.querySelector('#stage'));

// fw variant — registered on your own runtime ALONGSIDE the core registry.
// This build DECLARES its `graphic.*` siblings
// instead of shipping a private copy of them, so the runtime must hold them
// (that is what makes it ~4x smaller and keeps ONE shared scheduler).
import { graphicPageflipPackage } from '@awacloud/graphic-anim/build/graphic-pageflip.fw.js';
import { fw_require, graphicModules } from '@awacloud/graphic-anim';

runtime.registerAllDeep([...fw_require, ...graphicModules, graphicPageflipPackage]);
const { Pageflip } = runtime.resolve('graphicPageflipPackage');
```

Notes on the roots:

- **Two different mechanisms, same generator.** `graphic-pageflip-bundled.js`
  (under `dist/standalone/`) comes from one extra entry passed to the
  existing bare-root `generatePrebuilds` call (the same one that produces the
  14 frozen engine roots); `graphic-pageflip.{standalone,fw}.*` (under
  `dist/build/`) comes from the separate assembled-pair call, the same shape
  `graphic-svg3d.*` and the whole-package `graphic-anim.*` aggregate use.
  Both are driven by `tools/generate-bundles.mjs`, not by an entry in
  `src/main.js`'s own `bundle` export (which stays the frozen 14).
- **Additive.** Neither root touches the frozen 14-module `graphic.anim`
  aggregate (`AGGREGATE_NAMES`), `graphicModules` (still 18), or
  `src/main.js`'s `bundle` export.
- Both inline (or declare) the same closure as the fw-module surface above:
  the five engine deps plus the injected `pageflip.fold`/`pageflip.compose`
  kernels — confirmed by each `meta.json`'s `modules`/`workerSafeSlice` fields.

Proven by `tests/extension-prebuilt-roots.integration.test.js`: a prebuilt
book is mounted and driven through a real curl turn on a manual-clock
scheduler from the built file alone.

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `Pageflip` | `class Pageflip(opts: PageflipOptions)` | The page-turn book. Builds the SVG subtree; drives the curl. |
| `Pageflip#next` | `() => Timeline \| null` | Turn to the next page. `null` (no-op) at the last page. |
| `Pageflip#previous` | `() => Timeline \| null` | Turn to the previous page. `null` (no-op) at the first page. |
| `Pageflip#goTo` | `(id: string) => Timeline \| null` | Turn to the page with id `id`. `null` when already current. |
| `Pageflip#mountInto` | `(el: Element) => this` | Mount `this.el` into `el`, replacing its children. |
| `Pageflip#dispose` | `() => void` | Tear the book down: cancel a turn still in flight, detach `el` from its parent, drop the reference. Idempotent. |
| `Pageflip#imageState` | `(id: string) => string` | An image page's load state: `none` (not an image page), `idle`, `loading`, `ready` or `error`. |
| `pageflip` | `(opts: PageflipOptions) => Pageflip` | Convenience: `new Pageflip(opts)`. |

### State

| Field | Type | Description |
|-------|------|-------------|
| `.el` | `SVGElement \| null` | The built book root (`<svg>`), ids scoped. `null` after `dispose()`. |
| `.index` | `number` | Currently visible page index. |
| `.pageCount` | `number` | Total pages. |
| `.prefix` | `string` | The DISTINCT per-instance id-scope prefix. |
| `.currentId` | `string` (getter) | The id of the currently visible page. |

### `PageflipOptions`

| Field | Type | Description |
|-------|------|-------------|
| `pages` | `{ id, template?, src? }[]` | Pages in reading order (≥ 1). `template` is a `graphic.svgBuild` node; `src` (when there is no `template`) makes an image page (see "Image pages" below); neither → a page-sized `<rect>` placeholder. |
| `width` / `height` | `number` | Page size in SVG user units (must be positive). |
| `prefix` | `string` | Id-scope prefix; default = a distinct per-instance `pageflip-<n>`. |
| `duration` | `number` | Turn duration in ms; default `300`. |
| `easing` | `((t)=>number) \| string` | Curve fn or name; default `'linear'`. |
| `marginPercent` / `ratio` | `number` | Forwarded to `fold` (margin scale / pattern render ratio). |
| `backFill` | `string` | Fill of the leaf back (plain paper); default `'#e9e6df'`. In a spread, the backing under the verso. |
| `spread` | `boolean` | Two-page spread, the old aJSFlip book; default `false`. See "Two-page spread" below. |
| `shadow` | `number` | Spread gutter shadow width, as a fraction of `width` (the old `compute.shadow`); default `0.05`, `0` hides the gutters. |
| `events` | `object` | The resolved fw `dom/query/events` module. With a spread it enables the pointer corners (see "Pointer corners" below); without it the book is programmatic. |
| `pointer` | `boolean` | `false` keeps a spread programmatic even with `events`; default `true`. |
| `cache` | `number` | Image pages: the preload window, in pages (the old `cache`); default `8`. |
| `preloadConcurrency` | `number` | Image pages: loads in flight at most; default `1` (the old book loaded one at a time). |
| `loadImage` | `(src) => Promise<void>` | Image pages: the loader, resolving once the image is decoded. Default: `Image` + `decode()` (else `load`), or an immediate resolution where there is no `Image`. |
| `scheduler` | `Scheduler` | Override the shared scheduler (tests / isolation). |

**Errors**: empty/missing `pages` → `Error('Pageflip: pages must be a non-empty
array')`; non-positive `width`/`height` → throws; `goTo` unknown id →
`Error('pageflip: unknown page "<id>"')`.

## Fold kernel

`fold(corner, { width, height, marginPercent?, ratio? })` returns
`{ turn, under, pattern, angle, edgeCase, degenerate, corner }`, reproducing the
aJSFlip curl (behavioral parity with the frozen spike reference):

- **corner-clamp** onto the spine circle — clamp radius `margin = sqrt(w² + h²) − h`.
- **reflect-about-fold quad** — page corners rotated about the dragged corner by
  `rotate = −2·angle`.
- **5-case edge-clip** by the fold `angle` band — `OBTUSE` (`> 0`), `FLAT` (`= 0`),
  `SHALLOW` (`−45 < angle < 0`), `DIAGONAL` (`= −45`), `STEEP` (`< −45`) — each
  emits a 4-vertex `turn` polygon + a 5-vertex `under` polygon.
- **pattern counter-transform** — `translate(x, y) rotate(turnDeg)` with
  `turnDeg = −2·(angle + 45)` so the page image does not shear.

At rest (dragged corner at the outer top-right) the fold is `degenerate`: the
turn polygon collapses to the origin, the pattern is at rest — no NaN /
negative-radius artifact.

A corner on the diagonal (`dx = dy`, the hover peel's path) gives an angle of
exactly 0, the `FLAT` case. The crease then meets the top edge at
`(w − d, 0)`, and the leaf is the triangle corner, `(w − d, 0)`, `(w, d)`.
The legacy branch took the reflected point itself as the leaf's top vertex, far
above the page; that defect is not reproduced.

## Image pages (`src`)

A page that gives `src` (and no `template`) is an **image page**: a white
placeholder rect under an `<image>` (`preserveAspectRatio="xMidYMid slice"`)
that gets its `href` only once the image is decoded, so no frame shows a hole
or a half-painted image. This is the old aJSFlip `cache`:

- **Window** — the image pages in `[max(0, index − cache/2), … + cache)` are
  queued, nearest to the current page first; when a turn settles, the window
  moves. Pages that left the window are not loaded any more.
- **Bound** — at most `preloadConcurrency` loads are in flight.
- **Priority** — `next`, `previous`, `goTo` (and a corner turn) put their
  target pages at the front of the queue.
- **Failure** — a rejected load keeps the placeholder (state `error`), with no
  retry and no broken-image icon.
- **Cache** — the default loader decodes through `Image`. Serve the images
  cacheable: the `<image>` then reuses the decoded bytes (measured: one request
  per image).

## Pointer corners (spread)

With `spread: true` and `events` (the resolved fw `dom/query/events` module,
passed as an option so the barrel gains no import), the book takes the old
aJSFlip corners:

- **Zones** — four zones, 40 % of a page wide and high, at the spread's outer
  corners. Pointer positions map to book coordinates through the inverse
  `getScreenCTM()`. Right zones are active when a next spread exists, left
  zones when a previous one does.
- **Hover** — moving into an active zone (no button pressed) peels its corner
  inward by `0.2 · min(width, height)` in 250 ms, linear. Leaving the zone or
  the book peels it back.
- **Drag** — a press in an active zone drags the corner with the pointer (and
  prevents the press's default, so no text is selected). The release completes
  the turn past a quarter page beyond the spine (right corners: `x < 1.25 ·
  width`; left corners: `x > 0.75 · width`, in book coordinates) and goes back
  otherwise, linear over `duration`. A `pointercancel` always goes back.
- **Click** — a press and release within 5 px runs the two-leg turn from that
  corner's current position.
- **Corners** — a left corner is the canonical fold with its corner on the left
  page (the turn from the previous spread). A bottom corner mirrors y in and
  out; its verso is pinned by its bottom-left corner,
  `translate(x, h − y) rotate(−turnDeg) translate(0, −h)`.
- **Guards** — `next`, `previous` and `goTo` cancel a hover peel and are
  refused during a drag. Pointer input is ignored while a turn or a release is
  animating. `dispose` clears the listeners' `events` scope.
- **Touch** — for touch drags, give the book `touch-action: none` in CSS;
  otherwise the browser pans the page.

## Examples

```js
const book = pageflip({
    width: 320, height: 480,
    pages: [{ id: 'cover' }, { id: 'intro' }, { id: 'end' }],
});
document.querySelector('#stage').appendChild(book.el);

book.next();          // curl to 'intro'
book.goTo('end');     // curl to 'end'
book.previous();      // curl back

// Sugar for the `stage.replaceChildren(book.el)` every heavy island repeats:
book.mountInto(document.querySelector('#stage'));

// Teardown (e.g. island/component unmount): cancels an in-flight turn, detaches
// `el`, drops the reference. Idempotent.
book.dispose();
```

## Notes

- **Distinct per-instance prefix** — each book mints a distinct id-scope prefix
  (`pageflip-0`, `pageflip-1`, …) unless one is passed, so two books in the same
  document never mint colliding ids (the per-instance id prefix rule).
- **Rendering model** — the old aJSFlip turn. During a turn both pages are
  displayed: the page being lifted shows where the fold's `under` polygon lies,
  the page the turn reveals shows in the lifted region, and the leaf back (the
  fold's `turn` polygon, filled with `backFill`) lies on top. The dragged corner
  follows the old two legs, `(w, 0) → (0, 0.1·h) → (−w, 0)`, so the leaf ends
  lying past the spine, outside the page. A backward turn runs the same fold
  reversed. Page groups stay in reading order, so the revealed page (the later
  one, in either direction) is painted above the lifted one and is the page
  clipped: one scoped `<clipPath>` whose `<path>` holds the page rect plus the
  `under` polygon under `clip-rule="evenodd"`. No DOM node moves during a turn.
- **Two-page spread** (`spread: true`) — the book is `2·width × height`, the
  spine at `x = width`. Spread 0 shows the first page on the right; spread `s`
  shows pages `2s − 1 | 2s` (0-based), an absent page leaving its slot empty.
  `index` is the lowest page index visible in the current spread (`currentId`
  its id), and `next`/`previous`/`goTo` move by spread. Page contents are built
  once in `<defs>`, in reading order; four `<use>` slots show them (left,
  right, the page beneath, the leaf back) and their `href` changes only at the
  start and end of a turn. A forward turn clips the right page to the fold's
  `under` polygon over the next spread's right page; the leaf carries the next
  spread's left page (the verso) under the fold's `pattern` transform
  (`translate(x, y) rotate(turnDeg)`), clipped to the `turn` polygon, over a
  `backFill` backing — at the end of the turn it lies exactly on the left page.
  A backward turn is the forward turn of the previous spread played in
  reverse. Four writes per frame: the two clip `d`s, the verso `transform`
  and the leaf edge `d`. The book has `overflow="visible"`: a tilted leaf
  overhangs the book edge, as in the old book.
- **Spread shading** (the old aJSFlip one) — two `#767676` gradients
  (`stop-opacity` 1 → 0), one opaque at its left end, one at its right end.
  - **Gutter shadows**: two rects at the spine (`fill-opacity` 0.5), whose
    widths follow the reading progress `p = 2s / n`. The left one is
    `p · shadow · width` wide and the right one `(1 − p) · shadow · width`,
    written at rest.
  - **Stack edges**: the outer page edges are stroked with the outer-opaque
    gradient, at the old `0.2 %` of its viewport. The right edge shows while
    pages follow the right page, and the left edge whenever a left page
    exists.
  - **Leaf edge**: during a turn the leaf outline is stroked at half that
    width.
  - The single-page book stays unshaded.
- **Two `<path>`s per frame, bound by reference** — the leaf `d` and the clip `d`
  are the only per-tick writes, both targets captured **once** at construction;
  the tick path performs **no** `getElementById`/`querySelector`. Every attribute
  write routes through the frozen `graphic.svgApply.svgAttr` — no raw
  `setAttribute`.
- **Shared scheduler, no 2nd rAF** — the turn is a fold-param `graphic.tween`
  `0 → 1` inside a `graphic.timeline` that registers ITSELF on the single shared
  `graphic.scheduler` (or an injected one for tests). N books + tweens share ONE
  rAF loop; the module never calls `requestAnimationFrame` and never constructs a
  production `Scheduler`.
- **Rest on completion** — when the turn timeline completes (`onComplete`), the
  book rests on the destination page: it alone is displayed, the leaf `d` is
  emptied and the clip is released (`clip-path="none"`). A turn cancelled through
  its `Timeline#stop()` rests back on the page it started from.
- **Measured performance** — the spike measured one turn step (fold recompute +
  `d` compose + `svgAttr` write) at **~0.003 ms/frame** across 320×480 / 640×960 /
  1024×1536 — **~5000× under** the 16.67 ms (60 fps) budget (measured on the
  de-risking spike). The compute leg is representative (HIGH confidence); the happy-dom
  write leg is a floor (a DOM-backed real-browser perf run is a standing
  follow-up).
- **Secure-writer routing** — writes go through `svgApply.svgAttr` → fw `dom.attr`
  → raw `setAttribute`; `dom.attr` does **not** invoke secPolicy sanitization. Do
  not assume attribute values are XSS-filtered beyond what `setAttribute` enforces.
- **Teardown (`dispose()`)** — an interrupted turn is the only leak path: a
  completed `Timeline` already self-deregisters from the scheduler (see
  `anim/timeline`'s completion note), so `dispose()` only needs to cancel a turn
  still in flight — it does so via the newly-added `Timeline#stop()`, which
  unregisters the turn's `Timeline` from its own captured scheduler (no direct
  scheduler handle needed on `Pageflip` itself). It then detaches `this.el` from
  its parent (if attached) and drops the reference (`this.el` becomes `null`).
  Idempotent; after `dispose()`, `next()`/`previous()`/`goTo()` all return `null`
  (no-op — this mirrors the proven `apps/towards` flipbook island semantics,
  `apps/towards/src/islands/flipbook.js`, where every consumer previously had to
  re-implement this cancel-and-detach dance by hand).
- **`Timeline#stop()` also fires `onSettle`** (the terminal-transition hook
  added alongside `graphic.timeline`'s completion-vs-stop distinction), which is
  what `_turnTo`'s `_active` release hangs on — see the turn-concurrency note
  below for why this matters beyond `dispose()` itself.
- **Turn concurrency (`next()`/`previous()`/`goTo()`) — ignore-while-in-flight** —
  an overlapping turn request used to overwrite a single tracked `Timeline`
  reference, leaking the earlier one on the scheduler (`dispose()`/`stop()`
  only ever saw the LAST one started). Every in-flight turn `Timeline` is now
  tracked in a `Set` (`_active`, the same shape as hypertree's `_active` guard
  for its focus timelines) instead of a single field, so the invariant holds
  structurally rather than by convention. The chosen policy is
  **ignore-while-in-flight**: while `_active` is non-empty, `next()`/
  `previous()`/`goTo()` are a no-op returning `null` — including `goTo()` with
  an unknown page id, which is silently ignored rather than thrown (the same
  short-circuit shape as the existing post-`dispose()` no-op). The request is
  NOT queued or superseded; once the in-flight turn completes (or `dispose()`
  cancels it), a subsequent call starts a fresh turn normally. This was chosen
  as the plan's default for an ambiguous/unavailable legacy reference: the
  legacy page-turn code was not available to inspect at the time, so the closest confirmed legacy evidence is
  hypertree's own `ignoreWhileFocusing` guard, itself documented as a port of
  "the legacy `state.move` flag" — i.e. the legacy engine's re-entrancy
  primitive already ports to this exact ignore-while-in-flight shape.
  `dispose()` iterates `_active` and calls `Timeline#stop()` on every member
  (not just one), which is what makes the leak structurally impossible: even
  if this policy is ever relaxed toward a superseding or queued turn (letting
  `_active` grow past one member), `dispose()` still cleans the full set.
  **The `_active.delete(tl)` release itself hangs on the turn `Timeline`'s
  `onSettle` hook, not `onComplete`** — `onComplete` is skipped by contract on
  `Timeline#stop()`, so a release hung there only would never fire for a
  caller who takes the `Timeline` returned by `next()`/`previous()`/`goTo()`
  and calls `.stop()` on it directly, bypassing `Pageflip#dispose()` entirely:
  `_active` would stay permanently non-empty and every future turn call would
  be silently ignored forever (found and closed in review).
  `onSettle` fires on BOTH natural completion and `stop()`, so the guard is
  released whichever path ends the turn; `onComplete` keeps only the
  completion-specific effects (page swap, turning-path reset to rest) —
  mirroring hypertree's own `onSettle`/`onComplete` split for its focus guard.
- **`mountInto(el)`** — `el.replaceChildren(this.el); return this;`, nothing more.
  Sugar for the `stage.replaceChildren(book.el)` call every heavy island
  (`apps/towards`'s flipbook island) otherwise repeats itself.

## Deferred follow-ups (OUT of this build)

- **Pointer on the single-page book** — the corners belong to the spread.
- **No Canvas** offscreen aid — SVG-only turn (spike Q5).

## See also

- [svg/build](./api/svg/build.md) — the JSON→SVG builder the book is built with
- [svg/scoped-ids](./api/svg/scoped-ids.md) — the per-instance id scope
- [anim/timeline](./api/anim/timeline.md) · [anim/tween](./api/anim/tween.md) — the frozen turn driver
- [anim/scheduler](./api/anim/scheduler.md) — the shared rAF loop
- [frames/frames](./api/frames/frames.md) — the frame-sequence primitive (distinct module)
