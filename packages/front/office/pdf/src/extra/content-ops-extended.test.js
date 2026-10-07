// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfContentOpsExtended } from './content-ops-extended.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typeExtGState, decodeType3CharOp, EXT_GSTATE_KEYS } =
    pdfContentOpsExtended.factory(_errors, _parserObj);
describe('typeExtGState', () => {
    test('minimal dict', () => {
        const d = obj.dict({ Type: obj.name('ExtGState') });
        const g = typeExtGState(d);
        expect(g.type).toBe('ExtGState');
        expect(g.raw).toBe(d);
        expect(g._extras).toEqual({});
    });

    test('reads all major optional entries', () => {
        const d = obj.dict({
            Type: obj.name('ExtGState'),
            LW: obj.real(2.5), LC: obj.int(1), LJ: obj.int(2),
            ML: obj.real(10), D: obj.array([obj.array([obj.int(3)]), obj.int(0)]),
            RI: obj.name('AbsoluteColorimetric'),
            OP: obj.bool(true), op: obj.bool(false), OPM: obj.int(1),
            Font: obj.array([obj.ref(7, 0), obj.int(12)]),
            BG: obj.ref(1, 0), BG2: obj.name('Default'),
            UCR: obj.ref(2, 0), UCR2: obj.name('Default'),
            TR: obj.ref(3, 0), TR2: obj.name('Default'),
            HT: obj.dict({}),
            FL: obj.real(1), SM: obj.real(0.5),
            SA: obj.bool(true),
            BM: obj.name('Multiply'), SMask: obj.name('None'),
            CA: obj.real(0.7), ca: obj.real(0.4),
            AIS: obj.bool(false), TK: obj.bool(true),
            UseBlackPtComp: obj.name('ON'),
            HTO: obj.array([obj.int(0), obj.int(0)])
        });
        const g = typeExtGState(d);
        expect(g.lw).toBe(2.5);
        expect(g.lc).toBe(1);
        expect(g.ri).toBe('AbsoluteColorimetric');
        expect(g.op).toBe(true);
        expect(g.opNs).toBe(false);
        expect(g.opm).toBe(1);
        expect(g.ca).toBe(0.7);
        expect(g.caNs).toBe(0.4);
        expect(g.useBlackPtComp).toBe('ON');
        expect(g.bm.value).toBe('Multiply');
    });

    test('_extras preservation', () => {
        const d = obj.dict({ Type: obj.name('ExtGState'), CustomVendor: obj.int(99) });
        const g = typeExtGState(d);
        expect(g._extras.CustomVendor.value).toBe(99);
    });

    test('rejects non-dict', () => {
        expect(() => typeExtGState(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong /Type', () => {
        expect(() => typeExtGState(obj.dict({ Type: obj.name('Pattern') })))
            .toThrow(ParseError);
    });
});

describe('decodeType3CharOp', () => {
    test('decodes d0', () => {
        expect(decodeType3CharOp('d0', [500, 0])).toEqual({ kind: 'd0', wx: 500, wy: 0 });
    });

    test('decodes d1', () => {
        const r = decodeType3CharOp('d1', [500, 0, 0, -200, 600, 700]);
        expect(r.kind).toBe('d1');
        expect(r.bbox).toEqual([0, -200, 600, 700]);
    });

    test('throws on unknown op', () => {
        expect(() => decodeType3CharOp('xx', [])).toThrow(ParseError);
    });

    test('throws on bad operand count', () => {
        expect(() => decodeType3CharOp('d0', [1])).toThrow(ParseError);
        expect(() => decodeType3CharOp('d1', [1, 2])).toThrow(ParseError);
    });
});

describe('EXT_GSTATE_KEYS catalog', () => {
    test('frozen and contains key entries', () => {
        expect(Object.isFrozen(EXT_GSTATE_KEYS)).toBe(true);
        expect(EXT_GSTATE_KEYS.CA).toBeDefined();
        expect(EXT_GSTATE_KEYS.BM).toBeDefined();
    });
});

describe('pdfContentOpsExtended factory', () => {
    test('shape', () => {
        expect(pdfContentOpsExtended.name).toBe('pdfContentOpsExtended');
        expect(pdfContentOpsExtended.dependencies).toEqual(['pdfErrors', 'pdfParserObj']);
        expect(pdfContentOpsExtended.factory.toString()).toContain('function');
        const api = pdfContentOpsExtended.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof api.typeExtGState).toBe('function');
        expect(typeof api.decodeType3CharOp).toBe('function');
    });
});
