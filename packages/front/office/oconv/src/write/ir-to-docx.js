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
 * | `list` | one numbered paragraph per `listItem` (`pPr.numPr = {numId, ilvl}`); every top-level list gets its own `numId` (allocated in document order, 1-based), so two adjacent lists stay two lists on re-read; nested lists share the top-level list's `numId` for their own kind; `ilvl` = nesting depth. Bullet levels write `lvlText` U+2022 with NO `rPr` font: U+2022 is a plain Unicode glyph, and pinning the `Symbol` font to it (a symbol-font private-use convention) renders a missing-glyph box in viewers lacking that font |
 * | `table` | `{type:'table', tblPr:{style:'TableGrid', borders:GRID_BORDERS, cellMargins:GRID_CELL_MARGINS}, rows:[{type:'row', cells:[{type:'cell', children:[blocks]}]}]}` — `GRID_BORDERS` = six `{val:'single', sz:4, space:0, color:'auto'}` edges (top, left, bottom, right, insideH, insideV); `GRID_CELL_MARGINS` = `left`/`right` `{w:108, type:'dxa'}`: a style reference AND direct borders and padding |
 * | `codeBlock` | one plain paragraph per source line |
 * | `blockquote` | its child blocks, emitted in place |
 *
 * The `Heading<n>` style name matches the read heuristic
 * (`^Heading([1-6])$`, `../read/docx-to-ir.js` `styleToLevel`), so the
 * docx→md leg recovers the level.
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
 * | `block/degraded` | `listItem-child:<kind>` | a non-paragraph, non-list block inside a `listItem` was emitted after the item's paragraph instead of inside it |
 * | `block/degraded` | `codeBlock` | code block written as plain paragraphs (one per source line) |
 * | `block/degraded` | `blockquote` | quotation written as its bare child blocks |
 * | `block/dropped` | `hr` | thematic break dropped (docx→IR skips empty paragraphs, so any empty-paragraph encoding would vanish on the return leg anyway) |
 * | `image/dropped` | the image `name` | NO bytes were reachable for the image — neither `opts.assets[name]` nor the docx reader's `escapes.docx.bytes` |
 * | `image/size-defaulted` | the image `name` | bytes WERE reachable and the image is PLACED, at `@awacloud/ooxml`'s default 2 in × 4:3 box — this writer passes no `cx`/`cy`, so the image's INTRINSIC size is not applied. A degrade, never a drop |
 *
 * ## Images
 *
 * `irToDocx(ir, opts)` accepts `opts.assets` — a `{ <markdown image
 * destination>: Uint8Array }` map, keyed EXACTLY as the markdown wrote it
 * (`![alt](diagram.png)` → key `diagram.png`; no normalisation, no
 * fetching). {@link assetBytes} resolves an image node against it, falling
 * back to the bytes a `docx → IR` read carried in `escapes.docx.bytes`, and
 * a resolved image is written through `@awacloud/ooxml`'s public
 * `docx.imageRun` — inline inside its paragraph, or as its own paragraph at
 * block position.
 *
 * This writer NEVER sniffs the bytes. Whatever `docx.write` does with
 * non-image bytes is `@awacloud/ooxml`'s business and is pinned as MEASURED
 * in `./ir-to-docx.test.js` (8 random bytes), not guessed at here.
 *
 * A degraded block nested in a `listItem` emits BOTH its `listItem-child:…`
 * loss and its own degrade loss (e.g. a `codeBlock` in a list item emits
 * `listItem-child:codeBlock` then `codeBlock`) — each names a distinct,
 * real fidelity loss.
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
         * `Heading1`..`Heading6` (bold, sized, spaced, based on `Normal`)
         * and the `TableGrid` table style (single borders, padded cells).
         * Only keys the `docxProperties` renderers type are used — never
         * `_extras`.
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
         * Image bytes for an IR `image` node: caller `assets[name]` first,
         * then the docx reader's carried bytes (`escapes.docx.bytes`, the
         * escapes bag), else `null`. Mirrored in ir-to-docx / ir-to-odt /
         * pdf/render/image — keep byte-identical (asset-bytes-drift.test.js).
         *
         * @param {object} node
         * @param {Object<string, Uint8Array>|undefined} assets
         * @returns {{bytes: Uint8Array, source: 'assets'|'reader'}|null}
         */
        function assetBytes(node, assets) {
            const name = node && typeof node.name === 'string' ? node.name : '';
            if (assets && Object.prototype.hasOwnProperty.call(assets, name)
                && assets[name] instanceof Uint8Array) {
                return { bytes: assets[name], source: 'assets' };
            }
            const esc = node && node.escapes && node.escapes.docx;
            if (esc && esc.bytes instanceof Uint8Array) {
                return { bytes: esc.bytes, source: 'reader' };
            }
            return null;
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
            if (run.code) rPr.font = 'Courier New';
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
         *   `escapes.docx.bytes` (see {@link assetBytes}). Omitted or
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
                            out.push(docxApi.imageRun(r.bytes, { name: child.name }));
                            losses.push({ code: 'image/size-defaulted', detail: child.name });
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
                    for (const block of item.children || []) {
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
                    case 'codeBlock':
                        losses.push({ code: 'block/degraded', detail: 'codeBlock' });
                        for (const line of String(block.text).split(LINE_BREAK)) {
                            out.push({
                                type: 'paragraph',
                                children: [docxApi.run(line)]
                            });
                        }
                        return;
                    case 'blockquote':
                        losses.push({ code: 'block/degraded', detail: 'blockquote' });
                        for (const child of block.children || []) emitBlock(child, out);
                        return;
                    case 'hr':
                        losses.push({ code: 'block/dropped', detail: 'hr' });
                        return;
                    case 'image': {
                        const r = assetBytes(block, assets);
                        if (r) {
                            out.push({
                                type: 'paragraph',
                                children: [docxApi.imageRun(r.bytes, { name: block.name })]
                            });
                            losses.push({ code: 'image/size-defaulted', detail: block.name });
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
