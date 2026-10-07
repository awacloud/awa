// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontPath } from './path.js';
import { testRuntime } from './_test-runtime.js';
const { Path, pathFromSimpleGlyph } = testRuntime.resolve('fontPath');

describe('Path', () => {
    test('module metadata', () => { expect(fontPath.name).toBe('fontPath'); });

    test('basic commands + svg output', () => {
        const p = new Path();
        p.moveTo(0, 0).lineTo(100, 0).quadTo(150, 50, 100, 100).close();
        expect(p.toSvgPath()).toBe('M0 0 L100 0 Q150 50 100 100 Z');
    });

    test('bbox from anchor points', () => {
        const p = new Path();
        p.moveTo(0, 0).lineTo(100, 0).lineTo(50, 200).close();
        expect(p.bbox()).toEqual({ xMin: 0, yMin: 0, xMax: 100, yMax: 200 });
    });

    test('transform applies affine', () => {
        const p = new Path();
        p.moveTo(0, 0).lineTo(10, 0);
        p.transform({ a: 2, d: 2, e: 5, f: 5 });
        expect(p.commands[1]).toEqual({ type: 'L', x: 25, y: 5 });
    });

    test('pathFromSimpleGlyph triangle (all on-curve)', () => {
        const glyph = {
            kind: 'simple',
            endPtsOfContours: [2],
            points: [
                { x: 0,   y: 0,   onCurve: true },
                { x: 100, y: 0,   onCurve: true },
                { x: 50,  y: 100, onCurve: true }
            ]
        };
        const p = pathFromSimpleGlyph(glyph);
        expect(p.commands).toEqual([
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 100, y: 0 },
            { type: 'L', x: 50, y: 100 },
            { type: 'Z' }
        ]);
    });

    test('pathFromSimpleGlyph with off-curve control', () => {
        const glyph = {
            kind: 'simple',
            endPtsOfContours: [2],
            points: [
                { x: 0,   y: 0,   onCurve: true },
                { x: 50,  y: 100, onCurve: false },
                { x: 100, y: 0,   onCurve: true }
            ]
        };
        const p = pathFromSimpleGlyph(glyph);
        const types = p.commands.map(c => c.type);
        expect(types).toEqual(['M', 'Q', 'Z']);
        expect(p.commands[1]).toEqual({ type: 'Q', x1: 50, y1: 100, x: 100, y: 0 });
    });

    test('empty glyph yields empty path', () => {
        expect(pathFromSimpleGlyph(null).commands).toEqual([]);
    });
});
