---
module: smlPackageParts
category: extra
dependencies: [xml, opcPackage, opcRelationships, docxProperties, ooxmlShared, smlPivotTables]
returns: object
worker-safe: true
status: complete
---

# smlPackageParts

> The xlsx parts the core's read leaves unmodelled: the calculation chain, the external links, the XML maps, the connections, the query tables, and the pivot caches and tables. An xlsx walker extension on the package hooks, in [`xlsx-full`](../bundles/xlsx-full.md).

**Module** `smlPackageParts` | **Source** `packages/front/office/ooxml/src/extra/sml-package-parts.js` | **Deps** `xml`, `opcPackage`, `opcRelationships`, `docxProperties`, `ooxmlShared`, `smlPivotTables` | **Worker-safe** yes

Registered through [`xlsx-full`](../bundles/xlsx-full.md), or with `xlsx.use(...)`, it reads those parts into the workbook model and writes them back. A part is read only when three things hold:

- it would be written back as read: its root, re-rendered, is `docxProperties.sameElement` to the source, namespace declarations aside;
- it is in the Transitional namespace;
- its relationships are ones the write rebuilds.

Any other part stays in `unmodelledParts`, as the core leaves it.

## Resolve

```js
const ext = runtime.resolve('smlPackageParts');
// Returns the walker's package hooks: hydratePackage / dehydratePackage.
```

## What it reads

| Part | Becomes |
|------|---------|
| `xl/calcChain.xml` | `workbook.calcChain: { ns, cells: [{ ref, sheet, sheetGiven?, childChain?, newLevel?, newThread?, array? }] }` — `sheet` is the entry's sheet position in `workbook.sheets` |
| `xl/externalLinks/externalLink<n>.xml` | `workbook.externalLinks: [{ ns, target, book: { sheetNames?, definedNames?, sheetDataSet? } }]`, in the workbook's `externalReferences` order; `target` is the `externalLinkPath` relationship's target |
| `xl/xmlMaps.xml` | `workbook.xmlMaps: { ns, selectionNamespaces?, schemas: [{ id, namespace?, schemaRef?, content }], maps: [{ id, name, rootElement, schemaId, autoFit, append, … }] }` — a schema's XSD `content` is kept verbatim |
| `xl/connections.xml` | `workbook.connections: { ns, connections: [{ id, name, type, …, dbPr?, webPr?, parameters? }] }` |
| `xl/queryTables/queryTable<n>.xml` | its table's `queryTable: { ns, name, connectionId, …, refresh?: { nextId, …, fields } }` |
| `xl/pivotCache/pivotCacheDefinition<n>.xml`, `…Records<n>.xml` | `workbook.pivotCaches: [{ cacheId, definition, records? }]`, in the workbook's `pivotCaches` order — [`smlPivotTables`](./sml-pivot-tables.md)'s models |
| `xl/pivotTables/pivotTable<n>.xml` | its sheet's `pivotTables: [{ table, cache }]`, `cache` the index of its cache in `workbook.pivotCaches` |

`ns` holds the root's namespace declarations and `mc:Ignorable`, written back with it.

## What it writes

After the core has built its package, the write adds those parts, their relationships, the workbook's `externalReferences` and their content types.

- **The calculation chain.** It names its sheets by id, and the core writes sheet ids 1..n by position, so the write names each entry's sheet by its written id. It writes `i` where the source had it and where the sheet changes.
- **Entries kept.** The chain keeps only the entries whose cell holds a formula in the written model: its own, or a place in an array formula's range. An edited workbook never names a cell without one, and an empty chain is not written.
- **A query table** is written for a table the core writes, with the table's relationship to it.
- **The pivot caches** are written with their records and the workbook's `pivotCaches` (after `definedNames`, in `CT_Workbook`'s order); each pivot table with its sheet's relationship to it and its own to its cache.
- A cache whose source names an external workbook stays unmodelled, and so does a table whose cache was not read.

## Notes

- **Left unmodelled** in the wild corpus:
  - the calculation chains of Strict files and of an Excel 2007 beta file (not in the Transitional namespace);
  - a pivot cache whose source is an external workbook, and its table.
- **Why only `xlsx-full`.** Adding these fields to [`xlsx-large`](../bundles/xlsx-large.md) would change what its readers find in the model.

## See also

- [xlsxWalker](../xlsx/xlsx-walker.md) — the package hooks.
- [smlCalculation](./sml-calculation.md) — the toolkit codec for the calculation chain, which a read never calls.
