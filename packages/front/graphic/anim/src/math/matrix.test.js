// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { matrixModule } from './matrix.js';
import { lerpModule } from './scalar.js';
import { interp } from '@awacloud/fw/io/math/interp.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// Resolve the descriptor: inject lerp, extract Matrix + lerpDecomposition.
const lerp = lerpModule.factory(interp.factory());
const { Matrix, lerpDecomposition } = matrixModule.factory(lerp);

/** Assert two matrices are equal within tolerance. */
function expectMatrixClose(m, { a, b, c, d, e, f }, p = 6) {
    expect(m.a).toBeCloseTo(a, p);
    expect(m.b).toBeCloseTo(b, p);
    expect(m.c).toBeCloseTo(c, p);
    expect(m.d).toBeCloseTo(d, p);
    expect(m.e).toBeCloseTo(e, p);
    expect(m.f).toBeCloseTo(f, p);
}

/** Round-trip a matrix through decompose → fromDecomposition; assert equal. */
function expectRoundTrip(m, p = 6) {
    const back = Matrix.fromDecomposition(m.decompose());
    expectMatrixClose(back, m, p);
}

describe('graphic.matrix descriptor', () => {
    test('descriptor shape is correct', () => {
        expect(matrixModule.name).toBe('graphic.matrix');
        expect(matrixModule.type).toBe('lib.graphic.math');
        expect(matrixModule.version).toBe('0.1.0');
        expect(matrixModule.dependencies).toEqual(['graphic.lerp']);
        expect(matrixModule.deps).toHaveLength(1);
        expect(matrixModule.deps[0]).toBe(lerpModule);
        expect(typeof matrixModule.factory).toBe('function');
    });

    test('dependencies === deps.map(d => d.name) invariant', () => {
        expect(matrixModule.deps.map((d) => d.name)).toEqual(matrixModule.dependencies);
    });
});

describe('Matrix', () => {
    describe('constructor & identity', () => {
        test('default constructor is the identity tuple', () => {
            const m = new Matrix();
            expect(m).toMatchObject({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        });

        test('static identity() equals the default', () => {
            expect(Matrix.identity()).toMatchObject({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        });

        test('stores all six terms', () => {
            const m = new Matrix(2, 3, 4, 5, 6, 7);
            expect(m).toMatchObject({ a: 2, b: 3, c: 4, d: 5, e: 6, f: 7 });
        });
    });

    describe('multiply', () => {
        test('identity is the multiplicative neutral', () => {
            const m = new Matrix(2, 3, 4, 5, 6, 7);
            expectMatrixClose(m.multiply(Matrix.identity()), m);
            expectMatrixClose(Matrix.identity().multiply(m), m);
        });

        test('hand-computed product', () => {
            // A = translate(10,20); B = scale(2,3).
            const A = new Matrix(1, 0, 0, 1, 10, 20);
            const B = new Matrix(2, 0, 0, 3, 0, 0);
            // A · B applies B (scale) first, then A (translate).
            // Result linear part = scale(2,3), translation = (10,20).
            expectMatrixClose(A.multiply(B), { a: 2, b: 0, c: 0, d: 3, e: 10, f: 20 });
        });

        test('associativity: (A·B)·C == A·(B·C)', () => {
            const A = Matrix.fromDecomposition({ rotate: 30, translateX: 5 });
            const B = Matrix.fromDecomposition({ scaleX: 2, scaleY: 0.5 });
            const C = Matrix.fromDecomposition({ skewX: 15, translateY: -3 });
            const left = A.multiply(B).multiply(C);
            const right = A.multiply(B.multiply(C));
            expectMatrixClose(left, right);
        });
    });

    describe('fromDecomposition / decompose round-trip (within 1e-6)', () => {
        test('identity', () => {
            expectRoundTrip(Matrix.identity());
        });

        test('pure translate', () => {
            expectRoundTrip(Matrix.fromDecomposition({ translateX: 37, translateY: -12 }));
        });

        test.each([30, 90, -45, 120, -150])('pure rotate %d°', (deg) => {
            expectRoundTrip(Matrix.fromDecomposition({ rotate: deg }));
        });

        test('non-uniform scale', () => {
            expectRoundTrip(Matrix.fromDecomposition({ scaleX: 2.5, scaleY: 0.4 }));
        });

        test.each([10, 30, -20, 45])('skewX %d°', (deg) => {
            expectRoundTrip(Matrix.fromDecomposition({ skewX: deg }));
        });

        test('composed translate + rotate + scale + skew', () => {
            expectRoundTrip(Matrix.fromDecomposition({
                translateX: 12, translateY: -8,
                rotate: 25, scaleX: 1.5, scaleY: 0.75, skewX: 18,
            }));
        });

        test('round-trips an arbitrary affine matrix built term-by-term', () => {
            // Not produced by fromDecomposition; a raw affine map.
            const m = new Matrix(0.8, 0.6, -0.3, 1.1, 4, -2);
            expectRoundTrip(m);
        });
    });

    describe('decompose channel values', () => {
        test('pure translate leaves scale=1, rotate=0, skew=0', () => {
            const d = new Matrix(1, 0, 0, 1, 15, -9).decompose();
            expect(d.translateX).toBeCloseTo(15, 6);
            expect(d.translateY).toBeCloseTo(-9, 6);
            expect(d.rotate).toBeCloseTo(0, 6);
            expect(d.scaleX).toBeCloseTo(1, 6);
            expect(d.scaleY).toBeCloseTo(1, 6);
            expect(d.skewX).toBeCloseTo(0, 6);
            expect(d.skewY).toBe(0);
        });

        test('pure rotation recovers the angle', () => {
            const d = Matrix.fromDecomposition({ rotate: 30 }).decompose();
            expect(d.rotate).toBeCloseTo(30, 6);
            expect(d.scaleX).toBeCloseTo(1, 6);
            expect(d.scaleY).toBeCloseTo(1, 6);
        });

        test('skewX recovers the shear angle', () => {
            const d = Matrix.fromDecomposition({ skewX: 20 }).decompose();
            expect(d.skewX).toBeCloseTo(20, 6);
            expect(d.skewY).toBe(0);
        });

        test('non-uniform scale recovers both factors', () => {
            const d = Matrix.fromDecomposition({ scaleX: 3, scaleY: 0.25 }).decompose();
            expect(d.scaleX).toBeCloseTo(3, 6);
            expect(d.scaleY).toBeCloseTo(0.25, 6);
        });
    });

    describe('negative determinant (mirror)', () => {
        test('X-mirror: scaleX is negative, no NaN, round-trips', () => {
            const m = new Matrix(-1, 0, 0, 1, 0, 0); // flip X
            const d = m.decompose();
            for (const v of Object.values(d)) expect(Number.isNaN(v)).toBe(false);
            expect(m.decompose().scaleX * m.decompose().scaleY).toBeLessThan(0);
            expectRoundTrip(m);
        });

        test('Y-mirror round-trips', () => {
            const m = new Matrix(1, 0, 0, -1, 0, 0); // flip Y
            const d = m.decompose();
            for (const v of Object.values(d)) expect(Number.isNaN(v)).toBe(false);
            expectRoundTrip(m);
        });

        test('mirror combined with rotation+scale round-trips', () => {
            const m = new Matrix(-1.4, 0.5, 0.2, 1.1, 3, 7);
            expect(m.a * m.d - m.b * m.c).toBeLessThan(0); // det < 0
            expectRoundTrip(m);
        });
    });

    describe('toString', () => {
        test('identity formats as matrix(1,0,0,1,0,0)', () => {
            expect(Matrix.identity().toString()).toBe('matrix(1,0,0,1,0,0)');
        });

        test('rounds to 1e-6 precision', () => {
            const m = new Matrix(1 / 3, 0, 0, 1, 0, 0);
            expect(m.toString()).toBe('matrix(0.333333,0,0,1,0,0)');
        });

        test('collapses -0 and sub-1e-10 dust to 0', () => {
            const m = new Matrix(1, -0, 1e-12, 1, -1e-11, 0);
            expect(m.toString()).toBe('matrix(1,0,0,1,0,0)');
        });
    });

    describe('lerpDecomposition', () => {
        const from = {
            translateX: 0, translateY: 0, rotate: 0,
            scaleX: 1, scaleY: 1, skewX: 0, skewY: 0,
        };
        const to = {
            translateX: 100, translateY: -40, rotate: 90,
            scaleX: 3, scaleY: 0.5, skewX: 20, skewY: 10,
        };

        test('t=0 returns the from channels', () => {
            expect(lerpDecomposition(from, to, 0)).toEqual(from);
        });

        test('t=1 returns the to channels', () => {
            expect(lerpDecomposition(from, to, 1)).toEqual(to);
        });

        test('t=0.5 blends every one of the seven channels', () => {
            const mid = lerpDecomposition(from, to, 0.5);
            expect(mid.translateX).toBeCloseTo(50, 6);
            expect(mid.translateY).toBeCloseTo(-20, 6);
            expect(mid.rotate).toBeCloseTo(45, 6);
            expect(mid.scaleX).toBeCloseTo(2, 6);
            expect(mid.scaleY).toBeCloseTo(0.75, 6);
            expect(mid.skewX).toBeCloseTo(10, 6);
            expect(mid.skewY).toBeCloseTo(5, 6);
        });
    });

    describe('Worker-safety: DOM-free module scan', () => {
        function stripComments(src) {
            let s = src.replace(/\/\*[\s\S]*?\*\//g, '');
            s = s.replace(/\/\/[^\n]*/g, '');
            return s;
        }

        test('matrix.js source contains no window/document/globalThis usage', () => {
            const src = stripComments(readFileSync(resolve(HERE, 'matrix.js'), 'utf8'));
            expect(src).not.toMatch(/\bwindow\b/);
            expect(src).not.toMatch(/\bdocument\b/);
            expect(src).not.toMatch(/\bglobalThis\b/);
        });
    });
});
