// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableSbix } from './sbix.js';
import { testRuntime } from './_test-runtime.js';
const { parseSbix } = testRuntime.resolve('tableSbix');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableSbix', () => {
    test('module metadata', () => { expect(tableSbix.name).toBe('tableSbix'); });

    test('parses 1 strike with 1 PNG glyph', () => {
        const numGlyphs = 2;
        // Build a PNG-bearing strike. strikeOffsets list, then strike body.
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0);             // version, flags
        w.writeUint32(1);                              // 1 strike
        const strikeOffPos = w.pos; w.writeUint32(0);  // strike offset placeholder
        const strikeStart = w.pos;
        w.writeUint16(32).writeUint16(72);           // ppem, ppi
        // glyphDataOffsets[numGlyphs+1] : positions relative to strike start
        const glyphHdrStart = w.pos;
        w.writeUint32(0);                              // glyph 0 offset
        const g0lenPos = w.pos; w.writeUint32(0);     // glyph 1 offset placeholder
        const g1lenPos = w.pos; w.writeUint32(0);     // end placeholder
        // glyph 0 body: 8-byte header + 4 PNG bytes
        const g0BodyStart = w.pos;
        w.writeInt16(0).writeInt16(0).writeTag('png ');
        w.writeBytes(new Uint8Array([0x89, 0x50, 0x4E, 0x47]));
        const g1BodyStart = w.pos;
        // glyph 1: empty
        const bytes = w.finalize();
        // Patch
        const setU32 = (pos, v) => {
            bytes[pos]     = (v >>> 24) & 0xFF;
            bytes[pos + 1] = (v >>> 16) & 0xFF;
            bytes[pos + 2] = (v >>>  8) & 0xFF;
            bytes[pos + 3] =  v         & 0xFF;
        };
        setU32(strikeOffPos, strikeStart);
        setU32(g0lenPos,  g1BodyStart - strikeStart);   // glyph 1 starts here
        setU32(g1lenPos,  bytes.length - strikeStart);  // end
        // Patch glyph 0 offset too (it was 0 â€” but the offset 0 maps to g0BodyStart - strikeStart)
        const g0Off = g0BodyStart - strikeStart;
        setU32(glyphHdrStart, g0Off);

        const s = parseSbix(bytes, numGlyphs);
        expect(s.strikes.length).toBe(1);
        expect(s.strikes[0].ppem).toBe(32);
        const bmp = s.strikes[0].getGlyphBitmap(0);
        expect(bmp).not.toBeNull();
        expect(bmp.graphicType).toBe('png ');
        expect(Array.from(bmp.data)).toEqual([0x89, 0x50, 0x4E, 0x47]);
        expect(s.strikes[0].getGlyphBitmap(1)).toBeNull();
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(9).writeUint16(0).writeUint32(0);
        expect(() => parseSbix(w.finalize(), 0)).toThrow(ParseError);
    });
});
