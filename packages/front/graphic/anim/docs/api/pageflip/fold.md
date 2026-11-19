---
module: pageflip/fold
category: pageflip
name: pageflip.fold
type: lib.graphic.pageflip
dependencies: []
returns: "{ fold, clampCorner, rotatePoint, lineIntersection, rectCorners, margin, EDGE_CASES, MARGIN_EPS }"
worker-safe: true
status: complete
---

# pageflip/fold — `pageflip.fold`

> Pure page-curl fold solver: from a dragged corner to the turn and under polygons.

**Module** `pageflip.fold` | **Type** `lib.graphic.pageflip` | **Source** `packages/front/graphic/anim/src/pageflip/fold.js` | **Deps** none | **Worker-safe** yes

## Descriptor

`pageflip.fold` is a capture-free descriptor with no dependencies and no DOM.
Its factory takes no parameter and returns the solver and its helpers; every
constant and table is defined inside the factory. It is injected into
`graphic.pageflip` through DI and is not a member of the `graphicModules`
registry.

```js
export const foldModule = {
    name: 'pageflip.fold',
    type: 'lib.graphic.pageflip',
    version: '0.1.0',
    dependencies: [],
    deps: [],
    factory() { /* … */ return { fold, clampCorner, rotatePoint, lineIntersection,
        rectCorners, margin, EDGE_CASES, MARGIN_EPS }; },
};
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `fold` | `(corner: {x,y}, page: {width, height, marginPercent?, ratio?}) => FoldResult` | Solve the fold for a dragged corner given relative to the spine. |
| `clampCorner` | `(rx, ry, width, height, marg, marginPercent = 1) => {x,y}` | Clamp the corner onto or inside the spine circle: below the top edge (`ry > 0`) to the arc of radius `width`; above it to the top margin arc of radius `marg / marginPercent` centred at `(0, height)`. |
| `rotatePoint` | `(px, py, ox, oy, deg) => {x,y}` | Rotate a point about an origin by `deg` degrees (counter-clockwise in SVG's y-down frame). |
| `lineIntersection` | `(ax, ay, bx, by, cx, cy, dx, dy) => {x,y} \| null` | Intersection of line `a→b` and line `c→d`; `null` for parallel lines. |
| `rectCorners` | `(width, height, dx, dy) => {x,y}[]` | The four page-rectangle corners in the fold-local frame, reflected to form the folded quad. |
| `margin` | `(w, h) => number` | `sqrt(w² + h²) − h`, the clamp margin term. |
| `EDGE_CASES` | frozen object | The five regimes: `OBTUSE` `'angle>0'`, `FLAT` `'angle==0'`, `SHALLOW` `'-45<angle<0'`, `DIAGONAL` `'angle==-45'`, `STEEP` `'angle<-45'`. |
| `MARGIN_EPS` | `0.01` | Below this share of the page size the corner is at rest and the fold degenerates. |

`FoldResult`:

| Field | Meaning |
|-------|---------|
| `corner` | The clamped dragged corner. |
| `turn` | Turn-page polygon, 4 points (closed by the serializer). |
| `under` | Under-page polygon, 5 points. |
| `pattern` | `{ x, y, rotate }` counter-transform so the page image does not shear (`x`, `y` divided by `ratio`; `rotate = −2·(angle + 45)` degrees). |
| `angle` | Fold half-angle in degrees, `atan(dy/dx) − 45`. |
| `edgeCase` | One of `EDGE_CASES`. |
| `degenerate` | `true` when the corner is at rest (flat page). |

## Notes

- Only the canonical top-right corner is solved: the dragged corner starts at
  the outer top-right `(width, 0)` of the right page, with the spine at `x = 0`.
  The other corners are obtained by mirroring the output (`graphic.pageflip`
  mirrors `y` for bottom corners).
- Degenerate case: when `width − clamped.x < width·MARGIN_EPS` and
  `|clamped.y| < height·MARGIN_EPS`, `turn` collapses to the origin (four
  `{0,0}` points), `under` is the whole page, `pattern` is `{0,0,0}`, `angle` is
  `−45` and `edgeCase` is `DIAGONAL`.
- The kernel has four parts: corner clamp, reflect-about-fold quad, five-case
  edge clip, pattern counter-transform.
- Coordinates are in SVG user units; the module references no `window` or
  `document`.
- `fold` has no `@throws`; `lineIntersection` returns `null` for parallel lines
  rather than throwing.
- Types: `src/pageflip/fold.d.ts` declares only `foldModule` as a
  `GraphicModuleDescriptor`; the members above are not typed there.

## See also

- [pageflip/compose](./compose.md) — serializes the polygons returned here
- [pageflip/pageflip](./pageflip.md) — the module that consumes the solver
- [pageflip guide](../../pageflip.md) — the long form
