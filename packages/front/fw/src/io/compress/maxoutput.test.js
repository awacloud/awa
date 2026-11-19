// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// `maxOutput`: a cap, in bytes, on what a decoder may produce — the bound a
// caller needs against a decompression bomb. Absent, nothing changes. Over
// the cap the deflate family throws code 7 and brotli `EMAXOUT`, before its
// buffer grows past the cap; exactly `maxOutput` bytes pass. The inputs are
// 1 MiB zero runs compressed by node:zlib (about a kilobyte each).

import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodeZlib from 'node:zlib';
import { deflate } from './deflate.js';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 } from './lz77.js';
import { zlib } from './zlib.js';
import { gzip } from './gzip.js';
import { zip } from './zip.js';
import { brotli } from './brotli.js';
import { brotliDict } from './brotli_dict.js';
import { brotliDictWords } from './brotli_dict_words.js';
import { adler32 } from '../calc/adler32.js';
import { crc32 } from '../calc/crc32.js';

const bs = bitstream.factory();
const hf = huffman.factory(bs);
const d = deflate.factory(bs, hf, lz77.factory());
const Z = zlib.factory(d, adler32.factory());
const G = gzip.factory(d, crc32.factory());
const P = zip.factory(d, crc32.factory());
const words = brotliDictWords.factory();
words.setBlob(new Uint8Array(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'brotli_dict.bin'))));
const B = brotli.factory(bs, hf, lz77.factory(), brotliDict.factory(), words);

const N = 1 << 20;
const ZEROS = new Uint8Array(N);
const u8 = (b) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
const RAW = u8(nodeZlib.deflateRawSync(ZEROS, { level: 9 }));
const ZL = u8(nodeZlib.deflateSync(ZEROS, { level: 9 }));
const GZ = u8(nodeZlib.gzipSync(ZEROS, { level: 9 }));
const BR = u8(nodeZlib.brotliCompressSync(ZEROS));

const codeOf = (fn) => { try { fn(); return 'no throw'; } catch (e) { return e.errno ?? e.code; } };

/** Feed `bytes` to a stream in chunks of `size`; return the total emitted length. */
function streamTotal(Ctor, opts, bytes, size) {
    let total = 0;
    const s = new Ctor(opts, (data) => { total += data.length; });
    for (let i = 0; i < bytes.length; i += size) s.push(bytes.subarray(i, i + size), i + size >= bytes.length);
    return total;
}

describe('maxOutput — the inputs are bombs', () => {
    test('each compresses 1 MiB into under 2 KiB', () => {
        for (const c of [RAW, ZL, GZ, BR]) expect(c.length).toBeLessThan(2048);
    });
});

describe('maxOutput — sync decoders', () => {
    const cases = [
        ['inflateSync', (o) => d.inflateSync(RAW, o)],
        ['unzlibSync', (o) => Z.unzlibSync(ZL, o)],
        ['gunzipSync', (o) => G.gunzipSync(GZ, o)],
    ];
    for (const [name, run] of cases) {
        test(`${name}: absent = no cap`, () => { expect(run({}).length).toBe(N); });
        test(`${name}: exactly maxOutput passes`, () => { expect(run({ maxOutput: N }).length).toBe(N); });
        test(`${name}: one byte under throws code 7`, () => { expect(codeOf(() => run({ maxOutput: N - 1 }))).toBe(7); });
        test(`${name}: a small cap throws code 7`, () => { expect(codeOf(() => run({ maxOutput: 1000 }))).toBe(7); });
    }

    test('brotliDecompressSync: absent, equal, under', () => {
        expect(B.brotliDecompressSync(BR).length).toBe(N);
        expect(B.brotliDecompressSync(BR, { maxOutput: N }).length).toBe(N);
        expect(codeOf(() => B.brotliDecompressSync(BR, { maxOutput: N - 1 }))).toBe('EMAXOUT');
        expect(codeOf(() => B.brotliDecompressSync(BR, { maxOutput: 1000 }))).toBe('EMAXOUT');
    });

    test('maxOutput: 0 admits only an empty output', () => {
        expect(d.inflateSync(d.deflateSync(new Uint8Array(0)), { maxOutput: 0 }).length).toBe(0);
        expect(codeOf(() => d.inflateSync(RAW, { maxOutput: 0 }))).toBe(7);
    });

    test('a dictionary does not count against the cap', () => {
        const dict = new Uint8Array(1000).fill(7);
        const data = new Uint8Array(500).fill(7);
        const c = d.deflateSync(data, { dictionary: dict });
        expect(d.inflateSync(c, { dictionary: dict, maxOutput: 500 }).length).toBe(500);
        expect(codeOf(() => d.inflateSync(c, { dictionary: dict, maxOutput: 499 }))).toBe(7);
    });

    test('gunzipSync caps the sum over members', () => {
        const two = new Uint8Array(GZ.length * 2);
        two.set(GZ); two.set(GZ, GZ.length);
        expect(G.gunzipSync(two, { maxOutput: 2 * N }).length).toBe(2 * N);
        expect(codeOf(() => G.gunzipSync(two, { maxOutput: 2 * N - 1 }))).toBe(7);
    });

    test('the async forms honour it', async () => {
        await expect(d.inflate(RAW, { maxOutput: 10 })).rejects.toMatchObject({ errno: 7 });
        await expect(Z.unzlib(ZL, { maxOutput: 10 })).rejects.toMatchObject({ errno: 7 });
        await expect(G.gunzip(GZ, { maxOutput: 10 })).rejects.toMatchObject({ errno: 7 });
        await expect(B.brotliDecompress(BR, { maxOutput: 10 })).rejects.toMatchObject({ code: 'EMAXOUT' });
    });
});

describe('maxOutput — unzipSync checks declared sizes before allocating', () => {
    const archive = P.zipSync({ 'a.bin': ZEROS, 'b.bin': ZEROS });

    test('the sum over entries', () => {
        expect(Object.keys(P.unzipSync(archive, { maxOutput: 2 * N }))).toEqual(['a.bin', 'b.bin']);
        expect(codeOf(() => P.unzipSync(archive, { maxOutput: 2 * N - 1 }))).toBe(7);
        expect(codeOf(() => P.unzipSync(archive, { maxOutput: N - 1 }))).toBe(7);
    });

    test('a stored entry counts too', () => {
        const stored = P.zipSync({ 's.bin': [new Uint8Array(100), { level: 0 }] });
        expect(codeOf(() => P.unzipSync(stored, { maxOutput: 99 }))).toBe(7);
        expect(P.unzipSync(stored, { maxOutput: 100 })['s.bin'].length).toBe(100);
    });

    test('an entry declaring 0xFFFFFFF0 bytes is refused before its buffer exists', () => {
        const forged = P.zipSync({ 'x.bin': new Uint8Array(10) });
        // the central directory header: signature 0x02014b50, size at +24
        let cd = forged.length - 22;
        while (!(forged[cd] === 0x50 && forged[cd + 1] === 0x4b && forged[cd + 2] === 1 && forged[cd + 3] === 2)) cd--;
        new DataView(forged.buffer).setUint32(cd + 24, 0xFFFFFFF0, true);
        expect(codeOf(() => P.unzipSync(forged, { maxOutput: 1 << 20 }))).toBe(7);
    });

    test('the async form honours it', async () => {
        await expect(P.unzip(archive, { maxOutput: 10 })).rejects.toMatchObject({ errno: 7 });
    });
});

describe('maxOutput — streams cap their total', () => {
    const cases = [
        ['InflateStream', d.InflateStream, RAW, 7],
        ['UnzlibStream', Z.UnzlibStream, ZL, 7],
        ['GunzipStream', G.GunzipStream, GZ, 7],
        ['BrotliDecompressStream', B.BrotliDecompressStream, BR, 'EMAXOUT'],
    ];
    for (const [name, Ctor, bytes, code] of cases) {
        test(`${name}: absent, equal, under (1 KiB chunks)`, () => {
            expect(streamTotal(Ctor, {}, bytes, 1024)).toBe(N);
            expect(streamTotal(Ctor, { maxOutput: N }, bytes, 1024)).toBe(N);
            expect(codeOf(() => streamTotal(Ctor, { maxOutput: N - 1 }, bytes, 1024))).toBe(code);
        });
    }

    test('GunzipStream caps the sum over members', () => {
        const two = new Uint8Array(GZ.length * 2);
        two.set(GZ); two.set(GZ, GZ.length);
        expect(streamTotal(G.GunzipStream, { maxOutput: 2 * N }, two, 700)).toBe(2 * N);
        expect(codeOf(() => streamTotal(G.GunzipStream, { maxOutput: 2 * N - 1 }, two, 700))).toBe(7);
    });
});
