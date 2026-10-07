---
module: pptxTable
category: ooxml/pptx
dependencies: [xml, drawingml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# pptxTable

> Slide tables — `<p:graphicFrame>` wrapping `<a:tbl>` (§19.3.1.21 + §20.1.4).

**Module** `pptxTable` | **Source** `packages/front/office/ooxml/src/pptx/table.js` | **Deps** `xml`, `drawingml`, `ooxmlShared` | **Worker-safe** yes

Slide tables live in `<p:spTree>` but are wrapped in a `<p:graphicFrame>` because they use the generic DrawingML graphic mechanism. Cells become typed text bodies through `drawingml`.

## Resolve

```js
const tbl = runtime.resolve('pptxTable');
// Returns: { parseTable, renderTable,
//            parseRow, renderRow,
//            parseCell, renderCell,
//            parseGraphicFrame, renderGraphicFrame,
//            tableFromRows,
//            TABLE_GRAPHIC_URI, A_NS, R_NS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseTable` / `renderTable` | `<a:tbl>` | Typed model. |
| `parseRow` / `renderRow` | `<a:tr>` | Row. |
| `parseCell` / `renderCell` | `<a:tc>` | Cell with a `txBody`. |
| `parseGraphicFrame` / `renderGraphicFrame` | `<p:graphicFrame>` | Host wrapper. |
| `tableFromRows` | `(rows: any[][], opts?) => tableShape` | 2D builder. |
| `TABLE_GRAPHIC_URI`, `A_NS`, `R_NS` | string | Bindings. |

### `tableFromRows` options

| Option | Default |
|--------|---------|
| `colWidth` | `6000000 / ncols` EMU |
| `cx` / `cy` | `ncols * colWidth` / `rows.length * 370840` EMU |
| `offsetX` / `offsetY` | `0` |
| `tableStyleId` | none |
| `flags` | `{ firstRow: true, bandRow: true }` for a non-empty table |

## Model

```js
{
    type: 'table',
    id?, name?,
    cx, cy,
    offsetX?, offsetY?,
    tableStyleId?: '{GUID}',                  // built-in style
    flags?: {
        firstRow?, lastRow?,
        firstCol?, lastCol?,
        bandRow?, bandCol?
    },
    columns: [{ width: number }],             // EMU
    rows: [{
        height: number,                       // EMU
        cells: [{
            txBody?: textBody,                // drawingml.parseTextBody
            gridSpan?, rowSpan?,
            hMerge?, vMerge?,
            tcPr?: xmlNode,
            _extras?
        }]
    }],
    _extras?
}
```

## Examples

### Simple 3×3 table

```js
const tbl = runtime.resolve('pptxTable');
const table = tbl.tableFromRows([
    ['Name', 'Q1', 'Q2'],
    ['Alice', 95, 110],
    ['Bob',   80, 100]
], { cx: 5486400, cy: 1828800,         // ~6×2"
     offsetX: 914400, offsetY: 914400,
     flags: { firstRow: true, bandRow: true } });
slide.shapes.push(table);   // a parsed slide exposes `shapes` directly
```

### Rich cell

```js
const cell = { txBody: dml.textBodyFromString('') };
cell.txBody.paragraphs = [{
    runs: [
        { type: 'text', value: 'Important', rPr: { bold: true, color: 'CC0000' } }
    ]
}];
```

## Notes

- `tableStyleId` must be a GUID referencing a built-in PowerPoint style (around 40 exist, e.g. `'{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}'` = Medium Style 2 - Accent 1).
- Without a `tableStyleId`, supply explicit `tcPr` values or PowerPoint renders an unstyled table.
- `gridSpan` / `rowSpan` sit on the master cell; the hidden cells carry `hMerge: true` / `vMerge: true` (and an empty `txBody`).
- Widths and heights are EMU. 914400 EMU = 1 inch.

## See also

- [drawingml](../drawingml/drawingml.md) — the text bodies inside cells.
- [pptx-slide](./slide.md) — host; tables are mixed into the slide's `shapes` array.
