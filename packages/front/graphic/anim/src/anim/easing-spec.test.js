// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Easing specs: the CSS timing-function forms a tween's `easing` accepts on
// top of the curve table, through `graphic.tween`'s `resolveEasing`.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { tweenModule } from './tween.js';

const runtime = new ModuleRuntime();
runtime.registerDeep(tweenModule);
const { Tween, resolveEasing } = runtime.resolve('graphic.tween');
const table = runtime.resolve('graphic.easing');

/** The parametric cubic Bézier coordinate for control values a, b at s. */
function coord(a, b, s) {
    const u = 1 - s;
    return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s;
}

describe('resolveEasing', () => {
    test('a function is returned as is; a table name maps to the table', () => {
        const f = (t) => t;
        expect(resolveEasing(f)).toBe(f);
        expect(resolveEasing('easeOutCubic')).toBe(table.easeOutCubic);
        expect(resolveEasing(undefined)).toBe(table.linear);
        expect(resolveEasing(null)).toBe(table.linear);
    });

    test('an unknown spec throws', () => {
        for (const bad of ['nope', 'cubic-bezier(1,2)', 'steps()', 'steps(2, sideways)', 'cubic-bezier(a,0,1,1)']) {
            expect(() => resolveEasing(bad)).toThrow(/unknown easing/);
        }
    });
});

describe('cubic-bezier()', () => {
    test('agrees with its own parametric curve to 1e-6', () => {
        for (const [x1, y1, x2, y2] of [[0.25, 0.1, 0.25, 1], [0.42, 0, 0.58, 1], [0.2, 1.6, 0.3, -0.4], [0.9, 0.05, 0.1, 0.95]]) {
            const f = resolveEasing(`cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`);
            for (let i = 0; i <= 50; i += 1) {
                const s = i / 50;
                expect(Math.abs(f(coord(x1, x2, s)) - coord(y1, y2, s))).toBeLessThan(1e-6);
            }
        }
    });

    test('ends at 0 and 1; (0,0,1,1) is the identity', () => {
        const f = resolveEasing('cubic-bezier(0.3, 0.2, 0.6, 0.9)');
        expect(f(0)).toBe(0);
        expect(f(1)).toBe(1);
        const id = resolveEasing('cubic-bezier(0,0,1,1)');
        for (const t of [0.1, 0.37, 0.5, 0.92]) expect(id(t)).toBeCloseTo(t, 9);
    });

    test('x control points outside [0, 1] throw', () => {
        expect(() => resolveEasing('cubic-bezier(-0.1, 0, 1, 1)')).toThrow(/cubic-bezier/);
        expect(() => resolveEasing('cubic-bezier(0, 0, 1.2, 1)')).toThrow(/cubic-bezier/);
    });

    test('the CSS keywords are their cubic-bezier curves', () => {
        const pairs = { 'ease': [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
        for (const [name, p] of Object.entries(pairs)) {
            const k = resolveEasing(name);
            const c = resolveEasing(`cubic-bezier(${p.join(',')})`);
            for (const t of [0.1, 0.5, 0.8]) expect(k(t)).toBe(c(t));
        }
        expect(resolveEasing('ease')(0.5)).toBeCloseTo(0.8024033877, 6);
    });
});

describe('steps()', () => {
    test('jump-end (the default) and end', () => {
        for (const spec of ['steps(4)', 'steps(4, end)', 'steps(4, jump-end)']) {
            const f = resolveEasing(spec);
            expect([f(0), f(0.24), f(0.25), f(0.99), f(1)]).toEqual([0, 0, 0.25, 0.75, 1]);
        }
    });

    test('jump-start, jump-none, jump-both', () => {
        const s = resolveEasing('steps(4, start)');
        expect([s(0), s(0.25), s(0.8), s(1)]).toEqual([0.25, 0.5, 1, 1]);
        const n = resolveEasing('steps(5, jump-none)');
        expect([n(0), n(0.2), n(0.99), n(1)]).toEqual([0, 0.25, 1, 1]);
        const b = resolveEasing('steps(3, jump-both)');
        expect([b(0), b(0.34), b(1)]).toEqual([0.25, 0.5, 1]);
    });

    test('step-start and step-end', () => {
        const e = resolveEasing('step-end');
        expect([e(0), e(0.999), e(1)]).toEqual([0, 0, 1]);
        const st = resolveEasing('step-start');
        expect([st(0), st(0.5), st(1)]).toEqual([1, 1, 1]);
    });

    test('an invalid step count throws', () => {
        for (const bad of ['steps(0)', 'steps(2.5)', 'steps(-1)', 'steps(1, jump-none)']) {
            expect(() => resolveEasing(bad)).toThrow(/steps/);
        }
    });
});

describe('Tween easing specs', () => {
    test('a tween takes a CSS spec', () => {
        const target = { v: 0 };
        const tw = new Tween({ target, property: 'v', from: 0, to: 100, duration: 1000, easing: 'steps(2)', apply: (v, t) => { t.v = v; } });
        tw._startTs = 0;
        tw._started = true;
        tw._step(400);
        expect(target.v).toBe(0);
        tw._step(600);
        expect(target.v).toBe(50);
    });

    test('a table name keeps priority, and an unknown name still throws', () => {
        const target = {};
        expect(new Tween({ target, property: 'v', from: 0, to: 1, duration: 10, easing: 'easeInQuad' }).ease).toBe(table.easeInQuad);
        expect(() => new Tween({ target, property: 'v', from: 0, to: 1, duration: 10, easing: 'bogus' })).toThrow(/unknown easing "bogus"/);
    });
});
