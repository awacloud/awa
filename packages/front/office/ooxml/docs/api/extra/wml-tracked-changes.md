---
module: wmlTrackedChanges
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# wmlTrackedChanges

> WML — extended tracked-change types beyond the core `<w:ins>`/`<w:del>`.

**Module** `wmlTrackedChanges` | **Source** `packages/front/office/ooxml/src/extra/wml-tracked-changes.js` | **Deps** `xml` | **Worker-safe** yes

Adds parser/renderer support for the secondary revision elements: `*Change` snapshot wrappers (`<w:pPrChange>`, `<w:rPrChange>`, `<w:tblPrChange>`, `<w:tblPrExChange>`, `<w:trPrChange>`, `<w:tcPrChange>`, `<w:sectPrChange>`, `<w:tblGridChange>`, `<w:numberingChange>`), range markers (`customXml*RangeStart`/`End`, `move*RangeStart`/`End`), cell ops (`<w:cellMerge>`, `<w:cellIns>`, `<w:cellDel>`), and the `<w:moveFrom>`/`<w:moveTo>` block wrappers.

## Resolve

```js
const ext = wmlTrackedChanges.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseChange` / `renderChange` | `(el) => Change` / `(c) => xmlNode` | generic `*Change` parser — `{ kind, id, author?, date?, snapshot? }`; `snapshot` is the raw previous-state child (`w:pPr`, `w:rPr`, …) per `CHANGE_SNAPSHOTS[el.name]`, kept unparsed |
| `parseRange` / `renderRange` | `(el) => RangeMarker` / `(r) => xmlNode` | generic range-marker parser — `{ kind, ...attrs }` (no children) |
| `parseCellChange` / `renderCellChange` | `(el) => CellChange` / `(c) => xmlNode` | generic cell-op parser — `{ kind, ...attrs }` for `cellMerge`/`cellIns`/`cellDel` |
| `parseMoveBlock` / `renderMoveBlock` | `(el) => MoveBlock` / `(b) => xmlNode` | `{ kind, id, author?, date?, children[] }` for `moveFrom`/`moveTo`/`ins`/`del` |
| `CHANGE_TAGS` / `RANGE_TAGS` / `CELL_TAGS` | `string[]` | the known tag names (without `w:` prefix) per family |
| `CHANGE_SNAPSHOTS` | `Record<string, string\|null>` | `w:*Change` tag → its expected snapshot child tag (`null` for `w:numberingChange`, which has none) |

There is no `parseRevision`/`renderRevision`, and no per-type `parseRPrChange`/`parsePPrChange` — a single `parseChange` dispatches on `el.name` for every `*Change` tag, leaving the snapshot child raw (unparsed) rather than typing it.

## Elements typed

`moveFrom`, `moveTo`, `ins`, `del`, `moveFromRangeStart`/`End`, `moveToRangeStart`/`End`, `customXmlInsRangeStart`/`End`, `customXmlDelRangeStart`/`End`, `customXmlMoveFromRangeStart`/`End`, `customXmlMoveToRangeStart`/`End`, `pPrChange`, `rPrChange`, `tblPrChange`, `tblPrExChange`, `trPrChange`, `tcPrChange`, `sectPrChange`, `tblGridChange`, `numberingChange`, `cellIns`, `cellDel`, `cellMerge`.

## Roundtrip example

```js
const ext = wmlTrackedChanges.factory(xml);
const el  = xml.parse('<w:rPrChange xmlns:w="..." w:id="3" w:author="A" w:date="2024-01-01T00:00:00Z"><w:rPr><w:b/></w:rPr></w:rPrChange>');
const change = ext.parseChange(el);
// → { kind:'rPrChange', id:'3', author:'A', date:'2024-01-01T00:00:00Z', snapshot: <w:rPr xmlNode, raw> }
```

## Notes

- `moveFrom` / `moveTo` mirror `ins` / `del` shape and can carry runs.
- Helpers do not auto-attach to the document tree; consumers locate them via the existing `_extras` slot inside paragraphs / cells.

## See also

- [docxStructure](../docx/structure.md) — base `ins`/`del` model
