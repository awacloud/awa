---
module: hypertree/layout
category: hypertree
name: hypertree.layout
type: lib.graphic.hypertree
dependencies: []
returns: "{ layout, focusMove, ringRadius, TWO_PI, DEFAULT_RADIUS, DEFAULT_ZOOM }"
worker-safe: true
status: complete
---

# hypertree/layout — `hypertree.layout`

> Pure radial tree layout and the re-rooting focus move.

**Module** `hypertree.layout` | **Type** `lib.graphic.hypertree` | **Source** `packages/front/graphic/anim/src/hypertree/layout.js` | **Deps** none | **Worker-safe** yes

## Descriptor

`hypertree.layout` is a capture-free descriptor with no dependencies and no DOM.
Its factory takes no parameter and returns the solver and its constants, all
defined inside the factory. It is injected into `graphic.hypertree` through DI
and is not a `graphicModules` member.

```js
export const hypertreeLayoutModule = {
    name: 'hypertree.layout',
    type: 'lib.graphic.hypertree',
    version: '0.1.0',
    dependencies: [],
    deps: [],
    factory() { /* … */ return { layout, focusMove, ringRadius, TWO_PI,
        DEFAULT_RADIUS, DEFAULT_ZOOM }; },
};
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `layout` | `(tree, opts?: { radius? }) => LayoutResult` | Lay out a single-root tree radially: root at the centre `(R, R)`, each node's angular sector split evenly among its children, depth `d` on ring `ringRadius(d, R)`. |
| `focusMove` | `(layoutResult, focusId, opts?: { zoom? }) => LayoutResult` | Re-root a layout at `focusId`. |
| `ringRadius` | `(depth, radius) => number` | `radius · (1 − 2^−depth)`; `0` for `depth <= 0`. |
| `TWO_PI` | `number` | Full circle in radians. |
| `DEFAULT_RADIUS` | `500` | Outer radius when none is given. |
| `DEFAULT_ZOOM` | `1.5 · π` | Default focus fan, 270°. |

Result shapes:

| Type | Fields |
|------|--------|
| `LayoutResult` | `{ nodes: LayoutNode[], links: LayoutLink[] }` |
| `LayoutNode` | `{ id, x, y, depth, angle, sector: { start, end } }` (angles in radians; `angle` is the sector midpoint) |
| `LayoutLink` | `{ from, to, cx, cy }` (quadratic Bézier control point at the mean of the two ring radii along the child angle) |

## Notes

- **`layout` throws** `hypertree.layout: tree must be an object with an id` when
  the tree is not an object or has no id, and `hypertree.layout: cycle or
  duplicate id "<id>"` on a repeated id. A `radius` that is not positive falls
  back to `DEFAULT_RADIUS`.
- **`focusMove` throws** `hypertree.layout: unknown node "<id>"` when `focusId` is
  not in the layout, and `hypertree.layout: layout has no root (depth 0)` when
  there is no depth-0 node.
- Focusing the root is a **no-op**: the input `layoutResult` is returned
  unchanged. Otherwise a new result is returned.
- `focusMove`: the focus goes to the centre; its own children share a fan of
  width `zoom` around its base angle (a `zoom` outside `(0, 2π)` falls back to
  `DEFAULT_ZOOM`; a focus with no children gives the rest of the tree the whole
  circle); the rest of the tree, reached through the parent, takes the remaining
  sector. A re-rooted node orders its children as: base children after the path
  child, then its re-rooted parent, then base children before the path child.
  Rings follow graph distance from the focus; every original node appears once.
- Pure 2D geometry over plain data; no DOM global.
- Types: `src/hypertree/layout.d.ts` declares only `hypertreeLayoutModule` as a
  `GraphicModuleDescriptor`.

## See also

- [hypertree/hypertree](./hypertree.md) — the consumer
- [hypertree/measure](./measure.md) — the other injected kernel
- [hypertree guide](../../hypertree.md) — the long form
