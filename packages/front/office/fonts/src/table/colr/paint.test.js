// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * COLR v1 Paint decoding against the OpenType 1.9 COLR specification
 * (§ "Paint tables", formats 1-32). Every fixture is hand-assembled
 * big-endian bytes and uses LITERAL format numbers (never the enum), so the
 * spec numbering is pinned independently of `PAINT_FORMAT`.
 */

import { describe, test, expect } from 'bun:test';
import { tableColrPaint } from './paint.js';
import { testRuntime } from '../_test-runtime.js';

const { PAINT_FORMAT, decodePaint, decodePaintGraph } = testRuntime.resolve('tableColrPaint');

// ── hand assembly (big-endian, per the OpenType data types) ─────────────
const u8  = (v) => [v & 0xFF];
const u16 = (v) => [(v >>> 8) & 0xFF, v & 0xFF];
const i16 = (v) => u16(v & 0xFFFF);                 // FWORD / F2DOT14 raw
const u24 = (v) => [(v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
const u32 = (v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
const bytes = (...parts) => Uint8Array.from(parts.flat());
const decode = (...parts) => decodePaint(bytes(...parts), 0);

// F2DOT14 raw values and their decoded floats.
const F2_HALF = 0x2000;          //  0.5
const F2_NEG_QUARTER = -0x1000;  // -0.25
const F2_ONE_HALF = 0x6000;      //  1.5
const F2_NEG_TWO = -0x8000;      // -2.0

// Spec table names, formats 1-32 (OpenType 1.9 COLR § Paint tables).
const SPEC_NAMES = [
    null,
    'PaintColrLayers', 'PaintSolid', 'PaintVarSolid',
    'PaintLinearGradient', 'PaintVarLinearGradient',
    'PaintRadialGradient', 'PaintVarRadialGradient',
    'PaintSweepGradient', 'PaintVarSweepGradient',
    'PaintGlyph', 'PaintColrGlyph',
    'PaintTransform', 'PaintVarTransform',
    'PaintTranslate', 'PaintVarTranslate',
    'PaintScale', 'PaintVarScale',
    'PaintScaleAroundCenter', 'PaintVarScaleAroundCenter',
    'PaintScaleUniform', 'PaintVarScaleUniform',
    'PaintScaleUniformAroundCenter', 'PaintVarScaleUniformAroundCenter',
    'PaintRotate', 'PaintVarRotate',
    'PaintRotateAroundCenter', 'PaintVarRotateAroundCenter',
    'PaintSkew', 'PaintVarSkew',
    'PaintSkewAroundCenter', 'PaintVarSkewAroundCenter',
    'PaintComposite'
];
const toKey = (specName) => specName.replace(/^Paint/, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();

describe('tableColrPaint', () => {
    test('module metadata', () => {
        expect(tableColrPaint.name).toBe('tableColrPaint');
        expect(tableColrPaint.dependencies).toEqual(['fontErrors', 'fontReader']);
    });

    describe('PAINT_FORMAT enum', () => {
        test('names formats 1-32 exactly, values unique', () => {
            const values = Object.values(PAINT_FORMAT).sort((a, b) => a - b);
            expect(values).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
            expect(new Set(values).size).toBe(32);
            expect(Object.keys(PAINT_FORMAT).length).toBe(32);
            expect(Object.isFrozen(PAINT_FORMAT)).toBe(true);
        });

        test('keys are the SCREAMING_SNAKE spec names', () => {
            for (let f = 1; f <= 32; f++)
                expect(PAINT_FORMAT[toKey(SPEC_NAMES[f])]).toBe(f);
        });

        test('renumbered keys carry the spec numbers (BL-1929)', () => {
            expect(PAINT_FORMAT.VAR_SCALE).toBe(17);
            expect(PAINT_FORMAT.SCALE_AROUND_CENTER).toBe(18);
            expect(PAINT_FORMAT.ROTATE).toBe(24);
            expect(PAINT_FORMAT.SKEW).toBe(28);
            expect(PAINT_FORMAT.COMPOSITE).toBe(32);
        });
    });

    test('every format 1-32 decodes with its spec name (never parsed: false)', () => {
        for (let f = 1; f <= 32; f++) {
            const p = decodePaint(new Uint8Array(64).fill(0).map((_, i) => (i === 0 ? f : 0)), 0);
            expect(p.format).toBe(f);
            expect(p.name).toBe(SPEC_NAMES[f]);
            expect(p.parsed).toBeUndefined();
        }
    });

    test('formats outside 1-32 stay { format, parsed: false }', () => {
        expect(decode(u8(0), u32(0))).toEqual({ format: 0, parsed: false });
        expect(decode(u8(33), u32(0))).toEqual({ format: 33, parsed: false });
    });

    test('BL-1929: format 18 decodes as PaintScaleAroundCenter, not a rotation', () => {
        const p = decode(u8(18), u24(0x10), i16(F2_HALF), i16(F2_ONE_HALF), i16(-300), i16(400));
        expect(p).toEqual({
            format: 18, name: 'PaintScaleAroundCenter',
            paintOffset: 0x10, scaleX: 0.5, scaleY: 1.5, centerX: -300, centerY: 400
        });
        expect(p.angle).toBeUndefined();
    });

    describe('decodePaint per format (12-32)', () => {
        test('12 PaintTransform', () => {
            expect(decode(u8(12), u24(0x010203), u24(0x040506))).toEqual({
                format: 12, name: 'PaintTransform', paintOffset: 0x010203, affineOffset: 0x040506
            });
        });

        test('13 PaintVarTransform', () => {
            expect(decode(u8(13), u24(9), u24(0x20))).toEqual({
                format: 13, name: 'PaintVarTransform', paintOffset: 9, affineOffset: 0x20
            });
        });

        test('14 PaintTranslate', () => {
            expect(decode(u8(14), u24(7), i16(-7), i16(9))).toEqual({
                format: 14, name: 'PaintTranslate', paintOffset: 7, dx: -7, dy: 9
            });
        });

        test('15 PaintVarTranslate', () => {
            expect(decode(u8(15), u24(7), i16(1), i16(-2), u32(0x01020304))).toEqual({
                format: 15, name: 'PaintVarTranslate', paintOffset: 7, dx: 1, dy: -2, varIndexBase: 0x01020304
            });
        });

        test('16 PaintScale', () => {
            expect(decode(u8(16), u24(4), i16(F2_HALF), i16(F2_NEG_QUARTER))).toEqual({
                format: 16, name: 'PaintScale', paintOffset: 4, scaleX: 0.5, scaleY: -0.25
            });
        });

        test('17 PaintVarScale', () => {
            expect(decode(u8(17), u24(4), i16(F2_HALF), i16(F2_ONE_HALF), u32(0xFFFFFFFE))).toEqual({
                format: 17, name: 'PaintVarScale', paintOffset: 4,
                scaleX: 0.5, scaleY: 1.5, varIndexBase: 0xFFFFFFFE
            });
        });

        test('18 PaintScaleAroundCenter', () => {
            expect(decode(u8(18), u24(4), i16(F2_NEG_TWO), i16(F2_HALF), i16(10), i16(-20))).toEqual({
                format: 18, name: 'PaintScaleAroundCenter', paintOffset: 4,
                scaleX: -2, scaleY: 0.5, centerX: 10, centerY: -20
            });
        });

        test('19 PaintVarScaleAroundCenter', () => {
            expect(decode(u8(19), u24(4), i16(F2_HALF), i16(F2_HALF), i16(-1), i16(2), u32(77))).toEqual({
                format: 19, name: 'PaintVarScaleAroundCenter', paintOffset: 4,
                scaleX: 0.5, scaleY: 0.5, centerX: -1, centerY: 2, varIndexBase: 77
            });
        });

        test('20 PaintScaleUniform', () => {
            expect(decode(u8(20), u24(4), i16(F2_ONE_HALF))).toEqual({
                format: 20, name: 'PaintScaleUniform', paintOffset: 4, scale: 1.5
            });
        });

        test('21 PaintVarScaleUniform', () => {
            expect(decode(u8(21), u24(4), i16(F2_NEG_QUARTER), u32(5))).toEqual({
                format: 21, name: 'PaintVarScaleUniform', paintOffset: 4, scale: -0.25, varIndexBase: 5
            });
        });

        test('22 PaintScaleUniformAroundCenter', () => {
            expect(decode(u8(22), u24(4), i16(F2_HALF), i16(-32768), i16(32767))).toEqual({
                format: 22, name: 'PaintScaleUniformAroundCenter', paintOffset: 4,
                scale: 0.5, centerX: -32768, centerY: 32767
            });
        });

        test('23 PaintVarScaleUniformAroundCenter', () => {
            expect(decode(u8(23), u24(4), i16(F2_HALF), i16(3), i16(4), u32(6))).toEqual({
                format: 23, name: 'PaintVarScaleUniformAroundCenter', paintOffset: 4,
                scale: 0.5, centerX: 3, centerY: 4, varIndexBase: 6
            });
        });

        test('24 PaintRotate', () => {
            expect(decode(u8(24), u24(4), i16(F2_HALF))).toEqual({
                format: 24, name: 'PaintRotate', paintOffset: 4, angle: 0.5
            });
        });

        test('25 PaintVarRotate', () => {
            expect(decode(u8(25), u24(4), i16(F2_NEG_QUARTER), u32(8))).toEqual({
                format: 25, name: 'PaintVarRotate', paintOffset: 4, angle: -0.25, varIndexBase: 8
            });
        });

        test('26 PaintRotateAroundCenter', () => {
            expect(decode(u8(26), u24(4), i16(F2_ONE_HALF), i16(100), i16(-100))).toEqual({
                format: 26, name: 'PaintRotateAroundCenter', paintOffset: 4,
                angle: 1.5, centerX: 100, centerY: -100
            });
        });

        test('27 PaintVarRotateAroundCenter', () => {
            expect(decode(u8(27), u24(4), i16(F2_HALF), i16(5), i16(6), u32(9))).toEqual({
                format: 27, name: 'PaintVarRotateAroundCenter', paintOffset: 4,
                angle: 0.5, centerX: 5, centerY: 6, varIndexBase: 9
            });
        });

        test('28 PaintSkew', () => {
            expect(decode(u8(28), u24(4), i16(F2_HALF), i16(F2_NEG_QUARTER))).toEqual({
                format: 28, name: 'PaintSkew', paintOffset: 4, xSkewAngle: 0.5, ySkewAngle: -0.25
            });
        });

        test('29 PaintVarSkew', () => {
            expect(decode(u8(29), u24(4), i16(F2_NEG_QUARTER), i16(F2_HALF), u32(10))).toEqual({
                format: 29, name: 'PaintVarSkew', paintOffset: 4,
                xSkewAngle: -0.25, ySkewAngle: 0.5, varIndexBase: 10
            });
        });

        test('30 PaintSkewAroundCenter', () => {
            expect(decode(u8(30), u24(4), i16(F2_HALF), i16(F2_HALF), i16(-7), i16(8))).toEqual({
                format: 30, name: 'PaintSkewAroundCenter', paintOffset: 4,
                xSkewAngle: 0.5, ySkewAngle: 0.5, centerX: -7, centerY: 8
            });
        });

        test('31 PaintVarSkewAroundCenter', () => {
            expect(decode(u8(31), u24(4), i16(F2_HALF), i16(F2_NEG_TWO), i16(1), i16(2), u32(11))).toEqual({
                format: 31, name: 'PaintVarSkewAroundCenter', paintOffset: 4,
                xSkewAngle: 0.5, ySkewAngle: -2, centerX: 1, centerY: 2, varIndexBase: 11
            });
        });

        test('32 PaintComposite', () => {
            expect(decode(u8(32), u24(0x0A), u8(3), u24(0x14))).toEqual({
                format: 32, name: 'PaintComposite',
                paintOffsetSrc: 0x0A, compositeMode: 3, paintOffsetDst: 0x14
            });
        });
    });

    test('decodePaint honours a non-zero start offset', () => {
        const p = decodePaint(bytes(u8(0xEE), u8(0xEE), u8(24), u24(4), i16(F2_HALF)), 2);
        expect(p).toEqual({ format: 24, name: 'PaintRotate', paintOffset: 4, angle: 0.5 });
    });

    test('decodePaintGraph resolves a format-27 child chain', () => {
        // @0: PaintVarRotateAroundCenter (1+3+2+2+2+4 = 14 bytes) -> child @16
        // @16: PaintSolid
        const buf = bytes(
            u8(27), u24(16), i16(F2_HALF), i16(1), i16(2), u32(3),
            u8(0), u8(0),
            u8(2), u16(4), i16(0x4000)
        );
        const tree = decodePaintGraph(buf, 0);
        expect(tree.name).toBe('PaintVarRotateAroundCenter');
        expect(tree.varIndexBase).toBe(3);
        expect(tree.paint.name).toBe('PaintSolid');
        expect(tree.paint.paletteIndex).toBe(4);
        expect(tree.paint.alpha).toBe(1);
        expect(tree.paint.offset).toBe(16);
    });

    test('decodePaint formats 1-11 carry their spec field sets', () => {
        expect(decode(u8(1), u8(3), u32(0x0100))).toEqual({
            format: 1, name: 'PaintColrLayers', numLayers: 3, firstLayerIndex: 0x0100
        });
        expect(decode(u8(3), u16(2), i16(F2_HALF), u32(4))).toEqual({
            format: 3, name: 'PaintVarSolid', paletteIndex: 2, alpha: 0.5, varIndexBase: 4
        });
        expect(decode(u8(4), u24(0x30), i16(1), i16(2), i16(3), i16(4), i16(5), i16(-6))).toEqual({
            format: 4, name: 'PaintLinearGradient', colorLineOffset: 0x30,
            x0: 1, y0: 2, x1: 3, y1: 4, x2: 5, y2: -6
        });
        expect(decode(u8(6), u24(0x30), i16(1), i16(2), u16(30), i16(4), i16(5), u16(60))).toEqual({
            format: 6, name: 'PaintRadialGradient', colorLineOffset: 0x30,
            x0: 1, y0: 2, r0: 30, x1: 4, y1: 5, r1: 60
        });
        expect(decode(u8(8), u24(0x30), i16(-1), i16(2), i16(0), i16(0x4000))).toEqual({
            format: 8, name: 'PaintSweepGradient', colorLineOffset: 0x30,
            centerX: -1, centerY: 2, startAngle: 0, endAngle: 1
        });
        expect(decode(u8(10), u24(6), u16(42))).toEqual({
            format: 10, name: 'PaintGlyph', paintOffset: 6, glyphID: 42
        });
        expect(decode(u8(11), u16(99))).toEqual({ format: 11, name: 'PaintColrGlyph', glyphID: 99 });
    });
});
