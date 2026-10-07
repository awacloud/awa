---
module: dr3d3d
category: odf/extra
dependencies: [xml, odfTypedHelper]
returns: object
worker-safe: true
status: complete
---

# dr3d3d (P2)

> Opt-in extra : extended typing for the `dr3d:*` 3D scene vocabulary —
> `dr3d:scene`, `dr3d:cube`, `dr3d:sphere`, `dr3d:extrude`, `dr3d:rotate`,
> `dr3d:light`. Deeper attribute preservation than core `dr3dScene`.

**Module** `dr3d3d` | **Source** `packages/front/office/odf/src/extra/dr3d-3d.js`

## Helpers

`parseScene(el)` / `renderScene(obj)`, `hydrateFrame(f)` /
`dehydrateFrame(f)`.
