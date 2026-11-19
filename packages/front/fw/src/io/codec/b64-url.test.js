// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// b64.url: base64url (RFC 4648 section 5), no padding, a strict canonical
// decoder (sections 3.5 and 5).

import { describe, test, expect } from 'bun:test';
import { b64 } from './b64.js';

const U = b64.factory().url;
const enc = (s) => new TextEncoder().encode(s);
const hex = (u) => Array.from(u, (x) => x.toString(16).padStart(2, '0')).join('');

describe('b64.url', () => {
    test('RFC 4648 section 10 vectors, unpadded, both ways', () => {
        const v = [['', ''], ['f', 'Zg'], ['fo', 'Zm8'], ['foo', 'Zm9v'], ['foob', 'Zm9vYg'], ['fooba', 'Zm9vYmE'], ['foobar', 'Zm9vYmFy']];
        for (const [plain, coded] of v) {
            expect(U.fromBytes(enc(plain))).toBe(coded);
            expect(new TextDecoder().decode(U.toBytes(coded))).toBe(plain);
        }
    });

    test('the URL-safe alphabet: 62 and 63 are "-" and "_", never "+" or "/"', () => {
        expect(U.fromBytes(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
        expect(hex(U.toBytes('-_8'))).toBe('fbff');
        const all = new Uint8Array(256).map((_, i) => i);
        const s = U.fromBytes(all);
        expect(/^[A-Za-z0-9\-_]*$/.test(s)).toBe(true);
        expect(hex(U.toBytes(s))).toBe(hex(all));
    });

    test('toBytes accepts only the canonical unpadded form', () => {
        expect(U.toBytes('Zg==')).toBe(false);       // padding
        expect(U.toBytes('Zm9v+/')).toBe(false);     // the standard alphabet
        expect(U.toBytes('Zm9vY')).toBe(false);      // 1 mod 4
        expect(U.toBytes('Zh')).toBe(false);         // unused bits set (Zg is canonical)
        expect(U.toBytes('Zm9=')).toBe(false);
        expect(U.toBytes(' Zg')).toBe(false);
        expect(U.toBytes(42)).toBe(false);
        expect(U.toBytes('').length).toBe(0);
    });

    test('test() agrees with toBytes', () => {
        for (const s of ['', 'Zg', 'Zm8', 'Zm9v', '-_8', 'Zh', 'Zg==', 'Zm9vY', '+/']) {
            expect(U.test(s)).toBe(U.toBytes(s) !== false);
        }
    });
});
