# MCP server — `src/mcp.ts`

```bash
bun src/mcp.ts
```

A stdio MCP server that exposes the four operations as tools. It runs on
Bun only, because it reads stdin through `Bun.stdin`.

## Transport

- Newline-delimited JSON-RPC 2.0 on stdin and stdout. Each frame is one
  JSON object on one line.
- stdout carries protocol frames only. On start the server writes one line
  to stderr: `convert-mcp 1.2.0: stdio JSON-RPC MCP server — Ctrl+C to stop`.
- Methods: `initialize`, `tools/list`, `tools/call` and `ping`. The
  notifications `notifications/initialized` and `notifications/cancelled`
  get no response. Any other method gets JSON-RPC error `-32601`. A line
  that is not a JSON-RPC 2.0 request gets `-32700` with `id: null`.
- SIGINT and SIGTERM stop the server with exit code `0`.

```text
→ {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
← {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"convert","version":"1.2.0"}}}
→ {"jsonrpc":"2.0","id":15,"method":"ping"}
← {"jsonrpc":"2.0","id":15,"result":{}}
→ {"jsonrpc":"2.0","id":16,"method":"resources/list"}
← {"jsonrpc":"2.0","id":16,"error":{"code":-32601,"message":"unknown method: resources/list"}}
```

## Results and errors

A `tools/call` result has the MCP shape
`{ content: [{ type: "text", text }], isError }`. `text` is a JSON payload.
The examples below show only the payload, parsed.

- On success `isError` is `false`. The payload carries the output and, for
  `to_md`, `from_md` and `convert`, the loss ledger: `losses` (one
  [`Loss`](./types.md#loss) per occurrence), `lossSummary` (one
  [`LossSummaryEntry`](./types.md#losssummaryentry) per distinct `code` +
  `detail`, with a `count`) and `lossy`. With `"lossView": "summary"` the
  payload leaves `losses` out: a long document's ledger repeats the same
  few losses many times, and the summary stays small (48 losses in six
  groups: about 830 estimated tokens for `losses`, about 140 for
  `lossSummary`).
- On failure `isError` is `true` and the payload is `{ error, usage }`,
  as in [`CoreError`](./types.md#coreerror). The server never fails a
  `tools/call` at the JSON-RPC level.

Argument errors are checked before any conversion runs, and all have
`usage: true`:

| `error` | Cause |
|---|---|
| `unknown tool: <name>` | No tool has that name. |
| `missing required argument: <arg>` | A required argument is absent or `null`. |
| `unknown argument: <arg>` | The argument is not in the tool's schema. |
| `argument <arg>: expected <type>, got <type>` | Wrong JSON type. `<type>` is `string`, `boolean`, `object`, `integer` (a whole number: `argument formOpBudget: expected integer, got number` for `1.5`) or `array of string` (every item must be a string: `argument pdfInfer: expected array of string, got string`). The keys of an object argument and the members of an `enum` are not checked here: `@awacloud/oconv` refuses them during the conversion (`oconv: bad archive limits`, `oconv: bad pdf infer`), also with `usage: true`. |
| `provide either path or bytesBase64` | `to_md` or `convert` got no input. |
| `provide either markdown or path` | `from_md` or `to_html` got no input. |
| `name is required when bytesBase64 is provided (no path to derive it from)` | Inline bytes need a file name for format detection. |
| `argument at: invalid timestamp "…": expected an RFC 3339 date-time such as 2026-01-01T00:00:00.000Z` | `to_md`'s `at` is not a strict RFC 3339 `date-time`. Checked before the input is read. |
| `argument lossView: expected "full" or "summary", got "…"` | `to_md`, `from_md` or `convert` got another `lossView`. Checked before the input is read. |
| `cannot read path: <reason>` | The input path cannot be read. |
| `cannot read pdfPasswordPath: <reason>` | `to_md`'s `pdfPasswordPath` cannot be read. |

## Large-output rule

Every tool accepts `outPath`. When given, the output is always written
there, and the result carries `mode: "file"`, `outPath` and the size.
When `outPath` is omitted:

- **Text** (`to_md`, `to_html`) under 100,000 characters comes back inline,
  with `mode: "inline"`. From 100,000 characters up, the full text is
  written to a new temp file. The result then carries `mode: "file"`,
  `outPath`, `length`, a `preview` of the first 2,000 characters and a
  `note` saying so.
- **Binary** (`from_md`, `convert`) under 75,000 bytes comes back inline as
  `bytesBase64`. From 75,000 bytes up, the full bytes go to a temp file.
  Binary output is never truncated.

The server does not delete the temp files it creates.

## `to_md`

Document to Markdown. Wraps [`toMd`](./toMd.md).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `path` | string | one of `path` / `bytesBase64` | Source file on disk. |
| `bytesBase64` | string | one of `path` / `bytesBase64` | Source bytes, base64. Needs `name`. |
| `name` | string | with `bytesBase64` | Source file name, for format detection. |
| `format` | string | no | `docx`, `odt`, `xlsx`, `ods`, `pptx`, `odp` or `pdf`. |
| `includeNotes` | boolean | no | `pptx` and `odp`: include speaker notes. Default `false`; ignored on another format (no error). |
| `sheets` | string | no | `xlsx` and `ods` only: `table` (default), `csv` or `tsv` — each sheet as a fenced `csv` / `tsv` block instead of a GFM table. Another value or format is a usage error. |
| `pdfInfer` | array of string | no | `pdf` only: `headings`, `tables`, `running` — inference on an untagged pdf. |
| `pdfDeclare` | array of string | no | `pdf` only: `positional` records one `struct/positional` loss when the structure was built from positions. |
| `pdfInclude` | array of string | no | `pdf` only: `images` places each JPEG, JPEG 2000 and raw-pixel picture as a Markdown image (write them with `assetsDir`). |
| `pdfRecoverXref` | boolean | no | `pdf` only: `true` rebuilds an unusable cross-reference chain. |
| `pdfLineHyphens` | string | no | `pdf` only: `drop` or `keep` — a word a hyphen cuts at a line end is joined without or with the hyphen. |
| `pdfPasswordPath` | string | no | `pdf` only: a file holding the user or owner password of an encrypted pdf; one trailing line break is dropped. No argument takes the password itself. |
| `formOpBudget` | integer | no | `pdf` only: the per-page Form XObject operator budget, default `1000000`. |
| `sheetCellBudget` | integer | no | `xlsx` / `ods` only: a sheet whose padded table would hold more cells is written unpadded, one `<A1 address>: <text>` line per value (`sheet/sparse-form`). |
| `archiveLimits` | object | no | office formats only (a `pdf` source is a usage error): `{ maxParts, maxUncompressed, maxRatio, maxDepth }`, any of them, non-negative integers, the reader's archive limits (`0` disables a check). Defaults: `maxParts` 8192 (docx, xlsx, pptx) or 4096 (odt, ods, odp), `maxUncompressed` 256 MiB, `maxRatio` 200, `maxDepth` 1000 (docx, xlsx, pptx only). A limit the document exceeds is a conversion error (`OPC: too many parts in archive`, `usage: false`). |
| `outputBudget` | object | no | every format: `{ bytes, overflow }` — `bytes` a positive integer, `overflow` `"throw"` (default) or `"truncate"`. Past `bytes` of text the conversion fails (`oconv: output too large`, `usage: false`), or with `overflow: "truncate"` keeps what fits (`doc/truncated`). `overflow` without `bytes` is a usage error (`oconv: bad output budget`). |
| `odtInclude` | array of string | no | `odt` only: `toc` reads a table of contents' entries as paragraphs. |
| `docxInclude` | array of string | no | `docx` only: `toc` reads a table of contents control's entries as paragraphs. |
| `frontMatter` | string | no | `full` (default), `compact` (the loss ledger counted per code and detail) or `none` (the body alone). |
| `assetsDir` | string | no | Write each image whose bytes the conversion returned under this directory, at the path the markdown names ([`assetFiles`](./assetFiles.md)). The result lists them as `assets: [{ name, path, bytesLength }]` and the unwritten ones as `assetsSkipped: [{ name, reason }]`. |
| `at` | string | no | RFC 3339 `date-time`, e.g. `2026-01-01T00:00:00.000Z`. Default: now. Any other value is a usage error, checked before the input is read. |
| `outPath` | string | no | Write the Markdown here. |
| `lossView` | string | no | `full` (default): `losses` and `lossSummary`. `summary`: `lossSummary` only, no `losses` key — recommended, since `losses` grows with the document. Any other value is a usage error, checked before the input is read. |

```text
to_md {"path":"tests/fixtures/sample.docx","at":"2026-01-01T00:00:00.000Z"}
isError=false {"losses":[],"lossSummary":[],"lossy":false,"mode":"inline","markdown":"---\nprofile: v1\nir: oconv-ir/v1\nsourceFormat: docx\nsourceNam…","length":674}

to_md {"path":"tests/fixtures/sample.docx","at":"2026-01-01T00:00:00.000Z","outPath":"sample.md"}
isError=false {"losses":[],"lossSummary":[],"lossy":false,"mode":"file","outPath":"sample.md","length":674,"note":"written to outPath as requested"}

to_md {"bytesBase64":"AQID"}
isError=true {"error":"name is required when bytesBase64 is provided (no path to derive it from)","usage":true}

to_md {"path":"tests/fixtures/sample.docx","lossView":"grouped"}
isError=true {"error":"argument lossView: expected \"full\" or \"summary\", got \"grouped\"","usage":true}

to_md {"path":"tests/fixtures/sample.docx","at":"not-a-date"}
isError=true {"error":"argument at: invalid timestamp \"not-a-date\": expected an RFC 3339 date-time such as 2026-01-01T00:00:00.000Z","usage":true}
```

The `toMd` options (`picture.pdf` holds one JPEG picture, `locked.pdf` is
encrypted and `password.txt` holds its user password):

```text
to_md {"path":"picture.pdf","at":"2026-01-01T00:00:00.000Z","pdfInclude":["images"],"frontMatter":"none","assetsDir":".","lossView":"summary"}
isError=false {"lossSummary":[],"lossy":false,"assets":[{"name":"image-7.jpg","path":"image-7.jpg","bytesLength":10}],"assetsSkipped":[],"mode":"inline","markdown":"Fixture page text\n\n![](image-7.jpg)\n","length":36}

to_md {"path":"locked.pdf","at":"2026-01-01T00:00:00.000Z","pdfPasswordPath":"password.txt","frontMatter":"none","lossView":"summary"}
isError=false {"lossSummary":[],"lossy":false,"mode":"inline","markdown":"Fixture page text\n","length":18}

to_md {"path":"tests/fixtures/sample.docx","pdfInfer":["headings"]}
isError=true {"error":"oconv: pdf infer needs format pdf","usage":true}

to_md {"path":"picture.pdf","pdfInfer":"headings"}
isError=true {"error":"argument pdfInfer: expected array of string, got string","usage":true}

to_md {"path":"picture.pdf","formOpBudget":1.5}
isError=true {"error":"argument formOpBudget: expected integer, got number","usage":true}

to_md {"path":"tests/fixtures/sample.docx","outputBudget":{"bytes":10}}
isError=true {"error":"oconv: output too large","usage":false}

to_md {"path":"tests/fixtures/sample.docx","outputBudget":{"bytes":10,"overflow":"truncate"},"frontMatter":"none","lossView":"summary"}
isError=false {"lossSummary":[{"code":"doc/truncated","detail":"kept 0 bytes of text; 6 blocks and 0 table rows dropped","count":1}],"lossy":true,"mode":"inline","markdown":"","length":0}
```

## `from_md`

Markdown to a document. Wraps [`fromMd`](./fromMd.md).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `markdown` | string | one of `markdown` / `path` | Markdown text. |
| `path` | string | one of `markdown` / `path` | Markdown file on disk. |
| `target` | string | yes | `docx`, `odt` or `pdf`. |
| `name` | string | no | Output file name. |
| `outPath` | string | no | Write the document here. |
| `lossView` | string | no | `full` (default): `losses` and `lossSummary`. `summary`: `lossSummary` only, no `losses` key — recommended, since `losses` grows with the document. Any other value is a usage error, checked before the input is read. |

```text
from_md {"markdown":"# Hello\n\n- [x] shipped\n","target":"docx"}
isError=false {"target":"docx","losses":[],"lossSummary":[],"lossy":false,"mode":"inline","bytesBase64":"UEsDBBQAAAAI…","bytesLength":2657}

from_md {"path":"note.md","target":"pdf","outPath":"note.pdf"}
isError=false {"target":"pdf","losses":[{"index":"2","kind":"list","code":"list/task-marker-dropped","detail":"[x]"}],"lossSummary":[{"code":"list/task-marker-dropped","detail":"[x]","count":1}],"lossy":true,"mode":"file","outPath":"note.pdf","bytesLength":1190,"note":"written to outPath as requested"}

from_md {"markdown":"<div>a</div>\n\n<div>b</div>\n\nText <br> x.\n","target":"docx","lossView":"summary"}
isError=false {"target":"docx","lossSummary":[{"code":"block/dropped","detail":"html_block","count":2},{"code":"inline/dropped","detail":"html_inline","count":1}],"lossy":true,"mode":"inline","bytesBase64":"UEsDBBQAAAAI…","bytesLength":2016}
```

## `convert`

Document to document. Wraps [`convert`](./convert.md). Pairs: `docx>odt`,
`odt>docx`, `docx>pdf`, `odt>pdf`.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `path` | string | one of `path` / `bytesBase64` | Source file on disk. |
| `bytesBase64` | string | one of `path` / `bytesBase64` | Source bytes, base64. Needs `name`. |
| `name` | string | with `bytesBase64` | Source file name, for format detection. |
| `format` | string | no | Source format. |
| `target` | string | yes | `odt`, `docx` or `pdf`. |
| `outPath` | string | no | Write the document here. |
| `lossView` | string | no | `full` (default): `losses` and `lossSummary`. `summary`: `lossSummary` only, no `losses` key — recommended, since `losses` grows with the document. Any other value is a usage error, checked before the input is read. |

```text
convert {"path":"tests/fixtures/sample.docx","target":"odt"}
isError=false {"format":"docx","target":"odt","losses":[],"lossSummary":[],"lossy":false,"mode":"inline","bytesBase64":"UEsDBBQAAAAA…","bytesLength":2498}

convert {"path":"tests/fixtures/sample.docx","target":"pdf","lossView":"summary"}
isError=false {"format":"docx","target":"pdf","lossSummary":[],"lossy":false,"mode":"inline","bytesBase64":"JVBERi0yLjAK…","bytesLength":1636}

convert {"path":"tests/fixtures/sample.docx","target":"docx"}
isError=true {"error":"oconv: unsupported pair (supported: docx>odt, odt>docx, docx>pdf, odt>pdf)","usage":true}

convert {"path":"tests/fixtures/sample.docx"}
isError=true {"error":"missing required argument: target","usage":true}
```

## `to_html`

Markdown to an HTML fragment. Wraps [`toHtml`](./toHtml.md): safe and
sanitised (raw HTML dropped, dangerous URL schemes neutralised, fw
sanitiser pass). The result has no `losses` field: the render drops content
it does not itemise (see [`toHtml`](./toHtml.md)).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `markdown` | string | one of `markdown` / `path` | Markdown text. |
| `path` | string | one of `markdown` / `path` | Markdown file on disk. |
| `outPath` | string | no | Write the HTML here. |

```text
to_html {"markdown":"# Hello\n\nA *short* note.\n"}
isError=false {"mode":"inline","html":"<h1>Hello</h1>\n<p>A <em>short</em> note.</p>\n","length":45}

to_html {"markdown":42}
isError=true {"error":"argument markdown: expected string, got number","usage":true}

to_html {"markdown":"# x","bogus":1}
isError=true {"error":"unknown argument: bogus","usage":true}
```
