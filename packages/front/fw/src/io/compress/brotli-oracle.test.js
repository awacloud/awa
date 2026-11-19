// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// fw's brotli encoder against an external decoder: every quality's output,
// with and without the dictionary blob, is decoded by `node:zlib` (the
// reference implementation's decoder) back to the input. The other direction
// (node's encoder, fw's decoder) is in the brotli*.test.js files.

import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ModuleRuntime } from '../../core/runtime.js';
import modules from '../../core/modules.js';

const words = 'the of and to in is that for with as on by this from an are be or at which it not have has can all will one more when there their about other into'.split(' ');

/** @param {number} n @param {number} seed @returns {Uint8Array} */
function prng(n, seed) {
    const out = new Uint8Array(n);
    let x = seed >>> 0;
    for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; out[i] = x & 0xff; }
    return out;
}

/** @param {number} n @returns {Uint8Array} English-like text over a small word list */
function text(n) {
    const r = prng(n, 7);
    let s = '';
    for (let i = 0; s.length < n; i++) s += words[r[i % n] % words.length] + (r[(i * 7) % n] % 11 === 0 ? '.\n' : ' ');
    return new TextEncoder().encode(s.slice(0, n));
}

const json = new TextEncoder().encode(JSON.stringify(Array.from({ length: 400 }, (_, i) => ({ id: i, name: `item-${i}`, tags: ['a', 'b', i % 3 ? 'c' : 'd'], ok: i % 2 === 0 }))));
const INPUTS = {
    empty: new Uint8Array(0),
    'one byte': new Uint8Array([0x41]),
    text: text(70_000),
    json,
    random: prng(20_000, 99),
    'long run': new Uint8Array(100_000).fill(0x61),
};

function brotli(withDict) {
    const rt = new ModuleRuntime();
    rt.registerAll(modules);
    if (withDict) rt.resolve('brotliDictWords').setBlob(new Uint8Array(fs.readFileSync(path.join(import.meta.dir, 'brotli_dict.bin'))));
    return rt.resolve('brotli');
}

describe.each([['without the dictionary blob', false], ['with the dictionary blob', true]])('fw brotli → node:zlib, %s', (_label, withDict) => {
    const b = brotli(withDict);
    for (let q = 0; q <= 11; q++) {
        test(`quality ${q}: every input decodes to itself`, () => {
            for (const [name, data] of Object.entries(INPUTS)) {
                const enc = b.brotliCompressSync(data, { quality: q });
                const dec = new Uint8Array(zlib.brotliDecompressSync(enc));
                expect([name, dec.length]).toEqual([name, data.length]);
                expect(Buffer.from(dec).equals(Buffer.from(data))).toBe(true);
            }
        }, 60_000);
    }
});
