// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { lerpModule } from './scalar.js';
import { interp } from '@awacloud/fw/io/math/interp.js';

describe('graphic.lerp descriptor', () => {
    test('descriptor shape is correct', () => {
        expect(lerpModule.name).toBe('graphic.lerp');
        expect(lerpModule.type).toBe('lib.graphic.math');
        expect(lerpModule.version).toBe('0.1.0');
        expect(lerpModule.dependencies).toEqual(['interp']);
        expect(lerpModule.deps).toEqual([interp]);
        expect(typeof lerpModule.factory).toBe('function');
    });

    test('the factory returns fw interp.linear itself', () => {
        const fw = interp.factory();
        expect(lerpModule.factory(fw)).toBe(fw.linear);
    });

    test('bit-identical to the former a + (b - a) * t on a grid', () => {
        const lerp = lerpModule.factory(interp.factory());
        const vals = [-1e9, -3.7, -1, -0.1, 0, 1e-12, 0.3, 1, 2.5, 1e6];
        for (const a of vals) for (const b of vals) for (let k = -4; k <= 14; k += 1) {
            const t = k / 10;
            expect(Object.is(lerp(a, b, t), a + (b - a) * t)).toBe(true);
        }
    });
});

describe('lerp (resolved via factory())', () => {
    const lerp = lerpModule.factory(interp.factory());

    test('t=0 returns a', () => {
        expect(lerp(10, 20, 0)).toBe(10);
    });

    test('t=1 returns b', () => {
        expect(lerp(10, 20, 1)).toBe(20);
    });

    test('midpoint t=0.5', () => {
        expect(lerp(0, 100, 0.5)).toBe(50);
    });

    test('extrapolates when t < 0', () => {
        // t=-1: a + (b-a)*-1 = 10 + (20-10)*(-1) = 0
        expect(lerp(10, 20, -1)).toBe(0);
    });

    test('extrapolates when t > 1', () => {
        // t=2: a + (b-a)*2 = 0 + 100*2 = 200
        expect(lerp(0, 100, 2)).toBe(200);
    });

    test('works with equal endpoints', () => {
        expect(lerp(5, 5, 0.7)).toBe(5);
    });

    test('works with negative values', () => {
        expect(lerp(-10, 10, 0.5)).toBe(0);
    });
});
