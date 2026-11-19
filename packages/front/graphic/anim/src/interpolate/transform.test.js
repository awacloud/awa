// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { interpolateModule } from './index.js';
import { lerpModule } from '../math/scalar.js';
import { interp } from '@awacloud/fw/io/math/interp.js';
import { unitsModule } from '../math/units.js';
import { matrixModule } from '../math/matrix.js';
import { colorModule } from '../math/color.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// Resolve the descriptor and pull the factory-internal transform parser out of
// the public surface. parseTransform is now private to graphic.interpolate.
const lerp = lerpModule.factory(interp.factory());
const units = unitsModule.factory();
const matrix = matrixModule.factory(lerp);
const color = colorModule.factory(lerp);
const { parseTransform } = interpolateModule.factory(lerp, units, matrix, color);

/** Assert a matrix equals the given 6-tuple within tolerance. */
function expectMatrix(m, { a, b, c, d, e, f }, p = 6) {
    expect(m.a).toBeCloseTo(a, p);
    expect(m.b).toBeCloseTo(b, p);
    expect(m.c).toBeCloseTo(c, p);
    expect(m.d).toBeCloseTo(d, p);
    expect(m.e).toBeCloseTo(e, p);
    expect(m.f).toBeCloseTo(f, p);
}

describe('parseTransform', () => {
    test('empty / functionless string → identity', () => {
        expectMatrix(parseTransform(''), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        expectMatrix(parseTransform('  '), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    });

    test('translate(tx, ty)', () => {
        expectMatrix(parseTransform('translate(10, 20)'), { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 });
    });

    test('translate(tx) defaults ty to 0', () => {
        expectMatrix(parseTransform('translate(7)'), { a: 1, b: 0, c: 0, d: 1, e: 7, f: 0 });
    });

    test('scale(sx, sy)', () => {
        expectMatrix(parseTransform('scale(2, 3)'), { a: 2, b: 0, c: 0, d: 3, e: 0, f: 0 });
    });

    test('scale(s) is uniform', () => {
        expectMatrix(parseTransform('scale(2)'), { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
    });

    test('rotate(90) → (0,1,-1,0)', () => {
        expectMatrix(parseTransform('rotate(90)'), { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 });
    });

    test('matrix(...) verbatim', () => {
        expectMatrix(parseTransform('matrix(1,2,3,4,5,6)'), { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 });
    });

    describe('skew is a real shear (W0 gap closed — no longer identity)', () => {
        test('skewX(30): c = tan(30°), not identity', () => {
            const m = parseTransform('skewX(30)');
            expect(m.c).toBeCloseTo(Math.tan(30 * Math.PI / 180), 6);
            expect(m.c).not.toBe(0);
            expectMatrix(m, { a: 1, b: 0, c: Math.tan(30 * Math.PI / 180), d: 1, e: 0, f: 0 });
        });

        test('skewY(20): b = tan(20°), not identity', () => {
            const m = parseTransform('skewY(20)');
            expect(m.b).toBeCloseTo(Math.tan(20 * Math.PI / 180), 6);
            expect(m.b).not.toBe(0);
            expectMatrix(m, { a: 1, b: Math.tan(20 * Math.PI / 180), c: 0, d: 1, e: 0, f: 0 });
        });

        test('skewX(0) is identity', () => {
            expectMatrix(parseTransform('skewX(0)'), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        });
    });

    describe('composition order (left-to-right)', () => {
        test('translate then scale: scale applied first, translation preserved', () => {
            // translate(10,20) · scale(2,3) → linear=scale, translation=(10,20).
            expectMatrix(
                parseTransform('translate(10, 20) scale(2, 3)'),
                { a: 2, b: 0, c: 0, d: 3, e: 10, f: 20 },
            );
        });

        test('order matters: scale·translate ≠ translate·scale', () => {
            // scale(2) · translate(10,0) → translation scaled to (20,0).
            expectMatrix(
                parseTransform('scale(2) translate(10, 0)'),
                { a: 2, b: 0, c: 0, d: 2, e: 20, f: 0 },
            );
        });

        test('comma- and space-separated args both parse', () => {
            expectMatrix(parseTransform('translate(10 20)'), { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 });
        });
    });

    describe('Worker-safety: DOM-free module scan', () => {
        function stripComments(src) {
            let s = src.replace(/\/\*[\s\S]*?\*\//g, '');
            s = s.replace(/\/\/[^\n]*/g, '');
            return s;
        }

        test('index.js source (folds the transform parser) is DOM-free', () => {
            const src = stripComments(readFileSync(resolve(HERE, 'index.js'), 'utf8'));
            expect(src).not.toMatch(/\bwindow\b/);
            expect(src).not.toMatch(/\bdocument\b/);
            expect(src).not.toMatch(/\bglobalThis\b/);
        });
    });
});
