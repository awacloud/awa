// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { embedSubsetForPdf } from './subsetForPdf.js';
import { testRuntime as _rootRt } from '../_test-runtime.js';
import { testRuntime as _embedRt } from './_test-runtime.js';
const { ContractError } = _embedRt.resolve('fontErrors');
const fontsRead = _rootRt.resolve('fonts').read;
const { subsetForPdf } = _embedRt.resolve('embedSubsetForPdf');
const { parsePost } = _rootRt.resolve('tablePost');
import { buildTtf, buildSimpleGlyph } from '../../tests/_helpers/build.js';

/** 32-byte `post` header (OT §6.4.9) with an explicit version + the
 * fields the header shares across v1/v2/v3 (italicAngle, underline,
 * isFixedPitch, memory hints). */
function buildPostHeader(versionRaw, { italicAngle = 0, underlinePosition = -75, underlineThickness = 50 } = {}) {
    const buf = new ArrayBuffer(32);
    const dv = new DataView(buf);
    dv.setUint32(0, versionRaw);
    dv.setInt32(4, Math.round(italicAngle * 65536));
    dv.setInt16(8, underlinePosition);
    dv.setInt16(10, underlineThickness);
    dv.setUint32(12, 0);   // isFixedPitch
    dv.setUint32(16, 0);   // minMemType42
    dv.setUint32(20, 0);   // maxMemType42
    dv.setUint32(24, 0);   // minMemType1
    dv.setUint32(28, 0);   // maxMemType1
    return new Uint8Array(buf);
}

/** v2.0 `post`: 32-byte header + numberOfGlyphs + one uint16 per glyph
 * (kept within the Mac standard 258 so no pascal-string payload is
 * needed). */
function buildPostV2(numberOfGlyphs, indices) {
    const header = buildPostHeader(0x00020000);
    const rest = new Uint8Array(2 + indices.length * 2);
    const dv = new DataView(rest.buffer);
    dv.setUint16(0, numberOfGlyphs);
    indices.forEach((idx, i) => dv.setUint16(2 + i * 2, idx));
    const out = new Uint8Array(header.length + rest.length);
    out.set(header, 0);
    out.set(rest, header.length);
    return out;
}

function makeFont() {
    const tri = buildSimpleGlyph(
        [{ x: 0, y: 0, onCurve: true }, { x: 100, y: 0, onCurve: true }, { x: 50, y: 100, onCurve: true }],
        { xMin: 0, yMin: 0, xMax: 100, yMax: 100 });
    const square = buildSimpleGlyph(
        [{ x: 0, y: 0, onCurve: true }, { x: 200, y: 0, onCurve: true },
         { x: 200, y: 200, onCurve: true }, { x: 0, y: 200, onCurve: true }],
        { xMin: 0, yMin: 0, xMax: 200, yMax: 200 });
    const ttf = buildTtf({
        glyphs:   [new Uint8Array(0), tri, square],
        advances: [500, 700, 800]
    });
    return fontsRead(ttf);
}

describe('embedSubsetForPdf', () => {
    test('module metadata', () => { expect(embedSubsetForPdf.name).toBe('embedSubsetForPdf'); });

    test('subsets a TrueType font for a single code point', () => {
        const font = makeFont();
        const r = subsetForPdf(font, [0x41]);
        expect(r.subsetBytes).toBeInstanceOf(Uint8Array);
        expect(r.subsetBytes.length).toBeGreaterThan(100);
        expect(r.gidMap.size).toBeGreaterThanOrEqual(2);   // .notdef + 'A'
        expect(r.toUnicodeCmap).toContain('/CIDInit');
        expect(r.postScriptName).toMatch(/^[A-Z]{6}\+/);
        expect(r.fontDescriptor.FontFile2).toBeInstanceOf(Uint8Array);
        expect(r.widths.length).toBe(r.gidMap.size);
    });

    test('subset is re-readable as a valid font', () => {
        const font = makeFont();
        const r = subsetForPdf(font, [0x41, 0x42]);
        const subFont = fontsRead(r.subsetBytes);
        expect(subFont.numGlyphs).toBeGreaterThanOrEqual(3);   // notdef + A + B
        expect(subFont.glyphIndexForCodePoint(0x41)).toBeGreaterThan(0);
    });

    test('rejects font without glyf/loca', () => {
        let threw = null;
        try {
            subsetForPdf({ head: {} }, [0x41]);
        } catch (e) {
            threw = e;
        }
        expect(threw).toBeInstanceOf(ContractError);
        expect(threw.code).toBe('fonts/subset-bad-font');
    });

    test('rejects null font with fonts/subset-bad-font', () => {
        let threw = null;
        try {
            subsetForPdf(null, [0x41]);
        } catch (e) {
            threw = e;
        }
        expect(threw).toBeInstanceOf(ContractError);
        expect(threw.code).toBe('fonts/subset-bad-font');
    });

    test('rejects font with glyf but no loca', () => {
        let threw = null;
        try {
            subsetForPdf({ head: {}, glyphTable: [] }, [0x41]);
        } catch (e) {
            threw = e;
        }
        expect(threw).toBeInstanceOf(ContractError);
        expect(threw.code).toBe('fonts/subset-bad-font');
    });

    test('rejects font with loca but no glyf', () => {
        let threw = null;
        try {
            subsetForPdf({ head: {}, loca: [] }, [0x41]);
        } catch (e) {
            threw = e;
        }
        expect(threw).toBeInstanceOf(ContractError);
        expect(threw.code).toBe('fonts/subset-bad-font');
    });

    test('rejects a font read without glyf/loca (OPENTYPE flavour, no outlines)', () => {
        // buildTtf always emits glyf/loca, so take its tables, drop the two
        // outline tables and repack as an OPENTYPE-flavoured SFNT. fonts.read
        // accepts it (glyphTable/loca stay null); subsetForPdf must reject it.
        const { parseSfnt, packSfnt, SFNT_FLAVOR } = _rootRt.resolve('fontSfnt');
        const tri = buildSimpleGlyph(
            [{ x: 0, y: 0, onCurve: true }, { x: 100, y: 0, onCurve: true }, { x: 50, y: 100, onCurve: true }],
            { xMin: 0, yMin: 0, xMax: 100, yMax: 100 });
        const full = parseSfnt(buildTtf({ glyphs: [new Uint8Array(0), tri], advances: [500, 700] }));
        const tables = {};
        for (const [tag, t] of Object.entries(full.tables)) {
            if (tag !== 'glyf' && tag !== 'loca') tables[tag] = t.bytes;
        }
        const font = fontsRead(packSfnt({ flavor: SFNT_FLAVOR.OPENTYPE, tables }));
        expect(font.glyphTable).toBeNull();
        expect(font.loca).toBeNull();
        let threw = null;
        try {
            subsetForPdf(font, [0x41]);
        } catch (e) {
            threw = e;
        }
        expect(threw).toBeInstanceOf(ContractError);
        expect(threw.code).toBe('fonts/subset-bad-font');
    });

    test('produces deterministic prefix for the same code-point set', () => {
        const font = makeFont();
        const a = subsetForPdf(font, [0x41]);
        const b = subsetForPdf(font, [0x41]);
        expect(a.postScriptName).toBe(b.postScriptName);
    });

    describe('post table (BL-1256)', () => {
        test('NON-VACUITY: a v2.0 post whose numberOfGlyphs mismatches the subset really does fail to parse', () => {
            const v2Bytes = buildPostV2(3, [0, 1, 2]);
            // the source font declares 3 glyphs (numGlyphs is the correct
            // count for the SOURCE) but the subset below keeps only 2
            // (.notdef + 'A') — parsing the source table against the
            // subset's numGlyphs is exactly the failing shape this fix
            // must avoid reproducing.
            let threw = null;
            try { parsePost(v2Bytes, 2); } catch (e) { threw = e; }
            expect(threw).not.toBeNull();
            expect(threw.code).toBe('fonts/post-num-mismatch');
        });

        test('REAL-SHAPE: a v2.0 source post is re-versioned to 3.0 and the subset re-reads without throwing', () => {
            const font = makeFont();
            const v2Bytes = buildPostV2(3, [0, 1, 2]);
            font.rawSfnt.tables.post = { bytes: v2Bytes };

            const r = subsetForPdf(font, [0x41]);
            expect(() => fontsRead(r.subsetBytes)).not.toThrow();

            const subFont = fontsRead(r.subsetBytes);
            const postBytes = subFont.rawSfnt.tables.post.bytes;
            expect(postBytes.length).toBe(32);
            expect([...postBytes.subarray(0, 4)]).toEqual([0, 3, 0, 0]);
            expect([...postBytes.subarray(4, 32)]).toEqual([...v2Bytes.subarray(4, 32)]);
        });

        test('v1.0 source post is re-versioned to 3.0, header bytes 4..31 preserved', () => {
            const font = makeFont();
            const v1Bytes = buildPostHeader(0x00010000, { italicAngle: -2.5, underlinePosition: -100, underlineThickness: 60 });
            font.rawSfnt.tables.post = { bytes: v1Bytes };

            const r = subsetForPdf(font, [0x41]);
            const subFont = fontsRead(r.subsetBytes);
            const postBytes = subFont.rawSfnt.tables.post.bytes;
            expect(postBytes.length).toBe(32);
            expect([...postBytes.subarray(0, 4)]).toEqual([0, 3, 0, 0]);
            expect([...postBytes.subarray(4, 32)]).toEqual([...v1Bytes.subarray(4, 32)]);
        });

        test('v3.0 source post is copied byte-identical', () => {
            const font = makeFont();
            const v3Bytes = buildPostHeader(0x00030000, { italicAngle: 1.25, underlinePosition: -80, underlineThickness: 40 });
            font.rawSfnt.tables.post = { bytes: v3Bytes };

            const r = subsetForPdf(font, [0x41]);
            const subFont = fontsRead(r.subsetBytes);
            expect([...subFont.rawSfnt.tables.post.bytes]).toEqual([...v3Bytes]);
        });

        test('absent source post → no post table emitted', () => {
            const font = makeFont();
            expect(font.rawSfnt.tables.post).toBeUndefined();

            const r = subsetForPdf(font, [0x41]);
            const subFont = fontsRead(r.subsetBytes);
            expect(subFont.rawSfnt.tables.post).toBeUndefined();
        });

        test('source post < 32 bytes → no post table emitted', () => {
            const font = makeFont();
            font.rawSfnt.tables.post = { bytes: new Uint8Array(10) };

            const r = subsetForPdf(font, [0x41]);
            const subFont = fontsRead(r.subsetBytes);
            expect(subFont.rawSfnt.tables.post).toBeUndefined();
        });
    });
});
