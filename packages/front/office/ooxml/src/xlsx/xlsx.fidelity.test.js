// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — the xlsx core writes back what it reads (T63, D32 A): a cell's
 * formula kind, shared index and range (a shared formula's followers and
 * an array formula), and a table's other attributes and its autoFilter's
 * children.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const opc = rt.resolve('opcPackage');
const xlsx = rt.resolve('xlsx');
const tables = rt.resolve('xlsxTables');
const props = rt.resolve('docxProperties');
const enc = new TextEncoder();
const dec = new TextDecoder();

const SHEET = '/xl/worksheets/sheet1.xml';
// A workbook the core writes, its sheet's cells replaced by `cells`.
function withCells(cells) {
    const pkg = opc.read(xlsx.write({ sheets: [{ name: 'S', rows: [[1]] }] }));
    const text = dec.decode(pkg.parts[SHEET]).replace(/<sheetData>.*<\/sheetData>/s, `<sheetData><row r="1">${cells}</row></sheetData>`);
    pkg.parts[SHEET] = enc.encode(text);
    return opc.write(pkg);
}
const fs = (bytes) => [...dec.decode(opc.read(bytes).parts[SHEET]).matchAll(/<f\b[^>]*?(\/>|>[^<]*<\/f>)/g)].map((m) => m[0]);
const saveBack = (bytes) => xlsx.write(xlsx.read(bytes).workbook);

describe('xlsx formulas — written back as read (T63 a)', () => {
    const SHARED = '<c r="A1"><f t="shared" ref="A1:C1" si="0">B2*2</f><v>2</v></c>'
        + '<c r="B1"><f t="shared" si="0"/><v>4</v></c><c r="C1"><f t="shared" si="0"/><v>6</v></c>';
    test('a shared formula\'s master and followers', () => {
        const bytes = withCells(SHARED);
        const cells = xlsx.read(bytes).workbook.sheets[0].rows[0];
        expect(cells[0]).toMatchObject({ formula: 'B2*2', formulaType: 'shared', formulaRef: 'A1:C1', sharedIndex: 0 });
        expect(cells[1]).toMatchObject({ formula: '', formulaType: 'shared', sharedIndex: 0, value: 4 });
        expect(fs(saveBack(bytes))).toEqual(fs(bytes));
    });
    test('an array formula keeps its kind and range', () => {
        const bytes = withCells('<c r="A1"><f t="array" ref="A1:A1">SUM(B1:B2*C1:C2)</f><v>5</v></c>');
        expect(xlsx.read(bytes).workbook.sheets[0].rows[0][0]).toMatchObject({ formulaType: 'array', formulaRef: 'A1:A1' });
        expect(fs(saveBack(bytes))).toEqual(fs(bytes));
    });
    test('a formula\'s other attributes are kept in formulaAttrs', () => {
        const bytes = withCells('<c r="A1"><f ca="1">NOW()</f><v>1</v></c>');
        expect(xlsx.read(bytes).workbook.sheets[0].rows[0][0].formulaAttrs).toEqual({ ca: '1' });
        expect(fs(saveBack(bytes))).toEqual(fs(bytes));
    });
    test('a plain formula and a model without the fields are written as today', () => {
        const bytes = withCells('<c r="A1"><f>1+1</f><v>2</v></c>');
        const cell = xlsx.read(bytes).workbook.sheets[0].rows[0][0];
        expect(cell.formulaType).toBeUndefined();
        expect(fs(saveBack(bytes))).toEqual(['<f>1+1</f>']);
        const built = xlsx.write({ sheets: [{ name: 'S', rows: [[{ type: 'cell', formula: '', value: 3 }]] }] });
        expect(fs(built)).toEqual([]);
    });
});

const T = (attrs, inner) => `<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="T" displayName="T" ref="A1:B3" ${attrs}>${inner}</table>`;
const COLS = '<tableColumns count="2"><tableColumn id="1" name="A" dataDxfId="3"/><tableColumn id="2" name="B" totalsRowDxfId="4"/></tableColumns>';
const noNs = (el) => ({ ...el, attrs: Object.fromEntries(Object.entries(el.attrs || {}).filter(([k]) => !k.startsWith('xmlns'))) });
const backOf = (text) => props.sameElement(noNs(xml.parse(tables.serialize(tables.parse(text)))), noNs(xml.parse(text)));

describe('xlsx tables — written back as read (T63 b)', () => {
    test('the root\'s other attributes, a namespaced one with its declaration', () => {
        const text = T('tableType="queryTable" insertRow="1" headerRowDxfId="2" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="xr" xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/revision" xr:uid="{X}"',
            '<autoFilter ref="A1:B3"/>' + COLS);
        const t = tables.parse(text);
        expect(t.rootAttrs).toMatchObject({ tableType: 'queryTable', insertRow: '1', headerRowDxfId: '2', 'xr:uid': '{X}', 'mc:Ignorable': 'xr' });
        expect(backOf(text)).toBe(true);
        expect(xml.parse(tables.serialize(t)).attrs['xmlns:xr']).toBe('http://schemas.microsoft.com/office/spreadsheetml/2014/revision');
    });
    test('a column\'s other attributes', () => {
        const text = T('', COLS);
        expect(tables.parse(text).columns[0].extraAttrs).toEqual({ dataDxfId: '3' });
        expect(backOf(text)).toBe(true);
    });
    test('an autoFilter\'s children and the table\'s other children, in the schema\'s order', () => {
        const text = T('', '<autoFilter ref="A1:B3"><filterColumn colId="0"><filters><filter val="x"/></filters></filterColumn></autoFilter>'
            + '<sortState ref="A2:B3"><sortCondition ref="A2:A3"/></sortState>' + COLS
            + '<tableStyleInfo name="TableStyleMedium2" showRowStripes="1"/><extLst><ext uri="{U}"><x/></ext></extLst>');
        const t = tables.parse(text);
        expect(t.autoFilter._extras.map((e) => e.name)).toEqual(['filterColumn']);
        expect(t._extras.map((e) => e.name)).toEqual(['sortState', 'extLst']);
        expect(backOf(text)).toBe(true);
    });
    test('an autoFilter\'s other attributes', () => {
        const text = T('xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/revision"', '<autoFilter ref="A1:B3" xr:uid="{F}"/>' + COLS);
        expect(tables.parse(text).autoFilter.extraAttrs).toEqual({ 'xr:uid': '{F}' });
        expect(backOf(text)).toBe(true);
    });
    test('a table the core wrote itself is written back as read', () => {
        const text = tables.serialize({ id: 1, name: 'T', displayName: 'T', ref: 'A1:B2', columns: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] });
        expect(backOf(text)).toBe(true);
    });
});

describe('xlsx row numbers — written back as read (T63 c, D33 A)', () => {
    const rowsOf = (bytes) => [...dec.decode(opc.read(bytes).parts[SHEET]).matchAll(/<row\b[^>]*\br="(\d+)"/g)].map((m) => Number(m[1]));
    const refsOf = (bytes) => [...dec.decode(opc.read(bytes).parts[SHEET]).matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"/g)].map((m) => m[1]);
    function withRows(rows) {
        const pkg = opc.read(xlsx.write({ sheets: [{ name: 'S', rows: [[1]] }] }));
        pkg.parts[SHEET] = enc.encode(dec.decode(pkg.parts[SHEET]).replace(/<sheetData>.*<\/sheetData>/s, `<sheetData>${rows}</sheetData>`));
        return opc.write(pkg);
    }
    const GAPS = '<row r="1"><c r="A1"><v>1</v></c></row><row r="3"><c r="A3"><v>3</v></c></row><row r="7"><c r="A7"><f>A3*2</f><v>6</v></c></row>';
    test('a sheet with row gaps keeps its rows\' numbers, and the write uses them', () => {
        const bytes = withRows(GAPS);
        const sheet = xlsx.read(bytes).workbook.sheets[0];
        expect(sheet.rows).toHaveLength(3);
        expect(sheet.rowNumbers).toEqual([1, 3, 7]);
        const back = saveBack(bytes);
        expect(rowsOf(back)).toEqual([1, 3, 7]);
        expect(refsOf(back)).toEqual(['A1', 'A3', 'A7']);
    });
    test('a gap-free sheet\'s model carries no rowNumbers', () => {
        const sheet = xlsx.read(withRows('<row r="1"><c r="A1"><v>1</v></c></row><row r="2"><c r="A2"><v>2</v></c></row>')).workbook.sheets[0];
        expect(sheet.rowNumbers).toBeUndefined();
    });
    test('without the field, or with a number that does not grow, rows are numbered after the previous one', () => {
        expect(rowsOf(xlsx.write({ sheets: [{ name: 'S', rows: [[1], [2]] }] }))).toEqual([1, 2]);
        expect(rowsOf(xlsx.write({ sheets: [{ name: 'S', rows: [[1], [2], [3]], rowNumbers: [4, 2] }] }))).toEqual([4, 5, 6]);
    });
});
