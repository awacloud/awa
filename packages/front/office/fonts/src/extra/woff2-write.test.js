// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { extraWoff2Write } from './woff2-write.js';
import { testRuntime } from './_test-runtime.js';
const { encodeWoff2, WOFF2_MAGIC } = testRuntime.resolve('extraWoff2Write');
import { fontSfnt } from '../sfnt/sfnt.js';
const { decodeWoff2, parseWoff2Header } = testRuntime.resolve('fontWoff2');
const { packSfnt, parseSfnt } = testRuntime.resolve('fontSfnt');
import { fontWriter } from '../primitives/writer.js';
import { fontReader } from '../primitives/reader.js';
import { fontFixed } from '../primitives/fixed.js';
import { fontTag } from '../primitives/tag.js';
import { fontChecksum } from '../primitives/checksum.js';
import { fontsShared } from '../_shared/index.js';
import { binaryWriter as fwBinaryWriter } from '@awacloud/fw/io/binary/writer.js';
import { binaryReader as fwBinaryReader } from '@awacloud/fw/io/binary/reader.js';
import { brotli }    from '@awacloud/fw/io/compress/brotli.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }   from '@awacloud/fw/io/compress/huffman.js';
import { lz77 }      from '@awacloud/fw/io/compress/lz77.js';
import { brotliDict }      from '@awacloud/fw/io/compress/brotli_dict.js';
import { brotliDictWords } from '@awacloud/fw/io/compress/brotli_dict_words.js';
const { ContractError, ParseError } = testRuntime.resolve('fontErrors');

const bs = bitstream.factory();
const hu = huffman.factory(bs);
// Fully wired brotli: the compressor needs lz77 for any non-trivial input
// (a real font); the dictionary pair is only consulted by the decoder.
const brotliMod = brotli.factory(bs, hu, lz77.factory(), brotliDict.factory(), brotliDictWords.factory());

// Vendored Liberation 2.1.5 face (read-only, SIL OFL — @awacloud/oconv-fonts).
const LIBERATION_SANS = new URL('../../../oconv-fonts/vendor/liberation/LiberationSans-Regular.ttf', import.meta.url);
let _liberation = null;
function liberationSans() {
    if (!_liberation) _liberation = new Uint8Array(readFileSync(LIBERATION_SANS));
    return _liberation;
}

function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/**
 * Walk the WOFF2 table directory straight from the bytes, independently
 * of `fontWoff2`: every entry the writer emits is
 * `flags uint8, tag uint32 (index 63), origLength UIntBase128` — no
 * transformLength. Returns the entries and the offset after the last one.
 */
function rawDirectory(woff2) {
    const dv = new DataView(woff2.buffer, woff2.byteOffset, woff2.byteLength);
    const numTables = dv.getUint16(12, false);
    let p = 48;
    const entries = [];
    for (let i = 0; i < numTables; i++) {
        const flags = woff2[p++];
        const tag = String.fromCharCode(woff2[p], woff2[p + 1], woff2[p + 2], woff2[p + 3]);
        p += 4;
        let origLength = 0;
        let b;
        do { b = woff2[p++]; origLength = (origLength * 128) + (b & 0x7F); } while (b & 0x80);
        entries.push({ flags, tag, origLength });
    }
    return { entries, end: p };
}

function minimalSfnt() {
    // Two synthetic non-glyf tables â€” content stays untransformed in WOFF2.
    return packSfnt({
        flavor: 'truetype',
        tables: {
            'aaaa': new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
            'bbbb': new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1])
        }
    });
}

describe('extraWoff2Write', () => {
    test('module metadata', () => {
        expect(extraWoff2Write.name).toBe('extraWoff2Write');
        expect(extraWoff2Write.dependencies).toEqual(['fontErrors', 'fontWriter', 'fontSfnt', 'brotli']);
    });

    test('emits a valid WOFF2 signature', () => {
        const woff2 = encodeWoff2(minimalSfnt(), brotliMod);
        const dv = new DataView(woff2.buffer, woff2.byteOffset, woff2.byteLength);
        expect(dv.getUint32(0, false)).toBe(WOFF2_MAGIC);
    });

    test('round-trips per-table bytes through decodeWoff2', () => {
        const sfnt = minimalSfnt();
        const woff2 = encodeWoff2(sfnt, brotliMod);
        const decoded = decodeWoff2(woff2, { brotli: brotliMod });
        expect(decoded.tables.aaaa).toBeDefined();
        expect(decoded.tables.bbbb).toBeDefined();
        expect(Array.from(decoded.tables.aaaa.bytes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(Array.from(decoded.tables.bbbb.bytes)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    });

    test('header length field matches actual byte length', () => {
        const woff2 = encodeWoff2(minimalSfnt(), brotliMod);
        const dv = new DataView(woff2.buffer, woff2.byteOffset, woff2.byteLength);
        expect(dv.getUint32(8, false)).toBe(woff2.length);
    });

    test('factory wires brotli dep', () => {
        const _errorsApi = testRuntime.resolve('fontErrors');
        const _fixedApi = fontFixed.factory();
        const _writerApi = fontWriter.factory(_errorsApi, fwBinaryWriter.factory(), _fixedApi);
        const _readerApi = fontReader.factory(_errorsApi, fwBinaryReader.factory(), _fixedApi);
        const _tagApi = fontTag.factory(_errorsApi);
        const _checksumApi = fontChecksum.factory();
        const _sharedApi = fontsShared.factory();
        const _sfntApi = fontSfnt.factory(_errorsApi, _sharedApi, _readerApi, _writerApi, _tagApi, _checksumApi);
        const mod = extraWoff2Write.factory(_errorsApi, _writerApi, _sfntApi, brotliMod);
        const woff2 = mod.encode(minimalSfnt());
        const decoded = decodeWoff2(woff2, { brotli: brotliMod });
        expect(decoded.header.numTables).toBe(2);
    });

    test('rejects non-Uint8Array input', () => {
        expect(() => encodeWoff2('not bytes', brotliMod)).toThrow(ContractError);
    });

    test('rejects missing brotli dep', () => {
        expect(() => encodeWoff2(minimalSfnt(), null)).toThrow(ContractError);
    });

    test('rejects bogus SFNT', () => {
        expect(() => encodeWoff2(new Uint8Array(8), brotliMod)).toThrow(ParseError);
    });
});

describe('extraWoff2Write — transform versions (W3C WOFF2 § 4.1, BL-1977)', () => {
    test('glyf/loca carry transform version 3 (null), every other table version 0, no transformLength', () => {
        const sfnt = packSfnt({
            flavor: 'truetype',
            tables: {
                'glyf': new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
                'head': new Uint8Array(54),
                'loca': new Uint8Array([0, 0, 0, 10]),
                'zzzz': new Uint8Array([7])
            }
        });
        const woff2 = encodeWoff2(sfnt, brotliMod);
        const { entries, end } = rawDirectory(woff2);
        const byTag = Object.fromEntries(entries.map(e => [e.tag, e]));
        // bits 0-5 = 63 (explicit tag follows) for every entry.
        for (const e of entries) expect(e.flags & 0x3F).toBe(0x3F);
        expect(byTag.glyf.flags).toBe(0xFF);
        expect(byTag.loca.flags).toBe(0xFF);
        expect(byTag.head.flags).toBe(0x3F);
        expect(byTag.zzzz.flags).toBe(0x3F);
        expect(byTag.glyf.origLength).toBe(10);
        expect(byTag.loca.origLength).toBe(4);
        // No transformLength anywhere: the compressed stream starts right
        // after the last origLength.
        const dv = new DataView(woff2.buffer, woff2.byteOffset, woff2.byteLength);
        const totalCompressedSize = dv.getUint32(20, false);
        expect(end + totalCompressedSize).toBe(woff2.length);
        const hdr = parseWoff2Header(woff2);
        expect(hdr.directoryEnd).toBe(end);
        for (const d of hdr.directory) expect(d.transformLength).toBeUndefined();
    });

    test('real font: LiberationSans-Regular round-trips every table byte-for-byte', () => {
        const ttf = liberationSans();
        const src = parseSfnt(ttf);
        const woff2 = encodeWoff2(ttf, brotliMod);

        const { entries } = rawDirectory(woff2);
        expect(entries.length).toBe(Object.keys(src.tables).length);
        for (const e of entries) {
            const expected = (e.tag === 'glyf' || e.tag === 'loca') ? 0xFF : 0x3F;
            expect({ tag: e.tag, flags: e.flags }).toEqual({ tag: e.tag, flags: expected });
        }
        expect(entries.some(e => e.tag === 'glyf')).toBe(true);
        expect(entries.some(e => e.tag === 'loca')).toBe(true);

        const decoded = decodeWoff2(woff2, { brotli: brotliMod });
        expect(decoded.header.totalSfntSize).toBe(ttf.length);
        expect(decoded.inverseGlyfTransform).toBe(true);
        expect(Object.keys(decoded.tables).sort()).toEqual(Object.keys(src.tables).sort());
        for (const [tag, t] of Object.entries(src.tables)) {
            const got = decoded.tables[tag];
            expect(got.transformed).toBe(false);
            expect(got.origLength).toBe(t.bytes.length);
            expect(bytesEqual(got.bytes, t.bytes)).toBe(true);
        }
    });

    test('real font: 8-table subset without glyf/loca round-trips', () => {
        const src = parseSfnt(liberationSans());
        const subsetTags = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post'];
        const tables = {};
        for (const tag of subsetTags) tables[tag] = src.tables[tag].bytes;
        // packSfnt re-stamps head.checkSumAdjustment for the new table set,
        // so the reference is the packed SFNT that is actually encoded.
        const packed = packSfnt({ flavor: 'truetype', tables });
        const ref = parseSfnt(packed).tables;
        const woff2 = encodeWoff2(packed, brotliMod);
        for (const e of rawDirectory(woff2).entries) expect(e.flags).toBe(0x3F);
        const decoded = decodeWoff2(woff2, { brotli: brotliMod });
        expect(Object.keys(decoded.tables).sort()).toEqual([...subsetTags].sort());
        for (const tag of subsetTags) {
            expect(bytesEqual(decoded.tables[tag].bytes, ref[tag].bytes)).toBe(true);
        }
    });

    test('the extra test runtime\'s brotli compresses a real font', () => {
        const input = liberationSans();
        const brotliRuntime = testRuntime.resolve('brotli');
        const compressed = brotliRuntime.brotliCompressSync(input);
        const decompressed = brotliRuntime.brotliDecompressSync(compressed);
        expect(decompressed.length).toBe(input.length);
        expect(bytesEqual(decompressed, input)).toBe(true);
    });
});
