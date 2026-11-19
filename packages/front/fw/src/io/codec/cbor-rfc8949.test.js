// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// RFC 8949 Appendix A (every example, decoded) and Appendix F (every
// not-well-formed example), every one refused — the seventeen the decoder
// accepted until the pre-1.0 set (D23, the lone break of BL-1839 among them)
// included.

import { describe, test, expect } from 'bun:test';
import { cbor } from './cbor.js';
import { utf8 } from './utf8.js';

const c = cbor.factory(utf8.factory());
const hx = (h) => Uint8Array.from(h.match(/../g) || [], (b) => parseInt(b, 16));
const u8 = (...b) => new Uint8Array(b);
const tagged = (tag, value) => (v) => { expect(v.tag).toBe(tag); expect(v.value).toEqual(value); };
const simple = (n) => (v) => { expect(v.value).toBe(n); };
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** App. A: [hex, expected value (or a check function)]. */
const APPENDIX_A = [
    ['00', 0], ['01', 1], ['0a', 10], ['17', 23], ['1818', 24], ['1819', 25], ['1864', 100], ['1903e8', 1000],
    ['1a000f4240', 1000000], ['1b000000e8d4a51000', 1000000000000], ['1bffffffffffffffff', 18446744073709551615n],
    ['c249010000000000000000', 18446744073709551616n], ['3bffffffffffffffff', -18446744073709551616n],
    ['c349010000000000000000', -18446744073709551617n], ['20', -1], ['29', -10], ['3863', -100], ['3903e7', -1000],
    ['f90000', 0], ['f98000', -0], ['f93c00', 1], ['fb3ff199999999999a', 1.1], ['f93e00', 1.5], ['f97bff', 65504],
    ['fa47c35000', 100000], ['fa7f7fffff', 3.4028234663852886e+38], ['fb7e37e43c8800759c', 1.0e+300],
    ['f90001', 5.960464477539063e-8], ['f90400', 0.00006103515625], ['f9c400', -4], ['fbc010666666666666', -4.1],
    ['f97c00', Infinity], ['f97e00', NaN], ['f9fc00', -Infinity], ['fa7f800000', Infinity], ['fa7fc00000', NaN],
    ['faff800000', -Infinity], ['fb7ff0000000000000', Infinity], ['fb7ff8000000000000', NaN], ['fbfff0000000000000', -Infinity],
    ['f4', false], ['f5', true], ['f6', null], ['f7', undefined], ['f0', simple(16)], ['f8ff', simple(255)],
    ['c074323031332d30332d32315432303a30343a30305a', tagged(0, '2013-03-21T20:04:00Z')],
    ['c11a514b67b0', tagged(1, 1363896240)], ['c1fb41d452d9ec200000', tagged(1, 1363896240.5)],
    ['d74401020304', tagged(23, u8(1, 2, 3, 4))], ['d818456449455446', tagged(24, u8(0x64, 0x49, 0x45, 0x54, 0x46))],
    ['d82076687474703a2f2f7777772e6578616d706c652e636f6d', tagged(32, 'http://www.example.com')],
    ['40', u8()], ['4401020304', u8(1, 2, 3, 4)],
    ['60', ''], ['6161', 'a'], ['6449455446', 'IETF'], ['62225c', '"\\'], ['62c3bc', 'ü'], ['63e6b0b4', '水'],
    ['64f0908591', '\u{10151}'],
    ['80', []], ['83010203', [1, 2, 3]], ['8301820203820405', [1, [2, 3], [4, 5]]],
    ['98190102030405060708090a0b0c0d0e0f101112131415161718181819', range(1, 25)],
    ['a0', {}], ['a201020304', { 1: 2, 3: 4 }], ['a26161016162820203', { a: 1, b: [2, 3] }],
    ['826161a161626163', ['a', { b: 'c' }]], ['a56161614161626142616361436164614461656145', { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E' }],
    ['5f42010243030405ff', u8(1, 2, 3, 4, 5)], ['7f657374726561646d696e67ff', 'streaming'], ['9fff', []],
    ['9f018202039f0405ffff', [1, [2, 3], [4, 5]]], ['9f01820203820405ff', [1, [2, 3], [4, 5]]],
    ['83018202039f0405ff', [1, [2, 3], [4, 5]]], ['83019f0203ff820405', [1, [2, 3], [4, 5]]],
    ['9f0102030405060708090a0b0c0d0e0f101112131415161718181819ff', range(1, 25)],
    ['bf61610161629f0203ffff', { a: 1, b: [2, 3] }], ['826161bf61626163ff', ['a', { b: 'c' }]],
    ['bf6346756ef563416d7421ff', { Fun: true, Amt: -2 }],
];

/** App. F: every example of a not-well-formed item, by section. */
const APPENDIX_F = {
    'end of input in a head': ['18', '19', '1a', '1b', '1901', '1a0102', '1b01020304050607', '38', '58', '78', '98', '9a01ff00', 'b8', 'd8', 'f8', 'f900', 'fa0000', 'fb000000'],
    'definite-length strings with short data': ['41', '61', '5affffffff00', '5bffffffffffffffff010203', '7affffffff00', '7b7fffffffffffffff010203'],
    'definite-length maps and arrays not closed': ['81', '818181818181818181', '8200', 'a1', 'a20102', 'a100', 'a2000000'],
    'tag number not followed by tag content': ['c0'],
    'indefinite-length strings not closed': ['5f4100', '7f6100'],
    'indefinite-length maps and arrays not closed': ['9f', '9f0102', 'bf', 'bf01020102', '819f', '9f8000', '9f9f9f9f9fffffffff', '9f819f819f9fffffff'],
    'reserved additional information values': ['1c', '1d', '1e', '3c', '3d', '3e', '5c', '5d', '5e', '7c', '7d', '7e', '9c', '9d', '9e', 'bc', 'bd', 'be', 'dc', 'dd', 'de', 'fc', 'fd', 'fe'],
    'reserved two-byte encodings of simple values': ['f800', 'f801', 'f818', 'f81f'],
    'indefinite-length string chunks not of the correct type': ['5f00ff', '5f21ff', '5f6100ff', '5f80ff', '5fa0ff', '5fc000ff', '5fe0ff', '7f4100ff'],
    'indefinite-length string chunks not definite length': ['5f5f4100ffff', '7f7f6100ffff'],
    'break occurring on its own outside of an indefinite-length item': ['ff'],
    'break occurring in a definite-length array or map or a tag': ['81ff', '8200ff', 'a1ff', 'a1ff00', 'a100ff', 'a20000ff', '9f81ff', '9f829f819f9fffffffff'],
    'break in an indefinite-length map that would lead to an odd number of items': ['bf00ff', 'bf000000ff'],
    'major type 0, 1, 6 with additional information 31': ['1f', '3f', 'df'],
};

/** Accepted until the pre-1.0 set (D23), refused since. */
const ACCEPTED_BEFORE_D23 = [
    '41', '61', '5affffffff00', '5bffffffffffffffff010203', '7affffffff00', '7b7fffffffffffffff010203',
    'f800', 'f801', 'f818', 'f81f', '5f5f4100ffff', '7f7f6100ffff', 'ff', '81ff', '8200ff', 'a1ff00', 'a100ff',
];

describe('RFC 8949 Appendix A — every example decodes', () => {
    for (const [hex, want] of APPENDIX_A) {
        test(hex, () => {
            const v = c.decode(hx(hex));
            if (typeof want === 'function') want(v);
            else if (Number.isNaN(want)) expect(Number.isNaN(v)).toBe(true);
            else if (Object.is(want, -0)) expect(Object.is(v, -0)).toBe(true);
            else expect(v).toEqual(want);
        });
    }
});

describe('RFC 8949 Appendix F — not-well-formed items', () => {
    for (const [section, items] of Object.entries(APPENDIX_F)) {
        test(`refused: ${section}`, () => {
            for (const h of items) expect(() => c.decode(hx(h)), h).toThrow();
        });
    }

    test('all 94 are refused, the 17 accepted before D23 included', () => {
        const all = Object.values(APPENDIX_F).flat();
        expect(all.length).toBe(94);
        const accepted = all.filter((h) => { try { c.decode(hx(h)); return true; } catch { return false; } });
        expect(accepted).toEqual([]);
        expect(ACCEPTED_BEFORE_D23.every((h) => all.includes(h))).toBe(true);
        expect(ACCEPTED_BEFORE_D23.length).toBe(17);
    });
});

describe('RFC 8949 App. A — safe integers encode as integers (D24)', () => {
    const hex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
    test('1e12 is 1b000000e8d4a51000; the safe range edges and their negatives are major 0 / 1', () => {
        expect(hex(c.encode(1000000000000))).toBe('1b000000e8d4a51000');
        expect(hex(c.encode(4294967296))).toBe('1b0000000100000000');
        expect(hex(c.encode(Number.MAX_SAFE_INTEGER))).toBe('1b001fffffffffffff');
        expect(hex(c.encode(-Number.MAX_SAFE_INTEGER))).toBe('3b001ffffffffffffe');
        for (const v of [1e12, -1e12, 2 ** 40 + 7, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
            expect(c.decode(c.encode(v))).toBe(v);
        }
    });

    test('past 2^53 a number stays a float', () => {
        expect(hex(c.encode(2 ** 53)).slice(0, 2)).toMatch(/^f[9ab]$/);
    });
});
