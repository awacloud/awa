---
module: drawShapes
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# drawShapes (P0)

> Opt-in extra : extended typed coverage of the `draw:*` shape
> vocabulary.

**Module** `drawShapes` | **Source** `packages/front/office/odf/src/extra/draw-shapes.js`

## Elements covered

`draw:rect`, `draw:circle`, `draw:ellipse`, `draw:line`,
`draw:polyline`, `draw:polygon`, `draw:path`, `draw:regular-polygon`,
`draw:connector`, `draw:caption`, `draw:measure`, `draw:control`,
`draw:custom-shape` (with `draw:enhanced-geometry`, `draw:equation`,
`draw:handle`), `draw:contour-polygon`, `draw:contour-path`.

## Hooks

`hydrateFrame` / `dehydrateFrame` — promotes/demotes the recognised
shape elements between `frame._extras` and `frame.shapes[]`.

## Helpers

`parseShape(el)` / `renderShape(s)`,
`parseEnhanced(el)` / `renderEnhanced(e)`.
