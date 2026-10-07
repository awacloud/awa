// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfCrossRefStream } from './crossRefStream.js';
import { pdfParserObj } from './parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { parseCrossRefStream } = pdfCrossRefStream.factory(_errors, _parserObj);
function be(value, width) {
    const out = new Array(width);
    for (let i = width - 1; i >= 0; i--) { out[i] = value & 0xFF; value = Math.floor(value / 256); }
    return out;
}

function buildPayload(records, W) {
    const bytes = [];
    for (const r of records) {
        const t  = r.t  || 0;
        const f2 = r.f2 || 0;
        const f3 = r.f3 || 0;
        if (W[0] > 0) bytes.push(...be(t,  W[0]));
        if (W[1] > 0) bytes.push(...be(f2, W[1]));
        if (W[2] > 0) bytes.push(...be(f3, W[2]));
    }
    return Uint8Array.from(bytes);
}

describe('parseCrossRefStream', () => {
    test('three records, W=[1,2,2]', () => {
        const W = [1, 2, 2];
        const payload = buildPayload([
            { t: 0, f2: 0,   f3: 65535 },
            { t: 1, f2: 17,  f3: 0 },
            { t: 1, f2: 100, f3: 0 }
        ], W);
        const dict = obj.dict({
            Type: obj.name('XRef'),
            Size: obj.int(3),
            W: obj.array([obj.int(1), obj.int(2), obj.int(2)])
        });
        const out = parseCrossRefStream(payload, dict);
        expect(out.entries[0]).toEqual({ type: 0, offset: 0, gen: 65535, free: true });
        expect(out.entries[1]).toEqual({ type: 1, offset: 17, gen: 0, free: false });
        expect(out.entries[2]).toEqual({ type: 1, offset: 100, gen: 0, free: false });
    });

    test('compressed entry (type 2)', () => {
        const W = [1, 2, 1];
        const payload = buildPayload([{ t: 2, f2: 50, f3: 3 }], W);
        const dict = obj.dict({
            Type: obj.name('XRef'),
            Size: obj.int(1),
            W: obj.array([obj.int(1), obj.int(2), obj.int(1)])
        });
        const out = parseCrossRefStream(payload, dict);
        expect(out.entries[0]).toMatchObject({ type: 2, objStm: 50, index: 3 });
    });

    test('respects /Index', () => {
        const W = [1, 1, 1];
        const payload = buildPayload([
            { t: 1, f2: 10, f3: 0 },
            { t: 1, f2: 20, f3: 0 }
        ], W);
        const dict = obj.dict({
            Type: obj.name('XRef'),
            Size: obj.int(20),
            Index: obj.array([obj.int(5), obj.int(2)]),
            W: obj.array([obj.int(1), obj.int(1), obj.int(1)])
        });
        const out = parseCrossRefStream(payload, dict);
        expect(out.entries[5].offset).toBe(10);
        expect(out.entries[6].offset).toBe(20);
    });

    test('zero-width type defaults to 1 (uncompressed)', () => {
        const W = [0, 2, 1];
        const payload = buildPayload([{ t: 0, f2: 99, f3: 0 }], W);
        const dict = obj.dict({
            Type: obj.name('XRef'),
            Size: obj.int(1),
            W: obj.array([obj.int(0), obj.int(2), obj.int(1)])
        });
        const out = parseCrossRefStream(payload, dict);
        expect(out.entries[0]).toMatchObject({ type: 1, offset: 99 });
    });

    test('rejects non-Uint8Array input', () => {
        expect(() => parseCrossRefStream('nope', obj.dict({}))).toThrow(ParseError);
    });

    test('rejects non-XRef /Type', () => {
        expect(() => parseCrossRefStream(new Uint8Array(0),
            obj.dict({ Type: obj.name('ObjStm') }))).toThrow(ParseError);
    });

    test('rejects bad /W', () => {
        const dict = obj.dict({
            Type: obj.name('XRef'),
            W: obj.array([obj.int(1), obj.int(1)])  // only 2 entries
        });
        expect(() => parseCrossRefStream(new Uint8Array(0), dict)).toThrow(ParseError);
    });

    test('rejects /W with all zeros', () => {
        const dict = obj.dict({
            Type: obj.name('XRef'),
            Size: obj.int(0),
            W: obj.array([obj.int(0), obj.int(0), obj.int(0)])
        });
        expect(() => parseCrossRefStream(new Uint8Array(0), dict)).toThrow(ParseError);
    });

    test('rejects truncated payload', () => {
        const dict = obj.dict({
            Type: obj.name('XRef'),
            Size: obj.int(5),
            W: obj.array([obj.int(1), obj.int(2), obj.int(1)])
        });
        expect(() => parseCrossRefStream(new Uint8Array(2), dict)).toThrow(ParseError);
    });
});

describe('pdfCrossRefStream module', () => {
    test('module shape', () => {
        expect(pdfCrossRefStream.name).toBe('pdfCrossRefStream');
        expect(pdfCrossRefStream.dependencies).toEqual(['pdfErrors', 'pdfParserObj']);
        expect(pdfCrossRefStream.factory.toString()).toContain('function');
        const m = pdfCrossRefStream.factory(_pdfErrors_TD1, { isType: (v, k) => !!(v && v.type === k) });
        expect(typeof m.parseCrossRefStream).toBe('function');
    });
});
