---
module: officeMisc
category: odf/extra
dependencies: [xml, odfMiscHelper]
returns: object
worker-safe: true
status: complete
---

# officeMisc (P3 — misc)

> Opt-in catch-all : passthrough typed coverage for any residual
> `office:*` element not typed by the core. Each becomes
> `{ kind, attrs, children, _passthrough: true }`.

**Module** `officeMisc` | **Source** `packages/front/office/odf/src/extra/office-misc.js`

## Hooks

`hydrateMetadata(m)` / `dehydrateMetadata(m)`.
