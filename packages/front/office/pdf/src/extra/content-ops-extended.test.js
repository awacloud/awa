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

describe('typeHalftone (ISO 32000-2 halftones)', () => {
    const { typeHalftone, HALFTONE_KEYS } = pdfContentOpsExtended.factory(_errors, _parserObj);
    const u8 = (s) => new TextEncoder().encode(s);

    test('a type 1 halftone: each key by its value or as read, the rest in _extras', () => {
        const d = obj.dict({
            Type: obj.name('Halftone'), HalftoneType: obj.int(1), HalftoneName: obj.string(u8('h1')),
            Frequency: obj.real(60), Angle: obj.int(45), SpotFunction: obj.name('Round'),
            AccurateScreens: obj.bool(true), TransferFunction: obj.ref(3, 0), Foo: obj.int(1)
        });
        const r = typeHalftone(d);
        expect([r.type, r.halftonetype, r.frequency, r.angle, r.spotfunction, r.accuratescreens])
            .toEqual(['Halftone', 1, 60, 45, 'Round', true]);
        expect(r.halftonename).toEqual(u8('h1'));
        expect(r.transferfunction.type).toBe('ref');
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(r.raw).toBe(d);
        expect(typeHalftone(obj.dict({ HalftoneType: obj.int(1), SpotFunction: obj.array([]), Frequency: obj.name('x') })))
            .toMatchObject({ spotfunction: { type: 'array' }, frequency: null });
    });

    test('a type 5 halftone: its colorants in colorants, not in _extras', () => {
        const r = typeHalftone(obj.dict({ HalftoneType: obj.int(5), Default: obj.dict({}), Cyan: obj.dict({}), Magenta: obj.ref(8, 0) }));
        expect(r.default.type).toBe('dict');
        expect(Object.keys(r.colorants)).toEqual(['Cyan', 'Magenta']);
        expect(r._extras).toEqual({});
    });

    test('a stream halftone (type 6, 10, 16): its own keys typed, its stream keys left out', () => {
        const s = obj.stream(obj.dict({
            HalftoneType: obj.int(16), Width: obj.int(4), Height: obj.int(4), Width2: obj.int(2), Height2: obj.int(2),
            Length: obj.int(24), Filter: obj.name('FlateDecode'), Foo: obj.int(1)
        }), new Uint8Array(24));
        const r = typeHalftone(s);
        expect([r.halftonetype, r.width, r.height, r.width2, r.height2]).toEqual([16, 4, 4, 2, 2]);
        expect('length' in r).toBe(false);
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(r.raw).toBe(s);
        expect(typeHalftone(obj.stream(obj.dict({ HalftoneType: obj.int(10), Xsquare: obj.int(3), Ysquare: obj.int(5) }), new Uint8Array())))
            .toMatchObject({ xsquare: 3, ysquare: 5 });
    });

    test('every type of HALFTONE_KEYS types every key of its list', () => {
        expect(Object.isFrozen(HALFTONE_KEYS)).toBe(true);
        const sizes = { 1: 8, 5: 4, 6: 6, 10: 6, 16: 8 };
        expect(Object.keys(HALFTONE_KEYS).sort()).toEqual(Object.keys(sizes).sort());
        for (const [type, keys] of Object.entries(HALFTONE_KEYS)) {
            expect(keys.length).toBe(sizes[type]);
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            entries.HalftoneType = obj.int(Number(type));
            const r = typeHalftone(obj.dict(entries));
            expect(r._extras).toEqual({});
            expect(r.halftonetype).toBe(Number(type));
        }
    });

    test('neither a dictionary nor a stream, or a missing or unknown /HalftoneType, throws', () => {
        const code = (fn) => { try { fn(); } catch (e) { return [e instanceof ParseError, e.code]; } return null; };
        expect(code(() => typeHalftone(obj.name('Default')))).toEqual([true, 'pdf/extra/halftone/not-dict']);
        expect(code(() => typeHalftone(obj.dict({})))).toEqual([true, 'pdf/extra/halftone/bad-type']);
        expect(code(() => typeHalftone(obj.dict({ HalftoneType: obj.int(2) })))).toEqual([true, 'pdf/extra/halftone/bad-type']);
    });
});

describe('typeExtGState — the halftone phase (A41b)', () => {
    test('HTP the array as read, null otherwise; listed in EXT_GSTATE_KEYS', () => {
        const htp = obj.array([obj.int(0), obj.int(0)]);
        const g = typeExtGState(obj.dict({ Type: obj.name('ExtGState'), HTP: htp }));
        expect([g.htp, g._extras]).toEqual([htp, {}]);
        expect(typeExtGState(obj.dict({ Type: obj.name('ExtGState') })).htp).toBe(null);
        expect(EXT_GSTATE_KEYS.HTP.kind).toBe('array');
    });
});
