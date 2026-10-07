// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfShapeAnnot } from './square.js';
import { pdfAnnot } from './annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typeShapeAnnot } = pdfShapeAnnot.factory(_errors, _parserObj, _annot);
const { obj } = _parserObj;
const { ParseError } = _errors;

describe('typeShapeAnnot', () => {
    test('Square minimal', () => {
        const d = obj.dict({ Subtype: obj.name('Square') });
        const a = typeShapeAnnot(d, 'Square');
        expect(a.subtype).toBe('Square');
        expect(a.ic).toBeNull();
        expect(a.rd).toBeNull();
    });

    test('Circle with /RD and /IC', () => {
        const d = obj.dict({
            Subtype: obj.name('Circle'),
            RD: obj.array([obj.int(1), obj.int(2), obj.int(3), obj.int(4)]),
            IC: obj.array([obj.real(0.5), obj.real(0.5), obj.real(0.5)])
        });
        const a = typeShapeAnnot(d, 'Circle');
        expect(a.rd).toEqual([1, 2, 3, 4]);
        expect(a.ic).toEqual([0.5, 0.5, 0.5]);
    });

    test('Line with all entries', () => {
        const d = obj.dict({
            Subtype: obj.name('Line'),
            L: obj.array([obj.real(0), obj.real(0), obj.real(10), obj.real(10)]),
            LE: obj.array([obj.name('OpenArrow'), obj.name('ClosedArrow')]),
            LL: obj.real(5),
            LLE: obj.real(1),
            Cap: obj.bool(true),
            CP: obj.name('Inline'),
            IT: obj.name('LineDimension'),
            Measure: obj.dict({ Type: obj.name('Measure') })
        });
        const a = typeShapeAnnot(d, 'Line');
        expect(a.l).toEqual([0, 0, 10, 10]);
        expect(a.le).toEqual(['OpenArrow', 'ClosedArrow']);
        expect(a.ll).toBe(5);
        expect(a.cap).toBe(true);
        expect(a.cp).toBe('Inline');
        expect(a.it).toBe('LineDimension');
        expect(a.measure.type).toBe('dict');
    });

    test('Polygon with /Vertices', () => {
        const d = obj.dict({
            Subtype: obj.name('Polygon'),
            Vertices: obj.array([obj.real(0), obj.real(0),
                obj.real(10), obj.real(0), obj.real(5), obj.real(10)]),
            IT: obj.name('PolygonCloud')
        });
        const a = typeShapeAnnot(d, 'Polygon');
        expect(a.vertices.length).toBe(6);
        expect(a.it).toBe('PolygonCloud');
    });

    test('PolyLine with LE', () => {
        const d = obj.dict({
            Subtype: obj.name('PolyLine'),
            Vertices: obj.array([obj.real(0), obj.real(0)]),
            LE: obj.array([obj.name('None'), obj.name('None')])
        });
        const a = typeShapeAnnot(d, 'PolyLine');
        expect(a.le).toEqual(['None', 'None']);
    });

    test('preserves _extras', () => {
        const d = obj.dict({ Subtype: obj.name('Square'), Foo: obj.int(1) });
        expect(typeShapeAnnot(d, 'Square')._extras.Foo.value).toBe(1);
    });

    test('rejects non-array L', () => {
        const d = obj.dict({ Subtype: obj.name('Line'), L: obj.int(0) });
        expect(() => typeShapeAnnot(d, 'Line')).toThrow(ParseError);
    });

    test('rejects bad LE entry', () => {
        const d = obj.dict({ Subtype: obj.name('Line'),
            LE: obj.array([obj.int(0)]) });
        expect(() => typeShapeAnnot(d, 'Line')).toThrow(ParseError);
    });

    test('rejects mismatched subtype', () => {
        const d = obj.dict({ Subtype: obj.name('Square') });
        expect(() => typeShapeAnnot(d, 'Line')).toThrow(ParseError);
    });

    test('rejects unsupported expected', () => {
        const d = obj.dict({ Subtype: obj.name('Square') });
        expect(() => typeShapeAnnot(d, 'Bogus')).toThrow(ParseError);
    });

    test('rejects non-dict', () => {
        expect(() => typeShapeAnnot(obj.array([]), 'Square')).toThrow(ParseError);
    });
});

describe('pdfShapeAnnot module', () => {
    test('shape', () => {
        expect(pdfShapeAnnot.name).toBe('pdfShapeAnnot');
        expect(pdfShapeAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfAnnot']);
        expect(pdfShapeAnnot.factory.toString()).toContain('function');
        expect(typeof pdfShapeAnnot.factory(_pdfErrors_TD1, {}, {}).typeShapeAnnot).toBe('function');
    });
});
