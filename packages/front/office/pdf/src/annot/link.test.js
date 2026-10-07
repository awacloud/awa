// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfLinkAnnot } from './link.js';
import { pdfAnnot } from './annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typeLinkAnnot } = pdfLinkAnnot.factory(_errors, _parserObj, _annot);
const { obj } = _parserObj;
const { ParseError } = _errors;

describe('typeLinkAnnot', () => {
    test('minimal', () => {
        const d = obj.dict({ Subtype: obj.name('Link') });
        const a = typeLinkAnnot(d);
        expect(a.subtype).toBe('Link');
        expect(a.dest).toBeNull();
        expect(a.action).toBeNull();
    });

    test('all optional entries', () => {
        const d = obj.dict({
            Subtype: obj.name('Link'),
            Dest: obj.array([obj.ref(3, 0), obj.name('Fit')]),
            A: obj.dict({ S: obj.name('URI') }),
            H: obj.name('I'),
            PA: obj.dict({ S: obj.name('URI') }),
            QuadPoints: obj.array([obj.real(0), obj.real(0),
                obj.real(1), obj.real(0), obj.real(1), obj.real(1),
                obj.real(0), obj.real(1)])
        });
        const a = typeLinkAnnot(d);
        expect(a.dest).toBeDefined();
        expect(a.action.type).toBe('dict');
        expect(a.h).toBe('I');
        expect(a.pa.type).toBe('dict');
        expect(a.quadPoints.length).toBe(8);
    });

    test('preserves _extras', () => {
        const d = obj.dict({ Subtype: obj.name('Link'), Foo: obj.int(1) });
        expect(typeLinkAnnot(d)._extras.Foo.value).toBe(1);
    });

    test('rejects non-array QuadPoints', () => {
        const d = obj.dict({ Subtype: obj.name('Link'), QuadPoints: obj.int(0) });
        expect(() => typeLinkAnnot(d)).toThrow(ParseError);
    });

    test('rejects non-numeric QuadPoints entry', () => {
        const d = obj.dict({ Subtype: obj.name('Link'),
            QuadPoints: obj.array([obj.name('X')]) });
        expect(() => typeLinkAnnot(d)).toThrow(ParseError);
    });

    test('rejects wrong subtype', () => {
        const d = obj.dict({ Subtype: obj.name('Text') });
        expect(() => typeLinkAnnot(d)).toThrow(ParseError);
    });
});

describe('pdfLinkAnnot module', () => {
    test('shape', () => {
        expect(pdfLinkAnnot.name).toBe('pdfLinkAnnot');
        expect(pdfLinkAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfAnnot']);
        expect(pdfLinkAnnot.factory.toString()).toContain('function');
        expect(typeof pdfLinkAnnot.factory(_pdfErrors_TD1, {}, {}).typeLinkAnnot).toBe('function');
    });
});
