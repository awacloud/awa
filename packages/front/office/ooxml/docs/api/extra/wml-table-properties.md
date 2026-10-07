---
module: wmlTableProperties
category: extra
dependencies: [xml, docxProperties]
returns: object
worker-safe: true
status: complete
---

# wmlTableProperties

> WML — typed table / row / cell properties (`<w:tblPr>`, `<w:trPr>`, `<w:tcPr>`).

**Module** `wmlTableProperties` | **Source** `packages/front/office/ooxml/src/extra/wml-table-properties.js` | **Deps** `xml`, `docxProperties` | **Worker-safe** yes

Adds ~30 typed children to the table / row / cell property bags : `tblBorders`, `tblCellMar`, `tblLook`, `tblLayout`, `tblpPr`, `tblOverlap`, `cantSplit`, `tblHeader`, `trHeight`, `wAfter`/`wBefore`, `tcBorders`, `tcMar`, `vAlign`, `noWrap`, `hideMark`, `tcFitText`, `cnfStyle`.

> **Core subset.** The core (`docxStructure` / `docxStyles`) types a small subset of `<w:tblPr>` itself: `style`, `width`, `borders` (see [docx-properties](../docx/properties.md)). Under this extension `hydrateTable` re-renders the core-typed bag to `<w:tblPr>` (core's `_extras` are the verbatim remainder) and re-parses it with `parseTblPr`, so the hydrated `table.tblPr` has exactly the shape documented here (`tblStyle`, string widths, `jc`, `tblLayout`, `tblLook`, `indent`, `cellMargins`, ...); `dehydrateTable` also accepts the core spelling `style` for a composer-authored, never-hydrated bag. A border edge's attributes this extension does not name (`themeTint`, `themeShade`, ...) ride in the edge's `extraAttrs` (same key and full-attribute-name convention as core's `Border`) and are re-emitted verbatim.

## Resolve

```js
const ext = wmlTableProperties.factory(xml, props);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `hydrateTable` / `dehydrateTable` | `(table) => table` | typed `tblPr` (in-place; recurses into rows) |
| `hydrateRow` / `dehydrateRow` | `(row) => row` | typed `trPr` (in-place; recurses into cells) |
| `hydrateTcPr` / `dehydrateTcPr` | `(tcPr) => tcPr` | typed cell-pr bag (promotes fields out of `tcPr._extras`) |
| `parseTblPr` / `renderTblPr` | `(el) => TblPr \| undefined` / `(t) => xmlNode \| null` | `<w:tblPr>` |
| `parseTrPr` / `renderTrPr` | `(el) => TrPr \| undefined` / `(t) => xmlNode \| null` | `<w:trPr>` |
| `parseBorders` / `renderBorders` | `(el) => Borders \| undefined` / `(parentName, b) => xmlNode \| null` | shared border-bag codec for `tblBorders`/`tcBorders`/`pBdr` — `renderBorders` needs the parent tag name; there is no separate `parseTcBorders`/`renderTcBorders` |
| `parseMargins` / `renderMargins` | `(el) => Margins \| undefined` / `(parentName, m) => xmlNode \| null` | shared margin-bag codec for `tblCellMar`/`tcMar` |

## Hooks

| Hook | Triggered on |
|------|--------------|
| `hydrateTable` | every `table` node after `read()` |
| `hydrateRow` | every `row` node |
| `hydrateTcPr` | every cell's `tcPr` |
| `dehydrateTable` / `dehydrateRow` / `dehydrateTcPr` | mirror, before `write()` |

## Roundtrip example

```js
const ext = wmlTableProperties.factory(xml, props);
docx.use(ext);

const result = docx.read(bytes);
// each cell.tcPr now has typed .borders, .vAlign, .mar, …
result.document.body[0].rows[0].cells[0].tcPr.vAlign;     // 'center'
result.document.body[0].rows[0].cells[0].tcPr.borders.top; // { val:'single', sz:4, color:'000000' }
```

## Notes

- Border bags share the shape `{ val, sz, color, space?, themeColor? }`.
- `tblpPr` carries floating-table positioning (relative anchors).

## See also

- [docxStructure](../docx/structure.md) — table node shape
- [wml-paragraph-formatting](./wml-paragraph-formatting.md)
