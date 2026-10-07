---
module: drawMisc
category: odf/extra
dependencies: [xml, odfMiscHelper]
returns: object
worker-safe: true
status: complete
---

# drawMisc (P3 — misc)

> Opt-in catch-all : passthrough typed coverage for any residual
> `draw:*` element. Each becomes
> `{ kind, attrs, children, _passthrough: true }`.

**Module** `drawMisc` | **Source** `packages/front/office/odf/src/extra/draw-misc.js`

## Hooks

`hydrateFrame(f)` / `dehydrateFrame(f)`.
