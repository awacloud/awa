// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The zlib, gzip and zip decoders check the integrity trailer (Adler-32,
// CRC-32 + ISIZE, each entry's CRC-32 + size) against what was decoded, by
// default since the pre-1.0 set (D8 (a)); `verify: false` skips it.

import { describe, test, expect } from 'bun:test';
import { deflate } from './deflate.js';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 } from './lz77.js';
import { zlib } from './zlib.js';
import { gzip } from './gzip.js';
import { zip } from './zip.js';
import { adler32 } from '../calc/adler32.js';
import { crc32 } from '../calc/crc32.js';

const bs = bitstream.factory();
const d = deflate.factory(bs, huffman.factory(bs), lz77.factory());
const Z = zlib.factory(d, adler32.factory());
const G = gzip.factory(d, crc32.factory());
const P = zip.factory(d, crc32.factory());

const TEXT = new TextEncoder().encode('integrity trailers, checked on request. '.repeat(40));

const codeOf = (fn) => { try { fn(); return 'no throw'; } catch (e) { return e.errno ?? e.code; } };
const flip = (bytes, at) => { const c = bytes.slice(); c[at < 0 ? c.length + at : at] ^= 0x01; return c; };

/** Feed `bytes` to a stream in chunks of `size`, return the concatenated output. */
function streamDecode(Ctor, opts, bytes, size) {
    const parts = [];
    const s = new Ctor(opts, (data) => { parts.push(data); });
    for (let i = 0; i < bytes.length; i += size) {
        s.push(bytes.subarray(i, i + size), i + size >= bytes.length);
    }
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
}

describe('integrity — zlib (Adler-32)', () => {
    const frame = Z.zlibSync(TEXT);

    test('a well-formed frame decodes the same with or without verify', () => {
        expect(Z.unzlibSync(frame, { verify: true })).toEqual(TEXT);
        expect(Z.unzlibSync(frame)).toEqual(TEXT);
    });

    test('a corrupted Adler-32 throws code 16, by default too; verify: false accepts it', () => {
        const bad = flip(frame, -1);
        expect(codeOf(() => Z.unzlibSync(bad, { verify: true }))).toBe(16);
        expect(() => Z.unzlibSync(bad, { verify: true })).toThrow('incorrect data check');
        // the default checks (D8 (a)); verify: false skips the trailer
        expect(codeOf(() => Z.unzlibSync(bad))).toBe(16);
        expect(Z.unzlibSync(bad, { verify: false })).toEqual(TEXT);
    });

    test('with a dictionary', () => {
        const dictionary = new TextEncoder().encode('integrity trailers');
        const f = Z.zlibSync(TEXT, { dictionary });
        expect(Z.unzlibSync(f, { dictionary, verify: true })).toEqual(TEXT);
        expect(codeOf(() => Z.unzlibSync(flip(f, -2), { dictionary, verify: true }))).toBe(16);
    });

    test('the header plus 0-4 bytes throws code 0 (BL-2193), by default too; empty with verify: false', () => {
        for (let extra = 0; extra <= 4; extra++) {
            const short = frame.subarray(0, 2 + extra);
            expect(codeOf(() => Z.unzlibSync(short, { verify: true }))).toBe(0);
            expect(codeOf(() => Z.unzlibSync(short))).toBe(0);
        }
        expect(Z.unzlibSync(frame.subarray(0, 2), { verify: false })).toEqual(new Uint8Array(0));
    });

    test('an empty input round-trips with verify', () => {
        expect(Z.unzlibSync(Z.zlibSync(new Uint8Array(0)), { verify: true })).toEqual(new Uint8Array(0));
    });

    test('UnzlibStream checks the trailer at the final chunk, whatever the chunking', () => {
        for (const size of [1, 3, 7, 64, frame.length]) {
            expect(streamDecode(Z.UnzlibStream, { verify: true }, frame, size)).toEqual(TEXT);
            expect(() => streamDecode(Z.UnzlibStream, { verify: true }, flip(frame, -1), size)).toThrow('incorrect data check');
        }
        expect(() => streamDecode(Z.UnzlibStream, {}, flip(frame, -1), 7)).toThrow('incorrect data check');
        expect(streamDecode(Z.UnzlibStream, { verify: false }, flip(frame, -1), 7)).toEqual(TEXT);
    });

    test('the async twin honours verify', async () => {
        const err = await Z.unzlib(flip(frame, -1), { verify: true }).then(() => null, (e) => e);
        expect(err && err.errno).toBe(16);
        expect(await Z.unzlib(frame, { verify: true })).toEqual(TEXT);
    });
});

describe('integrity — gzip (CRC-32 and ISIZE)', () => {
    const member = G.gzipSync(TEXT);

    test('a well-formed member decodes the same with or without verify', () => {
        expect(G.gunzipSync(member, { verify: true })).toEqual(TEXT);
        expect(G.gunzipSync(member)).toEqual(TEXT);
    });

    test('a corrupted CRC-32 or ISIZE throws code 16, by default too; verify: false accepts both', () => {
        const badCrc = flip(member, -8);
        const badSize = flip(member, -1);
        expect(codeOf(() => G.gunzipSync(badCrc, { verify: true }))).toBe(16);
        expect(codeOf(() => G.gunzipSync(badSize, { verify: true, out: new Uint8Array(TEXT.length) }))).toBe(16);
        expect(codeOf(() => G.gunzipSync(badCrc))).toBe(16);
        expect(codeOf(() => G.gunzipSync(badSize, { out: new Uint8Array(TEXT.length) }))).toBe(16);
        expect(G.gunzipSync(badCrc, { verify: false })).toEqual(TEXT);
        expect(G.gunzipSync(badSize, { verify: false, out: new Uint8Array(TEXT.length) })).toEqual(TEXT);
        expect(() => streamDecode(G.GunzipStream, {}, badCrc, 16)).toThrow('incorrect data check');
        expect(streamDecode(G.GunzipStream, { verify: false }, badCrc, 16)).toEqual(TEXT);
    });

    test('GunzipStream checks the trailer at the final chunk, whatever the chunking', () => {
        // A header split across chunks is covered below (1-byte chunks up).
        for (const size of [10, 16, 64, member.length]) {
            expect(streamDecode(G.GunzipStream, { verify: true }, member, size)).toEqual(TEXT);
            expect(() => streamDecode(G.GunzipStream, { verify: true }, flip(member, -8), size)).toThrow('incorrect data check');
        }
    });

    test('the async twin honours verify', async () => {
        const err = await G.gunzip(flip(member, -8), { verify: true }).then(() => null, (e) => e);
        expect(err && err.errno).toBe(16);
        expect(await G.gunzip(member, { verify: true })).toEqual(TEXT);
    });
});

describe('integrity — zip (each entry: CRC-32 and size)', () => {
    const files = { 'a.txt': TEXT, 'dir/b.bin': new Uint8Array([1, 2, 3, 4, 5]) };

    test('well-formed archives (deflated and stored) decode the same with or without verify', () => {
        for (const level of [0, 6]) {
            const archive = P.zipSync(files, { level });
            const a = P.unzipSync(archive, { verify: true });
            expect(a['a.txt']).toEqual(TEXT);
            expect(a['dir/b.bin']).toEqual(files['dir/b.bin']);
            expect(P.unzipSync(archive)['a.txt']).toEqual(TEXT);
        }
    });

    test('a changed byte in a stored entry throws code 16, by default too; verify: false accepts it', () => {
        const archive = P.zipSync({ 'a.txt': TEXT }, { level: 0 });
        const at = 30 + 'a.txt'.length + 5;   // a content byte of the stored entry
        const bad = flip(archive, at);
        expect(codeOf(() => P.unzipSync(bad, { verify: true }))).toBe(16);
        expect(() => P.unzipSync(bad, { verify: true })).toThrow('incorrect data check');
        expect(codeOf(() => P.unzipSync(bad))).toBe(16);
        expect(P.unzipSync(bad, { verify: false })['a.txt']).not.toEqual(TEXT);
    });
});

// ── T6.2b: headers split across chunks, flush() without a trailer ─────────

/** A gzip member with every optional header field (FEXTRA, FNAME, FCOMMENT, FHCRC). */
function fullHeaderMember(payload) {
    const raw = d.deflateSync(payload);
    const c = new (crc32.factory())();
    c.append(payload);
    const crc = c.get();
    const head = [0x1F, 0x8B, 0x08, 0x04 | 0x08 | 0x10 | 0x02, 0, 0, 0, 0, 0, 3,
        4, 0, 0x41, 0x42, 0x43, 0x44,          // FEXTRA: XLEN = 4, 4 bytes
        0x61, 0x2E, 0x74, 0x78, 0x74, 0,       // FNAME "a.txt"
        0x63, 0x6F, 0x6D, 0,                   // FCOMMENT "com"
        0x12, 0x34];                           // FHCRC (not checked)
    const n = payload.length >>> 0;
    const tail = [crc & 0xFF, (crc >>> 8) & 0xFF, (crc >>> 16) & 0xFF, crc >>> 24,
        n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, n >>> 24];
    const out = new Uint8Array(head.length + raw.length + 8);
    out.set(head, 0);
    out.set(raw, head.length);
    out.set(tail, head.length + raw.length);
    return out;
}

describe('stream headers split across chunks', () => {
    test('GunzipStream decodes a plain member at every chunk size from 1 to 12', () => {
        const member = G.gzipSync(TEXT);
        for (let size = 1; size <= 12; size++) {
            expect(streamDecode(G.GunzipStream, { verify: true }, member, size)).toEqual(TEXT);
        }
    });

    test('GunzipStream decodes a member with FEXTRA, FNAME, FCOMMENT and FHCRC at every chunk size', () => {
        const member = fullHeaderMember(TEXT);
        expect(G.gunzipSync(member, { verify: true })).toEqual(TEXT);
        for (let size = 1; size <= 40; size++) {
            expect(streamDecode(G.GunzipStream, { verify: true }, member, size)).toEqual(TEXT);
        }
    });

    test('UnzlibStream decodes a dictionary frame (6-byte header) at every chunk size', () => {
        const dictionary = new TextEncoder().encode('integrity trailers');
        const frame = Z.zlibSync(TEXT, { dictionary });
        for (let size = 1; size <= 10; size++) {
            expect(streamDecode(Z.UnzlibStream, { dictionary, verify: true }, frame, size)).toEqual(TEXT);
        }
    });

    test('a truncated header with final still throws code 6', () => {
        const s = new G.GunzipStream({}, () => {});
        expect(codeOf(() => s.push(G.gzipSync(TEXT).subarray(0, 7), true))).toBe(6);
        const member = fullHeaderMember(TEXT);
        const t = new G.GunzipStream({}, () => {});
        expect(codeOf(() => t.push(member.subarray(0, 20), true))).toBe(6);
    });
});

describe('flush(): no trailer expected', () => {
    function collect() {
        const parts = [];
        const sink = (data) => { parts.push(data); };
        const joined = () => {
            const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
            let o = 0;
            for (const p of parts) { out.set(p, o); o += p.length; }
            return out;
        };
        return { sink, joined };
    }

    test('UnzlibStream: a frame without its trailer gives every byte back after flush()', () => {
        const noTrailer = Z.zlibSync(TEXT).subarray(0, -4);
        for (const size of [1, 7, 64, noTrailer.length]) {
            const c = collect();
            const s = new Z.UnzlibStream({}, c.sink);
            for (let i = 0; i < noTrailer.length; i += size) s.push(noTrailer.subarray(i, i + size), false);
            expect(c.joined().length).toBeLessThan(TEXT.length + 1);
            s.flush();
            expect(c.joined()).toEqual(TEXT);
            expect(codeOf(() => s.push(new Uint8Array([0]), true))).toBe(4);
        }
    });

    test('GunzipStream: a member without its trailer gives every byte back after flush()', () => {
        const noTrailer = G.gzipSync(TEXT).subarray(0, -8);
        const c = collect();
        const s = new G.GunzipStream({}, c.sink);
        for (let i = 0; i < noTrailer.length; i += 9) s.push(noTrailer.subarray(i, i + 9), false);
        s.flush();
        expect(c.joined()).toEqual(TEXT);
        expect(codeOf(() => s.push(new Uint8Array([0]), true))).toBe(4);
    });

    test('a truncated deflate stream gives back what decodes, without throwing', () => {
        const cut = Z.zlibSync(TEXT, { level: 0 }).subarray(0, 900);
        const c = collect();
        const s = new Z.UnzlibStream({}, c.sink);
        s.push(cut, false);
        expect(() => s.flush()).not.toThrow();
        const got = c.joined();
        expect(got.length).toBeGreaterThan(800);
        expect(got).toEqual(TEXT.subarray(0, got.length));
    });
});

// ── T6.3: an entry named "__proto__" never sets the result prototype ──────

describe('zip: an entry named "__proto__"', () => {
    test('becomes an own property of a null-prototype result (D9 G7)', () => {
        const files = {};
        Object.defineProperty(files, '__proto__', { value: new Uint8Array([7, 7]), enumerable: true });
        files['b.txt'] = new Uint8Array([1]);
        const out = P.unzipSync(P.zipSync(files), { verify: true });
        expect(Object.getPrototypeOf(out)).toBe(null);
        expect(Object.getOwnPropertyDescriptor(out, '__proto__').value).toEqual(new Uint8Array([7, 7]));
        expect(Object.keys(out).sort()).toEqual(['__proto__', 'b.txt']);
    });
});
