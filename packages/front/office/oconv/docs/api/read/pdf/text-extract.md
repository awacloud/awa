---
module: oconvPdfTextExtract
category: oconv/read/pdf
dependencies: [pdfResources, pdfFilterDispatch, pdfContentStream, oconvPdfFontDecoder]
returns: object
worker-safe: true
status: complete
---

# oconvPdfTextExtract

> Page-level text extraction for the tier-1 pdf reader — content-stream order, minimal graphics state.

**Module** `oconvPdfTextExtract` (`oconvPdfTextExtract`) | **Source** `packages/front/office/oconv/src/read/pdf/text-extract.js` | **Deps** `pdfResources`, `pdfFilterDispatch`, `pdfContentStream`, `oconvPdfFontDecoder` | **Worker-safe** yes

Decodes a page's `/Contents` stream(s), parses the operators, and walks them keeping a minimal text + graphics state (CTM via `q`/`Q`/`cm`, text matrix via `BT`/`Td`/`TD`/`Tm`/`T*`/`TL`, current font via `Tf`, character spacing `Tc`, word spacing `Tw`, horizontal scaling `Tz`) to emit a flat list of positioned text pieces in content-stream order, each with its start and end position. Character decode and glyph widths are delegated to `oconvPdfFontDecoder`; positioning is used only to place each piece — no layout inference.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const { extractPage } = runtime.resolve('oconvPdfTextExtract');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `extractPage` | `(page: object, resolve: (ref) => object, opts?: {formOpBudget?: number}) => {items, counts, losses}` | `items` — `{kind:'text', x, y, fontSize, xEnd, text, mcid}[]` / `{kind:'image', mcid}[]`, content-stream order; `counts` — `{operators, decoded, undecodable}`; `losses` — `{code, detail}[]` | `oconv: bad form op budget` |

## Examples

### Extract one page's positioned text

```js
const pdf = runtime.resolve('pdf');
const doc = pdf.read(bytes);
const { items, counts } = extractPage(doc.pages[0], doc._raw.resolve);
items[0];    // { kind: 'text', x, y, fontSize, xEnd, text, mcid }
counts;      // { operators, decoded, undecodable }
```

## Notes

- `x`/`y` is where a text piece starts and `xEnd` where it ends, both in the page's device space (after the CTM). Each show operator advances the text matrix by the displacement of the string it shows (ISO 32000-2 §9.4.4): Σ ((w0 / 1000) × Tfs + Tc + (Tw when the code is the single byte 32)) × Th, where w0 is the glyph width from the font (`oconvPdfFontDecoder`'s `width`), Tfs the `Tf` size and Th = `Tz` / 100. Each number n in a `TJ` array moves the position by −n / 1000 × Tfs × Th. So a `Tj` that follows another without a `Td` starts where the previous one ended.
- `'` moves to the next line before showing; `"` also sets Tw and Tc from its first two operands. `Tc`, `Tw` and `Tz` belong to the graphics state: `q`/`Q` save and restore them with the CTM.
- A vertical-mode composite font (a `…-V` CMap) and a show under an unresolved font advance nothing: the piece's `xEnd` equals its `x`.
- Inside one `TJ` array, a number n with −n / 1000 > 0.15 (a move to the right of more than 0.15 em — the same threshold as the paragraph grouping's word gap between two pieces) is read as a word space: one `' '` joins the strings on either side of it, unless the text before it already ends, or the text after it already starts, with whitespace. A space is never doubled.
- Between two separate pieces on one line, the word space is decided later, by `oconvPdfToIr`'s paragraph grouping, from this `xEnd` and the next piece's `x`.
- `mcid` on each item is the innermost marked-content id in scope (`BDC … EMC`), or `null` — the tagged fast path (`oconvPdfStruct` + `oconvPdfToIr`) keys struct elements to text through it.
- A Form XObject drawn by `Do` is executed in place (ISO 32000-2 §8.10.1). The graphics state is saved, the form's `/Matrix` (identity by default) is concatenated onto the CTM, and fonts and XObjects resolve from the form's own `/Resources`, or from the page's when the form has none. The form's content stream then runs through the same operator walk, so its text and image draws enter `items` in content-stream order, placed and advanced under the form's matrix. The state is restored on return, and an unbalanced `Q` or `EMC` inside a form never reaches past the form's entry state. The `mcid` in scope at the `Do` carries into the form.
- A form's `/Resources` resolves an indirect category through the document resolver. If the dictionary as a whole still fails to type, each category is typed on its own, so one bad category never drops the form's fonts.
- Three guards keep form execution finite, and none throws: a form that is already being executed is not re-entered (`xobject/form-cycle`); forms nest at most 12 deep, and a 13th level records `xobject/form-depth`; once a page has run `formOpBudget` operators inside forms (default 1,000,000, the named constant `FORM_OPS_MAX`), its later form draws are skipped and `xobject/form-budget` is recorded once for the page.
- `formOpBudget` is validated at entry, before any stream is decoded: absent (`undefined`) resolves to the default; present, it must satisfy `Number.isSafeInteger(v) && v >= 1`, else `extractPage` throws `oconv: bad form op budget` — there is no upper cap other than the safe-integer range. `oconvPdfToIr.pdfToIr` applies the identical rule at entry (so a zero-page document still refuses a bad value) and forwards the option to every page's `extractPage` call.
- A content stream that fails to decode or parse is skipped with loss `content/undecodable`, detail = `stream <objNum>: <cause>` (the thrown error's message, collapsed to one line and capped at 160 characters) — the page's other streams still contribute.
- A `Tf` naming a font absent from `/Resources` or whose dict fails to type leaves `curDecoder` null; the next show operator counts its whole run as undecodable and records `text/font-unresolved`.
- Page resources come from `pdfResources.resolvePageResources(page.raw, resolve)` with the document's own resolver, so an indirect `/Resources`, an indirect resource category (`/Font 12 0 R`, `/ExtGState 9 0 R`) and font dicts compressed in object streams all resolve. If the resource dictionary still fails to type (a category that is neither a dictionary nor a reference), the page has no resource map at all and every show run on it records `text/font-unresolved` — ledgered, never guessed.
- Loss codes this module contributes: `text/undecodable` (≥1 char code in a show run resolved to no Unicode, detail = the count), `text/font-unresolved`, `text/width-approximated` (a font's glyph widths could not be read from the font, so a declared fallback width placed its text — recorded once per font resource per page, detail = the resource name; the text is kept, only its end positions and the inferred word spaces are approximate), `image/dropped` (an image XObject `Do` or inline image `BI`, inside a form too — tier 1 keeps no images), `xobject/form-dropped` (a Form XObject whose stream cannot be used, so its text is not extracted; detail = `<name>: <reason>`, the reason one of `not a stream`, `undecodable stream`, `unparsable stream`), `xobject/form-cycle`, `xobject/form-depth` and `xobject/form-budget` (a budget of `formOpBudget` operators, default 1,000,000; the three guards below; detail = the resource name).

## See also

- [docs/api/README.md](../../README.md) — full module index + `exports` boundary note
- [`oconvPdfFontDecoder`](./font-decoder.md) — the per-font decoder this module delegates character decode to
- [`oconvPdfStruct`](./struct.md) — the tagged-structure companion this page's `mcid`s key into
- [`oconvPdfToIr`](../pdf-to-ir.md) — the reader composing the pdf pipeline
- [loss matrix](../../../loss-matrix.md)
