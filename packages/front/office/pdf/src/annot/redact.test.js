// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfRedactAnnot } from './redact.js';
import { pdfAnnot } from './annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typeRedactAnnot } = pdfRedactAnnot.factory(_errors, _parserObj, _annot);
const { obj } = _parserObj;
const { ParseError } = _errors;

const QP = obj.array([
    obj.real(0), obj.real(0), obj.real(1), obj.real(0),
    obj.real(1), obj.real(1), obj.real(0), obj.real(1)
]);

describe('typeRedactAnnot', () => {
    test('minimal', () => {
        const d = obj.dict({ Subtype: obj.name('Redact') });
        const a = typeRedactAnnot(d);
        expect(a.subtype).toBe('Redact');
        expect(a.quadPoints).toBeNull();
        expect(a.repeat).toBe(false);
        expect(a.q).toBe(0);
    });

    test('full entries', () => {
        const d = obj.dict({
            Subtype: obj.name('Redact'),
            QuadPoints: QP,
            IC: obj.array([obj.real(0), obj.real(0), obj.real(0)]),
            RO: obj.ref(7, 0),
            OverlayText: obj.string(new Uint8Array([0x52])),
            Repeat: obj.bool(true),
            DA: obj.string(new Uint8Array([0x44])),
            Q: obj.int(2)
        });
        const a = typeRedactAnnot(d);
        expect(a.quadPoints.length).toBe(8);
        expect(a.ic).toEqual([0, 0, 0]);
        expect(a.repeat).toBe(true);
        expect(a.q).toBe(2);
        expect(a.ro.type).toBe('ref');
    });

    test('preserves _extras', () => {
        const d = obj.dict({ Subtype: obj.name('Redact'), Foo: obj.int(1) });
        expect(typeRedactAnnot(d)._extras.Foo.value).toBe(1);
    });

    test('rejects bad QuadPoints', () => {
        const d = obj.dict({ Subtype: obj.name('Redact'), QuadPoints: obj.int(0) });
        expect(() => typeRedactAnnot(d)).toThrow(ParseError);
    });

    test('rejects QuadPoints length not multiple of 8', () => {
        const d = obj.dict({ Subtype: obj.name('Redact'),
            QuadPoints: obj.array([obj.real(0), obj.real(0)]) });
        expect(() => typeRedactAnnot(d)).toThrow(ParseError);
    });

    test('rejects wrong subtype', () => {
        const d = obj.dict({ Subtype: obj.name('Text') });
        expect(() => typeRedactAnnot(d)).toThrow(ParseError);
    });
});

describe('pdfRedactAnnot module', () => {
    test('shape', () => {
        expect(pdfRedactAnnot.name).toBe('pdfRedactAnnot');
        expect(pdfRedactAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfAnnot']);
        expect(pdfRedactAnnot.factory.toString()).toContain('function');
        expect(typeof pdfRedactAnnot.factory(_pdfErrors_TD1, {}, {}).typeRedactAnnot).toBe('function');
    });
});
