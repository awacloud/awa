// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdf3dRichMedia } from './3d-richmedia.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const {
    type3DAnnot, type3DActivation, typeRichMediaAnnot, typeRichMediaContent,
    classifyRmInstanceState, RM_INSTANCE_STATES, ACTIVATION_CONDITIONS
} = pdf3dRichMedia.factory(_errors, _parserObj);
describe('type3DAnnot', () => {
    test('minimal annotation', () => {
        const r = type3DAnnot(obj.dict({
            Subtype: obj.name('3D'),
            '3DD': obj.ref(5, 0)
        }));
        expect(r.threeDD.type).toBe('ref');
    });
    test('with activation dict', () => {
        const r = type3DAnnot(obj.dict({
            '3DD': obj.ref(5, 0),
            '3DA': obj.dict({ A: obj.name('PO'), D: obj.name('PV') }),
            '3DI': obj.bool(true)
        }));
        expect(r.threeDA.a).toBe('PO');
        expect(r.threeDI).toBe(true);
    });
    test('preserves _extras', () => {
        const r = type3DAnnot(obj.dict({
            '3DD': obj.ref(5, 0), Foo: obj.int(1)
        }));
        expect(r._extras.Foo.value).toBe(1);
    });
    test('rejects non-dict', () => {
        expect(() => type3DAnnot(obj.int(1))).toThrow(ParseError);
    });
    test('rejects missing /3DD', () => {
        expect(() => type3DAnnot(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects bad subtype', () => {
        expect(() => type3DAnnot(obj.dict({
            Subtype: obj.name('Movie'), '3DD': obj.ref(1, 0)
        }))).toThrow(ParseError);
    });
});

describe('type3DActivation', () => {
    test('reads names', () => {
        const r = type3DActivation(obj.dict({ A: obj.name('PO') }));
        expect(r.a).toBe('PO');
    });
    test('rejects non-dict', () => {
        expect(() => type3DActivation(obj.int(1))).toThrow(ParseError);
    });
});

describe('typeRichMediaAnnot', () => {
    test('minimal annotation', () => {
        const r = typeRichMediaAnnot(obj.dict({
            Subtype: obj.name('RichMedia'),
            RichMediaContent: obj.dict({})
        }));
        expect(r.content).toBeDefined();
    });
    test('preserves _extras', () => {
        const r = typeRichMediaAnnot(obj.dict({
            RichMediaContent: obj.dict({}), Foo: obj.int(7)
        }));
        expect(r._extras.Foo.value).toBe(7);
    });
    test('rejects non-dict', () => {
        expect(() => typeRichMediaAnnot(obj.int(1))).toThrow(ParseError);
    });
    test('rejects missing content', () => {
        expect(() => typeRichMediaAnnot(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects bad subtype', () => {
        expect(() => typeRichMediaAnnot(obj.dict({
            Subtype: obj.name('3D'), RichMediaContent: obj.dict({})
        }))).toThrow(ParseError);
    });
});

describe('typeRichMediaContent', () => {
    test('reads entries', () => {
        const r = typeRichMediaContent(obj.dict({
            Assets: obj.dict({}), Configurations: obj.array([])
        }));
        expect(r.assets).toBeDefined();
        expect(r.configurations).toBeDefined();
    });
    test('rejects non-dict', () => {
        expect(() => typeRichMediaContent(obj.int(1))).toThrow(ParseError);
    });
});

describe('classifyRmInstanceState', () => {
    test('maps known codes', () => {
        expect(classifyRmInstanceState('A')).toBe('active');
        expect(classifyRmInstanceState('L')).toBe('loaded');
    });
    test('null on unknown', () => {
        expect(classifyRmInstanceState('X')).toBe(null);
    });
    test('null on null', () => {
        expect(classifyRmInstanceState(null)).toBe(null);
    });
    test('rejects non-string', () => {
        expect(() => classifyRmInstanceState(1)).toThrow(ParseError);
    });
});

describe('catalogs', () => {
    test('frozen', () => {
        expect(Object.isFrozen(RM_INSTANCE_STATES)).toBe(true);
        expect(Object.isFrozen(ACTIVATION_CONDITIONS)).toBe(true);
    });
});

describe('pdf3dRichMedia module', () => {
    test('module shape + worker safety', () => {
        expect(pdf3dRichMedia.name).toBe('pdf3dRichMedia');
        expect(pdf3dRichMedia.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdf3dRichMedia.factory.toString()).toContain('function');
        const m = pdf3dRichMedia.factory(_pdfErrors_TD1, {});
        expect(typeof m.type3DAnnot).toBe('function');
        expect(typeof m.typeRichMediaAnnot).toBe('function');
        expect(typeof m.classifyRmInstanceState).toBe('function');
    });
});
