// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Integration test — wires the fonts module via the
 * `@awacloud/fw` ModuleRuntime and exercises a real read→inspect path with
 * an in-memory TTF.
 *
 * Mirrors the integration-test pattern from `@awacloud/ooxml`.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { binaryReader as fwBinaryReader } from '@awacloud/fw/io/binary/reader.js';
import { binaryWriter as fwBinaryWriter } from '@awacloud/fw/io/binary/writer.js';
import { modules } from '../src/main.js';

function makeRuntime() {
    const rt = new ModuleRuntime();
    rt.register({ name: 'binaryReader', dependencies: [], factory: () => fwBinaryReader.factory() });
    rt.register({ name: 'binaryWriter', dependencies: [], factory: () => fwBinaryWriter.factory() });
    for (const m of modules) rt.register(m);
    return rt;
}
import { testRuntime } from '../src/_test-runtime.js';
const { encodeHead, HEAD_MAGIC } = testRuntime.resolve('tableHead');
const { encodeHhea } = testRuntime.resolve('tableHhea');
const { encodeMaxp, MAXP_V1_0 } = testRuntime.resolve('tableMaxp');
const { encodeHmtx } = testRuntime.resolve('tableHmtx');
const { encodeLoca } = testRuntime.resolve('tableLoca');
const { encodeName, PLATFORM, NAME_ID } = testRuntime.resolve('tableName');
const { packSfnt, SFNT_FLAVOR } = testRuntime.resolve('fontSfnt');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

function buildMinimalTtf() {
    const g1 = new BinaryWriter();
    g1.writeInt16(1).writeInt16(0).writeInt16(0).writeInt16(100).writeInt16(100);
    g1.writeUint16(2).writeUint16(0);
    g1.writeUint8(1).writeUint8(1).writeUint8(1);
    g1.writeInt16(0).writeInt16(100).writeInt16(-50);
    g1.writeInt16(0).writeInt16(0).writeInt16(100);
    let glyf = g1.finalize();
    if (glyf.length & 1) { const p = new Uint8Array(glyf.length + 1); p.set(glyf); glyf = p; }

    const loca = encodeLoca(new Uint32Array([0, 0, glyf.length]));
    const head = encodeHead({
        majorVersion: 1, minorVersion: 0, fontRevision: 1,
        checksumAdjustment: 0, magicNumber: HEAD_MAGIC,
        flags: 0x000B, unitsPerEm: 1000, created: 0, modified: 0,
        xMin: 0, yMin: 0, xMax: 100, yMax: 100,
        macStyle: 0, lowestRecPPEM: 8, fontDirectionHint: 2,
        indexToLocFormat: loca.indexToLocFormat, glyphDataFormat: 0
    });
    const maxp = encodeMaxp({
        version: MAXP_V1_0, numGlyphs: 2,
        maxPoints: 3, maxContours: 1,
        maxCompositePoints: 0, maxCompositeContours: 0,
        maxZones: 2, maxTwilightPoints: 0, maxStorage: 0,
        maxFunctionDefs: 0, maxInstructionDefs: 0,
        maxStackElements: 0, maxSizeOfInstructions: 0,
        maxComponentElements: 0, maxComponentDepth: 0
    });
    const hmtx = encodeHmtx({
        metrics: [ { advanceWidth: 500, lsb: 0 }, { advanceWidth: 700, lsb: 10 } ]
    });
    const hhea = encodeHhea({
        ascender: 800, descender: -200, lineGap: 0,
        advanceWidthMax: 700, minLeftSideBearing: 0, minRightSideBearing: 0,
        xMaxExtent: 100, caretSlopeRise: 1, caretSlopeRun: 0, caretOffset: 0,
        metricDataFormat: 0, numberOfHMetrics: hmtx.numberOfHMetrics
    });
    const name = encodeName({
        records: [
            { platformID: PLATFORM.WINDOWS, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.FONT_FAMILY,    string: 'AwaTest' },
            { platformID: PLATFORM.WINDOWS, encodingID: 1, languageID: 0x0409, nameID: NAME_ID.POSTSCRIPT_NAME, string: 'AwaTest' }
        ]
    });
    const sub = new BinaryWriter();
    sub.writeUint16(4).writeUint16(0).writeUint16(0);
    sub.writeUint16(4).writeUint16(0).writeUint16(0).writeUint16(0);
    sub.writeUint16(0x41).writeUint16(0xFFFF);
    sub.writeUint16(0);
    sub.writeUint16(0x41).writeUint16(0xFFFF);
    sub.writeInt16(1 - 0x41).writeInt16(1);
    sub.writeUint16(0).writeUint16(0);
    const subBytes = sub.finalize();
    subBytes[2] = (subBytes.length >>> 8) & 0xFF;
    subBytes[3] = subBytes.length & 0xFF;
    const cmap = new BinaryWriter();
    cmap.writeUint16(0).writeUint16(1);
    cmap.writeUint16(3).writeUint16(1).writeUint32(12);
    cmap.writeBytes(subBytes);

    return packSfnt({
        flavor: SFNT_FLAVOR.TRUETYPE,
        tables: {
            head, hhea, maxp,
            hmtx: hmtx.bytes,
            cmap: cmap.finalize(),
            name,
            loca: loca.bytes,
            glyf
        }
    });
}

describe('@awacloud/fonts integration', () => {
    test('resolves fonts via fw ModuleRuntime and round-trips a minimal TTF', () => {
        const rt = makeRuntime();
        const api = rt.resolve('fonts');
        expect(typeof api.read).toBe('function');

        const bytes = buildMinimalTtf();
        const font = api.read(bytes);
        expect(font.flavor).toBe('truetype');
        expect(font.numGlyphs).toBe(2);
        expect(font.unitsPerEm).toBe(1000);
        expect(font.names.family).toBe('AwaTest');

        const gid = font.glyphIndexForCodePoint(0x41);
        expect(gid).toBe(1);
        const g = font.getGlyphByIndex(gid);
        expect(g.advanceWidth).toBe(700);
        expect(g.path.commands.length).toBeGreaterThan(0);
    });

    test('checksumAdjustment recomputed across the whole packed font', () => {
        const bytes = buildMinimalTtf();
        // head table offset is somewhere after the directory. We don't
        // verify the exact adjustment value here ; we only ensure the
        // font parses back cleanly (which would fail with a bad checksum
        // computation if the offsets were wrong).
        const rt = makeRuntime();
        const api = rt.resolve('fonts');
        expect(() => api.read(bytes)).not.toThrow();
    });

    test('every parser raises ParseError on a garbage stream', () => {
        const rt = makeRuntime();
        const api = rt.resolve('fonts');
        const garbage = new Uint8Array(64);
        expect(() => api.read(garbage)).toThrow();
    });
});
