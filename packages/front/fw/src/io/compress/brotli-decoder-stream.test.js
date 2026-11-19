// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The decoder's hot loops keep their state in locals; a stream that runs out
// of input in the middle of one (EAGAIN) must resume exactly. node:zlib
// streams of text with dictionary references, pushed a few bytes at a time.

import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ModuleRuntime } from '../../core/runtime.js';
import modules from '../../core/modules.js';

const rt = new ModuleRuntime();
rt.registerAll(modules);
rt.resolve('brotliDictWords').setBlob(new Uint8Array(fs.readFileSync(path.join(import.meta.dir, 'brotli_dict.bin'))));
const b = rt.resolve('brotli');

const text = new TextEncoder().encode(Array.from({ length: 600 }, (_, i) =>
    `The ${i % 7 ? 'quick' : 'QUICK'} brown fox number ${i} jumps over the lazy dog; "information" <div class="content">${'x'.repeat(i % 40)}</div>\n`).join(''));

function streamed(enc, step) {
    const chunks = [];
    const s = new b.BrotliDecompressStream((c) => chunks.push(c));
    for (let i = 0; i < enc.length; i += step) s.push(enc.subarray(i, i + step), i + step >= enc.length);
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

describe('brotli decoder: streamed in small pushes', () => {
    for (const q of [1, 5, 9, 11]) {
        test(`q${q}: pushes of 1, 3, 7 and 61 bytes give the input`, () => {
            const enc = zlib.brotliCompressSync(text, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: q } });
            expect(Buffer.from(b.brotliDecompressSync(enc)).equals(Buffer.from(text))).toBe(true);
            for (const step of [1, 3, 7, 61]) expect(streamed(enc, step).equals(Buffer.from(text))).toBe(true);
        });
    }

    test('maxOutput still fails at the byte that exceeds it, with the output reserved per meta-block', () => {
        const enc = zlib.brotliCompressSync(text);
        expect(() => b.brotliDecompressSync(enc, { maxOutput: text.length - 1 })).toThrow();
        expect(b.brotliDecompressSync(enc, { maxOutput: text.length }).length).toBe(text.length);
    });
});
