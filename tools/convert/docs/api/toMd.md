# `toMd`

Converts a document to structured Markdown through `@awacloud/oconv`'s
`toMd`.

```ts
function toMd(input: ToMdInput): Promise<ToMdResult>
```

## Input — [`ToMdInput`](./types.md#tomdinput)

| Field | Type | Required | Meaning |
|---|---|---|---|
| `name` | `string` | yes | Source file name. Its extension picks the format when `format` is omitted. |
| `bytes` | `Uint8Array` | yes | The source file's bytes. |
| `convertedAt` | `string` | yes | Timestamp written into the output front matter. It is never defaulted, so the output is reproducible. It must be a strict RFC 3339 `date-time` (e.g. `2026-01-01T00:00:00.000Z`) — anything else is a usage error, checked before the conversion runs. A valid value is kept verbatim, never normalised. |
| `format` | `string` | no | One of `docx`, `odt`, `xlsx`, `ods`, `pptx`, `odp`, `pdf`. Wins over the extension of `name`. |
| `includeNotes` | `boolean` | no | `pptx` and `odp`: include speaker notes. Default `false`; ignored on another format (no error). |
| `sheets` | `string` | no | `xlsx` and `ods` only: `'table'` (default), `'csv'` or `'tsv'` — each sheet as a fenced `csv` / `tsv` block instead of a GFM table. A bad value or another source format is a usage error. |
| `pdfInfer` | `string[]` | no | `pdf` only: inference on an untagged pdf — `'headings'` (from type size and weight), `'tables'` (from rules or aligned text), `'running'` (running headers and footers left out). |
| `pdfDeclare` | `string[]` | no | `pdf` only: `'positional'` records one `struct/positional` loss when the structure was built from positions. |
| `pdfInclude` | `string[]` | no | `pdf` only: `'images'` places each JPEG, JPEG 2000 and raw-pixel picture as a Markdown image, its bytes in `assets`. |
| `pdfPassword` | `string \| Uint8Array` | no | `pdf` only: the user or owner password of an encrypted pdf. |
| `pdfRecoverXref` | `boolean` | no | `pdf` only: `true` rebuilds an unusable cross-reference chain from the file's object definitions. |
| `pdfLineHyphens` | `string` | no | `pdf` only: `'drop'` or `'keep'` — a word a hyphen cuts at a line end is joined without or with the hyphen (a soft hyphen always joins). |
| `formOpBudget` | `number` | no | `pdf` only: the per-page Form XObject operator budget, default `1000000`. |
| `odtInclude` | `string[]` | no | `odt` only: `'toc'` reads a table of contents' entries as paragraphs. |
| `docxInclude` | `string[]` | no | `docx` only: `'toc'` reads a table of contents control's entries as paragraphs. |
| `sheetCellBudget` | `number` | no | `xlsx` / `ods` only: a sheet whose padded table would hold more cells is written unpadded, one `<A1 address>: <text>` line per value (`sheet/sparse-form`). |
| `archiveLimits` | `ArchiveLimits` | no | office formats only: the reader's archive limits (`maxParts`, `maxUncompressed`, `maxRatio`, `maxDepth`; `0` disables a check). |
| `outputBudget` | `OutputBudget` | no | every format: `{ bytes, overflow? }` — past `bytes` of text, `'throw'` (default) fails with `oconv: output too large` (not a usage error), `'truncate'` keeps what fits (`doc/truncated`). |
| `opts` | `{ frontMatter?: string }` | no | `frontMatter`: `'full'` (default), `'compact'` (the loss ledger counted per code and detail) or `'none'` (the body alone). |

Every field after `format` is `@awacloud/oconv`'s `toMd` input of the same
name, forwarded verbatim; oconv validates the value. One that names a
source format (`pdf…`, `odt…`, `docx…`, `sheets`, `sheetCellBudget`, `archiveLimits`, `formOpBudget`) given for another
format, or a value oconv refuses, is a usage error; `includeNotes` is the one that is
ignored on another format. `outputBudget`, `frontMatter` and the asset manifest apply to every format.

## Output — [`ToMdResult`](./types.md#tomdresult)

On success, a [`ToMdOutput`](./types.md#tomdoutput):

| Field | Type | Meaning |
|---|---|---|
| `error` | `null` | Marks success. |
| `markdown` | `string` | The Markdown, with a YAML front matter block giving provenance and heading anchors. |
| `losses` | [`Loss[]`](./types.md#loss) | What the conversion could not carry across. |
| `lossSummary` | [`LossSummaryEntry[]`](./types.md#losssummaryentry) | `losses` grouped by `code` + `detail`, with a count, in order of first occurrence. |
| `lossy` | `boolean` | `losses.length > 0`. |
| `assets` | [`Asset[]`](./types.md#asset) | The images the markdown references, with their bytes when the reader captured them. [`assetFiles`](./assetFiles.md) says which can be written. |

On failure, a [`CoreError`](./types.md#coreerror). The function never
throws.

## Errors

| `error` | `usage` | Cause |
|---|---|---|
| `oconv: unsupported format (supported: docx, odt, xlsx, ods, pptx, odp, pdf)` | `true` | Neither `format` nor the extension of `name` is a supported input format. |
| `invalid timestamp "…": expected an RFC 3339 date-time such as 2026-01-01T00:00:00.000Z` | `true` | `convertedAt` is not a strict RFC 3339 `date-time`. Checked before the conversion runs. |
| `oconv: pdf infer needs format pdf` (likewise `pdf declare`, `pdf include`, `pdf password`, `pdf recover xref`, `pdf line hyphens`, `form op budget`; `odt include needs format odt`; `docx include needs format docx`; `sheets needs format xlsx or ods`; `sheet cell budget needs format xlsx or ods`; `archive limits need an office source`) | `true` | The option names another source format. |
| `oconv: bad pdf infer` (likewise `pdf declare`, `pdf include`, `pdf line hyphens`, `odt include`, `docx include`, `form op budget`, `pdf recover xref`, `front matter`, `sheets`, `archive limits`, `output budget`) | `true` | oconv refuses the option's value (an `outputBudget` without `bytes` included). |
| `oconv: output too large` | `false` | The document's text passes `outputBudget.bytes` and `overflow` is `'throw'` (the default once a budget is given). |
| a reader message, e.g. `OPC: too many parts in archive`, `OPC: uncompressed payload exceeds limit` | `false` | The document exceeds an `archiveLimits` limit (or a default one). |
| a reader message, e.g. `OPC: failed to unzip archive: invalid zip data` | `false` | The bytes are not a valid file of the detected format. |
| a pdf message, e.g. `document is encrypted (trailer /Encrypt present) — …` | `false` | An encrypted pdf without `pdfPassword`, or with a wrong one. |
| `internal/descriptor: …` | `false` | A module descriptor from `@awacloud/oconv` is malformed (packaging defect). |

## Example

```ts
import { readFileSync } from 'node:fs';
import { toMd } from '@awacloud/tool-convert';

const bytes = new Uint8Array(readFileSync('tests/fixtures/sample.docx'));
const result = await toMd({ name: 'sample.docx', bytes, convertedAt: '2026-01-01T00:00:00.000Z' });
console.log(result.error, result.lossy, result.losses);
console.log(result.markdown);
```

Output:

```text
null false []
---
profile: v1
ir: oconv-ir/v1
sourceFormat: docx
sourceName: sample.docx
sourceBytes: 1556
sourceSha256: 7be541047cdb2255188fdf68ed6ddc98c47ed22332093df494dcb3f5c7f60b7c
convertedAt: 2026-01-01T00:00:00.000Z
converter: oconv
converterVersion: 1.2.0
blocks: 6
anchors:
  - { level: 1, anchor: sovereign-rag-ingestion }
  - { level: 2, anchor: why-air-gap-matters }
  - { level: 3, anchor: chunking }
lossy: false
---
# Sovereign RAG ingestion

A short introduction paragraph in plain prose.

## Why air-gap matters

**Zero network** and *auditable output*. See [the profile](https://example.invalid/profile-v1)

### Chunking

Sections are stable anchors for the retriever.
```

An unsupported format:

```ts
await toMd({ name: 'notes.txt', bytes: new Uint8Array([1]), convertedAt: '2026-01-01T00:00:00.000Z' });
// {"error":"oconv: unsupported format (supported: docx, odt, xlsx, ods, pptx, odp, pdf)","usage":true}
```

An invalid `convertedAt`:

```ts
await toMd({ name: 'notes.txt', bytes: new Uint8Array([1]), convertedAt: 'not-a-date' });
// {"error":"invalid timestamp \"not-a-date\": expected an RFC 3339 date-time such as 2026-01-01T00:00:00.000Z","usage":true}
```

See also: [`to-md`](./cli.md#to-md) (CLI), [`to_md`](./mcp.md#to_md) (MCP).
