---
module: dmlTextDetails
category: extra
dependencies: [xml, ooxmlShared, docxProperties, drawingml, dmlEffects, dmlFillsAdvanced]
returns: object
worker-safe: true
status: complete
---

# dmlTextDetails

> DrawingML text details and the theme's script fonts that the pptx core leaves in `_extras`. A pptx walker extension, in [`pptx-full`](../bundles/pptx-full.md).

**Module** `dmlTextDetails` | **Source** `packages/front/office/ooxml/src/extra/dml-text-details.js` | **Deps** `xml`, `ooxmlShared`, `docxProperties`, `drawingml`, `dmlEffects`, `dmlFillsAdvanced` | **Worker-safe** yes

Registered through [`pptx-full`](../bundles/pptx-full.md), or with `pptx.use(...)`, it types the text details of slides, layouts, masters and their table cells, and the theme's per-script fonts. Each element is typed under this module's field names, and only when it is written back as read (`docxProperties.hydrateLossless`). Any other element stays in `_extras`.

## Resolve

```js
const ext = runtime.resolve('dmlTextDetails');
// Returns the walker hooks: hydrate/dehydrate RunProperties,
// ParagraphProperties, Paragraph, Theme.
```

## Fields typed

| Where | Field | From |
|-------|-------|------|
| a run's `rPr` (and a paragraph's `pPr.defRPr`) | `solidFill`, `highlight` (a colour) | `<a:solidFill>` the core leaves (a scheme colour, a colour with transforms), `<a:highlight>` |
| a run's `rPr` | `effectLst` (`dmlEffects.parseEffectLst`), `gradFill` (`dmlFillsAdvanced.parseGradFill`) | `<a:effectLst>`, `<a:gradFill>` |
| a run's `rPr` | `ea`, `cs`, `sym`, `hlinkClick`, `hlinkMouseOver` (attributes) | the childless elements |
| a run's `rPr` | `uFillTx`, `uLnTx`, `noFill` (`true`) | the empty elements |
| a paragraph's `pPr` | `lnSpc`, `spcBef`, `spcAft` (`{ pct }` or `{ pts }`) | `<a:spcPct>` / `<a:spcPts>` inside them |
| a paragraph's `pPr` | `buClr` (a colour), `buSzPct`, `buSzPts` (numbers), `buFont` (attributes) | the bullet's elements |
| a paragraph's `pPr` | `buClrTx`, `buSzTx`, `buFontTx` (`true`) | the empty elements |
| a paragraph's `pPr` | `tabLst: [{ pos, algn }]` | `<a:tabLst>` |
| a paragraph | `endParaRPr` | `<a:endParaRPr>`, the paragraph's last leftover |
| the theme | `fontScheme.majorFont.fonts`, `fontScheme.minorFont.fonts`: `[{ script, typeface, … }]` | `<a:font>` |

A colour is the shared DrawingML colour codec's: `{ kind, attrs, mods }`, its transforms kept.

`endParaRPr` is a run's properties as the core types them, with these details:

- its colours are typed (`typedRunColors`);
- its other attributes are kept in `extraAttrs`;
- an `<a:latin>` whose attributes go beyond its typeface is kept whole in `latin`;
- its children's details are typed as a run's.

## Notes

- **Left raw.** These are not written back as read once typed:
  - a run's `<a:ln>` and `<a:uFill>`;
  - a bullet picture (`<a:buBlip>`);
  - a hyperlink with children;
  - an `endParaRPr` whose colour is a lower-case hex value (the core writes it in upper case).
- **Why only `pptx-full`.** Moving these fields into [`pptx-large`](../bundles/pptx-large.md) would change what its readers (oview) find in `_extras`.

## See also

- [pptxWalker](../pptx/pptx-walker.md) — the hooks and what they visit.
- [wmlDocumentDetails](./wml-document-details.md) — the docx counterpart, in `docx-full`.
