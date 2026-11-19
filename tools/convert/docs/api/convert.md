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
| `layout` | `boolean` | no | docx → odt: carry the page (size, orientation, margins) the paragraphs' alignment and page breaks, and the runs' size, font, colour, underline and script to the odt — `oconv.convert`'s opt-in tier 3. On another pair, or not a boolean, a usage error. |
| `pdfA` | `string` | no | pdf target: `'4'` or `'2b'` — claim PDF/A-4 or PDF/A-2b (XMP metadata, an sRGB output intent, every font embedded). Without `pdfFonts`, the Liberation faces of the optional package `@awacloud/oconv-fonts` are used when it is installed; when it is not, a usage error `pdfA: no embeddable face: regular.ttf, bold.ttf, italic.ttf, boldItalic.ttf and mono.ttf are needed. Install the optional package (npm i @awacloud/oconv-fonts) for the Liberation faces, or pass --pdf-fonts <dir> (pdfFonts) with your own.` before converting. |
| `pdfUA` | `number` | no | pdf target: `1` or `2` — claim PDF/UA-1 or PDF/UA-2, a tagged document (headings, paragraphs, lists, tables, pictures with their alt text; the title from the front matter or the first heading). Needs `pdfFonts` and `pdfLang`: without them, a usage error. |
| `pdfLang` | `string` | no | pdf target: the document language under `pdfUA` (a BCP 47 tag); without `pdfUA`, a usage error. |
| `pdfFonts` | [`PdfFonts`](./types.md#pdffonts) | no | pdf target: the TrueType faces to embed, per style class; a class without one is drawn in a Standard 14 font, which `pdfA` refuses. |

## Output — [`ConvertResult`](./types.md#convertresult)

On success, a [`ConvertOutput`](./types.md#convertoutput):

| Field | Type | Meaning |
|---|---|---|
| `error` | `null` | Marks success. |
| `bytes` | `Uint8Array` | The converted document. The output is byte-reproducible for every target: the same input gives the same bytes, and `docx` and `odt` zip entries carry a fixed date. |
| `format` | `string` | The resolved source format. |
| `target` | `string` | The resolved target. |
| `losses` | [`Loss[]`](./types.md#loss) | Reader losses, then writer losses. |
| `lossSummary` | [`LossSummaryEntry[]`](./types.md#losssummaryentry) | `losses` grouped by `code` + `detail`, with a count, in order of first occurrence. |
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
null docx odt 2498 false
docx pdf 1636 false
```

Errors:

```ts
await convert({ bytes, name: 'sample.docx', target: 'docx' });
// {"error":"oconv: unsupported pair (supported: docx>odt, odt>docx, docx>pdf, odt>pdf)","usage":true}
await convert({ bytes: new Uint8Array([1, 2, 3]), name: 'broken.docx', target: 'odt' });
// {"error":"OPC: failed to unzip archive: invalid zip data","usage":false}
```

See also: [`convert`](./cli.md#convert) (CLI), [`convert`](./mcp.md#convert) (MCP).
