// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Deterministic sheet-grid normalization shared by
 * `xlsx-to-ir.js` and `ods-to-ir.js` (tier 2 — one IR `table` per sheet).
 *
 * Both readers first flatten a sheet into a plain 2-D array of already
 * stringified cell text (raw `value`/`formula` resolution is each
 * reader's own format-specific job — see their own module docs), then
 * call {@link normalizeGrid} to pad every row to the sheet's widest row
 * and trim trailing all-empty rows/columns before building the IR
 * `table`/`row`/`cell` nodes (empty trailing rows/columns are trimmed).
 * Under `opts.sheets` `'csv'` or `'tsv'` the readers write the grid
 * through {@link gridToCsv} or {@link gridToTsv} instead. Under
 * `opts.cellBudget`, a sheet whose padded grid ({@link paddedSize}) would
 * exceed the budget is never padded: {@link sparseLines} (or
 * {@link unpaddedRows} for csv / tsv) instead.
 *
 * > **Duplication note (deliberate).** Both `oconvXlsxToIr` and
 * > `oconvOdsToIr` carry their own inline copy of `normalizeGrid` (and of
 * > `gridToCsv` / `gridToTsv`) because
 * > an fw factory may not capture a module-scope binding
 * > (`fw/no-factory-capture` — the factory source is serialised into
 * > Workers and inlined by the standalone builder). The two copies are
 * > pinned to this standalone one by a drift test in EACH reader's own
 * > `*.test.js`.
 *
 * Pure module: no imports, no I/O, no `@awacloud/*` coupling — operates on a
 * plain `string[][]` (never mutated; a NEW grid is always returned).
 *
 * @module oconv/read/sheet-grid
 */

/**
 * Pad every row to the width of the widest row (with `''`), then trim
 * trailing all-empty rows (from the end) and, once row-trimmed, trailing
 * all-empty columns checked across every remaining row (from the end). A
 * cell counts as "empty" iff its text is the empty string `''`. A
 * non-trailing empty cell (surrounded by non-empty content) is never
 * removed — only whole trailing rows/columns are.
 *
 * @param {string[][]} rows Ragged or rectangular grid of cell text.
 * @returns {string[][]} A NEW grid (possibly `[]`); `rows` is untouched.
 */
export function normalizeGrid(rows) {
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

/**
 * The grid as CSV (RFC 4180): a field holding a comma, a double quote, a
 * CR or an LF is quoted, its quotes doubled; rows joined by LF.
 * @param {string[][]} grid A normalised grid.
 * @returns {string}
 */
export function gridToCsv(grid) {
    const field = (s) => (/[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
    return grid.map((r) => r.map(field).join(',')).join('\n');
}

/**
 * The grid as TSV: a cell's backslash, tab, LF and CR written as the
 * two-character escapes `\\`, `\t`, `\n`, `\r`; rows joined by LF.
 * `escaped` says whether any cell needed it.
 * @param {string[][]} grid A normalised grid.
 * @returns {{text: string, escaped: boolean}}
 */
export function gridToTsv(grid) {
    let escaped = false;
    const ESC = { '\\': '\\\\', '\t': '\\t', '\n': '\\n', '\r': '\\r' };
    const field = (s) => s.replace(/[\\\t\n\r]/g, (c) => { escaped = true; return ESC[c]; });
    const text = grid.map((r) => r.map(field).join('\t')).join('\n');
    return { text, escaped };
}

/**
 * The A1 address of a 0-based cell: the column letters (`A` … `Z`, `AA` …,
 * up to `XFD` and past it) then the 1-based row.
 * @param {number} rowIdx
 * @param {number} colIdx
 * @returns {string}
 */
export function cellAddress(rowIdx, colIdx) {
    let col = '';
    for (let n = colIdx + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        col = String.fromCharCode(65 + ((n - 1) % 26)) + col;
    }
    return col + (rowIdx + 1);
}

/**
 * The cell count of {@link normalizeGrid}`(rows)` — its kept rows times
 * its kept columns — found from the row lengths, without building it.
 * @param {string[][]} rows
 * @returns {number}
 */
export function paddedSize(rows) {
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

/**
 * The rows never padded: each row's trailing empty cells trimmed, then the
 * trailing empty rows. A NEW array; `rows` is untouched.
 * @param {string[][]} rows
 * @returns {string[][]}
 */
export function unpaddedRows(rows) {
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

/**
 * One `<A1 address>: <text>` line per non-empty cell, in row then column
 * order: the readers' form for a sheet past `opts.cellBudget`.
 * @param {string[][]} rows
 * @returns {string[]}
 */
export function sparseLines(rows) {
    const lines = [];
    unpaddedRows(rows).forEach((row, i) => row.forEach((text, j) => {
        if (text !== '') lines.push(cellAddress(i, j) + ': ' + text);
    }));
    return lines;
}
