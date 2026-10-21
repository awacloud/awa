// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `oconv-ir/v1` → `.docx` bytes writer — tier 2.
 *
 * Maps the FROZEN pivot IR (`oconvIr`, `../ir/ir.js`) onto `@awacloud/ooxml`'s
 * documented typed WordprocessingML model and produces bytes through the
 * public `docx.write(doc, opts)` façade ONLY. Structure-to-structure: no
 * layout tier — the only `opts.styles` passed is ONE fixed built-in style
 * set (see "Styles part" below), no caller styling, no fonts/colours
 * beyond that set and the hyperlink default `@awacloud/ooxml` itself
 * applies, no sections/headers/footers.
 *
 * Composes ONLY `docx`'s public API — never an `@awacloud/ooxml` internal, and
 * never an edit inside `@awacloud/ooxml`. A capability missing upstream is
 * never patched here: the affected element is recorded as a loss.
 *
 * Pure object mapping plus `docx.write` (pure JS), so the module is
 * Worker-safe by construction. The factory is capture-free
 * (`fw/no-factory-capture`): every constant it uses is declared in its body.
 *
 * ## The two `docx.write` defaults this writer keeps off the call path
 *
 * `docx.write` throws `docx/hyperlink-missing-rid` for a hyperlink without an
 * explicit `rId` and `docx/numbering-missing` for numbered paragraphs without
 * `opts.numbering`. This writer always allocates `'rIdHl' + n` ids and passes
 * one numbering object whenever a list exists, so neither throw is reachable
 * from here.
 *
 * - **Hyperlinks** — every `hyperlink` node gets an explicit `rId` and a
 *   `target`. rIds are `'rIdHl' + n` (n = 1-based document-order counter) and
 *   NEVER bare `'rId' + n`: `docx.write`'s internal allocator claims
 *   `rId1..` for the styles/numbering/settings parts BEFORE hyperlink rels
 *   are appended, so bare names can collide.
 * - **Numbering** — this writer builds ONE plain numbering object and passes
 *   it whenever the document contains at least one list, so every `w:numPr`
 *   reference resolves to a `word/numbering.xml` definition.
 *
 * ## Reproducibility
 *
 * The `docx` target is byte-reproducible: `@awacloud/ooxml` stamps every zip
 * entry with a fixed 1980-01-01 00:00 timestamp. The `odt` target is not: the
 * ODF package writer stamps the current time, so two identical calls give
 * equal document models but may give different bytes. The `pdf` target is
 * byte-reproducible.
 * Two writes of the same IR therefore give byte-identical containers, parts
 * (`word/styles.xml`, `word/document.xml`) included.
 *
 * ## Styles part
 *
 * Every write emits `word/styles.xml`, headings or not, through
 * `docx.write`'s `opts.styles` — one fixed, input-free styles object:
 *
 * - `docDefaults` — run font `Calibri`, size 22 half-points (11 pt);
 * - `Normal` — the default paragraph style;
 * - `Heading1`..`Heading6` — paragraph styles `basedOn`/`next` `Normal`,
 *   bold, sizes 32/28/26/24/22/22 half-points, 240/80 twips spacing
 *   before/after;
 * - `SourceCode` (`Source Code`) — code blocks: Courier New 10 pt, no
 *   spacing before/after;
 * - `BlockText` (`Block Text`) — quoted paragraphs: 720 twips (0.5 in)
 *   left and right indent;
 * - `HorizontalRule` (`Horizontal Rule`) — thematic breaks: a single
 *   3/4 pt bottom paragraph border (`w:pBdr`, carried in the style's
 *   `pPr._extras` — `@awacloud/ooxml` types no paragraph border);
 * - `TableGrid` (`Table Grid`) — a table style with single borders on all
 *   six `w:tblBorders` edges and Word's built-in 108 twips (0.19 cm)
 *   left / right cell padding (`w:tblCellMar`).
 *
 * Every `w:pStyle` this writer references is therefore defined in the
 * part, and no unreferenced style is emitted. The set is fixed,
 * caller-invisible; tier 3 (caller styling) is still not promised — there
 * is no option to supply or alter styles.
 *
 * ## Tier-2 mapping
 *
 * | IR node | docx model |
 * |---|---|
 * | `heading{level}` | `{type:'paragraph', pPr:{pStyle:'Heading'+level}, children:[runs]}` |
 * | `paragraph` | `{type:'paragraph', children:[runs]}` |
 * | `run{text,bold,italic,strike,code}` | `{type:'run', rPr:{bold?,italic?,strike?,font?}, children:[{type:'text', value}]}` — false flags omitted, `code` → `font:'Courier New'`, no `rPr` at all when every flag is false and `code` is false |
 * | `run{link}` | `docx.hyperlink(text, target, {rId, rPr})` — `{type:'hyperlink', rId, target, external:true, children:[run]}`, emphasis flags preserved on the inner run |
 * | `list` | one numbered paragraph per `listItem` (`pPr.numPr = {numId, ilvl}`); every top-level list gets its own `numId` (allocated in document order, 1-based), so two adjacent lists stay two lists on re-read; nested lists share the top-level list's `numId` for their own kind; `ilvl` = nesting depth. A GFM task item (`listItem.escapes.md.task`, set by the md reader) gets a plain leading `☐ ` (U+2610, unchecked) or `☒ ` (U+2612, checked) run in its first paragraph. Bullet levels write `lvlText` U+2022 with NO `rPr` font: U+2022 is a plain Unicode glyph, and pinning the `Symbol` font to it (a symbol-font private-use convention) renders a missing-glyph box in viewers lacking that font |
 * | `table` | `{type:'table', tblPr:{style:'TableGrid', borders:GRID_BORDERS, cellMargins:GRID_CELL_MARGINS}, rows:[{type:'row', cells:[{type:'cell', children:[blocks]}]}]}` — `GRID_BORDERS` = six `{val:'single', sz:4, space:0, color:'auto'}` edges (top, left, bottom, right, insideH, insideV); `GRID_CELL_MARGINS` = `left`/`right` `{w:108, type:'dxa'}`: a style reference AND direct borders and padding |
 * | `codeBlock` | ONE paragraph `{pPr:{pStyle:'SourceCode'}}` holding one `font:'Courier New'` run; source lines separated by `{type:'break'}` (a blank line = two adjacent breaks, the text's one trailing newline writes none, leading spaces kept). The `info` string is not written (no docx carrier; no loss, as on the pdf target) |
 * | `blockquote` | each `paragraph` child → `{pPr:{pStyle:'BlockText'}}`; a nested quote's paragraphs too, with a direct `indent` of 720 twips per level (`left`) and 720 (`right`); any other child keeps its own mapping, emitted in place |
 * | `hr` | an EMPTY paragraph `{pPr:{pStyle:'HorizontalRule'}, children:[]}` |
 *
 * The `Heading<n>` style name matches the read heuristic
 * (`^Heading([1-6])$`, `../read/docx-to-ir.js` `styleToLevel`), so the
 * docx→md leg recovers the level; likewise the reader reads `SourceCode`,
 * `BlockText` and `HorizontalRule` back as a code block, a quote and a
 * rule (consecutive quoted paragraphs re-read as ONE quote).
 *
 * `row.header` has NO concept in `@awacloud/ooxml`'s docx model: the header row
 * stays row 0 positionally. That is a documented degrade of the loss
 * matrix and deliberately NOT a per-node loss — position preserves it
 * through the return leg.
 *
 * `run.code` writes `font: 'Courier New'` into the run's `rPr` (plain runs
 * and hyperlink-inner runs alike): `@awacloud/ooxml` round-trips `rPr.font`
 * through `<w:rFonts>` (`ooxml/src/docx/properties.js`), and the docx→IR
 * leg (`../read/docx-to-ir.js`) recognises `'courier new'` on its frozen
 * monospace allowlist, so `md → docx → md` keeps inline code as backticks —
 * the symmetric path (the premise that code is always written plain is
 * stale).
 *
 * ## Loss codes emitted by this module
 *
 * | Code | Detail | Meaning |
 * |---|---|---|
 * | `list/depth-clamped` | `ilvl>8` | a list nested deeper than `ilvl` 8 was clamped to 8 |
 * | `list/task-marker-dropped` | `[x]` or `[ ]` | a task item's first block is not a paragraph, so its checkbox has no line to lead (the md reader never builds one) |
 * | `block/degraded` | `listItem-child:<kind>` | a non-paragraph, non-list block inside a `listItem` was emitted after the item's paragraph instead of inside it |
 * | `block/degraded` | `blockquote:nested` | a quote nested in a quote was written as more-indented `BlockText` paragraphs — docx has no quote nesting, the return leg reads one flat quote (one loss per nested quote) |
 * | `block/degraded` | `blockquote-child:<kind>` | a non-paragraph, non-quote block inside a quote was written with its own mapping, outside the quote style |
 * | `image/dropped` | the image `name` | NO bytes were reachable for the image — neither `opts.assets[name]` (or its percent-decoded form) nor a reader's `escapes.docx.bytes` / `escapes.odt.bytes` |
 * | `image/size-defaulted` | the image `name` | bytes WERE reachable and the image is PLACED, but {@link imageExtent} reads no size from them (not a PNG, JPEG or GIF header, or a malformed one), so it sits in `@awacloud/ooxml`'s default 2 in × 4:3 box. A degrade, never a drop |
 *
 * ## Images
 *
 * `irToDocx(ir, opts)` accepts `opts.assets` — a `{ <markdown image
 * destination>: Uint8Array }` map, keyed EXACTLY as the markdown wrote it
 * (`![alt](diagram.png)` → key `diagram.png`; no normalisation, no
 * fetching). {@link assetBytes} resolves an image node against it, falling
 * back to the bytes a reader carried in `escapes.docx.bytes` / `escapes.odt.bytes`, and
 * a resolved image is written through `@awacloud/ooxml`'s public
 * `docx.imageRun` — inline inside its paragraph, or as its own paragraph at
 * block position — with the IR `alt` as the drawing description
 * (`wp:docPr descr`, read back as the alt by `../read/docx-to-ir.js`) and,
 * when {@link imageExtent} reads one from the header, its intrinsic size
 * (`cx` / `cy`; 96 dpi when the file states none, scaled down to fit
 * 6 in × 8 in). The header is read for its geometry only — never decoded.
 * Whatever `docx.write` does with non-image bytes is `@awacloud/ooxml`'s
 * business and is pinned as MEASURED in `./ir-to-docx.test.js` (8 random
 * bytes), not guessed at here.
 *
 * A degraded block nested in a `listItem` emits BOTH its `listItem-child:…`
 * loss and its own degrade losses (e.g. a `blockquote` holding a table in a
 * list item emits `listItem-child:blockquote` then
 * `blockquote-child:table`) — each names a distinct, real fidelity loss.
 *
 * Losses are returned in document order.
 *
 * @module oconv/write/ir-to-docx
 */

/**
 * One fidelity loss recorded while writing.
 * @typedef {Object} IrToDocxLoss
 * @property {string} code Stable loss code (see the table above).
 * @property {string} detail Short, human-readable specifics.
 */

/**
 * Result of `irToDocx`.
 * @typedef {Object} IrToDocxResult
 * @property {Uint8Array} bytes The `.docx` (OPC/ZIP) bytes.
 * @property {IrToDocxLoss[]} losses Document-ordered fidelity losses.
 */

/**
 * `oconvIrToDocx` — writes an `oconv-ir/v1` document to `.docx` bytes.
 *
 * Factory surface:
 * - `irToDocx(ir, opts?) → { bytes, losses }`
 *
 * @type {{name: string, dependencies: string[], factory: (irApi: object, docxApi: object) => object}}
 */
import { oconvIr } from '../ir/ir.js';
import { docx } from '@awacloud/ooxml';

export const oconvIrToDocx = {
    name: 'oconvIrToDocx',
    dependencies: ['oconvIr', 'docx'],
    deps: [oconvIr, docx],
    factory(irApi, docxApi) {
        // Capture-free by contract (fw/no-factory-capture): every constant
        // and helper below is declared inside this body.

        /** `w:ilvl` is defined for 0..8 only (ECMA-376 part 1 §17.9). */
        const MAX_ILVL = 8;
        /** Twips of left indent added per nesting level. */
        const INDENT_STEP = 720;
        /** Twips of hanging indent on every list level. */
        const INDENT_HANGING = 360;
        /** `@awacloud/ooxml`'s own hyperlink run styling — kept, then overlaid. */
        const LINK_RPR = { color: '0563C1', underline: 'single' };
        /** Splits a code block into its source lines (LF and CRLF). */
        const LINE_BREAK = /\r?\n/;
        /** `Heading1`..`Heading6` run sizes, in half-points (w:sz). */
        const HEADING_SIZES = [32, 28, 26, 24, 22, 22];
        /** The one table style this writer defines and references. */
        const TABLE_STYLE_ID = 'TableGrid';
        /** Paragraph style of a code block (pandoc's ID, name "Source Code"). */
        const CODE_STYLE_ID = 'SourceCode';
        /** Paragraph style of a quoted paragraph (Word's built-in "Block Text"). */
        const QUOTE_STYLE_ID = 'BlockText';
        /** Paragraph style of a thematic break ("Horizontal Rule"). */
        const RULE_STYLE_ID = 'HorizontalRule';
        /** Monospace face of code: inline code runs and code-block runs. */
        const CODE_FONT = 'Courier New';
        /** Twips of left and right indent of one quote level. */
        const QUOTE_INDENT = 720;
        /** The one trailing newline a code block's text ends with. */
        const TRAILING_LINE_BREAK = /\r?\n$/;
        /** DrawingML extents are in EMU: 914400 per inch. */
        const EMU_PER_INCH = 914400;
        /** GFM task markers: ballot box (U+2610) and ballot box with X (U+2612). */
        const TASK_GLYPHS = { unchecked: '☐ ', checked: '☒ ' };

        /**
         * The `HorizontalRule` style's paragraph border: one `w:pBdr` with a
         * single 3/4 pt auto-colour bottom edge. `@awacloud/ooxml` types no
         * paragraph border, so it rides in the style's `pPr._extras` (an
         * XML element node, written verbatim) — the style's only paragraph
         * property, which keeps the `w:pPr` children in schema order.
         * Built fresh per use, like {@link gridBorders}.
         *
         * @returns {Object} An XML element node (`w:pBdr`).
         */
        function ruleBorder() {
            return {
                type: 'element', name: 'w:pBdr', attrs: {},
                children: [{
                    type: 'element', name: 'w:bottom',
                    attrs: { 'w:val': 'single', 'w:sz': '6', 'w:space': '1', 'w:color': 'auto' },
                    children: []
                }]
            };
        }

        /**
         * `GRID_BORDERS`: the six `w:tblBorders` edges (top, left, bottom,
         * right, insideH, insideV), each a single 1/2 pt auto-colour line.
         * Built fresh per use so no two model nodes share an object (the
         * `docx.write` dehydrate walker may mutate a model in place).
         *
         * @returns {Object} A `docxProperties` `TableBorders` model.
         */
        function gridBorders() {
            const edge = () => ({ val: 'single', sz: 4, space: 0, color: 'auto' });
            return {
                top: edge(), left: edge(), bottom: edge(),
                right: edge(), insideH: edge(), insideV: edge()
            };
        }

        /**
         * `GRID_CELL_MARGINS`: Word's built-in `Table Grid` cell padding,
         * 108 twips (0.19 cm) left and right, so cell text does not touch
         * the grid lines. Built fresh per use, like {@link gridBorders}.
         *
         * @returns {Object} A `docxProperties` `TableCellMargins` model.
         */
        function gridCellMargins() {
            return { left: { w: 108, type: 'dxa' }, right: { w: 108, type: 'dxa' } };
        }

        /**
         * Build the single `opts.styles` object this writer ever emits —
         * deterministic, input-free, caller-invisible: `docDefaults`
         * (Calibri 11 pt), `Normal` (default paragraph style),
         * `Heading1`..`Heading6` (bold, sized, spaced, based on `Normal`),
         * `SourceCode` (Courier New 10 pt, no spacing), `BlockText`
         * (0.5 in left and right indent), `HorizontalRule` (a bottom
         * border) and the `TableGrid` table style (single borders, padded
         * cells). Only keys the `docxProperties` renderers type are used,
         * except the rule's border (see {@link ruleBorder}).
         *
         * @returns {Object} A `docxStyles` styles model.
         */
        function buildStyles() {
            const styles = [
                { type: 'paragraph', styleId: 'Normal', name: 'Normal', isDefault: true }
            ];
            for (let level = 1; level <= 6; level++) {
                styles.push({
                    type: 'paragraph',
                    styleId: 'Heading' + level,
                    name: 'heading ' + level,
                    basedOn: 'Normal',
                    next: 'Normal',
                    pPr: { spacing: { before: 240, after: 80 } },
                    rPr: { bold: true, size: HEADING_SIZES[level - 1] }
                });
            }
            styles.push({
                type: 'paragraph',
                styleId: CODE_STYLE_ID,
                name: 'Source Code',
                basedOn: 'Normal',
                pPr: { spacing: { before: 0, after: 0 } },
                rPr: { font: CODE_FONT, size: 20 }
            }, {
                type: 'paragraph',
                styleId: QUOTE_STYLE_ID,
                name: 'Block Text',
                basedOn: 'Normal',
                pPr: { indent: { left: QUOTE_INDENT, right: QUOTE_INDENT } }
            }, {
                type: 'paragraph',
                styleId: RULE_STYLE_ID,
                name: 'Horizontal Rule',
                basedOn: 'Normal',
                pPr: { _extras: [ruleBorder()] }
            });
            styles.push({
                type: 'table',
                styleId: TABLE_STYLE_ID,
                name: 'Table Grid',
                tblPr: { borders: gridBorders(), cellMargins: gridCellMargins() }
            });
            return {
                docDefaults: { rPr: { font: 'Calibri', size: 22 } },
                styles
            };
        }

        /**
         * Build the single `opts.numbering` object this writer ever emits:
         * two abstract numberings (0 = bullet, 1 = decimal), nine levels
         * each, wired to the concrete instances allocated while the body was
         * emitted — one `<w:num>` per (top-level list, kind) pair, in
         * allocation order.
         *
         * @param {{numId: number, abstractNumId: number}[]} nums The
         *   instances allocated for this document.
         * @returns {Object} A `docxNumbering` document model.
         */
        function buildNumbering(nums) {
            const bulletLevels = [];
            const decimalLevels = [];
            for (let ilvl = 0; ilvl <= MAX_ILVL; ilvl++) {
                const left = INDENT_STEP * (ilvl + 1);
                bulletLevels.push({
                    ilvl,
                    numFmt: 'bullet',
                    lvlText: '•',
                    pPr: { indent: { left, hanging: INDENT_HANGING } }
                });
                decimalLevels.push({
                    ilvl,
                    start: 1,
                    numFmt: 'decimal',
                    lvlText: '%' + (ilvl + 1) + '.',
                    pPr: { indent: { left, hanging: INDENT_HANGING } }
                });
            }
            return {
                abstractNums: [
                    {
                        abstractNumId: 0,
                        multiLevelType: 'multilevel',
                        levels: bulletLevels
                    },
                    {
                        abstractNumId: 1,
                        multiLevelType: 'multilevel',
                        levels: decimalLevels
                    }
                ],
                nums
            };
        }

        /**
         * Image bytes for an IR `image` node: caller `assets[name]` (else its
         * percent-decoded form) first,
         * then a reader's carried bytes (`escapes.docx.bytes`, else
         * `escapes.odt.bytes` — the escapes bag), else `null`. Mirrored in ir-to-docx / ir-to-odt /
         * pdf/render/image — keep byte-identical (asset-bytes-drift.test.js).
         *
         * @param {object} node
         * @param {Object<string, Uint8Array>|undefined} assets
         * @returns {{bytes: Uint8Array, source: 'assets'|'reader'}|null}
         */
        function assetBytes(node, assets) {
            const name = node && typeof node.name === 'string' ? node.name : '';
            const own = (key) => Boolean(assets) && Object.prototype.hasOwnProperty.call(assets, key)
                && assets[key] instanceof Uint8Array;
            if (own(name)) return { bytes: assets[name], source: 'assets' };
            // The caller keys an image by its destination as written; the
            // Markdown reader percent-encodes it (`<a b.png>` -> `a%20b.png`),
            // so an exact miss tries the decoded form.
            let decoded;
            try { decoded = decodeURI(name); } catch { decoded = null; }
            if (decoded !== null && decoded !== name && own(decoded)) {
                return { bytes: assets[decoded], source: 'assets' };
            }
            const bag = node && node.escapes;
            const esc = bag && (bag.docx || bag.odt);
            if (esc && esc.bytes instanceof Uint8Array) {
                return { bytes: esc.bytes, source: 'reader' };
            }
            return null;
        }

        /**
         * Intrinsic display size of encoded image bytes, in inches, read
         * from the header ONLY (never decoded): PNG `IHDR` + `pHYs` (unit
         * metre), JPEG `SOFn` + JFIF density (dpi or dots per cm), GIF
         * logical screen; 96 dpi when the file states none. Scaled down to
         * fit 6 in × 8 in, aspect kept. `null` for any other format or a
         * malformed / truncated header. Mirrored in ir-to-docx / ir-to-odt —
         * keep byte-identical (image-extent-drift.test.js).
         *
         * @param {Uint8Array} bytes
         * @returns {{width: number, height: number}|null} Inches.
         */
        function imageExtent(bytes) {
            const DEFAULT_DPI = 96;
            const MAX_WIDTH = 6;
            const MAX_HEIGHT = 8;
            if (!(bytes instanceof Uint8Array)) return null;
            const n = bytes.length;
            const u16 = i => (bytes[i] << 8) | bytes[i + 1];
            const u32 = i => ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
            const ascii = (i, len) => String.fromCharCode(...bytes.subarray(i, i + len));
            let w = 0;
            let h = 0;
            let dpiX = DEFAULT_DPI;
            let dpiY = DEFAULT_DPI;
            if (n >= 24 && u32(0) === 0x89504e47 && u32(4) === 0x0d0a1a0a && ascii(12, 4) === 'IHDR') {
                w = u32(16);
                h = u32(20);
                for (let p = 8; p + 12 <= n;) {
                    const len = u32(p);
                    const type = ascii(p + 4, 4);
                    if (type === 'pHYs') {
                        if (len >= 9 && p + 17 <= n && bytes[p + 16] === 1 && u32(p + 8) > 0 && u32(p + 12) > 0) {
                            dpiX = u32(p + 8) * 0.0254;
                            dpiY = u32(p + 12) * 0.0254;
                        }
                        break;
                    }
                    if (type === 'IDAT' || type === 'IEND') break;
                    p += 12 + len;
                }
            } else if (n >= 10 && ascii(0, 4) === 'GIF8') {
                w = bytes[6] | (bytes[7] << 8);
                h = bytes[8] | (bytes[9] << 8);
            } else if (n >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
                for (let p = 2; ;) {
                    if (p + 4 > n || bytes[p] !== 0xff) return null;
                    const marker = bytes[p + 1];
                    if (marker === 0xff) { p += 1; continue; }
                    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { p += 2; continue; }
                    if (marker === 0xd9 || marker === 0xda) return null;
                    const len = u16(p + 2);
                    if (len < 2) return null;
                    if (marker === 0xe0 && len >= 14 && p + 16 <= n && ascii(p + 4, 5) === 'JFIF\u0000'
                        && (bytes[p + 11] === 1 || bytes[p + 11] === 2) && u16(p + 12) > 0 && u16(p + 14) > 0) {
                        const perInch = bytes[p + 11] === 1 ? 1 : 2.54;
                        dpiX = u16(p + 12) * perInch;
                        dpiY = u16(p + 14) * perInch;
                    }
                    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                        if (p + 9 > n) return null;
                        h = u16(p + 5);
                        w = u16(p + 7);
                        break;
                    }
                    p += 2 + len;
                }
            }
            if (!(w > 0 && h > 0)) return null;
            const width = w / dpiX;
            const height = h / dpiY;
            const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
            return { width: width * scale, height: height * scale };
        }

        /**
         * `docx.imageRun` options for a placed image: its name, its alt
         * text as the drawing description (when non-empty), and its
         * intrinsic size in EMU when {@link imageExtent} reads one.
         *
         * @param {Object} node An IR `image` node.
         * @param {Uint8Array} bytes Its resolved bytes.
         * @returns {{opts: Object, sized: boolean}}
         */
        function imageOpts(node, bytes) {
            const opts = { name: node.name };
            if (node.alt) opts.description = node.alt;
            const extent = imageExtent(bytes);
            if (extent) {
                opts.cx = Math.round(extent.width * EMU_PER_INCH);
                opts.cy = Math.round(extent.height * EMU_PER_INCH);
            }
            return { opts, sized: !!extent };
        }

        /**
         * The `rPr` flag bag for an IR run — `undefined` when every
         * emphasis flag is false, so a plain run carries no `w:rPr` at all.
         *
         * Keys verified against `ooxml/src/docx/properties.js` `renderRPr`
         * (`w:b` / `w:i` / `w:strike` / `w:rFonts`).
         *
         * `run.code` maps to `font: 'Courier New'` (`docx-to-ir.js`'s
         * `MONO_FONTS` allowlist recognises it on the return leg), giving
         * `md → docx → md` a symmetric round-trip for inline code.
         *
         * @param {Object} run An `oconv-ir/v1` `run` node.
         * @returns {Object|undefined}
         */
        function runFlags(run) {
            const rPr = {};
            if (run.bold) rPr.bold = true;
            if (run.italic) rPr.italic = true;
            if (run.strike) rPr.strike = true;
            if (run.code) rPr.font = CODE_FONT;
            return Object.keys(rPr).length ? rPr : undefined;
        }

        /**
         * Convert an `oconv-ir/v1` document to `.docx` bytes.
         *
         * @param {Object} ir The IR document (validated before mapping).
         * @param {{assets?: Object<string, Uint8Array>}} [opts] Optional
         *   write options. `assets` maps a markdown image destination
         *   (`![alt](diagram.png)` → key `diagram.png`) to its encoded
         *   bytes; caller bytes win over the reader-carried
         *   `escapes.docx.bytes` / `escapes.odt.bytes` (see {@link assetBytes}). Omitted or
         *   `undefined` reproduces the behaviour from before image
         *   placement exactly.
         * @returns {IrToDocxResult}
         * @throws {Error} `oconv: invalid ir (<code> at <path>)` when the
         *   input fails `oconvIr.validate`.
         */
        function irToDocx(ir, opts) {
            const assets = opts && opts.assets;
            const v = irApi.validate(ir);
            if (!v.ok) {
                throw new Error('oconv: invalid ir ('
                    + v.errors[0].code + ' at ' + v.errors[0].path + ')');
            }

            /** @type {IrToDocxLoss[]} */
            const losses = [];
            // 1-based, document-order hyperlink counter (explicit `rId` for every link).
            let hyperlinkCount = 0;
            // Set as soon as a list is met anywhere in the tree.
            let hasList = false;
            /** Concrete `<w:num>` instances, in allocation order. */
            const nums = [];

            /**
             * Allocate the next concrete `<w:num>` instance.
             *
             * @param {boolean} ordered `true` → abstract 1 (decimal),
             *   `false` → abstract 0 (bullet).
             * @returns {number} The new `numId` (1-based).
             */
            function allocNum(ordered) {
                const n = { numId: nums.length + 1, abstractNumId: ordered ? 1 : 0 };
                nums.push(n);
                return n.numId;
            }

            /**
             * Map an inline child list (`run` / `image`) to docx inline
             * nodes, recording a loss for every dropped image.
             *
             * @param {Object[]} children
             * @returns {Object[]}
             */
            function mapInlines(children) {
                const out = [];
                for (const child of children || []) {
                    if (child.kind === 'image') {
                        const r = assetBytes(child, assets);
                        if (r) {
                            const { opts: imgOpts, sized } = imageOpts(child, r.bytes);
                            out.push(docxApi.imageRun(r.bytes, imgOpts));
                            if (!sized) losses.push({ code: 'image/size-defaulted', detail: child.name });
                        } else {
                            losses.push({ code: 'image/dropped', detail: child.name });
                        }
                        continue;
                    }
                    if (child.kind !== 'run') continue;
                    const flags = runFlags(child);
                    if (child.link) {
                        hyperlinkCount++;
                        out.push(docxApi.hyperlink(child.text, child.link, {
                            rId: 'rIdHl' + hyperlinkCount,
                            rPr: { ...LINK_RPR, ...(flags || {}) }
                        }));
                        continue;
                    }
                    out.push(docxApi.run(child.text, flags));
                }
                return out;
            }

            /**
             * The blocks of one list item, a GFM task item's marker
             * (`escapes.md.task`) drawn as a plain leading glyph run of its
             * first paragraph. A task item whose first block is not a
             * paragraph records `list/task-marker-dropped`. The IR is not
             * mutated.
             *
             * @param {Object} item An IR `listItem` node.
             * @returns {Object[]} The blocks to emit.
             */
            function itemBlocks(item) {
                const blocks = item.children || [];
                const task = item.escapes && item.escapes.md && item.escapes.md.task;
                if (!Object.hasOwn(TASK_GLYPHS, task)) return blocks;
                const [first, ...rest] = blocks;
                if (!first || first.kind !== 'paragraph') {
                    losses.push({
                        code: 'list/task-marker-dropped',
                        detail: task === 'checked' ? '[x]' : '[ ]'
                    });
                    return blocks;
                }
                const glyph = irApi.node('run', { text: TASK_GLYPHS[task] });
                return [{ ...first, children: [glyph, ...(first.children || [])] }, ...rest];
            }

            /**
             * Emit the numbered paragraphs of one IR `list` (and, by
             * recursion, of every list nested inside its items). A top-level
             * list owns one `numId` per kind it uses; nested lists share the
             * top-level list's `scope`, so a nested list of the parent's kind
             * keeps the parent's `numId` (at `ilvl = depth`).
             *
             * @param {Object} list An IR `list` node.
             * @param {number} depth 0-based nesting depth.
             * @param {Object[]} out Sink of body-level docx nodes.
             * @param {{bullet: ?number, ordered: ?number}} scope The
             *   `numId`s allocated so far for the enclosing top-level list.
             */
            function emitList(list, depth, out, scope) {
                hasList = true;
                const key = list.ordered ? 'ordered' : 'bullet';
                const numId = scope[key] ?? (scope[key] = allocNum(list.ordered));
                let ilvl = depth;
                if (ilvl > MAX_ILVL) {
                    ilvl = MAX_ILVL;
                    losses.push({ code: 'list/depth-clamped', detail: 'ilvl>8' });
                }
                for (const item of list.children || []) {
                    for (const block of itemBlocks(item)) {
                        if (block.kind === 'paragraph') {
                            out.push({
                                type: 'paragraph',
                                pPr: { numPr: { numId, ilvl } },
                                children: mapInlines(block.children)
                            });
                            continue;
                        }
                        if (block.kind === 'list') {
                            emitList(block, depth + 1, out, scope);
                            continue;
                        }
                        losses.push({
                            code: 'block/degraded',
                            detail: 'listItem-child:' + block.kind
                        });
                        emitBlock(block, out);
                    }
                }
            }

            /**
             * Emit one IR block as zero or more body-level docx nodes.
             *
             * @param {Object} block An IR block node.
             * @param {Object[]} out Sink of body-level docx nodes.
             */
            function emitBlock(block, out) {
                switch (block.kind) {
                    case 'heading':
                        out.push({
                            type: 'paragraph',
                            pPr: { pStyle: 'Heading' + block.level },
                            children: mapInlines(block.children)
                        });
                        return;
                    case 'paragraph':
                        out.push({
                            type: 'paragraph',
                            children: mapInlines(block.children)
                        });
                        return;
                    case 'list':
                        emitList(block, 0, out, { bullet: null, ordered: null });
                        return;
                    case 'table':
                        out.push(mapTable(block));
                        return;
                    case 'codeBlock': {
                        // One paragraph, one monospace run, a line break
                        // between source lines (the trailing newline
                        // writes none).
                        const kids = [];
                        const lines = String(block.text)
                            .replace(TRAILING_LINE_BREAK, '').split(LINE_BREAK);
                        lines.forEach((line, i) => {
                            if (i) kids.push({ type: 'break' });
                            if (line) kids.push({ type: 'text', value: line });
                        });
                        out.push({
                            type: 'paragraph',
                            pPr: { pStyle: CODE_STYLE_ID },
                            children: kids.length
                                ? [{ type: 'run', rPr: { font: CODE_FONT }, children: kids }]
                                : []
                        });
                        return;
                    }
                    case 'blockquote':
                        emitQuote(block, 1, out);
                        return;
                    case 'hr':
                        out.push({ type: 'paragraph', pPr: { pStyle: RULE_STYLE_ID }, children: [] });
                        return;
                    case 'image': {
                        const r = assetBytes(block, assets);
                        if (r) {
                            const { opts: imgOpts, sized } = imageOpts(block, r.bytes);
                            out.push({
                                type: 'paragraph',
                                children: [docxApi.imageRun(r.bytes, imgOpts)]
                            });
                            if (!sized) losses.push({ code: 'image/size-defaulted', detail: block.name });
                        } else {
                            losses.push({ code: 'image/dropped', detail: block.name });
                        }
                        return;
                    }
                    default:
                        return;
                }
            }

            /**
             * Emit one IR `blockquote`: its paragraphs styled `BlockText`
             * (from the second level on, with a direct indent of one more
             * level each); a nested quote records `blockquote:nested` (docx
             * has no quote nesting a reader recovers), any other child keeps
             * its own mapping and records `blockquote-child:<kind>`.
             *
             * @param {Object} quote An IR `blockquote` node.
             * @param {number} depth 1-based quote nesting level.
             * @param {Object[]} out Sink of body-level docx nodes.
             */
            function emitQuote(quote, depth, out) {
                for (const child of quote.children || []) {
                    if (child.kind === 'paragraph') {
                        const pPr = { pStyle: QUOTE_STYLE_ID };
                        if (depth > 1) {
                            pPr.indent = { left: QUOTE_INDENT * depth, right: QUOTE_INDENT };
                        }
                        out.push({ type: 'paragraph', pPr, children: mapInlines(child.children) });
                        continue;
                    }
                    if (child.kind === 'blockquote') {
                        losses.push({ code: 'block/degraded', detail: 'blockquote:nested' });
                        emitQuote(child, depth + 1, out);
                        continue;
                    }
                    losses.push({ code: 'block/degraded', detail: 'blockquote-child:' + child.kind });
                    emitBlock(child, out);
                }
            }

            /**
             * Map an IR `table` to the docx `table` model. `row.header` has
             * no docx counterpart — the header row keeps position 0. Every
             * table carries a typed `tblPr`: the `TableGrid` style reference
             * (defined in the styles part) AND direct single borders and
             * cell padding, so the grid renders whether or not a consumer
             * resolves the style.
             *
             * @param {Object} table An IR `table` node.
             * @returns {Object}
             */
            function mapTable(table) {
                return {
                    type: 'table',
                    tblPr: { style: TABLE_STYLE_ID, borders: gridBorders(), cellMargins: gridCellMargins() },
                    rows: (table.children || []).map(row => ({
                        type: 'row',
                        cells: (row.children || []).map(cell => {
                            const cellBlocks = [];
                            for (const block of cell.children || []) {
                                emitBlock(block, cellBlocks);
                            }
                            return { type: 'cell', children: cellBlocks };
                        })
                    }))
                };
            }

            const body = [];
            for (const block of ir.children || []) emitBlock(block, body);

            // The styles part is emitted on EVERY write, headings or not.
            const writeOpts = { styles: buildStyles() };
            if (hasList) writeOpts.numbering = buildNumbering(nums);
            const bytes = docxApi.write({ type: 'document', body }, writeOpts);
            return { bytes, losses };
        }

        return { irToDocx };
    }
};
