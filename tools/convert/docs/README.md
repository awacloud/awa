# `@awacloud/tool-convert` — documentation

`@awacloud/tool-convert` converts office documents to and from Markdown.
It has three faces over one core:

- a **command-line tool** (`src/index.ts`);
- a **stdio MCP server** (`src/mcp.ts`) that exposes the same operations
  to an AI client;
- a **programmatic core** (`src/core.ts`, the package's `.` export).

The conversions themselves are done by `@awacloud/oconv`, and the HTML
rendering by `@awacloud/md`. This package adds no conversion logic of its
own. It adds file and stream handling, exit codes, and the MCP transport.

## Runtimes

| Face | Bun | Node | Deno |
|---|---|---|---|
| CLI (`src/index.ts`) | ✅ 1.3.13 | ✅ 24.16.0 | ✅ 2.8.3 |
| Core (`@awacloud/tool-convert`) | ✅ `src/core.ts` | ✅ `dist/core.js` | ✅ `dist/core.js` |
| MCP server (`src/mcp.ts`) | ✅ | — | — |

The versions are the ones measured. The package's `engines` field declares
them as minimums. In a repository checkout every runtime runs `src/`. The
published package also carries `dist/`, a plain-JavaScript transpile of
`src/` produced when the package is exported: Node and Deno refuse to run
TypeScript under `node_modules`, so an installed copy runs `dist/` on them,
and the package's `exports` map picks `src/` for Bun and `dist/` for the
rest. `tests/runtime-matrix.integration.test.ts` runs the same
fixture through every runtime installed on the machine and checks that the
output bytes match. For `docx` and `odt` output it first masks the zip
timestamp fields, which change on every run.

The MCP server reads its input through `Bun.stdin`, so it runs on Bun only.

On Deno the CLI needs two permissions: `--allow-read` for the input file
and `package.json`, and `--allow-write` for `--out`. All four verbs were
measured to run on Deno 2.8.3 under `--no-prompt` with only those two. The
CLI never opens a socket.

```bash
deno run --allow-read --allow-write src/index.ts to-md report.docx --out report.md
```

## Operations

| Operation | CLI verb | MCP tool | Core function | Source → target |
|---|---|---|---|---|
| Document to Markdown | [`to-md`](./api/cli.md#to-md) | [`to_md`](./api/mcp.md#to_md) | [`toMd`](./api/toMd.md) | `docx`, `odt`, `xlsx`, `ods`, `pptx`, `odp`, `pdf` → Markdown |
| Markdown to document | [`from-md`](./api/cli.md#from-md) | [`from_md`](./api/mcp.md#from_md) | [`fromMd`](./api/fromMd.md) | Markdown → `docx`, `odt`, `pdf` |
| Document to document | [`convert`](./api/cli.md#convert) | [`convert`](./api/mcp.md#convert) | [`convert`](./api/convert.md) | `docx>odt`, `odt>docx`, `docx>pdf`, `odt>pdf` |
| Markdown to HTML | [`to-html`](./api/cli.md#to-html) | [`to_html`](./api/mcp.md#to_html) | [`toHtml`](./api/toHtml.md) | Markdown → HTML fragment |

The full reference is in [`api/`](./api/README.md).

`to-html` emits a plain HTML fragment. It has no embedded CSS and no table
of contents.

## The loss ledger

A conversion can lose something: a raw HTML block that Word has no place
for, an image whose bytes are not available, a task-list checkbox. Every
`@awacloud/oconv`-backed result says so. It never drops content silently.

- `losses` is an array of [`Loss`](./api/types.md#loss) records, in
  document order: reader losses first, then writer losses.
- `lossy` is `true` exactly when `losses` is not empty.
- A lossy conversion is still a **success**. The CLI exits `0` and prints
  the count on stderr (`convert: 1 loss recorded`). The MCP result carries
  the full array next to the output.
- `to-html` has no ledger. Its render drops raw HTML and unsafe URLs but
  does not itemise them, so there is nothing it can list — see
  [`toHtml`](./api/toHtml.md).

Measured example: a task-list item going to `docx`.

```json
{ "losses": [{ "code": "list/task-marker-dropped", "detail": "[x]" }], "lossy": true }
```

`@awacloud/oconv`'s `docs/loss-matrix.md` gives the fidelity table for each
format pair.

## Errors

The core never throws. Each operation returns either its output
(`error: null`) or a [`CoreError`](./api/types.md#coreerror)
`{ error, usage }`. `usage: true` marks a caller mistake, such as an
unsupported format, target or pair. The CLI maps it to exit code `2` and
every other failure to `1`. The MCP server returns both as an
`isError: true` result carrying the same payload.

## Licence

AGPL-3.0-only. See [`LICENSE`](../LICENSE) and [`NOTICE`](../NOTICE).
