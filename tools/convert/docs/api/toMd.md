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
| `includeNotes` | `boolean` | no | `pptx` and `odp` only: include speaker notes. Default `false`. |

## Output — [`ToMdResult`](./types.md#tomdresult)

On success, a [`ToMdOutput`](./types.md#tomdoutput):

| Field | Type | Meaning |
|---|---|---|
| `error` | `null` | Marks success. |
| `markdown` | `string` | The Markdown, with a YAML front matter block giving provenance and heading anchors. |
| `losses` | [`Loss[]`](./types.md#loss) | What the conversion could not carry across. |
| `lossy` | `boolean` | `losses.length > 0`. |

On failure, a [`CoreError`](./types.md#coreerror). The function never
throws.

## Errors

| `error` | `usage` | Cause |
|---|---|---|
| `oconv: unsupported format (supported: docx, odt, xlsx, ods, pptx, odp, pdf)` | `true` | Neither `format` nor the extension of `name` is a supported input format. |
| `invalid timestamp "…": expected an RFC 3339 date-time such as 2026-01-01T00:00:00.000Z` | `true` | `convertedAt` is not a strict RFC 3339 `date-time`. Checked before the conversion runs. |
| a reader message, e.g. `OPC: failed to unzip archive: invalid zip data` | `false` | The bytes are not a valid file of the detected format. |
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
converterVersion: 1.0.0
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
