// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontWoff2 } from './woff2.js';
import { testRuntime } from './_test-runtime.js';
const { parseWoff2Header, decodeWoff2, WOFF2_MAGIC } = testRuntime.resolve('fontWoff2');
import { brotli }    from '@awacloud/fw/io/compress/brotli.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }   from '@awacloud/fw/io/compress/huffman.js';
import { lz77 }      from '@awacloud/fw/io/compress/lz77.js';
import { brotliDict }      from '@awacloud/fw/io/compress/brotli_dict.js';
import { brotliDictWords } from '@awacloud/fw/io/compress/brotli_dict_words.js';
const { ContractError, ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

const bs = bitstream.factory();
const hu = huffman.factory(bs);
// Fully wired brotli: the compressor needs lz77 for any non-trivial input;
// the static-dictionary pair stays inert until a blob is loaded (none here).
const brotliMod = brotli.factory(bs, hu, lz77.factory(), brotliDict.factory(), brotliDictWords.factory());

function writeBase128(w, v) {
    const bytes = [];
    while (true) {
        bytes.unshift(v & 0x7F);
        v >>>= 7;
        if (v === 0) break;
    }
    for (let i = 0; i < bytes.length - 1; i++) w.writeUint8(bytes[i] | 0x80);
    w.writeUint8(bytes[bytes.length - 1]);
}

function buildWoff2(tablesByTag) {
    // tablesByTag: { name -> Uint8Array (untransformed; we pretend they're already-correct)}
    const tableEntries = Object.keys(tablesByTag).map(t => ({ tag: t, bytes: tablesByTag[t] }));
    // Concatenate bodies
    const bodyLen = tableEntries.reduce((s, t) => s + t.bytes.length, 0);
    const body = new Uint8Array(bodyLen);
    let off = 0;
    for (const t of tableEntries) { body.set(t.bytes, off); off += t.bytes.length; }
    const compressed = brotliMod.brotliCompressSync(body);

    const w = new BinaryWriter();
    w.writeUint32(WOFF2_MAGIC);
    w.writeUint32(0x00010000);     // flavor truetype
    const lengthPos = w.pos; w.writeUint32(0);
    w.writeUint16(tableEntries.length);
    w.writeUint16(0);
    w.writeUint32(bodyLen);        // totalSfntSize (approx)
    w.writeUint32(compressed.length);
    w.writeUint16(1).writeUint16(0);
    w.writeUint32(0).writeUint32(0).writeUint32(0);
    w.writeUint32(0).writeUint32(0);
    for (const t of tableEntries) {
        // flags = 0x3F (long tag), transformVersion = 0
        w.writeUint8(0x3F);
        w.writeTag(t.tag);
        writeBase128(w, t.bytes.length);
    }
    w.writeBytes(compressed);
    const out = w.finalize();
    out[8]  = (out.length >>> 24) & 0xFF;
    out[9]  = (out.length >>> 16) & 0xFF;
    out[10] = (out.length >>>  8) & 0xFF;
    out[11] =  out.length         & 0xFF;
    return out;
}

describe('fontWoff2', () => {
    test('module metadata', () => {
        expect(fontWoff2.name).toBe('fontWoff2');
        expect(fontWoff2.dependencies).toEqual(['fontErrors', 'fontsShared', 'fontReader', 'fontTag', 'brotli']);
    });

    test('parses WOFF2 header + directory', () => {
        const woff2 = buildWoff2({
            'aaaa': new Uint8Array([1, 2, 3, 4, 5]),
            'bbbb': new Uint8Array([9, 9, 9])
        });
        const hdr = parseWoff2Header(woff2);
        expect(hdr.signature).toBe(WOFF2_MAGIC);
        expect(hdr.numTables).toBe(2);
        expect(hdr.directory[0].origLength).toBe(5);
        expect(hdr.directory[1].origLength).toBe(3);
    });

    test('decompresses body and slices into per-table bytes', () => {
        const woff2 = buildWoff2({
            'aaaa': new Uint8Array([1, 2, 3, 4, 5]),
            'bbbb': new Uint8Array([9, 9, 9])
        });
        const r = decodeWoff2(woff2, { brotli: brotliMod });
        expect(Array.from(r.tables.aaaa.bytes)).toEqual([1, 2, 3, 4, 5]);
        expect(Array.from(r.tables.bbbb.bytes)).toEqual([9, 9, 9]);
        expect(r.inverseGlyfTransform).toBe(true);  // no glyf table
    });

    test('factory wires brotli dep', () => {
        const mod = testRuntime.resolve('fontWoff2');
        const woff2 = buildWoff2({ 'aaaa': new Uint8Array([42]) });
        expect(() => mod.decode(woff2)).not.toThrow();
    });

    test('rejects bad magic', () => {
        expect(() => parseWoff2Header(new Uint8Array(48))).toThrow(ParseError);
    });

    test('rejects missing brotli dep', () => {
        const woff2 = buildWoff2({ 'aaaa': new Uint8Array([42]) });
        const errs = testRuntime.resolve('fontErrors');
        const shared = testRuntime.resolve('fontsShared');
        const rdr = testRuntime.resolve('fontReader');
        const tg  = testRuntime.resolve('fontTag');
        const noBrotliApi = fontWoff2.factory(errs, shared, rdr, tg, null);
        expect(() => noBrotliApi.decodeWoff2(woff2, {})).toThrow(ContractError);
    });

    test('the sfnt test runtime\'s brotli round-trips non-trivial input', () => {
        // Deterministic 16 KiB buffer: a repeated sentence interleaved with an LCG sequence.
        const sentence = new TextEncoder().encode('The quick brown fox jumps over the lazy dog. ');
        const input = new Uint8Array(16384);
        let lcg = 12345;
        for (let i = 0; i < input.length; i++) {
            if (i % 2 === 0) {
                input[i] = sentence[(i >> 1) % sentence.length];
            } else {
                lcg = (Math.imul(lcg, 1103515245) + 12345) & 0x7fffffff;
                input[i] = (lcg >> 16) & 0xff;
            }
        }
        const runtimeBrotli = testRuntime.resolve('brotli');
        const compressed = runtimeBrotli.brotliCompressSync(input);
        const decompressed = runtimeBrotli.brotliDecompressSync(compressed);
        expect(Array.from(decompressed)).toEqual(Array.from(input));
    });
});
