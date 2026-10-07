---
module: xlsx
category: ooxml/xlsx
dependencies: [ooxmlErrors, opcPackage, xml, opcRelationships, xlsxStyles, xlsxTables, xlsxConditionalFormatting, xlsxComments, markupCompatibility, xlsxDrawings, drawingmlChart, xlsxThreadedComments, xlsxWalker, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# xlsx

> `.xlsx` reader/writer (SpreadsheetML, ECMA-376 part 1 §18) — top-level orchestrator.

**Module** `xlsx` | **Source** `packages/front/office/ooxml/src/xlsx/xlsx.js` | **Deps** `ooxmlErrors`, `opcPackage`, `xml`, `opcRelationships`, `xlsxStyles`, `xlsxTables`, `xlsxConditionalFormatting`, `xlsxComments`, `markupCompatibility`, `xlsxDrawings`, `drawingmlChart`, `xlsxThreadedComments`, `xlsxWalker`, `ooxmlShared` | **Worker-safe** yes

Reads `xl/workbook.xml`, parses every sheet (`xl/worksheets/sheet*.xml`), and resolves `sharedStrings.xml`, `styles.xml`, tables, conditional formatting, legacy + threaded comments, drawings and charts. On write it deduplicates shared strings automatically and computes the relationships.

## Resolve

```js
const x = runtime.resolve('xlsx');
// Returns: { read, write, use,
//            colName, colIndex, cellRef, parseRef,
//            parseSharedStrings, serializeSharedStrings,
//            CT_WORKBOOK, CT_SHEET, CT_SHARED_STRINGS,
//            REL_TYPE_DOC, REL_TYPE_SHEET, REL_TYPE_SHARED_STRINGS,
//            REL_TYPE_HYPERLINK }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `read` | `(bytes: Uint8Array, readOpts?) => { workbook, package, unmodelledParts }` | Typed workbook + raw package + loss record. See [Result shape](#result-shape). |
| `write` | `(workbook) => Uint8Array` | `.xlsx` bytes. Single argument — no options object. |
| `use` | `(...exts) => api` | Plugs extras in (`hydrateWorkbook` / `hydrateSheet` / `hydrateSettings` hooks). |
| `colName` | `(idx: number) => 'A'\|'B'\|…\|'AA'\|…` | 0-based index → letter. |
| `colIndex` | `(name: string) => number` | Letter → 0-based index. |
| `cellRef` | `(rowIdx, colIdx) => 'A1'` | Builds a reference. |
| `parseRef` | `('A1') => { col, row }` | Decomposes a reference (0-based). |
| `parseSharedStrings` / `serializeSharedStrings` | symmetric | `sharedStrings.xml` round-trip. |
| `CT_*`, `REL_TYPE_*` | string | OPC bindings. |

## Result shape

```js
{
    workbook,                                   // see Workbook model below
    package,                                    // plain OPC package { contentTypes, parts, rels }
    unmodelledParts: [{ partName, contentType }]
}
```

`unmodelledParts` is always present (`[]` when every part was consumed): the
package parts the read did not consume, sorted by `partName`, with their
content type from `[Content_Types].xml` (`null` when none is declared).
`[Content_Types].xml` and the relationship parts are never listed. `write()`
produces the parts its model carries; a part `read()` did not model is not
written back — `read()` lists it in `unmodelledParts`. Typical entries: the
theme, document properties, printer settings, pivot tables and their caches,
the calc chain, and the legacy VML drawing of comment shapes (for which
`write()` generates a new one from the comments model). `write()` takes
`result.workbook`, not this envelope.

## Workbook model

```js
{
    type: 'workbook',
    sheets: [{
        name: string,
        state?: 'visible'|'hidden'|'veryHidden',
        rows: [ [cell, cell, …], … ],   // an array of rows, each an array of cells
        merges?: ['A1:B2', …],
        cols?: [{ min, max, width?, customWidth?, style? }],
        sheetViews?, autoFilter?, hyperlinks?, dataValidations?,
        conditionalFormatting?,
        tableRefs?: [tableId],
        comments?, commentAuthors?, threadedComments?,
        drawings?: [drawingEntry]
    }],
    definedNames?: [{ name, value, scope?, hidden? }],
    sharedStrings?: [string],
    tables?: [xlsxTablesObject],
    persons?: [...],     // for threaded comments
    styles?: xlsxStylesObject
}

cell := { type: 'cell',
          value, t,                  // t: 'n'|'s'|'b'|'inlineStr'|'str'|'e'
          formula?, ref?,
          s?: number,                // index into cellXfs
          hyperlinkRef?: string }
```

`sheet.rows` is a **plain array of rows**, and each row is a **plain array of
cells** — there is no `{ index, cells }` wrapper. Gaps produced by a sparse
`r=` attribute are back-filled with `{ type:'cell', value:null, t:'n' }` so the
column index equals the position in the row array.

## Examples

### Minimal workbook

```js
const x = runtime.resolve('xlsx');
const wb = {
    type: 'workbook',
    sheets: [{
        name: 'Sheet1',
        rows: [
            [{ type: 'cell', value: 'Name', t: 's' },
             { type: 'cell', value: 'Score', t: 's' }],
            [{ type: 'cell', value: 'Alice', t: 's' },
             { type: 'cell', value: 95, t: 'n' }]
        ]
    }]
};
const bytes = x.write(wb);
```

Raw primitives are accepted too — `rows: [['Name', 'Score'], ['Alice', 95]]`
is normalised on write.

### Read and transform

```js
const r = x.read(fileBytes);
const sheet = r.workbook.sheets[0];
const totals = sheet.rows.flatMap(row =>
    row.filter(c => c && c.t === 'n').map(c => c.value));
```

### The `.use(...)` hook

```js
const x = runtime.resolve('xlsx').use(someExtension);
```

`xlsxWalker` dispatches only `hydrateWorkbook`, `hydrateSheet` and
`hydrateSettings` (plus their `dehydrate*` counterparts). None of the shipped
`sml*` / `dml*` extras exposes those names, so they are registered but never
invoked — call their parse/render helpers directly. See the
[bundles guide](../bundles/README.md).

## Notes

- Cell addresses: `A1` = `{col:0, row:0}`. `colName(26)` = `'AA'`.
- `cell.t = 's'` means shared string; on write, string values are auto-deduplicated into `sharedStrings`. `'inlineStr'` forces an inline `<is>`.
- `cell.s` is the index into `styles.cellXfs` (not `cellStyles`).
- `markupCompatibility.process(root)` is called on read with its default options — no `supportedPrefixes`, so every `mc:Choice` falls through to its Fallback branch.
- `read(bytes, opts)` enforces three resource caps, raising `ParseError('xlsx/limit-exceeded')` with the offending cap in `context.limit` (plus `context.max`, `context.actual` and, for the per-sheet caps, `context.partName`):
  - `maxSheets` (default `64`) — the number of `<sheet>` entries the workbook declares; checked before any worksheet part is read.
  - `maxRowsPerSheet` (default `200000`) — the `<row>` elements of one worksheet.
  - `maxCellsPerSheet` (default `5000000`) — the cells of one worksheet, **including the empty cells the reader inserts for gaps before a cell's column** (a lone `<c r="XFD1">` materialises a 16384-cell row).

  The row and cell caps are checked twice: on a pre-scan of the worksheet part's text, before its XML is parsed, and while its rows are mapped, so gap padding stops the moment the cell total passes the cap. The `opcPackage.read` archive limits bound the part bytes before either. A cap of `0` disables that check (and, for `maxCellsPerSheet`, the bound on gap padding).
  - `readOpts.maxParts`, `readOpts.maxUncompressed` and `readOpts.maxRatio` override the archive limits of [`opc.read`](../opc/package.md) from the same options object (defaults kept; `0` disables a check).
- Threaded comments (Office 2018+): see [xlsx-threaded-comments](./threaded-comments.md). They coexist with legacy comments.

## See also

- [xlsx-styles](./styles.md), [xlsx-tables](./tables.md), [xlsx-conditional-formatting](./conditional-formatting.md) — auxiliary parts.
- [xlsx-comments](./comments.md), [xlsx-threaded-comments](./threaded-comments.md), [xlsx-drawings](./drawings.md) — other parts.
- [Bundles guide](../bundles/README.md) — ergonomic wiring.
