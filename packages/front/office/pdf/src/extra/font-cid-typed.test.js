// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfFontCidTyped } from './font-cid-typed.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typeCIDFont, typeCIDSystemInfo, decodeWidthsW, PREDEFINED_CMAPS } =
    pdfFontCidTyped.factory(_errors, _parserObj);
function bytes(s) { return new Uint8Array([...s].map(c => c.charCodeAt(0))); }

describe('typeCIDFont', () => {
    test('minimal CIDFontType2', () => {
        const csi = obj.dict({
            Registry: obj.string(bytes('Adobe')),
            Ordering: obj.string(bytes('Japan1')),
            Supplement: obj.int(6)
        });
        const d = obj.dict({
            Type: obj.name('Font'),
            Subtype: obj.name('CIDFontType2'),
            BaseFont: obj.name('MyFont'),
            CIDSystemInfo: csi
        });
        const r = typeCIDFont(d);
        expect(r.subtype).toBe('CIDFontType2');
        expect(r.baseFont).toBe('MyFont');
        expect(r.cidSystemInfo.ordering).toEqual(bytes('Japan1'));
        expect(r.dw).toBe(1000);
        expect(r._extras).toEqual({});
    });

    test('reads optional W/DW/DW2/W2/CIDToGIDMap', () => {
        const csi = obj.dict({
            Registry: obj.string(bytes('Adobe')),
            Ordering: obj.string(bytes('Identity')),
            Supplement: obj.int(0)
        });
        const d = obj.dict({
            Type: obj.name('Font'),
            Subtype: obj.name('CIDFontType0'),
            CIDSystemInfo: csi,
            DW: obj.int(500),
            DW2: obj.array([obj.int(880), obj.int(-1000)]),
            W: obj.array([
                obj.int(0), obj.array([obj.int(250), obj.int(300)]),
                obj.int(10), obj.int(20), obj.int(500)
            ]),
            CIDToGIDMap: obj.name('Identity'),
            Vendor: obj.int(1)
        });
        const r = typeCIDFont(d);
        expect(r.dw).toBe(500);
        expect(r.dw2).toEqual([880, -1000]);
        expect(r.w.length).toBe(2);
        expect(r.w[0]).toEqual({ first: 0, last: 1, widths: [250, 300] });
        expect(r.w[1]).toEqual({ first: 10, last: 20, width: 500 });
        expect(r.cidToGIDMap.value).toBe('Identity');
        expect(r._extras.Vendor.value).toBe(1);
    });

    test('rejects non-dict / bad subtype / missing CSI', () => {
        expect(() => typeCIDFont(obj.array([]))).toThrow(ParseError);
        expect(() => typeCIDFont(obj.dict({ Subtype: obj.name('Type1') }))).toThrow(ParseError);
        expect(() => typeCIDFont(obj.dict({ Subtype: obj.name('CIDFontType0') })))
            .toThrow(ParseError);
    });
});

describe('typeCIDSystemInfo', () => {
    test('minimal', () => {
        const d = obj.dict({
            Registry: obj.string(bytes('Adobe')),
            Ordering: obj.string(bytes('GB1')),
            Supplement: obj.int(5)
        });
        const r = typeCIDSystemInfo(d);
        expect(r.supplement).toBe(5);
    });

    test('rejects incomplete', () => {
        expect(() => typeCIDSystemInfo(obj.dict({ Registry: obj.string(bytes('A')) })))
            .toThrow(ParseError);
    });
});

describe('decodeWidthsW', () => {
    test('throws on non-array', () => {
        expect(() => decodeWidthsW(obj.int(1))).toThrow(ParseError);
    });
    test('throws on malformed range', () => {
        expect(() => decodeWidthsW(obj.array([obj.int(1), obj.int(2)]))).toThrow(ParseError);
    });
});

describe('PREDEFINED_CMAPS', () => {
    test('contains key CMaps', () => {
        expect(Object.isFrozen(PREDEFINED_CMAPS)).toBe(true);
        expect(PREDEFINED_CMAPS['Adobe-Japan1']).toContain('UniJIS-UTF16-H');
        expect(PREDEFINED_CMAPS['Identity']).toContain('Identity-H');
    });
});

describe('pdfFontCidTyped factory', () => {
    test('shape', () => {
        expect(pdfFontCidTyped.name).toBe('pdfFontCidTyped');
        expect(pdfFontCidTyped.dependencies).toEqual(['pdfErrors', 'pdfParserObj']);
        expect(pdfFontCidTyped.factory.toString()).toContain('function');
        const api = pdfFontCidTyped.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof api.typeCIDFont).toBe('function');
    });
});
