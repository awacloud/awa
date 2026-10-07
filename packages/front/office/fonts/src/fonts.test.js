// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fonts } from './fonts.js';
import { testRuntime } from './_test-runtime.js';
const _fontsApi = testRuntime.resolve('fonts');
const shimRead = _fontsApi.read;
const shimUse = _fontsApi.use;
const { ContractError, ParseError } = testRuntime.resolve('fontErrors');
const { packSfnt, SFNT_FLAVOR } = testRuntime.resolve('fontSfnt');
const { encodeHead, HEAD_MAGIC } = testRuntime.resolve('tableHead');
const { encodeHhea } = testRuntime.resolve('tableHhea');
const { encodeMaxp, MAXP_V1_0 } = testRuntime.resolve('tableMaxp');
const { encodeHmtx } = testRuntime.resolve('tableHmtx');
const { encodeName, PLATFORM, NAME_ID } = testRuntime.resolve('tableName');
const { encodeLoca } = testRuntime.resolve('tableLoca');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

/**
 * Encode a minimal `gvar` table declaring `glyphCount` glyphs, no shared
 * tuples and no per-glyph variation data (short-offset form, all offsets
 * zero — every glyph's variation data slice is empty). Sufficient to
 * exercise the `fonts/inconsistent-tables` gvar↔numGlyphs cross-check
 * without needing real variation data.
 */
function buildGvarBytes(glyphCount) {
    const w = new BinaryWriter();
    w.writeUint16(1).writeUint16(0);           // majorVersion, minorVersion
    w.writeUint16(0);                          // axisCount
    w.writeUint16(0);                          // sharedTupleCount
    w.writeUint32(0);                          // sharedTuplesOffset
    w.writeUint16(glyphCount);                 // glyphCount
    w.writeUint16(0);                          // flags (short offsets)
    w.writeUint32(20 + (glyphCount + 1) * 2);  // glyphVariationDataArrayOffset
    for (let i = 0; i <= glyphCount; i++) w.writeUint16(0);
    return w.finalize();
}

/**
 * Build a minimal but spec-valid TrueType font with 2 glyphs:
 *   glyph 0 = .notdef (empty)
 *   glyph 1 = a triangle, mapped from U+0041 'A'
 *
 * @param {{ gvarGlyphCount?: number }} [opts] — when set, adds a `gvar`
 *   table declaring that many glyphs (for the gvar↔numGlyphs cross-check).
 */
function buildMinimalFont(opts) {
    // Glyph 1 â€” triangle (same shape as in glyf.test.js, all on-curve int16)
    const g1 = new BinaryWriter();
    g1.writeInt16(1);
    g1.writeInt16(0); g1.writeInt16(0); g1.writeInt16(100); g1.writeInt16(100);
    g1.writeUint16(2);
    g1.writeUint16(0);
    g1.writeUint8(1); g1.writeUint8(1); g1.writeUint8(1);
    g1.writeInt16(0); g1.writeInt16(100); g1.writeInt16(-50);
    g1.writeInt16(0); g1.writeInt16(0); g1.writeInt16(100);

    const glyfTriangle = g1.finalize();
    // glyf table = [glyph 0 (empty, 0 bytes)][glyph 1 padded to even alignment for short loca]
    // For short loca we need offsets/2, so glyph data must be aligned to 2 bytes.
    let glyf = new Uint8Array(glyfTriangle.length);
    glyf.set(glyfTriangle, 0);
    if (glyf.length & 1) {
        const padded = new Uint8Array(glyf.length + 1);
        padded.set(glyf, 0);
        glyf = padded;
    }
    const locaOffsets = new Uint32Array([0, 0, glyf.length]);
    const loca = encodeLoca(locaOffsets);

    const numGlyphs = 2;
    const head = encodeHead({
        majorVersion: 1, minorVersion: 0, fontRevision: 1,
        checksumAdjustment: 0, magicNumber: HEAD_MAGIC,
        flags: 0x000B, unitsPerEm: 1000,
        created: 0, modified: 0,
        xMin: 0, yMin: 0, xMax: 100, yMax: 100,
        macStyle: 0, lowestRecPPEM: 8,
        fontDirectionHint: 2,
        indexToLocFormat: loca.indexToLocFormat,
        glyphDataFormat: 0
    });
    const maxp = encodeMaxp({
        version: MAXP_V1_0, numGlyphs,
        maxPoints: 3, maxContours: 1,
        maxCompositePoints: 0, maxCompositeContours: 0,
        maxZones: 2, maxTwilightPoints: 0,
        maxStorage: 0, maxFunctionDefs: 0, maxInstructionDefs: 0,
        maxStackElements: 0, maxSizeOfInstructions: 0,
        maxComponentElements: 0, maxComponentDepth: 0
    });

    const hmtxEnc = encodeHmtx({
        metrics: [
            { advanceWidth: 500, lsb: 0 },
            { advanceWidth: 700, lsb: 10 }
        ]
    });
    const hhea = encodeHhea({
        ascender: 800, descender: -200, lineGap: 0,
        advanceWidthMax: 700,
        minLeftSideBearing: 0, minRightSideBearing: 0,
        xMaxExtent: 100,
        caretSlopeRise: 1, caretSlopeRun: 0, caretOffset: 0,
        metricDataFormat: 0, numberOfHMetrics: hmtxEnc.numberOfHMetrics
    });

    const name = encodeName({
        records: [
            { platformID: PLATFORM.WINDOWS, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FONT_FAMILY,    string: 'TestFont' },
            { platformID: PLATFORM.WINDOWS, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FONT_SUBFAMILY, string: 'Regular' },
            { platformID: PLATFORM.WINDOWS, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FULL_NAME,      string: 'TestFont Regular' },
            { platformID: PLATFORM.WINDOWS, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.POSTSCRIPT_NAME, string: 'TestFont-Regular' }
        ]
    });

    // cmap format 4: U+0041 -> gid 1
    const sub = new BinaryWriter();
    sub.writeUint16(4); sub.writeUint16(0); sub.writeUint16(0);
    sub.writeUint16(4); // segCountX2 = 2*2
    sub.writeUint16(0); sub.writeUint16(0); sub.writeUint16(0);
    sub.writeUint16(0x41); sub.writeUint16(0xFFFF);  // endCode
    sub.writeUint16(0);
    sub.writeUint16(0x41); sub.writeUint16(0xFFFF);  // startCode
    sub.writeInt16(1 - 0x41); sub.writeInt16(1);     // idDelta
    sub.writeUint16(0); sub.writeUint16(0);          // idRangeOffset
    const subBytes = sub.finalize();
    subBytes[2] = (subBytes.length >>> 8) & 0xFF;
    subBytes[3] = subBytes.length & 0xFF;

    const cmap = new BinaryWriter();
    cmap.writeUint16(0); cmap.writeUint16(1);
    cmap.writeUint16(3); cmap.writeUint16(1);
    cmap.writeUint32(12);
    cmap.writeBytes(subBytes);
    const cmapBytes = cmap.finalize();

    const tables = { head, hhea, maxp, hmtx: hmtxEnc.bytes, cmap: cmapBytes, name, loca: loca.bytes, glyf };
    if (opts && opts.gvarGlyphCount != null) tables.gvar = buildGvarBytes(opts.gvarGlyphCount);
    return packSfnt({
        flavor: SFNT_FLAVOR.TRUETYPE,
        tables
    });
}

describe('fonts top-level', () => {
    test('module metadata', () => {
        expect(fonts.name).toBe('fonts');
        expect(typeof fonts.factory).toBe('function');
        expect(fonts.factory.toString().includes('function')).toBe(true);
    });

    // Use the transition-shim API rather than calling `fonts.factory()`
    // directly â€” the strict factory body now requires all 15 deps.
    const api = { read: shimRead, use: shimUse };

    test('rejects non-Uint8Array input', () => {
        expect(() => api.read('not bytes')).toThrow(ContractError);
    });

    test('rejects garbage', () => {
        expect(() => api.read(new Uint8Array(16))).toThrow(ParseError);
    });

    test('round-trip minimal TTF', () => {
        const bytes = buildMinimalFont();
        const font = api.read(bytes);
        expect(font.flavor).toBe('truetype');
        expect(font.numGlyphs).toBe(2);
        expect(font.unitsPerEm).toBe(1000);
        expect(font.names.family).toBe('TestFont');
        expect(font.names.fullName).toBe('TestFont Regular');
        expect(font.advanceWidth(0)).toBe(500);
        expect(font.advanceWidth(1)).toBe(700);
        expect(font.glyphIndexForCodePoint(0x41)).toBe(1);
        const g = font.getGlyphByCodePoint(0x41);
        expect(g.id).toBe(1);
        expect(g.advanceWidth).toBe(700);
        expect(g.path.commands.length).toBeGreaterThan(0);
    });

    test('use() is idempotent', () => {
        const ext = { hydrateFont() {} };
        api.use(ext);
        api.use(ext);
        // No exception, no double-registration crash. Implicit via subsequent reads.
        const bytes = buildMinimalFont();
        expect(() => api.read(bytes)).not.toThrow();
    });

    /* --- Étape 7 P2 — gvar.glyphCount ↔ maxp.numGlyphs cross-check --- */

    test('accepts gvar whose glyphCount matches numGlyphs', () => {
        const bytes = buildMinimalFont({ gvarGlyphCount: 2 });
        expect(() => api.read(bytes)).not.toThrow();
    });

    test('rejects gvar whose glyphCount diverges from numGlyphs', () => {
        const bytes = buildMinimalFont({ gvarGlyphCount: 3 });
        let caught;
        try { api.read(bytes); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('fonts/inconsistent-tables');
    });
});
