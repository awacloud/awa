---
module: styleMisc
category: odf/extra
dependencies: [xml, odfMiscHelper]
returns: object
worker-safe: true
status: complete
---

# styleMisc (P3 — misc)

> Opt-in catch-all : passthrough typed coverage for any residual
> `style:*` element. Each becomes
> `{ kind, attrs, children, _passthrough: true }`.

**Module** `styleMisc` | **Source** `packages/front/office/odf/src/extra/style-misc.js`

## Hooks

`hydrateStyles(s)` / `dehydrateStyles(s)`.
