---
module: databaseSources
category: odf/extra
dependencies: [odfTypedHelper]
returns: object
worker-safe: true
status: complete
---

# databaseSources (P2)

> Opt-in extra : typed passthrough coverage of the complete `db:*`
> namespace (~50 elements) — data-source, driver-settings, queries,
> column-definitions, table-definitions, keys, indices, etc. Each
> element is preserved as
> `{ type: 'db-node', kind, attrs, children?, _passthrough: true }`.

**Module** `databaseSources` | **Source** `packages/front/office/odf/src/extra/database-sources.js`

## Helpers

`parseDb(el)` / `renderDb(obj)`, `isDb(name)`.
