// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// BL-1112 (T22): the encoder holds one block of tokens, not the whole
// input's. A DI-wrapped lz77 records every buffer the scan writes into.

import { describe, test, expect } from 'bun:test';
import zlib from 'node:zlib';
import { deflate } from './deflate.js';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 } from './lz77.js';

const BLOCK_TOKENS = 16384;

function spiedEngine() {
    const real = lz77.factory();
    const seen = { fills: [], encodeTokens: 0 };
    const spy = {
        ...real,
        encodeTokens(...a) { seen.encodeTokens++; return real.encodeTokens(...a); },
        createScanner(data, opts) {
            const sc = real.createScanner(data, opts);
            return {
                fill(tokens, max) { seen.fills.push({ entries: tokens.length, max }); return sc.fill(tokens, max); },
                get done() { return sc.done; },
            };
        },
    };
    const bs = bitstream.factory();
    return { d: deflate.factory(bs, huffman.factory(bs), spy), seen };
}

/** 2 MiB of mixed text and noise: about 130 blocks at level 1. */
function input() {
    const out = new Uint8Array(2 * 1024 * 1024);
    let x = 0x9E3779B9;
    const words = new TextEncoder().encode('the quick brown fox jumps over the lazy dog, 0123456789 ');
    for (let i = 0; i < out.length; i++) {
        x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
        out[i] = (i >> 15) & 1 ? x & 0xff : words[(i + (x & 3)) % words.length];
    }
    return out;
}

describe('deflate scans block by block (BL-1112)', () => {
    const data = input();

    for (const level of [1, 6, 9]) {
        test(`level ${level}: every fill writes into one 2 x BLOCK_TOKENS buffer, whatever the input size`, () => {
            const { d, seen } = spiedEngine();
            const out = d.deflateSync(data, { level, lazy: level === 9 });
            expect(seen.encodeTokens).toBe(0);
            expect(seen.fills.length).toBeGreaterThan(4);
            for (const f of seen.fills) {
                expect(f.max).toBe(BLOCK_TOKENS);
                expect(f.entries).toBe(2 * BLOCK_TOKENS);
            }
            expect(Buffer.from(zlib.inflateRawSync(out)).equals(Buffer.from(data))).toBe(true);
        });
    }

    test('DeflateStream scans through the same bounded buffer', () => {
        const { d, seen } = spiedEngine();
        const chunks = [];
        const s = new d.DeflateStream({ level: 6 }, (c) => chunks.push(c));
        for (let i = 0; i < data.length; i += 300000) s.push(data.subarray(i, i + 300000), false);
        s.push(new Uint8Array(0), true);
        for (const f of seen.fills) expect(f.entries).toBe(2 * BLOCK_TOKENS);
        expect(Buffer.from(zlib.inflateRawSync(Buffer.concat(chunks))).equals(Buffer.from(data))).toBe(true);
    });

    test('an empty input still ends with one final block', () => {
        const { d, seen } = spiedEngine();
        const out = d.deflateSync(new Uint8Array(0), { level: 6 });
        expect(seen.fills.length).toBe(1);
        expect(zlib.inflateRawSync(out).length).toBe(0);
    });
});
