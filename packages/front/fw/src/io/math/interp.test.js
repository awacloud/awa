// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { interp } from './interp.js';

const near = (a, b, eps = 1e-5) => Math.abs(a - b) < eps;

describe('interp module', () => {
    test('should have correct module metadata', () => {
        expect(interp.name).toBe('interp');
        expect(interp.dependencies).toEqual([]);
        expect(typeof interp.factory).toBe('function');
    });

    describe('factory', () => {
        const i = interp.factory();

        describe('linear', () => {
            test('midpoint', () => expect(i.linear(0, 10, 0.5)).toBe(5));
            test('start', () => expect(i.linear(0, 10, 0)).toBe(0));
            test('end', () => expect(i.linear(0, 10, 1)).toBe(10));
            test('extrapolation', () => expect(i.linear(0, 10, 2)).toBe(20));
        });

        describe('smoothstep', () => {
            test('midpoint', () => expect(near(i.smoothstep(0, 1, 0.5), 0.5)).toBe(true));
            test('below edge0 clamps to 0', () => expect(i.smoothstep(0, 1, -1)).toBe(0));
            test('above edge1 clamps to 1', () => expect(i.smoothstep(0, 1, 2)).toBe(1));
            test('monotone between edges', () => {
                expect(i.smoothstep(0, 1, 0.25)).toBeLessThan(i.smoothstep(0, 1, 0.75));
            });
        });

        describe('smootherstep', () => {
            test('midpoint = 0.5', () => expect(near(i.smootherstep(0, 1, 0.5), 0.5)).toBe(true));
            test('clamps', () => {
                expect(i.smootherstep(0, 1, -1)).toBe(0);
                expect(i.smootherstep(0, 1, 2)).toBe(1);
            });
        });

        describe('cubicHermite', () => {
            test('t=0 returns p0', () => expect(i.cubicHermite(0, 1, 0, 0, 0)).toBe(0));
            test('t=1 returns p1', () => expect(i.cubicHermite(0, 1, 0, 0, 1)).toBe(1));
        });

        describe('catmullRom', () => {
            test('t=0 returns p1', () => expect(near(i.catmullRom(0, 1, 2, 3, 0), 1)).toBe(true));
            test('t=1 returns p2', () => expect(near(i.catmullRom(0, 1, 2, 3, 1), 2)).toBe(true));
        });

        describe('bezier2', () => {
            test('t=0 returns p0', () => expect(i.bezier2(0, 0.5, 1, 0)).toBe(0));
            test('t=1 returns p2', () => expect(i.bezier2(0, 0.5, 1, 1)).toBe(1));
            test('t=0.5 midpoint', () => expect(near(i.bezier2(0, 1, 0, 0.5), 0.5)).toBe(true));
        });

        describe('bezier3', () => {
            test('t=0 returns p0', () => expect(i.bezier3(0, 1, 2, 3, 0)).toBe(0));
            test('t=1 returns p3', () => expect(i.bezier3(0, 1, 2, 3, 1)).toBe(3));
        });

        describe('bilinear', () => {
            test('corner q11', () => expect(i.bilinear(1, 2, 3, 4, 0, 0)).toBe(1));
            test('corner q21', () => expect(i.bilinear(1, 2, 3, 4, 1, 0)).toBe(2));
            test('corner q12', () => expect(i.bilinear(1, 2, 3, 4, 0, 1)).toBe(3));
            test('corner q22', () => expect(i.bilinear(1, 2, 3, 4, 1, 1)).toBe(4));
            test('center', () => expect(near(i.bilinear(1, 1, 1, 1, 0.5, 0.5), 1)).toBe(true));
        });

        describe('bicubic', () => {
            test('constant field = constant', () => {
                const s4x4 = [[5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5]];
                expect(near(i.bicubic(s4x4, 0.5, 0.5), 5)).toBe(true);
            });
        });

        describe('vec', () => {
            test('lerp vectors', () => {
                const out = [0, 0, 0];
                i.vec(out, [0, 0, 0], [10, 20, 30], 0.5);
                expect(out).toEqual([5, 10, 15]);
            });
            test('throws on dimension mismatch', () => {
                expect(() => i.vec([0, 0], [0, 0, 0], [1, 1, 1], 0.5)).toThrow();
            });
        });

        describe('barycentric', () => {
            test('point at vertex a', () => {
                const { u, v, w } = i.barycentric({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 });
                expect(near(u, 1) && near(v, 0) && near(w, 0)).toBe(true);
            });
            test('u+v+w ≈ 1 for point inside', () => {
                const { u, v, w } = i.barycentric({ x: 0.25, y: 0.25 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 });
                expect(near(u + v + w, 1)).toBe(true);
            });
        });

        describe('sample', () => {
            test('1D at midpoint', () => expect(near(i.sample([0, 10], 0.5), 5)).toBe(true));
            test('1D at start', () => expect(i.sample([3, 6, 9], 0)).toBe(3));
            test('1D at end', () => expect(i.sample([3, 6, 9], 1)).toBe(9));
        });

        describe('sample2D', () => {
            const grid = [1, 2, 3, 4]; // 2x2
            test('corner 0,0', () => expect(near(i.sample2D(grid, 2, 2, 0, 0), 1)).toBe(true));
            test('corner 1,0', () => expect(near(i.sample2D(grid, 2, 2, 1, 0), 2)).toBe(true));
            test('center', () => expect(near(i.sample2D(grid, 2, 2, 0.5, 0.5), 2.5)).toBe(true));
        });
    });
});
