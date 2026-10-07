---
module: drawImageExtended
category: odf/extra
dependencies: [xml, odfTypedHelper]
returns: object
worker-safe: true
status: complete
---

# drawImageExtended (P1)

> Opt-in extra : typed parse/render of the extended `draw:*` image /
> fill / layer / OLE / image-map family — `draw:area-rectangle`,
> `draw:area-circle`, `draw:area-polygon`, `draw:image-map`,
> `draw:gradient`, `draw:hatch`, `draw:fill-image`, `draw:opacity`,
> `draw:marker`, `draw:stroke-dash`, `draw:layer`, `draw:layer-set`,
> `draw:applet`, `draw:plugin`, `draw:floating-frame`, `draw:object`,
> `draw:object-ole`, `draw:param`.

**Module** `drawImageExtended` | **Source** `packages/front/office/odf/src/extra/draw-image-extended.js`

## Hooks

`hydrateFrame(f)` / `dehydrateFrame(f)` — promotes recognised
`draw:*` extras into `f.drawExtras[]`.
