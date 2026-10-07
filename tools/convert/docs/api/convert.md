# `convert`

Converts a document directly to another format through
`@awacloud/oconv`'s `convert`. The result carries no Markdown.

```ts
function convert(input: ConvertInput): Promise<ConvertResult>
```

Four pairs are supported: `docx>odt`, `odt>docx`, `docx>pdf` and
`odt>pdf`. No other pair is accepted, including a same-format pair.

## Input — [`ConvertInput`](./types.md#convertinput)

| Field | Type | Required | Meaning |
|---|---|---|---|
| `bytes` | `Uint8Array` | yes | The source file's bytes. |
| `target` | `string` | yes | `docx`, `odt` or `pdf`. Never derived: `name` names the source. |
| `name` | `string` | no | Source file name. Its extension picks the source format when `format` is omitted. |
| `format` | `string` | no | `docx` or `odt`. Wins over the extension of `name`. |

## Output — [`ConvertResult`](./types.md#convertresult)

On success, a [`ConvertOutput`](./types.md#convertoutput):

| Field | Type | Meaning |
|---|---|---|
| `error` | `null` | Marks success. |
| `bytes` | `Uint8Array` | The converted document. `pdf` output is byte-reproducible. `docx` and `odt` output is a zip whose entry timestamps change on every call. |
| `format` | `string` | The resolved source format. |
| `target` | `string` | The resolved target. |
| `losses` | [`Loss[]`](./types.md#loss) | Reader losses, then writer losses. |
| `lossy` | `boolean` | `losses.length > 0`. |

On failure, a [`CoreError`](./types.md#coreerror). The function never
throws.

## Errors

| `error` | `usage` | Cause |
|---|---|---|
| `oconv: unsupported pair (supported: docx>odt, odt>docx, docx>pdf, odt>pdf)` | `true` | The source/target pair is not one of the four. |
| `oconv: unsupported format (supported: docx, odt, xlsx, ods, pptx, odp, pdf)` | `true` | The source format cannot be resolved. |
| `oconv: unsupported target (supported: docx, odt, pdf)` | `true` | `target` is not a supported target. |
| a reader message, e.g. `OPC: failed to unzip archive: invalid zip data` | `false` | The bytes are not a valid file of the detected format. |
| `internal/descriptor: …` | `false` | A module descriptor from `@awacloud/oconv` is malformed (packaging defect). |

## Example

```ts
import { readFileSync } from 'node:fs';
import { convert } from '@awacloud/tool-convert';

const bytes = new Uint8Array(readFileSync('tests/fixtures/sample.docx'));
const odt = await convert({ bytes, name: 'sample.docx', target: 'odt' });
console.log(odt.error, odt.format, odt.target, odt.bytes.byteLength, odt.lossy);

const pdf = await convert({ bytes, name: 'sample.docx', target: 'pdf' });
console.log(pdf.format, pdf.target, pdf.bytes.byteLength, pdf.lossy);
```

Output:

```text
null docx odt 1989 false
docx pdf 1555 false
```

Errors:

```ts
await convert({ bytes, name: 'sample.docx', target: 'docx' });
// {"error":"oconv: unsupported pair (supported: docx>odt, odt>docx, docx>pdf, odt>pdf)","usage":true}
await convert({ bytes: new Uint8Array([1, 2, 3]), name: 'broken.docx', target: 'odt' });
// {"error":"OPC: failed to unzip archive: invalid zip data","usage":false}
```

See also: [`convert`](./cli.md#convert) (CLI), [`convert`](./mcp.md#convert) (MCP).
