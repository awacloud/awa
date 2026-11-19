// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { easingModule } from './easing.js';
import { easing as fwEasingModule } from '@awacloud/fw/io/calc/easing.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** All 31 expected easing key names. */
const EXPECTED_KEYS = [
    'linear',
    'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
    'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
    'easeInQuart', 'easeOutQuart', 'easeInOutQuart',
    'easeInQuint', 'easeOutQuint', 'easeInOutQuint',
    'easeInSine', 'easeOutSine', 'easeInOutSine',
    'easeInExpo', 'easeOutExpo', 'easeInOutExpo',
    'easeInCirc', 'easeOutCirc', 'easeInOutCirc',
    'easeInElastic', 'easeOutElastic', 'easeInOutElastic',
    'easeInBack', 'easeOutBack', 'easeInOutBack',
    'easeInBounce', 'easeOutBounce', 'easeInOutBounce',
];

/** Monotone families that should be strictly ordered at midpoint (t=0.5). */
const MONOTONE_FAMILIES = [
    'Quad', 'Cubic', 'Quart', 'Quint', 'Sine', 'Expo', 'Circ',
];

describe('graphic.easing descriptor', () => {
    test('descriptor shape is correct', () => {
        expect(easingModule.name).toBe('graphic.easing');
        expect(easingModule.type).toBe('lib.graphic.math');
        expect(easingModule.version).toBe('0.1.0');
        expect(easingModule.dependencies).toEqual(['easing']);
        expect(easingModule.deps).toEqual([fwEasingModule]);
        expect(typeof easingModule.factory).toBe('function');
    });

    test('no local curve body: the table is built over fw easing', () => {
        const src = readFileSync(resolve(HERE, 'easing.js'), 'utf8');
        // The former local table spelled its curves out (e.g. `t * t * t`).
        expect(/=>\s*t\s*\*\s*t/.test(src)).toBe(false);
        expect(/Math\.(sin|cos|pow|sqrt)/.test(src)).toBe(false);
    });
});

describe('easing (resolved via factory())', () => {
    const easing = easingModule.factory(fwEasingModule.factory());

    test('table has exactly 31 keys', () => {
        expect(Object.keys(easing).length).toBe(31);
    });

    test('contains all expected keys', () => {
        for (const key of EXPECTED_KEYS) {
            expect(typeof easing[key]).toBe('function');
        }
    });

    describe('endpoint contract: f(0)≈0 and f(1)≈1', () => {
        for (const key of EXPECTED_KEYS) {
            test(key, () => {
                expect(easing[key](0)).toBeCloseTo(0, 6);
                expect(easing[key](1)).toBeCloseTo(1, 6);
            });
        }
    });

    test('linear is identity', () => {
        expect(easing.linear(0)).toBe(0);
        expect(easing.linear(0.5)).toBe(0.5);
        expect(easing.linear(1)).toBe(1);
    });

    describe('monotone-family midpoints ordered correctly (easeIn < linear < easeOut at t=0.5)', () => {
        for (const family of MONOTONE_FAMILIES) {
            test(family, () => {
                const inVal = easing[`easeIn${family}`](0.5);
                const outVal = easing[`easeOut${family}`](0.5);
                // easeIn < 0.5 (slow start), easeOut > 0.5 (fast start)
                expect(inVal).toBeLessThan(0.5);
                expect(outVal).toBeGreaterThan(0.5);
            });
        }
    });

    describe('easing parity — fidelity guard vs @awacloud/fw (tolerance 1e-9)', () => {
        /** Sample points avoiding t=0 and t=1 edges for non-trivial checks. */
        const SAMPLES = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

        const fwEase = fwEasingModule.factory();

        for (const key of EXPECTED_KEYS) {
            test(`${key} matches fw[k](t,0,1,1)`, () => {
                for (const t of SAMPLES) {
                    const graphicVal = easing[key](t);
                    const fwVal = fwEase[key](t, 0, 1, 1);
                    expect(Math.abs(graphicVal - fwVal)).toBeLessThan(1e-9);
                }
            });
        }
    });

    describe('Worker-safety: DOM-free module scan', () => {
        /**
         * Strip single-line and block comments from JS source so the scan
         * only catches actual code (not doc-comment mentions of the API names).
         * Regex-based; accurate enough for the no-string-literal constraint here.
         */
        function stripComments(src) {
            // Remove block comments
            let s = src.replace(/\/\*[\s\S]*?\*\//g, '');
            // Remove single-line comments
            s = s.replace(/\/\/[^\n]*/g, '');
            return s;
        }

        test('easing.js source code contains no window/document/globalThis usage', () => {
            const src = stripComments(readFileSync(resolve(HERE, 'easing.js'), 'utf8'));
            // These globals have no place in a Worker-safe pure-math module
            expect(src).not.toMatch(/\bwindow\b/);
            expect(src).not.toMatch(/\bdocument\b/);
            expect(src).not.toMatch(/\bglobalThis\b/);
        });

        test('scalar.js source code contains no window/document/globalThis usage', () => {
            const src = stripComments(readFileSync(resolve(HERE, 'scalar.js'), 'utf8'));
            expect(src).not.toMatch(/\bwindow\b/);
            expect(src).not.toMatch(/\bdocument\b/);
            expect(src).not.toMatch(/\bglobalThis\b/);
        });

        test('units.js source code contains no window/document/globalThis usage', () => {
            const src = stripComments(readFileSync(resolve(HERE, 'units.js'), 'utf8'));
            expect(src).not.toMatch(/\bwindow\b/);
            expect(src).not.toMatch(/\bdocument\b/);
            expect(src).not.toMatch(/\bglobalThis\b/);
        });
    });
});
