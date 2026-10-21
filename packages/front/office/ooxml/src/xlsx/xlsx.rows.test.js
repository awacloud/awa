// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Worksheet rows and columns beyond their cells, and malformed worksheet
 * XML.
 *
 * - `<row>` attributes `ht`, `customHeight` and `hidden` reach the model as
 *   `sheet.rowProps` (keyed by the row's index in `sheet.rows`, with its
 *   1-based row number `r`) and are written back.
 * - `xsd:boolean` attributes accept `true` as well as `1` (`hidden` on
 *   `<col>` and `<row>`, `customHeight`, `bestFit`).
 * - Malformed worksheet XML throws a typed `ParseError`
 *   `xlsx/invalid-sheet-xml` (like the workbook part), not the raw fw XML
 *   parser error.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const x = runtime.resolve('xlsx');
const opc = runtime.resolve('opcPackage');
const { ParseError } = runtime.resolve('ooxmlErrors');
const decoder = new TextDecoder();

const SS_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

/** A one-sheet workbook whose worksheet part is `inner` (raw XML). */
function withSheetXml(inner) {
    const pkg = opc.read(x.write({ sheets: [{ name: 'S', rows: [[1]] }] }));
    const sheetPart = Object.keys(pkg.parts).find(p => p.startsWith('/xl/worksheets/'));
    pkg.parts[sheetPart] = new TextEncoder().encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${SS_NS}">${inner}</worksheet>`);
    return opc.write(pkg);
}

function sheetXmlOf(bytes) {
    const pkg = opc.read(bytes);
    const part = Object.keys(pkg.parts).find(p => p.startsWith('/xl/worksheets/'));
    return decoder.decode(pkg.parts[part]);
}

const ROWS = '<sheetData>'
    + '<row r="1" ht="30" customHeight="1"><c r="A1"><v>1</v></c></row>'
    + '<row r="2"><c r="A2"><v>2</v></c></row>'
    + '<row r="3" hidden="1"><c r="A3"><v>3</v></c></row>'
    + '<row r="4" hidden="true" ht="12.75" customHeight="true"/>'
    + '</sheetData>';

describe('xlsx rows — height and hidden', () => {
    test('row attributes reach sheet.rowProps, keyed by index with the row number', () => {
        const sheet = x.read(withSheetXml(ROWS)).workbook.sheets[0];
        expect(sheet.rows).toHaveLength(4);
        expect(sheet.rowProps).toEqual({
            0: { r: 1, height: 30, customHeight: true },
            2: { r: 3, hidden: true },
            3: { r: 4, height: 12.75, customHeight: true, hidden: true },
        });
    });

    test('a sheet without row attributes has no rowProps', () => {
        const sheet = x.read(x.write({ sheets: [{ name: 'S', rows: [[1], [2]] }] })).workbook.sheets[0];
        expect(sheet.rowProps).toBeUndefined();
    });

    test('rowProps are written back and read again unchanged', () => {
        const first = x.read(withSheetXml(ROWS)).workbook;
        const text = sheetXmlOf(x.write(first));
        expect(text).toContain('<row r="1" ht="30" customHeight="1">');
        expect(text).toContain('<row r="3" hidden="1">');
        const again = x.read(x.write(first)).workbook.sheets[0];
        expect(again.rowProps).toEqual(first.sheets[0].rowProps);
    });

    test('a model built by hand: height without customHeight, hidden row', () => {
        const bytes = x.write({ sheets: [{ name: 'S', rows: [['a'], ['b']],
            rowProps: { 1: { height: 24, hidden: true } } }] });
        expect(sheetXmlOf(bytes)).toContain('<row r="2" ht="24" hidden="1">');
    });
});

describe('xlsx columns — xsd:boolean attributes', () => {
    test('hidden="true" and bestFit="true" read as true', () => {
        const sheet = x.read(withSheetXml(
            '<cols><col min="1" max="1" width="9" hidden="true" bestFit="true"/>'
            + '<col min="2" max="2" width="9" hidden="0"/></cols>'
            + '<sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>')).workbook.sheets[0];
        expect(sheet.cols[0].hidden).toBe(true);
        expect(sheet.cols[0].bestFit).toBe(true);
        expect(sheet.cols[1].hidden).toBeUndefined();
    });
});

describe('xlsx — malformed worksheet XML', () => {
    test('throws ParseError xlsx/invalid-sheet-xml naming the part, with the parser error as cause', () => {
        const err = thrown(() => x.read(withSheetXml('<sheetData><row r="1"><c r="A1"></nope></row></sheetData>')));
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code).toBe('xlsx/invalid-sheet-xml');
        expect(err.context.partName).toMatch(/^\/xl\/worksheets\/sheet\d+\.xml$/);
        expect(err.cause).toBeDefined();
        expect(err.cause.code).not.toBe('xlsx/invalid-sheet-xml');
    });
});
