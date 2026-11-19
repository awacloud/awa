---
module: hypertree/hypertree
category: hypertree
name: graphic.hypertree
type: fw.dom.graphic
dependencies: [graphic.svgBuild, graphic.scopedIds, graphic.timeline, graphic.tween, graphic.svgApply, graphic.scheduler, hypertree.layout, hypertree.measure]
returns: "{ Hypertree, hypertree }"
worker-safe: partial
status: complete
---

# hypertree/hypertree — `graphic.hypertree`

> Radial / hyperbolic tree with animated focus navigation, on the shared scheduler.

**Module** `graphic.hypertree` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/hypertree/hypertree.js` | **Deps** `graphic.svgBuild`, `graphic.scopedIds`, `graphic.timeline`, `graphic.tween`, `graphic.svgApply`, `graphic.scheduler` (+ injected pure kernels `hypertree.layout`, `hypertree.measure`) | **Worker-safe** partial (the `layout`/`measure` kernels are pure Worker-safe; the tree module is main-thread/DOM)

`graphic.hypertree` builds a radial **tree** and navigates it by animated focus:
clicking (or calling `focus(id)` on) a node re-roots the tree there: the node
moves to the centre, its children fan around it, and the rest of the tree,
reached through its parent, is compressed on the opposite side. It salvages the
`@anim-old/towardsHyperTree` layout maths (behavioral parity, **not** a port). It is a **tree** view — distinct from `graphic.scene` (a
general scene/event DSL), `graphic.frames` (a frame-sequence primitive) and
`graphic.pageflip` (a page-turn book).

## Salvage provenance

The layout kernel reproduces the algorithm of the legacy
`packages/front/@anim-old/towardsHyperTree/public/ready.js` — its `treeExplore`
even-sector subdivision (`beta = base + i·w/n + w/2n`), the cumulative `R/2^n`
ring-radius series (`radius += R / 2^(i+1)`), the `coords` polar→cartesian
placement, the `bezierRadius`-averaged link controls, and the `computeMove` focus
move of `ready3.2.js` (a re-rooting at the focus, with the `alphaZoom` fan of
270°). It reproduces the **behaviour**, not the code: the legacy is
`window`-scoped, callback-nested and DOM-coupled; none of that survives. The
legacy `calculateSize` DOM pixel-measurement role is replaced by a deterministic
character-budget word-wrap (`hypertree.measure`); pixel-accurate measurement is a
documented follow-up.

## Worker-safe split

| File | Surface | Worker-safe |
|------|---------|-------------|
| `src/hypertree/layout.js` (`hypertree.layout`) | pure radial layout + `focusMove` solver — `layout(tree, { radius })`, `focusMove(result, id)` | **yes** (no `window`/`document`; asserted DOM-free) |
| `src/hypertree/measure.js` (`hypertree.measure`) | pure label word-wrap — `wrapLabel(text, maxLabel)` | **yes** |
| `src/hypertree/hypertree.js` (`graphic.hypertree`) | builds + mutates the SVG tree subtree, drives focus | **no** — main-thread, like the other visual modules |

`layout` and `measure` are injected into the tree module via DI (so the
`hypertree` factory stays capture-free); they are **not** members of the public
`graphicModules` registry — they are hypertree-internal kernels. You can import
and run them standalone (e.g. in a Worker) for geometry precompute — reachable
from outside the monorepo via the package's `./kernels/*` exports subpath (see
Examples below and `docs/CONTRACT.md`'s "Kernel export surface" section).

## Descriptor

`graphic.hypertree` is one capture-free fw module descriptor. Its factory receives
eight resolved dependencies as parameters and returns `{ Hypertree, hypertree }`.
The `Hypertree` class **and** the per-instance prefix counter are defined
**inside** the factory so they reference only the injected dependencies — never a
module-scope binding (`fw/no-factory-capture` clean, verified by the
package-local ESLint config over `src/**/*.js`).

`deps.map(d => d.name) === dependencies` (same order):
`['graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline', 'graphic.tween',
'graphic.svgApply', 'graphic.scheduler', 'hypertree.layout', 'hypertree.measure']`.

## Resolve

### fw-module surface

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { hypertreeModule } from '@awacloud/graphic-anim';   // root barrel — the exports
                                                        // map has no deep subpaths

const runtime = new ModuleRuntime();
runtime.registerDeep(hypertreeModule);   // pulls svgBuild/scopedIds/timeline/tween/
                                          // svgApply/scheduler + the layout/measure
                                          // kernels + fw dom
const { Hypertree, hypertree } = runtime.resolve('graphic.hypertree');
```

Or register the whole package: `new ModuleRuntime().registerAllDeep(graphicModules)`
then `resolve('graphic.hypertree')`.

### ESM / standalone surface

The pure kernels are directly importable, framework-free. They are
hypertree-internal, so unlike `hypertreeModule` they are **not** re-exported by
the root barrel — instead, the package's `./kernels/*` exports subpath resolves
each one directly, through a real package specifier (never a relative import
into this package's own `src/`):

```js
import { hypertreeLayoutModule } from '@awacloud/graphic-anim/kernels/hypertree/layout.js';
import { hypertreeMeasureModule } from '@awacloud/graphic-anim/kernels/hypertree/measure.js';

const { layout, focusMove } = hypertreeLayoutModule.factory();
const { wrapLabel } = hypertreeMeasureModule.factory();

const tree = { id: 'root', children: [{ id: 'a' }, { id: 'b' }] };
const base = layout(tree, { radius: 500 });   // { nodes, links }
const zoomed = focusMove(base, 'a');          // recentred on 'a'
```

`graphic.hypertree` is a registry + `dist/build` barrel member. It is **also** a `dist/standalone` bundle root
(`graphic-hypertree-bundled.js`) **and** ships a dedicated `dist/build` root
pair (`graphic-hypertree.{standalone,fw}.*`) — see
[Prebuilt roots](#prebuilt-roots) below.

## Prebuilt roots

To get the **composed** `Hypertree`/`hypertree` class with no import map and
no bundler, take one of the prebuilt roots `graphic.hypertree` ships: a bare framework-free root under
`dist/standalone/`, or the `dist/build` assembled pair. Each `dist/build`
name states what it needs at runtime — **`.fw.` = fw required,
`.standalone.` = nothing required** — the same convention the whole-package
aggregate, `graphic.svg3d` and `graphic.pageflip` follow
(the monorepo's "fw add-on packages" packaging convention,
[aggregator](./aggregator.md#assembled-build--pick-your-file-by-its-name)):

```
dist/standalone/
  graphic-hypertree-bundled.js          bare framework-free root (no runtime, no import map)
dist/build/
  graphic-hypertree.standalone.js       composed hypertree root — fw INLINED
  graphic-hypertree.standalone.min.js
  graphic-hypertree.standalone.meta.json
  graphic-hypertree.fw.js               composed hypertree root — fw INJECTED
  graphic-hypertree.fw.min.js
  graphic-hypertree.fw.meta.json
```

| Variant | Needs at runtime | How you use it |
|---|---|---|
| `graphic-hypertree-bundled.js` (standalone dir) | **Nothing** — zero imports | `graphicHypertreeBundled.factory()` → `{ Hypertree, hypertree }` |
| `graphic-hypertree.standalone.*` (build dir) | **Nothing** — zero imports | Same shape, produced by the assembled-pair mechanism instead of the bare-root one (see Notes) |
| `graphic-hypertree.fw.*` | `@awacloud/fw` (supplies `secPolicy` + `dom`) **and the `graphic-anim` registry** (supplies the `graphic.*` siblings this build declares — see the meta's `siblingDependencies.modules`) | Register `graphicHypertreePackage` on a `ModuleRuntime` that also carries `graphicModules`, or hand it one resolved value per entry of its own `dependencies` |

```js
// standalone — no runtime, no import map, no bundler
import { graphicHypertreeBundled } from '@awacloud/graphic-anim/standalone/graphic-hypertree-bundled.js';

const { hypertree } = graphicHypertreeBundled.factory();
const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
document.querySelector('#carto').replaceChildren(svgRoot);
const t = hypertree(svgRoot, { id: 'root', children: [{ id: 'a' }, { id: 'b' }] });

// fw variant — registered on your own runtime ALONGSIDE the core registry.
// This build DECLARES its `graphic.*` siblings
// instead of shipping a private copy of them, so the runtime must hold them.
import { graphicHypertreePackage } from '@awacloud/graphic-anim/build/graphic-hypertree.fw.js';
import { fw_require, graphicModules } from '@awacloud/graphic-anim';

runtime.registerAllDeep([...fw_require, ...graphicModules, graphicHypertreePackage]);
const { Hypertree } = runtime.resolve('graphicHypertreePackage');
```

Notes on the roots:

- **Two different mechanisms, same generator.** `graphic-hypertree-bundled.js`
  (under `dist/standalone/`) comes from one extra entry passed to the
  existing bare-root `generatePrebuilds` call (the same one that produces the
  14 frozen engine roots); `graphic-hypertree.{standalone,fw}.*` (under
  `dist/build/`) comes from the separate assembled-pair call, the same shape
  `graphic-svg3d.*`/`graphic-pageflip.*` and the whole-package `graphic-anim.*`
  aggregate use. Both are driven by `tools/generate-bundles.mjs`, not by an
  entry in `src/main.js`'s own `bundle` export (which stays the frozen 14).
- **Additive.** Neither root touches the frozen 14-module `graphic.anim`
  aggregate (`AGGREGATE_NAMES`), `graphicModules` (still 18), or
  `src/main.js`'s `bundle` export.
- Both inline (or declare) the same closure as the fw-module surface above:
  the six engine deps plus the injected `hypertree.layout`/`hypertree.measure`
  kernels — confirmed by each `meta.json`'s `modules`/`workerSafeSlice` fields.

Proven by `tests/extension-prebuilt-roots.integration.test.js`: a prebuilt
tree is built and `focusSync`-ed from the built file alone.

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `Hypertree` | `class Hypertree(svgRoot, tree, opts?: HypertreeOptions)` | The radial tree. Builds the SVG subtree into `svgRoot`; drives focus. |
| `Hypertree#focus` | `(id: string) => Timeline` | Animated recenter/zoom to node `id` on the shared scheduler. |
| `Hypertree#focusSync` | `(id: string) => this` | Immediate recenter (no animation; test seam). **Supersedes** any in-flight `focus()` — see [focusSync precedence](#focussync-precedence). |
| `Hypertree#node` | `(id: string) => PositionedNode` | Read-only positioned node data (current x/y + base metadata). |
| `Hypertree#dispose` | `() => void` | Remove listeners + stop in-flight focus timelines, leaving the scheduler clean. |
| `hypertree` | `(svgRoot, tree, opts?) => Hypertree` | Convenience: `new Hypertree(...)`. |

### State

| Field | Type | Description |
|-------|------|-------------|
| `.el` | `SVGElement` | The built tree root (`<g>`), ids scoped, appended to `svgRoot`. |
| `.rootId` | `string` | The root node id. |
| `.prefix` | `string` | The DISTINCT per-instance id-scope prefix. |
| `.focusId` | `string` (getter) | The currently focused node id. |

### `HypertreeOptions`

| Field | Type | Description |
|-------|------|-------------|
| `radius` | `number` | Outer layout radius `R` in SVG user units (default `500`). |
| `prefix` | `string` | Id-scope prefix; default = a distinct per-instance `hypertree-<n>`. |
| `duration` | `number` | Focus-transition duration in ms; default `400`. |
| `easing` | `((t)=>number) \| string` | Curve fn or name; default `'easeInOutCubic'`. |
| `onFocus` | `(id: string, info: FocusInfo) => void` | Fired when a focus completes (or immediately for `focusSync`). `info = { previous, refocus }` — see below. |
| `onNodeClick` | `(id: string, event: Event) => boolean \| void` | Fired on **every** node click with the node's **author** id and the DOM event, **before** the internal focus runs. Return `false` to cancel that focus. |
| `ignoreWhileFocusing` | `boolean` | Opt-in re-entrancy guard; default `false`. When `true`, a click landing while a focus timeline is in flight is ignored entirely. |
| `maxLabel` | `number` | Character budget per label line (word-wrap); default `16`. |
| `labelDepth` | `number` | Show only the labels within this graph distance of the focused node; default: every label. A focus hides the labels leaving the window when it starts and shows the entering ones when it completes; `focusSync` applies it at once. The demo uses `1`. |
| `styled` | `boolean \| object` | The legacy styling model (see "Styling model" below); default off. An object overrides `bullet` (7.5), `bulletFactor` (1.5), `fontSize` (14), `fontFamily` and `palette`. The demo uses it. |
| `nodeStyle` | `(node, { depth, color }) => { color? } \| void` | Styled mode: called once per node at build, in tree order; a returned `color` overrides the node's colour, and its children inherit it. |
| `rootGlyph` | `NodeDesc` | Styled mode: a `graphic.svgBuild` template drawn in place of the root's dot (the logo slot); it brings its own disc, and the root has no label. Natural size at the centre; off-centre it shrinks to twice its ring's dot radius. |
| `onNodeDetail` | `(id, kind, value, event) => void` | Styled mode: a click on a node's detail badge (`kind` `'action'` or `'info'`, `value` the node's field). Such a click neither focuses the node nor reaches `onNodeClick`; the library never navigates. |
| `badgeGlyphs` | `{ action?, info? }` | Styled mode: the detail-badge glyphs, each a `graphic.svgBuild` template in a 20 × 20 frame (origin top-left), drawn white (`fill` inherited) on the branch-coloured disc. A kind left out keeps the built-in neutral glyph. |
| `rootGlyphRadius` | `number` | Styled mode: the root glyph's natural radius, the basis of its off-centre scale; default `100` (the legacy `logoRadius`). |
| `scheduler` | `Scheduler` | Override the shared scheduler (tests / isolation). |

All three feedback hooks are **additive and back-compatible**: with none of them
set, the tree behaves exactly as before (including the click *stacking* below).

#### `onNodeClick(id, event)`

Gives consumers per-node navigation **without parsing scoped DOM ids** — the
first argument is the id you authored in the tree, not the `<prefix>-node-<id>-<n>`
id that ends up on the element. It runs before any internal focus logic, so the
callback observes the pre-click state.

- Return `false` → the internal focus is **cancelled** (the layout does not move).
- Return anything else (including `undefined`) → the focus proceeds as usual.
- A disposed tree never invokes it (the click listeners are removed).

```js
const t = hypertree(stage, tree, {
    onNodeClick: (id, event) => {
        if (event.metaKey) { window.open(pageFor(id)); return false; }  // navigate, don't focus
        track('carto:node', id);                                        // observe, then focus
    },
});
```

#### `ignoreWhileFocusing`

Default `false` **pins today's behaviour**: a click landing mid-transition starts
a *second* focus timeline that stacks on the first. Set it to `true` for the
legacy `state.move` semantics — while a focus timeline is in flight, node clicks
are dropped whole (neither `onNodeClick` nor the internal focus runs). A
programmatic `focus()` arms the guard too.

```js
const t = hypertree(stage, tree, { ignoreWhileFocusing: true, duration: 600 });
```

##### Guard lifecycle — released on EVERY termination

The guard (and the in-flight timeline set behind it) is released through the
timeline's **`onSettle`** hook — `graphic.timeline`'s terminal-transition
channel, which fires on natural completion *and* on `Timeline#stop()`. Release
is therefore structurally tied to termination rather than to completion, and all
four ways a focus can end converge on the same path:

| How the focus ends | Guard released | Focus state applied |
|---|:---:|---|
| natural completion | yes | yes — `onComplete` writes the target, sets `focusId`, fires `onFocus` |
| `dispose()` | yes | no |
| superseded by `focusSync()` | yes | no |
| caller calls `tl.stop()` on the returned `Timeline` | yes | no |

```js
const t = hypertree(stage, tree, { ignoreWhileFocusing: true });
const tl = t.focus('a1');
tl.stop();              // cancel the transition yourself…
// …the guard is already released: the next click focuses normally.
```

> **Fixed.** Earlier, the guard was released only by
> `onComplete` and `dispose()`. Because `Timeline#stop()` skips `onComplete` **by
> contract**, cancelling the returned timeline left `ignoreWhileFocusing`
> permanently armed and the tree silently ignored every subsequent click.

##### `focusSync` precedence

`focusSync()` **wins** over any in-flight `focus()`. It stops every superseded
timeline (through the same `onSettle` seam, so the guard and the in-flight set
stay consistent) and then applies its snap. Consequences, in order:

- a superseded focus **never** runs its `onComplete` — it does not restore its
  own `focusId`, does not re-write positions, and does not fire `onFocus`;
- after `focusSync(id)` the state is exactly what an undisturbed
  `focusSync(id)` would have produced — `focusId === id`, the scheduler holds no
  hypertree tickable, the guard is down;
- ticking the scheduler afterwards cannot resurrect the cancelled transition;
- an **unknown id still throws first**: the target layout is resolved before
  anything is cancelled, so a failed `focusSync` leaves the in-flight focus
  untouched.

```js
t.focus('a1');          // 400 ms transition starts
t.focusSync('c');       // wins: the 'a1' transition is dropped on the spot
t.focusId;              // 'c' — and it stays 'c'
```

The mirror rule is unchanged: `focus()` does **not** supersede another
`focus()`. With `ignoreWhileFocusing: false` (the default) concurrent focuses
still stack, and the last one to complete wins.

#### `FocusInfo`

| Field | Type | Description |
|-------|------|-------------|
| `previous` | `string \| null` | The previously-focused id — `null` until this instance's first focus resolves. |
| `refocus` | `boolean` | `previous === id`: the focused node was re-selected rather than changed. |

```js
hypertree(stage, tree, {
    onFocus: (id, { previous, refocus }) => {
        if (refocus) return;                 // a re-click: don't re-push history
        history.pushState({ id }, '', `#${id}`);
        highlightTrail(previous, id);
    },
});
```

`info` is a second argument only — existing single-arity `onFocus(id)` consumers
are unaffected.

**Tree contract**: `{ id, label?, color?, action?, info?, children? }`, a single
root with no cycles (`color`, `action` and `info` are read in styled mode only), or an array of such roots (a
forest; see the forest recipe). A
repeated id throws `Error('hypertree.layout: cycle or duplicate id "<id>"')`.
`node`/`focus`/`focusSync` on an unknown id throw `unknown node`.

## Layout kernel

`layout(tree, { radius })` → `{ nodes, links }`:

- **even-sector subdivision** — the root spans the full circle; each node's
  angular sector is split evenly among its children (a node's children partition
  its sector; the root's children partition `2π`). Each node's `angle` is its
  sector midpoint.
- **`R/2^n` ring series** — depth `d` sits on ring `ringRadius(d) = R·(1 − 2^−d)`;
  increments halve each depth (`R/2, R/4, R/8, …`) and converge toward the
  boundary `R`. The root (depth 0) sits at the centre `(R, R)`.
- **quadratic-bezier link controls** — each parent→child link carries a control
  point at the mean of the two ring radii along the child angle. The renderer
  applies the same rule in every frame: the control point lies on the angle of
  the link's end farther from the centre, at the mean of the two ends'
  distances from the centre, so a link fans outward and never loops back.

`focusMove(result, focusId, { zoom }?)` → re-rooted `{ nodes, links }`
(behavioral parity with the legacy `computeMove`):

- **re-root** — the focused node moves to the centre (depth 0); every node's
  depth becomes its graph distance from the focus, on ring `ringRadius(depth)`.
- **focus fan** — the focus's own children share a sector of width `zoom`
  (default `DEFAULT_ZOOM` = `3π/2`, the legacy `alphaZoom` of 270°), centred on
  the focus's base angle.
- **the rest, opposite** — the rest of the tree, reached through the parent,
  takes the complementary sector, centred opposite (the whole circle when the
  focus has no children). A re-rooted node keeps the legacy cyclic order: its
  base children after the path child, then its re-rooted parent, then its base
  children before it. Sibling sectors are disjoint at every depth.

Focusing the root (already centred) is a **no-op** — the input is returned
unchanged. Every node of the original tree appears exactly once in the result.

## Examples

```js
const tree = {
    id: 'root', label: 'Root',
    children: [
        { id: 'a', label: 'Alpha', children: [{ id: 'a1' }, { id: 'a2' }] },
        { id: 'b', children: [{ id: 'b1' }] },
        { id: 'c' },
    ],
};

const stage = document.querySelector('#stage');   // an <svg> element
const t = hypertree(stage, tree, { radius: 400, duration: 300 });

t.focus('a1');          // animated recenter on 'a1'
t.focusSync('root');    // jump back to the root view, no animation
t.node('a1');           // { id, x, y, depth, angle, sector }
t.dispose();            // remove click listeners + clear the scheduler
```

### Recipe — the caller-provided SVG root

Unlike `graphic.pageflip` (which owns a self-contained `book.el`), `Hypertree`
**requires you to pass an existing SVG element**: it builds one `<g>` subtree and
appends it to whatever you hand it. That is deliberate — **the consumer owns
sizing**. The tree lays out in user units on a `2R × 2R` square with the root at
`(R, R)`; how that square maps to CSS pixels (fixed size, fluid, letterboxed,
inside a larger scene) is a page-layout decision the module must not make for you.

Build the root in the SVG namespace (`createElementNS` — the fw `parser` is
HTML-scoped and will NOT produce SVG elements) and give it a `viewBox` matching
the layout radius:

```js
import { hypertreeModule } from '@awacloud/graphic-anim';

const SVG_NS = 'http://www.w3.org/2000/svg';
const radius = 400;

const svg = document.createElementNS(SVG_NS, 'svg');
svg.setAttribute('viewBox', `0 0 ${radius * 2} ${radius * 2}`);
svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');   // fluid, never distorted
svg.setAttribute('class', 'hypertree-svg');                 // size it in CSS
document.querySelector('#carto').replaceChildren(svg);

const t = hypertree(svg, tree, { radius });                 // same radius, or the
                                                            // viewBox won't fit
```

Keep the `radius` option and the `viewBox` in sync: `radius` defaults to `500`,
so a root built for `0 0 800 800` with a default-radius tree clips. Because you
own the element, you also own its lifetime — `dispose()` detaches the listeners,
the scheduler and the tree's own `<g>`; it does not remove your SVG root.

### Recipe — a forest (several roots)

A forest — e.g. the `towards` concept map, which has three top-level roots — is
passed as an **array of roots**:

```js
const forest = [conceptsA, conceptsB, conceptsC];           // three real roots

const t = hypertree(svg, forest, {
    radius,
    styled: true,
    rootGlyph: logo,                                         // optional: the centre disc
    onNodeClick: (id) => {
        if (id === t.rootId) return true;                    // the origin: back to the start
        navigate(hrefFor(id));
        return false;                                        // navigate instead of focusing
    },
});
```

The library wraps the roots in an internal **origin**, the centre of the
initial view, whose id is `Hypertree.FOREST_ORIGIN` (`'hypertree-origin'`,
reserved in a forest: an author id equal to it throws). The origin is not
content:

- it draws no dot and no label, in either look, and it carries the
  `rootGlyph` when there is one (the legacy logo disc, shrinking off-centre);
- `t.rootId` holds its id and `t.forest` is `true`, so `focus(t.rootId)` (or a
  click on the glyph) returns to the initial view, as in the legacy page;
- it still appears in `onFocus`/`onNodeClick` (by that id) and in `node()`, so
  filter it out of anything derived from the tree (breadcrumbs, analytics);
- the real roots sit on ring `R/2`, not at the centre, so pick `radius`
  accordingly.

The layout kernel stays single-centre: the origin is its root. Positions are
identical to wrapping the roots by hand in `{ id: FOREST_ORIGIN, children }`.

## Notes

- **Distinct per-instance prefix** — each tree mints a distinct id-scope prefix
  (`hypertree-0`, `hypertree-1`, …) unless one is passed, so two trees in the same
  document never mint colliding ids (the per-instance id prefix rule).
- **Reference-bound targets, one write path** — node `<g>` groups and link
  `<path>`s are captured **once** at construction (via an id-indexed DOM walk, no
  `querySelector` id-escaping); the focus tick performs **no**
  `getElementById`/`querySelector`. Every attribute write routes through the
  frozen `graphic.svgApply.svgAttr` — no raw `setAttribute`.
- **Shared scheduler, no 2nd rAF** — a focus is a single `graphic.tween` `0 → 1`
  inside a `graphic.timeline` that registers ITSELF on the single shared
  `graphic.scheduler` (or an injected one for tests). Each tick lerps every node
  position between the current and target layout and writes; the module never
  calls `requestAnimationFrame` and never constructs a production `Scheduler`.
- **Clean dispose** — `dispose()` removes the click listeners, stops any
  in-flight focus timeline, leaving the scheduler empty (no leaked tickables),
  and detaches the built `<g>` from the SVG root (`el` stays readable). It
  goes through the same internal cancellation seam as `focusSync` supersession,
  so the in-flight set and the `ignoreWhileFocusing` guard are released by one
  code path, not three.
- **Guard release is termination-driven, not completion-driven** — the
  `ignoreWhileFocusing` state hangs on `graphic.timeline`'s `onSettle` hook, which
  fires on natural completion AND on `Timeline#stop()`; `onComplete` (which
  `stop()` skips by contract) only carries the end-state write and the `onFocus`
  notification. See [Guard lifecycle](#guard-lifecycle--released-on-every-termination).
- **Measured performance** — a ~111-node focus transition measured
  **~0.15 ms/frame** on happy-dom — **~100× under** the 16.67 ms (60 fps) budget.
  *Caveat:* `bun:test` runs on happy-dom with no real layout /
  paint / compositor; the number is the engine's per-frame COMPUTE cost (position
  lerp + write dispatch), NOT an achievable browser fps. The compute leg is
  representative (HIGH confidence); the DOM-write leg is a floor (MEDIUM) — a
  DOM-backed real-browser perf run is a standing follow-up.
- **Secure-writer routing** — writes go through `svgApply.svgAttr` → fw `dom.attr`
  → raw `setAttribute`; `dom.attr` does **not** invoke secPolicy sanitization. Do
  not assume attribute values are XSS-filtered beyond what `setAttribute` enforces.

## Styling model (`styled`)

The legacy `towardsHyperTree` look, opt-in; the default look is unchanged.
The plugin carries the look's **form** only. Its **content** — brand colours,
font, logo, badge icons — belongs to the consumer and comes in through
`styled.palette`, `styled.fontFamily`, `rootGlyph` and `badgeGlyphs`; the
defaults are neutral. The hypertree demo passes the towards look from a
demo-side module (`demos/hypertree/towards-look.js`).

- **Colour per branch** — a node takes its own `color`. Otherwise it inherits
  its parent's colour, and the root's children take the palette in order
  when the root has no colour. The root is neutral (`#5f6368`) unless it
  carries a colour. `nodeStyle` may override any node. The default palette
  is neutral: `#3b6ea8`, `#d9822b`, `#3a9e6f`, `#a4508b`, `#c9a227`,
  `#5a6b7b`. The default font is `system-ui, sans-serif`.
- **Links** — stroked with the colour of the link's child, width 1.5.
- **Dots** — filled with the node's colour. The radius is `bullet` at graph
  distance 0 and 1 from the focus, then `bulletFactor` times smaller per ring,
  lerped with the positions through a focus transition.
- **Pills** — each label is a group: a rounded `rect` (`rx` 5, the node's
  colour, height `22/14 · fontSize`, 10 wider than the text) and the white
  single-line text, `2r + 15` below the dot. The pill width uses the text's
  measured length (`getComputedTextLength`, once at build) when the browser
  gives one, and `0.55 · fontSize` per character otherwise (happy-dom,
  Workers). `labelDepth` applies to the whole group.
- **Root glyph** — `rootGlyph` replaces the root's dot (the legacy logo disc at
  the origin). Nodes paint above links, so the glyph's own disc hides the
  links under it. It keeps its natural size (`rootGlyphRadius`) at the centre.
  Off-centre it is scaled to twice its ring's dot radius, lerped through a
  focus, so it shrinks with the rest of the tree instead of covering the rim.
  The legacy origin shrank to `logoRadius / bulletFactor^(level + 4)`.

### Detail badges (`action`, `info`)

In styled mode a node carrying `action` gets the legacy link badge, and one
carrying `info` the info badge, in that order, right of its pill: a circle of
radius 10 in the node's colour holding a white glyph (built-in: an arrow for
`action`, an "i" for `info`; a consumer's icons through `badgeGlyphs`), the
first centred at `pillWidth/2 + 15`, the next 25 further. They live
in the label group, so `labelDepth` hides them with the label. A badge click
calls `onNodeDetail(id, kind, value, event)` and stops there: no focus, no
`onNodeClick`, and no navigation — the legacy page wrote `location.hash`; a
consumer does that from the hook if it wants it. The default look draws no
badge.

## Deferred follow-ups (OUT of this build)

- **Pan / drag / hover interaction** — click-to-focus is the only pointer
  interaction here.
- **Pixel-accurate label measurement in the default look** — the legacy
  `calculateSize` DOM offset-width role is replaced by a deterministic
  character-budget word-wrap. Styled pills measure their text when the browser
  can.
- **A general graph-layout engine** — trees only (single root, no cycles).

## See also

- `src/hypertree/layout.js` (`hypertree.layout`) — the pure radial layout + focus solver
- `src/hypertree/measure.js` (`hypertree.measure`) — the pure label word-wrap kernel
- [svg/build](./api/svg/build.md) — the JSON→SVG builder the tree is built with
- [svg/scoped-ids](./api/svg/scoped-ids.md) — the per-instance id scope
- [anim/timeline](./api/anim/timeline.md) · [anim/tween](./api/anim/tween.md) — the frozen focus driver
- [anim/scheduler](./api/anim/scheduler.md) — the shared rAF loop
- [pageflip/pageflip](./pageflip.md) — the page-turn book (distinct module)
