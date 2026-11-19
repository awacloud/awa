// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// External oracle: node:zlib (zlib, the reference implementation) in both
// directions. Nothing is vendored: the oracle runs at test time.

import { describe, test, expect } from 'bun:test';
import nz from 'node:zlib';
import { deflate } from './deflate.js';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 } from './lz77.js';
import { zlib } from './zlib.js';
import { gzip } from './gzip.js';
import { adler32 } from '../calc/adler32.js';
import { crc32 } from '../calc/crc32.js';

const bs = bitstream.factory();
const d = deflate.factory(bs, huffman.factory(bs), lz77.factory());
const Z = zlib.factory(d, adler32.factory());
const G = gzip.factory(d, crc32.factory());

const INPUTS = {
    empty: new Uint8Array(0),
    oneByte: new Uint8Array([65]),
    text: new TextEncoder().encode('The quick brown fox jumps over the lazy dog. '.repeat(500)),
    pseudoRandom: Uint8Array.from({ length: 70000 }, (_, i) => (i * 2654435761 >>> 13) & 0xFF),
    oneRun: new Uint8Array(100000).fill(7),
};
const STRATEGIES = {
    default: nz.constants.Z_DEFAULT_STRATEGY,
    filtered: nz.constants.Z_FILTERED,
    huffmanOnly: nz.constants.Z_HUFFMAN_ONLY,
    rle: nz.constants.Z_RLE,
    fixed: nz.constants.Z_FIXED,
};
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

describe('node:zlib → fw', () => {
    for (const [name, input] of Object.entries(INPUTS)) {
        test(`${name}: every level and strategy, zlib and gzip, decoded with verify`, () => {
            for (const level of [0, 1, 6, 9]) {
                for (const [sname, strategy] of Object.entries(STRATEGIES)) {
                    const z = nz.deflateSync(input, { level, strategy });
                    expect(same(Z.unzlibSync(z, { verify: true }), input), `zlib l${level} ${sname}`).toBe(true);
                    const g = nz.gzipSync(input, { level, strategy });
                    expect(same(G.gunzipSync(g, { verify: true }), input), `gzip l${level} ${sname}`).toBe(true);
                }
            }
        });

        test(`${name}: window sizes 2^9 to 2^15`, () => {
            for (const windowBits of [9, 10, 12, 15]) {
                const z = nz.deflateSync(input, { windowBits });
                expect(same(Z.unzlibSync(z, { verify: true }), input), `windowBits ${windowBits}`).toBe(true);
            }
        });

        test(`${name}: a raw deflate stream`, () => {
            expect(same(d.inflateSync(nz.deflateRawSync(input)), input)).toBe(true);
        });
    }

    test('a preset dictionary (FDICT)', () => {
        const dictionary = new TextEncoder().encode('The quick brown fox');
        const z = nz.deflateSync(INPUTS.text, { dictionary });
        expect(same(Z.unzlibSync(z, { dictionary, verify: true }), INPUTS.text)).toBe(true);
    });

    test('node output streamed through fw in small chunks', () => {
        const g = nz.gzipSync(INPUTS.text);
        const parts = [];
        const s = new G.GunzipStream({ verify: true }, (p) => parts.push(p));
        for (let i = 0; i < g.length; i += 7) s.push(g.subarray(i, i + 7), i + 7 >= g.length);
        expect(same(Buffer.concat(parts.map((p) => Buffer.from(p))), INPUTS.text)).toBe(true);
    });
});

describe('fw → node:zlib', () => {
    for (const [name, input] of Object.entries(INPUTS)) {
        test(`${name}: every fw level, zlib, gzip and raw deflate`, () => {
            for (const level of [0, 1, 6, 9]) {
                expect(same(nz.inflateSync(Z.zlibSync(input, { level })), input), `zlib l${level}`).toBe(true);
                expect(same(nz.gunzipSync(G.gzipSync(input, { level })), input), `gzip l${level}`).toBe(true);
                expect(same(nz.inflateRawSync(d.deflateSync(input, { level })), input), `raw l${level}`).toBe(true);
            }
        });
    }

    test('a preset dictionary (FDICT)', () => {
        const dictionary = new TextEncoder().encode('The quick brown fox');
        expect(same(nz.inflateSync(Z.zlibSync(INPUTS.text, { dictionary }), { dictionary }), INPUTS.text)).toBe(true);
    });
});

// ── T6.5: gzip members (RFC 1952 § 2.2) ──────────────────────────────────

describe('multi-member gzip, against node:zlib', () => {
    const A = new TextEncoder().encode('first member, longer than the others. '.repeat(30));
    const B = new TextEncoder().encode('2nd');
    const C = INPUTS.pseudoRandom.subarray(0, 5000);
    const members = (...parts) => Buffer.concat(parts.map((p) => nz.gzipSync(p)));
    const cat = (...parts) => Buffer.concat(parts.map((p) => Buffer.from(p)));
    const streamAll = (bytes, size, opts = {}) => {
        const parts = [];
        let finals = 0;
        const s = new G.GunzipStream(opts, (p, fin) => { parts.push(p); if (fin) finals++; });
        for (let i = 0; i < bytes.length; i += size) s.push(bytes.subarray(i, i + size), i + size >= bytes.length);
        return { out: cat(...parts), finals };
    };

    test('gunzipSync decodes every member, in order (long + short, short + long, three)', () => {
        for (const order of [[A, B], [B, A], [A, B, C], [C, C, C]]) {
            const gz = members(...order);
            expect(same(G.gunzipSync(gz, { verify: true }), nz.gunzipSync(gz))).toBe(true);
            expect(same(G.gunzipSync(gz), cat(...order))).toBe(true);
        }
    });

    test('a caller out buffer receives the whole output; too small throws code 8', () => {
        const gz = members(A, B);
        const out = new Uint8Array(A.length + B.length);
        expect(same(G.gunzipSync(gz, { out }), cat(A, B))).toBe(true);
        let code;
        try { G.gunzipSync(gz, { out: new Uint8Array(A.length) }); } catch (e) { code = e.errno; }
        expect(code).toBe(8);
    });

    test('verify checks each member: a bad second trailer throws code 16', () => {
        const gz = Buffer.from(members(A, B));
        gz[gz.length - 8] ^= 1;
        let code;
        try { G.gunzipSync(gz, { verify: true }); } catch (e) { code = e.errno; }
        expect(code).toBe(16);
    });

    test('trailing zero bytes are ignored, other trailing bytes throw code 6, a cut member code 0', () => {
        const gz = members(A, B);
        expect(same(G.gunzipSync(cat(gz, new Uint8Array(5))), cat(A, B))).toBe(true);
        let c6, c0;
        try { G.gunzipSync(cat(gz, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))); } catch (e) { c6 = e.errno; }
        expect(c6).toBe(6);
        try { G.gunzipSync(cat(nz.gzipSync(A), nz.gzipSync(C).subarray(0, 40))); } catch (e) { c0 = e.errno; }
        expect(c0).toBe(0);
    });

    test('GunzipStream decodes every member at any chunking, one final ondata', () => {
        const gz = members(A, B, C);
        for (const size of [1, 2, 7, 10, 64, 1000, gz.length]) {
            const { out, finals } = streamAll(gz, size, { verify: true });
            expect(same(out, cat(A, B, C)), `chunk ${size}`).toBe(true);
            expect(finals).toBe(1);
        }
    });

    test('GunzipStream: trailing zeros ignored; flush() after a member without its trailer', () => {
        expect(same(streamAll(cat(members(A, B), new Uint8Array(3)), 5).out, cat(A, B))).toBe(true);
        const parts = [];
        const s = new G.GunzipStream({}, (p) => parts.push(p));
        const noTrailer = cat(nz.gzipSync(A), nz.gzipSync(B).subarray(0, -8));
        s.push(noTrailer, false);
        s.flush();
        expect(same(cat(...parts), cat(A, B))).toBe(true);
    });
});
