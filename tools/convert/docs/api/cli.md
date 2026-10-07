# CLI — `src/index.ts`

```text
bun src/index.ts to-md <file> [--format <fmt>] [--at <iso>] [--out <file>]
bun src/index.ts from-md <file.md> --target <fmt> [--out <file>]
bun src/index.ts convert <file> --target <fmt> [--format <fmt>] [--out <file>]
bun src/index.ts to-html <file.md> [--out <file>]
bun src/index.ts --help | -h
bun src/index.ts --version | -v
```

`node src/index.ts …` takes the same arguments. So does
`deno run --allow-read --allow-write src/index.ts …`. See
[Runtimes](../README.md#runtimes).

## Streams

- With no `--out`, the output goes to **stdout**, so the tool works in a
  pipeline. With `--out`, it goes to that file only. The file's bytes match
  what stdout would have carried.
- Diagnostics and the loss count go to **stderr**.
- A lossy conversion still exits `0`. The count is printed on stderr as
  `convert: N loss recorded` or `convert: N losses recorded`.
- No ANSI escape is ever written to stdout.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success, including a lossy conversion; `--help`; `--version`. |
| `1` | Unknown command, unreadable input file, or a conversion failure that is not a usage error. |
| `2` | Usage error: no command, missing file argument, unknown flag, flag without a value, missing `--target`, an unsupported format/target/pair, or an invalid `--at` (checked before any file I/O). |
| `130` | SIGINT. |
| `143` | SIGTERM. |

## Flags

| Flag | Verbs | Meaning |
|---|---|---|
| `--format <fmt>` | `to-md`, `convert` | Source format. Wins over the file extension. |
| `--target <fmt>` | `from-md` (required), `convert` (required) | Target format. |
| `--at <iso>` | `to-md` | Timestamp written into the front matter. Default: the current time. Must be a strict RFC 3339 `date-time` (e.g. `2026-01-01T00:00:00.000Z`); anything else is a usage error, checked before any file I/O. Pin it for reproducible output. |
| `--out <file>` | all | Write the output to this file instead of stdout. |
| `--help`, `-h` | — | Print usage to stdout and exit `0`. |
| `--version`, `-v` | — | Print the package version to stdout and exit `0`. |

## `to-md`

Document to Markdown. Wraps [`toMd`](./toMd.md). Input formats: `docx`,
`odt`, `xlsx`, `ods`, `pptx`, `odp`, `pdf`. The format comes from the file
extension unless `--format` is given.

```console
$ bun src/index.ts to-md tests/fixtures/sample.docx --at 2026-01-01T00:00:00.000Z --out sample.md
$ echo $?
0
$ tail -3 sample.md
### Chunking

Sections are stable anchors for the retriever.
```

Without `--out`, the same 674 bytes go to stdout. The front matter and
body are shown in [`toMd`](./toMd.md#example).

```console
$ bun src/index.ts to-md note.md
convert: oconv: unsupported format (supported: docx, odt, xlsx, ods, pptx, odp, pdf)
$ echo $?
2
```

`--at` is checked before the file is even opened — a bad value or a
missing input file both exit `2`, but the `--at` message wins:

```console
$ bun src/index.ts to-md tests/fixtures/sample.docx --at not-a-date
convert: --at: invalid timestamp "not-a-date": expected an RFC 3339 date-time such as 2026-01-01T00:00:00.000Z
$ echo $?
2
```

## `from-md`

Markdown to a document. Wraps [`fromMd`](./fromMd.md). Targets: `docx`,
`odt`, `pdf`. `--target` is required.

`note.md` below holds `# Hello`, `A *short* note.` and a `- [x] shipped`
task item.

```console
$ bun src/index.ts from-md note.md --target docx --out note.docx
convert: 1 loss recorded
$ echo $?
0
$ bun src/index.ts from-md note.md --target pdf | head -c 8
convert: 1 loss recorded
%PDF-2.0
```

The loss is the task checkbox (`list/task-marker-dropped`), which neither
target can carry.

```console
$ bun src/index.ts from-md note.md
convert: from-md requires --target
$ echo $?
2
$ bun src/index.ts from-md note.md --target xlsx
convert: oconv: unsupported target (supported: docx, odt, pdf)
$ echo $?
2
```

## `convert`

Document to document, with no Markdown step in the output. Wraps
[`convert`](./convert.md). Pairs: `docx>odt`, `odt>docx`, `docx>pdf`,
`odt>pdf`. `--target` is required.

```console
$ bun src/index.ts convert tests/fixtures/sample.docx --target odt --out sample.odt
$ echo $?
0
$ bun src/index.ts convert tests/fixtures/sample.docx --target docx
convert: oconv: unsupported pair (supported: docx>odt, odt>docx, docx>pdf, odt>pdf)
$ echo $?
2
```

## `to-html`

Markdown to an HTML fragment. Wraps [`toHtml`](./toHtml.md): safe and
sanitised (raw HTML dropped, dangerous URL schemes neutralised, fw
sanitiser pass). There is no loss count: the render drops raw HTML and
unsafe URLs (see [`toHtml`](./toHtml.md)) but does not itemise them.

```console
$ bun src/index.ts to-html note.md
<h1>Hello</h1>
<p>A <em>short</em> note.</p>
<ul>
<li> shipped</li>
</ul>
```

## Other errors

```console
$ bun src/index.ts
convert: missing command (to-md | from-md | convert | to-html)
$ echo $?
2
$ bun src/index.ts bogus x
convert: unknown command: bogus
$ echo $?
1
$ bun src/index.ts to-md
convert: to-md requires a file argument
$ echo $?
2
$ bun src/index.ts to-md missing.docx
convert: ENOENT: no such file or directory, open 'missing.docx'
$ echo $?
1
```
