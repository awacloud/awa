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

## Resolve

```js
const ext = runtime.resolve('pdfAnnotExtended');
// Returns: { typeAnnotExtended, typeWatermarkAnnot, type3DAnnot,
//   typeRichMediaAnnot, typeSoundAnnot, typeMovieAnnot,
//   typeScreenAnnot, typePrinterMarkAnnot, typeTrapNetAnnot,
//   typeFreeTextExtended, FREETEXT_LINE_ENDINGS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeAnnotExtended` | `(dict) => Annot` | Dispatches on `/Subtype`. |
| `typeWatermarkAnnot` | `(dict) => Annot` | `/FixedPrint`. |
| `type3DAnnot` | `(dict) => Annot` | Surfaces to `pdf3dRichMedia`. |
| `typeRichMediaAnnot` | `(dict) => Annot` | Same. |
| `typeSoundAnnot` / `typeMovieAnnot` / `typeScreenAnnot` | `(dict) => Annot` | Legacy multimedia. |
| `typePrinterMarkAnnot` / `typeTrapNetAnnot` | `(dict) => Annot` | Prepress §12.5.6.20–21. |
| `typeFreeTextExtended` | `(dict) => Annot` | FreeText with `/RC`, `/DS`, `/LE`. |
| `FREETEXT_LINE_ENDINGS` | frozen array | `Square`, `Circle`, `Diamond`, `OpenArrow`, `ClosedArrow`, `None`, `Butt`, `ROpenArrow`, `RClosedArrow`, `Slash`. |

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

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/annot-ext/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/extra/annot-ext/unsupported` | `ParseError` | `/Subtype` outside the extended coverage. |
| `pdf/extra/annot-ext/unreachable` | `ParseError` | Unreachable branch (defensive). |

## See also

- [`pdfAnnot`](../annot/annot.md)
- [`pdf3dRichMedia`](./3d-richmedia.md)
- [`pdfLegacyDeprecatedAnnots`](./legacy-deprecated-annots.md)
- [Extras index](./README.md)
