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
| `parseSection` / `renderSection` | `<w:sectPr>` | Section properties. |
| `parseSdt` / `renderSdt` | `<w:sdt>` | Structured Document Tag (templating). |
| `parseSdtProperties` / `renderSdtProperties` | `<w:sdtPr>` | SDT properties. |
| `parseBody` | `(<w:body>) => {body, sectPr, extras}` | Decomposed body. |
| `renderBodyChildren` | `(doc) => element[]` | `<w:body>` children (with `sectPr` last). |

## Model

```js
document := { type:'document', body:[paragraph|table|blockSdt|oMathPara],
              sectPr?, _extras? }

paragraph := { type:'paragraph', pPr?, children:[run|hyperlink|sdt],
               _extras? }

run := { type:'run', rPr?, children:[textRun|breakRun|tabRun|drawing|…] }

textRun  := { type:'text', value: string }
breakRun := { type:'break', kind?: 'page'|'column'|'line' }
tabRun   := { type:'tab' }
delText  := { type:'delText', value: string }   // inside <w:del>
commentReference := { type:'commentReference', id }
footnoteReference / endnoteReference / softHyphen / noBreakHyphen — same shape

hyperlink := { type:'hyperlink', rId?, anchor?, target?, external?, children:[run] }
             // target / external: set by docx.read when the rId resolves in
             // the node's part, consumed by docx.write (see docx.md § Notes)

table := { type:'table',
           tblPr?: TableProperties,   // <w:tblPr>: style, width, borders, cellMargins
                                      // (see docxProperties; other tblPr
                                      // children live in tblPr._extras)
           _extras?: [xmlNode],       // <w:tblGrid> (and anything else), verbatim
           rows:[{ type:'row',
                   cells:[{ type:'cell',
                            children:[paragraph|table] }] }] }

sdt      := { type:'sdt', properties?: SdtProperties,
              children:[run|hyperlink|sdt] }          // inline, in a paragraph
blockSdt := { type:'blockSdt', properties?: SdtProperties,
              children:[paragraph|table|blockSdt] }   // block, in the body

SdtProperties := { alias?, tag?, id?: number, showingPlcHdr?: true,
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

- `<w:ins>` / `<w:del>` (tracked changes) are parsed but their children are flattened into the parent run; `delText` stays distinct from `text` so the two are never merged by accident.
- `commentReference` / `footnoteReference` / `endnoteReference` carry only an `id`; the content lives in the linked part.
- **Tables**: `<w:tblPr>` is typed as `table.tblPr` (`style`, `width`, `borders`) and rendered first, then `_extras` (so a preserved `<w:tblGrid>` still precedes the rows), then the rows. A table with no `tblPr` renders no `<w:tblPr>` (byte-identical to before). `<w:tblGrid>` and each row's `<w:trPr>` are NOT typed here: they stay verbatim in `_extras` (`table._extras` / `row._extras`); cell borders (`<w:tcBorders>`) stay in the cell's `tcPr._extras`. The opt-in [`wmlTableProperties`](../extra/wml-table-properties.md) promotes those.
- `oMathPara` nodes are delegated to [`ooxmlMath`](../math.md).
- Drawings are delegated to [`docxDrawing`](./drawing.md).
- SDTs (Structured Document Tags) type the `alias`, `tag`, `id`, `showingPlcHdr` and `dataBinding` children of `<w:sdtPr>` plus the `kind` element; anything else (`<w:placeholder>`, `<w:rPr>`, `<w:lock>`, …) stays verbatim in `properties._extras` — see [templating](./templating.md).
- **Repeating sections** are a Word 2012 extension ([MS-DOCX] §2.5.1.10, §2.5.1.11, §2.5.3.8), not ECMA-376 elements. `parseSdtProperties` reads `<w15:repeatingSection>` as `kind: 'repeatingSection'`, its `<w15:sectionTitle w:val>` child as `sectionTitle` and its `<w15:doNotAllowInsertDeleteSection>` child (on/off: an absent `w:val`, `1`, `true` or `on` mean on) as `doNotAllowInsertDeleteSection: true`; `<w15:repeatingSectionItem/>` reads as `kind: 'repeatingSectionItem'`. The legacy main-namespace form (`<w:repeatingSection w:sectionTitle="…"/>`, `<w:repeatingSectionItem/>`) is still read. `renderSdtProperties` writes the `w15` elements only, title before the lock; declaring the `w15` namespace on the part root is the caller's job (`docx.write` does it for `word/document.xml`).

## See also

- [docx](./docx.md) — top-level orchestrator.
- [docx-properties](./properties.md) — delegated formatting.
- [math](../math.md) — inline and block math.
