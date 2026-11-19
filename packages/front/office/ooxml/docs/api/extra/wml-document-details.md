---
module: wmlDocumentDetails
category: extra
dependencies: [xml, docxProperties, docxStructure]
returns: object
worker-safe: true
status: complete
---

# wmlDocumentDetails

> WML — the docx body's, sections' and settings' details the core and `docx-large`'s hooks leave in `_extras`. A docx walker extension, in [`docx-full`](../bundles/docx-full.md).

**Module** `wmlDocumentDetails` | **Source** `packages/front/office/ooxml/src/extra/wml-document-details.js` | **Deps** `xml`, `docxProperties`, `docxStructure` | **Worker-safe** yes

Registered after [`docx-large`](../bundles/docx-large.md)'s extras (through [`docx-full`](../bundles/docx-full.md), or `docx.use(...)`), it types what their hooks leave, under its own field names, each element only when it is written back as read (`docxProperties.hydrateLossless`); any other stays in `_extras`. Its dehydrate hooks run before `docx-large`'s (the walker dehydrates in reverse registration order).

## Resolve

```js
const ext = runtime.resolve('wmlDocumentDetails');
// Returns the walker hooks: hydrate/dehydrate RunProperties, ParagraphProperties,
// TcPr, Row, Section, Settings.
```

## Fields typed

| Where | Field | From |
|-------|-------|------|
| a run's `rPr` | `rtl` (boolean), `spacing` (number, character spacing) | `<w:rtl>`, `<w:spacing>` |
| a paragraph mark's `rPr` | `markDel`, `markIns`, `markMoveFrom`, `markMoveTo` (attributes) | the mark's revisions |
| a run's `rPr` | `rPrChange: { id, author, date, …, rPr }` | `<w:rPrChange>`, the former properties parsed by `docxProperties` |
| a paragraph's `pPr` | `shd` (attributes), `pBdr: { top: {…}, … }`, `sectPr` (`docxStructure.parseSection`, `{}` when empty), `pPrChange: { …, pPr }` | `<w:shd>`, `<w:pBdr>`, the paragraph's own `<w:sectPr>`, `<w:pPrChange>` |
| a cell's `tcPr` | `shd` (attributes) | `<w:shd>` |
| a row | `tblPrEx` (table properties) | `<w:tblPrEx>` |
| a section (the body's, a paragraph's) | `docGrid`, `pgNumType`, `lnNumType`, `pgBorders`, `paperSrc` (attributes), `cols: { …, col: [{…}] }`, `textDirection`, `vAlign` (strings), `formProt`, `noEndnote`, `bidi`, `rtlGutter`, `titlePg` (booleans), `footnotePr`, `endnotePr` (groups) | their elements |
| settings | `mathPr: { mathFont: 'Cambria Math', dispDef: true, … }`, `toggles: { name: boolean }` (every remaining `w:` toggle) | `<m:mathPr>`, the toggles |
| settings' `compat` | `toggles: { name: boolean }` | its legacy toggles |

Attribute objects keep the values as read, the `w:` prefix dropped from their names.

## Notes

- Left raw, as their write would move them: a row `trPr`'s children (`wmlTableProperties` writes its own fields first) and the `w14:` / `w15:` settings the core's settings sequence does not list.
- Moving these fields into [`docx-large`](../bundles/docx-large.md) would change what its readers find in `_extras`.

## See also

- [docxWalker](../docx/docx-walker.md) — the hooks and their order.
- [wmlStyleDetails](./wml-style-details.md) — the styles' and numbering's details, also in `docx-full`.
