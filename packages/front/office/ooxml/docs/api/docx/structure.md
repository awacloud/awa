---
module: docxStructure
category: ooxml/docx
dependencies: [xml, docxProperties, docxDrawing, ooxmlMath]
returns: object
worker-safe: true
status: complete
---

# docxStructure

> WordprocessingML structural elements — runs, hyperlinks, paragraphs, tables, sections, SDTs.

**Module** `docxStructure` | **Source** `packages/front/office/ooxml/src/docx/structure.js` | **Deps** `xml`, `docxProperties`, `docxDrawing`, `ooxmlMath` | **Worker-safe** yes

Every structural element has a `parse<Name>` / `render<Name>` pair that round-trips its XML. Unknown children of a container land in `_extras`. The model is uniform: every node carries a `type` and a `children` (or `body` / `cells` / `rows`).

## Resolve

```js
const s = runtime.resolve('docxStructure');
// Returns: { parseRun, renderRun,
//            parseHyperlink, renderHyperlink,
//            parseParagraph, renderParagraph,
//            parseTable, renderTable,
//            parseRow, renderRow,
//            parseCell, renderCell,
//            parseSection, renderSection,
//            parseSdt, renderSdt,
//            parseSdtProperties, renderSdtProperties,
//            parseBody, renderBodyChildren }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseRun` / `renderRun` | `(<w:r>)` / `(run)` | Run with typed `rPr` + children. |
| `parseHyperlink` / `renderHyperlink` | symmetric | `<w:hyperlink>`. |
| `parseParagraph` / `renderParagraph` | `<w:p>` | Full paragraph. |
| `parseTable` / `renderTable` | `<w:tbl>` | Table with a typed `tblPr` and rows. |
| `parseRow` / `renderRow` | `<w:tr>` | Row with cells. |
| `parseCell` / `renderCell` | `<w:tc>` | Cell with children. |
| `parseSection` / `renderSection` | `<w:sectPr>` | Section properties. `pageSize` (`w`, `h`) and `pageMargin` are in twips: a strict universal measure (`612pt`, `2.54cm`, `1in`, `6pc`) is converted on read, so the section is written back in integers. `pageSize.orient`, and `pageSize.code` (the `w:code` paper code, a number). An empty `<w:sectPr/>` reads as `{}` and is written back as the empty element; no `sectPr` writes none. |
| `parseSdt` / `renderSdt` | `<w:sdt>` | Structured Document Tag (templating). |
| `parseSdtProperties` / `renderSdtProperties` | `<w:sdtPr>` | SDT properties. |
| `parseBody` | `(<w:body>) => {body, sectPr, extras}` | Decomposed body. |
| `renderBodyChildren` | `(doc) => element[]` | `<w:body>` children (with `sectPr` last). |

## Model

```js
document := { type:'document', body:[paragraph|table|blockSdt|oMathPara|marker],
              sectPr?, background?,
              _extras? }   // any other body child, verbatim, before sectPr

background := { color?, themeColor?, themeTint?, themeShade?,   // <w:background>
                _extras?: [xmlNode] }   // its v:background / drawing, verbatim

paragraph := { type:'paragraph', pPr?, children:[inline], paraId?, textId?, _extras? }

inline := run | hyperlink | sdt | fldSimple | oMath | revision | marker

marker := bookmarkStart | bookmarkEnd | commentRangeStart | commentRangeEnd
        | rangeMarker              // inline, or between blocks (body, cell,
                                   // a block SDT's content)

bookmarkStart := { type:'bookmarkStart', id, name?, colFirst?, colLast?: number,
                   displacedByCustomXml? }
bookmarkEnd | commentRangeStart | commentRangeEnd
              := { type, id, displacedByCustomXml? }

rangeMarker := { type:'rangeMarker', name, attrs }   // range markup with no type
               // of its own: moveFrom/moveTo/customXml…RangeStart|End,
               // permStart, permEnd, proofErr; attrs verbatim

revision := { type:'ins'|'del'|'moveFrom'|'moveTo', id, author?, date?,
              children:[inline],         // typed like a paragraph's
              _extras?: [xmlNode] }      // any other child, verbatim

run := { type:'run', rPr?, children:[textRun|breakRun|tabRun|drawing|…] }

textRun  := { type:'text', value: string }
breakRun := { type:'break', kind?: 'page'|'column'|'line'|'textWrapping', clear?: string }   // clear: w:clear
tabRun   := { type:'tab' }
delText  := { type:'delText', value: string }   // inside <w:del>
commentReference := { type:'commentReference', id }
footnoteReference := { type:'footnoteReference', id, customMarkFollows?: boolean }   // endnoteReference alike
fldChar  := { type:'fldChar', kind:'begin'|'separate'|'end', dirty?, fldLock?,
              _extras?: [xmlNode] }    // <w:ffData> / <w:fldData> / <w:numberingChange>, verbatim
instrText := { type:'instrText', value: string }
footnoteReference / endnoteReference / softHyphen / noBreakHyphen — same shape

hyperlink := { type:'hyperlink', rId?, anchor?, target?, external?,
              tgtFrame?, tooltip?, docLocation?,   // strings, verbatim
              history?: boolean,                   // w:history (ST_OnOff), written 1 / 0
              children:[inline],         // typed like a paragraph's
              _extras?: [xmlNode] }      // any other child, verbatim
             // target / external: set by docx.read when the rId resolves in
             // the node's part, consumed by docx.write (see docx.md § Notes)

table := { type:'table',
           tblPr?: TableProperties,   // <w:tblPr>: style, width, borders, cellMargins
                                      // (see docxProperties; other tblPr
                                      // children live in tblPr._extras)
           _extras?: [xmlNode],       // <w:tblGrid> (and anything else), verbatim
           rows:[{ type:'row', sdt?:[SdtWrapper], paraId?, textId?,
                   cells:[{ type:'cell', sdt?:[SdtWrapper],
                            children:[paragraph|table|blockSdt|marker],
                            _extras?: [xmlNode] }] }] }

SdtWrapper := { group: number,            // unique within the row / table
                properties?: SdtProperties,
                _extras?: [xmlNode],      // <w:sdtEndPr>, verbatim
                _contentExtras?: [xmlNode] }  // other content children, verbatim

sdt      := { type:'sdt', properties?: SdtProperties,
              children:[inline],                     // inline, in a paragraph: typed as a paragraph's
              _extras?: [xmlNode],                   // <w:sdtEndPr>, verbatim
              _contentExtras?: [xmlNode] }           // other content children (w:proofErr), verbatim
blockSdt := { type:'blockSdt', properties?: SdtProperties,
              children:[paragraph|table|blockSdt],   // block, in the body or a cell
              _extras?: [xmlNode] }                  // <w:sdtEndPr>, verbatim

SdtProperties := { alias?, tag?, id?: number, showingPlcHdr?: boolean,
                   dataBinding?: { xpath?, prefixMappings?, storeItemID? },
                   kind?: 'text'|'richText'|'picture'|'dropDownList'|'comboBox'
                         |'date'|'checkbox'|'repeatingSection'|'repeatingSectionItem',
                   sectionTitle?: string,                  // repeatingSection only
                   doNotAllowInsertDeleteSection?: true,   // repeatingSection only
                   _kindNode?: xmlNode,   // dropDownList / comboBox / date / checkbox, verbatim
                   _extras?: [xmlNode] }  // any other <w:sdtPr> child, verbatim
```

## Examples

### Build a rich paragraph

```js
const s = runtime.resolve('docxStructure');
const para = {
    type: 'paragraph',
    pPr: { align: 'center' },
    children: [
        { type: 'run', rPr: { bold: true },
          children: [{ type: 'text', value: 'Title' }] },
        { type: 'run', children: [{ type: 'break', kind: 'line' }] },
        { type: 'run', children: [{ type: 'text', value: 'subtitle' }] }
    ]
};
s.renderParagraph(para);
```

### Parse a body

```js
const root = xml.parse('<w:body>…</w:body>');
const { body, sectPr, extras } = s.parseBody(root);
// body: Array<paragraph|table|…>, sectPr: SectionProperties|undefined
```

## Notes

- **Word's paragraph and row ids**: a paragraph's and a table row's `w14:paraId` / `w14:textId` read as `paraId` / `textId` (strings) when the read keeps the `w14` namespace (`docx.read`'s `extensions: 'keep'`; the default read drops it, so no field), and are written back on the `w:p` / `w:tr` — a paragraph holding only a display equation (`oMathPara`) keeps them too. `docx.write` writes each `paraId` once per part: a value an earlier paragraph or row of the part carries (a paragraph a consumer copied) is left off the later one (its `textId` is written). New paragraphs get none (Word assigns them). `withParaIds(fn)` sets that once-per-part scope around a render.
- **Tracked changes**: `<w:ins>`, `<w:del>`, `<w:moveFrom>` and `<w:moveTo>` are `revision` nodes, in place among the paragraph's children (ECMA-376 Part 1 § 17.13.5). A revision's children are typed exactly as a paragraph's — runs, hyperlinks, inline SDTs, simple fields, math, bookmark and comment-range markers and nested revisions — and any other child (`<w:smartTag>`, `<w:customXml>`, …) stays verbatim in the revision's own `_extras`, written after its typed children. Nothing inside a revision is dropped. `delText` stays distinct from `text`, so the two are never merged by accident. The `*PrChange` snapshots are the opt-in [`wmlTrackedChanges`](../extra/wml-tracked-changes.md)' concern; the move range markers are typed here (see Range markup).
- **Hyperlinks**: a `<w:hyperlink>` holds a paragraph's content (CT_Hyperlink, EG_PContent): its children are typed exactly as a paragraph's — runs, revisions, bookmark and comment-range markers, range markers, inline SDTs, simple fields, math — in place, and any other child (`<w:smartTag>`, …) stays verbatim in the hyperlink's own `_extras`, written after its typed children. A consumer that walks a hyperlink's `children` must type-check them, as for a paragraph's: they are not only runs. Only `r:id` and `w:anchor` are typed among its attributes.
- **Field characters**: a `<w:fldChar>` reads as `{ type:'fldChar', kind }` (`w:fldCharType`), with `dirty` and `fldLock` (`w:fldLock` on, ECMA-376 `ST_OnOff`) when set; its child — the `<w:ffData>` of a legacy form field (text input, check box, drop-down), a `<w:fldData>`, or the `<w:numberingChange>` of a tracked numbering change — stays verbatim in the node's `_extras` and is written back inside the element.
- **Range markup**: the twelve move and custom XML revision range markers (`w:moveFromRangeStart` / `End`, `w:moveToRangeStart` / `End`, `w:customXml{Ins,Del,MoveFrom,MoveTo}RangeStart` / `End`), the permission ranges (`w:permStart` / `w:permEnd`) and the proofing marks (`w:proofErr`) read as one `rangeMarker` node (`name` the local name, `attrs` verbatim) at their place — among a paragraph's, a revision's or a hyperlink's inline children, in the body, in a block SDT's content or in a table cell — and are written back there.
- **Bookmarks and comment ranges**: `w:bookmarkStart` / `w:bookmarkEnd` and `w:commentRangeStart` / `w:commentRangeEnd` read as their typed nodes wherever they stand — inline, and between blocks in the body (of the main document and of the story parts), in a block SDT's content and in a table cell — and are written back there. Besides `id` (and a bookmark's `name`) they keep `displacedByCustomXml` (`next` / `prev`) and a table-column bookmark's `colFirst` / `colLast` (numbers). A consumer that walks the body or a cell's children must type-check them: they are not only blocks. Markers between rows or between cells stay verbatim in the table's or the row's `_extras`, written after its rows or cells. A body child the model does not type is kept in `document._extras`, a block SDT content child in its `_contentExtras`, both verbatim.
- **Empty properties**: an empty `<w:rPr/>` or `<w:pPr/>` (and an empty paragraph-mark `<w:rPr/>`) reads as an empty object and is written back as the empty element; a run or paragraph with no `rPr` / `pPr` writes none.
- `commentReference` / `footnoteReference` / `endnoteReference` carry only an `id`; the content lives in the linked part.
- **Page background**: `<w:background>`, before `<w:body>` in the main part, reads as `document.background` (`docx.read`): its `w:color`, `w:themeColor`, `w:themeTint` and `w:themeShade` as strings, its children (a VML `<v:background>` with its fill, a drawing) verbatim in `_extras`. `docx.write` puts it back before the body, the root declaring the namespaces its children use; no `background` writes none. Word shows it only when the settings ask (`w:displayBackgroundShape`, carried with the settings).
- **Content controls around cells and rows**: a row-level `<w:sdt>` (CT_SdtCell) wraps cells, a table-level one (CT_SdtRow) wraps rows. Their cells (rows) are read **in place** among the row's cells (the table's rows), as ordinary `cell` (`row`) nodes, each carrying `sdt`: the controls around it, outermost first. A wrapper is `{ group, properties?, _extras?, _contentExtras? }`: `group` is unique within the row (the table), numbered in the order the controls open, and the items of one control share it; `properties` is the `<w:sdtPr>` read as a block control's; `_extras` keeps the control's other children (`<w:sdtEndPr>`) and `_contentExtras` any content child that is neither a cell (row) nor a control, both verbatim. The write puts consecutive items sharing a control back inside one `<w:sdt>` (its properties, `_extras`, then `<w:sdtContent>` with the items, the inner controls and `_contentExtras`), so every cell keeps its column. A control that wraps no cell (row) stays verbatim in the row's (table's) `_extras`. A consumer that walks `row.cells` sees every cell; one that ignores `sdt` reads the content without the control. A cell is written with an empty `<w:p/>` only when it holds no block-level content, typed or kept verbatim (`w:p`, `w:tbl`, `w:sdt`, `w:customXml`, `w:altChunk`): ECMA-376 requires some.
- **Tables**: `<w:tblPr>` is typed as `table.tblPr` (`style`, `width`, `borders`) and rendered first, then the grid, then the other `_extras`, then the rows. `CT_Tbl` requires `<w:tblPr>` and `<w:tblGrid>`: a table with no `tblPr` (typed or preserved) renders an empty `<w:tblPr/>`, and a table with no preserved `<w:tblGrid>` renders one derived from its rows — one `<w:gridCol>` per column of the widest row (a cell counts its `gridSpan`), with `w:w` only when a span-free row as wide as the grid gives every cell a `dxa` width. `<w:tblGrid>` and each row's `<w:trPr>` are NOT typed here: they stay verbatim in `_extras` (`table._extras` / `row._extras`); cell borders (`<w:tcBorders>`) stay in the cell's `tcPr._extras`. The opt-in [`wmlTableProperties`](../extra/wml-table-properties.md) promotes those.
- `oMathPara` nodes are delegated to [`ooxmlMath`](../math.md). **Block math**: the schema allows `<m:oMathPara>` only inside a `<w:p>`, so `renderBodyChildren` writes a body-level `oMathPara` node as a `<w:p>` with no `<w:pPr>` holding only that `<m:oMathPara>`, as Word does. `parseBody` reads that shape back as the body-level node: a `<w:p>` with no `<w:pPr>` whose only element child is one `<m:oMathPara>` (a bare body-level `<m:oMathPara>` reads the same way). Any other paragraph holding an `<m:oMathPara>` — with a `<w:pPr>`, a run or a bookmark beside it — stays a `paragraph` with the `<m:oMathPara>` in its `_extras`, and so does one inside a table cell or a block SDT. The same applies to the story parts (headers, footers, notes, comments), which share `parseBody` / `renderBodyChildren`.
- Drawings are delegated to [`docxDrawing`](./drawing.md).
- SDTs (Structured Document Tags) type the `alias`, `tag`, `id`, `showingPlcHdr` and `dataBinding` children of `<w:sdtPr>` plus the `kind` element; anything else (`<w:placeholder>`, `<w:rPr>`, `<w:lock>`, …) stays verbatim in `properties._extras` — see [templating](./templating.md).
- **Repeating sections** are a Word 2012 extension ([MS-DOCX] §2.5.1.10, §2.5.1.11, §2.5.3.8), not ECMA-376 elements. `parseSdtProperties` reads `<w15:repeatingSection>` as `kind: 'repeatingSection'`, its `<w15:sectionTitle w:val>` child as `sectionTitle` and its `<w15:doNotAllowInsertDeleteSection>` child (on/off: an absent `w:val`, `1`, `true` or `on` mean on) as `doNotAllowInsertDeleteSection: true`; `<w15:repeatingSectionItem/>` reads as `kind: 'repeatingSectionItem'`. The legacy main-namespace form (`<w:repeatingSection w:sectionTitle="…"/>`, `<w:repeatingSectionItem/>`) is still read. `renderSdtProperties` writes the `w15` elements only, title before the lock; declaring the `w15` namespace on the part root is the caller's job (`docx.write` does it for `word/document.xml`).

## See also

- [docx](./docx.md) — top-level orchestrator.
- [docx-properties](./properties.md) — delegated formatting.
- [math](../math.md) — inline and block math.
