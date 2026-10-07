// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Shared test helpers for the `tests/` integration suite.
 * Mirror of `ooxml/tests/_helpers/build.js`. These helpers build common
 * fonts artefacts (a minimal TTF, a single glyph, …) so that
 * integration tests don't repeat the (verbose) raw encoding boilerplate.
 *
 * **Not** exported from the public package surface — used only by
 * `tests/`.
 */

import { testRuntime } from '../../src/_test-runtime.js';
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { encodeHead, HEAD_MAGIC } = testRuntime.resolve('tableHead');
const { encodeHhea } = testRuntime.resolve('tableHhea');
const { encodeMaxp, MAXP_V1_0 } = testRuntime.resolve('tableMaxp');
const { encodeHmtx } = testRuntime.resolve('tableHmtx');
const { encodeLoca } = testRuntime.resolve('tableLoca');
const { encodeName, PLATFORM, NAME_ID } = testRuntime.resolve('tableName');
const { packSfnt, SFNT_FLAVOR } = testRuntime.resolve('fontSfnt');

/**
 * Build a glyf entry for a single contour described as `points` (each
 * `{ x, y, onCurve }`). All flags are computed as int16 deltas (no
 * compression) — keeps tests independent of a write-side optimiser.
 */
export function buildSimpleGlyph(points, bbox) {
    const w = new BinaryWriter();
    w.writeInt16(1);
    w.writeInt16(bbox.xMin).writeInt16(bbox.yMin)
     .writeInt16(bbox.xMax).writeInt16(bbox.yMax);
    w.writeUint16(points.length - 1);
    w.writeUint16(0);
    for (const p of points) w.writeUint8(p.onCurve ? 1 : 0);
    let prevX = 0;
    for (const p of points) { w.writeInt16(p.x - prevX); prevX = p.x; }
    let prevY = 0;
    for (const p of points) { w.writeInt16(p.y - prevY); prevY = p.y; }
    return w.finalize();
}

/**
 * Build a cmap format-4 table mapping one ASCII range
 * `[firstCode..lastCode]` → `[firstGid..]`.
 */
export function buildCmap(firstCode, lastCode, firstGid) {
    const sub = new BinaryWriter();
    sub.writeUint16(4).writeUint16(0).writeUint16(0);
    sub.writeUint16(4).writeUint16(0).writeUint16(0).writeUint16(0);
    sub.writeUint16(lastCode).writeUint16(0xFFFF);
    sub.writeUint16(0);
    sub.writeUint16(firstCode).writeUint16(0xFFFF);
    sub.writeInt16(firstGid - firstCode).writeInt16(1);
    sub.writeUint16(0).writeUint16(0);
    const sb = sub.finalize();
    sb[2] = (sb.length >>> 8) & 0xFF; sb[3] = sb.length & 0xFF;
    const top = new BinaryWriter();
    top.writeUint16(0).writeUint16(1).writeUint16(3).writeUint16(1).writeUint32(12);
    top.writeBytes(sb);
    return top.finalize();
}

/**
 * Build a full minimal TTF carrying `glyphs` (array of `glyf` byte
 * blobs ; element 0 = `.notdef`, usually empty).
 */
export function buildTtf({ glyphs, advances, family = 'AwaTest', firstCode = 0x41 }) {
    if (glyphs[0] && glyphs[0].length > 0)
        throw new Error('glyph 0 (.notdef) should be empty Uint8Array(0)');
    const numGlyphs = glyphs.length;
    // glyf blob + loca offsets (pad each glyph to even alignment)
    const blob = new BinaryWriter();
    const offsets = new Uint32Array(numGlyphs + 1);
    for (let i = 0; i < numGlyphs; i++) {
        offsets[i] = blob.length;
        if (glyphs[i].length) {
            blob.writeBytes(glyphs[i]);
            blob.padTo(2);
        }
    }
    offsets[numGlyphs] = blob.length;
    const glyfBytes = blob.finalize();
    const loca = encodeLoca(offsets);

    const head = encodeHead({
        majorVersion: 1, minorVersion: 0, fontRevision: 1,
        checksumAdjustment: 0, magicNumber: HEAD_MAGIC,
        flags: 0x000B, unitsPerEm: 1000, created: 0, modified: 0,
        xMin: 0, yMin: 0, xMax: 1000, yMax: 1000,
        macStyle: 0, lowestRecPPEM: 8, fontDirectionHint: 2,
        indexToLocFormat: loca.indexToLocFormat, glyphDataFormat: 0
    });
    const maxp = encodeMaxp({
        version: MAXP_V1_0, numGlyphs,
        maxPoints: 100, maxContours: 10,
        maxCompositePoints: 0, maxCompositeContours: 0,
        maxZones: 2, maxTwilightPoints: 0,
        maxStorage: 0, maxFunctionDefs: 0, maxInstructionDefs: 0,
        maxStackElements: 0, maxSizeOfInstructions: 0,
        maxComponentElements: 0, maxComponentDepth: 0
    });
    const metrics = advances.map(a => ({ advanceWidth: a, lsb: 0 }));
    const hmtx = encodeHmtx({ metrics });
    const hhea = encodeHhea({
        ascender: 800, descender: -200, lineGap: 0,
        advanceWidthMax: Math.max(...advances),
        minLeftSideBearing: 0, minRightSideBearing: 0,
        xMaxExtent: 1000,
        caretSlopeRise: 1, caretSlopeRun: 0, caretOffset: 0,
        metricDataFormat: 0, numberOfHMetrics: hmtx.numberOfHMetrics
    });
    const name = encodeName({
        records: [
            { platformID: PLATFORM.WINDOWS, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FONT_FAMILY,    string: family },
            { platformID: PLATFORM.WINDOWS, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.POSTSCRIPT_NAME, string: family }
        ]
    });
    const cmapBytes = buildCmap(firstCode, firstCode + numGlyphs - 2, 1);
    return packSfnt({
        flavor: SFNT_FLAVOR.TRUETYPE,
        tables: { head, hhea, maxp, hmtx: hmtx.bytes, cmap: cmapBytes, name, loca: loca.bytes, glyf: glyfBytes }
    });
}
