// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// One typed error convention for the compressors (D9 G6): `code` is a string
// (`'E…'`, as brotli's), and the deflate family keeps its earlier number in
// `errno`. lz4 and lzw, which threw bare messages, carry a code too.

import { describe, test, expect } from 'bun:test';
import { deflate } from './deflate.js';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 } from './lz77.js';
import { zlib } from './zlib.js';
import { gzip } from './gzip.js';
import { zip } from './zip.js';
import { lz4 } from './lz4.js';
import { lzw } from './lzw.js';
import { adler32 } from '../calc/adler32.js';
import { crc32 } from '../calc/crc32.js';

const bs = bitstream.factory();
const d = deflate.factory(bs, huffman.factory(bs), lz77.factory());
const Z = zlib.factory(d, adler32.factory());
const G = gzip.factory(d, crc32.factory());
const P = zip.factory(d, crc32.factory());

const caught = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const pair = (fn) => { const e = caught(fn); return e && [e.code, e.errno]; };
const TEXT = new TextEncoder().encode('typed codes '.repeat(50));

describe('compressor errors: a string code, the number in errno', () => {
    test('deflate: EBADBLOCK 1, EEOF 0, EBADDISTANCE 3, EMAXOUT 7, ESTREAMEND 4', () => {
        expect(pair(() => d.inflateSync(new Uint8Array([0x07, 0x00])))).toEqual(['EBADBLOCK', 1]);
        expect(pair(() => d.inflateSync(d.deflateSync(TEXT).subarray(0, 5)))).toEqual(['EEOF', 0]);
        expect(pair(() => d.inflateSync(d.deflateSync(TEXT), { maxOutput: 10 }))).toEqual(['EMAXOUT', 7]);
        const s = new d.InflateStream(() => {});
        s.push(d.deflateSync(TEXT), true);
        expect(pair(() => s.push(new Uint8Array([0]), true))).toEqual(['ESTREAMEND', 4]);
    });

    test('zlib: EBADFORMAT 6, ECHECKSUM 16', () => {
        expect(pair(() => Z.unzlibSync(new Uint8Array([0x00, 0x00, 0x00])))).toEqual(['EBADFORMAT', 6]);
        const f = Z.zlibSync(TEXT); f[f.length - 1] ^= 1;
        expect(pair(() => Z.unzlibSync(f))).toEqual(['ECHECKSUM', 16]);
    });

    test('gzip: EBADFORMAT 6, ECHECKSUM 16', () => {
        expect(pair(() => G.gunzipSync(new Uint8Array(20)))).toEqual(['EBADFORMAT', 6]);
        const g = G.gzipSync(TEXT); g[g.length - 8] ^= 1;
        expect(pair(() => G.gunzipSync(g))).toEqual(['ECHECKSUM', 16]);
    });

    test('zip: EBADFORMAT 13, ECHECKSUM 16, EUNSAFEPATH 15', () => {
        expect(pair(() => P.unzipSync(new Uint8Array(30)))).toEqual(['EBADFORMAT', 13]);
        const a = P.zipSync({ 'a.txt': TEXT }, { level: 0 });
        a[30 + 5 + 5] ^= 1;
        expect(pair(() => P.unzipSync(a))).toEqual(['ECHECKSUM', 16]);
        const evil = P.zipSync({ '../x': TEXT });
        expect(pair(() => P.unzipSync(evil))).toEqual(['EUNSAFEPATH', 15]);
    });

    test('lz4 and lzw: EBADSTREAM / EBADARG codes on the errors they throw', () => {
        expect(caught(() => lzw.factory().encode(/** @type {any} */ ('x'))).code).toBe('EBADARG');
        expect(caught(() => lzw.factory().decode(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]))).code).toBe('EBADSTREAM');
        const L = lz4.factory();
        const s = new L.Lz4DecompressStream(() => {});
        // a match at offset 5 with nothing before it: a malformed block
        expect(caught(() => s.push(new Uint8Array([0x10, 0x41, 0x05, 0x00]), true)).code).toBe('EBADSTREAM');
    });
});
