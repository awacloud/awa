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

// Resolve the descriptor: inject the four math dependencies, extract surface.
const lerp = lerpModule.factory(interp.factory());
const units = unitsModule.factory();
const matrix = matrixModule.factory(lerp);
const color = colorModule.factory(lerp);
const { detect, interpolator, parseTransform, parsePath } =
    interpolateModule.factory(lerp, units, matrix, color);

/* ─────────────────────── descriptor shape ──────────────────────────────── */

describe('graphic.interpolate descriptor', () => {
    test('descriptor shape is correct', () => {
        expect(interpolateModule.name).toBe('graphic.interpolate');
        expect(interpolateModule.type).toBe('lib.graphic.interpolate');
        expect(interpolateModule.version).toBe('0.1.0');
        expect(interpolateModule.dependencies).toEqual([
            'graphic.lerp', 'graphic.units', 'graphic.matrix', 'graphic.color',
        ]);
        expect(interpolateModule.deps).toHaveLength(4);
        expect(interpolateModule.deps).toEqual([
            lerpModule, unitsModule, matrixModule, colorModule,
        ]);
        expect(typeof interpolateModule.factory).toBe('function');
    });

    test('dependencies === deps.map(d => d.name) invariant (same order)', () => {
        expect(interpolateModule.deps.map((d) => d.name)).toEqual(interpolateModule.dependencies);
    });

    test('factory returns the frozen surface', () => {
        const api = interpolateModule.factory(lerp, units, matrix, color);
        expect(Object.keys(api).sort()).toEqual(
            ['detect', 'interpolator', 'parsePath', 'parseTransform'],
        );
        expect(typeof api.detect).toBe('function');
        expect(typeof api.interpolator).toBe('function');
        expect(typeof api.parseTransform).toBe('function');
        expect(typeof api.parsePath).toBe('function');
    });
});

describe('detect', () => {
    test('number', () => {
        expect(detect(0.5)).toBe('number');
        expect(detect(0)).toBe('number');
        expect(detect(-3)).toBe('number');
    });

    test('path (M-prefixed)', () => {
        expect(detect('M0 0 L10 10')).toBe('path');
        expect(detect('m0 0 l10 10')).toBe('path');
    });

    test('transform', () => {
        expect(detect('matrix(1,0,0,1,0,0)')).toBe('transform');
        expect(detect('translate(10, 20)')).toBe('transform');
        expect(detect('skewX(30)')).toBe('transform');
        expect(detect('rotate(45)')).toBe('transform');
    });

    describe('color', () => {
        test('hex / rgb / rgba', () => {
            expect(detect('#ff0000')).toBe('color');
            expect(detect('rgb(1,2,3)')).toBe('color');
            expect(detect('rgba(1,2,3,0.5)')).toBe('color');
        });

        test('hsl / hsla (W0 gap closed)', () => {
            expect(detect('hsl(120, 50%, 50%)')).toBe('color');
            expect(detect('hsla(120, 50%, 50%, 0.5)')).toBe('color');
        });

        test('named colour (W0 gap closed)', () => {
            expect(detect('red')).toBe('color');
            expect(detect('CornflowerBlue')).toBe('color');
            expect(detect('transparent')).toBe('color');
        });
    });

    describe('unit (string fallthrough)', () => {
        test('50px / 0 / 100%', () => {
            expect(detect('50px')).toBe('unit');
            expect(detect('0')).toBe('unit');
            expect(detect('100%')).toBe('unit');
            expect(detect('2rem')).toBe('unit');
        });
    });

    test('throws on non-number / non-string', () => {
        expect(() => detect(null)).toThrow();
        expect(() => detect(undefined)).toThrow();
        expect(() => detect({})).toThrow();
        expect(() => detect([])).toThrow();
    });
});

describe('interpolator', () => {
    test('kind mismatch throws', () => {
        expect(() => interpolator(5, '#ff0000')).toThrow(/kind mismatch/);
        expect(() => interpolator('50px', 'M0 0')).toThrow(/kind mismatch/);
    });

    describe('number', () => {
        const f = interpolator(0, 10);
        test('t=0 / 0.5 / 1', () => {
            expect(f(0)).toBe(0);
            expect(f(0.5)).toBe(5);
            expect(f(1)).toBe(10);
        });
    });

    describe('unit', () => {
        const f = interpolator('0px', '100px');
        test('parity at t=0 / 0.5 / 1', () => {
            expect(f(0)).toBe('0px');
            expect(f(0.5)).toBe('50px');
            expect(f(1)).toBe('100px');
        });

        test('unitless ends format bare', () => {
            const g = interpolator('0', '10');
            expect(g(0.5)).toBe('5');
        });

        test('unit mismatch throws', () => {
            expect(() => interpolator('10px', '10em')).toThrow(/unit mismatch/);
        });
    });

    describe('color', () => {
        const f = interpolator('#000000', '#ffffff');
        test('endpoints and midpoint in rgb space', () => {
            expect(f(0)).toBe('rgb(0, 0, 0)');
            expect(f(1)).toBe('rgb(255, 255, 255)');
            expect(f(0.5)).toBe('rgb(128, 128, 128)');
        });

        test('named + hsl ends interpolate', () => {
            const g = interpolator('red', 'hsl(0, 0%, 0%)');
            // red = rgb(255,0,0); hsl(0,0,0) = black.
            expect(g(0)).toBe('rgb(255, 0, 0)');
            expect(g(1)).toBe('rgb(0, 0, 0)');
        });
    });

    describe('transform', () => {
        // Matching lists (same length, same function per position) interpolate
        // per function, as CSS Transforms does; others go through the matrix
        // decomposition and write `matrix(...)`.
        const f = interpolator('translate(0, 0)', 'translate(100, 0)');
        test('translate parity at t=0 / 0.5 / 1', () => {
            expect(f(0)).toBe('translate(0,0)');
            expect(f(1)).toBe('translate(100,0)');
            expect(f(0.5)).toBe('translate(50,0)');
        });

        test('scale interpolation blends the scale arguments', () => {
            const g = interpolator('scale(1)', 'scale(3)');
            expect(g(0.5)).toBe('scale(2,2)');
        });

        test('a matching list eases each function on its own (the legacy desk fade)', () => {
            const g = interpolator('scale(0.75) translate(100,50)', 'scale(1) translate(0,0)');
            expect(g(0)).toBe('scale(0.75,0.75) translate(100,50)');
            expect(g(1)).toBe('scale(1,1) translate(0,0)');
            // Per function: scale 0.875, translate (50, 25) — NOT the matrix
            // lerp, whose translation would be (37.5, 18.75) / 0.875.
            expect(g(0.5)).toBe('scale(0.875,0.875) translate(50,25)');
        });

        test('arguments are normalized before the lerp', () => {
            expect(interpolator('translate(10)', 'translate(30, 40)')(0.5)).toBe('translate(20,20)');
            expect(interpolator('scale(2)', 'scale(4, 6)')(0.5)).toBe('scale(3,4)');
            expect(interpolator('rotate(0)', 'rotate(90)')(0.5)).toBe('rotate(45)');
            expect(interpolator('rotate(0)', 'rotate(90, 10, 20)')(0.5)).toBe('rotate(45,5,10)');
            expect(interpolator('skewX(0)', 'skewX(30)')(0.5)).toBe('skewX(15)');
            expect(interpolator('SKEWY(10)', 'skewY(20)')(0.5)).toBe('skewY(15)');
        });

        test('numbers are rounded like Matrix.toString', () => {
            expect(interpolator('translate(0,0)', 'translate(1,0)')(1 / 3)).toBe('translate(0.333333,0)');
        });

        test('a matrix pair in a matching list goes through the decomposition, in place', () => {
            const g = interpolator('translate(0,0) matrix(1,0,0,1,0,0)', 'translate(10,0) matrix(3,0,0,3,0,0)');
            expect(g(0.5)).toBe('translate(5,0) matrix(2,0,0,2,0,0)');
        });

        test('lists that do not match keep the matrix decomposition', () => {
            // Another function at a position.
            expect(interpolator('translate(0,0)', 'scale(3)')(0.5)).toBe('matrix(2,0,0,2,0,0)');
            // Another length.
            expect(interpolator('translate(0,0)', 'translate(100,0) scale(1)')(0.5)).toBe('matrix(1,0,0,1,50,0)');
        });
    });

    describe('path', () => {
        test('equal-structure fast path lerps point-wise', () => {
            const f = interpolator('M0 0 L10 10', 'M0 0 L20 20');
            const mid = f(0.5);
            // Canonical: M then a degenerate C; endpoint blends 10→15.
            expect(mid).toContain('M 0 0');
            expect(mid).toContain('15 15');
        });

        test('differing structure normalizes (no throw)', () => {
            const f = interpolator('M0 0 L10 10', 'M0 0 L5 5 L10 10 L15 0');
            expect(() => f(0)).not.toThrow();
            expect(() => f(0.5)).not.toThrow();
            expect(() => f(1)).not.toThrow();
            expect(typeof f(0.5)).toBe('string');
        });

        test('arc input no longer throws', () => {
            const f = interpolator('M10 0 A10 10 0 0 1 0 10', 'M10 0 L0 10');
            expect(() => f(0.5)).not.toThrow();
        });

        test('invalid (empty) path throws', () => {
            expect(() => interpolator('M0 0', '')).toThrow();
        });
    });
});

describe('exposed parsers', () => {
    test('parseTransform and parsePath are returned functions', () => {
        expect(typeof parseTransform).toBe('function');
        expect(typeof parsePath).toBe('function');
        expect(parseTransform('translate(1,2)').e).toBe(1);
        expect(parsePath('M0 0')[0].cmd).toBe('M');
    });
});

describe('Worker-safety: DOM-free module scan', () => {
    function stripComments(src) {
        let s = src.replace(/\/\*[\s\S]*?\*\//g, '');
        s = s.replace(/\/\/[^\n]*/g, '');
        return s;
    }

    test('index.js source contains no window/document/globalThis usage', () => {
        const src = stripComments(readFileSync(resolve(HERE, 'index.js'), 'utf8'));
        expect(src).not.toMatch(/\bwindow\b/);
        expect(src).not.toMatch(/\bdocument\b/);
        expect(src).not.toMatch(/\bglobalThis\b/);
    });
});
