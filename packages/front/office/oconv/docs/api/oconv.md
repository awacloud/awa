---
module: oconv
category: oconv
dependencies: [oconvIr, oconvDocxToIr, oconvOdtToIr, oconvXlsxToIr, oconvOdsToIr, oconvPptxToIr, oconvOdpToIr, oconvPdfToIr, oconvIrToMd, docx, odt, xlsx, ods, pptx, odp, pdf, md, mdNode, oconvMdToIr, oconvIrToDocx, oconvIrToOdt, oconvIrToPdf, pdfLegacyRc4Read, pdfInfo, pdfXmpExtended, pdfFilterDispatch, opcCoreProperties]
returns: object
worker-safe: true
status: complete
---

# oconv

> The public facade — `toMd`, `fromMd`, `convert` — document ↔ structured markdown, plus four cross-format pairs.

**Module** `oconv` (`oconv`) | **Source** `packages/front/office/oconv/src/oconv.js` | **Deps** `oconvIr`, `oconvDocxToIr`, `oconvOdtToIr`, `oconvXlsxToIr`, `oconvOdsToIr`, `oconvPptxToIr`, `oconvOdpToIr`, `oconvPdfToIr`, `oconvIrToMd`, `docx`, `odt`, `xlsx`, `ods`, `pptx`, `odp`, `pdf`, `md`, `mdNode`, `oconvMdToIr`, `oconvIrToDocx`, `oconvIrToOdt`, `oconvIrToPdf`, `pdfLegacyRc4Read`, `pdfInfo`, `pdfXmpExtended`, `pdfFilterDispatch`, `opcCoreProperties` | **Worker-safe** yes

Three public members. `toMd` converts `.docx`/`.odt`/`.xlsx`/`.ods`/`.pptx`/`.odp`/`.pdf` to structured markdown. `fromMd` converts structured markdown (or plain CommonMark/GFM) to `.docx`/`.odt`/`.pdf`. `convert` composes a reader and a writer directly, with no markdown hop, for exactly four allowlisted pairs: `docx→odt`, `odt→docx`, `docx→pdf`, `odt→pdf`. The facade composes the frozen readers/writers with the office packages they wrap, through the dependency list above — never an office package internal.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `toMd` | `(input: OconvToMdInput) => Promise<OconvToMdResult>` | `{markdown, anchors, lossy, losses, assets, ms}` | `oconv: convertedAt is required`; `oconv: unsupported format`; `oconv: form op budget needs format pdf`; `oconv: bad form op budget`; `oconv: pdf infer needs format pdf`; `oconv: bad pdf infer`; `oconv: pdf declare needs format pdf`; `oconv: bad pdf declare`; `oconv: pdf include needs format pdf`; `oconv: bad pdf include`; `oconv: pdf password needs format pdf`; `oconv: pdf recover xref needs format pdf`; `oconv: bad pdf recover xref`; `oconv: pdf line hyphens needs format pdf`; `oconv: bad pdf line hyphens`; `oconv: odt include needs format odt`; `oconv: bad odt include`; `oconv: docx include needs format docx`; `oconv: bad docx include`; `oconv: sheets needs format xlsx or ods`; `oconv: bad sheets`; `oconv: sheet cell budget needs format xlsx or ods`; `oconv: bad cell budget`; `oconv: bad archive limits`; `oconv: archive limits need an office source`; `oconv: bad output budget`; `oconv: output too large`; `oconv: bad front matter` |
| `fromMd` | `(input: OconvFromMdInput) => Promise<OconvFromMdResult>` | `{bytes, target, lossy, losses, ms}` | `oconv: markdown is required`; `oconv: unsupported target`; `oconv: pdf options need target pdf`; `oconv: bad pdf option <key>`; `oconv: bad pdf font <style>`; `oconv: default faces need target pdf`; `oconv: bad default faces`; `oconv: bad assets` |
| `convert` | `(input: OconvConvertInput) => Promise<OconvConvertResult>` | `{bytes, format, target, lossy, losses, ms}` | `oconv: bytes is required`; `oconv: unsupported format`; `oconv: unsupported target`; `oconv: unsupported pair`; `oconv: pdf options need target pdf`; `oconv: default faces need target pdf`; `oconv: bad default faces` |

`OconvToMdInput`: `{name, bytes, format?, convertedAt, engine?, includeNotes?, opts?, formOpBudget?, pdfInfer?, pdfDeclare?, pdfInclude?, pdfPassword?, pdfRecoverXref?, pdfLineHyphens?, odtInclude?, docxInclude?, sheets?, sheetCellBudget?, archiveLimits?, outputBudget?}` — `convertedAt` is REQUIRED, never defaulted. `opts` is forwarded to `oconvIrToMd.irToMd`: `opts.frontMatter` — `'full'` (default), `'compact'` (the loss ledger counted by `(code, detail)`) or `'none'` (the body alone; see `write/ir-to-md.md`), else `oconv: bad front matter`. `formOpBudget` (`pdf` source only): forwarded to `oconvPdfToIr.pdfToIr`'s per-page Form XObject operator budget (default `1000000`); supplying it for a non-pdf source throws `oconv: form op budget needs format pdf` rather than being silently ignored. `pdfInfer` (`pdf` source only): the opt-in inference of the untagged pdf path, forwarded as `oconvPdfToIr.pdfToIr`'s `opts.infer` — `['headings']` infers headings from font size and weight, `['tables']` tables from their rules or from aligned text, `['running']` leaves out running headers and footers (`text/running-dropped`), any of them may be listed (see `read/pdf-to-ir.md`); an array of distinct known names, else `oconv: bad pdf infer`; `[]` reads as without it; for a non-pdf source it throws `oconv: pdf infer needs format pdf`. `pdfDeclare` (`pdf` source only): the opt-in record of a silent pdf → md case, forwarded as `oconvPdfToIr.pdfToIr`'s `opts.declare` — `['positional']` records one `struct/positional` loss when the untagged path built the structure from positioning (see `read/pdf-to-ir.md`); an array of distinct known names, else `oconv: bad pdf declare`; `[]` reads as without it; for a non-pdf source it throws `oconv: pdf declare needs format pdf`. `pdfPassword` (`pdf` source only): the user or owner password, forwarded to `pdf.read`'s `opts.password` with pdf's read-only `pdfLegacyRc4Read` as `opts.legacyRc4`, so RC4 (V1 / V2) files open as well as AES ones; an empty user password is `''`; without it an encrypted pdf throws `pdf/document/encrypted`; for a non-pdf source it throws `oconv: pdf password needs format pdf`. `pdfLineHyphens` (`pdf` source only): forwarded as `oconvPdfToIr.pdfToIr`'s `opts.lineHyphens` — `'drop'` joins a word a hyphen cuts at a line end without the hyphen, `'keep'` with it (a soft hyphen always joins; see `read/pdf-to-ir.md`); another value, `oconv: bad pdf line hyphens`; for a non-pdf source it throws `oconv: pdf line hyphens needs format pdf`. `pdfInclude` (`pdf` source only): the opt-in parts the pdf reader brings back, forwarded as `oconvPdfToIr.pdfToIr`'s `opts.include` — `['images']` places each JPEG or JPX picture, and each raw-pixel one written as a PNG, as an IR `image` (`image-<obj>.jpg` / `.jp2` / `.png`), its bytes returned in `assets`, every other picture still `image/dropped`, a placed picture's mask not applied `image/mask-dropped` (see `read/pdf-to-ir.md`); an array of distinct known names, else `oconv: bad pdf include`; `[]` reads as without it; for a non-pdf source it throws `oconv: pdf include needs format pdf`. `odtInclude` (`odt` source only): the opt-in parts the odt reader brings back, forwarded as `oconvOdtToIr.odtToIr`'s `opts.include` — `['toc']` reads a table of contents' entries as paragraphs at its place (see `read/odt-to-ir.md`); an array of distinct known names, else `oconv: bad odt include`; `[]` reads as without it; for a non-odt source it throws `oconv: odt include needs format odt`. `docxInclude` (`docx` source only): the same for the docx reader, forwarded as `oconvDocxToIr.docxToIr`'s `opts.include` — `['toc']` reads a table of contents control's entries as paragraphs at its place (see `read/docx-to-ir.md`); an array of distinct known names, else `oconv: bad docx include`; `[]` reads as without it; for a non-docx source it throws `oconv: docx include needs format docx`. `sheets` (`xlsx` / `ods` source only): how each sheet is written, forwarded as the reader's `opts.sheets` — `'table'` (default), `'csv'` or `'tsv'` (a fenced block per sheet, see `read/xlsx-to-ir.md`); another value throws `oconv: bad sheets`; for another source it throws `oconv: sheets needs format xlsx or ods`. `sheetCellBudget` (`xlsx` / `ods` source only): forwarded as the reader's `opts.cellBudget` — a sheet whose padded table would hold more cells is written unpadded, one `<A1 address>: <text>` paragraph per value (its rows unpadded under `'csv'` / `'tsv'`), recorded `sheet/sparse-form` (see `read/xlsx-to-ir.md`); not a positive safe integer, `oconv: bad cell budget`; for another source it throws `oconv: sheet cell budget needs format xlsx or ods`. `archiveLimits` (office sources only): `{maxParts?, maxUncompressed?, maxRatio?, maxDepth?}`, passed to the docx, xlsx, pptx, odt, ods or odp reader's `read` (an absent key keeps that reader's default, `0` disables a check; the ODF readers take the first three); a key or value that is not one of these non-negative safe integers throws `oconv: bad archive limits`, and a pdf source `oconv: archive limits need an office source`. `outputBudget` (every source): `{bytes, overflow?}` — after the read and before the render, the UTF-8 size of the IR's text (every string a node carries, table cells included) is compared with `bytes`, a positive safe integer; past it `overflow` `'throw'` (also when absent) throws `oconv: output too large` before any markdown is built, `'truncate'` keeps the top-level blocks that fit and a crossing table's leading rows that fit, drops the rest and records `doc/truncated` (`kept <n> bytes of text; <b> blocks and <r> table rows dropped`); another shape throws `oconv: bad output budget`. `OconvFromMdInput`: `{markdown, name?, target?, opts?, assets?, defaultFaces?}`. `OconvConvertInput`: `{bytes, name?, format?, target, includeNotes?, opts?, defaultFaces?}` — `target` is REQUIRED and never derived from `name` (`name` names the source here). `opts.pdf` (`OconvPdfOptions`, target `pdf` only): `{pageSize?, margin?, baseSize?, leadingRatio?, headingScale?, codeSize?, pageNumbers?, fonts?}` — forwarded whole to the pdf writer's single validator.

## Examples

### `toMd` — document to structured markdown

```js
const result = await oconv.toMd({
    name: 'report.docx',
    bytes: docxBytes,                       // Uint8Array
    convertedAt: new Date().toISOString()   // REQUIRED
});
result.markdown;   // front matter + rendered CommonMark/GFM body
result.anchors;    // [{ level, anchor }, ...]
result.losses;     // [{ code, detail }, ...] — detail is a string (readers) or an object (pdf writer)
```

### `fromMd` — markdown to a document

```js
const written = await oconv.fromMd({
    markdown: '# Report\n\nSome **bold** text.\n',
    name: 'report.docx',
    target: 'docx'   // 'docx' | 'odt' | 'pdf' — explicit target wins over name
});
written.bytes;   // Uint8Array
```

### `convert` — document to document, no markdown hop

```js
const converted = await oconv.convert({
    bytes: docxBytes, name: 'report.docx', target: 'odt'
});
converted.bytes;    // Uint8Array — the .odt container
converted.losses;   // reader losses then writer losses, document order
```

## Notes

- **Format/target detection**: `toMd`'s `format` and `fromMd`'s `target` fall back to `name`'s extension (case-insensitive) when omitted; an explicit value always wins over a contradicting `name`. `convert`'s `target` is never derived — `name`, when given, names the source.
- **`convertedAt` is never defaulted** to `Date.now()` — reproducibility of the `toMd` output is caller-owned; the worker entry forwards its own `at` field here.
- **`defaultFaces`** is a posted default-face map (`{regular?, bold?, italic?, boldItalic?, mono?}` of `Uint8Array`) for the `pdf` target only — the host resolves the `oconvDefaultFaces` descriptor's bytes on its own thread and posts them here, since that descriptor closes over its bytes inside `factory()` and never crosses the worker boundary itself (see [`worker`](./worker.md)).
- **Font-face precedence for the `pdf` target** — measured behaviour, not a ratified contract: a style class resolves through, in order, an explicit `opts.pdf.fonts[<class>]` byte set, then the posted `defaultFaces[<class>]` (falling back to whatever a registered default-face pack on the same runtime resolves when no `defaultFaces` was posted at all), then the Standard 14 fallback. A class that resolves to Standard 14 while at least one other class is embedded records `layout/font-fallback`; on the pure Standard 14 route (no embedded class at all) nothing is recorded.
- **Error-check order for `convert`** is contractual: `bytes` → `format` → `target` → pair → `opts.pdf` → `defaultFaces`.
- Every target is byte-reproducible: two identical calls give byte-identical bytes, for `fromMd` and for all four `convert` pairs. `@awacloud/ooxml` (`docx`) and `@awacloud/odf` (`odt`) stamp every zip entry with a fixed 1980-01-01 00:00 timestamp; the `pdf` target has no zip container, writes no date and derives its trailer `/ID` from the written bytes.
- Provenance in the target container is target-specific, never taken from the caller or from profile-v1 front matter: the `docx` target writes none (no `docProps`/core-properties part); the `odt` target always carries `meta:generator: '@awacloud/odf'` in `meta.xml`; the `pdf` target always carries `/Producer` and `/Creator`, both `'@awacloud/oconv'`. Same for `fromMd` and `convert` — see [convert.md](../convert.md#provenance-and-reproducibility).
- The `pdf` writer additionally returns a page count that this facade's frozen result shape does not carry — call [`oconvIrToPdf`](./write/ir-to-pdf.md) directly for it.

## See also

- [docs/api/README.md](./README.md) — full module index + `exports` boundary note
- [`worker`](./worker.md) — the worker entry wrapping this facade
- [convert.md](../convert.md), [profile-v1.md](../profile-v1.md), [pdf-writer.md](../pdf-writer.md)
- [loss matrix](../loss-matrix.md)
