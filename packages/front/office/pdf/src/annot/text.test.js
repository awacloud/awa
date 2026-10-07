// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfTextAnnot } from './text.js';
import { pdfAnnot } from './annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typeTextAnnot } = pdfTextAnnot.factory(_errors, _parserObj, _annot);
const { obj } = _parserObj;
const { ParseError } = _errors;

describe('typeTextAnnot', () => {
    test('minimal', () => {
        const d = obj.dict({ Subtype: obj.name('Text') });
        const a = typeTextAnnot(d);
        expect(a.subtype).toBe('Text');
        expect(a.open).toBe(false);
        expect(a.iconName).toBeNull();
        expect(a.raw).toBe(d);
    });

    test('all optional entries', () => {
        const d = obj.dict({
            Subtype: obj.name('Text'),
            Open: obj.bool(true),
            Name: obj.name('Comment'),
            State: obj.string(new Uint8Array([0x4d])),
            StateModel: obj.string(new Uint8Array([0x4d]))
        });
        const a = typeTextAnnot(d);
        expect(a.open).toBe(true);
        expect(a.iconName).toBe('Comment');
        expect(a.state).toBeDefined();
        expect(a.stateModel).toBeDefined();
    });

    test('preserves unknown entries in _extras', () => {
        const d = obj.dict({ Subtype: obj.name('Text'), Mystery: obj.int(7) });
        expect(typeTextAnnot(d)._extras.Mystery.value).toBe(7);
    });

    test('rejects non-dict', () => {
        expect(() => typeTextAnnot(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong subtype', () => {
        const d = obj.dict({ Subtype: obj.name('Link') });
        expect(() => typeTextAnnot(d)).toThrow(ParseError);
    });
});

describe('pdfTextAnnot module', () => {
    test('shape', () => {
        expect(pdfTextAnnot.name).toBe('pdfTextAnnot');
        expect(pdfTextAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfAnnot']);
        expect(pdfTextAnnot.factory.toString()).toContain('function');
        expect(typeof pdfTextAnnot.factory(_pdfErrors_TD1, {}, {}).typeTextAnnot).toBe('function');
    });
});
