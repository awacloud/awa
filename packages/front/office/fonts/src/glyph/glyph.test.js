// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontGlyph } from './glyph.js';
import { testRuntime } from './_test-runtime.js';
const { Glyph } = testRuntime.resolve('fontGlyph');
const { Path } = testRuntime.resolve('fontPath');

describe('Glyph', () => {
    test('module metadata', () => { expect(fontGlyph.name).toBe('fontGlyph'); });

    test('empty when no path', () => {
        const g = new Glyph({ id: 0, advanceWidth: 600, lsb: 50 });
        expect(g.isEmpty()).toBe(true);
        expect(g.isComposite()).toBe(false);
    });

    test('non-empty when path has commands', () => {
        const p = new Path(); p.moveTo(0, 0).close();
        const g = new Glyph({ id: 1, advanceWidth: 600, lsb: 0, path: p });
        expect(g.isEmpty()).toBe(false);
    });

    test('composite flag set', () => {
        const g = new Glyph({ id: 2, advanceWidth: 0, lsb: 0, components: [{ glyphIndex: 5 }] });
        expect(g.isComposite()).toBe(true);
    });
});
