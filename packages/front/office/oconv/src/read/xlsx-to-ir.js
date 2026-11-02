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
 * ## `opts.sheets` — CSV or TSV instead of a table
 *
 * `'table'` (the default, or absent) maps a sheet as above. `'csv'` or
 * `'tsv'` writes the same normalised grid as ONE IR `codeBlock` (`info`
 * `csv` / `tsv`) under the sheet's heading instead of a `table` — far
 * fewer bytes than a pipe table on a dense sheet. csv follows RFC 4180 (a
 * field holding a comma, a double quote, a CR or an LF is quoted, its quotes
 * doubled; rows joined by LF); tsv writes a cell's backslash, tab, LF and CR
 * as two-character escapes and records `sheet/tsv-escaped` once per sheet
 * when it did. Every other loss is recorded as for a table. Another value
 * throws `oconv: bad sheets`.
 *
 * ## `opts.cellBudget` — a sheet too wide to pad
 *
 * Padding every row to the widest makes a table of rows times columns: one
 * wide row in a long sheet can make tens of millions of empty cells. Under
 * `opts.cellBudget` (a positive safe integer, else `oconv: bad cell
 * budget`), a sheet whose padded grid would hold more cells is never
 * padded: under `'table'` it gives one IR `paragraph` per non-empty cell,
 * `<A1 address>: <text>`, in row then column order; under `'csv'` /
 * `'tsv'`, its rows unpadded (each row's trailing empty cells trimmed).
 * Either way `sheet/sparse-form` records the sheet name and the padded and
 * kept cell counts. The size is found from the row lengths, before any
 * padding (`paddedSize`, mirrored from {@link module:oconv/read/sheet-grid}).
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

        function gridToCsv(grid) {
            const field = (s) => (/[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
            return grid.map((r) => r.map(field).join(',')).join('\n');
        }

        function gridToTsv(grid) {
            let escaped = false;
            const ESC = { '\\': '\\\\', '\t': '\\t', '\n': '\\n', '\r': '\\r' };
            const field = (s) => s.replace(/[\\\t\n\r]/g, (c) => { escaped = true; return ESC[c]; });
            const text = grid.map((r) => r.map(field).join('\t')).join('\n');
            return { text, escaped };
        }

        /** `opts.sheets`: `'table'` (also when absent), `'csv'` or `'tsv'`, else throws. */
        function sheetsMode(opts) {
            const v = opts && opts.sheets;
            if (v === undefined || v === 'table') return 'table';
            if (v === 'csv' || v === 'tsv') return v;
            throw new Error('oconv: bad sheets');
        }

        /**
         * The block(s) of one sheet's grid: an IR `table` under `'table'`,
         * a `codeBlock` (`info` `csv` / `tsv`) otherwise; none for an empty
         * grid. A TSV escape records `sheet/tsv-escaped` once.
         */
        function gridBlock(grid, mode, sheetName, losses, table) {
            if (!grid.length) return null;
            if (mode === 'table') return table();
            if (mode === 'csv') return node('codeBlock', { info: 'csv', text: gridToCsv(grid) });
            const tsv = gridToTsv(grid);
            if (tsv.escaped) losses.push({ code: 'sheet/tsv-escaped', detail: sheetName });
            return node('codeBlock', { info: 'tsv', text: tsv.text });
        }

        /* ── sparse form past `opts.cellBudget` (mirror of ./sheet-grid.js) ── */

        function cellAddress(rowIdx, colIdx) {
            let col = '';
            for (let n = colIdx + 1; n > 0; n = Math.floor((n - 1) / 26)) {
                col = String.fromCharCode(65 + ((n - 1) % 26)) + col;
            }
            return col + (rowIdx + 1);
        }

        function paddedSize(rows) {
            let height = 0;
            let width = 0;
            (rows || []).forEach((r, i) => {
                const row = r || [];
                let n = row.length;
                while (n > 0 && row[n - 1] === '') n--;
                if (n > 0) { height = i + 1; width = Math.max(width, n); }
            });
            return height * width;
        }

        function unpaddedRows(rows) {
            const out = (rows || []).map((r) => {
                const row = r || [];
                let n = row.length;
                while (n > 0 && row[n - 1] === '') n--;
                return row.slice(0, n);
            });
            let last = out.length - 1;
            while (last >= 0 && out[last].length === 0) last--;
            return out.slice(0, last + 1);
        }

        function sparseLines(rows) {
            const lines = [];
            unpaddedRows(rows).forEach((row, i) => row.forEach((text, j) => {
                if (text !== '') lines.push(cellAddress(i, j) + ': ' + text);
            }));
            return lines;
        }

        /** `opts.cellBudget`: absent, or a positive safe integer, else throws. */
        function cellBudgetOf(opts) {
            const v = opts && opts.cellBudget;
            if (v === undefined) return undefined;
            if (!Number.isSafeInteger(v) || v < 1) throw new Error('oconv: bad cell budget');
            return v;
        }

        /**
         * The blocks of a sheet whose padded table is past the budget,
         * never padded: one paragraph per value (`<A1 address>: <text>`)
         * under `'table'`, the unpadded rows under `'csv'` / `'tsv'`; the
         * `sheet/sparse-form` loss records the padded and kept counts.
         */
        function sparseBlocks(rawRows, size, mode, sheetName, losses) {
            const lines = sparseLines(rawRows);
            losses.push({ code: 'sheet/sparse-form', detail: `${sheetName}: ${size} padded cells, ${lines.length} kept` });
            if (mode === 'table') return lines.map((text) => node('paragraph', {}, [node('run', { text })]));
            return [gridBlock(unpaddedRows(rawRows), mode, sheetName, losses, null)];
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
         * @param {{sheets?: string, cellBudget?: number}} [opts] `sheets` —
         *   `'table'` (default), `'csv'` or `'tsv'`: how each sheet's grid is
         *   written (see the module header); else `oconv: bad sheets`.
         *   `cellBudget` — a positive safe integer: a sheet whose padded
         *   table would hold more cells is written unpadded (see the module
         *   header); else `oconv: bad cell budget`.
         * @returns {{ir: object, losses: {code: string, detail: string}[]}}
         * @throws {Error} `oconv: bad sheets`, `oconv: bad cell budget`
         */
        function xlsxToIr(readResult, opts) {
            const mode = sheetsMode(opts);
            const budget = cellBudgetOf(opts);
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
                const size = budget === undefined ? 0 : paddedSize(rawRows);
                if (budget !== undefined && size > budget) {
                    blocks.push(...sparseBlocks(rawRows, size, mode, sheetName, losses));
                } else {
                    const grid = normalizeGrid(rawRows);
                    const block = gridBlock(grid, mode, sheetName, losses, () => tableFromGrid(grid));
                    if (block) blocks.push(block);
                }

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
