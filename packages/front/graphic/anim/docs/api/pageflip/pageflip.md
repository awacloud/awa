---
module: pageflip/pageflip
category: pageflip
name: graphic.pageflip
type: fw.dom.graphic
dependencies: [graphic.svgBuild, graphic.scopedIds, graphic.timeline, graphic.tween, graphic.svgApply, pageflip.fold, pageflip.compose]
returns: "{ Pageflip, pageflip }"
worker-safe: false
status: complete
---

# pageflip/pageflip — `graphic.pageflip`

> A page-curl book as SVG: turns pages with an animated fold on the shared scheduler.

**Module** `graphic.pageflip` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/pageflip/pageflip.js` | **Deps** `graphic.svgBuild`, `graphic.scopedIds`, `graphic.timeline`, `graphic.tween`, `graphic.svgApply`, `pageflip.fold`, `pageflip.compose` | **Worker-safe** no

## Descriptor

`graphic.pageflip` is one capture-free fw module descriptor. Its factory takes the
seven resolved dependencies as parameters (`svgBuild`, `scopedIds`, `timelineMod`,
`tweenMod`, `svgApply`, `foldApi`, `composeApi`) and returns `{ Pageflip,
pageflip }`. The `Pageflip` class and the per-instance prefix counter are defined
**inside** the factory, so they reference only those parameters.

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
        /* … */ return { Pageflip, pageflip };
    },
};
```

`deps.map(d => d.name) === dependencies` (same order). The two pure kernels are
injected through DI; they are not members of the `graphicModules` registry.

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `Pageflip` | `class Pageflip(opts)` | Builds the book subtree and drives the curl. |
| `pageflip` | `(opts) => Pageflip` | Convenience: `new Pageflip(opts)`. |
| `Pageflip#el` | `SVGElement` | The built `<svg>` root; `null` after `dispose()`. |
| `Pageflip#prefix` | `string` | The id-scope prefix in force. |
| `Pageflip#index` | `number` | Current page index (spread mode: the lowest page index of the current spread). |
| `Pageflip#pageCount` | `number` | Total pages. |
| `Pageflip#currentId` | `string` (getter) | Id of the page at `index`. |
| `Pageflip#next` | `() => Timeline \| null` | Turn forward (by spread in spread mode). |
| `Pageflip#previous` | `() => Timeline \| null` | Turn backward. |
| `Pageflip#goTo` | `(id) => Timeline \| null` | Turn to the page with that id. |
| `Pageflip#imageState` | `(id) => string` | `'none'` (not an image page), `'idle'`, `'loading'`, `'ready'` or `'error'`. |
| `Pageflip#mountInto` | `(el) => this` | `el.replaceChildren(this.el)`. |
| `Pageflip#dispose` | `() => void` | Stop every in-flight turn, release pointer listeners, detach `el`. Idempotent. |

### Options (`PageflipOptions`)

| Option | Default | Meaning |
|--------|---------|---------|
| `pages` | required | `PageSpec[]` in reading order (at least 1). A page is `{ id, template?, src? }`: `template` is a `graphic.svgBuild` description; `src` makes an image page when there is no template; with neither, a white page-sized rect. |
| `width`, `height` | required | Page size, SVG user units; must be positive. |
| `prefix` | `pageflip-<n>` | Id-scope prefix; the default is distinct per instance. |
| `duration` | `300` | Turn duration, ms. |
| `easing` | `'linear'` | Curve function or name. |
| `marginPercent` | `1` | Fold margin scale, forwarded to `fold`. |
| `ratio` | `1` | Pattern render ratio, forwarded to `fold`. |
| `backFill` | `'#e9e6df'` | Fill of the leaf back (in a spread, the backing under the verso page). |
| `spread` | `false` | Two-page spread: the book is `2·width` wide; `next`/`previous`/`goTo` move by spread. |
| `shadow` | `0.05` | Spread gutter shadow width as a fraction of `width`; `0` hides the gutters. |
| `events` | none | The resolved fw `dom/query/events` module; with `spread`, enables the pointer corners. |
| `pointer` | `true` | `false` keeps a spread programmatic even when `events` is given. |
| `cache` | `8` | Image pages: preload window in pages, from `index − cache/2`. |
| `preloadConcurrency` | `1` | Image pages: loads in flight at most. |
| `loadImage` | `Image` + `decode()` | `(src) => Promise<void>`; resolves once decoded. Without `Image` in the environment the default resolves at once. |
| `scheduler` | shared | Override the scheduler (tests, isolation). |

## Notes

- **Throws**: the constructor throws `Pageflip: pages must be a non-empty array`
  and `Pageflip: width and height must be positive`. `goTo` throws
  `pageflip: unknown page "<id>"` for an unknown id.
- **Ignore-while-in-flight**: `next`, `previous` and `goTo` return `null` (no-op)
  at the last or first page, after `dispose()`, while a turn is in flight, and
  (spread mode) while a corner drag is in progress. `goTo` returns `null` when
  the id is already the current page (current spread in spread mode). After
  `dispose()` or during a turn `goTo` returns `null` before it checks the id, so
  it does not throw there.
- **Single scheduler**: a turn is one `Timeline` holding one `Tween` of the fold
  parameter `0 → 1`; each tick recomputes `pageflip.fold`, serializes with
  `pageflip.compose`, and writes the turning `<path>`'s `d` through
  `graphic.svgApply.svgAttr`. Targets are bound by reference once. No second
  animation-frame loop.
- **In-flight set**: turn timelines are tracked in a `Set` released on the
  timeline's `onSettle` hook, so a caller that stops the returned timeline
  directly still releases the guard. A cancelled turn rests back on the page it
  started from.
- **Single-page book** is programmatic only and unshaded. The pointer corners
  exist only in spread mode.
- **Spread pointer corners** (with `events`): four zones, 40 % of a page wide and
  high, at the spread's outer corners. Hover peels the corner inward (250 ms,
  linear); a press drags it; release past a quarter page beyond the spine
  completes the turn, otherwise it goes back; a press and release within 5 px is
  a click and runs the two-leg turn.
- **Image pages**: the `<image>` receives its `href` only after the loader
  resolves; the preload window follows the current page, nearest first, a turn's
  target pages first; a failed load sets state `'error'`.
- `dispose()` clears the pointer scope, stops every in-flight timeline, detaches
  `el` from its parent and sets `el` to `null`.
- Not Worker-safe: it builds and mutates a DOM subtree.

## See also

- [pageflip/fold](./fold.md) — the pure fold solver
- [pageflip/compose](./compose.md) — the polygon serializer
- [pageflip/create](./create.md) — `createPageflip`, the constructible helper
- [anim/timeline](../anim/timeline.md) — the `onSettle` hook the in-flight set uses
- [pageflip guide](../../pageflip.md) — the long form
