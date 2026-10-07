# @awacloud/tool-convert

Document conversion (`@awacloud/oconv`) at the command line and over MCP.
The CLI runs on **bun, node and deno**, from a repository checkout or from
an installed copy (see "Running it" below); the MCP server runs on
**bun**.

```bash
bun src/index.ts to-md <file> [--format <fmt>] [--at <iso>] [--out <file>]
bun src/index.ts from-md <file.md> --target <fmt> [--out <file>]
bun src/index.ts convert <file> --target <fmt> [--format <fmt>] [--out <file>]
bun src/index.ts to-html <file.md> [--out <file>]
bun src/index.ts --help | -h
bun src/index.ts --version | -v
```

**Documentation**: the package guide is [`docs/README.md`](./docs/README.md),
the full API reference (core functions, types, CLI verbs, MCP tools) is
[`docs/api/`](./docs/api/README.md), and changes are recorded in
[`CHANGELOG.md`](./CHANGELOG.md).

## Installation

```bash
npm install @awacloud/tool-convert
```

It has no `bin` field: run its entry file
by path with bun, node or deno (see "Running it" below and "Exposed
surface" at the end).

## Quick Start

From the package directory, convert a document to Markdown, then the
Markdown to PDF. `report.docx` below is a file you supply — the published
package ships no sample document; from a repository checkout, the committed
`tests/fixtures/sample.docx` works the same way and is what produced the
output shown:

```bash
bun src/index.ts to-md report.docx --at 2026-01-01T00:00:00.000Z --out report.md
bun src/index.ts from-md report.md --target pdf --out report.pdf
# stderr: convert: 1 loss recorded   (the YAML front matter: frontmatter/stripped)
```

Or from code (the package's only import path is `@awacloud/tool-convert`,
which resolves to `src/core.ts`; the snippet is TypeScript source consumed
as is, so run it with bun):

```ts
import { readFileSync } from 'node:fs';
import { isCoreError, toMd } from '@awacloud/tool-convert';

const result = await toMd({
    name: 'report.docx',
    bytes: new Uint8Array(readFileSync('report.docx')),
    convertedAt: new Date().toISOString(),
});
if (isCoreError(result)) throw new Error(result.error);
console.log(result.lossy, result.markdown.split('\n').find((l) => l.startsWith('# ')));
// false # Sovereign RAG ingestion
```

## Running it

The CLI is one file, `src/index.ts`, runnable directly by each runtime from
a checkout with no build step and no adapter flags — everything
runtime-specific (file I/O, argv, stdout/stderr, exit codes, SIGINT/SIGTERM)
is consolidated in `src/runtime.ts`. Each command line below was actually
run, not inferred:

```bash
# bun
bun src/index.ts to-md file.docx --out file.md

# node — no flags needed (node:fs/node:path/process/import.meta.main
# already give this file everything it uses)
node src/index.ts to-md file.docx --out file.md

# deno — two permissions, each because of a concrete call this CLI makes:
#   --allow-read   readFileSync() on the input file and on ../package.json
#   --allow-write  writeFileSync() when --out is given
# (measured: all four verbs run under --no-prompt with only these two)
deno run --allow-read --allow-write src/index.ts to-md file.docx --out file.md
```

No broader permission (`-A`/`--allow-all`, `--allow-net`) is needed or
requested: this CLI never opens a socket.

**Installed copy**: the published package carries the TypeScript sources
(`src/`) and a plain-JavaScript transpile of them (`dist/`, one file per
source, produced when the package is exported and never committed, so a
checkout has no `dist/`). Node 24.16.0 and Deno 2.8.3 refuse to execute
TypeScript located under a `node_modules` directory
(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so an installed copy runs
through `dist/` on those two and through `src/` on bun:

```bash
node node_modules/@awacloud/tool-convert/dist/index.js to-md file.docx --out file.md
deno run --allow-read --allow-write node_modules/@awacloud/tool-convert/dist/index.js to-md file.docx --out file.md
bun node_modules/@awacloud/tool-convert/src/index.ts to-md file.docx --out file.md
```

`import '@awacloud/tool-convert'` picks the right file by itself: the
`exports` map sends bun to `src/core.ts` and every other runtime to
`dist/core.js`. Measured on an offline install of the packed tarball (and
its packed dependencies) with bun 1.3.13, node 24.16.0 and deno 2.8.3.

**Versions measured**: bun 1.3.13, node 24.16.0, deno 2.8.3 (re-run
2026-10-03, Windows station). `tests/runtime-matrix.integration.test.ts`
runs the same fixture through every runtime installed on the machine and
self-skips the ones that are not (never reports a skipped runtime as
passing) — see that file's module doc for exactly what byte-identity means
for zip-container (`docx`/`odt`) targets, where `@awacloud/oconv`'s zip
writer stamps a wall-clock timestamp per entry (a pre-existing upstream
non-determinism, not a runtime difference: two `bun` runs back to back
already differ the same way). `to-md`, `to-html` and any `pdf` target are
byte-identical outright; `docx`/`odt` targets are identical once that one
known timestamp field is masked out.

**SIGINT/SIGTERM**: `src/runtime.ts` installs both handlers unconditionally
on every runtime. The matrix test's signal-delivery checks self-skip on
Windows (this station) because POSIX signal delivery to a child process via
`child_process.kill('SIGINT'|'SIGTERM')` is documented as unreliable there
for bun, node and deno alike — they were not exercised on this station; a
POSIX host runs them for real.

## Verbs

- **`to-md <file>`** — any supported input format to structured Markdown
  (`@awacloud/oconv`'s `toMd`). Supported input formats: `docx`, `odt`,
  `xlsx`, `ods`, `pptx`, `odp`, `pdf`.
- **`from-md <file.md> --target <fmt>`** — Markdown to a target format
  (`oconv.fromMd`). Supported targets: `docx`, `odt`, `pdf`.
- **`convert <file> --target <fmt>`** — a cross-format pair, direct
  (`oconv.convert`). Supported pairs: `docx>odt`, `odt>docx`, `docx>pdf`,
  `odt>pdf` — no other source/target combination is accepted, including any
  `xlsx`/`ods`/`pptx`/`odp`/`pdf` source and any same-format pair.
- **`to-html <file.md>`** — Markdown to HTML through `@awacloud/md`'s
  `renderHtmlMod` (via the `md` facade's `.renderHtml`) — a plain HTML
  fragment, no embedded CSS, no table of contents. **Safe and sanitised**:
  raw HTML is dropped (a raw block with its content, inline tags keeping
  their text), `javascript:`, `vbscript:`, `file:` and `data:` URLs (images
  included) become an empty `href`/`src`, anything outside the fw sanitiser
  allowlist is removed, and task-list checkboxes stay as disabled inputs
  keeping their checked state.

Format/target detection is by file extension, with an explicit `--format`
override (`to-md`/`convert`) always winning. `convert`'s target is never
derived from `<file>`'s own name — it names the SOURCE, not the target —
and is REQUIRED. Format/target/pair validation is `@awacloud/oconv`'s own:
this tool never duplicates it, it forwards the request and turns a thrown
`Error` into the CLI's exit code + message.

`--at <iso>` (`to-md` only) pins the provenance timestamp that
`oconv.toMd`'s `convertedAt` requires — `@awacloud/oconv` never defaults it
itself (reproducibility of the markdown output is caller-owned). Omit it
for the current instant. It must be a strict RFC 3339 `date-time` (e.g.
`2026-01-01T00:00:00.000Z`, uppercase `T`/`Z`, calendar-valid, no leap
second); anything else is a usage error (exit `2`), checked before any
file is opened. A valid value is kept verbatim, never normalised.

## stdout / stderr discipline

With no `--out`, the converted bytes go to **stdout** so the tool composes
in a shell pipeline. Every diagnostic, warning and the loss count go to
**stderr**. A conversion that records fidelity losses still **exits 0** —
losses are output, not failure. With `--out`, the bytes are written to that
file instead (never duplicated to stdout); the file's bytes are
byte-identical to what stdout would have carried for the same input and
`--at`. No ANSI colour escape is ever written to stdout.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success (including a lossy conversion); `--help` and `--version` always exit 0 |
| 1 | generic error (unknown command, a non-usage runtime failure such as an unreadable input file) |
| 2 | usage/config error (missing command, missing file argument, missing `--target`, an unknown flag or a flag without its value, an invalid `--at`, an unsupported format/target/pair) |
| 130 | SIGINT |
| 143 | SIGTERM |

## Supported-format source of truth

The `oconv` facade of `@awacloud/oconv` is the single source of truth for
which formats/targets/pairs are supported — this tool never hard-codes a
second copy of the *validation*. It forwards the caller's file name and
lets `oconv` detect the format/target itself, never pre-validating, and
turns `oconv`'s own `unsupported format` / `unsupported target` /
`unsupported pair` errors into the CLI's exit code 2.

**One caveat, stated plainly**: `oconv` exposes no *public* constant
listing those formats/targets/pairs — its `SUPPORTED_FORMATS` /
`SUPPORTED_TARGETS` / `SUPPORTED_PAIRS` sets are declared inside its
facade's factory closure and are not part of its published `exports` (the
package root and its worker module only). The lists this tool's `--help` and
error messages print (`docx`, `odt`, `xlsx`, `ods`, `pptx`, `odp`, `pdf` /
`docx`, `odt`, `pdf` / the four cross-format pairs) are a maintained mirror
of `oconv`'s own sets and of its loss matrix and convert guide (linked
under "Bounded claims" below) — for the human-facing hint only, never for
gating a request. The mirror is exported as `TO_MD_FORMATS`,
`FROM_MD_TARGETS` and `CONVERT_PAIRS`.

## Bounded claims

This tool advertises no conversion pair `@awacloud/oconv` does not
measurably deliver, and lossy pairs say so (via the stderr loss count) —
see `@awacloud/oconv`'s
[loss matrix](https://github.com/awacloud/awa/blob/@awacloud/tool-convert@1.0.0/packages/front/office/oconv/docs/loss-matrix.md)
for the fidelity table per pair, and its
[convert guide](https://github.com/awacloud/awa/blob/@awacloud/tool-convert@1.0.0/packages/front/office/oconv/docs/convert.md)
for the cross-format pairs.

## MCP server

`src/mcp.ts` exposes the same four operations as a **stdio, zero-dependency
MCP server** (newline-delimited JSON-RPC 2.0) — same transport discipline,
same error shape, same "one tool call, one measured answer" contract as any
other stdio MCP server, and fully self-contained.

```bash
bun src/mcp.ts
```

The server runs on **bun only**: it reads stdin through `Bun.stdin`, and
under node 24.16.0 and deno 2.8.3 it starts, prints its stderr banner and
exits 1 with `convert-mcp: fatal: Bun is not defined` (measured). It
answers `initialize`, `tools/list`, `tools/call`, `ping` and the two
notification methods; every other method returns `METHOD_NOT_FOUND`. It
never throws across the transport: a bad argument or a failed conversion
both come back as a `tools/call` result with `isError: true` and a
structured `{ "error": "...", "usage": true|false }` JSON payload — the
same distinction `src/core.ts` and the CLI make between a usage/config
error and a generic one.

### Tools

| Tool | Needs | Loses |
|---|---|---|
| `to_md` | `path` **or** (`bytesBase64` + `name`); optional `format`, `includeNotes`, `at`, `outPath` | presentation/layout formatting and most inline styling beyond basic emphasis/headings — see the result's `losses` array |
| `from_md` | `markdown` **or** `path`; required `target`; optional `name`, `outPath` | nothing this step introduces on its own — only as rich as the input Markdown; see `losses` |
| `convert` | `path` **or** (`bytesBase64` + `name`); required `target`; optional `format`, `outPath` | whatever the docx/odt/pdf loss matrix records for that pair — see `losses`; a `pdf` target is one-way |
| `to_html` | `markdown` **or** `path`; optional `outPath` | raw HTML (a block with its content; inline tags keep their text); `javascript:`, `vbscript:`, `file:` and `data:` URLs (images included) become an empty `href`/`src`; anything outside the sanitiser allowlist (task-list checkboxes stay, as disabled inputs); no embedded CSS, no table of contents, no footnotes, front matter or math; no `losses` field — the renderer does not itemise its drops |

The tool names are the MCP tool registry of `src/mcp.ts` (`TOOLS`), not
functions of `src/core.ts`: each tool calls the matching core function
(`toMd`, `fromMd`, `convert`, `toHtml`).

Each tool's full description (returned by `tools/list`) restates its needs
and losses in prose, and its `inputSchema` lists every property with a
one-line description — a model can choose between the four without reading
`src/mcp.ts`.

### Loss data

`to_md`, `from_md` and `convert` are backed by `@awacloud/oconv`, which
tracks fidelity losses per conversion: every successful result of these
three carries `losses` (an array) and `lossy` (a boolean) from `src/core.ts`
— inline with the content, or alongside the file-mode payload described
below, never as a side channel a caller has to opt into. `to_html` carries
no `losses` field: `@awacloud/md`'s renderer drops content (raw HTML,
`javascript:`, `vbscript:`, `file:` and `data:` URLs, anything outside the
sanitiser allowlist) but does not itemise it, so there is no list to
return — the absence is a limit of the renderer, not a lossless render.

### Large-output rule

A conversion result can be far larger than a tool response should carry.
Every tool accepts an optional `outPath`: when given, the output is
**always** written there instead of returned inline (mirrors the CLI's
`--out`). When `outPath` is omitted:

- **Text** output (`to_md`'s markdown, `to_html`'s HTML) under
  `MAX_INLINE_TEXT_CHARS` (100,000 characters) comes back inline
  (`"mode": "inline"`). At or above that size, the full content is written
  to a fresh temp file and the result carries `"mode": "file"`, `outPath`,
  `length` and an explicit `preview` (first 2,000 characters) plus a `note`
  stating the redirection — the preview is a clearly labelled excerpt,
  never a silent cut.
- **Binary** output (`from_md`'s and `convert`'s bytes) under
  `MAX_INLINE_BYTES` (75,000 bytes) is base64-encoded inline
  (`"mode": "inline"`, `bytesBase64`). At or above that size, the full
  bytes are written to a temp file and the result carries `"mode": "file"`,
  `outPath`, `bytesLength` and a `note` — binary output is **never**
  truncated in place of redirection (a truncated document is a corrupt
  one), only redirected, in full.

Temp files created this way are **not** deleted by the server — the caller
may not have read the path yet when the tool call returns; cleanup is the
caller's or the OS's, same as any other tool that hands back a path.

## Tests

The tests live in the repository only (the published package ships no test
file). From the package directory:

```bash
bun test src/ tests/  # everything
```

| Suite | Covers |
|---|---|
| `src/core.test.ts` | each core operation, the error-as-data contract, the `Loss` shape |
| `src/descriptors.test.ts` | the descriptor adapter: real oconv/md arrays pass, malformed entries fail by name |
| `src/timestamp.test.ts` | the strict RFC 3339 check behind `--at` and the `at` MCP argument |
| `src/mcp.test.ts` | MCP dispatch, schemas, large-output helpers |
| `tests/cli.integration.test.ts` | the CLI as a spawned process: streams, `--out`, exit codes |
| `tests/mcp.integration.test.ts` | a real stdio JSON-RPC session |
| `tests/runtime-matrix.integration.test.ts` | bun, node and deno give the same bytes and exit codes |
| `tests/side-effects.integration.test.ts` | importing the package has no side effect (`sideEffects: false`) |
| `tests/docs-mirror.integration.test.ts` | `docs/api/` covers every export, verb and tool; doc links resolve |
| `tests/shipped-surface.integration.test.ts` | the shipped files carry no internal reference; their links resolve; this README's Installation, Licence and Project sections quote the manifest |

## Limitations

- No Bun-compiled single executable — deferred to a future program for
  licence reasons. Node and deno run the CLI directly from source in a
  checkout, same as bun, and from `dist/` in an installed copy (see
  "Running it" above).
- The MCP server runs on bun only (see "MCP server" above).
- The package declares no `bin` field, so installing it puts no command on
  the `PATH`.

## Exposed surface

The package declares exactly one `exports` key, so its import surface is the
single row below; the CLI and the MCP server are entry files you run by
path, not exports.

| Sub-path | Target | Usage |
|---|---|---|
| `@awacloud/tool-convert` | `src/core.ts` (bun), `dist/core.js` (node, deno and any other resolver) | the programmatic API: `toMd`, `fromMd`, `convert`, `toHtml`, `isCoreError`, the format-hint constants `TO_MD_FORMATS`, `FROM_MD_TARGETS`, `CONVERT_PAIRS` and the exported types — see [`docs/api/`](./docs/api/README.md) |

Command entry points (files you run, never imported through the package
name):

- **CLI** — `src/index.ts` (`dist/index.js` for node and deno in an
  installed copy): the four verbs `to-md`, `from-md`, `convert`
  and `to-html`, plus `--help` and `--version`; invoked as "Running it"
  documents. Importing it runs nothing: the CLI body starts only when the
  file is the process entry point.
- **MCP server** — `src/mcp.ts`: the stdio server described under "MCP
  server", started with `bun src/mcp.ts`.

The package's `package.json` declares **no `bin` field**: `npm install`
creates no `convert` command, and the two files above are the whole command
surface. Its `main` field names `src/index.ts`, but `exports` takes
precedence, so `import '@awacloud/tool-convert'` resolves to `src/core.ts`
on bun and to `dist/core.js` elsewhere. `src/runtime.ts`,
`src/descriptors.ts` and `src/timestamp.ts` (and their `dist/` transpiles)
are internal modules of the two entry points, not part of the surface.

## Maturity

`L3`, as declared in `package.json` `awa.maturity`. The package's own
sources are held to a line-coverage floor of 0.92 by the repository coverage
gate (`awa.coverageFloor`); the package itself is private and not yet
published.

## Licence

AGPL-3.0-only — see [`LICENSE`](LICENSE) in this package.

Copyright (c) 2026 AwaCloud SAS

## Project

- Website: https://awaforge.eu
- Source: [`tools/convert`](https://github.com/awacloud/awa/tree/@awacloud/tool-convert@1.0.0/tools/convert)
- Issues: https://github.com/awacloud/awa/issues (the package declares no
  `bugs` URL of its own)
- Security policy and release verification:
  https://github.com/awacloud/awa/blob/@awacloud/tool-convert@1.0.0/SECURITY.md
