# `fromMd`

Converts Markdown to a document through `@awacloud/oconv`'s `fromMd`.

```ts
function fromMd(input: FromMdInput): Promise<FromMdResult>
```

## Input — [`FromMdInput`](./types.md#frommdinput)

| Field | Type | Required | Meaning |
|---|---|---|---|
| `markdown` | `string` | yes | The Markdown source. |
| `target` | `string` | one of the two | `docx`, `odt` or `pdf`. Wins over the extension of `name`. |
| `name` | `string` | one of the two | Output file name. Its extension picks the target when `target` is omitted. |

## Output — [`FromMdResult`](./types.md#frommdresult)

On success, a [`FromMdOutput`](./types.md#frommdoutput):

| Field | Type | Meaning |
|---|---|---|
| `error` | `null` | Marks success. |
| `bytes` | `Uint8Array` | The document. `pdf` output is byte-reproducible. `docx` and `odt` output is a zip whose entry timestamps change on every call. |
| `target` | `string` | The resolved target. |
| `losses` | [`Loss[]`](./types.md#loss) | What the conversion could not carry across. |
| `lossy` | `boolean` | `losses.length > 0`. |

On failure, a [`CoreError`](./types.md#coreerror). The function never
throws.

## Errors

| `error` | `usage` | Cause |
|---|---|---|
| `oconv: unsupported target (supported: docx, odt, pdf)` | `true` | `target` is not supported, or neither `target` nor `name` gives one. |
| `internal/descriptor: …` | `false` | A module descriptor from `@awacloud/oconv` is malformed (packaging defect). |

## Example

```ts
import { fromMd } from '@awacloud/tool-convert';

const pdf = await fromMd({ markdown: '# Hello\n\nA *short* note.\n', target: 'pdf' });
console.log(pdf.error, pdf.target, pdf.bytes.byteLength, new TextDecoder().decode(pdf.bytes.slice(0, 8)), pdf.lossy);

const docx = await fromMd({ markdown: '# Hello\n\nA *short* note.\n', name: 'note.docx' });
console.log(docx.target, docx.bytes.byteLength);

const lossy = await fromMd({ markdown: '# T\n\n<div>raw html</div>\n', target: 'docx' });
console.log(JSON.stringify(lossy.losses));
```

Output:

```text
null pdf 1032 %PDF-2.0 false
docx 1016
[{"code":"block/dropped","detail":"html_block"}]
```

An unsupported target:

```ts
await fromMd({ markdown: '# x', target: 'xlsx' });
// {"error":"oconv: unsupported target (supported: docx, odt, pdf)","usage":true}
```

See also: [`from-md`](./cli.md#from-md) (CLI), [`from_md`](./mcp.md#from_md) (MCP).
