---
module: wmlStyleDetails
category: extra
dependencies: [xml, docxProperties]
returns: object
worker-safe: true
status: complete
---

# wmlStyleDetails

> WML — the `styles.xml` and `numbering.xml` details the core keeps raw: a style's flags and names, a table style's conditional formats, the latent styles; the numbering's ids, links and level details. A docx walker extension, in [`docx-full`](../bundles/docx-full.md).

**Module** `wmlStyleDetails` | **Source** `packages/front/office/ooxml/src/extra/wml-style-details.js` | **Deps** `xml`, `docxProperties` | **Worker-safe** yes

Registered on a `docx` instance (`docx.use(...)`, or through [`docx-full`](../bundles/docx-full.md) — not [`docx-large`](../bundles/docx-large.md), whose readers read these elements in `_extras`), it types on every `read()` and writes back on every `write()`, through the walker's `hydrateStyles` / `dehydrateStyles` and `hydrateNumbering` / `dehydrateNumbering` hooks. Each element is typed only when it is written back as read (`docxProperties.hydrateLossless`); any other stays in `_extras`.

## Resolve

```js
const ext = runtime.resolve('wmlStyleDetails');
// Returns: { hydrateStyles, dehydrateStyles,
//            hydrateNumbering, dehydrateNumbering,
//            parseTblStylePr, renderTblStylePr,
//            parseLatentStyles, renderLatentStyles }
```

## API

| Member | Signature | Returns |
|---------|-----------|----------|
| `hydrateStyles` / `dehydrateStyles` | `(styles) => styles` | Walker hooks: type the part's `latentStyles` and each style's fields; `dehydrateStyles` returns a new part object with them back in `_extras`. |
| `hydrateNumbering` / `dehydrateNumbering` | `(numbering) => numbering` | Walker hooks on the core's numbering model: type the part's, abstract numberings' and levels' details (see below); `dehydrateNumbering` returns a new part object with them back in `_extras`. |
| `parseTblStylePr` / `renderTblStylePr` | `(el) => TblStylePr` / `(t) => xmlNode` | `<w:tblStylePr>`: `{ type, pPr?, rPr?, tblPr?, _extras? }`, the properties parsed by `docxProperties`, `trPr` / `tcPr` kept in `_extras`. |
| `parseLatentStyles` / `renderLatentStyles` | `(el) => LatentStyles \| undefined` / `(l) => xmlNode` | `<w:latentStyles>`: its attributes without the `w:` prefix, as read, and `exceptions`, each `<w:lsdException>`'s; `undefined` for another child. |

## Fields typed

| Where | Field | From |
|-------|-------|------|
| a style | `autoRedefine`, `hidden`, `semiHidden`, `unhideWhenUsed`, `qFormat`, `locked`, `personal`, `personalCompose`, `personalReply` (booleans) | the toggles of `CT_Style` |
| a style | `aliases`, `link`, `rsid` (strings), `uiPriority` (number) | their `w:val` |
| a table style | `tblStylePr: [{ type, pPr?, rPr?, tblPr?, _extras? }]` | each `<w:tblStylePr>`; the walker then types their `pPr` / `rPr` with the run and paragraph hooks |
| the numbering part | `numIdMacAtCleanup` (number) | its `w:val` |
| an abstract numbering | `nsid`, `tmpl`, `styleLink`, `numStyleLink` (strings) | their `w:val` |
| a numbering level | `suff`, `pStyle` (strings), `isLgl` (boolean), `lvlRestart`, `lvlPicBulletId` (numbers), `legacy: { legacy?, legacySpace?, legacyIndent? }` (as read) | their `w:val`, `<w:legacy>`'s attributes |
| the styles part | `latentStyles: { defLockedState?, defUIPriority?, defSemiHidden?, defUnhideWhenUsed?, defQFormat?, count?, exceptions: [{ name, locked?, uiPriority?, semiHidden?, unhideWhenUsed?, qFormat? }] }` | `<w:latentStyles>`, attribute values as read |

## Notes

- A style's `trPr` and `tcPr`, and a conditional format's, stay raw (`_extras`). An empty `pPr`, `rPr` or `tblPr` of a conditional format types as `{}` and is written back empty.
- A repeated `<w:tblStylePr>` is typed all or nothing: if one would not be written back as read, every one of the style stays raw, in its place.

## See also

- [docxStyles](../docx/styles.md) — the core styles part.
- [docxWalker](../docx/docx-walker.md) — the hooks.
- [wmlNumberingDetails](./wml-numbering-details.md) — the numbering toolkit (parse / render of the raw elements).
