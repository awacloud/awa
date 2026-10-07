// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableGlyf } from './glyf.js';
import { testRuntime } from './_test-runtime.js';
const { parseGlyph, parseGlyf, GLYF_FLAG, COMPONENT_FLAG } = testRuntime.resolve('tableGlyf');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

function buildSimpleTriangle() {
    // 1 contour, 3 points (0,0)->(100,0)->(50,100), all on-curve
    const w = new BinaryWriter();
    w.writeInt16(1);            // numberOfContours
    w.writeInt16(0); w.writeInt16(0); w.writeInt16(100); w.writeInt16(100);  // bbox
    w.writeUint16(2);           // endPts[0] = lastPointIndex
    w.writeUint16(0);           // instructionLength
    // Flags: all 3 on-curve, X and Y are int16 (no SHORT bit, no SAME bit)
    const f = GLYF_FLAG.ON_CURVE;
    w.writeUint8(f); w.writeUint8(f); w.writeUint8(f);
    // X coords as int16 deltas: 0, +100, -50
    w.writeInt16(0); w.writeInt16(100); w.writeInt16(-50);
    // Y coords: 0, 0, +100
    w.writeInt16(0); w.writeInt16(0); w.writeInt16(100);
    return w.finalize();
}

describe('tableGlyf', () => {
    test('module metadata', () => { expect(tableGlyf.name).toBe('tableGlyf'); });

    test('empty bytes -> null glyph', () => {
        expect(parseGlyph(new Uint8Array(0))).toBeNull();
    });

    test('simple triangle parsed correctly', () => {
        const g = parseGlyph(buildSimpleTriangle());
        expect(g.kind).toBe('simple');
        expect(g.numberOfContours).toBe(1);
        expect(g.points.length).toBe(3);
        expect(g.points[0]).toEqual({ x: 0,   y: 0,   onCurve: true });
        expect(g.points[1]).toEqual({ x: 100, y: 0,   onCurve: true });
        expect(g.points[2]).toEqual({ x: 50,  y: 100, onCurve: true });
        expect(g.bbox).toEqual({ xMin: 0, yMin: 0, xMax: 100, yMax: 100 });
    });

    test('short-encoded deltas', () => {
        // Same triangle but using X_SHORT + X_SAME_OR_POS (positive sign)
        const w = new BinaryWriter();
        w.writeInt16(1);
        w.writeInt16(0); w.writeInt16(0); w.writeInt16(100); w.writeInt16(100);
        w.writeUint16(2); w.writeUint16(0);
        // flag for pt0: ON_CURVE + Y_SAME (no Y delta, y=0) + X_SAME (no X delta)
        const F0 = GLYF_FLAG.ON_CURVE | GLYF_FLAG.X_SAME_OR_POS | GLYF_FLAG.Y_SAME_OR_POS;
        // flag for pt1: ON_CURVE + X_SHORT + X_SAME_OR_POS(positive) + Y_SAME
        const F1 = GLYF_FLAG.ON_CURVE | GLYF_FLAG.X_SHORT | GLYF_FLAG.X_SAME_OR_POS | GLYF_FLAG.Y_SAME_OR_POS;
        // flag for pt2: ON_CURVE + X_SHORT + (negative -> X_SAME_OR_POS clear) + Y_SHORT positive
        const F2 = GLYF_FLAG.ON_CURVE | GLYF_FLAG.X_SHORT | GLYF_FLAG.Y_SHORT | GLYF_FLAG.Y_SAME_OR_POS;
        w.writeUint8(F0); w.writeUint8(F1); w.writeUint8(F2);
        // X coords: (X_SAME) 0, (X_SHORT pos) 100, (X_SHORT neg) 50
        w.writeUint8(100);   // pt1 dx = +100
        w.writeUint8(50);    // pt2 dx = -50
        // Y coords: pt0 same (0), pt1 same (0), pt2 short positive 100
        w.writeUint8(100);
        const g = parseGlyph(w.finalize());
        expect(g.points[0]).toEqual({ x: 0,   y: 0,   onCurve: true });
        expect(g.points[1]).toEqual({ x: 100, y: 0,   onCurve: true });
        expect(g.points[2]).toEqual({ x: 50,  y: 100, onCurve: true });
    });

    test('composite glyph with single component', () => {
        const w = new BinaryWriter();
        w.writeInt16(-1);   // composite
        w.writeInt16(0); w.writeInt16(0); w.writeInt16(0); w.writeInt16(0);  // bbox
        // flags: ARGS_ARE_XY_VALUES only (8-bit signed args)
        w.writeUint16(COMPONENT_FLAG.ARGS_ARE_XY_VALUES);
        w.writeUint16(42);  // glyphIndex
        w.writeInt8(10); w.writeInt8(-5);
        const g = parseGlyph(w.finalize());
        expect(g.kind).toBe('composite');
        expect(g.components.length).toBe(1);
        expect(g.components[0].glyphIndex).toBe(42);
        expect(g.components[0].arg1).toBe(10);
        expect(g.components[0].arg2).toBe(-5);
        expect(g.components[0].transform).toEqual({ a: 1, b: 0, c: 0, d: 1 });
    });

    test('parseGlyf with loca offsets', () => {
        const tri = buildSimpleTriangle();
        const blob = new Uint8Array(tri.length * 2);
        blob.set(tri, 0);
        blob.set(tri, tri.length);
        const loca = new Uint32Array([0, tri.length, tri.length * 2]);
        const glyphs = parseGlyf(blob, loca);
        expect(glyphs.length).toBe(2);
        expect(glyphs[0].points.length).toBe(3);
        expect(glyphs[1].points.length).toBe(3);
    });

    test('rejects truncated glyph header', () => {
        expect(() => parseGlyph(new Uint8Array(5))).toThrow(ParseError);
    });

    test('parseGlyf rejects bad loca range', () => {
        expect(() => parseGlyf(new Uint8Array(4), new Uint32Array([0, 10]))).toThrow(ParseError);
    });
});
