// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { modules as ooxmlModules, fw_require as ooxmlFwRequire } from '@awacloud/ooxml';
import { oconvIr } from '../ir/ir.js';
import { oconvXlsxToIr } from './xlsx-to-ir.js';
import { normalizeGrid, paddedSize, sparseLines } from './sheet-grid.js';

// Same pattern as docx-to-ir.test.js (W1 precedent): hand-register the
// needed descriptors on a local `ModuleRuntime` rather than going through
// a package composition root (task 06's concern).
let xlsxApi;
let xlsxToIr;
let validate;

beforeAll(() => {
    const runtime = new ModuleRuntime();
    runtime.registerAll(ooxmlFwRequire);
    runtime.registerAll(ooxmlModules);
    runtime.register(oconvIr);
    runtime.register(oconvXlsxToIr);

    xlsxApi = runtime.resolve('xlsx');
    ({ xlsxToIr } = runtime.resolve('oconvXlsxToIr'));
    ({ validate } = runtime.resolve('oconvIr'));
});

/** Cell texts of an IR `table` node, row-major, `''` for an empty cell. */
function tableTexts(tableNode) {
    return tableNode.children.map((row) =>
        row.children.map((cell) =>
            (cell.children[0] && cell.children[0].children[0].text) || ''));
}

describe('oconvXlsxToIr — descriptor', () => {
    test('is a fw module descriptor with the prescribed dependencies', () => {
        expect(oconvXlsxToIr.name).toBe('oconvXlsxToIr');
        expect(oconvXlsxToIr.dependencies).toEqual(['oconvIr', 'xlsx']);
        expect(typeof oconvXlsxToIr.factory).toBe('function');
    });
});

describe('oconvXlsxToIr — sheet -> heading + table mapping (tier 2)', () => {
    let ir;
    let losses;

    beforeAll(() => {
        const workbook = {
            sheets: [
                {
                    name: 'Data',
                    rows: [
                        ['A1', 'B1', 'C1'],
                        [1, 2, 3]
                    ]
                }
            ]
        };
        const bytes = xlsxApi.write(workbook);
        const readResult = xlsxApi.read(bytes);
        ({ ir, losses } = xlsxToIr(readResult));
    });

    test('validates against the oconv-ir/v2 schema', () => {
        expect(validate(ir).errors).toEqual([]);
        expect(validate(ir).ok).toBe(true);
    });

    test('emits one level-1 heading with the sheet name, then one table', () => {
        expect(ir.children[0]).toEqual({
            kind: 'heading', level: 1, align: null, breakBefore: false,
            children: [{
                kind: 'run', text: 'Data',
                bold: false, italic: false, strike: false, code: false, link: null, size: null, font: null, color: null, underline: false, script: null
            }]
        });
        expect(ir.children[1].kind).toBe('table');
    });

    test('maps string and numeric cells to their text form, no row ever marked header', () => {
        const table = ir.children[1];
        expect(tableTexts(table)).toEqual([
            ['A1', 'B1', 'C1'],
            ['1', '2', '3']
        ]);
        for (const row of table.children) expect(row.header).toBe(false);
    });

    test('records no losses on a plain, unstyled, unmerged sheet', () => {
        expect(losses).toEqual([]);
    });
});

describe('oconvXlsxToIr — formula-as-value', () => {
    test('reduces a formula cell to its cached value and records the loss', () => {
        const workbook = {
            sheets: [{
                name: 'Calc',
                rows: [[
                    1, 2,
                    { type: 'cell', value: 3, formula: 'SUM(A1:B1)' }
                ]]
            }]
        };
        const bytes = xlsxApi.write(workbook);
        const { ir, losses } = xlsxToIr(xlsxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        const table = ir.children[1];
        expect(tableTexts(table)).toEqual([['1', '2', '3']]);
        expect(losses).toEqual([
            { code: 'sheet/formula-as-value', detail: 'Calc!C1' }
        ]);
    });

    test('an empty (uncached) formula value stringifies to an empty cell', () => {
        const workbook = {
            sheets: [{
                name: 'Calc',
                rows: [[{ type: 'cell', value: null, formula: 'NOW()', t: 'n' }]]
            }]
        };
        const bytes = xlsxApi.write(workbook);
        const { ir, losses } = xlsxToIr(xlsxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        // A single-cell sheet whose only cell is empty text trims away to no table.
        expect(ir.children).toHaveLength(1);
        expect(losses).toEqual([
            { code: 'sheet/formula-as-value', detail: 'Calc!A1' }
        ]);
    });
});

describe('oconvXlsxToIr — dropped-feature losses', () => {
    test('records sheet/format-dropped once for a styled sheet', () => {
        const workbook = {
            sheets: [{ name: 'Styled', rows: [[{ type: 'cell', value: 'x', t: 's', s: 0 }, 'y']] }]
        };
        const bytes = xlsxApi.write(workbook);
        const { ir, losses } = xlsxToIr(xlsxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([{ code: 'sheet/format-dropped', detail: 'Styled' }]);
    });

    test('records sheet/merge-dropped once for a sheet with a merged range', () => {
        const workbook = {
            sheets: [{
                name: 'Merged',
                rows: [['A', '', 'C'], ['1', '2', '3']],
                merges: ['A1:B1']
            }]
        };
        const bytes = xlsxApi.write(workbook);
        const { ir, losses } = xlsxToIr(xlsxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([{ code: 'sheet/merge-dropped', detail: 'Merged' }]);
    });

    test('records sheet/chart-dropped once for a sheet carrying a chart drawing', () => {
        const workbook = {
            sheets: [{
                name: 'Charted',
                rows: [['A', 'B']],
                drawings: [{
                    anchor: {
                        kind: 'twoCell',
                        from: { col: 0, row: 0, colOff: 0, rowOff: 0 },
                        to: { col: 5, row: 10, colOff: 0, rowOff: 0 }
                    },
                    cx: 100, cy: 100,
                    chart: {
                        plotType: 'bar', barDirection: 'col',
                        grouping: 'clustered', varyColors: false, series: []
                    }
                }]
            }]
        };
        const bytes = xlsxApi.write(workbook);
        const { ir, losses } = xlsxToIr(xlsxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([{ code: 'sheet/chart-dropped', detail: 'Charted' }]);
    });
});

describe('oconvXlsxToIr — empty sheet', () => {
    test('an all-empty sheet trims to a heading with no table, no losses', () => {
        const workbook = { sheets: [{ name: 'Blank', rows: [['', '', ''], ['', '', '']] }] };
        const bytes = xlsxApi.write(workbook);
        const { ir, losses } = xlsxToIr(xlsxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(ir.children).toHaveLength(1);
        expect(ir.children[0].kind).toBe('heading');
        expect(losses).toEqual([]);
    });

    test('a workbook with zero sheets produces a valid empty IR', () => {
        const bytes = xlsxApi.write({ sheets: [] });
        const { ir, losses } = xlsxToIr(xlsxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        expect(ir).toEqual({ kind: 'document', page: null, header: null, footer: null, children: [] });
        expect(losses).toEqual([]);
    });
});

describe('oconvXlsxToIr — multi-sheet order', () => {
    test('emits sections in workbook order, one heading+table pair per sheet', () => {
        const workbook = {
            sheets: [
                { name: 'First', rows: [['a']] },
                { name: 'Second', rows: [['b']] },
                { name: 'Third', rows: [['c']] }
            ]
        };
        const bytes = xlsxApi.write(workbook);
        const { ir } = xlsxToIr(xlsxApi.read(bytes));

        expect(validate(ir).ok).toBe(true);
        const names = ir.children
            .filter((n) => n.kind === 'heading')
            .map((h) => h.children[0].text);
        expect(names).toEqual(['First', 'Second', 'Third']);
        expect(ir.children).toHaveLength(6);
    });
});

describe('oconvXlsxToIr — sheet-grid mirror drift', () => {
    test('the factory-internal grid trim agrees with ./sheet-grid.js across several shapes', () => {
        const shapes = [
            [],
            [[]],
            [['']],
            [['a', 'b'], ['', '']],
            [['', ''], ['a', 'b']],
            [['a', '', 'c'], ['', '', '']],
            [['a'], ['b', 'c'], ['']],
            [['', 'x', ''], ['', 'y', ''], ['', '', '']]
        ];
        for (const shape of shapes) {
            const expected = normalizeGrid(shape);

            // Feed the exact same raw grid through the reader (as a
            // hand-built readResult — no byte round-trip needed for a
            // pure-structure test) and read the resulting IR table back
            // into a string[][] the same shape normalizeGrid() returns.
            const rows = shape.map((r) => r.map((text) => (text
                ? { type: 'cell', value: text, t: 's' }
                : { type: 'cell', value: null, t: 'n' })));
            const { ir } = xlsxToIr({ workbook: { sheets: [{ name: 'Grid', rows }] } });
            const table = ir.children.find((n) => n.kind === 'table');
            const actual = table ? tableTexts(table) : [];

            expect(actual).toEqual(expected);
        }
    });
});

describe('oconvXlsxToIr — cellBudget: a sheet past the budget is not padded (T46, D9)', () => {
    const str = (value) => ({ type: 'cell', value, t: 's' });
    /** Three rows; the second holds a value in column A and in column XFD (16,384). */
    function wideWorkbook() {
        const wide = Array.from({ length: 16384 }, (_, c) => (c === 0 ? str('x') : c === 16383 ? str('y') : null));
        return { workbook: { sheets: [{ name: 'Wide', rows: [[str('a'), str('b')], wide, [str('c')]] }] } };
    }
    const count = (n) => 1 + (n.children || []).reduce((s, c) => s + count(c), 0);

    test('past the budget: one paragraph per value with its address, no table, the loss', () => {
        const { ir, losses } = xlsxToIr(wideWorkbook(), { cellBudget: 1000 });
        expect(validate(ir).ok).toBe(true);
        expect(ir.children.some((n) => n.kind === 'table')).toBe(false);
        const lines = ir.children.filter((n) => n.kind === 'paragraph').map((p) => p.children[0].text);
        expect(lines).toEqual(['A1: a', 'B1: b', 'A2: x', 'XFD2: y', 'A3: c']);
        expect(losses).toEqual([{ code: 'sheet/sparse-form', detail: 'Wide: 49152 padded cells, 5 kept' }]);
        expect(count(ir)).toBeLessThan(30);
    });

    test('under csv the rows are written unpadded', () => {
        const { ir, losses } = xlsxToIr(wideWorkbook(), { cellBudget: 1000, sheets: 'csv' });
        const block = ir.children.find((n) => n.kind === 'codeBlock');
        expect(block.text).toBe('a,b\nx' + ','.repeat(16383) + 'y\nc');
        expect(losses.map((l) => l.code)).toEqual(['sheet/sparse-form']);
    });

    test('within the budget, or without one, the padded table as before', () => {
        for (const opts of [undefined, { cellBudget: 49152 }]) {
            const { ir, losses } = xlsxToIr(wideWorkbook(), opts);
            const table = ir.children.find((n) => n.kind === 'table');
            expect(table.children.map((r) => r.children.length)).toEqual([16384, 16384, 16384]);
            expect(losses).toEqual([]);
        }
    });

    test('a bad budget is refused', () => {
        for (const cellBudget of [0, -1, 1.5, '10', null]) {
            expect(() => xlsxToIr(wideWorkbook(), { cellBudget })).toThrow('oconv: bad cell budget');
        }
    });

    test('the factory-internal size and sparse lines agree with ./sheet-grid.js', () => {
        const shapes = [[['a']], [['a', 'b'], ['', '']], [['', 'x', ''], ['', 'y', ''], ['', '', '']], [['a'], ['', '', 'c'], ['d', '']]];
        for (const shape of shapes) {
            const rows = shape.map((r) => r.map((text) => (text ? str(text) : { type: 'cell', value: null, t: 'n' })));
            const size = paddedSize(shape);
            const sheet = (budget) => xlsxToIr({ workbook: { sheets: [{ name: 'G', rows }] } }, { cellBudget: budget });
            expect(sheet(size).ir.children.some((n) => n.kind === 'table')).toBe(true);
            if (size > 1) {
                const lines = sheet(size - 1).ir.children.filter((n) => n.kind === 'paragraph').map((p) => p.children[0].text);
                expect(lines).toEqual(sparseLines(shape));
            }
        }
    });
});

describe('oconvXlsxToIr — a 5,000,000 cell budget by default (T30 (d), D46)', () => {
    const str = (value) => ({ type: 'cell', value, t: 's' });
    /** 400 rows × 16,384 columns padded (6,553,600 cells): a value in A1 and in XFD400. */
    function pastDefault() {
        const last = new Array(16384).fill(null);
        last[16383] = str('z');
        const rows = [[str('a')], ...Array.from({ length: 398 }, () => []), last];
        return { workbook: { sheets: [{ name: 'Wide', rows }] } };
    }

    test('with no option, a sheet past 5 M padded cells takes the sparse form', () => {
        const { ir, losses } = xlsxToIr(pastDefault());
        expect(ir.children.some((n) => n.kind === 'table')).toBe(false);
        const lines = ir.children.filter((n) => n.kind === 'paragraph').map((p) => p.children[0].text);
        expect(lines).toEqual(['A1: a', 'XFD400: z']);
        expect(losses).toEqual([{ code: 'sheet/sparse-form', detail: 'Wide: 6553600 padded cells, 2 kept' }]);
    });

    test('Number.MAX_SAFE_INTEGER, the way back to 1.x, is a budget like any other', () => {
        // Padding the 6.5 M cells for real costs over 1 GB (a probe in the
        // T30 (d) record); a small sheet shows the value is accepted.
        const { ir, losses } = xlsxToIr({ workbook: { sheets: [{ name: 'G', rows: [[str('a'), str('b')]] }] } },
            { cellBudget: Number.MAX_SAFE_INTEGER });
        expect(tableTexts(ir.children.find((n) => n.kind === 'table'))).toEqual([['a', 'b']]);
        expect(losses).toEqual([]);
    });
});
