# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.2.0] - 2026-11-02

### Added

- `@awacloud/oconv`'s `docxInclude` on the three surfaces: `toMd`, the
  `to_md` MCP tool and `to-md --docx-include <list>` (`toc`: a docx table
  of contents control's entries as paragraphs); on another source format,
  or with a value oconv refuses, a usage error.
- `pdfInfer` takes `running` on the three surfaces (`--pdf-infer
  running`, the MCP enum), `@awacloud/oconv`'s new inference.
- `@awacloud/oconv`'s `pdfLineHyphens` on the three surfaces: `toMd`,
  the `to_md` MCP tool and `to-md --pdf-line-hyphens <drop|keep>`; a bad
  value or another source format is a usage error.
- `@awacloud/oconv`'s `sheetCellBudget`, `archiveLimits` and
  `outputBudget` on the three surfaces: `toMd`, the `to_md` MCP tool and
  `to-md` (`--sheet-cell-budget`, `--max-parts`, `--max-uncompressed`,
  `--max-ratio`, `--max-depth`, `--output-budget`, `--output-overflow`),
  with the new exported types `ArchiveLimits` and `OutputBudget`. A bad
  value or a wrong source format is a usage error (exit 2); a limit the
  document exceeds, or an output past its budget under `throw`, is a
  conversion error (exit 1).
- `to-md --sheets <table|csv|tsv>`, the `to_md` MCP tool's `sheets`
  argument and `toMd`'s `sheets` input: for an `xlsx` or `ods` source,
  `csv` or `tsv` writes each sheet as a fenced `csv` / `tsv` block instead
  of a GFM table (`@awacloud/oconv`'s `sheets`); `table` is the default.
  A bad value, or the option on another source format, is a usage error.
- Every other `toMd` input of `@awacloud/oconv` on the three surfaces:
  `pdfInfer`, `pdfDeclare`, `pdfInclude`, `pdfRecoverXref`,
  `formOpBudget`, `odtInclude` and `opts.frontMatter` on `toMd`, the
  `to_md` MCP tool (`frontMatter`) and `to-md` (`--pdf-infer`,
  `--pdf-declare`, `--pdf-include`, `--pdf-recover-xref`,
  `--form-op-budget`, `--odt-include`, `--front-matter`, plus the missing
  `--include-notes`); `pdfPassword` on `toMd`, read from a file on the
  CLI (`--password-file`) and over MCP (`pdfPasswordPath`), never taken
  as an argument. Each option on another source format (`--include-notes`
  and `includeNotes` excepted, which are ignored there), or with a value
  oconv refuses, is a usage error (CLI exit 2).
- `assets` on the `toMd` result (the asset manifest, image bytes
  included, new type `Asset`), the `assetFiles` function (which assets
  have bytes and a name that stays inside a directory, new type
  `SkippedAsset`), and `to-md --assets-dir <dir>` / the MCP `assetsDir`
  argument, which write them there (MCP: listed as `assets` and
  `assetsSkipped`).
- The MCP server checks `array` (of `items.type`) and `integer`
  arguments against their schema type; `argument <name>: expected
  array of string, got string` and `expected integer, got number` are
  usage errors.

## [1.1.0] - 2026-10-21

### Added

- `lossSummary` on every `toMd`, `fromMd` and `convert` result and in
  the `to_md`, `from_md` and `convert` MCP payloads: the losses grouped
  by `code` and `detail`, each with a `count`, in order of first
  occurrence (new type `LossSummaryEntry`). `losses` is unchanged.
- The MCP `lossView` argument on `to_md`, `from_md` and `convert`:
  `"summary"` returns `lossSummary` without the per-occurrence `losses`;
  `"full"`, the default, returns both. The tool descriptions recommend
  `"summary"`.

## [1.0.0] - 2026-10-07

### Security

- `to-html`, the MCP `to_html` tool and `toHtml` now render Markdown safe
  and sanitised, with both options passed explicitly instead of relying on
  the renderer's defaults: raw HTML is dropped, `javascript:`, `vbscript:`,
  `file:` and `data:` URLs (images included) are neutralised, and the fw
  sanitiser runs over the fragment. Fenced code, Mermaid included, stays
  escaped text. Task-list checkboxes are kept, as disabled inputs carrying
  their checked state; raw HTML inputs are still dropped.

### Changed

- `--help` shows the package's own entry-file commands.
- The `to_html` description and the documentation now state what the render
  drops, instead of presenting the absence of a `losses` array as a lossless
  render.
- `--at`, the MCP `at` argument and `convertedAt` now reject anything but
  an RFC 3339 date-time, as a usage error.

### Added

- **Conversion CLI** with four verbs: `to-md`, `from-md`, `convert` and
  `to-html`. Converted bytes go to stdout, or to a file with `--out`.
  Diagnostics and the loss count go to stderr. Exit codes are `0` ok, `1`
  error, `2` usage error, `130` SIGINT and `143` SIGTERM.
- **Bun, Node and Deno** run the CLI from a repository checkout with no
  build step, and produce the same output bytes. The published package also
  carries a plain-JavaScript transpile (`dist/`), so an installed copy runs
  on Node and Deno too; Bun keeps running the TypeScript sources.
- **Stdio MCP server** with four tools: `to_md`, `from_md`, `convert` and
  `to_html`. Large results go to a file rather than being truncated. Errors
  come back as structured `{ error, usage }` payloads.
- **Programmatic core**: `toMd`, `fromMd`, `convert`, `toHtml` and
  `isCoreError`. Each operation returns its output or an error value and
  never throws.
- **Loss ledger** on every `@awacloud/oconv`-backed result: `losses` and
  `lossy` list what a conversion could not carry across.
- **Documentation**: a package guide and a full API reference under `docs/`.

### Fixed

- README links to the public repository now pin this release's tag instead
  of the moving `main` branch, so they name the exact tree this version was
  published from.
- The `Loss` type now matches what the PDF writer actually reports: an
  object `detail`, plus `index` and `kind`.
- A malformed module descriptor now fails with a named
  `internal/descriptor` error instead of being registered unchecked.
