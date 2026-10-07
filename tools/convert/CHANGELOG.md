# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
