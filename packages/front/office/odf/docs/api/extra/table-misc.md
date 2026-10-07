---
module: tableMisc
category: odf/extra
dependencies: [xml, odfMiscHelper]
returns: object
worker-safe: true
status: complete
---

# tableMisc (P3 — misc)

> Opt-in catch-all : passthrough typed coverage for any residual
> `table:*` element. Each becomes
> `{ kind, attrs, children, _passthrough: true }`.

**Module** `tableMisc` | **Source** `packages/front/office/odf/src/extra/table-misc.js`

## Hooks

`hydrateTable(t)` / `dehydrateTable(t)`.
