// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// A58 — spreadsheet sheets as CSV or TSV (`opts.sheets`), both readers and
// the canonical helpers of ./sheet-grid.js they mirror.

import { describe, test, expect } from 'bun:test';
import { oconvIr as oconvIrDescriptor } from '../ir/ir.js';
import { oconvXlsxToIr } from './xlsx-to-ir.js';
import { oconvOdsToIr } from './ods-to-ir.js';
import { cellAddress, gridToCsv, gridToTsv, normalizeGrid, paddedSize, sparseLines, unpaddedRows } from './sheet-grid.js';

const oconvIr = oconvIrDescriptor.factory();
const xlsxStub = { cellRef: (r, c) => `R${r + 1}C${c + 1}` };
const { xlsxToIr } = oconvXlsxToIr.factory(oconvIr, xlsxStub);
const { odsToIr } = oconvOdsToIr.factory(oconvIr, {});

/** An RFC 4180 parser (LF or CRLF records), for the parse-back legs. */
function parseCsv(text) {
    const rows = [[]];
    let field = '', i = 0, quoted = false;
    while (i < text.length) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
            if (c === '"') { quoted = false; i++; continue; }
            field += c; i++; continue;
        }
        if (c === '"') { quoted = true; i++; continue; }
        if (c === ',') { rows[rows.length - 1].push(field); field = ''; i++; continue; }
        if (c === '\n') { rows[rows.length - 1].push(field); field = ''; rows.push([]); i++; continue; }
        field += c; i++;
    }
    rows[rows.length - 1].push(field);
    return rows;
}
const unTsv = (text) => text.split('\n').map((line) => line.split('\t').map((f) =>
    f.replace(/\\(.)/g, (_, ch) => ({ t: '\t', n: '\n', r: '\r', '\\': '\\' })[ch])));

const GRID = [
    ['Species', 'Count, 2024', 'Note'],
    ['Alcedo "atthis"', '12', 'line one\nline two'],
    ['Tab\there', '', 'C:\\data\\birds'],
    ['', '0.5', 'plain']
];

/** The same grid as an xlsx readResult and an ods readResult. */
const xlsxResult = (grid) => ({ workbook: { sheets: [{ name: 'Atlas', rows: grid.map((r) => r.map((v) => (v === '' ? null : { value: v }))) }] } });
const odsResult = (grid, headerRows = 0) => ({ spreadsheet: { tables: [{ name: 'Atlas', headerRows, rows: grid.map((r) => ({ cells: r.map((v) => ({ value: v === '' ? null : v })) })) }] } });

describe('sheet-grid — gridToCsv / gridToTsv (A58)', () => {
    test('csv follows RFC 4180 and parses back to the grid', () => {
        const csv = gridToCsv(GRID);
        expect(csv.split('\n')[0]).toBe('Species,"Count, 2024",Note');
        expect(csv).toContain('"Alcedo ""atthis"""');
        expect(parseCsv(csv)).toEqual(GRID);
    });

    test('tsv escapes backslash, tab, LF and CR, says so, and unescapes back', () => {
        const { text, escaped } = gridToTsv(GRID);
        expect(text.split('\n')).toHaveLength(GRID.length);
        expect(text).toContain('Tab\\there');
        expect(text).toContain('C:\\\\data\\\\birds');
        expect(escaped).toBe(true);
        expect(unTsv(text)).toEqual(GRID);
        expect(gridToTsv([['a', 'b'], ['1', '2']])).toEqual({ text: 'a\tb\n1\t2', escaped: false });
        expect(gridToTsv([['a\rb']]).text).toBe('a\\rb');
    });
});

for (const [label, read] of [['xlsx', (g, o) => xlsxToIr(xlsxResult(g), o)], ['ods', (g, o) => odsToIr(odsResult(g), o)]]) {
    describe(`${label} reader — opts.sheets (A58)`, () => {
        test("'csv' and 'tsv' write each sheet as a code block under its heading", () => {
            const csv = read(GRID, { sheets: 'csv' });
            expect(oconvIr.validate(csv.ir).ok).toBe(true);
            expect(csv.ir.children.map((b) => b.kind)).toEqual(['heading', 'codeBlock']);
            expect(csv.ir.children[1].info).toBe('csv');
            expect(parseCsv(csv.ir.children[1].text)).toEqual(GRID);
            expect(csv.losses.filter((l) => l.code === 'sheet/tsv-escaped')).toEqual([]);
            const tsv = read(GRID, { sheets: 'tsv' });
            expect(tsv.ir.children[1].info).toBe('tsv');
            expect(unTsv(tsv.ir.children[1].text)).toEqual(GRID);
            expect(tsv.losses.filter((l) => l.code === 'sheet/tsv-escaped')).toEqual([{ code: 'sheet/tsv-escaped', detail: 'Atlas' }]);
        });

        test("'table', absent and an empty sheet: as before", () => {
            const before = read(GRID);
            expect(read(GRID, { sheets: 'table' })).toEqual(before);
            expect(before.ir.children[1].kind).toBe('table');
            expect(read([], { sheets: 'csv' }).ir.children.map((b) => b.kind)).toEqual(['heading']);
        });

        test('a bad value throws', () => {
            for (const sheets of ['CSV', 'markdown', 1]) expect(() => read(GRID, { sheets })).toThrow('oconv: bad sheets');
        });

        test('the inline text helpers agree with ./sheet-grid.js (mirror drift)', () => {
            const shapes = [[['a']], [['a', ''], ['', 'b,c']], [['"q"', 'x\ty'], ['\\', '\r\n']], GRID];
            for (const shape of shapes) {
                const grid = normalizeGrid(shape);
                expect(read(shape, { sheets: 'csv' }).ir.children[1].text).toBe(gridToCsv(grid));
                expect(read(shape, { sheets: 'tsv' }).ir.children[1].text).toBe(gridToTsv(grid).text);
            }
        });
    });
}

describe('sheet-grid — the size and sparse helpers (T46, D9)', () => {
    test('paddedSize is the cell count of normalizeGrid', () => {
        const shapes = [[], [[]], [['']], [['a', 'b'], ['', '']], [['', 'x', ''], ['', 'y', ''], ['', '', '']], [['a'], ['', '', 'c'], ['d', '']]];
        for (const shape of shapes) {
            const grid = normalizeGrid(shape);
            expect(paddedSize(shape)).toBe(grid.length ? grid.length * grid[0].length : 0);
        }
    });

    test('unpaddedRows trims each row and the trailing empty rows; sparseLines addresses each value', () => {
        expect(unpaddedRows([['a', '', ''], ['', 'b'], ['', ''], []])).toEqual([['a'], ['', 'b']]);
        expect(sparseLines([['a', '', ''], ['', 'b']])).toEqual(['A1: a', 'B2: b']);
        expect([cellAddress(0, 0), cellAddress(9, 25), cellAddress(0, 26), cellAddress(0, 701), cellAddress(0, 702), cellAddress(1, 16383)])
            .toEqual(['A1', 'Z10', 'AA1', 'ZZ1', 'AAA1', 'XFD2']);
    });
});
