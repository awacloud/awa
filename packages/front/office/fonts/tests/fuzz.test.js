// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Fuzz test â€” feeds a variety of malformed byte streams
 * through the public parser surface and asserts that we always throw a
 * typed `ParseError` (never a bare `Error`, never crash silently).
 */

import { describe, test, expect } from 'bun:test';
import { testRuntime as _rootRt } from '../src/_test-runtime.js';
const fontsRead = _rootRt.resolve('fonts').read;
const { ParseError, ContractError } = _rootRt.resolve('fontErrors');
const { parseSfnt } = _rootRt.resolve('fontSfnt');
import { testRuntime as _tableRt } from '../src/_test-runtime.js';
const { parseHead } = _tableRt.resolve('tableHead');
const { parseHhea } = _tableRt.resolve('tableHhea');
const { parseMaxp } = _tableRt.resolve('tableMaxp');
const { parseCmap } = _tableRt.resolve('tableCmap');
const { parseName } = _tableRt.resolve('tableName');
const { parseGlyph } = _tableRt.resolve('tableGlyf');
const { parseFormat12, parseFormat13, parseFormat14 } = _tableRt.resolve('tableCmapFormats');
const { BinaryReader } = _rootRt.resolve('fontReader');
const { BinaryWriter } = _rootRt.resolve('fontWriter');

const api = { read: fontsRead };

describe('fonts fuzz', () => {
    test('empty input rejected by top-level read', () => {
        expect(() => api.read(new Uint8Array(0))).toThrow(ParseError);
    });

    test('truncated headers rejected', () => {
        for (let n = 0; n <= 12; n++) {
            expect(() => parseSfnt(new Uint8Array(n))).toThrow(ParseError);
        }
    });

    test('bad sfntVersion rejected', () => {
        const u = new Uint8Array(12);
        u[0] = 0xDE; u[1] = 0xAD; u[2] = 0xBE; u[3] = 0xEF;
        expect(() => parseSfnt(u)).toThrow(ParseError);
    });

    test('garbage table bytes rejected by per-table parsers', () => {
        expect(() => parseHead(new Uint8Array(10))).toThrow(ParseError);
        expect(() => parseHhea(new Uint8Array(2))).toThrow(ParseError);
        expect(() => parseMaxp(new Uint8Array(3))).toThrow(ParseError);
        expect(() => parseCmap(new Uint8Array(1))).toThrow(ParseError);
        expect(() => parseName(new Uint8Array(2))).toThrow(ParseError);
        expect(() => parseGlyph(new Uint8Array(4))).toThrow(ParseError);
    });

    test('a rejection that goes through a BinaryReader read keeps the fw ContractError as cause', () => {
        // Top-level read of an empty buffer: the failure is raised by the
        // BinaryReader, not by a per-table "-short" pre-check.
        let viaRead;
        try { api.read(new Uint8Array(0)); } catch (e) { viaRead = e; }
        expect(viaRead).toBeInstanceOf(ParseError);
        expect(viaRead.code).toBe('fonts/reader-eof');
        expect(viaRead.cause?.name).toBe('ContractError');
        expect(viaRead.cause.code).toBe('binary/reader-eof');

        // A per-table parser fed a glyph record that ends mid-header.
        let viaGlyph;
        try { parseGlyph(new Uint8Array(10)); } catch (e) { viaGlyph = e; }
        expect(viaGlyph).toBeInstanceOf(ParseError);
        expect(viaGlyph.code).toBe('fonts/reader-eof');
        expect(viaGlyph.cause?.name).toBe('ContractError');
        expect(viaGlyph.cause.code).toBe('binary/reader-eof');
    });

    test('non-Uint8Array input rejected with ContractError', () => {
        expect(() => api.read(null)).toThrow(ContractError);
        expect(() => api.read('not-bytes')).toThrow(ContractError);
        expect(() => api.read([1, 2, 3])).toThrow(ContractError);
    });

    test('random garbage of various sizes is always handled', () => {
        // Crash-resistance check: any 4kB random buffer should either
        // parse (vanishingly unlikely) or raise a typed error.
        const rng = mulberry32(0xC0FFEE);
        for (let iter = 0; iter < 25; iter++) {
            const size = 16 + Math.floor(rng() * 4080);
            const u = new Uint8Array(size);
            for (let i = 0; i < size; i++) u[i] = (rng() * 256) & 0xFF;
            try {
                api.read(u);
            } catch (e) {
                expect(e).toBeInstanceOf(Error);
                // Must be one of our typed errors
                expect(e.name === 'ParseError' || e.name === 'ContractError'
                       || e.name === 'RenderError' || e.name === 'FontError').toBe(true);
            }
        }
    });
});

describe('fonts security â€” P0 fixes', () => {
    test('R1 â€” cmap format 12 (0, 0xFFFFFFFF) range-bomb rejected', () => {
        const w = new BinaryWriter();
        w.writeUint16(12);          // format
        w.writeUint16(0);           // reserved
        w.writeUint32(28);          // length
        w.writeUint32(0);           // language
        w.writeUint32(1);           // numGroups
        w.writeUint32(0);           // startCharCode
        w.writeUint32(0xFFFFFFFF);  // endCharCode  â† bomb
        w.writeUint32(1);           // startGlyphID
        const bytes = w.finalize();
        const r = new BinaryReader(bytes);
        let caught;
        try { parseFormat12(r); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('fonts/cmap-range-bomb');
    });

    test('R1 â€” cmap format 12 valid Unicode range accepted', () => {
        const w = new BinaryWriter();
        w.writeUint16(12);
        w.writeUint16(0);
        w.writeUint32(28);
        w.writeUint32(0);
        w.writeUint32(1);
        w.writeUint32(0x20);        // ' '
        w.writeUint32(0x7E);        // '~'
        w.writeUint32(1);
        const bytes = w.finalize();
        const r = new BinaryReader(bytes);
        const t = parseFormat12(r);
        expect(t.map.get(0x20)).toBe(1);
        expect(t.map.get(0x7E)).toBe(1 + (0x7E - 0x20));
        expect(t.map.size).toBe(0x7E - 0x20 + 1);
    });

    test('R1 â€” cmap format 13 (0, 0xFFFFFFFF) range-bomb rejected', () => {
        const w = new BinaryWriter();
        w.writeUint16(13);
        w.writeUint16(0);
        w.writeUint32(28);
        w.writeUint32(0);
        w.writeUint32(1);
        w.writeUint32(0);
        w.writeUint32(0xFFFFFFFF);
        w.writeUint32(1);
        const bytes = w.finalize();
        const r = new BinaryReader(bytes);
        let caught;
        try { parseFormat13(r); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('fonts/cmap-range-bomb');
    });

    test('R1 â€” cmap format 12 cumulative range exhaustion rejected', () => {
        // Many small ranges that together exceed the cap
        const numGroups = 16;
        const perRange = 0x110000;   // each group is full Unicode plane
        const w = new BinaryWriter();
        w.writeUint16(12);
        w.writeUint16(0);
        w.writeUint32(16 + numGroups * 12);
        w.writeUint32(0);
        w.writeUint32(numGroups);
        for (let i = 0; i < numGroups; i++) {
            w.writeUint32(0);
            w.writeUint32(perRange - 1);  // within Unicode bounds individually
            w.writeUint32(1);
        }
        const bytes = w.finalize();
        const r = new BinaryReader(bytes);
        let caught;
        try { parseFormat12(r); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('fonts/cmap-range-bomb');
    });

    test('R2 â€” composite glyph with MORE_COMPONENTS bomb rejected', () => {
        // Build a composite glyph that keeps setting MORE_COMPONENTS=0x0020
        const w = new BinaryWriter();
        w.writeInt16(-1);                              // numberOfContours (composite)
        w.writeInt16(0); w.writeInt16(0); w.writeInt16(0); w.writeInt16(0);  // bbox
        // 500 components, each with MORE_COMPONENTS set
        const FLAGS = 0x0020 | 0x0002;   // MORE_COMPONENTS | ARGS_ARE_XY (int8 args)
        for (let i = 0; i < 500; i++) {
            w.writeUint16(FLAGS);
            w.writeUint16(0);          // glyphIndex
            w.writeInt8(0); w.writeInt8(0);   // arg1, arg2
        }
        // No terminator (MORE_COMPONENTS would normally clear on last)
        const bytes = w.finalize();
        let caught;
        try { parseGlyph(bytes); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('fonts/glyf-too-many-components');
    });

    test('R2 â€” small composite (â‰¤ cap) accepted', () => {
        const w = new BinaryWriter();
        w.writeInt16(-1);
        w.writeInt16(0); w.writeInt16(0); w.writeInt16(0); w.writeInt16(0);
        // Two components, second clears MORE_COMPONENTS
        const FLAGS_MORE = 0x0020 | 0x0002;
        const FLAGS_LAST = 0x0002;
        w.writeUint16(FLAGS_MORE); w.writeUint16(0); w.writeInt8(0); w.writeInt8(0);
        w.writeUint16(FLAGS_LAST); w.writeUint16(1); w.writeInt8(0); w.writeInt8(0);
        const bytes = w.finalize();
        const g = parseGlyph(bytes);
        expect(g.kind).toBe('composite');
        expect(g.components.length).toBe(2);
    });

    test('R3 â€” cmap format 14 parses non-default UVS mappings correctly', () => {
        // Build a format 14 with one var selector having a non-default UVS table
        // Layout:
        //   format(2) length(4) numVarSelectorRecords(4)
        //   record: varSelector(3) defaultOffset(4) nonDefaultOffset(4)  = 11 bytes
        //   Non-default UVS at offset:
        //     numMappings(4)
        //     mapping: unicodeValue(3) glyphID(2)  = 5 bytes
        const recHeaderLen = 2 + 4 + 4;         // 10
        const recSize = 11;
        const numRecords = 1;
        const nonDefaultStart = recHeaderLen + numRecords * recSize;  // 21
        // We'll have 2 mappings
        const numMappings = 2;
        const w = new BinaryWriter();
        w.writeUint16(14);
        w.writeUint32(0);   // length placeholder
        w.writeUint32(numRecords);
        // record
        w.writeUint24(0xFE0F);              // varSelector = VS-16
        w.writeUint32(0);                   // defaultUVSOffset = none
        w.writeUint32(nonDefaultStart);     // nonDefaultUVSOffset
        // non-default UVS table
        w.writeUint32(numMappings);
        w.writeUint24(0x4E00); w.writeUint16(1234);
        w.writeUint24(0x4E2D); w.writeUint16(5678);
        const bytes = w.finalize();
        const r = new BinaryReader(bytes);
        const t = parseFormat14(r);
        expect(t.records.length).toBe(1);
        expect(t.records[0].varSelector).toBe(0xFE0F);
        expect(t.records[0].nonDefaultUVS).toBeDefined();
        expect(t.records[0].nonDefaultUVS.length).toBe(2);
        // These reads were previously corrupted by the peek-restore bug
        expect(t.records[0].nonDefaultUVS[0]).toEqual({ unicodeValue: 0x4E00, glyphID: 1234 });
        expect(t.records[0].nonDefaultUVS[1]).toEqual({ unicodeValue: 0x4E2D, glyphID: 5678 });
    });

    test('R3 â€” cmap format 14 parses default UVS ranges correctly', () => {
        const recHeaderLen = 2 + 4 + 4;
        const recSize = 11;
        const numRecords = 1;
        const defaultStart = recHeaderLen + numRecords * recSize;
        const numRanges = 2;
        const w = new BinaryWriter();
        w.writeUint16(14);
        w.writeUint32(0);
        w.writeUint32(numRecords);
        w.writeUint24(0xFE0E);
        w.writeUint32(defaultStart);
        w.writeUint32(0);
        // default UVS ranges
        w.writeUint32(numRanges);
        w.writeUint24(0x3041); w.writeUint8(10);
        w.writeUint24(0x4E00); w.writeUint8(5);
        const bytes = w.finalize();
        const r = new BinaryReader(bytes);
        const t = parseFormat14(r);
        expect(t.records[0].defaultUVS.length).toBe(2);
        expect(t.records[0].defaultUVS[0]).toEqual({ startUnicodeValue: 0x3041, additionalCount: 10 });
        expect(t.records[0].defaultUVS[1]).toEqual({ startUnicodeValue: 0x4E00, additionalCount: 5 });
    });
});

describe('fonts security â€” E4 validation caps', () => {
    test('SFNT directory with numTables=0 rejected', () => {
        const w = new BinaryWriter();
        w.writeUint32(0x00010000);
        w.writeUint16(0);                // numTables
        w.writeUint16(0); w.writeUint16(0); w.writeUint16(0);
        let caught;
        try { parseSfnt(w.finalize()); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('fonts/sfnt-empty');
    });

    test('SFNT directory exceeding numTables cap rejected', () => {
        const w = new BinaryWriter();
        w.writeUint32(0x00010000);
        w.writeUint16(1000);             // > 64
        w.writeUint16(0); w.writeUint16(0); w.writeUint16(0);
        let caught;
        try { parseSfnt(w.finalize()); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('fonts/sfnt-too-many-tables');
    });

    test('maxp numGlyphs honours uint16 bound (no overflow)', () => {
        // numGlyphs is uint16-wide so we can't easily exceed cap from
        // bytes ; assert the legitimate ceiling still parses.
        const w = new BinaryWriter();
        w.writeUint32(0x00005000);
        w.writeUint16(0xFFFF);
        const t = parseMaxp(w.finalize());
        expect(t.numGlyphs).toBe(0xFFFF);
    });
});

describe('fonts security â€” E5 fuzz â€” name.count exact boundary', () => {
    // `name-too-many` (table/name.js) caps `count` at 32768. These two
    // cases assert the exact bound rather than just "some large count
    // throws" â€” the cap-1/cap/cap+1 edges are where off-by-one bugs hide.
    const NAME_COUNT_MAX = 32768;

    test('name.count = 32768 (exactly the cap) parses cleanly', () => {
        // Header (format=0, count, stringOffset=0) + `count` zeroed 12-byte
        // records. stringOffset=0 and every record's offset/length=0 keeps
        // the string-range check (`start + length <= bytes.length`)
        // trivially satisfied regardless of table size.
        const total = 6 + NAME_COUNT_MAX * 12;
        const bytes = new Uint8Array(total);
        bytes[2] = (NAME_COUNT_MAX >>> 8) & 0xFF;
        bytes[3] = NAME_COUNT_MAX & 0xFF;
        const t = parseName(bytes);
        expect(t.format).toBe(0);
        expect(t.records.length).toBe(NAME_COUNT_MAX);
    });

    test('name.count = 32769 (cap + 1) rejected at the exact bound', () => {
        // The cap check runs right after reading `count`, before the
        // records loop â€” a 6-byte header is enough to trigger it.
        const bytes = new Uint8Array(6);
        bytes[2] = ((NAME_COUNT_MAX + 1) >>> 8) & 0xFF;
        bytes[3] = (NAME_COUNT_MAX + 1) & 0xFF;
        let caught;
        try { parseName(bytes); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('fonts/name-too-many');
        expect(caught.context.count).toBe(NAME_COUNT_MAX + 1);
        expect(caught.context.cap).toBe(NAME_COUNT_MAX);
    });
});

// Tiny seeded PRNG â€” Mulberry32
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
