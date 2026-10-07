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
  to stderr: `convert-mcp 1.0.0: stdio JSON-RPC MCP server — Ctrl+C to stop`.
- Methods: `initialize`, `tools/list`, `tools/call` and `ping`. The
  notifications `notifications/initialized` and `notifications/cancelled`
  get no response. Any other method gets JSON-RPC error `-32601`. A line
  that is not a JSON-RPC 2.0 request gets `-32700` with `id: null`.
- SIGINT and SIGTERM stop the server with exit code `0`.

```text
→ {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
← {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"convert","version":"1.0.0"}}}
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
  `to_md`, `from_md` and `convert`, the loss ledger (`losses`, `lossy`).
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
| `argument <arg>: expected <type>, got <type>` | Wrong JSON type. |
| `provide either path or bytesBase64` | `to_md` or `convert` got no input. |
| `provide either markdown or path` | `from_md` or `to_html` got no input. |
| `name is required when bytesBase64 is provided (no path to derive it from)` | Inline bytes need a file name for format detection. |
| `argument at: invalid timestamp "…": expected an RFC 3339 date-time such as 2026-01-01T00:00:00.000Z` | `to_md`'s `at` is not a strict RFC 3339 `date-time`. Checked before the input is read. |
| `cannot read path: <reason>` | The input path cannot be read. |

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
| `includeNotes` | boolean | no | `pptx` and `odp` only: include speaker notes. |
| `at` | string | no | RFC 3339 `date-time`, e.g. `2026-01-01T00:00:00.000Z`. Default: now. Any other value is a usage error, checked before the input is read. |
| `outPath` | string | no | Write the Markdown here. |

```text
to_md {"path":"tests/fixtures/sample.docx","at":"2026-01-01T00:00:00.000Z"}
isError=false {"losses":[],"lossy":false,"mode":"inline","markdown":"---\nprofile: v1\nir: oconv-ir/v1\nsourceFormat: docx\nsourceNam…","length":674}

to_md {"path":"tests/fixtures/sample.docx","at":"2026-01-01T00:00:00.000Z","outPath":"sample.md"}
isError=false {"losses":[],"lossy":false,"mode":"file","outPath":"sample.md","length":674,"note":"written to outPath as requested"}

to_md {"bytesBase64":"AQID"}
isError=true {"error":"name is required when bytesBase64 is provided (no path to derive it from)","usage":true}

to_md {"path":"tests/fixtures/sample.docx","at":"not-a-date"}
isError=true {"error":"argument at: invalid timestamp \"not-a-date\": expected an RFC 3339 date-time such as 2026-01-01T00:00:00.000Z","usage":true}
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

```text
from_md {"markdown":"# Hello\n\n- [x] shipped\n","target":"docx"}
isError=false {"target":"docx","losses":[{"code":"list/task-marker-dropped","detail":"[x]"}],"lossy":true,"mode":"inline","bytesBase64":"UEsDBBQAAAAI…","bytesLength":1958}

from_md {"path":"note.md","target":"pdf","outPath":"note.pdf"}
isError=false {"target":"pdf","losses":[{"code":"list/task-marker-dropped","detail":"[x]"}],"lossy":true,"mode":"file","outPath":"note.pdf","bytesLength":1136,"note":"written to outPath as requested"}
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

```text
convert {"path":"tests/fixtures/sample.docx","target":"odt"}
isError=false {"format":"docx","target":"odt","losses":[],"lossy":false,"mode":"inline","bytesBase64":"UEsDBBQAAAAA…","bytesLength":1989}

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
