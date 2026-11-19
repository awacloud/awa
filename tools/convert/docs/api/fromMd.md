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
| `pdfA` | `string` | no | pdf target: `'4'` or `'2b'` — claim PDF/A-4 or PDF/A-2b (XMP metadata, an sRGB output intent, every font embedded). Without `pdfFonts`, the Liberation faces of the optional package `@awacloud/oconv-fonts` are used when it is installed; when it is not, a usage error `pdfA: no embeddable face: regular.ttf, bold.ttf, italic.ttf, boldItalic.ttf and mono.ttf are needed. Install the optional package (npm i @awacloud/oconv-fonts) for the Liberation faces, or pass --pdf-fonts <dir> (pdfFonts) with your own.` before converting. |
| `pdfUA` | `number` | no | pdf target: `1` or `2` — claim PDF/UA-1 or PDF/UA-2, a tagged document (headings, paragraphs, lists, tables, pictures with their alt text; the title from the front matter or the first heading). Needs `pdfFonts` and `pdfLang`: without them, a usage error. |
| `pdfLang` | `string` | no | pdf target: the document language under `pdfUA` (a BCP 47 tag); without `pdfUA`, a usage error. |
| `pdfFonts` | [`PdfFonts`](./types.md#pdffonts) | no | pdf target: the TrueType faces to embed, per style class; a class without one is drawn in a Standard 14 font, which `pdfA` refuses. |

## Output — [`FromMdResult`](./types.md#frommdresult)

On success, a [`FromMdOutput`](./types.md#frommdoutput):

| Field | Type | Meaning |
|---|---|---|
| `error` | `null` | Marks success. |
| `bytes` | `Uint8Array` | The document. The output is byte-reproducible for every target: the same input gives the same bytes, and `docx` and `odt` zip entries carry a fixed date. |
| `target` | `string` | The resolved target. |
| `losses` | [`Loss[]`](./types.md#loss) | What the conversion could not carry across. |
| `lossSummary` | [`LossSummaryEntry[]`](./types.md#losssummaryentry) | `losses` grouped by `code` + `detail`, with a count, in order of first occurrence. |
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
console.log(JSON.stringify(lossy.lossSummary));
```

Output:

```text
null pdf 1086 %PDF-2.0 false
docx 2071
[{"code":"block/dropped","detail":"html_block"}]
[{"code":"block/dropped","detail":"html_block","count":1}]
```

An unsupported target:

```ts
await fromMd({ markdown: '# x', target: 'xlsx' });
// {"error":"oconv: unsupported target (supported: docx, odt, pdf)","usage":true}
```

See also: [`from-md`](./cli.md#from-md) (CLI), [`from_md`](./mcp.md#from_md) (MCP).
