# CLI — `src/index.ts`

```text
bun src/index.ts to-md <file> [--format <fmt>] [--at <iso>] [--out <file>] [to-md options]
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
| `1` | Unknown command, unreadable input file or `--password-file`, or a conversion failure that is not a usage error: an archive limit the document exceeds (`--max-parts` …: `OPC: too many parts in archive`), an output past `--output-budget` under `throw` (`oconv: output too large`), an encrypted pdf without or with a wrong password. |
| `2` | Usage error: no command, missing file argument, unknown flag, flag without a value (a value that starts with `-`, such as `--max-parts -1`, counts as missing), missing `--target`, an unsupported format/target/pair, a `to-md` option on another verb, on a source format it does not apply to or with a value `@awacloud/oconv` refuses (`--sheets`, `--pdf-…`, `--odt-include`, `--docx-include`, `--form-op-budget`, `--sheet-cell-budget`, `--max-…`, `--output-budget`, `--output-overflow`, `--front-matter`, `--password-file`), or an invalid `--at` (checked before any file I/O). |
| `130` | SIGINT. |
| `143` | SIGTERM. |

## Flags

| Flag | Verbs | Meaning |
|---|---|---|
| `--format <fmt>` | `to-md`, `convert` | Source format. Wins over the file extension. |
| `--target <fmt>` | `from-md` (required), `convert` (required) | Target format. |
| `--sheets <mode>` | `to-md` | `xlsx` and `ods` sources: `table` (default, GFM tables), `csv` or `tsv` — each sheet as a fenced `csv` / `tsv` block, much smaller on a dense sheet. Another value, another source format or another verb is a usage error. |
| `--at <iso>` | `to-md` | Timestamp written into the front matter. Default: the current time. Must be a strict RFC 3339 `date-time` (e.g. `2026-01-01T00:00:00.000Z`); anything else is a usage error, checked before any file I/O. Pin it for reproducible output. |
| `--pdf-infer <list>` | `to-md` | `pdf` sources: inference on an untagged pdf, comma-separated — `headings`, `tables`, `running` (running headers and footers left out). |
| `--pdf-declare <list>` | `to-md` | `pdf` sources: `positional` records one `struct/positional` loss when the structure was built from positions. |
| `--pdf-include <list>` | `to-md` | `pdf` sources: `images` places each JPEG, JPEG 2000 and raw-pixel picture as a Markdown image (write them with `--assets-dir`). |
| `--pdf-recover-xref` | `to-md` | `pdf` sources: rebuild an unusable cross-reference chain. |
| `--pdf-line-hyphens <mode>` | `to-md` | `pdf` sources: a word a hyphen cuts at a line end is joined — `drop` without the hyphen, `keep` with it (a soft hyphen always joins). |
| `--password-file <file>` | `to-md` | `pdf` sources: read the user or owner password from this file; one trailing line break (`\n` or `\r\n`) is dropped. A password is never taken on the command line, where the process list would show it. |
| `--form-op-budget <n>` | `to-md` | `pdf` sources: the per-page Form XObject operator budget, default `1000000`. |
| `--odt-include <list>` | `to-md` | `odt` sources: `toc` reads a table of contents' entries as paragraphs. |
| `--docx-include <list>` | `to-md` | `docx` sources: `toc` reads a table of contents control's entries as paragraphs. |
| `--sheet-cell-budget <n>` | `to-md` | `xlsx` / `ods` sources: a sheet whose padded table would hold more cells is written unpadded, one `<A1 address>: <text>` line per value (`sheet/sparse-form`). |
| `--max-parts <n>`, `--max-uncompressed <bytes>`, `--max-ratio <n>`, `--max-depth <n>` | `to-md` | office sources (docx, xlsx, pptx, odt, ods, odp; a `pdf` source is a usage error): the reader's archive limits (oconv's `archiveLimits`; non-negative integers, `0` disables a check; odt, ods and odp take the first three). Defaults: 8192 parts (docx, xlsx, pptx) or 4096 (odt, ods, odp), 256 MiB inflated, ratio 200, depth 1000 (docx, xlsx, pptx only). A limit the document exceeds exits `1`. |
| `--output-budget <bytes>` | `to-md` | every source: a bound on the document's text (UTF-8 bytes), checked before the markdown is built; past it the conversion fails (`oconv: output too large`, exit `1`). |
| `--output-overflow <mode>` | `to-md` | with `--output-budget`: `throw` (default) or `truncate`, which keeps what fits and records `doc/truncated`; alone it is a usage error. |
| `--include-notes` | `to-md` | `pptx` and `odp` sources: render speaker notes. Ignored (no error) on another source format. |
| `--front-matter <mode>` | `to-md` | `full` (default), `compact` or `none` (the body alone). |
| `--assets-dir <dir>` | `to-md` | Write each image whose bytes the conversion returned under `<dir>`, at the path the markdown names (see [`assetFiles`](./assetFiles.md)). The markdown names it relative to itself, so pass the directory the markdown is written to. An image without bytes or with an unsafe name gets one stderr line and is not written. |
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

Every `to-md` option is `@awacloud/oconv`'s `toMd` input of the same name
([`toMd`](./toMd.md)); oconv validates the value.
`picture.pdf` is a one-page pdf with one JPEG picture, `locked.pdf` an
encrypted one whose user password `password.txt` holds:

```console
$ bun src/index.ts to-md picture.pdf --at 2026-01-01T00:00:00.000Z --pdf-include images --front-matter none --assets-dir assets
Fixture page text

![](image-7.jpg)
$ ls assets
image-7.jpg
$ bun src/index.ts to-md locked.pdf --at 2026-01-01T00:00:00.000Z --front-matter none
convert: document is encrypted (trailer /Encrypt present) — no decrypt path is composed for readDocument; pass { allowEncrypted: true } to read the raw ciphertext container
$ echo $?
1
$ bun src/index.ts to-md locked.pdf --at 2026-01-01T00:00:00.000Z --front-matter none --password-file password.txt
Fixture page text
$ bun src/index.ts to-md tests/fixtures/sample.docx --pdf-infer headings
convert: oconv: pdf infer needs format pdf
$ echo $?
2
$ bun src/index.ts from-md note.md --target docx --assets-dir assets
convert: --assets-dir is a to-md flag
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
$ echo $?
0
$ bun src/index.ts from-md note.md --target pdf | head -c 8
convert: 1 loss recorded
%PDF-2.0
```

The pdf loss is the task checkbox (`list/task-marker-dropped`): the
built-in pdf faces have no ☒ glyph. The docx (and odt) output draws it
as a leading `☒ ` run, with no loss.

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
