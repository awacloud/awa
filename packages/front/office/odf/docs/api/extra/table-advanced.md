---
module: tableAdvanced
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# tableAdvanced (P0)

> Opt-in extra : typed support for advanced ODF spreadsheet table
> features (templates, database ranges, filters, sorts, scenarios,
> pivot/data-pilot trees).

**Module** `tableAdvanced` | **Source** `packages/front/office/odf/src/extra/table-advanced.js`

## Elements covered

`table:table-template`, `table:database-range`,
`table:database-source-query/sql/table`, `table:filter*`,
`table:scenario`, `table:sort*`, `table:subtotal-*`,
`table:cell-range-source`, `table:cell-content-change`,
`table:data-pilot-*` (full recursive subtree).

Each element is parsed into `{ kind, attrs, children: [...recursive] }`
at this scope.

## Hooks

`hydrateTable` / `dehydrateTable` — promotes/demotes the recognised
elements between `table._extras` and `table.advanced[]`.
