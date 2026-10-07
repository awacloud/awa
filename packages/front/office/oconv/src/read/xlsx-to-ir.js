// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `xlsx` → `oconv-ir/v1` reader — tier 2 (per the frozen
 * fidelity matrix).
 *
 * Converts the value of `@awacloud/ooxml`'s public `xlsx.read(bytes)` façade
 * into a pivot IR document (`oconvIr`, `../ir/ir.js`). Pure transformation
 * over an already-parsed structure — no bytes, no I/O — so it is
 * Worker-safe by construction, mirroring `docx-to-ir.js`'s own contract.
 *
 * Composes ONLY `xlsx`'s public API — never an `@awacloud/ooxml` internal. A
 * capability missing upstream is never patched here or in
 * `@awacloud/ooxml`: the affected element is recorded as a loss.
 *
 * ## Tier-2 mapping
 *
 * One IR `heading{level:1}` + one IR `table` per workbook sheet, in
 * workbook order (`readResult.workbook.sheets`):
 *
 * - **Heading** — the sheet's own `name`, always level 1 (sheets are the
 *   workbook's own top-level divisions — no nesting signal exists to
 *   derive a deeper level from).
 * - **Table** — `sheet.rows` (already a dense-from-column-0 grid per row,
 *   per `@awacloud/ooxml`'s own `parseRow`) is flattened to `string[][]` via
 *   {@link module:oconv/read/sheet-grid}'s `normalizeGrid` (mirrored
 *   inline here, `fw/no-factory-capture`): every row is padded to the
 *   sheet's widest row, then trailing all-empty rows/columns are trimmed.
 *   A sheet whose trimmed grid has zero rows emits its heading only — no
 *   empty `table` node. No `row.header` is ever set: xlsx carries no
 *   first-class header-row concept (unlike `.ods`'s
 *   `table:table-header-rows` — see `ods-to-ir.js`).
 * - **Cell text** — `cell.value` (already typed by `xlsx.read()`: number
 *   for `t:'n'`, string for `t:'s'`/`'inlineStr'`/`'str'`, boolean for
 *   `t:'b'`) is stringified (`String(value)`; `null`/`undefined` → `''`).
 *   No date type exists on a raw xlsx cell — a "date" is a plain number
 *   plus a `numFmt` in `xl/styles.xml`, which is dropped formatting (see
 *   below), so a date-formatted cell surfaces as its raw serial number.
 *
 * ## Loss codes emitted by this module
 *
 * | Code | Meaning |
 * |---|---|
 * | `sheet/formula-as-value` | a formula cell (`cell.formula` set) was reduced to its cached/computed value only |
 * | `sheet/format-dropped` | recorded once per sheet, first cell carrying a style index (`cell.s != null`) |
 * | `sheet/merge-dropped` | recorded once per sheet when `sheet.merges` is non-empty (a merged range is flattened into its independent cells) |
 * | `sheet/chart-dropped` | recorded once per sheet, first `sheet.drawings` entry carrying a `.chart` |
 *
 * Pivot tables are a **matrix-level, permanently out-of-scope drop, never
 * reported per node**: `xlsx.read()`'s default composition (the
 * `xlsx` module's own frozen dependency list) parses no pivot-table part
 * at all — `xlsxPivotTables` (`extra/sml-pivot-tables.js`) is an opt-in
 * `.use()` extension this reader's frozen dependency list (`['oconvIr',
 * 'xlsx']`) never wires, so a pivot table is structurally invisible on
 * the `readResult` this module receives — nothing to detect, mirroring
 * how `docx-to-ir.js` never reports tracked changes or `oMath` per node.
 *
 * @module oconv/read/xlsx-to-ir
 */

import { oconvIr } from '../ir/ir.js';
import { xlsx } from '@awacloud/ooxml';

export const oconvXlsxToIr = {
    name: 'oconvXlsxToIr',
    dependencies: ['oconvIr', 'xlsx'],
    deps: [oconvIr, xlsx],

    factory(oconvIrMod, xlsxApi) {
        // Keep this factory capture-free (fw/no-factory-capture): every
        // helper it uses is declared inside its own body, including the
        // sheet-grid algorithm mirrored from ./sheet-grid.js (see that
        // file's header for the duplication note + drift-test pointer).
        const { node, doc } = oconvIrMod;

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

        /** Stringify one xlsx cell's value, recording a formula-as-value loss. */
        function cellText(cell, sheetName, rowIdx, colIdx, losses) {
            if (!cell) return '';
            if (cell.formula) {
                losses.push({
                    code: 'sheet/formula-as-value',
                    detail: `${sheetName}!${xlsxApi.cellRef(rowIdx, colIdx)}`
                });
            }
            const v = cell.value;
            if (v === null || v === undefined) return '';
            if (typeof v === 'boolean') return v ? 'true' : 'false';
            return String(v);
        }

        /** Build one IR `cell` node from its (already trimmed) text. */
        function irCell(text) {
            return node('cell', {}, text
                ? [node('paragraph', {}, [node('run', { text })])]
                : []);
        }

        function tableFromGrid(grid) {
            const rows = grid.map((r) =>
                node('row', { header: false }, r.map(irCell)));
            return node('table', {}, rows);
        }

        /**
         * Convert `readResult` (the value of `xlsx.read(bytes)`) into an
         * `oconv-ir/v1` document plus its loss ledger.
         *
         * @param {object} readResult Value of `xlsx.read(bytes)`.
         * @param {object} [_opts] Reserved for future options; unused today.
         * @returns {{ir: object, losses: {code: string, detail: string}[]}}
         */
        function xlsxToIr(readResult, _opts) {
            const losses = [];
            const sheets = (readResult && readResult.workbook
                && readResult.workbook.sheets) || [];
            const blocks = [];

            for (const sheet of sheets) {
                const sheetName = sheet.name || '';
                blocks.push(node('heading', { level: 1 },
                    [node('run', { text: sheetName })]));

                const rawRows = (sheet.rows || []).map((row, r) =>
                    (row || []).map((cell, c) => cellText(cell, sheetName, r, c, losses)));
                const grid = normalizeGrid(rawRows);
                if (grid.length) blocks.push(tableFromGrid(grid));

                let formatSeen = false;
                for (const row of sheet.rows || []) {
                    for (const cell of row || []) {
                        if (cell && cell.s != null) { formatSeen = true; break; }
                    }
                    if (formatSeen) break;
                }
                if (formatSeen) {
                    losses.push({ code: 'sheet/format-dropped', detail: sheetName });
                }

                if (sheet.merges && sheet.merges.length) {
                    losses.push({ code: 'sheet/merge-dropped', detail: sheetName });
                }

                const chart = (sheet.drawings || []).find((d) => d.chart);
                if (chart) {
                    losses.push({ code: 'sheet/chart-dropped', detail: sheetName });
                }
            }

            return { ir: doc(blocks), losses };
        }

        return { xlsxToIr };
    }
};
