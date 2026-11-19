// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The encoder's ratio levers: q7 searches deeper than q6 (a 64-candidate
// chain ended by a 32-byte match), the built-in dictionary is used from
// 4-byte words, and a copy whose bytes repeat at a cached distance takes
// that distance. Every stream must decode in node:zlib and fw.

import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ModuleRuntime } from '../../core/runtime.js';
import modules from '../../core/modules.js';

const plain = new ModuleRuntime();
plain.registerAll(modules);
const b = plain.resolve('brotli');

const withDict = new ModuleRuntime();
withDict.registerAll(modules);
withDict.resolve('brotliDictWords').setBlob(new Uint8Array(fs.readFileSync(path.join(import.meta.dir, 'brotli_dict.bin'))));
const bd = withDict.resolve('brotli');

let x = 0x2545F491;
const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };

/** Records whose fields recur at varying distances: the chain depth matters. */
function records(n) {
    const tags = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
    let s = '[';
    for (let i = 0; i < n; i++) {
        const t = tags[rnd() % tags.length];
        s += `{"kind":"${t}","id":${rnd() % 50000},"label":"${t}-${rnd() % 300}","tags":["${tags[rnd() % 6]}","${tags[rnd() % 6]}"],"ok":${rnd() & 1 ? 'true' : 'false'}},`;
    }
    return new TextEncoder().encode(s + '{}]');
}

const eq = (a, c) => Buffer.from(a).equals(Buffer.from(c));
const roundTrips = (enc, data, codec) => eq(zlib.brotliDecompressSync(enc), data) && eq(codec.brotliDecompressSync(enc), data);

describe('brotli encoder: match finder per quality', () => {
    const data = records(3000);

    test('q7 is smaller than q6, q11 no larger than q7; every quality decodes in node:zlib and fw', () => {
        const sizes = [];
        for (let q = 1; q <= 11; q++) {
            const enc = b.brotliCompressSync(data, { quality: q });
            expect(roundTrips(enc, data, b)).toBe(true);
            sizes[q] = enc.length;
        }
        expect(sizes[7]).toBeLessThan(sizes[6]);
        expect(sizes[11]).toBeLessThanOrEqual(sizes[7]);
    });
});

describe('brotli encoder: built-in dictionary from 4-byte words', () => {
    // The dictionary's own word list: every word is a dictionary hit, so
    // the 4- and 5-byte words show (with 6 bytes as the minimum, the blob
    // saved 3.2 % here; from 4, 5.8 %).
    const data = new Uint8Array(fs.readFileSync(path.join(import.meta.dir, 'brotli_dict.bin')));

    test('with the blob loaded q6 is at least 4.5 % smaller, and decodes in node:zlib and fw', () => {
        const without = b.brotliCompressSync(data, { quality: 6 });
        const withBlob = bd.brotliCompressSync(data, { quality: 6 });
        expect(roundTrips(without, data, b)).toBe(true);
        expect(roundTrips(withBlob, data, bd)).toBe(true);
        expect(withBlob.length).toBeLessThan(without.length * 0.955);
    });
});

describe('brotli encoder: a cached distance with the same bytes', () => {
    // Period-12 blocks with one byte changed now and then: many copies can
    // take the distance just used or a multiple of the period; a wrong
    // substitution would decode to other bytes.
    const data = new Uint8Array(200000);
    const unit = Uint8Array.from({ length: 12 }, () => rnd() & 0xff);
    for (let i = 0; i < data.length; i++) data[i] = (rnd() % 97 === 0) ? rnd() & 0xff : unit[i % 12];

    test('every quality decodes to the input in node:zlib and fw, one-shot and streamed', () => {
        for (let q = 1; q <= 11; q++) {
            const enc = b.brotliCompressSync(data, { quality: q });
            expect(roundTrips(enc, data, b)).toBe(true);
            const chunks = [];
            const s = new b.BrotliDecompressStream((c) => chunks.push(c));
            for (let i = 0; i < enc.length; i += 509) s.push(enc.subarray(i, i + 509), i + 509 >= enc.length);
            expect(eq(Buffer.concat(chunks.map((c) => Buffer.from(c))), data)).toBe(true);
        }
    });
});
