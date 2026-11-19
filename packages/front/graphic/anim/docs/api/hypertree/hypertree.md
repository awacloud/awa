---
module: hypertree/hypertree
category: hypertree
name: graphic.hypertree
type: fw.dom.graphic
dependencies: [graphic.svgBuild, graphic.scopedIds, graphic.timeline, graphic.tween, graphic.svgApply, graphic.scheduler, hypertree.layout, hypertree.measure]
returns: "{ Hypertree, hypertree }"
worker-safe: false
status: complete
---

# hypertree/hypertree — `graphic.hypertree`

> A radial tree as SVG with animated focus: click a node and the tree re-roots on it.

**Module** `graphic.hypertree` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/hypertree/hypertree.js` | **Deps** `graphic.svgBuild`, `graphic.scopedIds`, `graphic.timeline`, `graphic.tween`, `graphic.svgApply`, `graphic.scheduler`, `hypertree.layout`, `hypertree.measure` | **Worker-safe** no

## Descriptor

`graphic.hypertree` is one capture-free fw module descriptor. Its factory takes
the eight resolved dependencies as parameters (`svgBuild`, `scopedIds`,
`timelineMod`, `tweenMod`, `svgApply`, `schedulerMod`, `layoutApi`, `measureApi`)
and returns `{ Hypertree, hypertree }`. The `Hypertree` class and the
per-instance prefix counter are defined inside the factory.

```js
export const hypertreeModule = {
    name: 'graphic.hypertree',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline',
        'graphic.tween', 'graphic.svgApply', 'graphic.scheduler',
        'hypertree.layout', 'hypertree.measure'],
    deps: [svgBuildModule, scopedIdsModule, timelineModule, tweenModule,
        svgApplyModule, schedulerModule, hypertreeLayoutModule, hypertreeMeasureModule],
    factory(svgBuild, scopedIds, timelineMod, tweenMod, svgApply, schedulerMod, layoutApi, measureApi) {
        /* … */ return { Hypertree, hypertree };
    },
};
```

`deps.map(d => d.name) === dependencies` (same order). The two kernels are
injected through DI and are not `graphicModules` members.

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `Hypertree` | `class Hypertree(svgRoot, tree, opts?)` | Builds the tree `<g>`, appends it to `svgRoot`, wires click-to-focus. |
| `hypertree` | `(svgRoot, tree, opts?) => Hypertree` | Convenience: `new Hypertree(...)`. |
| `Hypertree.FOREST_ORIGIN` | `'hypertree-origin'` | Reserved id of the internal origin a forest is wrapped in. |
| `Hypertree#el` | `SVGElement` | The built root `<g>`; stays readable after `dispose()`. |
| `Hypertree#rootId` | `string` | Root id (`FOREST_ORIGIN` for a forest). |
| `Hypertree#forest` | `boolean` | True when `tree` was an array. |
| `Hypertree#prefix` | `string` | The id-scope prefix in force. |
| `Hypertree#focusId` | `string` (getter) | The currently focused node id. |
| `Hypertree#focus` | `(nodeId) => Timeline` | Animate the re-rooting on a node (one tween `0 → 1` on the shared scheduler); fires `onFocus` on completion. |
| `Hypertree#focusSync` | `(nodeId) => this` | Apply the focus at once, no animation; fires `onFocus` immediately. |
| `Hypertree#node` | `(nodeId) => { id, x, y, depth, angle, sector }` | Base metadata merged with the current animated position. |
| `Hypertree#dispose` | `() => void` | Remove listeners, stop in-flight focus timelines, detach `el`. Idempotent. |

`tree` is a `TreeNode` `{ id, label?, color?, action?, info?, children? }` or a
forest (an array of roots).

### Options (`HypertreeOptions`)

| Option | Default | Meaning |
|--------|---------|---------|
| `radius` | `500` (layout default) | Outer layout radius `R`. |
| `prefix` | `hypertree-<n>` | Id-scope prefix; distinct per instance by default. |
| `duration` | `400` | Focus transition, ms. |
| `easing` | `'easeInOutCubic'` | Curve function or name. |
| `onFocus` | none | `(id, { previous, refocus }) => void`, on focus completion. `previous` is `null` before the first focus. |
| `onNodeClick` | none | `(id, event) => boolean \| void`, before the internal focus; return `false` to cancel it. |
| `onNodeDetail` | none | Styled mode: `(id, kind, value, event)` on a click on a detail badge (`'action'` or `'info'`). Such a click neither focuses nor reaches `onNodeClick`. |
| `ignoreWhileFocusing` | `false` | When `true`, a click while a focus timeline is in flight is ignored entirely. |
| `maxLabel` | `16` | Characters per label line (word-wrap). Unused by styled labels (single-line pills). |
| `styled` | `false` | The legacy look. `true` or `{ bullet, bulletFactor, fontSize, fontFamily, palette }`; defaults `bullet` 7.5, `bulletFactor` 1.5, `fontSize` 14, `fontFamily` `'system-ui, sans-serif'`, palette `#3b6ea8 #d9822b #3a9e6f #a4508b #c9a227 #5a6b7b`. |
| `nodeStyle` | none | Styled mode: `(node, { depth, color }) => { color? } \| void`, called once per node at build, in tree order; a returned `color` overrides and is inherited. |
| `rootGlyph` | none | Styled mode: a `graphic.svgBuild` template drawn instead of the root's dot. |
| `rootGlyphRadius` | `100` | Styled mode: the root glyph's natural radius, the basis of its off-centre scale. |
| `badgeGlyphs` | built-in | Styled mode: `{ action?, info? }` `svgBuild` templates in a 20 × 20 frame; a missing kind keeps the neutral built-in glyph. |
| `labelDepth` | `Infinity` | Show only labels within this graph distance of the focus (the default makes no label write at all). |
| `scheduler` | shared | Override the scheduler (tests, isolation). |

## Notes

- **Throws** (constructor): `Hypertree: svgRoot is required`; `Hypertree: tree must
  have an id`; for a forest, `Hypertree: a forest must have at least one root` and
  `Hypertree: id "hypertree-origin" is reserved for the forest origin`; and a
  cycle or duplicate id from the layout kernel (`hypertree.layout: cycle or
  duplicate id "<id>"`). `focus`, `focusSync`: `hypertree.layout: unknown node
  "<id>"` for an unknown id. `node`: `hypertree: unknown node "<id>"`.
- **Click order**: disposal guard, then the `ignoreWhileFocusing` guard, then
  `onNodeClick` (may veto with `false`), then the internal focus. With no option
  set it reduces to `focus(id)`.
- **`focusSync` wins**: it resolves its target before cancelling anything (an
  unknown id throws without disturbing a transition), then stops in-flight
  timelines. A superseded focus never runs its `onComplete`, so it fires no
  `onFocus`.
- **Guard release on `onSettle`**: the in-flight set and the re-entrancy flag
  are released on the timeline's `onSettle` hook, so they clear on completion,
  `dispose()`, `focusSync` supersession, and a caller calling `stop()` on the
  returned timeline.
- **Forest**: an array of roots is wrapped in the internal origin, which has no
  dot and no label (the `rootGlyph` when given); focusing `rootId` returns to the
  initial view.
- **Links** are quadratic curves; the control point lies on the angle of the end
  farther from the centre, at the mean distance of the two ends.
- **Label sizing** is a deterministic estimate; where the browser provides
  `getComputedTextLength`, styled pills are sized once at build from the measured
  length.
- Click-to-focus is the only pointer interaction; pan, drag and hover are not
  provided.
- Not Worker-safe: it builds and mutates a DOM subtree.

## See also

- [hypertree/layout](./layout.md) — positions and re-rooting
- [hypertree/measure](./measure.md) — label word-wrap
- [hypertree/create](./create.md) — `createHypertree`, the constructible helper
- [anim/timeline](../anim/timeline.md) — `onSettle`, the hook the guards hang on
- [hypertree guide](../../hypertree.md) — the long form
