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
 * `convert` is pure wiring: `read <format> → oconv-ir/v1 → write <target>`,
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
 *    `escapes.docx.bytes` for a docx source; a `convert`
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
 * @property {object} [opts] Reserved, forwarded to `oconvIrToMd.irToMd`
 *   verbatim — no option is defined in profile v1 today.
 * @property {number} [formOpBudget] `pdf` source only — forwarded
 *   to `oconvPdfToIr.pdfToIr`'s own `opts.formOpBudget`, the per-page Form
 *   XObject operator budget (default `1000000`; must be a safe integer
 *   >= 1, else `oconvPdfToIr` throws `oconv: bad form op budget`).
 *   Supplying it for a non-pdf source throws
 *   `oconv: form op budget needs format pdf` instead of being silently
 *   ignored.
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
 *   key `diagram.png`). No normalisation, no fetching. Caller-supplied bytes
 *   take precedence over reader-carried bytes (`escapes.docx.bytes`).
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
 *   byte-reproducible: no zip container, no date, no `/ID` (see
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
import { docx } from '@awacloud/ooxml';
import { odt } from '@awacloud/odf';
import { xlsx } from '@awacloud/ooxml';
import { ods } from '@awacloud/odf';
import { pptx } from '@awacloud/ooxml';
import { odp } from '@awacloud/odf';
import { pdf } from '@awacloud/pdf';
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
        'oconvMdToIr', 'oconvIrToDocx', 'oconvIrToOdt', 'oconvIrToPdf'
    ],
    deps: [oconvIr, oconvDocxToIr, oconvOdtToIr, oconvXlsxToIr, oconvOdsToIr, oconvPptxToIr, oconvOdpToIr, oconvPdfToIr, oconvIrToMd, docx, odt, xlsx, ods, pptx, odp, pdf, mdMod, mdNode, oconvMdToIr, oconvIrToDocx, oconvIrToOdt, oconvIrToPdf],

    factory(oconvIrApi, oconvDocxToIrApi, oconvOdtToIrApi, oconvXlsxToIrApi,
            oconvOdsToIrApi, oconvPptxToIrApi, oconvOdpToIrApi, oconvPdfToIrApi,
            oconvIrToMdApi,
            docxApi, odtApi, xlsxApi, odsApi, pptxApi, odpApi, pdfApi,
            mdApi, mdNodeApi,
            oconvMdToIrApi, oconvIrToDocxApi, oconvIrToOdtApi, oconvIrToPdfApi) {
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
        const CONVERTER_VERSION = '1.0.0';

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
         * Read `bytes` per `format` and run it through the matching
         * `oconv<Format>ToIr` reader. `pptx`/`odp` thread `includeNotes`;
         * `pdf`'s extra `coverage` return is intentionally discarded here —
         * this facade's frozen result shape never carries it.
         * `pdf` also threads `formOpBudget` — passed to
         * `pdfToIr` only when defined, so a call without it is byte-identical
         * to `pdfToIr(pdfApi.read(bytes))`.
         *
         * @returns {{ir: object, losses: {code: string, detail: string}[]}}
         */
        function readToIr(format, bytes, includeNotes, formOpBudget) {
            switch (format) {
                case 'docx':
                    return oconvDocxToIrApi.docxToIr(docxApi.read(bytes));
                case 'odt':
                    return oconvOdtToIrApi.odtToIr(odtApi.read(bytes));
                case 'xlsx':
                    return oconvXlsxToIrApi.xlsxToIr(xlsxApi.read(bytes));
                case 'ods':
                    return oconvOdsToIrApi.odsToIr(odsApi.read(bytes));
                case 'pptx':
                    return oconvPptxToIrApi.pptxToIr(pptxApi.read(bytes), { includeNotes });
                case 'odp':
                    return oconvOdpToIrApi.odpToIr(odpApi.read(bytes), { includeNotes });
                case 'pdf': {
                    const pdfOpts = formOpBudget !== undefined ? { formOpBudget } : undefined;
                    const { ir, losses } = oconvPdfToIrApi.pdfToIr(pdfApi.read(bytes), pdfOpts);
                    return { ir, losses };
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
         * @throws {Error} `oconv: form op budget needs format pdf` when
         *   `formOpBudget` is supplied and the resolved format is not
         *   `pdf` — a bad value on a pdf call is refused by
         *   `oconvPdfToIr.pdfToIr` itself (`oconv: bad form op budget`).
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
            const includeNotes = !!req.includeNotes;

            const start = performance.now();
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            const sourceSha256 = toHex(digest);

            const { ir, losses: readerLosses } = readToIr(format, bytes, includeNotes, formOpBudget);

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

            const written = oconvIrToMdApi.irToMd(ir, meta, req.opts);
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

            const { ir, losses: readerLosses } = oconvMdToIrApi.mdToIr(markdown);

            let written;
            if (target === 'docx') written = oconvIrToDocxApi.irToDocx(ir, { assets: req.assets });
            else if (target === 'odt') written = oconvIrToOdtApi.irToOdt(ir, { assets: req.assets });
            else written = oconvIrToPdfApi.irToPdf(ir, pdfOpts, { assets: req.assets, defaultFaces: req.defaultFaces });

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

        /** Shipped pairs — a claim in docs/loss-matrix.md, never widened silently. */
        const SUPPORTED_PAIRS = new Set(['docx>odt', 'odt>docx', 'docx>pdf', 'odt>pdf']);

        /**
         * Convert a `.docx`/`.odt` document directly to a `.docx`/`.odt`/
         * `.pdf` target, for exactly the four allowlisted pairs
         * (`SUPPORTED_PAIRS`) — pure wiring, `read <format> → oconv-ir/v1 →
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
            const start = performance.now();
            const { ir, losses: readerLosses } = readToIr(format, req.bytes, !!req.includeNotes);
            let written;
            if (target === 'docx')      written = oconvIrToDocxApi.irToDocx(ir, {});
            else if (target === 'odt')  written = oconvIrToOdtApi.irToOdt(ir, {});
            else                        written = oconvIrToPdfApi.irToPdf(ir, pdfOpts, { defaultFaces: req.defaultFaces });
            const losses = readerLosses.concat(written.losses);
            return { bytes: written.bytes, format, target, lossy: losses.length > 0, losses, ms: performance.now() - start };
        }

        return { toMd, fromMd, convert };
    }
};
