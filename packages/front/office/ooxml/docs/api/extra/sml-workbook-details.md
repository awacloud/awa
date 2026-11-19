---
module: smlWorkbookDetails
category: extra
dependencies: [xml, docxProperties]
returns: object
worker-safe: true
status: complete
---

# smlWorkbookDetails

> Workbook elements the xlsx core leaves in `_extras`: the stylesheet's slicer and timeline styles and `colors`, a font's `outline` / `shadow` / `condense` / `extend`, a dxf's `protection`, a table column's `xmlColumnPr` and `calculatedColumnFormula`. An xlsx walker extension, in [`xlsx-full`](../bundles/xlsx-full.md).

**Module** `smlWorkbookDetails` | **Source** `packages/front/office/ooxml/src/extra/sml-workbook-details.js` | **Deps** `xml`, `docxProperties` | **Worker-safe** yes

Registered through [`xlsx-full`](../bundles/xlsx-full.md), or with `xlsx.use(...)`, it types those elements on `hydrateWorkbook` and writes them back on `dehydrateWorkbook`. Each one is typed only when it is written back as read (`docxProperties.hydrateLossless`). A bag (the stylesheet, a font, a dxf, a table column) is typed only when its untyping gives back its `_extras` in their order; any other element stays in `_extras`.

## Resolve

```js
const ext = runtime.resolve('smlWorkbookDetails');
// Returns the walker hooks: hydrateWorkbook / dehydrateWorkbook.
```

## Fields typed

| Where | Field | From |
|-------|-------|------|
| `workbook.styles` | `slicerStyles: { default?, styles?: [{ name, elements?: [{ type, dxfId? }] }] }` | the stylesheet's `extLst`, extension `x14:slicerStyles` |
| `workbook.styles` | `timelineStyles` (same shape) | the stylesheet's `extLst`, extension `x15:timelineStyles` |
| `workbook.styles` | `colors: { indexed?: ['AARRGGBB'], mru?: [{ rgb?, theme?, tint?, … }] }` | `<colors>` |
| a font (`styles.fonts[]`, `styles.dxfs[].font`) | `condense`, `extend`, `outline`, `shadow` (booleans) | `<condense>` … (no `val` is `true`) |
| a dxf (`styles.dxfs[]`) | `protection: { locked?, hidden? }` | `<protection>` |
| a table column (`tables[].columns[]`) | `calculatedColumnFormula: { formula, array? }` | `<calculatedColumnFormula>` |
| a table column | `xmlColumnPr: { mapId, xpath, xmlDataType, denormalized? }` | `<xmlColumnPr>` |

The stylesheet's `extLst` is typed only when it holds those two extensions alone, in that order, each declaring its namespace.

## Notes

- **Left raw** in the wild corpus: a `<colors>` holding `themeColors` (an Excel 2007 beta element), a drawing's shape properties, and a conditional-formatting rule's `extLst`.
- A drawing's text is typed by [`dmlTextDetails`](./dml-text-details.md), which `xlsx-full` also registers: the [xlsx walker](../xlsx/xlsx-walker.md) reaches each drawing's text body.
- **Why only `xlsx-full`.** Adding these fields to [`xlsx-large`](../bundles/xlsx-large.md) would change what its readers find in `_extras`.

## See also

- [xlsxWalker](../xlsx/xlsx-walker.md) — the hooks and what they visit.
- [xlsxStyles](../xlsx/styles.md), [xlsxTables](../xlsx/tables.md) — the core models these fields extend.
