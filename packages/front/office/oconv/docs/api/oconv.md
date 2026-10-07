---
module: oconv
category: oconv
dependencies: [oconvIr, oconvDocxToIr, oconvOdtToIr, oconvXlsxToIr, oconvOdsToIr, oconvPptxToIr, oconvOdpToIr, oconvPdfToIr, oconvIrToMd, docx, odt, xlsx, ods, pptx, odp, pdf, md, mdNode, oconvMdToIr, oconvIrToDocx, oconvIrToOdt, oconvIrToPdf]
returns: object
worker-safe: true
status: complete
---

# oconv

> The public facade — `toMd`, `fromMd`, `convert` — document ↔ structured markdown, plus four cross-format pairs.

**Module** `oconv` (`oconv`) | **Source** `packages/front/office/oconv/src/oconv.js` | **Deps** `oconvIr`, `oconvDocxToIr`, `oconvOdtToIr`, `oconvXlsxToIr`, `oconvOdsToIr`, `oconvPptxToIr`, `oconvOdpToIr`, `oconvPdfToIr`, `oconvIrToMd`, `docx`, `odt`, `xlsx`, `ods`, `pptx`, `odp`, `pdf`, `md`, `mdNode`, `oconvMdToIr`, `oconvIrToDocx`, `oconvIrToOdt`, `oconvIrToPdf` | **Worker-safe** yes

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
| `toMd` | `(input: OconvToMdInput) => Promise<OconvToMdResult>` | `{markdown, anchors, lossy, losses, assets, ms}` | `oconv: convertedAt is required`; `oconv: unsupported format`; `oconv: form op budget needs format pdf`; `oconv: bad form op budget` |
| `fromMd` | `(input: OconvFromMdInput) => Promise<OconvFromMdResult>` | `{bytes, target, lossy, losses, ms}` | `oconv: markdown is required`; `oconv: unsupported target`; `oconv: pdf options need target pdf`; `oconv: bad pdf option <key>`; `oconv: bad pdf font <style>`; `oconv: default faces need target pdf`; `oconv: bad default faces`; `oconv: bad assets` |
| `convert` | `(input: OconvConvertInput) => Promise<OconvConvertResult>` | `{bytes, format, target, lossy, losses, ms}` | `oconv: bytes is required`; `oconv: unsupported format`; `oconv: unsupported target`; `oconv: unsupported pair`; `oconv: pdf options need target pdf`; `oconv: default faces need target pdf`; `oconv: bad default faces` |

`OconvToMdInput`: `{name, bytes, format?, convertedAt, engine?, includeNotes?, opts?, formOpBudget?}` — `convertedAt` is REQUIRED, never defaulted. `formOpBudget` (`pdf` source only): forwarded to `oconvPdfToIr.pdfToIr`'s per-page Form XObject operator budget (default `1000000`); supplying it for a non-pdf source throws `oconv: form op budget needs format pdf` rather than being silently ignored. `OconvFromMdInput`: `{markdown, name?, target?, opts?, assets?, defaultFaces?}`. `OconvConvertInput`: `{bytes, name?, format?, target, includeNotes?, opts?, defaultFaces?}` — `target` is REQUIRED and never derived from `name` (`name` names the source here). `opts.pdf` (`OconvPdfOptions`, target `pdf` only): `{pageSize?, margin?, baseSize?, leadingRatio?, headingScale?, codeSize?, pageNumbers?, fonts?}` — forwarded whole to the pdf writer's single validator.

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
- The `docx` target is byte-reproducible (`@awacloud/ooxml` stamps every zip entry with a fixed 1980-01-01 00:00 timestamp), and so is the `odt → docx` pair of `convert`. The `odt` target is not: the ODF package writer stamps the current time, so two identical calls give equal document models but may give different bytes (same for `docx → odt`). The `pdf` target has no zip container and IS byte-reproducible.
- Provenance in the target container is target-specific, never taken from the caller or from profile-v1 front matter: the `docx` target writes none (no `docProps`/core-properties part); the `odt` target always carries `meta:generator: '@awacloud/odf'` in `meta.xml`; the `pdf` target always carries `/Producer` and `/Creator`, both `'@awacloud/oconv'`. Same for `fromMd` and `convert` — see [convert.md](../convert.md#provenance-and-reproducibility).
- The `pdf` writer additionally returns a page count that this facade's frozen result shape does not carry — call [`oconvIrToPdf`](./write/ir-to-pdf.md) directly for it.

## See also

- [docs/api/README.md](./README.md) — full module index + `exports` boundary note
- [`worker`](./worker.md) — the worker entry wrapping this facade
- [convert.md](../convert.md), [profile-v1.md](../profile-v1.md), [pdf-writer.md](../pdf-writer.md)
- [loss matrix](../loss-matrix.md)
