// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfTaggedPdfTyped } from './tagged-pdf-typed.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typeStructAttribute } = pdfTaggedPdfTyped.factory(_errors, _parserObj);
function bytes(s) { return new Uint8Array([...s].map(c => c.charCodeAt(0))); }

describe('typeStructAttribute', () => {
    test('Layout — minimal', () => {
        const d = obj.dict({ O: obj.name('Layout') });
        const r = typeStructAttribute(d);
        expect(r.owner).toBe('Layout');
        expect(r._extras).toEqual({});
    });

    test('Layout — all major optional entries', () => {
        const d = obj.dict({
            O: obj.name('Layout'),
            Placement: obj.name('Block'),
            WritingMode: obj.name('LrTb'),
            BackgroundColor: obj.array([obj.real(1), obj.real(1), obj.real(1)]),
            TextAlign: obj.name('Center'),
            SpaceBefore: obj.real(12),
            ColumnCount: obj.int(2)
        });
        const r = typeStructAttribute(d);
        expect(r.placement).toBe('Block');
        expect(r.textAlign).toBe('Center');
        expect(r.spaceBefore).toBe(12);
        expect(r.columnCount).toBe(2);
        expect(r.backgroundColor).toEqual([1, 1, 1]);
    });

    test('List', () => {
        const d = obj.dict({
            O: obj.name('List'),
            ListNumbering: obj.name('Decimal'),
            ContinuedList: obj.bool(true)
        });
        const r = typeStructAttribute(d);
        expect(r.listNumbering).toBe('Decimal');
        expect(r.continuedList).toBe(true);
    });

    test('Table with rowspan/headers', () => {
        const d = obj.dict({
            O: obj.name('Table'),
            RowSpan: obj.int(2), ColSpan: obj.int(3),
            Scope: obj.name('Row'),
            Summary: obj.string(bytes('Quarterly sales'))
        });
        const r = typeStructAttribute(d);
        expect(r.rowSpan).toBe(2);
        expect(r.scope).toBe('Row');
        expect(r.summary).toEqual(bytes('Quarterly sales'));
    });

    test('PrintField checked', () => {
        const d = obj.dict({
            O: obj.name('PrintField'),
            Role: obj.name('cb'),
            checked: obj.name('on')
        });
        const r = typeStructAttribute(d);
        expect(r.role).toBe('cb');
        expect(r.checked).toBe('on');
    });

    test('Artifact', () => {
        const d = obj.dict({
            O: obj.name('Artifact'),
            Type: obj.name('Pagination'),
            Subtype: obj.name('Header'),
            BBox: obj.array([obj.int(0), obj.int(0), obj.int(100), obj.int(50)])
        });
        const r = typeStructAttribute(d);
        expect(r.artifactType).toBe('Pagination');
        expect(r.artifactSubtype).toBe('Header');
        expect(r.bbox).toEqual([0, 0, 100, 50]);
    });

    test('UserProperties', () => {
        const d = obj.dict({
            O: obj.name('UserProperties'),
            P: obj.array([
                obj.dict({
                    N: obj.string(bytes('Status')),
                    V: obj.string(bytes('Final')),
                    H: obj.bool(false)
                })
            ])
        });
        const r = typeStructAttribute(d);
        expect(r.properties.length).toBe(1);
        expect(r.properties[0].hidden).toBe(false);
    });

    test('_extras preservation', () => {
        const d = obj.dict({ O: obj.name('Layout'), Custom: obj.int(1) });
        const r = typeStructAttribute(d);
        expect(r._extras.Custom.value).toBe(1);
    });

    test('vendor owner', () => {
        const d = obj.dict({ O: obj.name('XYZCustom'), Whatever: obj.int(1) });
        const r = typeStructAttribute(d);
        expect(r.owner).toBe('XYZCustom');
        expect(r.vendor).toBe(true);
        expect(r._extras.Whatever).toBeDefined();
    });

    test('rejects non-dict / missing owner / bad UserProperties P', () => {
        expect(() => typeStructAttribute(obj.array([]))).toThrow(ParseError);
        expect(() => typeStructAttribute(obj.dict({}))).toThrow(ParseError);
        expect(() => typeStructAttribute(obj.dict({
            O: obj.name('UserProperties'),
            P: obj.array([obj.int(1)])
        }))).toThrow(ParseError);
    });
});

describe('pdfTaggedPdfTyped factory', () => {
    test('shape', () => {
        expect(pdfTaggedPdfTyped.name).toBe('pdfTaggedPdfTyped');
        expect(pdfTaggedPdfTyped.factory.toString()).toContain('function');
        const api = pdfTaggedPdfTyped.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof api.typeStructAttribute).toBe('function');
    });
});
