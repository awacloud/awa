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
 *
 * > **Duplication note (deliberate).** Both `oconvXlsxToIr` and
 * > `oconvOdsToIr` carry their own inline copy of `normalizeGrid` because
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
