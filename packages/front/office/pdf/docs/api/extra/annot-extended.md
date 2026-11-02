---
module: pdfAnnotExtended
category: pdf/extra
dependencies: [pdfErrors, pdfParserObj, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfAnnotExtended

> Extended annotation subtypes (Watermark, 3D, RichMedia, …) — ISO 32000-2 §12.5.6.

**Module** `pdfAnnotExtended` | **Source** `packages/front/office/pdf/src/extra/annot-extended.js` | **Deps** `pdfErrors`, `pdfParserObj`, `pdfAnnot` | **Worker-safe** yes

Extends `pdfAnnot` with: Watermark (§12.5.6.22), 3D (§13.6), RichMedia (§13.6.2), Sound (§12.5.6.16 legacy), Movie (§12.5.6.17 legacy), Screen (§12.5.6.18), PrinterMark (§12.5.6.20), TrapNet (§12.5.6.21), extended FreeText (§12.5.6.6, `/RC`, `/DS`, `/LE`). Composes the core `typeBaseAnnot`/`captureExtras`.

`typeMarkupEntries` is a companion typer for an annotation of any subtype: it reads what the core record keeps untyped in `_extras` — the PDF 2.0 entries common to every annotation (`/ca`, `/BM`, `/Lang`, Table 166) and, on a markup annotation (§12.5.6.2), the markup entries of Table 172 — and leaves the core record as it is.

## Resolve

```js
const ext = runtime.resolve('pdfAnnotExtended');
// Returns: { typeAnnotExtended, typeWatermarkAnnot, type3DAnnot,
//   typeRichMediaAnnot, typeSoundAnnot, typeMovieAnnot,
//   typeScreenAnnot, typePrinterMarkAnnot, typeTrapNetAnnot,
//   typeFreeTextExtended, typeMarkupEntries, MARKUP_SUBTYPES,
//   typeAppearanceDict, APPEARANCE_KEYS, FREETEXT_LINE_ENDINGS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeAnnotExtended` | `(dict) => Annot` | Dispatches on `/Subtype`. |
| `typeWatermarkAnnot` | `(dict) => Annot` | `/FixedPrint`. |
| `type3DAnnot` | `(dict) => Annot` | Surfaces to `pdf3dRichMedia`. `3DU` (the 3D units dictionary) and `GEO` (the geospatial measure dictionary) as read, present only when the key is. |
| `typeRichMediaAnnot` | `(dict) => Annot` | Same. |
| `typeSoundAnnot` / `typeMovieAnnot` / `typeScreenAnnot` | `(dict) => Annot` | Legacy multimedia. |
| `typePrinterMarkAnnot` / `typeTrapNetAnnot` | `(dict) => Annot` | Prepress §12.5.6.20–21. |
| `typeFreeTextExtended` | `(dict) => Annot` | FreeText with `/RC`, `/DS`, `/LE`. |
| `FREETEXT_LINE_ENDINGS` | frozen array | `Square`, `Circle`, `Diamond`, `OpenArrow`, `ClosedArrow`, `None`, `Butt`, `ROpenArrow`, `RClosedArrow`, `Slash`. |
| `typeMarkupEntries` | `(dict) => MarkupEntries` | `{ subtype, markup, ca, bm, lang, t, popup, rc, creationDate, irt, subj, rt, it, exData }` for any subtype. `markup` is true for the subtypes of `MARKUP_SUBTYPES`; `ca` (number), `bm` (name) and `lang` (text string) are read on every subtype; the nine markup fields only when `markup` is true, else `null`. Strings are the string's bytes, names their value; `popup` is `{ num, gen }`; `irt` and `exData` are `{ num, gen }` for a reference or the dictionary node; `rc` is the string's bytes, the stream node, or `{ num, gen }` for the (indirect) text stream. A value of another type gives `null`. |
| `MARKUP_SUBTYPES` | frozen array | The markup annotation subtypes: `Text`, `FreeText`, `Line`, `Square`, `Circle`, `Polygon`, `PolyLine`, `Highlight`, `Underline`, `Squiggly`, `StrikeOut`, `Caret`, `Stamp`, `Ink`, `FileAttachment`, `Sound`, `Redact` (§12.5.6.2 Table 171) and `Projection` (§12.5.6.24). |
| `typeAppearanceDict` | `(dict, kind) => AppearanceDict` | An annotation's appearance characteristics (`kind` `characteristics`, `/MK`), border style (`borderStyle`, `/BS`), border effect (`borderEffect`, `/BE`) or icon fit (`iconFit`, `/IF`): one field per key of its list, named after the key in lower case (`SW` → `sw`), present only when the key is — a name, a string (its bytes), a number, an integer or a boolean by its value, an array, a dictionary or a stream as read (a reference as read), `null` for a value of another type — plus `raw` and `_extras`. |
| `APPEARANCE_KEYS` | frozen object | Kind → its keys (the Arlington PDF Model's lists). |

## Examples

### Extended dispatcher

```js
const ext = runtime.resolve('pdfAnnotExtended');
const a = ext.typeAnnotExtended(annotDict);
a.kind;  // 'Watermark' | '3D' | 'RichMedia' | …
```

### FreeText with `/LE`

```js
const ft = ext.typeFreeTextExtended(dict);
ft.le;  // 'OpenArrow' or ['OpenArrow', 'ClosedArrow']
```

### Author, reply and blend mode of a comment

```js
const annots = runtime.resolve('pdfAnnot');
const rec = annots.typeAnnot(textAnnotDict);  // the core record
const more = ext.typeMarkupEntries(textAnnotDict);
more.markup;  // true for a /Text annotation
more.t;       // the author label (/T), as bytes
more.irt;     // { num, gen } of the annotation it replies to (/IRT)
more.bm;      // 'Multiply' (/BM, PDF 2.0)
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/annot-ext/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/extra/annot-ext/unsupported` | `ParseError` | `/Subtype` outside the extended coverage. |
| `pdf/extra/annot-ext/unreachable` | `ParseError` | Unreachable branch (defensive). |
| `pdf/extra/annot-ext/appearance/not-dict` | `ParseError` | `typeAppearanceDict`: not a dict. |
| `pdf/extra/annot-ext/appearance/kind` | `ContractError` | `typeAppearanceDict`: `kind` missing or not a key of `APPEARANCE_KEYS`. |

## See also

- [`pdfAnnot`](../annot/annot.md)
- [`pdf3dRichMedia`](./3d-richmedia.md)
- [`pdfLegacyDeprecatedAnnots`](./legacy-deprecated-annots.md)
- [Extras index](./README.md)
