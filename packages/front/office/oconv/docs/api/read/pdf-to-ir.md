---
module: oconvPdfToIr
category: oconv/read
dependencies: [oconvIr, oconvPdfTextExtract, oconvPdfStruct]
returns: object
worker-safe: true
status: complete
---

# oconvPdfToIr

> `.pdf` (`@awacloud/pdf`'s `pdf.read()` result) → `oconv-ir/v1` — tier 1, text-first only.

**Module** `oconvPdfToIr` (`oconvPdfToIr`) | **Source** `packages/front/office/oconv/src/read/pdf-to-ir.js` | **Deps** `oconvIr`, `oconvPdfTextExtract`, `oconvPdfStruct` | **Worker-safe** yes

Pure transformation over the parsed `pdf.read(bytes)` structure plus on-demand content-stream decode through `oconvPdfTextExtract`/`oconvPdfStruct`. Real text is extracted through a font's ToUnicode CMap, the encoding-table + AGL hop, or (composite fonts only) a Unicode-coded predefined CMap; scanned/OCR is permanently out, and there is no layout inference beyond text-positioning heuristics.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const pdf = runtime.resolve('pdf');
const { pdfToIr } = runtime.resolve('oconvPdfToIr');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `pdfToIr` | `(readResult: object, opts?: {formOpBudget?: number}) => {ir, losses, coverage}` | `ir` — an `oconv-ir/v1` document; `losses` — `{code, detail}[]`; `coverage` — `{pages: object[], total: {operators, decoded, undecodable}, tagged: boolean}` | `oconv: bad form op budget` |

## Examples

### Convert a `.pdf` read result to IR

```js
const { ir, losses, coverage } = pdfToIr(pdf.read(bytes));
ir.kind;             // 'document'
coverage.tagged;     // false when the document has no /StructTreeRoot
// measured on the vendored facturx-minimum-sample.pdf fixture:
// coverage.total → {operators: 3585, decoded: 4128, undecodable: 0}
```

## Notes

- **Two paths**: a **tagged fast path** (`/StructTreeRoot` present) derives structure from the logical tree — `H1`..`H6` struct elements become IR headings, text-ish tags become paragraphs, keyed to text through marked-content ids; a `Table`/`L` container is flattened (loss `struct/dropped`). An **untagged fall-back** groups content-stream text pieces into lines and paragraphs by vertical position, inferring no heading; within a line it inserts one space where the horizontal gap between a piece's end and the next piece's start exceeds 0.15 em (never doubling an existing space, never on a line whose pieces go backwards). A piece that exactly repeats the previous piece of its line — same text, within 0.5 pt in x and in y — is dropped first. A piece that starts left of the previous piece's end (an overlap) gets one space iff the overlap exceeds the same 0.15 em — so a kerned apostrophe or a syllable split across two shows stays joined.
- Page boundaries become IR `hr` nodes in both paths — the frozen vocabulary has no section node.
- `coverage` is reported, never assumed: per-page and total `{operators, decoded, undecodable}` counts, honest-loss-matrix discipline (never claim zero loss from an unmeasured decode).
- Loss codes this module and its dependencies emit: `text/undecodable` (≥1 char code resolved to no Unicode), `text/font-unresolved` (a show op ran with no resolvable current font), `text/width-approximated` (a font's glyph widths fell back to a declared width — once per font resource per page), `image/dropped` (an image XObject or inline image, inside a Form XObject too — tier 1 keeps none), `xobject/form-dropped` (a Form XObject whose stream cannot be used — detail names the reason; a usable form is executed and its text extracted), `xobject/form-cycle` / `xobject/form-depth` / `xobject/form-budget` (a Form XObject not executed by a guard: drawn from inside itself, nested deeper than 12, or past a budget of `formOpBudget` form operators on the page, default 1,000,000), `content/undecodable` (a content stream failed to decode/parse — detail `stream <objNum>: <cause>`, the thrown error's message), `struct/dropped` (tagged path, a `Table`/`L` container flattened).
- `opts.formOpBudget`: absent (`undefined`) resolves to the default (1,000,000); present, it must satisfy `Number.isSafeInteger(v) && v >= 1`, else `pdfToIr` throws `oconv: bad form op budget` — checked at entry, before the first page is extracted, so a zero-page document still refuses a bad value. The option is forwarded to every page's `oconvPdfTextExtract.extractPage` call, which applies the identical rule.

## See also

- [docs/api/README.md](../README.md) — full module index + `exports` boundary note
- [`oconvIr`](../ir/ir.md) — the pivot this reader produces
- [`oconvPdfTextExtract`](./pdf/text-extract.md), [`oconvPdfStruct`](./pdf/struct.md) — the two dependencies this reader composes
- [loss matrix](../../loss-matrix.md)
