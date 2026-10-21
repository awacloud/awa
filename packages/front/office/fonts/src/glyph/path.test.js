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

    test('a contour ending off-curve closes on its own start, not the first contour\'s (A66)', () => {
        const glyph = {
            kind: 'simple',
            endPtsOfContours: [2, 5, 8],
            points: [
                { x: 0, y: 0, onCurve: true }, { x: 100, y: 0, onCurve: true }, { x: 50, y: 100, onCurve: true },
                { x: 200, y: 0, onCurve: true }, { x: 300, y: 0, onCurve: true }, { x: 250, y: 100, onCurve: false },
                { x: 400, y: 0, onCurve: false }, { x: 500, y: 0, onCurve: false }, { x: 450, y: 100, onCurve: false },
            ],
        };
        const p = pathFromSimpleGlyph(glyph);
        const quads = p.commands.filter((c) => c.type === 'Q');
        // Second contour: the trailing control closes on (200, 0).
        expect(quads[0]).toEqual({ type: 'Q', x1: 250, y1: 100, x: 200, y: 0 });
        // Third contour, all off-curve: it starts and closes on the midpoint of its last and first points.
        const moves = p.commands.filter((c) => c.type === 'M');
        expect(moves[2]).toEqual({ type: 'M', x: 425, y: 50 });
        expect(quads[quads.length - 1]).toMatchObject({ x: 425, y: 50 });
    });

    // Each drawn segment as `from>control>to`, the implicit `Z` line included:
    // a contour's start point only rotates its command list, so the set is
    // the same whatever the start.
    const segments = (commands) => {
        const out = [];
        let start = null, cur = null;
        const k = (x, y) => `${x},${y}`;
        for (const c of commands) {
            if (c.type === 'M') { start = cur = k(c.x, c.y); continue; }
            if (c.type === 'Z') { if (cur !== start) out.push(`${cur}>${start}`); cur = start; continue; }
            const to = k(c.x, c.y);
            out.push(c.type === 'Q' ? `${cur}>${k(c.x1, c.y1)}>${to}` : `${cur}>${to}`);
            cur = to;
        }
        return out.sort();
    };

    test('point 0 off-curve, last point on-curve: the contour starts on the last point', () => {
        const glyph = {
            kind: 'simple',
            endPtsOfContours: [3],
            points: [
                { x: 0,   y: 100, onCurve: false },
                { x: 100, y: 100, onCurve: true },
                { x: 100, y: 0,   onCurve: false },
                { x: 0,   y: 0,   onCurve: true },
            ],
        };
        const p = pathFromSimpleGlyph(glyph);
        expect(p.commands).toEqual([
            { type: 'M', x: 0, y: 0 },
            { type: 'Q', x1: 0, y1: 100, x: 100, y: 100 },
            { type: 'Q', x1: 100, y1: 0, x: 0, y: 0 },
            { type: 'Z' },
        ]);
        // Same geometry as the former start on the first on-curve point.
        expect(segments(p.commands)).toEqual(segments([
            { type: 'M', x: 100, y: 100 },
            { type: 'Q', x1: 100, y1: 0, x: 0, y: 0 },
            { type: 'Q', x1: 0, y1: 100, x: 100, y: 100 },
            { type: 'Z' },
        ]));
    });

    test('point 0 and the last point off-curve: the contour starts on their midpoint', () => {
        const glyph = {
            kind: 'simple',
            endPtsOfContours: [3],
            points: [
                { x: 0,   y: 100, onCurve: false },
                { x: 100, y: 100, onCurve: true },
                { x: 100, y: 0,   onCurve: true },
                { x: 0,   y: 0,   onCurve: false },
            ],
        };
        const p = pathFromSimpleGlyph(glyph);
        expect(p.commands).toEqual([
            { type: 'M', x: 0, y: 50 },
            { type: 'Q', x1: 0, y1: 100, x: 100, y: 100 },
            { type: 'L', x: 100, y: 0 },
            { type: 'Q', x1: 0, y1: 0, x: 0, y: 50 },
            { type: 'Z' },
        ]);
        expect(segments(p.commands)).toEqual(segments([
            { type: 'M', x: 100, y: 100 },
            { type: 'L', x: 100, y: 0 },
            { type: 'Q', x1: 0, y1: 0, x: 0, y: 50 },
            { type: 'Q', x1: 0, y1: 100, x: 100, y: 100 },
            { type: 'Z' },
        ]));
    });

    test('empty glyph yields empty path', () => {
        expect(pathFromSimpleGlyph(null).commands).toEqual([]);
    });
});
