// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit tests for `pageflip.compose` — the module-local polygon
 * serializer. Covers the closed-polygon shape, 1e-3 rounding parity, the empty
 * case, and parity with the fold solver's output shape.
 */

import { describe, test, expect } from 'bun:test';
import { composeModule } from './compose.js';
import { foldModule } from './fold.js';

const { compose } = composeModule.factory();
const { fold } = foldModule.factory();

const PAGE = { width: 320, height: 480 };

describe('composeModule descriptor', () => {
    test('name / type / version and no deps (pure kernel)', () => {
        expect(composeModule.name).toBe('pageflip.compose');
        expect(composeModule.type).toBe('lib.graphic.pageflip');
        expect(composeModule.version).toBe('0.1.0');
        expect(composeModule.dependencies).toEqual([]);
        expect(composeModule.deps).toEqual([]);
    });

    test('factory returns { compose }', () => {
        const api = composeModule.factory();
        expect(typeof api.compose).toBe('function');
    });
});

describe('compose(vertices) → closed polygon d', () => {
    test('serializes a bare {x,y} vertex array as M · L… · Z', () => {
        const d = compose([
            { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 },
        ]);
        expect(d).toBe('M 0 0 L 100 0 L 100 50 L 0 50 Z');
    });

    test('rounds coordinates to 1e-3 (parity with the frozen serializer shape)', () => {
        expect(compose([{ x: 1.23456, y: 0 }, { x: 2, y: 3 }]))
            .toBe('M 1.235 0 L 2 3 Z');
    });

    test('an empty (or non-array) vertex list yields an empty d', () => {
        expect(compose([])).toBe('');
        expect(compose(/** @type {any} */ (null))).toBe('');
        expect(compose(/** @type {any} */ (undefined))).toBe('');
    });

    test('the fold solver output composes to a valid closed polygon d', () => {
        const r = fold({ x: PAGE.width * 0.4, y: PAGE.height * 0.1 }, PAGE);
        const d = compose(r.turn);
        expect(d.startsWith('M ')).toBe(true);
        expect(d.endsWith(' Z')).toBe(true);
        // 4 vertices → M + 3×L + Z tokens.
        expect(d.split(' L ').length).toBe(4);
    });

    test('is capture-free / pure — two factory instances agree', () => {
        const a = composeModule.factory().compose;
        const b = composeModule.factory().compose;
        const pts = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
        expect(a(pts)).toBe(b(pts));
    });
});
