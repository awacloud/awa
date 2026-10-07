---
module: legacyStaroffice
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# legacyStaroffice (P3 — misc)

> Opt-in catch-all : preserves any element belonging to a legacy
> StarOffice 5.x/6.x namespace as
> `{ kind, attrs, children, _legacy: true }`, so they survive a
> roundtrip even though they have no ODF 1.4 counterpart.
>
> Recognised prefixes: `so:`, `so20:`, `so52:`, `ooo:`, `ooow:`, `oooc:`.

**Module** `legacyStaroffice` | **Source** `packages/front/office/odf/src/extra/legacy-staroffice.js`

## Helpers

`parseLegacy(el)` / `renderLegacy(obj)`, `isLegacy(name)`.

## Hooks

`hydrate*` / `dehydrate*` exposed for every container kind
(paragraph, metadata, styles, frame).
