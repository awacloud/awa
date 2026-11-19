// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Regressions of the brotli encoder's wide fields:
// - a literal run longer than 22593 bytes followed by a match: the encoder
//   split it with a 2-byte copy at distance 1 — bytes that were never in the
//   input — so the stream decoded to other bytes (node:zlib rejected it). One
//   command holds any insert length (insert code 23 reaches 22594 + 2^24 - 1,
//   RFC 7932 §5);
// - fields wider than 17 bits — distance extras past ~512 KiB, insert code
//   23's 24 extra bits, MLEN on 24 bits past 2 MiB: the bit writer ORs into a
//   3-byte window and lost their top bits, so an input over ~1 MiB with a far
//   match, or over 2 MiB, decoded to other bytes in node:zlib and fw alike.

import { describe, test, expect } from 'bun:test';
import zlib from 'node:zlib';
import { ModuleRuntime } from '../../core/runtime.js';
import modules from '../../core/modules.js';

const rt = new ModuleRuntime();
rt.registerAll(modules);
const b = rt.resolve('brotli');

let x = 0x2545F491;
const uniform = (n) => { const out = new Uint8Array(n); for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; out[i] = x & 255; } return out; };

describe('brotli: long literal runs before a match', () => {
    for (const run of [22593, 22594, 22600, 30000, 70000]) {
        test(`a ${run}-byte literal run, then a copy of it`, () => {
            const blk = uniform(run);
            const src = new Uint8Array(2 * run);
            src.set(blk); src.set(blk, run);
            for (const q of [1, 6, 11]) {
                const out = b.brotliCompressSync(src, { quality: q });
                expect(out.length).toBeLessThan(run + 2000);
                expect(Buffer.from(zlib.brotliDecompressSync(out)).equals(Buffer.from(src))).toBe(true);
                expect(Buffer.from(b.brotliDecompressSync(out)).equals(Buffer.from(src))).toBe(true);
            }
        });
    }
});

describe('brotli: wide fields (far distances, 24-bit MLEN)', () => {
    const roundTrips = (src, q) => {
        const out = b.brotliCompressSync(src, { quality: q });
        expect(Buffer.from(zlib.brotliDecompressSync(out)).equals(Buffer.from(src))).toBe(true);
        expect(Buffer.from(b.brotliDecompressSync(out)).equals(Buffer.from(src))).toBe(true);
        return out.length;
    };

    test('uniform bytes with a block repeated about 1 MiB back (distances past 2^20)', () => {
        const src = uniform(1200000);
        src.copyWithin(1100000, 0, 50000);
        expect(roundTrips(src, 6)).toBeLessThan(src.length - 40000);
    });

    test('an input over 2 MiB (MLEN on 24 bits) with repeats near and far', () => {
        const src = uniform(2500000);
        src.copyWithin(2400000, 0, 65536);       // past the encoder's 2 MiB LZ77 window: not copied
        src.copyWithin(300000, 250000, 290000);  // 40000 bytes, 50000 back: copied
        expect(roundTrips(src, 5)).toBeLessThan(src.length - 30000);
    });
}, 60000);
