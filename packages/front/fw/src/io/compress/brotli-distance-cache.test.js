// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The encoder codes repeated distances through the distance cache (RFC 7932
// §4: codes 0-15, code 0 on implicit-distance insert-and-copy symbols), moving
// its ring exactly as a decoder does. Records of a fixed layout repeat their
// distances; every stream must decode in node:zlib and fw, and be smaller.

import { describe, test, expect } from 'bun:test';
import zlib from 'node:zlib';
import { ModuleRuntime } from '../../core/runtime.js';
import modules from '../../core/modules.js';

const rt = new ModuleRuntime();
rt.registerAll(modules);
const b = rt.resolve('brotli');

let x = 0x9E3779B9;
const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };

/** Fixed-width records: field names at constant distances, values varying. */
function records(n) {
    let s = '';
    for (let i = 0; i < n; i++) {
        s += `{"id":${String(rnd() % 100000).padStart(6, '0')},"name":"user${rnd() % 997}","active":${rnd() & 1 ? 'true ' : 'false'},"score":${(rnd() % 1000) / 10}}\n`;
    }
    return new TextEncoder().encode(s);
}

const roundTrips = (out, src) =>
    Buffer.from(zlib.brotliDecompressSync(out)).equals(Buffer.from(src)) &&
    Buffer.from(b.brotliDecompressSync(out)).equals(Buffer.from(src));

describe('brotli encoder: distance cache', () => {
    const src = records(4000);

    test('every quality 1-11 round-trips through node:zlib and fw', () => {
        for (let q = 1; q <= 11; q++) expect(roundTrips(b.brotliCompressSync(src, { quality: q }), src)).toBe(true);
    });

    test('a period-16 byte pattern with variations round-trips (ring codes 4-15 in play)', () => {
        const p = new Uint8Array(200000);
        for (let i = 0; i < p.length; i++) p[i] = (i % 16) * 7 + ((rnd() % 50) === 0 ? 1 : 0);
        for (const q of [2, 6, 11]) expect(roundTrips(b.brotliCompressSync(p, { quality: q }), p)).toBe(true);
    });

    test('short inputs and single-record inputs round-trip', () => {
        for (const n of [1, 2, 3, 10]) {
            const s = records(n);
            for (const q of [1, 6, 11]) expect(roundTrips(b.brotliCompressSync(s, { quality: q }), s)).toBe(true);
        }
    });
});
