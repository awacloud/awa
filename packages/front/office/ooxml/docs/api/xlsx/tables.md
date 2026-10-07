---
module: xlsxTables
category: ooxml/xlsx
dependencies: [ooxmlErrors, xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# xlsxTables

> Excel tables — `xl/tables/table*.xml` (§18.5).

**Module** `xlsxTables` | **Source** `packages/front/office/ooxml/src/xlsx/tables.js` | **Deps** `ooxmlErrors`, `xml`, `ooxmlShared` | **Worker-safe** yes

An Excel "table" (formerly "list") is a structured rectangular range with a header, an optional totals row and named columns. Each table is its own XML part, referenced from the sheet through a `…/table` relationship and listed in `<tableParts>`.

## Resolve

```js
const t = runtime.resolve('xlsxTables');
// Returns: { parse, serialize, bytesOf, REL_TYPE_TABLE, CT_TABLE }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(text\|bytes) => tableObj` | Typed model. |
| `serialize` | `(obj) => string` | `<table>` XML. |
| `bytesOf` | `(obj) => Uint8Array` | UTF-8 bytes. |
| `REL_TYPE_TABLE`, `CT_TABLE` | string | OPC bindings. |

## Model

```js
{
    id: number,
    name: string,                  // unique in the workbook (e.g. 'Table1')
    displayName: string,
    ref: 'A1:D10',
    headerRowCount?: 0|1,
    totalsRowCount?: 0|1,
    totalsRowShown?: boolean,
    columns: [{
        id, name,
        totalsRowLabel?, totalsRowFunction?,   // 'sum'|'average'|'count'|'min'|'max'|…
        _extras?
    }],
    tableStyleInfo?: {
        name?, showFirstColumn?, showLastColumn?,
        showRowStripes?, showColumnStripes?
    },
    autoFilter?: { ref },
    _extras?: [xmlNode]
}
```

## Examples

### Table with a style and a totals row

```js
const t = runtime.resolve('xlsxTables');
const tbl = {
    id: 1, name: 'Sales', displayName: 'Sales', ref: 'A1:C5',
    headerRowCount: 1,
    totalsRowCount: 1,
    columns: [
        { id: 1, name: 'Region' },
        { id: 2, name: 'Q1', totalsRowFunction: 'sum' },
        { id: 3, name: 'Q2', totalsRowFunction: 'sum' }
    ],
    tableStyleInfo: { name: 'TableStyleMedium2', showRowStripes: true },
    autoFilter: { ref: 'A1:C5' }
};
const xmlText = t.serialize(tbl);
// Add it with `workbook.tables.push(tbl)` and reference it from the sheet
// through `sheet.tableRefs = [1]`.
```

## Notes

- `name` must be unique within the workbook; a collision makes Excel reject the file.
- `ref` must span the header + data + totals rows when present.
- `totalsRowFunction` presupposes `totalsRowCount: 1`.
- `tableStyleInfo.name` references a built-in style (`TableStyleLight1`…`TableStyleDark11`, `TableStyleMedium1`…`28`) or a custom `cellStyles` entry.
- The sheet must list the table in `<tableParts>` AND keep its cells consistent (no merge spanning header and data, and so on).
- A root other than `<table>` raises `ParseError('xlsx/tables-bad-root')`.

## See also

- [xlsx](./xlsx.md) — `workbook.tables` + `sheet.tableRefs`.
- [xlsx-styles](./styles.md) — `cellStyles` for custom styles.
