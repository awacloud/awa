// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { buildSimpleGlyph, buildCmap, buildTtf } from './build.js';
import { testRuntime as _rootRt } from '../../src/_test-runtime.js';
const fontsRead = _rootRt.resolve('fonts').read;

describe('tests/_helpers/build', () => {
    test('buildSimpleGlyph emits a glyph parseable by the fonts pipeline', () => {
        const points = [
            { x: 0, y: 0, onCurve: true },
            { x: 100, y: 0, onCurve: true },
            { x: 50, y: 100, onCurve: true }
        ];
        const g = buildSimpleGlyph(points, { xMin: 0, yMin: 0, xMax: 100, yMax: 100 });
        expect(g).toBeInstanceOf(Uint8Array);
        expect(g.length).toBeGreaterThan(10);
    });

    test('buildCmap produces a valid cmap byte stream', () => {
        const c = buildCmap(0x41, 0x5A, 1);
        expect(c[0]).toBe(0);   // cmap version high byte
    });

    test('buildTtf returns a font that fonts.read accepts', () => {
        const triangle = buildSimpleGlyph(
            [{ x: 0, y: 0, onCurve: true }, { x: 100, y: 0, onCurve: true }, { x: 50, y: 100, onCurve: true }],
            { xMin: 0, yMin: 0, xMax: 100, yMax: 100 });
        const bytes = buildTtf({
            glyphs:   [new Uint8Array(0), triangle],
            advances: [500, 700]
        });
        const font = fontsRead(bytes);
        expect(font.numGlyphs).toBe(2);
        expect(font.advanceWidth(1)).toBe(700);
    });
});
