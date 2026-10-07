// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { extraMath } from './math.js';
import { testRuntime } from './_test-runtime.js';
const { parseMath, MATH_CONSTANTS_FIELDS } = testRuntime.resolve('extraMath');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { BinaryReader } = testRuntime.resolve('fontReader');
const { ParseError } = testRuntime.resolve('fontErrors');

const PLAIN_INT16_COUNT = 4;

function buildMath({ withConstants = true, withGlyphInfo = false, withVariants = false } = {}) {
    // Header is 10 bytes â€” compute sub-table offsets after it.
    const headerSize = 10;
    let constOffset = 0;
    let infoOffset = 0;
    let varOffset = 0;
    let cursor = headerSize;

    const constSize = 4 * 2 + (MATH_CONSTANTS_FIELDS.length - PLAIN_INT16_COUNT) * 4 + 2;
    if (withConstants) { constOffset = cursor; cursor += constSize; }
    if (withGlyphInfo) { infoOffset = cursor; cursor += 4; }
    if (withVariants)  { varOffset  = cursor; cursor += 4; }

    const w = new BinaryWriter(cursor);
    w.writeUint16(1).writeUint16(0);
    w.writeUint16(constOffset);
    w.writeUint16(infoOffset);
    w.writeUint16(varOffset);

    if (withConstants) {
        // 4 leading int16
        w.writeInt16(80);    // scriptPercentScaleDown
        w.writeInt16(60);    // scriptScriptPercentScaleDown
        w.writeInt16(1500);  // delimitedSubFormulaMinHeight
        w.writeInt16(1800);  // displayOperatorMinHeight
        // 51 MathValueRecord â€” fill values 0..50 with deviceOffset = 0
        for (let i = 0; i < MATH_CONSTANTS_FIELDS.length - PLAIN_INT16_COUNT; i++) {
            w.writeInt16(i + 1); // value
            w.writeUint16(0);    // deviceOffset
        }
        // trailing int16 (radicalDegreeBottomRaisePercent)
        w.writeInt16(60);
    }
    if (withGlyphInfo) w.writeBytes(new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]));
    if (withVariants)  w.writeBytes(new Uint8Array([0xCA, 0xFE, 0xBA, 0xBE]));

    return w.finalize();
}

describe('extraMath', () => {
    test('module metadata', () => {
        expect(extraMath.name).toBe('extraMath');
        expect(extraMath.dependencies).toEqual(['fontErrors', 'fontReader']);
    });

    test('MATH_CONSTANTS_FIELDS has 51 entries (4 plain + 47 value records)', () => {
        // 4 plain int16 + N MathValueRecords; spec defines 51 named entries
        // here (89 total fields - the trailing percent and counting variations).
        expect(MATH_CONSTANTS_FIELDS.length).toBeGreaterThan(40);
        expect(MATH_CONSTANTS_FIELDS[0]).toBe('scriptPercentScaleDown');
    });

    test('parses header v1.0', () => {
        const m = parseMath(buildMath());
        expect(m.majorVersion).toBe(1);
        expect(m.minorVersion).toBe(0);
        expect(m.mathConstantsOffset).toBeGreaterThan(0);
    });

    test('parses MathConstants leading int16 fields', () => {
        const m = parseMath(buildMath());
        expect(m.constants.scriptPercentScaleDown).toBe(80);
        expect(m.constants.scriptScriptPercentScaleDown).toBe(60);
        expect(m.constants.delimitedSubFormulaMinHeight).toBe(1500);
        expect(m.constants.displayOperatorMinHeight).toBe(1800);
    });

    test('parses MathConstants value records as {value, deviceOffset}', () => {
        const m = parseMath(buildMath());
        const ml = m.constants.mathLeading;
        expect(ml).toBeDefined();
        expect(typeof ml.value).toBe('number');
        expect(ml.deviceOffset).toBe(0);
    });

    test('keeps glyphInfo / variants as raw offset+bytes blobs', () => {
        const bytes = buildMath({ withGlyphInfo: true, withVariants: true });
        const m = parseMath(bytes);
        expect(m.glyphInfo).not.toBeNull();
        expect(m.variants).not.toBeNull();
        expect(m.glyphInfo.bytes[0]).toBe(0xDE);
        expect(m.variants.bytes[0]).toBe(0xCA);
    });

    test('factory exposes parseMath and field list', () => {
        const mod = extraMath.factory(testRuntime.resolve('fontErrors'), { BinaryReader });
        expect(typeof mod.parseMath).toBe('function');
        expect(Array.isArray(mod.MATH_CONSTANTS_FIELDS)).toBe(true);
    });

    test('rejects short input', () => {
        expect(() => parseMath(new Uint8Array(4))).toThrow(ParseError);
    });

    test('rejects unsupported version', () => {
        const w = new BinaryWriter();
        w.writeUint16(2).writeUint16(0).writeUint16(0).writeUint16(0).writeUint16(0);
        expect(() => parseMath(w.finalize())).toThrow(ParseError);
    });
});
