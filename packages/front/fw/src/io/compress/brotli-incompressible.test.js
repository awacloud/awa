// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The brotli encoder stores incompressible input before LZ77 and the
// dictionary scan (a sampled entropy test, then a content-anchored repeat
// probe); repeats of uniform bytes, near or far, still go to the compressed
// path. Every stream is checked by node:zlib.

import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ModuleRuntime } from '../../core/runtime.js';
import modules from '../../core/modules.js';

function engine(withDict) {
    const rt = new ModuleRuntime();
    rt.registerAll(modules);
    if (withDict) rt.resolve('brotliDictWords').setBlob(new Uint8Array(fs.readFileSync(path.join(import.meta.dir, 'brotli_dict.bin'))));
    return rt.resolve('brotli');
}

let x = 0x9E3779B9;
const uniform = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; b[i] = x & 255; } return b; };
const decodes = (out, src) => Buffer.from(zlib.brotliDecompressSync(out)).equals(Buffer.from(src));
/** Size of the encoder's uncompressed form: 3 header bytes per 64 KiB chunk, the payload, 1 final byte. */
const storedSize = (n) => n + 3 * Math.ceil(n / 65536) + 1;

for (const withDict of [false, true]) {
    describe(`brotli incompressible input (${withDict ? 'with' : 'without'} the dictionary)`, () => {
        const b = engine(withDict);

        test('uniform bytes are stored, at every quality 1-11 and several sizes', () => {
            for (const n of [5000, 65536, 65537, 262144]) {
                const src = uniform(n);
                for (let q = 1; q <= 11; q++) {
                    const out = b.brotliCompressSync(src, { quality: q });
                    expect(out.length).toBe(storedSize(n));
                    expect(decodes(out, src)).toBe(true);
                }
            }
        });

        test('two copies of a uniform block compress to about one', () => {
            const blk = uniform(100000);
            const src = new Uint8Array(200000);
            src.set(blk); src.set(blk, 100000);
            const out = b.brotliCompressSync(src, { quality: 6 });
            expect(out.length).toBeLessThan(110000);
            expect(decodes(out, src)).toBe(true);
        });

        test('a uniform block repeated 1 MiB back is still found', () => {
            const src = uniform(1 << 21);
            src.copyWithin(1 << 20, 0, 65536);   // 64 KiB at 0 reappears at 1 MiB
            const out = b.brotliCompressSync(src, { quality: 6 });
            expect(out.length).toBeLessThan(storedSize(src.length) - 50000);
            expect(decodes(out, src)).toBe(true);
        });

        test('a short repeat inside uniform bytes (under 1 % of them) stays stored', () => {
            const src = uniform(262144);
            src.copyWithin(200000, 1000, 1000 + 1000);   // 1000 bytes, 0.4 %
            const out = b.brotliCompressSync(src, { quality: 6 });
            expect(decodes(out, src)).toBe(true);
            expect(out.length).toBeLessThanOrEqual(storedSize(src.length));
        });

        test('text is not mistaken for incompressible input', () => {
            const src = new TextEncoder().encode('The quick brown fox jumps over the lazy dog. '.repeat(3000));
            const out = b.brotliCompressSync(src, { quality: 6 });
            expect(out.length).toBeLessThan(src.length / 20);
            expect(decodes(out, src)).toBe(true);
        });
    });
}
