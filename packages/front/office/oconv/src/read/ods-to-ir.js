// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `ods` → `oconv-ir/v1` reader — tier 2 (per the frozen
 * fidelity matrix).
 *
 * Converts the value of `@awacloud/odf`'s public `ods.read(bytes)` façade into
 * a pivot IR document (`oconvIr`, `../ir/ir.js`), composing `@awacloud/odf`'s
 * public surface only — same contract, same loss-vocabulary shape as
 * `xlsx-to-ir.js`, mirroring the docx/odt sister-pair pattern (identical
 * codes, format-specific detection per side).
 *
 * ## Tier-2 mapping
 *
 * One IR `heading{level:1}` + one IR `table` per `<table:table>`
 * (`readResult.spreadsheet.tables`), in document order:
 *
 * - **Heading** — the table's own `name`, always level 1 (same rationale
 *   as `xlsx-to-ir.js`: no nesting signal to derive a deeper level from).
 * - **Table** — every row's cells are stringified (see below), `table:
 *   number-rows-repeated` / `table:number-columns-repeated` are expanded
 *   (capped at {@link MAX_REPEAT} — a documented safety bound, never a
 *   loss: real content repeats are always far below it, and a huge
 *   trailing "rest of the sheet is empty" repeat count is trimmed away
 *   regardless of the exact cap by {@link module:oconv/read/sheet-grid}'s
 *   `normalizeGrid`, mirrored inline here, `fw/no-factory-capture`).
 *   `table:table-header-rows`, unlike xlsx, IS a real public signal
 *   (`table.headerRows`) — the corresponding leading rows of the trimmed
 *   grid get `row.header:true` (clamped to the trimmed row count).
 * - **Cell text** — the typed `office:value-type` value
 *   (`cell.value`, already a raw string covering string/float/percentage/
 *   currency/boolean/date/time) is used verbatim when present; otherwise
 *   the cell's raw paragraph `children` are text-extracted (a plain-text
 *   cell with no `office:value-type` attribute at all). A
 *   `<table:covered-table-cell>` (the placeholder following a colSpan/
 *   rowSpan merge) always contributes `''`.
 *
 * ## Loss codes emitted by this module
 *
 * | Code | Meaning |
 * |---|---|
 * | `sheet/formula-as-value` | a formula cell (`table:formula` set) was reduced to its cached/computed value only |
 * | `sheet/format-dropped` | recorded once per sheet, first cell carrying a `styleName` |
 * | `sheet/merge-dropped` | recorded once per sheet, first cell with `colSpan`/`rowSpan` > 1 |
 * | `sheet/chart-dropped` | recorded once per sheet when the table carries a `table:shapes` extra (an embedded chart/draw layer `@awacloud/odf`'s `spreadsheet.js` does not type) |
 *
 * Pivot tables are a **matrix-level, permanently out-of-scope drop, never
 * reported per node**: no `@awacloud/odf` module in this reader's frozen
 * dependency list (`['oconvIr', 'ods']`) types `<table:database-ranges>`/
 * pivot-table extensions at all — structurally invisible on the
 * `readResult` this module receives, mirroring `docx-to-ir.js`'s handling
 * of tracked changes / `oMath`.
 *
 * @module oconv/read/ods-to-ir
 */

import { oconvIr } from '../ir/ir.js';
import { ods } from '@awacloud/odf';

export const oconvOdsToIr = {
    name: 'oconvOdsToIr',
    dependencies: ['oconvIr', 'ods'],
    deps: [oconvIr, ods],

    factory(oconvIrMod, ods) {
        // unused-dep guard (referenced for runtime registration only): the
        // factory surface takes an already-produced `ods.read()` result, not
        // `ods` itself — mirrors `odt-to-ir.js`'s own `void odt;` note.
        void ods;

        const { node, doc } = oconvIrMod;

        // Safety bound on `table:number-*-repeated` expansion — see the
        // module doc header. Capture-free by construction
        // (fw/no-factory-capture): declared inside the factory body.
        const MAX_REPEAT = 1000;

        /* ── sheet-grid (mirror of ./sheet-grid.js) ─────────────────────── */

        function normalizeGrid(rows) {
            const src = rows || [];
            const width = src.reduce((m, r) => Math.max(m, (r || []).length), 0);

            let grid = src.map((r) => {
                const out = (r || []).slice();
                while (out.length < width) out.push('');
                return out;
            });

            let lastRow = grid.length - 1;
            while (lastRow >= 0 && grid[lastRow].every((c) => c === '')) lastRow--;
            grid = grid.slice(0, lastRow + 1);

            let lastCol = width - 1;
            while (lastCol >= 0 && grid.every((r) => r[lastCol] === '')) lastCol--;
            grid = grid.map((r) => r.slice(0, lastCol + 1));

            return grid;
        }

        /** Concatenate the visible text of a raw (unparsed) xml element. */
        function extractText(el) {
            let out = '';
            for (const c of (el && el.children) || []) {
                if (c.type === 'text') out += c.value || '';
                else if (c.type === 'element') out += extractText(c);
            }
            return out;
        }

        /** Text of a cell's raw paragraph `children` (no typed value present). */
        function childrenText(children) {
            let out = '';
            for (const c of children || []) out += extractText(c);
            return out;
        }

        /**
         * Stringify one ods cell's value, recording a formula-as-value loss
         * and flipping the per-sheet `flags` once for a styled/merged cell.
         */
        function cellText(cell, cellLabel, losses, flags) {
            if (!cell) return '';
            if (cell.styleName && !flags.format) {
                flags.format = true;
                losses.push({ code: 'sheet/format-dropped', detail: flags.sheetName });
            }
            if ((cell.colSpan > 1 || cell.rowSpan > 1) && !flags.merge) {
                flags.merge = true;
                losses.push({ code: 'sheet/merge-dropped', detail: flags.sheetName });
            }
            if (cell.covered) return '';
            if (cell.formula) {
                losses.push({ code: 'sheet/formula-as-value', detail: cellLabel });
            }
            if (cell.value != null) return String(cell.value);
            return childrenText(cell.children);
        }

        /** One row's cells, `table:number-columns-repeated` expanded (capped). */
        function expandRowCells(row, sheetName, rowIdx, losses, flags) {
            const out = [];
            let colIdx = 0;
            for (const cell of (row && row.cells) || []) {
                const label = `${sheetName}!R${rowIdx + 1}C${colIdx + 1}`;
                const text = cellText(cell, label, losses, flags);
                const n = Math.min(cell.repeated || 1, MAX_REPEAT);
                for (let i = 0; i < n; i++) out.push(text);
                colIdx += n;
            }
            return out;
        }

        /** A table's rows as `string[][]`, `table:number-rows-repeated` expanded (capped). */
        function expandTableRows(table, sheetName, losses, flags) {
            const out = [];
            (table.rows || []).forEach((row, rowIdx) => {
                const cells = expandRowCells(row, sheetName, rowIdx, losses, flags);
                const n = Math.min(row.repeated || 1, MAX_REPEAT);
                for (let i = 0; i < n; i++) out.push(cells);
            });
            return out;
        }

        /** Build one IR `cell` node from its (already trimmed) text. */
        function irCell(text) {
            return node('cell', {}, text
                ? [node('paragraph', {}, [node('run', { text })])]
                : []);
        }

        function tableFromGrid(grid, headerCount) {
            const rows = grid.map((r, i) =>
                node('row', { header: i < headerCount }, r.map(irCell)));
            return node('table', {}, rows);
        }

        /** `true` iff `table._extras` carries a `table:shapes` (chart/draw layer). */
        function hasShapesExtra(table) {
            const extras = table._extras && table._extras.children;
            return !!(extras && extras.some((c) => c.name === 'table:shapes'));
        }

        /**
         * Convert `readResult` (the value of `ods.read(bytes)`) into an
         * `oconv-ir/v1` document plus its loss ledger.
         *
         * @param {object} readResult Value of `ods.read(bytes)`.
         * @param {object} [_opts] Reserved for future options; unused today.
         * @returns {{ir: object, losses: {code: string, detail: string}[]}}
         */
        function odsToIr(readResult, _opts) {
            const losses = [];
            const tables = (readResult && readResult.spreadsheet
                && readResult.spreadsheet.tables) || [];
            const blocks = [];

            for (const table of tables) {
                const sheetName = table.name || '';
                blocks.push(node('heading', { level: 1 },
                    [node('run', { text: sheetName })]));

                const flags = { sheetName, format: false, merge: false };
                const rawRows = expandTableRows(table, sheetName, losses, flags);
                const grid = normalizeGrid(rawRows);
                const headerCount = Math.min(table.headerRows || 0, grid.length);
                if (grid.length) blocks.push(tableFromGrid(grid, headerCount));

                if (hasShapesExtra(table)) {
                    losses.push({ code: 'sheet/chart-dropped', detail: sheetName });
                }
            }

            return { ir: doc(blocks), losses };
        }

        return { odsToIr };
    }
};
