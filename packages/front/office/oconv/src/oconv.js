// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `oconv` — the frozen public facade of `@awacloud/oconv`.
 *
 * Three public members: `toMd` (the frozen read-direction surface),
 * `fromMd` (write direction, added after `toMd`) and `convert`
 * (cross-format pair, added last — additive again). `toMd`'s
 * and `fromMd`'s behavior and result shapes stay BYTE-UNCHANGED by this
 * extension (the facade only ever grows additively, never breaking).
 * `convert` is scoped to exactly the four
 * shipped pairs below — no widening beyond them, no provenance meta input, no
 * `assets` (nothing is accepted that a shipped pair does not need). The facade
 * composes the frozen readers/writers with the office packages they wrap,
 * through the dependency list below — never an office package internal.
 *
 * ## toMd pipeline
 *
 * 1. Resolve the source **format** — `docx`/`odt`/`xlsx`/`ods`/`pptx`/`odp`/
 *    `pdf` — from the caller's explicit `format`, else from `name`'s
 *    extension (case-insensitive). Detection is extension-only: several of
 *    these formats are ZIP containers, and telling them apart from magic
 *    bytes needs a package-level probe (OPC `[Content_Types].xml` vs ODF
 *    `mimetype` first entry) that no reader's own public facade exposes —
 *    and this facade's frozen `dependencies` grant no access to
 *    `opcPackage`/`pkgPackage` to build one here. An unresolved format never
 *    guesses: it throws `oconv: unsupported format`.
 * 2. Hash the source bytes — `sourceSha256` via `crypto.subtle.digest`
 *    (the only Web API this module touches beyond ES, available in
 *    browser, Bun and Worker alike).
 * 3. Read: `<format>.read(bytes)` → the matching `oconv<Format>ToIr` reader
 *    → `{ ir, losses }` (`oconvPdfToIr` additionally returns `coverage`,
 *    which this facade does not thread into its own frozen result shape).
 *    `pptx`/`odp` additionally take the caller's
 *    `includeNotes` (default `false`); `includeNotes` is a documented no-op
 *    for `pptx` (`@awacloud/ooxml` capability gap, see `read/pptx-to-ir.js`).
 * 4. Write: `oconvIrToMd.irToMd(ir, meta, opts)` with a provenance `meta`
 *    block (`converter: 'oconv'`, `converterVersion` mirroring this
 *    package's own `package.json` `version`, the reader's `losses` leading
 *    the merged ledger).
 *
 * `convertedAt` is REQUIRED and never defaulted to `Date.now()` — the
 * timestamp in the output is caller-owned;
 * the worker entry (`./worker.js`) forwards its own `at` field here.
 *
 * ## fromMd pipeline
 *
 * 1. Resolve the **target** — `'docx'` | `'odt'` | `'pdf'` — from the
 *    caller's explicit `target`, else from `name`'s extension (case-
 *    insensitive). Explicit `target` always wins over a contradicting
 *    `name`. Neither given → throws `oconv: unsupported target`.
 * 2. `markdown` is validated as a string; absent/non-string throws
 *    `oconv: markdown is required`. `opts.pdf` is accepted for the `pdf`
 *    target ONLY — supplying it for `docx`/`odt` throws
 *    `oconv: pdf options need target pdf` instead of silently ignoring a
 *    whole typesetting block. The block itself is validated in exactly one
 *    place downstream (`write/pdf/box.js` `resolveLayout`).
 * 3. Read: `oconvMdToIr.mdToIr(markdown)` → `{ ir, losses }`. A leading
 *    front-matter fence is stripped (never parsed, never carried into the
 *    target) and recorded as a `frontmatter/stripped` loss.
 * 4. Write: `oconvIrToDocxApi.irToDocx(ir)` / `oconvIrToOdtApi.irToOdt(ir)`
 *    / `oconvIrToPdfApi.irToPdf(ir, opts.pdf, { assets, defaultFaces })`
 *    depending on the resolved target. The `pdf` writer additionally returns
 *    a page count, which this facade's frozen result shape does not carry
 *    (call `oconvIrToPdf` directly for it).
 * 5. Losses are merged reader-then-writer, document order.
 *
 * `defaultFaces` is a posted default-face
 * map — the HOST resolves `runtime.resolve('oconvDefaultFaces').defaultFaces()`
 * on its own thread and posts the resulting bytes here, since the descriptor
 * itself closes over its bytes inside `factory()` and is main-thread-only: it
 * never crosses the worker boundary (`./worker.js` forwards this FIELD
 * verbatim, never the descriptor). Target `pdf` only — supplying it for
 * `docx`/`odt` throws `oconv: default faces need target pdf`, the same
 * reasoning as the `opts.pdf` rule. An absent `defaultFaces` reproduces
 * exactly today's call behaviour.
 *
 * No caller or front-matter provenance is written into the target
 * container (provenance is not an input). The container's fixed provenance
 * is per target: none for `docx`, `meta:generator` (`@awacloud/odf`) in
 * `odt`'s `meta.xml`, `/Producer` + `/Creator` (`@awacloud/oconv`) in `pdf`.
 *
 * The `docx` target is byte-reproducible: `@awacloud/ooxml` stamps every zip
 * entry with a fixed 1980-01-01 00:00 timestamp. The `odt` target is not: the
 * ODF package writer stamps the current time, so two identical calls give
 * equal document models but may give different bytes. The `pdf` target is
 * byte-reproducible — see `write/ir-to-pdf.js`.
 *
 * ## convert pipeline
 *
 * `convert` is pure wiring: `read <format> → oconv-ir/v2 → write <target>`,
 * exactly the two existing pipelines composed back to back, for exactly
 * the allowlisted pairs `docx→odt`, `odt→docx`, `docx→pdf`, `odt→pdf`
 * (`SUPPORTED_PAIRS`, a claim in `docs/loss-matrix.md`, never widened
 * silently). No pair outside the allowlist — including same-format, any
 * `xlsx`/`ods`/`pptx`/`odp`/`pdf`-source pair and any `→md` (that is
 * `toMd`) — is accepted; see `docs/convert.md` for the reasons per
 * excluded family.
 *
 * 1. Resolve **format** from the caller's explicit `format`, else `name`'s
 *    extension (same detection rule as `toMd`, restricted to `docx`/`odt`
 *    since those are the only supported sources).
 * 2. Resolve **target** — `target` is REQUIRED and never derived from
 *    `name` (`name` names the SOURCE here, not the target — unlike
 *    `fromMd`).
 * 3. Read: `readToIr(format, bytes, includeNotes)` — the SAME helper
 *    `toMd` uses.
 * 4. Write: `oconvIrToDocx.irToDocx(ir, {})` /
 *    `oconvIrToOdt.irToOdt(ir, {})` / `oconvIrToPdf.irToPdf(ir, opts.pdf,
 *    { defaultFaces })` depending on the resolved target — no `assets` is
 *    ever passed (image bytes come from the reader's own escapes, e.g.
 *    `escapes.docx.bytes` for a docx source, `escapes.odt.bytes` for an odt
 *    one; a `convert`
 *    caller has no markdown image destinations to key an asset manifest by).
 * 5. Losses are merged reader-then-writer, document order — the same
 *    contract as `fromMd`.
 *
 * Error-check order is contractual: `bytes` → `format` → `target` → pair
 * → `opts.pdf` → `defaultFaces` (same
 * posted-map contract as `fromMd`, checked LAST). Target-container provenance
 * follows the same per-target rule as `fromMd`. Byte reproducibility for
 * `convert`: `odt → docx` and `→ pdf` are byte-reproducible; `docx → odt`
 * is not (the ODF package writer stamps the current time). No round-trip
 * stability claim.
 *
 * @module oconv/oconv
 */

/**
 * Facade input. `format`/`engine`/`opts`/`includeNotes` are optional;
 * `convertedAt` is not.
 *
 * @typedef {Object} OconvToMdInput
 * @property {string} name Original file name — its extension drives format
 *   detection when `format` is omitted.
 * @property {Uint8Array} bytes Source document bytes.
 * @property {string} [format] `'docx'` | `'odt'` | `'xlsx'` | `'ods'` |
 *   `'pptx'` | `'odp'` | `'pdf'`. Explicit value always wins over extension
 *   detection.
 * @property {string} convertedAt REQUIRED — ISO-8601 timestamp, caller- or
 *   worker-injected. No default: see the module fileoverview.
 * @property {string} [engine] Host engine label (`'bun'`, `'browser'`, …),
 *   passed through to the front matter untouched; omitted from the
 *   provenance block entirely when absent (never invented).
 * @property {boolean} [includeNotes] `pptx`/`odp` only, default `false`.
 *   When `true`, speaker notes are rendered as a trailing blockquote per
 *   slide instead of being recorded as a `slides/notes-omitted` loss.
 *   Ignored for every other format; a documented no-op for `pptx` (see the
 *   module fileoverview, step 3).
 * @property {object} [opts] Forwarded to `oconvIrToMd.irToMd` verbatim:
 *   `frontMatter` (`'full'` default, `'compact'`, `'none'`; else
 *   `oconv: bad front matter`).
 * @property {number} [formOpBudget] `pdf` source only — forwarded
 *   to `oconvPdfToIr.pdfToIr`'s own `opts.formOpBudget`, the per-page Form
 *   XObject operator budget (default `1000000`; must be a safe integer
 *   >= 1, else `oconvPdfToIr` throws `oconv: bad form op budget`).
 *   Supplying it for a non-pdf source throws
 *   `oconv: form op budget needs format pdf` instead of being silently
 *   ignored.
 * @property {string[]} [pdfInfer] `pdf` source only — the inference of
 *   the untagged pdf path, forwarded to `oconvPdfToIr.pdfToIr`'s own
 *   `opts.infer`: `'headings'` (headings from font size and weight),
 *   `'tables'` (tables from rules or aligned text), `'running'` (running
 *   headers and footers left out). Not given, it is
 *   `['headings', 'tables']`; `[]` reads without inference. An array of
 *   distinct known names, else `oconv: bad pdf infer`. A tagged pdf reads
 *   its structure tree and never infers. Supplying it for a non-pdf
 *   source throws
 *   `oconv: pdf infer needs format pdf`.
 * @property {string[]} [pdfDeclare] `pdf` source only — the opt-in record
 *   of a silent pdf -> md case, forwarded to `oconvPdfToIr.pdfToIr`'s own
 *   `opts.declare`: `'positional'` (one `struct/positional` loss when the
 *   untagged path built the structure from positioning). An array of
 *   distinct known names, else `oconv: bad pdf declare`; `[]` reads as
 *   without it. Supplying it for a non-pdf source throws
 *   `oconv: pdf declare needs format pdf`.
 * @property {string[]} [pdfInclude] `pdf` source only — the opt-in parts
 *   the pdf reader brings back, forwarded to `oconvPdfToIr.pdfToIr`'s own
 *   `opts.include`: `'images'` (a JPEG, JPX or raw-pixel picture — the
 *   last written as a PNG — placed as an IR
 *   `image`, its bytes returned in `assets`; every other picture still
 *   `image/dropped`). An array of distinct known names, else
 *   `oconv: bad pdf include`; `[]` reads as without it. Supplying it for a
 *   non-pdf source throws `oconv: pdf include needs format pdf`.
 * @property {string|Uint8Array} [pdfPassword] `pdf` source only — the
 *   user or owner password of an encrypted pdf, forwarded to `pdf.read`'s
 *   own `opts.password` (a wrong one throws `pdf/document/bad-password`, a
 *   value that is neither a string nor bytes
 *   `pdf/document/bad-password-option`). RC4 files (V1 / V2) open too:
 *   oconv passes pdf's read-only `pdfLegacyRc4Read` with the password.
 *   An empty user password is `''`. Without it, the empty password is
 *   tried (`pdfEmptyPassword`). Supplying it for a non-pdf source throws
 *   `oconv: pdf password needs format pdf`.
 * @property {boolean} [pdfEmptyPassword] `pdf` source only — with no
 *   `pdfPassword`, an encrypted pdf is opened with the empty password when
 *   it opens (RC4 files too), one `pdf/opened-with-empty-user-password`
 *   loss recording it with the permission bits; a file it does not open
 *   throws `pdf/document/encrypted`. `false` keeps the refusal of every
 *   encrypted pdf read with no password; `true` is the default; another
 *   value throws `oconv: bad pdf empty password`. Supplying it for a
 *   non-pdf source throws `oconv: pdf empty password needs format pdf`.
 * @property {string} [pdfLineHyphens] `pdf` source only — the opt-in
 *   join of a hyphen ending a line before a lowercase letter, forwarded as
 *   `oconvPdfToIr.pdfToIr`'s `opts.lineHyphens`: `'drop'` joins the word
 *   without the hyphen, `'keep'` with it (a soft hyphen always joins);
 *   another value throws `oconv: bad pdf line hyphens`; for a non-pdf
 *   source it throws `oconv: pdf line hyphens needs format pdf`.
 * @property {boolean} [pdfRecoverXref] `pdf` source only — forwarded to
 *   `pdf.read`'s own `opts.recoverXref`, which rebuilds an unusable
 *   cross-reference chain from the file's object definitions by default;
 *   `false` reads strictly, the chain's error thrown; `true` is the
 *   default; any other value throws `oconv: bad pdf recover xref`.
 *   Supplying it for a non-pdf source throws
 *   `oconv: pdf recover xref needs format pdf`.
 * @property {string[]} [odtInclude] `odt` source only — the opt-in parts
 *   the odt reader brings back, forwarded to `oconvOdtToIr.odtToIr`'s own
 *   `opts.include`: `'toc'` (a table of contents' entries as paragraphs).
 *   An array of distinct known names, else `oconv: bad odt include`; `[]`
 *   reads as without it. Supplying it for a non-odt source throws
 *   `oconv: odt include needs format odt`.
 * @property {string[]} [docxInclude] `docx` source only — the opt-in parts
 *   the docx reader brings back, forwarded to `oconvDocxToIr.docxToIr`'s own
 *   `opts.include`: `'toc'` (a table of contents control's entries as
 *   paragraphs) and `'layout'` (tier 3: the page on the IR; the Markdown
 *   it writes is unchanged). An array of distinct known names, else `oconv: bad docx
 *   include`; `[]` reads as without it. Supplying it for a non-docx source
 *   throws `oconv: docx include needs format docx`.
 * @property {string} [sheets] `xlsx` / `ods` source only — how each sheet
 *   is written, forwarded to `oconvXlsxToIr.xlsxToIr` / `oconvOdsToIr.odsToIr`'s
 *   own `opts.sheets`: `'table'` (default, a GFM table), `'csv'` or `'tsv'`
 *   (a fenced `csv` / `tsv` block under the sheet's heading); else
 *   `oconv: bad sheets`. Supplying it for another source throws
 *   `oconv: sheets needs format xlsx or ods`.
 * @property {number} [sheetCellBudget] `xlsx` / `ods` source only — the
 *   reader's `opts.cellBudget`, 5,000,000 when absent (since 2.0.0;
 *   `Number.MAX_SAFE_INTEGER` pads every sheet as 1.x did): a sheet whose
 *   padded table would hold more cells is written unpadded, one `<A1 address>: <text>` paragraph per
 *   value (its rows unpadded under `sheets` `'csv'` / `'tsv'`), recorded
 *   `sheet/sparse-form`. A positive safe integer, else `oconv: bad cell
 *   budget`; for another source it throws `oconv: sheet cell budget needs
 *   format xlsx or ods`.
 * @property {{bytes?: number, overflow?: string}} [outputBudget] every source
 *   — a bound on the output, forwarded to `oconvIrToMd.irToMd`'s
 *   `opts.outputBudget`: after the read and before the render, the UTF-8
 *   size of the IR's text (table cells included; the markdown adds its
 *   syntax on top) is compared with `bytes`, a positive safe integer,
 *   **256 MiB when absent** (since 2.0.0; `Number.MAX_SAFE_INTEGER` renders
 *   as 1.x did). Past it, `overflow` `'throw'` (also when absent) throws
 *   `oconv: output too large` before any markdown is built; `'truncate'`
 *   keeps the top-level blocks that fit, a crossing table's leading rows
 *   that fit, and drops the rest, recorded `doc/truncated`. So with no
 *   `outputBudget` a document past 256 MiB of text throws. Another shape
 *   throws `oconv: bad output budget`, before the read.
 * @property {{maxParts?: number, maxUncompressed?: number, maxRatio?: number, maxDepth?: number}} [archiveLimits]
 *   office sources only — the archive limits passed to the docx, xlsx,
 *   pptx, odt, ods or odp reader's `read` (each reader keeps its default
 *   for an absent key, `0` disables a check; the ODF readers take the
 *   first three). A plain object of these keys, each a non-negative safe
 *   integer, else `oconv: bad archive limits`; for a pdf source it throws
 *   `oconv: archive limits need an office source`.
 */

/**
 * Facade result — the frozen `toMd` return shape.
 *
 * @typedef {Object} OconvToMdResult
 * @property {string} markdown Front matter + rendered CommonMark/GFM body.
 * @property {{level: number, anchor: string}[]} anchors Section index.
 * @property {boolean} lossy `losses.length > 0`.
 * @property {{code: string, detail: (string|Object)}[]} losses Reader losses
 *   then writer losses, in document order. Reader codes use a string
 *   `detail`; the pdf writer's `layout/*`, `text/unencodable` and `inline/*`
 *   codes an object.
 * @property {{kind: string, name: string, bytes?: *}[]} assets Asset
 *   manifest, deduplicated by name, document order.
 * @property {number} ms Wall-clock duration of this call, in milliseconds
 *   (`performance.now()` delta — never part of the deterministic markdown
 *   output, which depends only on `bytes` and `convertedAt`).
 */

/**
 * `fromMd` input. `name`/`target`/`opts` are optional — `target` (or a
 * derivable `name` extension) is required at call time, checked by
 * `fromMd` itself rather than by the type.
 *
 * @typedef {Object} OconvFromMdInput
 * @property {string} markdown Profile-v1 document or plain CommonMark/GFM.
 *   A leading front-matter fence is STRIPPED (recorded as
 *   `frontmatter/stripped`), never parsed, never carried into the target.
 * @property {string} [name] Output file name — extension drives target
 *   detection when `target` is omitted.
 * @property {string} [target] `'docx'` | `'odt'` | `'pdf'`. Explicit value
 *   always wins over extension detection.
 * @property {{pdf?: OconvPdfOptions}} [opts] Per-target options. Only
 *   `pdf` is defined today; supplying it for a non-pdf target throws
 *   `oconv: pdf options need target pdf` rather than being ignored.
 * @property {Object<string, Uint8Array>} [assets] Image bytes keyed by the
 *   markdown image destination EXACTLY as written (`![alt](diagram.png)` ->
 *   key `diagram.png`, `![alt](<my diagram.png>)` -> key `my diagram.png`). No normalisation, no fetching. Caller-supplied bytes
 *   take precedence over reader-carried bytes (`escapes.docx.bytes` / `escapes.odt.bytes` / `escapes.pdf.bytes` / `escapes.pptx.bytes`).
 * @property {{regular?: Uint8Array, bold?: Uint8Array, italic?: Uint8Array,
 *             boldItalic?: Uint8Array, mono?: Uint8Array}} [defaultFaces] A
 *   posted default-face map, forwarded to the pdf writer's
 *   `writeOpts.defaultFaces`. Target `pdf` only — supplying it for
 *   `docx`/`odt` throws `oconv: default faces need target pdf`. Unknown keys
 *   are rejected downstream by `createMeasurer`
 *   (`oconv: bad default font <key>`), not by this facade.
 */

/**
 * `opts.pdf` — the bounded `md → pdf` typesetter's option block. Forwarded
 * WHOLE to `oconvPdfBox.resolveLayout`, which is the single
 * validator: any key outside this list throws `oconv: bad pdf option <key>`.
 *
 * @typedef {Object} OconvPdfOptions
 * @property {string|number[]} [pageSize] `'A4'` (default) | `'Letter'`, or a
 *   positive `[width, height]` pair in PostScript points.
 * @property {number} [margin] Uniform margin in points (default `56.693`,
 *   i.e. 20 mm). `2 · margin` must stay below the shorter page side.
 * @property {number} [baseSize] Body type size in points (default `11`).
 * @property {number} [leadingRatio] Baseline-to-baseline distance as a
 *   multiple of the type size (default `1.32`).
 * @property {number[]} [headingScale] Six positive point sizes, one per
 *   heading level (default `[22, 18, 15, 13, 12, 11]`).
 * @property {number} [codeSize] Monospace type size in points (default
 *   `9.5`).
 * @property {boolean} [pageNumbers] Stamp a centred page number at
 *   `margin / 2` (default `true`).
 * @property {Object<string, Uint8Array>} [fonts] Caller-supplied font
 *   programs, per face: `regular`, `bold`, `italic`, `boldItalic`, `mono`.
 *   Every face left out falls back to its Standard 14 counterpart and is
 *   recorded as `layout/font-fallback`. This package vendors NO font
 *   (Unicode-by-default faces belong in a separate
 *   companion package, registered by descriptor name).
 * @property {'4'|'2b'} [pdfA] Claim PDF/A-4 or PDF/A-2b (`pdfBuilder`'s
 *   `pdfA`): every style class drawn needs an embedded face (`fonts` or
 *   the registered default faces), else `oconv: pdf/A needs embedded
 *   faces (<classes>)`.
 */

/**
 * `fromMd` result.
 *
 * @typedef {Object} OconvFromMdResult
 * @property {Uint8Array} bytes Target container bytes. The `docx` target is
 *   byte-reproducible across calls (`@awacloud/ooxml` stamps every zip
 *   entry with a fixed 1980-01-01 00:00 timestamp). The `odt` target is
 *   not: the ODF package writer stamps the current time, so the document
 *   MODEL is deterministic but the bytes may differ. The `pdf` target is
 *   byte-reproducible: no zip container, no date, an `/ID` derived from
 *   the written bytes (see
 *   `write/ir-to-pdf.js`'s determinism note).
 * @property {string} target `'docx'` | `'odt'` | `'pdf'` — the resolved
 *   target.
 * @property {boolean} lossy `losses.length > 0`.
 * @property {{code: string, detail: (string|Object)}[]} losses Reader losses
 *   then writer losses, document order. Reader codes use a string `detail`;
 *   the pdf writer's `layout/*`, `text/unencodable` and `inline/*` codes an
 *   object.
 * @property {number} ms Wall-clock duration of this call, in milliseconds.
 */

/**
 * `convert` input. `target` is REQUIRED and never derived — `name` (when
 * given) names the SOURCE, not the target.
 *
 * @typedef {Object} OconvConvertInput
 * @property {Uint8Array} bytes Source document bytes (REQUIRED).
 * @property {string} [name] Source file name — its extension drives
 *   `format` detection when `format` is omitted (same rule as `toMd`).
 * @property {string} [format] `'docx'` | `'odt'` (explicit wins over `name`).
 * @property {string} target `'docx'` | `'odt'` | `'pdf'` — REQUIRED, never
 *   derived (`name` names the SOURCE).
 * @property {boolean} [includeNotes] Forwarded to `readToIr`.
 * @property {{pdf?: OconvPdfOptions}} [opts] `opts.pdf` for target `'pdf'`
 *   only.
 * @property {{regular?: Uint8Array, bold?: Uint8Array, italic?: Uint8Array,
 *             boldItalic?: Uint8Array, mono?: Uint8Array}} [defaultFaces] A
 *   posted default-face map, forwarded to the pdf writer's
 *   `writeOpts.defaultFaces`. Target `pdf` only — supplying it for
 *   `docx`/`odt` throws `oconv: default faces need target pdf`. Unknown keys
 *   are rejected downstream by `createMeasurer`
 *   (`oconv: bad default font <key>`), not by this facade.
 * @property {boolean} [layout] Tier 3: the source's styles and page layout
 *   carried through `oconv-ir/v2` — the page, the paragraphs' alignment and
 *   breaks, the runs' values, the headers and footers, the page fields and
 *   the notes — on the `docx → odt` pair, the one that honours it. Absent:
 *   on for `docx → odt`, off on every other pair (since 2.0.0). `false`:
 *   tier 2, the output of 1.x. `true` on another pair throws.
 */

/**
 * `convert` result.
 *
 * @typedef {Object} OconvConvertResult
 * @property {Uint8Array} bytes Target bytes. `docx` and `pdf`:
 *   byte-reproducible across calls (`odt → docx`, `→ pdf`). `odt`: not
 *   byte-reproducible (the ODF package writer stamps the current time), so
 *   `docx → odt` may differ between calls.
 * @property {string} format Resolved source format.
 * @property {string} target Resolved target.
 * @property {boolean} lossy `losses.length > 0`.
 * @property {{code: string, detail: *}[]} losses Reader losses then writer
 *   losses, document order.
 * @property {number} ms Wall-clock duration of this call, in milliseconds.
 */

import { oconvIr } from './ir/ir.js';
import { oconvDocxToIr } from './read/docx-to-ir.js';
import { oconvOdtToIr } from './read/odt-to-ir.js';
import { oconvXlsxToIr } from './read/xlsx-to-ir.js';
import { oconvOdsToIr } from './read/ods-to-ir.js';
import { oconvPptxToIr } from './read/pptx-to-ir.js';
import { oconvOdpToIr } from './read/odp-to-ir.js';
import { oconvPdfToIr } from './read/pdf-to-ir.js';
import { oconvIrToMd } from './write/ir-to-md.js';
import { oconvMdToIr } from './read/md-to-ir.js';
import { oconvIrToDocx } from './write/ir-to-docx.js';
import { oconvIrToOdt } from './write/ir-to-odt.js';
import { oconvIrToPdf } from './write/ir-to-pdf.js';
import { docx, opcCoreProperties } from '@awacloud/ooxml';
import { odt } from '@awacloud/odf';
import { xlsx } from '@awacloud/ooxml';
import { ods } from '@awacloud/odf';
import { pptx } from '@awacloud/ooxml';
import { odp } from '@awacloud/odf';
import { pdf } from '@awacloud/pdf';
import { pdfLegacyRc4Read } from '@awacloud/pdf/extra/legacy-rc4-read.js';
import { pdfInfo, pdfFilterDispatch } from '@awacloud/pdf';
import { pdfXmpExtended } from '@awacloud/pdf/extra/xmp-extended.js';
import { mdMod } from '@awacloud/md';
import { mdNode } from '@awacloud/md';

export const oconv = {
    name: 'oconv',
    dependencies: [
        'oconvIr', 'oconvDocxToIr', 'oconvOdtToIr', 'oconvXlsxToIr',
        'oconvOdsToIr', 'oconvPptxToIr', 'oconvOdpToIr', 'oconvPdfToIr',
        'oconvIrToMd',
        'docx', 'odt', 'xlsx', 'ods', 'pptx', 'odp', 'pdf',
        'md', 'mdNode',
        'oconvMdToIr', 'oconvIrToDocx', 'oconvIrToOdt', 'oconvIrToPdf',
        'pdfLegacyRc4Read', 'pdfInfo', 'pdfXmpExtended', 'pdfFilterDispatch', 'opcCoreProperties'
    ],
    deps: [oconvIr, oconvDocxToIr, oconvOdtToIr, oconvXlsxToIr, oconvOdsToIr, oconvPptxToIr, oconvOdpToIr, oconvPdfToIr, oconvIrToMd, docx, odt, xlsx, ods, pptx, odp, pdf, mdMod, mdNode, oconvMdToIr, oconvIrToDocx, oconvIrToOdt, oconvIrToPdf, pdfLegacyRc4Read, pdfInfo, pdfXmpExtended, pdfFilterDispatch, opcCoreProperties],

    factory(oconvIrApi, oconvDocxToIrApi, oconvOdtToIrApi, oconvXlsxToIrApi,
            oconvOdsToIrApi, oconvPptxToIrApi, oconvOdpToIrApi, oconvPdfToIrApi,
            oconvIrToMdApi,
            docxApi, odtApi, xlsxApi, odsApi, pptxApi, odpApi, pdfApi,
            mdApi, mdNodeApi,
            oconvMdToIrApi, oconvIrToDocxApi, oconvIrToOdtApi, oconvIrToPdfApi,
            legacyRc4Api, pdfInfoApi, xmpApi, filterApi, coreApi) {
        // Capture-free (fw/no-factory-capture): every helper/constant below
        // is declared inside this body. `oconvIr`/`md`/`mdNode` are part of
        // the FROZEN dependency list (oconvIrToMd already resolves `md`/
        // `mdNode` through its own dependencies, and no reader needs
        // `oconvIr` passed in manually here) — referenced only to document
        // that the facade's own registration graph stays complete, mirroring
        // the `void odt;` / `void mimetypeMod;` idiom used elsewhere in this
        // codebase (e.g. `odt.js`, `odt-to-ir.js`) for declared-but-unused
        // factory params.
        void oconvIrApi; void mdApi; void mdNodeApi;

        /**
         * Mirrors this package's own `package.json` `"version"`. A unit
         * test (`oconv.test.js`) pins the two together so the two never
         * silently drift (same pattern as `ir.js`'s `IR_VERSION` mirror).
         */
        const CONVERTER_VERSION = '2.0.0';

        /**
         * `.docx`/`.odt`/`.xlsx`/`.ods`/`.pptx`/`.odp`/`.pdf` (case-
         * insensitive) → the matching format string, or `null`.
         */
        function extensionFormat(name) {
            if (typeof name !== 'string') return null;
            const lower = name.toLowerCase();
            if (lower.endsWith('.docx')) return 'docx';
            if (lower.endsWith('.odt')) return 'odt';
            if (lower.endsWith('.xlsx')) return 'xlsx';
            if (lower.endsWith('.ods')) return 'ods';
            if (lower.endsWith('.pptx')) return 'pptx';
            if (lower.endsWith('.odp')) return 'odp';
            if (lower.endsWith('.pdf')) return 'pdf';
            return null;
        }

        /** Lowercase hex of a `crypto.subtle.digest` `ArrayBuffer` result. */
        function toHex(buffer) {
            const view = new Uint8Array(buffer);
            let hex = '';
            for (let i = 0; i < view.length; i++) {
                hex += view[i].toString(16).padStart(2, '0');
            }
            return hex;
        }

        /** Formats routed through `toMd`, extension-detection order irrelevant here. */
        const SUPPORTED_FORMATS = new Set([
            'docx', 'odt', 'xlsx', 'ods', 'pptx', 'odp', 'pdf'
        ]);

        /**
         * Whether `v` is `{ bytes?, overflow? }`: `bytes` absent (256 MiB,
         * `irToMd`'s default) or a positive safe integer, `overflow` absent,
         * `'throw'` or `'truncate'`. The same check as `irToMd`'s, run here
         * before the read.
         */
        function validOutputBudget(v) {
            if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
            if (!Object.keys(v).every((k) => k === 'bytes' || k === 'overflow')) return false;
            if (v.bytes !== undefined && (!Number.isSafeInteger(v.bytes) || v.bytes < 1)) return false;
            return v.overflow === undefined || v.overflow === 'throw' || v.overflow === 'truncate';
        }

        /**
         * A read pdf's own title: its XMP `dc:title` (the catalog's
         * `/Metadata`), else its Info `/Title`, trimmed; `undefined` when
         * neither is stated or readable.
         */
        function pdfTitle(doc) {
            const resolve = doc._raw && doc._raw.resolve;
            try {
                const m = doc.catalog && doc.catalog.metadata ? resolve(doc.catalog.metadata) : null;
                if (m && m.type === 'stream') {
                    const t = xmpApi.dcTitle(filterApi.decodeStream(m, filterApi.decoders));
                    if (t) return t;
                }
            } catch { /* an unreadable packet states no title */ }
            try {
                const ref = doc.trailer && doc.trailer.info;
                const info = ref ? resolve({ type: 'ref', num: ref.num, gen: ref.gen }) : null;
                const v = info && info.type === 'dict' ? info.entries.Title : null;
                const t = v && v.type === 'string' ? pdfInfoApi.decodeTextString(v.value).trim() : '';
                if (t) return t;
            } catch { /* an unreadable Info dict states no title */ }
            return undefined;
        }

        /**
         * An office document's own title, trimmed: the OPC core properties'
         * `title` (docx, xlsx, pptx) or the ODF `meta.xml` one (odt, ods,
         * odp); `undefined` when none is stated or the part is unreadable.
         */
        function officeTitle(read, odf) {
            let t;
            try {
                t = odf ? (read && read.meta ? read.meta.title : undefined) : (coreApi.read(read && read.package) || {}).title;
            } catch { return undefined; }
            return typeof t === 'string' && t.trim() ? t.trim() : undefined;
        }

        /** The limit names `archiveLimits` may carry (the OOXML readers' four; ODF reads the first three). */
        const ARCHIVE_LIMITS = new Set(['maxParts', 'maxUncompressed', 'maxRatio', 'maxDepth']);

        /** Whether `v` is a plain object of known limits, each a non-negative safe integer. */
        function validArchiveLimits(v) {
            if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
            return Object.keys(v).every((k) => ARCHIVE_LIMITS.has(k)
                && Number.isSafeInteger(v[k]) && v[k] >= 0);
        }

        /**
         * Read `bytes` per `format` and run it through the matching
         * `oconv<Format>ToIr` reader. `pptx`/`odp` thread `includeNotes`;
         * `pdf`'s extra `coverage` return is intentionally discarded here —
         * this facade's frozen result shape never carries it.
         * `pdf` also threads `formOpBudget` — passed to
         * `pdfToIr` only when defined, so a call without it is byte-identical
         * to `pdfToIr(pdfApi.read(bytes))`. `pdfPassword` (with the RC4
         * reader) and `pdfRecoverXref: true` go to `pdfApi.read` itself,
         * likewise only when given; `archiveLimits` goes to each office
         * reader's `read`.
         *
         * @returns {{ir: object, losses: {code: string, detail: string}[]}}
         */
        function readToIr(format, bytes, includeNotes, formOpBudget, pdfInfer, pdfDeclare, odtInclude, sheets, pdfInclude, pdfPassword, pdfRecoverXref, archiveLimits, sheetCellBudget, pdfLineHyphens, docxInclude, pdfEmptyPassword) {
            // The office readers' own archive limits, only when given.
            const officeRead = (api) => (archiveLimits === undefined ? api.read(bytes) : api.read(bytes, archiveLimits));
            // The sheet readers' options, only when given.
            let sheetOpts;
            if (sheets !== undefined) sheetOpts = { sheets };
            if (sheetCellBudget !== undefined) sheetOpts = { ...sheetOpts, cellBudget: sheetCellBudget };
            // The reader's result, then the document's own title with it.
            const titled = (read, result) => ({ ...result, title: officeTitle(read, format === 'odt' || format === 'ods' || format === 'odp') });
            switch (format) {
                case 'docx': {
                    const read = officeRead(docxApi);
                    return titled(read, docxInclude === undefined
                        ? oconvDocxToIrApi.docxToIr(read)
                        : oconvDocxToIrApi.docxToIr(read, { include: docxInclude }));
                }
                case 'odt': {
                    const read = odtApi.read(bytes, { ...archiveLimits, framesInRuns: true, elementsInRuns: true, semanticStyles: true, notes: true });
                    return titled(read, odtInclude === undefined
                        ? oconvOdtToIrApi.odtToIr(read)
                        : oconvOdtToIrApi.odtToIr(read, { include: odtInclude }));
                }
                case 'xlsx': {
                    const read = officeRead(xlsxApi);
                    return titled(read, sheetOpts === undefined
                        ? oconvXlsxToIrApi.xlsxToIr(read)
                        : oconvXlsxToIrApi.xlsxToIr(read, sheetOpts));
                }
                case 'ods': {
                    const read = officeRead(odsApi);
                    return titled(read, sheetOpts === undefined
                        ? oconvOdsToIrApi.odsToIr(read)
                        : oconvOdsToIrApi.odsToIr(read, sheetOpts));
                }
                case 'pptx': {
                    // `typedGroups`: a group shape's text and pictures
                    // reach the reader.
                    const read = pptxApi.read(bytes, { ...(archiveLimits || {}), typedGroups: true });
                    return titled(read, oconvPptxToIrApi.pptxToIr(read, { includeNotes }));
                }
                case 'odp': {
                    const read = officeRead(odpApi);
                    return titled(read, oconvOdpToIrApi.odpToIr(read, { includeNotes }));
                }
                case 'pdf': {
                    let pdfOpts;
                    if (formOpBudget !== undefined) pdfOpts = { formOpBudget };
                    // Headings and tables are inferred unless the caller
                    // says otherwise (`[]` reads without inference).
                    pdfOpts = { ...pdfOpts, infer: pdfInfer !== undefined ? pdfInfer : ['headings', 'tables'] };
                    if (pdfDeclare !== undefined) pdfOpts = { ...pdfOpts, declare: pdfDeclare };
                    if (pdfInclude !== undefined) pdfOpts = { ...pdfOpts, include: pdfInclude };
                    if (pdfLineHyphens !== undefined) pdfOpts = { ...pdfOpts, lineHyphens: pdfLineHyphens };
                    // Every read opens RC4 (V1 / V2) files through pdf's
                    // read-only `pdfLegacyRc4Read`: with a password, and when
                    // pdf tries the empty one (no password given).
                    let readOpts = { legacyRc4: legacyRc4Api };
                    if (pdfPassword !== undefined) readOpts = { ...readOpts, password: pdfPassword };
                    if (pdfEmptyPassword === false) readOpts = { ...readOpts, emptyPassword: false };
                    if (pdfRecoverXref !== undefined) readOpts = { ...readOpts, recoverXref: pdfRecoverXref };
                    const doc = pdfApi.read(bytes, readOpts);
                    // pdfToIr's ledger starts with the read's own losses
                    // (the empty password, a rebuilt chain, …).
                    const { ir, losses } = oconvPdfToIrApi.pdfToIr(doc, pdfOpts);
                    return { ir, losses, title: pdfTitle(doc) };
                }
                default:
                    // Unreachable: toMd already validated `format` against
                    // SUPPORTED_FORMATS before calling this helper.
                    throw new Error('oconv: unsupported format');
            }
        }

        /**
         * Convert a `.docx`/`.odt`/`.xlsx`/`.ods`/`.pptx`/`.odp`/`.pdf`
         * document to structured-markdown profile v1 (`oconvIrToMd`'s wire
         * contract).
         *
         * @param {OconvToMdInput} input
         * @returns {Promise<OconvToMdResult>}
         * @throws {Error} `oconv: convertedAt is required` when omitted.
         * @throws {Error} `oconv: unsupported format` when the format is
         *   neither given explicitly nor derivable from `name`'s extension,
         *   or is none of the seven supported formats.
         * @throws {Error} `oconv: pdf infer needs format pdf` when
         *   `pdfInfer` is supplied and the resolved format is not `pdf`; a
         *   bad value on a pdf call is refused by `oconvPdfToIr.pdfToIr`
         *   (`oconv: bad pdf infer`).
         * @throws {Error} `oconv: pdf declare needs format pdf` when
         *   `pdfDeclare` is supplied and the resolved format is not `pdf`; a
         *   bad value on a pdf call is refused by `oconvPdfToIr.pdfToIr`
         *   (`oconv: bad pdf declare`).
         * @throws {Error} `oconv: pdf include needs format pdf` when
         *   `pdfInclude` is supplied and the resolved format is not `pdf`; a
         *   bad value on a pdf call is refused by `oconvPdfToIr.pdfToIr`
         *   (`oconv: bad pdf include`).
         * @throws {Error} `oconv: pdf line hyphens needs format pdf` when
         *   `pdfLineHyphens` is supplied and the resolved format is not
         *   `pdf`; a bad value is refused by `oconvPdfToIr.pdfToIr`
         *   (`oconv: bad pdf line hyphens`).
         * @throws {Error} `oconv: sheets needs format xlsx or ods` when
         *   `sheets` is supplied and the resolved format is neither; a bad
         *   value on such a call is refused by the reader (`oconv: bad
         *   sheets`).
         * @throws {Error} `oconv: sheet cell budget needs format xlsx or ods`
         *   when `sheetCellBudget` is supplied and the resolved format is
         *   neither; a bad value is refused by the reader (`oconv: bad cell
         *   budget`).
         * @throws {Error} `oconv: odt include needs format odt` when
         *   `odtInclude` is supplied and the resolved format is not `odt`; a
         *   bad value on an odt call is refused by `oconvOdtToIr.odtToIr`
         *   (`oconv: bad odt include`).
         * @throws {Error} `oconv: docx include needs format docx` when
         *   `docxInclude` is supplied and the resolved format is not `docx`;
         *   a bad value on a docx call is refused by
         *   `oconvDocxToIr.docxToIr` (`oconv: bad docx include`).
         * @throws {Error} `oconv: form op budget needs format pdf` when
         *   `formOpBudget` is supplied and the resolved format is not
         *   `pdf` — a bad value on a pdf call is refused by
         *   `oconvPdfToIr.pdfToIr` itself (`oconv: bad form op budget`).
         * @throws {Error} `oconv: bad output budget` when `outputBudget` is
         *   not `{ bytes, overflow? }` (a positive safe integer; `'throw'`
         *   or `'truncate'`); `oconv: output too large` when the IR's text
         *   passes `bytes` under `'throw'`.
         * @throws {Error} `oconv: bad archive limits` when `archiveLimits`
         *   is not a plain object of known limits, each a non-negative safe
         *   integer; `oconv: archive limits need an office source` when it
         *   is supplied for a pdf.
         */
        async function toMd(input) {
            const req = input || {};
            const { name, bytes, engine } = req;
            const convertedAt = req.convertedAt;
            if (!convertedAt) {
                throw new Error('oconv: convertedAt is required');
            }
            const format = req.format || extensionFormat(name);
            if (!SUPPORTED_FORMATS.has(format)) {
                throw new Error('oconv: unsupported format');
            }
            const formOpBudget = req.formOpBudget;
            if (formOpBudget !== undefined && format !== 'pdf') {
                throw new Error('oconv: form op budget needs format pdf');
            }
            const pdfInfer = req.pdfInfer;
            if (pdfInfer !== undefined && format !== 'pdf') {
                throw new Error('oconv: pdf infer needs format pdf');
            }
            const pdfDeclare = req.pdfDeclare;
            if (pdfDeclare !== undefined && format !== 'pdf') {
                throw new Error('oconv: pdf declare needs format pdf');
            }
            const pdfInclude = req.pdfInclude;
            if (pdfInclude !== undefined && format !== 'pdf') {
                throw new Error('oconv: pdf include needs format pdf');
            }
            const pdfPassword = req.pdfPassword;
            if (pdfPassword !== undefined && format !== 'pdf') {
                throw new Error('oconv: pdf password needs format pdf');
            }
            const pdfEmptyPassword = req.pdfEmptyPassword;
            if (pdfEmptyPassword !== undefined && format !== 'pdf') {
                throw new Error('oconv: pdf empty password needs format pdf');
            }
            if (pdfEmptyPassword !== undefined && typeof pdfEmptyPassword !== 'boolean') {
                throw new Error('oconv: bad pdf empty password');
            }
            const pdfRecoverXref = req.pdfRecoverXref;
            if (pdfRecoverXref !== undefined && format !== 'pdf') {
                throw new Error('oconv: pdf recover xref needs format pdf');
            }
            if (pdfRecoverXref !== undefined && typeof pdfRecoverXref !== 'boolean') {
                throw new Error('oconv: bad pdf recover xref');
            }
            const sheets = req.sheets;
            if (sheets !== undefined && format !== 'xlsx' && format !== 'ods') {
                throw new Error('oconv: sheets needs format xlsx or ods');
            }
            const pdfLineHyphens = req.pdfLineHyphens;
            if (pdfLineHyphens !== undefined && format !== 'pdf') {
                throw new Error('oconv: pdf line hyphens needs format pdf');
            }
            const sheetCellBudget = req.sheetCellBudget;
            if (sheetCellBudget !== undefined && format !== 'xlsx' && format !== 'ods') {
                throw new Error('oconv: sheet cell budget needs format xlsx or ods');
            }
            const odtInclude = req.odtInclude;
            if (odtInclude !== undefined && format !== 'odt') {
                throw new Error('oconv: odt include needs format odt');
            }
            const docxInclude = req.docxInclude;
            if (docxInclude !== undefined && format !== 'docx') {
                throw new Error('oconv: docx include needs format docx');
            }
            const archiveLimits = req.archiveLimits;
            if (archiveLimits !== undefined && !validArchiveLimits(archiveLimits)) {
                throw new Error('oconv: bad archive limits');
            }
            if (archiveLimits !== undefined && format === 'pdf') {
                throw new Error('oconv: archive limits need an office source');
            }
            const outputBudget = req.outputBudget;
            if (outputBudget !== undefined && !validOutputBudget(outputBudget)) {
                throw new Error('oconv: bad output budget');
            }
            const includeNotes = !!req.includeNotes;

            const start = performance.now();
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            const sourceSha256 = toHex(digest);

            const read = readToIr(format, bytes, includeNotes, formOpBudget, pdfInfer, pdfDeclare, odtInclude, sheets, pdfInclude, pdfPassword, pdfRecoverXref, archiveLimits, sheetCellBudget, pdfLineHyphens, docxInclude, pdfEmptyPassword);
            const ir = read.ir;
            const readerLosses = read.losses;

            const meta = {
                sourceFormat: format,
                sourceName: name,
                sourceBytes: bytes.byteLength,
                sourceSha256,
                convertedAt,
                converter: 'oconv',
                converterVersion: CONVERTER_VERSION,
                losses: readerLosses
            };
            if (engine !== undefined) meta.engine = engine;
            if (read.title !== undefined) meta.title = read.title;

            // The output budget is irToMd's (256 MiB 'throw' when absent),
            // checked on the IR's text before any markdown is built.
            const written = oconvIrToMdApi.irToMd(ir, meta,
                outputBudget === undefined ? req.opts : { ...req.opts, outputBudget });
            const ms = performance.now() - start;

            return {
                markdown: written.markdown,
                anchors: written.anchors,
                lossy: written.lossy,
                losses: written.losses,
                assets: written.assets,
                ms
            };
        }

        /**
         * `.docx` | `.odt` | `.pdf` (case-insensitive) → the matching target
         * string, or `null`.
         */
        function extensionTarget(name) {
            if (typeof name !== 'string') return null;
            const lower = name.toLowerCase();
            if (lower.endsWith('.docx')) return 'docx';
            if (lower.endsWith('.odt')) return 'odt';
            if (lower.endsWith('.pdf')) return 'pdf';
            return null;
        }

        /** Targets routed through `fromMd`. */
        const SUPPORTED_TARGETS = new Set(['docx', 'odt', 'pdf']);

        /**
         * Shape-validate a posted `defaultFaces` map: a non-null,
         * non-array object whose every own value is a `Uint8Array`. Unknown
         * KEYS are intentionally NOT checked here — `createMeasurer`
         * rejects those downstream with `oconv: bad default font <key>`, so
         * duplicating that check here would just get it wrong twice.
         *
         * @param {*} defaultFaces
         * @throws {Error} `oconv: bad default faces`
         */
        function validateDefaultFaces(defaultFaces) {
            if (defaultFaces === null || typeof defaultFaces !== 'object' || Array.isArray(defaultFaces)) {
                throw new Error('oconv: bad default faces');
            }
            for (const key of Object.keys(defaultFaces)) {
                if (!(defaultFaces[key] instanceof Uint8Array)) {
                    throw new Error('oconv: bad default faces');
                }
            }
        }

        /**
         * Convert a structured-markdown (profile v1) or plain CommonMark/GFM
         * document to a `.docx` / `.odt` container or a `.pdf` (added later,
         * additive again). Additive extension of the frozen `oconv` facade —
         * `toMd` is untouched by this member.
         *
         * @param {OconvFromMdInput} input
         * @returns {Promise<OconvFromMdResult>}
         * @throws {Error} `oconv: markdown is required` when `markdown` is
         *   absent or not a string.
         * @throws {Error} `oconv: unsupported target` when the target is
         *   neither given explicitly nor derivable from `name`'s extension,
         *   or is none of `'docx'` / `'odt'` / `'pdf'`.
         * @throws {Error} `oconv: pdf options need target pdf` when
         *   `opts.pdf` is supplied for a non-pdf target — a silently ignored
         *   typesetting block would look like it took effect.
         * @throws {Error} `oconv: bad pdf option <key>` /
         *   `oconv: bad pdf font <style>` — forwarded from the pdf writer's
         *   single option validator (`write/pdf/box.js`).
         * @throws {Error} `oconv: default faces need target pdf` when
         *   `defaultFaces` is supplied for a non-pdf target — the
         *   same reasoning as the `opts.pdf` rule: a silently ignored font
         *   block would look like it took effect.
         * @throws {Error} `oconv: bad default faces` when `defaultFaces` is
         *   supplied and is not a non-null, non-array object whose every own
         *   value is a `Uint8Array`. Unknown keys are rejected downstream by
         *   `createMeasurer` (`oconv: bad default font <key>`).
         * @throws {Error} `oconv: bad assets` when `assets` is supplied and
         *   is not a non-null, non-array object whose every own value is a
         *   `Uint8Array`. Checked BEFORE the reader runs.
         */
        async function fromMd(input) {
            const req = input || {};
            const { markdown, name } = req;
            if (typeof markdown !== 'string') {
                throw new Error('oconv: markdown is required');
            }
            const target = req.target || extensionTarget(name);
            if (!SUPPORTED_TARGETS.has(target)) {
                throw new Error('oconv: unsupported target');
            }
            const pdfOpts = req.opts && req.opts.pdf;
            if (pdfOpts !== undefined && target !== 'pdf') {
                throw new Error('oconv: pdf options need target pdf');
            }
            // A posted default-face map. Target `pdf` only, same
            // reasoning as `opts.pdf` above; shape-checked here, unknown
            // KEYS are left to `createMeasurer` downstream (do not duplicate
            // that check).
            if (req.defaultFaces !== undefined) {
                if (target !== 'pdf') {
                    throw new Error('oconv: default faces need target pdf');
                }
                validateDefaultFaces(req.defaultFaces);
            }
            // Validated BEFORE the reader runs: a malformed manifest must
            // fail on the caller's mistake, not halfway through a parse. A
            // key no image references is simply ignored — never an error,
            // never a loss (the manifest is a lookup table, not a contract
            // about the document's contents).
            if (req.assets !== undefined) {
                const a = req.assets;
                if (a === null || typeof a !== 'object' || Array.isArray(a)) {
                    throw new Error('oconv: bad assets');
                }
                for (const key of Object.keys(a)) {
                    if (!(a[key] instanceof Uint8Array)) throw new Error('oconv: bad assets');
                }
            }

            const start = performance.now();

            const { ir, losses: readerLosses, frontmatter } = oconvMdToIrApi.mdToIr(markdown);

            let written;
            if (target === 'docx') written = oconvIrToDocxApi.irToDocx(ir, { assets: req.assets });
            else if (target === 'odt') written = oconvIrToOdtApi.irToOdt(ir, { assets: req.assets });
            else written = oconvIrToPdfApi.irToPdf(ir, pdfOpts, { assets: req.assets, defaultFaces: req.defaultFaces, title: frontmatterTitle(frontmatter) });

            const losses = readerLosses.concat(written.losses);
            const ms = performance.now() - start;

            return {
                bytes: written.bytes,
                target,
                lossy: losses.length > 0,
                losses,
                ms
            };
        }

        /**
         * The `title` of a stripped front matter (YAML `title:`, TOML
         * `title =`, JSON `"title"`), trimmed, or `undefined`.
         *
         * @param {{lang: string, content: string}|null} frontmatter
         * @returns {string|undefined}
         */
        function frontmatterTitle(frontmatter) {
            if (!frontmatter || typeof frontmatter.content !== 'string') return undefined;
            const unquote = (s) => {
                const t = s.trim();
                const q = t[0];
                return (q === '"' || q === "'") && t.endsWith(q) && t.length >= 2 ? t.slice(1, -1) : t;
            };
            let title;
            if (frontmatter.lang === 'json') {
                try {
                    const text = frontmatter.content.trim();
                    const value = JSON.parse(text.startsWith('{') ? text : `{${text}}`);
                    if (value && typeof value.title === 'string') title = value.title;
                } catch { /* not JSON: no title */ }
            } else {
                const re = frontmatter.lang === 'toml' ? /^title\s*=\s*(.+)$/m : /^title\s*:\s*(.+)$/m;
                const m = re.exec(frontmatter.content);
                if (m) title = unquote(m[1]);
            }
            return title === undefined || title.trim() === '' ? undefined : title.trim();
        }

        /** Shipped pairs — a claim in docs/loss-matrix.md, never widened silently. */
        const SUPPORTED_PAIRS = new Set(['docx>odt', 'odt>docx', 'docx>pdf', 'odt>pdf']);

        /**
         * Convert a `.docx`/`.odt` document directly to a `.docx`/`.odt`/
         * `.pdf` target, for exactly the four allowlisted pairs
         * (`SUPPORTED_PAIRS`) — pure wiring, `read <format> → oconv-ir/v2 →
         * write <target>` (see the module fileoverview's "convert pipeline"
         * section). Additive extension of the frozen `oconv` facade —
         * `toMd`/`fromMd` are untouched by this member.
         *
         * @param {OconvConvertInput} input
         * @returns {Promise<OconvConvertResult>}
         * @throws {Error} `oconv: bytes is required` when `bytes` is absent
         *   or not a `Uint8Array`.
         * @throws {Error} `oconv: unsupported format` when the source format
         *   is neither given explicitly nor derivable from `name`'s
         *   extension, or is none of the seven `toMd` formats
         *   (`SUPPORTED_FORMATS`: docx/odt/xlsx/ods/pptx/odp/pdf).
         * @throws {Error} `oconv: unsupported target` when `target` is
         *   absent or is none of `'docx'` / `'odt'` / `'pdf'`.
         * @throws {Error} `oconv: unsupported pair` when `format>target` is
         *   not one of the four shipped pairs — this is the check that
         *   rejects an `xlsx`/`ods`/`pptx`/`odp`/`pdf` source, and a
         *   same-format pair such as `docx>docx`.
         * @throws {Error} `oconv: pdf options need target pdf` when
         *   `opts.pdf` is supplied for a non-pdf target.
         * @throws {Error} `oconv: default faces need target pdf` when
         *   `defaultFaces` is supplied for a non-pdf target,
         *   checked LAST, after `opts.pdf`.
         * @throws {Error} `oconv: bad default faces` when `defaultFaces` is
         *   supplied and is not a non-null, non-array object whose every own
         *   value is a `Uint8Array`. Unknown keys are rejected downstream by
         *   `createMeasurer` (`oconv: bad default font <key>`).
         * @throws {Error} `oconv: bad layout option` when `layout` is
         *   supplied and is not a boolean (checked after the above).
         * @throws {Error} `oconv: layout needs docx to odt` when `layout` is
         *   `true` on another pair (checked last). An absent `layout` is on
         *   for `docx → odt` and off elsewhere.
         */
        async function convert(input) {
            const req = input || {};
            if (!(req.bytes instanceof Uint8Array)) throw new Error('oconv: bytes is required');
            const format = req.format || extensionFormat(req.name);
            if (!SUPPORTED_FORMATS.has(format)) throw new Error('oconv: unsupported format');
            const target = req.target;
            if (!SUPPORTED_TARGETS.has(target)) throw new Error('oconv: unsupported target');
            if (!SUPPORTED_PAIRS.has(`${format}>${target}`)) throw new Error('oconv: unsupported pair');
            const pdfOpts = req.opts && req.opts.pdf;
            if (pdfOpts !== undefined && target !== 'pdf') throw new Error('oconv: pdf options need target pdf');
            // Default faces, checked LAST: same posted-map contract as `fromMd`.
            if (req.defaultFaces !== undefined) {
                if (target !== 'pdf') throw new Error('oconv: default faces need target pdf');
                validateDefaultFaces(req.defaultFaces);
            }
            // Tier 3 (T27), checked after every earlier error.
            if (req.layout !== undefined && typeof req.layout !== 'boolean') throw new Error('oconv: bad layout option');
            if (req.layout === true && `${format}>${target}` !== 'docx>odt') throw new Error('oconv: layout needs docx to odt');
            // On by default where the pair honours it (T82): docx → odt.
            const layout = req.layout === undefined ? `${format}>${target}` === 'docx>odt' : req.layout;
            const docxInclude = layout ? ['layout'] : undefined;
            const start = performance.now();
            const { ir, losses: readerLosses, title } = readToIr(format, req.bytes, !!req.includeNotes,
                undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, docxInclude);
            let written;
            if (target === 'docx')      written = oconvIrToDocxApi.irToDocx(ir, {});
            else if (target === 'odt')  written = oconvIrToOdtApi.irToOdt(ir, {});
            else                        written = oconvIrToPdfApi.irToPdf(ir, pdfOpts, { defaultFaces: req.defaultFaces, title });
            const losses = readerLosses.concat(written.losses);
            return { bytes: written.bytes, format, target, lossy: losses.length > 0, losses, ms: performance.now() - start };
        }

        return { toMd, fromMd, convert };
    }
};
