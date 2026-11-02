// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableCmap } from './cmap.js';
import { testRuntime } from './_test-runtime.js';
const { parseCmap, pickUnicodeMap } = testRuntime.resolve('tableCmap');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { ParseError } = testRuntime.resolve('fontErrors');

function buildCmapFormat4Single() {
    // One Windows BMP subtable (3,1) format 4 mapping U+0041..U+005A -> gid 1..26
    const sub = new BinaryWriter();
    // Two segments: [0x41..0x5A]+(1-0x41) and the mandatory terminator [0xFFFF..0xFFFF]+1
    const segCount = 2;
    sub.writeUint16(4);                        // format
    sub.writeUint16(0);                        // length placeholder
    sub.writeUint16(0);                        // language
    sub.writeUint16(segCount * 2);             // segCountX2
    sub.writeUint16(0).writeUint16(0).writeUint16(0); // searchRange/entrySelector/rangeShift
    sub.writeUint16(0x5A); sub.writeUint16(0xFFFF);   // endCode
    sub.writeUint16(0);                              // reservedPad
    sub.writeUint16(0x41); sub.writeUint16(0xFFFF);  // startCode
    sub.writeInt16(1 - 0x41); sub.writeInt16(1);     // idDelta
    sub.writeUint16(0); sub.writeUint16(0);          // idRangeOffset
    const subBytes = sub.finalize();
    // Patch length
    subBytes[2] = (subBytes.length >>> 8) & 0xFF;
    subBytes[3] = subBytes.length & 0xFF;

    const top = new BinaryWriter();
    top.writeUint16(0);    // version
    top.writeUint16(1);    // numTables
    top.writeUint16(3); top.writeUint16(1);     // platformID, encodingID
    top.writeUint32(4 + 8);   // subtableOffset (after 4 hdr + 8 record)
    top.writeBytes(subBytes);
    return top.finalize();
}

describe('tableCmap', () => {
    test('module metadata', () => { expect(tableCmap.name).toBe('tableCmap'); });

    test('format 4 with an odd segCountX2 is a typed refusal, not a RangeError', () => {
        const bytes = buildCmapFormat4Single();
        // The subtable starts at 12; segCountX2 is its fourth uint16.
        bytes[18] = 0; bytes[19] = 5;
        let code;
        try { parseCmap(bytes); } catch (e) { code = e instanceof ParseError ? e.code : `untyped ${e.name}`; }
        expect(code).toBe('fonts/cmap-fmt4-odd-segcount');
    });

    test('parses format 4', () => {
        const bytes = buildCmapFormat4Single();
        const cmap = parseCmap(bytes);
        expect(cmap.version).toBe(0);
        expect(cmap.encodings).toHaveLength(1);
        expect(cmap.encodings[0].subtable.format).toBe(4);
        const m = cmap.encodings[0].subtable.map;
        expect(m.get(0x41)).toBe(1);
        expect(m.get(0x5A)).toBe(26);
        expect(m.has(0xFFFE)).toBe(false);
    });

    test('parses format 12', () => {
        const w = new BinaryWriter();
        w.writeUint16(0).writeUint16(1);   // version, numTables
        w.writeUint16(3).writeUint16(10);  // (3,10) Windows full repertoire
        w.writeUint32(4 + 8);              // offset to subtable
        // Subtable
        w.writeUint16(12).writeUint16(0);  // format, reserved
        w.writeUint32(16 + 12);            // length = header(16) + 1 group(12)
        w.writeUint32(0);                  // language
        w.writeUint32(1);                  // numGroups
        w.writeUint32(0x1F600); w.writeUint32(0x1F60F); w.writeUint32(1000);
        const cmap = parseCmap(w.finalize());
        const m = cmap.encodings[0].subtable.map;
        expect(m.get(0x1F600)).toBe(1000);
        expect(m.get(0x1F60F)).toBe(1015);
    });

    test('pickUnicodeMap prefers (3,10)', () => {
        const cmap = {
            encodings: [
                { platformID: 1, encodingID: 0, subtable: { map: new Map([[1, 1]]) } },
                { platformID: 3, encodingID: 1, subtable: { map: new Map([[0x41, 100]]) } },
                { platformID: 3, encodingID: 10, subtable: { map: new Map([[0x41, 200]]) } }
            ]
        };
        const m = pickUnicodeMap(cmap);
        expect(m.get(0x41)).toBe(200);
    });

    test('rejects short input', () => {
        expect(() => parseCmap(new Uint8Array(2))).toThrow(ParseError);
    });

    test('parses format 13 (many-to-one)', () => {
        const w = new BinaryWriter();
        w.writeUint16(0).writeUint16(1).writeUint16(3).writeUint16(10).writeUint32(12);
        w.writeUint16(13).writeUint16(0).writeUint32(16 + 12).writeUint32(0).writeUint32(1);
        w.writeUint32(0xFFFD).writeUint32(0xFFFF).writeUint32(99);
        const cmap = parseCmap(w.finalize());
        const m = cmap.encodings[0].subtable.map;
        expect(m.get(0xFFFD)).toBe(99);
        expect(m.get(0xFFFF)).toBe(99);
    });

    test('parses format 14 (variation selectors)', () => {
        const w = new BinaryWriter();
        w.writeUint16(0).writeUint16(1).writeUint16(0).writeUint16(5).writeUint32(12);
        const subStart = w.pos;
        w.writeUint16(14);                 // format
        const lenPos = w.pos; w.writeUint32(0);
        w.writeUint32(1);                  // numVarSelectorRecords
        w.writeUint24(0xFE0F);
        w.writeUint32(0);                  // defaultUVSOffset = 0
        const nonDefOffPos = w.pos; w.writeUint32(0);
        // non-default UVS table
        const nonDefStart = w.pos;
        w.writeUint32(1);                  // numUVSMappings
        w.writeUint24(0x2764); w.writeUint16(42);
        const subEnd = w.pos;
        // Patch length + non-default offset (relative to subtable start)
        const subLen = subEnd - subStart;
        w.patchUint32(lenPos, subLen);
        w.patchUint32(nonDefOffPos, nonDefStart - subStart);
        const cmap = parseCmap(w.finalize());
        const f14 = cmap.encodings[0].subtable;
        expect(f14.format).toBe(14);
        expect(f14.records[0].nonDefaultUVS[0]).toEqual({ unicodeValue: 0x2764, glyphID: 42 });
    });

    test('rejects bad subtable offset', () => {
        const w = new BinaryWriter();
        w.writeUint16(0).writeUint16(1).writeUint16(3).writeUint16(1).writeUint32(999);
        expect(() => parseCmap(w.finalize())).toThrow(ParseError);
    });
});

describe('pickUnicodeMap — Macintosh Roman-script subtables through their code page', () => {
    /** A cmap of format-0 subtables, `records` = [{ platformID, encodingID, language, glyphs: { byte: gid } }]. */
    function cmapOf(records) {
        const subs = records.map(({ language, glyphs }) => {
            const out = new Uint8Array(262);
            out[1] = 0; out[2] = 1; out[3] = 6; out[4] = language >> 8; out[5] = language & 0xff;
            for (const [b, gid] of Object.entries(glyphs)) out[6 + Number(b)] = gid;
            return out;
        });
        const head = 4 + 8 * records.length;
        const bytes = new Uint8Array(head + 262 * records.length);
        bytes[3] = records.length;
        records.forEach((r, i) => {
            const at = 4 + 8 * i;
            const off = head + 262 * i;
            bytes.set([0, r.platformID, 0, r.encodingID, off >>> 24, (off >>> 16) & 0xff, (off >>> 8) & 0xff, off & 0xff], at);
            bytes.set(subs[i], off);
        });
        return parseCmap(bytes);
    }
    const TURKISH = { 0x41: 34, 0xD2: 200, 0xDA: 176, 0xDB: 177, 0xDC: 178, 0xDD: 179, 0xDE: 180, 0xDF: 181, 0xF5: 182 };

    test('language 18: the Mac OS Turkish code page', () => {
        const m = pickUnicodeMap(cmapOf([{ platformID: 1, encodingID: 0, language: 18, glyphs: TURKISH }]));
        expect([0x41, 0x201C, 0x011E, 0x011F, 0x0130, 0x0131, 0x015E, 0x015F].map((cp) => m.get(cp)))
            .toEqual([34, 200, 176, 177, 178, 179, 180, 181]);
        expect(m.get(0xDA)).toBe(undefined); // not read as U+00DA any more
        expect(m.get(0xF8A0)).toBe(182);     // Apple's private assignment of Turkish 0xF5, kept
    });

    test('language 0: Mac OS Roman (ı at 0xF5, € at 0xDB); ASCII unchanged', () => {
        const m = pickUnicodeMap(cmapOf([{ platformID: 1, encodingID: 0, language: 0, glyphs: TURKISH }]));
        expect([m.get(0x41), m.get(0x0131), m.get(0x20AC), m.get(0x201C)]).toEqual([34, 182, 177, 200]);
    });

    test('Icelandic, Croatian, Romanian: their own code pages', () => {
        const page = (language) => pickUnicodeMap(cmapOf([{ platformID: 1, encodingID: 0, language, glyphs: { 0xA0: 5, 0xD0: 8, 0xDE: 6 } }]));
        expect([page(16).get(0x00DD), page(16).get(0x00DE)]).toEqual([5, 6]); // Icelandic: Ý at 0xA0, Þ at 0xDE
        expect(page(19).get(0x0110)).toBe(8);                                  // Croatian: Đ at 0xD0
        expect(page(38).get(0x021A)).toBe(6);                                  // Romanian: Ț at 0xDE
    });

    test('a Unicode subtable is still preferred; another Mac script stays raw', () => {
        const both = cmapOf([{ platformID: 1, encodingID: 0, language: 18, glyphs: TURKISH }, { platformID: 3, encodingID: 1, language: 0, glyphs: { 0xDA: 9 } }]);
        expect(pickUnicodeMap(both).get(0xDA)).toBe(9);
        const japanese = cmapOf([{ platformID: 1, encodingID: 1, language: 0, glyphs: { 0xDA: 7 } }]);
        expect(pickUnicodeMap(japanese).get(0xDA)).toBe(7);
    });
});
