// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { modules as ooxmlModules, fw_require as ooxmlFwRequire } from '@awacloud/ooxml';
import { oconvIr } from '../ir/ir.js';
import { oconvXlsxToIr } from './xlsx-to-ir.js';
import { normalizeGrid } from './sheet-grid.js';

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

    test('validates against the frozen oconv-ir/v1 schema', () => {
        expect(validate(ir).errors).toEqual([]);
        expect(validate(ir).ok).toBe(true);
    });

    test('emits one level-1 heading with the sheet name, then one table', () => {
        expect(ir.children[0]).toEqual({
            kind: 'heading', level: 1,
            children: [{
                kind: 'run', text: 'Data',
                bold: false, italic: false, strike: false, code: false, link: null
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
        expect(ir).toEqual({ kind: 'document', children: [] });
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
