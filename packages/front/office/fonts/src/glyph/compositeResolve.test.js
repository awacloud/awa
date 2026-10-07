// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontCompositeResolve } from './compositeResolve.js';
import { testRuntime } from './_test-runtime.js';
const { ContractError, RenderError } = testRuntime.resolve('fontErrors');
const { resolveGlyphPath } = testRuntime.resolve('fontCompositeResolve');

describe('compositeResolve', () => {
    test('module metadata', () => {
        expect(fontCompositeResolve.name).toBe('fontCompositeResolve');
    });

    test('resolves simple glyph directly', () => {
        const glyphs = [
            {
                kind: 'simple',
                endPtsOfContours: [2],
                points: [
                    { x: 0,   y: 0,   onCurve: true },
                    { x: 100, y: 0,   onCurve: true },
                    { x: 50,  y: 100, onCurve: true }
                ]
            }
        ];
        const p = resolveGlyphPath(glyphs, 0);
        expect(p.commands.map(c => c.type)).toEqual(['M', 'L', 'L', 'Z']);
    });

    test('resolves composite -> child + offset', () => {
        const child = {
            kind: 'simple',
            endPtsOfContours: [0],
            points: [{ x: 10, y: 20, onCurve: true }]
        };
        const composite = {
            kind: 'composite',
            components: [{
                glyphIndex: 0, arg1: 5, arg2: 7, xy: true,
                transform: { a: 1, b: 0, c: 0, d: 1 }
            }]
        };
        const p = resolveGlyphPath([child, composite], 1);
        expect(p.commands[0]).toEqual({ type: 'M', x: 15, y: 27 });
    });

    test('detects cycles', () => {
        const a = { kind: 'composite', components: [{ glyphIndex: 1, xy: true, arg1: 0, arg2: 0 }] };
        const b = { kind: 'composite', components: [{ glyphIndex: 0, xy: true, arg1: 0, arg2: 0 }] };
        expect(() => resolveGlyphPath([a, b], 0)).toThrow(RenderError);
    });

    test('rejects out-of-range index', () => {
        expect(() => resolveGlyphPath([], 0)).toThrow(ContractError);
    });
});
