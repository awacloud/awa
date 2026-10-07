// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as odfFwRequire, modules as odfModules } from '@awacloud/odf';
import { oconvIr as oconvIrDescriptor } from '../ir/ir.js';
import { oconvOdsToIr } from './ods-to-ir.js';
import { normalizeGrid } from './sheet-grid.js';

// Same composition pattern odt-to-ir.test.js uses for `@awacloud/odf`: build the
// real `ods` public runtime for fixture bytes, and build the reader's
// factory directly (`oconvOdsToIr` only needs `ods` as a declared, unused
// dependency — see the file's own "unused-dep guard" note).
const runtime = new ModuleRuntime();
runtime.registerAll([...odfFwRequire, ...odfModules]);
const ods = runtime.resolve('ods');
const xml = runtime.resolve('xml');

const oconvIr = oconvIrDescriptor.factory();
const { odsToIr } = oconvOdsToIr.factory(oconvIr, ods);
const { validate } = oconvIr;

/** Cell texts of an IR `table` node, row-major, `''` for an empty cell. */
function tableTexts(tableNode) {
    return tableNode.children.map((row) =>
        row.children.map((cell) =>
            (cell.children[0] && cell.children[0].children[0].text) || ''));
}

describe('oconvOdsToIr — descriptor', () => {
    test('has the frozen name/dependencies/factory shape', () => {
        expect(oconvOdsToIr.name).toBe('oconvOdsToIr');
        expect(oconvOdsToIr.dependencies).toEqual(['oconvIr', 'ods']);
        expect(typeof oconvOdsToIr.factory).toBe('function');
    });
});

describe('oconvOdsToIr — table -> heading + table mapping (tier 2)', () => {
    let ir;
    let losses;

    const doc = {
        spreadsheet: {
            tables: [{
                type: 'table', name: 'Data', columns: [], headerRows: 1,
                rows: [
                    { type: 'row', cells: [ods.cell('Name'), ods.cell('Score')] },
                    { type: 'row', cells: [ods.cell('Alice'), ods.cell(10)] }
                ]
            }]
        }
    };

    beforeAll(() => {
        const back = ods.read(ods.write(doc));
        ({ ir, losses } = odsToIr(back));
    });

    test('validates against the frozen oconv-ir/v1 schema', () => {
        expect(validate(ir).errors).toEqual([]);
        expect(validate(ir).ok).toBe(true);
    });

    test('emits one level-1 heading with the table name, then one table', () => {
        expect(ir.children[0]).toEqual({
            kind: 'heading', level: 1,
            children: [{
                kind: 'run', text: 'Data',
                bold: false, italic: false, strike: false, code: false, link: null
            }]
        });
        expect(ir.children[1].kind).toBe('table');
    });

    test('maps string and numeric cells to their text form', () => {
        expect(tableTexts(ir.children[1])).toEqual([
            ['Name', 'Score'],
            ['Alice', '10']
        ]);
    });

    test('marks table:table-header-rows as row.header, clamped to grid rows', () => {
        const [headerRow, dataRow] = ir.children[1].children;
        expect(headerRow.header).toBe(true);
        expect(dataRow.header).toBe(false);
    });

    test('records no losses on a plain, unstyled, unmerged table', () => {
        expect(losses).toEqual([]);
    });
});

describe('oconvOdsToIr — formula-as-value', () => {
    test('reduces a formula cell to its cached value and records the loss', () => {
        const doc = {
            spreadsheet: {
                tables: [{
                    type: 'table', name: 'Calc', columns: [],
                    rows: [{
                        type: 'row',
                        cells: [
                            ods.cell(1), ods.cell(2),
                            ods.cell(3, { formula: 'of:=[.A1]+[.B1]' })
                        ]
                    }]
                }]
            }
        };
        const back = ods.read(ods.write(doc));
        const { ir, losses } = odsToIr(back);

        expect(validate(ir).ok).toBe(true);
        expect(tableTexts(ir.children[1])).toEqual([['1', '2', '3']]);
        expect(losses).toEqual([
            { code: 'sheet/formula-as-value', detail: 'Calc!R1C3' }
        ]);
    });
});

describe('oconvOdsToIr — dropped-feature losses', () => {
    test('records sheet/format-dropped once for a table with a styled cell', () => {
        const doc = {
            spreadsheet: {
                tables: [{
                    type: 'table', name: 'Styled', columns: [],
                    rows: [{
                        type: 'row',
                        cells: [ods.cell('x', { styleName: 'Bold' }), ods.cell('y')]
                    }]
                }]
            }
        };
        const back = ods.read(ods.write(doc));
        const { ir, losses } = odsToIr(back);

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([{ code: 'sheet/format-dropped', detail: 'Styled' }]);
    });

    test('records sheet/merge-dropped once for a table with a spanned cell', () => {
        const spanned = ods.cell('A');
        spanned.colSpan = 2;
        const covered = { type: 'cell', covered: true, children: [] };
        const doc = {
            spreadsheet: {
                tables: [{
                    type: 'table', name: 'Merged', columns: [],
                    rows: [
                        { type: 'row', cells: [spanned, covered] },
                        { type: 'row', cells: [ods.cell('1'), ods.cell('2')] }
                    ]
                }]
            }
        };
        const back = ods.read(ods.write(doc));
        const { ir, losses } = odsToIr(back);

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([{ code: 'sheet/merge-dropped', detail: 'Merged' }]);
        // The covered placeholder contributes no text of its own.
        expect(tableTexts(ir.children[1])[0]).toEqual(['A', '']);
    });

    test('records sheet/chart-dropped once for a table carrying a table:shapes extra', () => {
        const shapesEl = xml.el('table:shapes', {}, []);
        const doc = {
            spreadsheet: {
                tables: [{
                    type: 'table', name: 'Charted', columns: [],
                    rows: [{ type: 'row', cells: [ods.cell('x')] }],
                    _extras: { children: [shapesEl] }
                }]
            }
        };
        const back = ods.read(ods.write(doc));
        const { ir, losses } = odsToIr(back);

        expect(validate(ir).ok).toBe(true);
        expect(losses).toEqual([{ code: 'sheet/chart-dropped', detail: 'Charted' }]);
    });
});

describe('oconvOdsToIr — plain-text cell with no office:value-type', () => {
    test('falls back to extracting text from the cell\'s raw paragraph children', () => {
        const rawCell = xml.el('table:table-cell', {}, [
            xml.el('text:p', {}, [xml.text('untyped text')])
        ]);
        const rawRow = xml.el('table:table-row', {}, [rawCell]);
        const rawTable = xml.el('table:table', { 'table:name': 'Raw' }, [rawRow]);
        // Build the readResult directly for this one case: the typed
        // `ods.write()` convenience API always sets a value/valueType for a
        // non-empty cell (see `cell()` in ods.js), so a genuinely untyped
        // cell can only be produced by parsing raw XML directly, mirroring
        // how `odt-to-ir.test.js` hand-builds raw `_extras` elements.
        const tableMod = runtime.resolve('tableTable');
        const parsedTable = tableMod.parseTable(rawTable);
        const readResult = { spreadsheet: { tables: [parsedTable] } };
        const { ir, losses } = odsToIr(readResult);

        expect(validate(ir).ok).toBe(true);
        expect(tableTexts(ir.children[1])).toEqual([['untyped text']]);
        expect(losses).toEqual([]);
    });
});

describe('oconvOdsToIr — empty sheet', () => {
    test('an all-empty table trims to a heading with no table, no losses', () => {
        const doc = {
            spreadsheet: {
                tables: [{
                    type: 'table', name: 'Blank', columns: [],
                    rows: [
                        { type: 'row', cells: [ods.cell(''), ods.cell('')] },
                        { type: 'row', cells: [ods.cell(''), ods.cell('')] }
                    ]
                }]
            }
        };
        const back = ods.read(ods.write(doc));
        const { ir, losses } = odsToIr(back);

        expect(validate(ir).ok).toBe(true);
        expect(ir.children).toHaveLength(1);
        expect(ir.children[0].kind).toBe('heading');
        expect(losses).toEqual([]);
    });

    test('a spreadsheet with zero tables produces a valid empty IR', () => {
        const back = ods.read(ods.write({ spreadsheet: { tables: [] } }));
        const { ir, losses } = odsToIr(back);

        expect(validate(ir).ok).toBe(true);
        expect(ir).toEqual({ kind: 'document', children: [] });
        expect(losses).toEqual([]);
    });
});

describe('oconvOdsToIr — multi-sheet order', () => {
    test('emits sections in document order, one heading+table pair per table', () => {
        const doc = {
            spreadsheet: {
                tables: [
                    { type: 'table', name: 'First', columns: [],
                        rows: [{ type: 'row', cells: [ods.cell('a')] }] },
                    { type: 'table', name: 'Second', columns: [],
                        rows: [{ type: 'row', cells: [ods.cell('b')] }] },
                    { type: 'table', name: 'Third', columns: [],
                        rows: [{ type: 'row', cells: [ods.cell('c')] }] }
                ]
            }
        };
        const back = ods.read(ods.write(doc));
        const { ir } = odsToIr(back);

        expect(validate(ir).ok).toBe(true);
        const names = ir.children
            .filter((n) => n.kind === 'heading')
            .map((h) => h.children[0].text);
        expect(names).toEqual(['First', 'Second', 'Third']);
        expect(ir.children).toHaveLength(6);
    });
});

describe('oconvOdsToIr — repeated rows/columns are expanded before trimming', () => {
    test('a repeated empty column and a repeated empty row both trim away', () => {
        const filler = ods.cell('');
        filler.repeated = 50;
        const doc = {
            spreadsheet: {
                tables: [{
                    type: 'table', name: 'Filled', columns: [],
                    rows: [
                        { type: 'row', cells: [ods.cell('a'), ods.cell('b'), filler] },
                        (() => {
                            const emptyRow = { type: 'row', cells: [ods.cell(''), ods.cell(''), ods.cell('')] };
                            emptyRow.repeated = 20;
                            return emptyRow;
                        })()
                    ]
                }]
            }
        };
        const back = ods.read(ods.write(doc));
        const { ir, losses } = odsToIr(back);

        expect(validate(ir).ok).toBe(true);
        expect(tableTexts(ir.children[1])).toEqual([['a', 'b']]);
        expect(losses).toEqual([]);
    });
});

describe('oconvOdsToIr — sheet-grid mirror drift', () => {
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

            const rows = shape.map((r) => ({
                type: 'row',
                cells: r.map((text) => ods.cell(text))
            }));
            const back = ods.read(ods.write({
                spreadsheet: { tables: [{ type: 'table', name: 'Grid', columns: [], rows }] }
            }));
            const { ir } = odsToIr(back);
            const table = ir.children.find((n) => n.kind === 'table');
            const actual = table ? tableTexts(table) : [];

            expect(actual).toEqual(expected);
        }
    });
});
