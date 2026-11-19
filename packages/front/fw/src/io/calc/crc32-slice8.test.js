// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// crc32 slicing-by-8: equal to zlib.crc32 (when the runtime has it) and to
// the byte loop over arbitrary append splits, arrays of numbers included.

import { describe, test, expect } from 'bun:test';
import zlib from 'node:zlib';
import { crc32 } from './crc32.js';

const Crc32 = crc32.factory();

let x = 0x12345678;
const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
const bytes = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = rnd() & 255; return b; };

/** The byte-at-a-time reference, written from the polynomial. */
function reference(data) {
    let c = -1;
    for (let i = 0; i < data.length; i++) {
        c ^= data[i] & 0xff;
        for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
    }
    return (~c) >>> 0;
}

describe('crc32 slicing-by-8', () => {
    test('one append equals the reference on every length 0-300 and 1 MiB', () => {
        for (const n of [...Array(301).keys(), 1 << 20]) {
            const b = bytes(n);
            const c = new Crc32();
            c.append(b);
            expect(c.get()).toBe(reference(b));
            if (typeof zlib.crc32 === 'function') expect(c.get()).toBe(zlib.crc32(b) >>> 0);
        }
    });

    test('appends split at random offsets give the same value', () => {
        const b = bytes(100000);
        const want = reference(b);
        for (let round = 0; round < 20; round++) {
            const c = new Crc32();
            for (let o = 0; o < b.length;) { const k = 1 + (rnd() % 53); c.append(b.subarray(o, o + k)); o += k; }
            expect(c.get()).toBe(want);
        }
    });

    test('an array of numbers and a Uint8Array mixed in one checksum', () => {
        const a = Array.from(bytes(1000));
        const c = new Crc32();
        c.append(a.slice(0, 333));
        c.append(Uint8Array.from(a.slice(333, 900)));
        c.append(a.slice(900));
        expect(c.get()).toBe(reference(a));
        const d = new Crc32();
        d.append([256 + 7, -1, 1.5]);   // the byte loop masks each element to 8 bits
        expect(d.get()).toBe(reference([7, 255, 1]));
    });

    test('the known check value of "123456789" is 0xCBF43926', () => {
        const c = new Crc32();
        c.append(new TextEncoder().encode('123456789'));
        expect(c.get()).toBe(0xCBF43926);
    });
});
