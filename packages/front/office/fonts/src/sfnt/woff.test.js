// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontWoff } from './woff.js';
import { testRuntime } from './_test-runtime.js';
const { parseWoff1Header, decodeWoff1, WOFF_MAGIC } = testRuntime.resolve('fontWoff');
const { parseSfnt, packSfnt, SFNT_FLAVOR } = testRuntime.resolve('fontSfnt');
import { deflate }   from '@awacloud/fw/io/compress/deflate.js';
import { lz77 }     from '@awacloud/fw/io/compress/lz77.js';
import { adler32 }   from '@awacloud/fw/io/calc/adler32.js';
import { zlib }      from '@awacloud/fw/io/compress/zlib.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }   from '@awacloud/fw/io/compress/huffman.js';
const { ContractError, ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

const bs = bitstream.factory();
const hu = huffman.factory(bs);
const lz = lz77.factory();
const deflateMod = deflate.factory(bs, hu, lz);
const Adler32    = adler32.factory();
const zlibMod    = zlib.factory(deflateMod, Adler32);

/**
 * Build a minimal WOFF1 containing a single table 'aaaa' with the
 * bytes [0..9]. Raw stored (compLength === origLength) â€” the decoder
 * must handle this path.
 */
function buildWoff1Raw() {
    const tableBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const flavor = 0x00010000;
    const numTables = 1;
    const headerLen = 44 + numTables * 20;
    const offset = headerLen;
    const length = headerLen + tableBytes.length;
    const w = new BinaryWriter();
    w.writeUint32(WOFF_MAGIC);
    w.writeUint32(flavor);
    w.writeUint32(length);
    w.writeUint16(numTables);
    w.writeUint16(0);
    w.writeUint32(12 + numTables * 16 + tableBytes.length);  // totalSfntSize approx
    w.writeUint16(1).writeUint16(0);
    w.writeUint32(0).writeUint32(0).writeUint32(0);
    w.writeUint32(0).writeUint32(0);
    // Directory
    w.writeTag('aaaa');
    w.writeUint32(offset);
    w.writeUint32(tableBytes.length);   // compLength
    w.writeUint32(tableBytes.length);   // origLength
    w.writeUint32(0);                    // origChecksum (fake)
    w.writeBytes(tableBytes);
    return { woff: w.finalize(), tableBytes };
}

function buildWoff1Compressed() {
    // 200-byte table that is highly compressible (all zeros)
    const orig = new Uint8Array(200);
    const compressed = zlibMod.zlibSync(orig);
    const flavor = 0x00010000;
    const w = new BinaryWriter();
    w.writeUint32(WOFF_MAGIC);
    w.writeUint32(flavor);
    w.writeUint32(0);                    // length placeholder
    w.writeUint16(1).writeUint16(0);
    w.writeUint32(0);                    // totalSfntSize placeholder
    w.writeUint16(1).writeUint16(0);
    w.writeUint32(0).writeUint32(0).writeUint32(0);
    w.writeUint32(0).writeUint32(0);
    const headerEnd = w.pos;
    w.writeTag('zzzz');
    const offPos = w.pos; w.writeUint32(0);  // offset patch
    w.writeUint32(compressed.length);
    w.writeUint32(orig.length);
    w.writeUint32(0);
    const dirEnd = w.pos;
    w.writeBytes(compressed);
    const bytes = w.finalize();
    // Patch length + tableOffset
    const len = bytes.length;
    bytes[8]  = (len >>> 24) & 0xFF;
    bytes[9]  = (len >>> 16) & 0xFF;
    bytes[10] = (len >>>  8) & 0xFF;
    bytes[11] =  len         & 0xFF;
    const tabOff = dirEnd;
    bytes[offPos]     = (tabOff >>> 24) & 0xFF;
    bytes[offPos + 1] = (tabOff >>> 16) & 0xFF;
    bytes[offPos + 2] = (tabOff >>>  8) & 0xFF;
    bytes[offPos + 3] =  tabOff         & 0xFF;
    return { woff: bytes, orig };
}

describe('fontWoff', () => {
    test('module metadata', () => {
        expect(fontWoff.name).toBe('fontWoff');
        expect(fontWoff.dependencies).toEqual(['fontErrors', 'fontsShared', 'fontReader', 'fontWriter', 'fontTag', 'zlib']);
    });

    test('parses WOFF1 header', () => {
        const { woff, tableBytes } = buildWoff1Raw();
        const hdr = parseWoff1Header(woff);
        expect(hdr.signature).toBe(WOFF_MAGIC);
        expect(hdr.numTables).toBe(1);
        expect(hdr.directory[0].compLength).toBe(tableBytes.length);
    });

    test('decodes raw-stored WOFF1', () => {
        const { woff } = buildWoff1Raw();
        const sfntBytes = decodeWoff1(woff, { zlib: zlibMod });
        const parsed = parseSfnt(sfntBytes);
        expect(parsed.flavor).toBe(SFNT_FLAVOR.TRUETYPE);
        expect(parsed.tables.aaaa.length).toBe(12);
    });

    test('decodes zlib-compressed WOFF1', () => {
        const { woff, orig } = buildWoff1Compressed();
        const sfntBytes = decodeWoff1(woff, { zlib: zlibMod });
        const parsed = parseSfnt(sfntBytes);
        const tBytes = parsed.tables.zzzz.bytes;
        expect(tBytes.length).toBe(orig.length);
        expect(tBytes[0]).toBe(0);
    });

    test('factory returns decode bound to zlib dep', () => {
        const mod = testRuntime.resolve('fontWoff');
        const { woff } = buildWoff1Raw();
        expect(() => mod.decode(woff)).not.toThrow();
        expect(fontWoff.dependencies).toContain('zlib');
    });

    test('rejects bad magic', () => {
        expect(() => parseWoff1Header(new Uint8Array(44))).toThrow(ParseError);
    });

    test('rejects missing zlib dep', () => {
        const { woff } = buildWoff1Raw();
        // Build a standalone fontWoff factory with no zlib bound, then call its decode-with-empty-deps.
        const errs = testRuntime.resolve('fontErrors');
        const shared = testRuntime.resolve('fontsShared');
        const rdr = testRuntime.resolve('fontReader');
        const wtr = testRuntime.resolve('fontWriter');
        const tg  = testRuntime.resolve('fontTag');
        const noZlibApi = fontWoff.factory(errs, shared, rdr, wtr, tg, null);
        expect(() => noZlibApi.decodeWoff1(woff, {})).toThrow(ContractError);
    });
});
