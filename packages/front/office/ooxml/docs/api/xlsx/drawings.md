---
module: xlsxDrawings
category: ooxml/xlsx
dependencies: [ooxmlErrors, xml, drawingmlShape, drawingml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# xlsxDrawings

> Drawing parts — `xl/drawings/drawing*.xml` (§20.5). twoCell/oneCell/absolute anchors for images, charts and shapes.

**Module** `xlsxDrawings` | **Source** `packages/front/office/ooxml/src/xlsx/drawings.js` | **Deps** `ooxmlErrors`, `xml`, `drawingmlShape`, `drawingml`, `ooxmlShared` | **Worker-safe** yes

Excel anchors images/charts/shapes through a separate drawing part. The sheet references it with `<drawing r:id=…/>`. The drawing part holds anchors wrapping an `<xdr:graphicFrame>` (charts/SmartArt), an `<xdr:pic>` (images) or an `<xdr:sp>` (shapes). The links to chart parts (`xl/charts/chart*.xml`) and media (`xl/media/image*.<ext>`) live in the drawing's own `.rels`, not the sheet's.

## Resolve

```js
const dr = runtime.resolve('xlsxDrawings');
// Returns: { parse, serialize, bytesOf,
//            parseAnchor, renderAnchor,
//            parseGraphicFrame, renderGraphicFrame,
//            parsePic, renderPic,
//            twoCell, oneCell,
//            REL_TYPE_DRAWING, CT_DRAWING, CHART_URI,
//            XDR_NS, A_NS, R_NS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(text\|bytes) => { entries, _extras? }` | Typed model of the part. |
| `serialize` | `(obj) => string` | `<xdr:wsDr>` XML. |
| `bytesOf` | `(obj) => Uint8Array` | UTF-8 bytes. |
| `parseAnchor` / `renderAnchor` | symmetric | Anchor (twoCell/oneCell/absolute). |
| `parseGraphicFrame` / `renderGraphicFrame` | symmetric | Charts / SmartArt. |
| `parsePic` / `renderPic` | symmetric | Images. |
| `twoCell` | `({from, to, editAs?}) => anchor` | Two-cell anchor builder. |
| `oneCell` | `({from, ext}) => anchor` | One-cell anchor + EMU extent. |
| `REL_TYPE_DRAWING`, `CT_DRAWING`, `CHART_URI`, `XDR_NS`, `A_NS`, `R_NS` | string | OPC / namespace bindings. |

## Model

The **part** model returned by `parse` is `{ entries: [...], _extras? }`. The
**sheet-level** model consumed and produced by [`xlsx`](./xlsx.md) is the flat
`sheet.drawings` array of resolved entries:

```js
sheet.drawings: [{
    anchor: {
        kind: 'twoCell'|'oneCell'|'absolute',
        editAs?: 'oneCell'|'absolute'|'twoCell',
        from: { col, colOff, row, rowOff },
        to?:  { col, colOff, row, rowOff },    // twoCell
        ext?: { cx, cy },                      // oneCell + absolute
        pos?: { x, y }                         // absolute
    },
    cx?, cy?, offsetX?, offsetY?,
    id?, name?, description?, title?, prstGeom?,

    // Exactly one payload per entry:
    chart?:      chartObject,                  // parsed drawingmlChart spec
    image?:      { data: Uint8Array, contentType, rId },
    shapeProps?: shapePropsObject,             // drawingmlShape, plus txBody?
    _node?:      xmlNode                       // unmodelled graphicFrame, verbatim
}]
```

Inside the part itself an entry additionally carries `type`
(`'chart'|'picture'|'shape'|'graphicFrame'`) plus the raw `chartRef` /
`embedRef` relationship ids; `xlsx.read` resolves those into `chart` / `image`
and `xlsx.write` re-allocates them.

## Examples

### Two-cell anchored image

```js
const dr = runtime.resolve('xlsxDrawings');
sheet.drawings = [{
    anchor: dr.twoCell({
        from: { col: 1, colOff: 0, row: 1, rowOff: 0 },
        to:   { col: 5, colOff: 0, row: 10, rowOff: 0 }
    }),
    image: { data: pngBytes, contentType: 'image/png' },
    name: 'Logo',
    prstGeom: 'rect'
}];
// xlsx.write stores the bytes in pkg.parts['/xl/media/image1.png'] and adds
// the relationship to drawing1.xml.rels.
```

### One-cell anchored chart

```js
sheet.drawings.push({
    anchor: dr.oneCell({
        from: { col: 0, colOff: 0, row: 15, rowOff: 0 },
        ext: { cx: 5486400, cy: 3200400 }   // ~6×3.5in
    }),
    chart: chartMod.barChart({ series: [/* … */] })
});
```

## Notes

- Anchor coordinates: `colOff` / `rowOff` are EMU (1/914400 inch) **within the cell**.
- `editAs` controls what happens when the user inserts/deletes cells (`'oneCell'` = moves with the top-left cell, `'absolute'` = stays put, `'twoCell'` = resizes).
- `absolute` anchors (rare) carry only `pos: {x,y}` + `ext`.
- For SmartArt and other unmodelled `graphicFrame` payloads, the content under `<a:graphicData>` is preserved verbatim in `_node`.
- A root other than `<xdr:wsDr>` raises `ParseError('xlsx/drawings-bad-root')`.

## See also

- [drawingml-chart](../drawingml/chart.md) — the attached chart spec.
- [drawingml-shape](../drawingml/shape.md) — shape props for `<xdr:sp>`.
- [xlsx](./xlsx.md) — orchestrator (`sheet.drawings`).
