// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'node:zlib';
import { deflate } from './deflate.js';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 } from './lz77.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const _bs = bitstream.factory();
const _hf = huffman.factory(_bs);
const _lz = lz77.factory();

/** Shared factory instance for the RFC-conformance blocks below. */
const _api = deflate.factory(_bs, _hf, _lz);

// --- Oracle (zlib through Bun) -------------------------------------------

const RAW = { windowBits: -15 };            // raw DEFLATE, no zlib wrapper
const oracleDeflate = (u8, level = 6) => new Uint8Array(Bun.deflateSync(u8, { ...RAW, level }));
const oracleInflate = (u8) => new Uint8Array(Bun.inflateSync(u8, RAW));

// --- Corpora (mirrors the deflate benchmark harness set) ------------------

/** English-ish text: the RFC 7932 Appendix A blob, 122 784 bytes. */
const TEXT = new Uint8Array(fs.readFileSync(path.join(__dirname, 'brotli_dict.bin')));

/** Structured, highly repetitive JSON. */
const JSON_CORPUS = new TextEncoder().encode(
    JSON.stringify({ id: 1, tags: ['a', 'b', 'c'], body: 'x'.repeat(120) }).repeat(400),
);

/** Deterministic pseudo-random bytes (incompressible; no `Math.random`). */
function randomCorpus(n, seed = 0x2545F491) {
    const out = new Uint8Array(n);
    let s = seed >>> 0;
    for (let i = 0; i < n; ++i) {
        s = (s ^ (s << 13)) >>> 0;
        s = (s ^ (s >>> 17)) >>> 0;
        s = (s ^ (s << 5)) >>> 0;
        out[i] = s & 0xFF;
    }
    return out;
}

const RANDOM = randomCorpus(30000);
/** 40 000 bytes: matches reach further back than the 32 KiB window bound. */
const REPEAT = new Uint8Array(40000).map((_, i) => 97 + (i % 11));
/** 70 000 bytes: forces the encoder across its internal block boundaries. */
const BIG = new Uint8Array(70000).map((_, i) => (i * 31 + 7) & 0xFF);

const CORPORA = [
    ['text', TEXT],
    ['json', JSON_CORPUS],
    ['random', RANDOM],
    ['repeat', REPEAT],
    ['empty', new Uint8Array(0)],
    ['one byte', new Uint8Array([0x5A])],
    ['70 000 bytes', BIG],
    ['40 000-byte window-crossing repeat', REPEAT],
];

// --- Bit-level assembler for hand-built RFC 1951 vectors -------------------

/**
 * Minimal DEFLATE bit writer. `raw` writes plain values LSB-first (§3.1.1
 * "data elements other than Huffman codes"); `code` writes Huffman codes
 * starting with their most significant bit.
 */
function bitBuf(size = 4096) {
    return {
        buf: new Uint8Array(size),
        pos: 0,
        raw(v, n) {
            for (let i = 0; i < n; ++i) {
                if ((v >>> i) & 1) this.buf[(this.pos + i) >> 3] |= 1 << ((this.pos + i) & 7);
            }
            this.pos += n;
        },
        code(v, n) {
            for (let i = n - 1; i >= 0; --i) {
                if ((v >>> i) & 1) this.buf[this.pos >> 3] |= 1 << (this.pos & 7);
                ++this.pos;
            }
        },
        bytes() { return this.buf.subarray(0, (this.pos + 7) >> 3); },
    };
}

/** Emit the fixed literal/length code of `symbol` (RFC 1951 §3.2.6). */
function fixedLit(w, symbol) {
    if (symbol < 144) w.code(0x30 + symbol, 8);
    else if (symbol < 256) w.code(0x190 + symbol - 144, 9);
    else if (symbol < 280) w.code(symbol - 256, 7);
    else w.code(0xC0 + symbol - 280, 8);
}

/** Emit a non-final stored block carrying `data` verbatim (RFC 1951 §3.2.4). */
function storedBlock(w, data) {
    w.raw(0, 1);
    w.raw(0, 2);
    w.pos = (w.pos + 7) & ~7;
    const off = w.pos >> 3;
    w.buf[off] = data.length & 0xFF;
    w.buf[off + 1] = (data.length >> 8) & 0xFF;
    w.buf[off + 2] = ~data.length & 0xFF;
    w.buf[off + 3] = (~data.length >> 8) & 0xFF;
    w.buf.set(data, off + 4);
    w.pos = (off + 4 + data.length) * 8;
}

// --- RFC 1951 §3.2.5 tables, transcribed literally -------------------------

const RFC_LENGTH_EXTRA = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const RFC_LENGTH_BASE = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const RFC_DIST_EXTRA = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const RFC_DIST_BASE = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const RFC_CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** 32 KiB of distinguishable history, primed through a stored block. */
const HISTORY = new Uint8Array(32768).map((_, i) => (i * 7 + 3) & 0xFF);

/** `e.code` of the error thrown by `fn`, or `null` when it does not throw. */
function errorCode(fn) {
    try { fn(); return null; } catch (e) { return e.code; }
}

describe('deflate module', () => {

    test('oracle pin: zlib round-trips raw DEFLATE through Bun', () => {
        const sample = new TextEncoder().encode('oracle pin '.repeat(50));
        expect(oracleInflate(oracleDeflate(sample))).toEqual(sample);
        expect(oracleInflate(oracleDeflate(sample, 0))).toEqual(sample);
        expect(oracleInflate(oracleDeflate(sample, 9))).toEqual(sample);
    });

    test('has correct module metadata', () => {
        expect(deflate.name).toBe('deflate');
        expect(deflate.dependencies).toEqual(['bitstream', 'huffman', 'lz77']);
        expect(typeof deflate.factory).toBe('function');
    });

    describe('factory', () => {
        const d = deflate.factory(_bs, _hf, _lz);

        test('returns expected methods', () => {
            expect(typeof d.deflateSync).toBe('function');
            expect(typeof d.inflateSync).toBe('function');
            expect(typeof d.deflate).toBe('function');
            expect(typeof d.inflate).toBe('function');
            expect(typeof d.DeflateStream).toBe('function');
            expect(typeof d.InflateStream).toBe('function');
        });

        describe('deflateSync / inflateSync', () => {
            test('round-trip: empty buffer', () => {
                const data = new Uint8Array(0);
                const compressed = d.deflateSync(data);
                const restored = d.inflateSync(compressed);
                expect(restored).toEqual(data);
            });

            test('round-trip: small ASCII string', () => {
                const data = new TextEncoder().encode('Hello, World!');
                const compressed = d.deflateSync(data);
                expect(compressed.length).toBeGreaterThan(0);
                const restored = d.inflateSync(compressed);
                expect(restored).toEqual(data);
            });

            test('round-trip: repetitive data compresses well', () => {
                const data = new Uint8Array(1000).fill(65); // 1000 'A's
                const compressed = d.deflateSync(data);
                expect(compressed.length).toBeLessThan(data.length);
                const restored = d.inflateSync(compressed);
                expect(restored).toEqual(data);
            });

            test('round-trip: random-looking data', () => {
                const data = new Uint8Array(512);
                for (let i = 0; i < data.length; ++i) data[i] = (i * 37 + 13) & 0xFF;
                const compressed = d.deflateSync(data);
                const restored = d.inflateSync(compressed);
                expect(restored).toEqual(data);
            });

            test('round-trip: level 0 (store)', () => {
                const data = new TextEncoder().encode('store this');
                const compressed = d.deflateSync(data, { level: 0 });
                const restored = d.inflateSync(compressed);
                expect(restored).toEqual(data);
            });

            test('round-trip: level 9 (max compression)', () => {
                const data = new TextEncoder().encode('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
                const compressed = d.deflateSync(data, { level: 9 });
                const restored = d.inflateSync(compressed);
                expect(restored).toEqual(data);
            });

            test('inflateSync with pre-allocated output buffer', () => {
                const data = new TextEncoder().encode('pre-allocated output test');
                const compressed = d.deflateSync(data);
                const out = new Uint8Array(data.length);
                const restored = d.inflateSync(compressed, { out });
                expect(restored).toEqual(data);
            });
        });

        describe('deflate / inflate (async)', () => {
            test('round-trip async', async () => {
                const data = new TextEncoder().encode('async round-trip');
                const compressed = await d.deflate(data);
                const restored = await d.inflate(compressed);
                expect(restored).toEqual(data);
            });

            test('async result matches sync result', async () => {
                const data = new TextEncoder().encode('consistency check');
                const syncResult  = d.deflateSync(data);
                const asyncResult = await d.deflate(data);
                expect(asyncResult).toEqual(syncResult);
            });
        });

        describe('DeflateStream / InflateStream', () => {
            test('streaming compress then decompress', () => {
                const data = new TextEncoder().encode('streaming data chunk by chunk');
                const chunks = [];
                const stream = new d.DeflateStream({ level: 6 }, (chunk, final) => {
                    chunks.push(chunk);
                });
                stream.push(data.subarray(0, 10));
                stream.push(data.subarray(10), true);

                const compressed = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
                let off = 0;
                for (const c of chunks) { compressed.set(c, off); off += c.length; }

                const restored = d.inflateSync(compressed);
                expect(restored).toEqual(data);
            });

            test('InflateStream decompresses chunks', () => {
                const data = new TextEncoder().encode('inflate stream test');
                const compressed = d.deflateSync(data);
                const restored = [];
                const stream = new d.InflateStream(chunk => {
                    restored.push(...chunk);
                });
                stream.push(compressed.subarray(0, 5));
                stream.push(compressed.subarray(5), true);
                expect(new Uint8Array(restored)).toEqual(data);
            });
        });
    });

    // --- Decoder written from RFC 1951 (fw/BATCH_32 task 02) --------------

    describe('RFC 1951 tables', () => {

        test('§3.2.5 — the length derivation reproduces the RFC table', () => {
            const extra = [];
            for (let i = 0; i < 29; ++i) extra.push(i < 8 || i === 28 ? 0 : (i - 4) >> 2);
            const base = [3];
            for (let i = 1; i < 29; ++i) base.push(base[i - 1] + (1 << extra[i - 1]));
            base[28] = 258;
            expect(extra).toEqual(RFC_LENGTH_EXTRA);
            expect(base).toEqual(RFC_LENGTH_BASE);
        });

        test('§3.2.5 — the distance derivation reproduces the RFC table', () => {
            const extra = [];
            for (let i = 0; i < 30; ++i) extra.push(i < 4 ? 0 : (i - 2) >> 1);
            const base = [1];
            for (let i = 1; i < 30; ++i) base.push(base[i - 1] + (1 << extra[i - 1]));
            expect(extra).toEqual(RFC_DIST_EXTRA);
            expect(base).toEqual(RFC_DIST_BASE);
        });

        test('§3.2.5 — decodes every length symbol 257..285 at both ends of its range', () => {
            for (let i = 0; i < 29; ++i) {
                const maxExtra = i === 27 ? 30 : (1 << RFC_LENGTH_EXTRA[i]) - 1;
                for (const extraValue of [0, maxExtra]) {
                    const w = bitBuf(64);
                    w.raw(1, 1);                       // BFINAL
                    w.raw(1, 2);                       // BTYPE = 1 (fixed)
                    fixedLit(w, 0x41);                 // one literal to copy from
                    fixedLit(w, 257 + i);
                    if (RFC_LENGTH_EXTRA[i]) w.raw(extraValue, RFC_LENGTH_EXTRA[i]);
                    w.code(0, 5);                      // distance symbol 0 → distance 1
                    fixedLit(w, 256);
                    const out = _api.inflateSync(w.bytes());
                    const expected = 1 + RFC_LENGTH_BASE[i] + extraValue;
                    expect([i, extraValue, out.length]).toEqual([i, extraValue, expected]);
                    expect(out.every(b => b === 0x41)).toBe(true);
                }
            }
        });

        test('§3.2.5 — decodes every distance symbol 0..29 at both ends of its range', () => {
            for (let i = 0; i < 30; ++i) {
                const maxExtra = (1 << RFC_DIST_EXTRA[i]) - 1;
                for (const extraValue of [0, maxExtra]) {
                    const distance = RFC_DIST_BASE[i] + extraValue;
                    const w = bitBuf(HISTORY.length + 64);
                    storedBlock(w, HISTORY);           // prime 32 KiB of history
                    w.raw(1, 1);
                    w.raw(1, 2);
                    fixedLit(w, 257);                  // length 3
                    w.code(i, 5);                      // fixed distance code = symbol
                    if (RFC_DIST_EXTRA[i]) w.raw(extraValue, RFC_DIST_EXTRA[i]);
                    fixedLit(w, 256);

                    const expected = new Uint8Array(HISTORY.length + 3);
                    expected.set(HISTORY);
                    for (let p = HISTORY.length; p < expected.length; ++p) {
                        expected[p] = expected[p - distance];
                    }
                    const out = _api.inflateSync(w.bytes());
                    expect([i, distance, out.length]).toEqual([i, distance, expected.length]);
                    expect(out.subarray(HISTORY.length)).toEqual(expected.subarray(HISTORY.length));
                }
            }
        });

        test('§3.2.7 — the code-length order places lengths on the right symbols', () => {
            expect(RFC_CODE_LENGTH_ORDER.indexOf(18)).toBe(2);
            expect(RFC_CODE_LENGTH_ORDER.indexOf(1)).toBe(17);

            const w = bitBuf(64);
            w.raw(1, 1);            // BFINAL
            w.raw(2, 2);            // BTYPE = 2 (dynamic)
            w.raw(0, 5);            // HLIT  → 257 literal/length codes
            w.raw(0, 5);            // HDIST → 1 distance code
            w.raw(14, 4);           // HCLEN → 18 code-length code lengths
            // Only code-length symbols 1 and 18 are used, one bit each: their
            // lengths must land at CODE_LENGTH_ORDER positions 17 and 2.
            const clLengths = new Array(18).fill(0);
            clLengths[2] = 1;
            clLengths[17] = 1;
            for (const v of clLengths) w.raw(v, 3);
            const CL_ONE = 0, CL_ZEROS = 1;   // canonical 1-bit codes
            w.code(CL_ZEROS, 1); w.raw(54, 7);    // 65 zeros → literals 0..64
            w.code(CL_ONE, 1);                     // literal 65 ('A') → length 1
            w.code(CL_ZEROS, 1); w.raw(127, 7);   // 138 zeros
            w.code(CL_ZEROS, 1); w.raw(41, 7);    // 52 zeros → literals 66..255
            w.code(CL_ONE, 1);                     // symbol 256 → length 1
            w.code(CL_ONE, 1);                     // distance code 0 → length 1
            w.code(0, 1);                          // 'A'
            w.code(1, 1);                          // end of block

            expect(_api.inflateSync(w.bytes())).toEqual(new Uint8Array([0x41]));
        });

        test('§3.2.6 — the fixed literal code spans all four length ranges', () => {
            const w = bitBuf(64);
            w.raw(1, 1);
            w.raw(1, 2);
            for (const sym of [0, 143, 144, 255]) fixedLit(w, sym);
            fixedLit(w, 256);
            expect(_api.inflateSync(w.bytes())).toEqual(new Uint8Array([0, 143, 144, 255]));
        });
    });

    describe('hand-assembled RFC 1951 vectors', () => {

        test('stored empty final block `01 00 00 FF FF`', () => {
            expect(_api.inflateSync(new Uint8Array([0x01, 0x00, 0x00, 0xFF, 0xFF])))
                .toEqual(new Uint8Array(0));
        });

        test('fixed empty final block `03 00`', () => {
            expect(_api.inflateSync(new Uint8Array([0x03, 0x00]))).toEqual(new Uint8Array(0));
        });

        test('fixed block coding "a" — `4B 04 00`', () => {
            expect(_api.inflateSync(new Uint8Array([0x4B, 0x04, 0x00])))
                .toEqual(new Uint8Array([0x61]));
        });

        test('stored block coding "abc" — `01 03 00 FC FF 61 62 63`', () => {
            expect(_api.inflateSync(new Uint8Array([0x01, 0x03, 0x00, 0xFC, 0xFF, 0x61, 0x62, 0x63])))
                .toEqual(new TextEncoder().encode('abc'));
        });
    });

    describe('oracle-encoded, ours-decoded', () => {

        for (const [name, corpus] of CORPORA) {
            for (const level of [0, 1, 6, 9]) {
                test(`${name} at level ${level}`, () => {
                    const encoded = oracleDeflate(corpus, level);
                    expect(_api.inflateSync(encoded)).toEqual(corpus);
                });
            }
        }

        test('non-vacuity: level 9 on the text corpus emits a dynamic block', () => {
            const encoded = oracleDeflate(TEXT, 9);
            expect((encoded[0] >> 1) & 0b11).toBe(2);       // BTYPE = 2
            expect((oracleDeflate(TEXT, 0)[0] >> 1) & 0b11).toBe(0);   // BTYPE = 0
        });

        test('decodes into a caller-provided exact-size buffer', () => {
            const encoded = oracleDeflate(JSON_CORPUS, 6);
            const out = new Uint8Array(JSON_CORPUS.length);
            const decoded = _api.inflateSync(encoded, { out });
            expect(decoded).toEqual(JSON_CORPUS);
            expect(decoded.buffer).toBe(out.buffer);
        });
    });

    describe('decoder errors', () => {

        test('BTYPE 3 → code 1', () => {
            expect(errorCode(() => _api.inflateSync(new Uint8Array([0x07, 0x00, 0x00, 0x00]))))
                .toBe(1);
        });

        test('truncated oracle stream → code 0', () => {
            const encoded = oracleDeflate(TEXT.subarray(0, 4000), 9);
            expect(errorCode(() => _api.inflateSync(encoded.subarray(0, encoded.length - 3))))
                .toBe(0);
        });

        test('distance 1 at output position 0 → code 3', () => {
            // BFINAL=1, BTYPE=1, length symbol 257, distance symbol 0.
            expect(errorCode(() => _api.inflateSync(new Uint8Array([0x03, 0x02])))).toBe(3);
        });

        test('stored block LEN/NLEN mismatch → code 8', () => {
            expect(errorCode(() => _api.inflateSync(
                new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x61, 0x62, 0x63]),
            ))).toBe(8);
        });

        test('caller buffer one byte short → code 8', () => {
            const data = TEXT.subarray(0, 2000);
            const encoded = oracleDeflate(data, 6);
            expect(errorCode(() => _api.inflateSync(encoded, { out: new Uint8Array(data.length - 1) })))
                .toBe(8);
        });

        test('HLIT = 287 → code 8', () => {
            const w = bitBuf(16);
            w.raw(1, 1);        // BFINAL
            w.raw(2, 2);        // BTYPE = 2
            w.raw(30, 5);       // HLIT → 287 literal/length codes
            w.raw(0, 5);
            w.raw(0, 4);
            expect(errorCode(() => _api.inflateSync(w.bytes()))).toBe(8);
        });
    });

    describe('preset dictionary', () => {

        const dict = new TextEncoder().encode('the quick brown fox jumps over the lazy dog');
        const data = new TextEncoder().encode('the quick brown fox is quick and brown');
        const encoded = new Uint8Array(
            zlib.deflateRawSync(Buffer.from(data), { dictionary: Buffer.from(dict), level: 9 }),
        );

        test('decodes a dictionary-compressed stream', () => {
            expect(_api.inflateSync(encoded, { dictionary: dict })).toEqual(data);
        });

        test('rejects the same stream without the dictionary → code 3', () => {
            expect(errorCode(() => _api.inflateSync(encoded))).toBe(3);
        });

        test('dictionary + caller buffer copies the payload only', () => {
            const out = new Uint8Array(data.length);
            expect(_api.inflateSync(encoded, { dictionary: dict, out })).toEqual(data);
        });
    });

    describe('InflateStream resumability', () => {

        /** Drive `stream` over `encoded` in `step`-byte pushes; returns the output. */
        function drive(encoded, step) {
            const parts = [];
            let finals = 0;
            const stream = new _api.InflateStream((chunk, final) => {
                parts.push(chunk);
                if (final) ++finals;
            });
            for (let i = 0; i < encoded.length; i += step) {
                const end = Math.min(i + step, encoded.length);
                stream.push(encoded.subarray(i, end), end >= encoded.length);
            }
            const total = parts.reduce((s, c) => s + c.length, 0);
            const out = new Uint8Array(total);
            let off = 0;
            for (const c of parts) { out.set(c, off); off += c.length; }
            return { out, finals };
        }

        test('byte-by-byte pushes reconstruct the input', () => {
            const source = TEXT.subarray(0, 3000);
            const encoded = oracleDeflate(source, 9);
            const { out, finals } = drive(encoded, 1);
            expect(out).toEqual(source);
            expect(finals).toBe(1);
        });

        test('every cut point of a ~300-byte stream reconstructs the input', () => {
            const source = TEXT.subarray(0, 600);
            const encoded = oracleDeflate(source, 9);
            expect(encoded.length).toBeGreaterThan(200);
            for (let cut = 0; cut <= encoded.length; ++cut) {
                const parts = [];
                let finals = 0;
                const stream = new _api.InflateStream((chunk, final) => {
                    parts.push(chunk);
                    if (final) ++finals;
                });
                stream.push(encoded.subarray(0, cut), false);
                stream.push(encoded.subarray(cut), true);
                const total = parts.reduce((s, c) => s + c.length, 0);
                const out = new Uint8Array(total);
                let off = 0;
                for (const c of parts) { out.set(c, off); off += c.length; }
                expect([cut, out.length, finals]).toEqual([cut, source.length, 1]);
                expect(out).toEqual(source);
            }
        });

        test('64 KiB pushes over a 300 KiB input reconstruct it across the window', () => {
            const source = randomCorpus(300000, 0x1234ABCD);
            const encoded = oracleDeflate(source, 6);
            const { out, finals } = drive(encoded, 65536);
            expect(out).toEqual(source);
            expect(finals).toBe(1);
        });

        test('the retained window stays bounded on a long input', () => {
            const source = randomCorpus(300000, 0x1234ABCD);
            const encoded = oracleDeflate(source, 6);
            const stream = new _api.InflateStream(() => {});
            for (let i = 0; i < encoded.length; i += 65536) {
                const end = Math.min(i + 65536, encoded.length);
                stream.push(encoded.subarray(i, end), end >= encoded.length);
            }
            // Only the last 32 KiB are kept between pushes, whatever the total.
            expect(stream._state.outLen).toBeLessThanOrEqual(32768);
        });

        test('a match reaching 30 000 bytes back survives the window trim', () => {
            const head = randomCorpus(50000, 0x5EED1234);
            const source = new Uint8Array(head.length + 5000);
            source.set(head);
            source.set(head.subarray(20000, 25000), head.length);   // distance 30 000
            const encoded = oracleDeflate(source, 9);
            // Non-vacuity: without the long-distance match the same shape is
            // ~4 900 bytes larger, so the oracle really emitted one.
            const control = new Uint8Array(head.length + 5000);
            control.set(head);
            control.set(randomCorpus(5000, 0x0BADF00D), head.length);
            expect(oracleDeflate(control, 9).length - encoded.length).toBeGreaterThan(4000);

            const { out } = drive(encoded, 1024);
            expect(out).toEqual(source);
        });

        test('a stored-block stream resumes across pushes', () => {
            const source = randomCorpus(70000, 0x77777777);
            const { out } = drive(oracleDeflate(source, 0), 997);
            expect(out).toEqual(source);
        });

        test('push after the final chunk → code 4', () => {
            const encoded = oracleDeflate(new TextEncoder().encode('after final'), 6);
            const stream = new _api.InflateStream(() => {});
            stream.push(encoded, true);
            expect(errorCode(() => stream.push(new Uint8Array(0), false))).toBe(4);
        });

        test('push without an ondata handler → code 5', () => {
            const stream = new _api.InflateStream();
            expect(errorCode(() => stream.push(new Uint8Array([0x03, 0x00]), true))).toBe(5);
        });

        test('truncated input closed with final → code 0', () => {
            const encoded = oracleDeflate(TEXT.subarray(0, 4000), 9);
            const stream = new _api.InflateStream(() => {});
            expect(errorCode(() => stream.push(encoded.subarray(0, 40), true))).toBe(0);
        });

        test('a preset dictionary primes the streaming window', () => {
            const dict = new TextEncoder().encode('streaming dictionary payload ');
            const data = new TextEncoder().encode('streaming dictionary payload repeated once more');
            const encoded = new Uint8Array(
                zlib.deflateRawSync(Buffer.from(data), { dictionary: Buffer.from(dict), level: 9 }),
            );
            const parts = [];
            const stream = new _api.InflateStream({ dictionary: dict }, chunk => parts.push(chunk));
            for (let i = 0; i < encoded.length; ++i) {
                stream.push(encoded.subarray(i, i + 1), i === encoded.length - 1);
            }
            const total = parts.reduce((s, c) => s + c.length, 0);
            const out = new Uint8Array(total);
            let off = 0;
            for (const c of parts) { out.set(c, off); off += c.length; }
            expect(out).toEqual(data);
        });
    });

    // --- Encoder written from RFC 1951 (fw/BATCH_32 task 03) --------------

    describe('ours-encoded', () => {

        /** Corpora the encoder must survive at every level (plan task 03). */
        const ENCODE_CORPORA = [
            ['empty', new Uint8Array(0)],
            ['one byte', new Uint8Array([0x5A])],
            ['Hello, World!', new TextEncoder().encode('Hello, World!')],
            ['text', TEXT],
            ['json', JSON_CORPUS],
            ['random 64 KiB', randomCorpus(65536, 0x13579BDF)],
            ['100 000 × A', new Uint8Array(100000).fill(0x41)],
            ['70 000 bytes (crosses BLOCK_TOKENS)', BIG],
            ['40 000-byte window-crossing repeat', REPEAT],
        ];

        for (const [name, corpus] of ENCODE_CORPORA) {
            for (let level = 0; level <= 9; ++level) {
                test(`${name} at level ${level} round-trips through ours and the oracle`, () => {
                    const encoded = _api.deflateSync(corpus, { level });
                    expect(_api.inflateSync(encoded)).toEqual(corpus);
                    expect(oracleInflate(encoded)).toEqual(corpus);
                });
            }
        }

        test('an empty input is one empty FINAL fixed block — `03 00`', () => {
            expect(_api.deflateSync(new Uint8Array(0))).toEqual(new Uint8Array([0x03, 0x00]));
        });
    });

    describe('encoder block-type selection', () => {

        /** BTYPE of the first block of `encoded` (RFC 1951 §3.2.3). */
        const firstBlockType = (encoded) => (encoded[0] >> 1) & 0b11;

        test("'Hello' at level 6 → BTYPE 1 (fixed)", () => {
            expect(firstBlockType(_api.deflateSync(new TextEncoder().encode('Hello'), { level: 6 }))).toBe(1);
        });

        test('random 10 KiB at level 6 → BTYPE 0 (stored)', () => {
            const data = randomCorpus(10240, 0x0F0F0F0F);
            const encoded = _api.deflateSync(data, { level: 6 });
            expect(firstBlockType(encoded)).toBe(0);
            expect(oracleInflate(encoded)).toEqual(data);
        });

        test('the text corpus at level 6 → BTYPE 2 (dynamic)', () => {
            expect(firstBlockType(_api.deflateSync(TEXT, { level: 6 }))).toBe(2);
        });

        test('2 KiB of random bytes at level 9 is never worse than level 0', () => {
            const data = randomCorpus(2048, 0x2BAD1DEA);
            const nine = _api.deflateSync(data, { level: 9 });
            const zero = _api.deflateSync(data, { level: 0 });
            expect(oracleInflate(nine)).toEqual(data);
            expect(zero.length).toBeGreaterThanOrEqual(nine.length);
        });

        test("ratio sanity: 100 000 × 'A' at level 6 compresses below 200 bytes", () => {
            const data = new Uint8Array(100000).fill(0x41);
            const encoded = _api.deflateSync(data, { level: 6 });
            expect(encoded.length).toBeLessThan(200);
            expect(oracleInflate(encoded)).toEqual(data);
        });
    });

    describe('encoder determinism', () => {

        test('two calls on the same input and options are byte-identical', () => {
            const data = TEXT.subarray(0, 40000);
            for (const level of [1, 6, 9]) {
                expect(_api.deflateSync(data, { level })).toEqual(_api.deflateSync(data, { level }));
            }
        });

        test('the async wrapper returns the synchronous bytes', async () => {
            const data = JSON_CORPUS.subarray(0, 20000);
            expect(await _api.deflate(data, { level: 6 })).toEqual(_api.deflateSync(data, { level: 6 }));
        });

        test('`mem` selects the hash width without breaking the round-trip', () => {
            const data = TEXT.subarray(0, 50000);
            for (const mem of [0, 6, 12]) {
                const encoded = _api.deflateSync(data, { level: 6, mem });
                expect(oracleInflate(encoded)).toEqual(data);
            }
        });
    });

    describe('encoder preset dictionary', () => {

        const dict = new TextEncoder().encode('the quick brown fox jumps over the lazy dog');
        const data = new TextEncoder().encode('the quick brown fox is quick and brown');

        test('node:zlib decodes our dictionary-compressed stream', () => {
            const encoded = _api.deflateSync(data, { dictionary: dict, level: 9 });
            const restored = new Uint8Array(
                zlib.inflateRawSync(Buffer.from(encoded), { dictionary: Buffer.from(dict) }),
            );
            expect(restored).toEqual(data);
            expect(_api.inflateSync(encoded, { dictionary: dict })).toEqual(data);
        });

        test('the same stream without the dictionary → code 3', () => {
            const encoded = _api.deflateSync(data, { dictionary: dict, level: 9 });
            expect(errorCode(() => _api.inflateSync(encoded))).toBe(3);
        });
    });

    describe('DeflateStream', () => {

        /** Concatenate `chunks` into one buffer. */
        function concat(chunks) {
            const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
            let off = 0;
            for (const c of chunks) { out.set(c, off); off += c.length; }
            return out;
        }

        /**
         * Drive a `DeflateStream` over `pushes` — each `[bytes, final, flush]`
         * — and return the concatenated output plus the `final` call count.
         */
        function drive(pushes, opts = {}) {
            const chunks = [];
            let finals = 0;
            const stream = new _api.DeflateStream(opts, (chunk, final) => {
                chunks.push(chunk);
                if (final) ++finals;
            });
            for (const [bytes, final, doFlush] of pushes) {
                stream.push(bytes, final);
                if (doFlush) stream.flush();
            }
            return { out: concat(chunks), finals };
        }

        test('pushes of 1, 7, 1000 and 70 000 bytes make one valid stream', () => {
            const parts = [
                randomCorpus(1, 0x11111111),
                randomCorpus(7, 0x22222222),
                randomCorpus(1000, 0x33333333),
                randomCorpus(70000, 0x44444444),
            ];
            const { out, finals } = drive(parts.map((p, i) => [p, i === parts.length - 1]));
            const source = concat(parts);
            expect(finals).toBe(1);
            expect(oracleInflate(out)).toEqual(source);
            expect(_api.inflateSync(out)).toEqual(source);
        });

        test('flush() after the second push keeps the stream valid', () => {
            const parts = [
                new TextEncoder().encode('streaming '),
                new TextEncoder().encode('data chunk '),
                new TextEncoder().encode('by chunk'),
            ];
            const { out } = drive([
                [parts[0], false],
                [parts[1], false, true],
                [parts[2], true],
            ]);
            const source = concat(parts);
            expect(oracleInflate(out)).toEqual(source);
            expect(_api.inflateSync(out)).toEqual(source);
        });

        test('a dictionary primes the streaming window', () => {
            const dict = new TextEncoder().encode('streaming dictionary payload ');
            const data = new TextEncoder().encode('streaming dictionary payload repeated once more');
            const { out } = drive([[data, true]], { dictionary: dict });
            const restored = new Uint8Array(
                zlib.inflateRawSync(Buffer.from(out), { dictionary: Buffer.from(dict) }),
            );
            expect(restored).toEqual(data);
            expect(_api.inflateSync(out, { dictionary: dict })).toEqual(data);
        });

        test('a zero-length final push yields a valid empty stream', () => {
            const { out, finals } = drive([[new Uint8Array(0), true]]);
            expect(finals).toBe(1);
            expect(oracleInflate(out)).toEqual(new Uint8Array(0));
            expect(_api.inflateSync(out)).toEqual(new Uint8Array(0));
        });

        test('level 0 streams stored blocks across pushes', () => {
            const parts = [randomCorpus(70000, 0x55555555), randomCorpus(1000, 0x66666666)];
            const { out } = drive([[parts[0], false], [parts[1], true]], { level: 0 });
            expect(oracleInflate(out)).toEqual(concat(parts));
        });

        test('push after the final chunk → code 4', () => {
            const stream = new _api.DeflateStream(() => {});
            stream.push(new Uint8Array([1, 2, 3]), true);
            expect(errorCode(() => stream.push(new Uint8Array(0), false))).toBe(4);
            expect(errorCode(() => stream.flush())).toBe(4);
        });

        test('push without an ondata handler → code 5', () => {
            const stream = new _api.DeflateStream();
            expect(errorCode(() => stream.push(new Uint8Array([1]), true))).toBe(5);
            expect(errorCode(() => stream.flush())).toBe(5);
        });
    });

    // --- Lazy matching opt-in (fw/BATCH_32 task 04) ------------------------

    describe('encoder lazy opt-in', () => {

        const LAZY_CORPORA = [
            ['text', TEXT],
            ['json', JSON_CORPUS],
            ['random', RANDOM],
            ['70 000 bytes (crosses BLOCK_TOKENS)', BIG],
            ['40 000-byte window-crossing repeat', REPEAT],
        ];

        for (const [name, corpus] of LAZY_CORPORA) {
            test(`${name} with { lazy: true } round-trips through ours and the oracle at levels 1–9`, () => {
                for (let level = 1; level <= 9; ++level) {
                    const encoded = _api.deflateSync(corpus, { level, lazy: true });
                    expect(_api.inflateSync(encoded)).toEqual(corpus);
                    expect(oracleInflate(encoded)).toEqual(corpus);
                }
            });
        }

        test('lazy matching buys a strictly smaller output on text at levels 6 and 9', () => {
            for (const level of [6, 9]) {
                const fast = _api.deflateSync(TEXT, { level });
                const lazy = _api.deflateSync(TEXT, { level, lazy: true });
                expect(lazy.length).toBeLessThan(fast.length);
            }
        });

        test('the default is the fast path: `lazy` absent, false and level 0 give the same bytes', () => {
            const plain = _api.deflateSync(TEXT, { level: 9 });
            expect(_api.deflateSync(TEXT, { level: 9, lazy: false })).toEqual(plain);
            expect(_api.deflateSync(RANDOM, { level: 0, lazy: true })).toEqual(_api.deflateSync(RANDOM, { level: 0 }));
        });

        test('DeflateStream honours { lazy: true } across pushes', () => {
            const parts = [TEXT.subarray(0, 70000), TEXT.subarray(70000)];
            const chunks = [];
            const stream = new _api.DeflateStream({ level: 9, lazy: true }, chunk => chunks.push(chunk));
            stream.push(parts[0], false);
            stream.push(parts[1], true);
            const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
            let off = 0;
            for (const c of chunks) { out.set(c, off); off += c.length; }
            expect(oracleInflate(out)).toEqual(TEXT);
            expect(_api.inflateSync(out)).toEqual(TEXT);
        });
    });
});
