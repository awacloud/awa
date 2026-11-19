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

// Resolve the descriptor. parsePath is public; normalize/isCompatible/formatPath
// are now factory-internal — they are exercised through `interpolator` (which
// normalizes both ends and serializes via formatPath), so the same behaviors
// stay under test through the public surface.
const lerp = lerpModule.factory(interp.factory());
const units = unitsModule.factory();
const matrix = matrixModule.factory(lerp);
const color = colorModule.factory(lerp);
const { parsePath, interpolator } = interpolateModule.factory(lerp, units, matrix, color);

/** Evaluate a cubic Bézier at parameter u ∈ [0,1]. */
function cubicAt(p0, c1, c2, p1, u) {
    const mt = 1 - u;
    return mt * mt * mt * p0
        + 3 * mt * mt * u * c1
        + 3 * mt * u * u * c2
        + u * u * u * p1;
}

/**
 * Parse a serialized `d` string back into `{cmd, coords}` segments. Inverse of
 * the factory-internal `formatPath`; lets the tests inspect the normalized +
 * serialized output produced through `interpolator`.
 */
function parseSerialized(d) {
    const segs = [];
    const tokens = d.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
    let i = 0;
    while (i < tokens.length) {
        const cmd = tokens[i++];
        const n = cmd === 'M' ? 2 : cmd === 'C' ? 6 : 0;
        const coords = [];
        for (let k = 0; k < n; k++) coords.push(parseFloat(tokens[i++]));
        segs.push({ cmd, coords });
    }
    return segs;
}

describe('parsePath', () => {
    test('M + L → canonical M then degenerate C', () => {
        const segs = parsePath('M0 0 L10 10');
        expect(segs.map((s) => s.cmd)).toEqual(['M', 'C']);
        expect(segs[0].coords).toEqual([0, 0]);
        // L10 10 → C with control points on the endpoint.
        expect(segs[1].coords).toEqual([0, 0, 10, 10, 10, 10]);
    });

    test('every segment after parse is M, C, or Z only', () => {
        const segs = parsePath('M0 0 H10 V10 L0 10 Q5 5 0 0 Z');
        for (const s of segs) expect(['M', 'C', 'Z']).toContain(s.cmd);
    });

    describe('shorthands → canonical', () => {
        test('H (horizontal) keeps y constant', () => {
            const segs = parsePath('M5 5 H20');
            expect(segs[1].coords).toEqual([5, 5, 20, 5, 20, 5]);
        });

        test('V (vertical) keeps x constant', () => {
            const segs = parsePath('M5 5 V20');
            expect(segs[1].coords).toEqual([5, 5, 5, 20, 5, 20]);
        });

        test('S reflects the previous cubic control point', () => {
            // C ends with ctrl2 = (8,4); S should reflect about end (10,0).
            const segs = parsePath('M0 0 C2 4 8 4 10 0 S18 -4 20 0');
            // reflection of (8,4) about (10,0) = (12,-4).
            expect(segs[2].cmd).toBe('C');
            expect(segs[2].coords[0]).toBeCloseTo(12, 6);
            expect(segs[2].coords[1]).toBeCloseTo(-4, 6);
        });

        test('Q → cubic elevation', () => {
            const segs = parsePath('M0 0 Q6 12 12 0');
            // c1 = p0 + 2/3(q-p0) = (4,8); c2 = p1 + 2/3(q-p1) = (8,8).
            expect(segs[1].coords[0]).toBeCloseTo(4, 6);
            expect(segs[1].coords[1]).toBeCloseTo(8, 6);
            expect(segs[1].coords[2]).toBeCloseTo(8, 6);
            expect(segs[1].coords[3]).toBeCloseTo(8, 6);
            expect(segs[1].coords[4]).toBeCloseTo(12, 6);
        });

        test('T reflects the previous quadratic control point', () => {
            const segs = parsePath('M0 0 Q6 12 12 0 T24 0');
            // reflected quad ctrl about (12,0) of (6,12) = (18,-12).
            // c1 of the T cubic = 12 + 2/3(18-12) = 16 on x.
            expect(segs[2].coords[0]).toBeCloseTo(16, 6);
            expect(segs[2].coords[1]).toBeCloseTo(-8, 6);
        });
    });

    describe('relative / lowercase → absolute', () => {
        test('relative m + l resolve against the running point', () => {
            const segs = parsePath('m10 10 l5 5');
            expect(segs[0].coords).toEqual([10, 10]);
            // l5 5 relative → absolute (15,15).
            expect(segs[1].coords).toEqual([10, 10, 15, 15, 15, 15]);
        });

        test('relative c resolves all three points', () => {
            const segs = parsePath('M0 0 c1 1 2 2 3 3');
            expect(segs[1].coords).toEqual([1, 1, 2, 2, 3, 3]);
        });

        test('implicit repeated command (omitted letter)', () => {
            // Second pair of L coords without a repeated "L".
            const segs = parsePath('M0 0 L1 1 2 2');
            expect(segs.map((s) => s.cmd)).toEqual(['M', 'C', 'C']);
            expect(segs[2].coords[4]).toBe(2);
        });
    });

    describe('arc A → cubic (W0 gap closed)', () => {
        test('sampled cubics track the true arc within tolerance', () => {
            // Quarter circle radius 10 from (10,0) to (0,10), sweep=1.
            const segs = parsePath('M10 0 A10 10 0 0 1 0 10');
            const curves = segs.filter((s) => s.cmd === 'C');
            expect(curves.length).toBeGreaterThanOrEqual(1);
            // Walk the cubic chain, sampling; every sample must lie on r=10 circle.
            let px = 10;
            let py = 0;
            for (const c of curves) {
                const [c1x, c1y, c2x, c2y, ex, ey] = c.coords;
                for (let u = 0; u <= 1.0001; u += 0.25) {
                    const x = cubicAt(px, c1x, c2x, ex, u);
                    const y = cubicAt(py, c1y, c2y, ey, u);
                    expect(Math.hypot(x, y)).toBeCloseTo(10, 1);
                }
                px = ex; py = ey;
            }
            // Endpoint lands on (0,10).
            expect(px).toBeCloseTo(0, 4);
            expect(py).toBeCloseTo(10, 4);
        });

        test('large-arc flag sweeps the long way (more sub-cubics)', () => {
            const segs = parsePath('M10 0 A10 10 0 1 1 0 10');
            const curves = segs.filter((s) => s.cmd === 'C');
            // 270° arc → at least 3 sub-cubics (≤90° each).
            expect(curves.length).toBeGreaterThanOrEqual(3);
        });

        test('zero-radius arc degenerates to a line', () => {
            const segs = parsePath('M0 0 A0 0 0 0 0 10 10');
            expect(segs[1].cmd).toBe('C');
            expect(segs[1].coords.slice(4)).toEqual([10, 10]);
        });
    });

    describe('Z (close)', () => {
        test('Z resets the running point to the sub-path start', () => {
            const segs = parsePath('M5 5 L10 10 Z l1 1');
            expect(segs.some((s) => s.cmd === 'Z')).toBe(true);
            // After Z the pen is back at (5,5); relative l1 1 → (6,6).
            const last = segs[segs.length - 1];
            expect(last.coords.slice(4)).toEqual([6, 6]);
        });
    });

    describe('invalid d throws', () => {
        test('empty string', () => {
            expect(() => parsePath('')).toThrow();
            expect(() => parsePath('   ')).toThrow();
        });

        test('not starting with a command', () => {
            expect(() => parsePath('10 10 L5 5')).toThrow();
        });

        test('unsupported command letter', () => {
            expect(() => parsePath('M0 0 B5 5')).toThrow(/unsupported/);
        });

        test('missing coordinate', () => {
            expect(() => parsePath('M0 0 L5')).toThrow();
        });
    });
});

// normalize / isCompatible / formatPath are factory-internal; their behavior is
// observed through `interpolator`, which normalizes both ends + serializes.
describe('normalization (via interpolator)', () => {
    test('identical structure: endpoints serialize the originals (W0 fast path)', () => {
        // Both have 1 curve; at t=0 the output is the `from` path serialized,
        // at t=1 the `to` path serialized — no padding inserted.
        const f = interpolator('M0 0 L10 10', 'M5 5 L20 20');
        const a = parseSerialized(f(0));
        const b = parseSerialized(f(1));
        expect(a.map((s) => s.cmd)).toEqual(['M', 'C']);
        expect(b.map((s) => s.cmd)).toEqual(['M', 'C']);
        expect(a[1].coords).toEqual([0, 0, 10, 10, 10, 10]);
        expect(b[1].coords).toEqual([5, 5, 20, 20, 20, 20]);
    });

    test('differing structure normalizes to equal length + commands', () => {
        // a: 1 curve, b: 3 curves → both ends pad to 3 curves.
        const f = interpolator('M0 0 L10 10', 'M0 0 L5 5 L10 10 L15 0');
        const a = parseSerialized(f(0));
        const b = parseSerialized(f(1));
        expect(a.length).toBe(b.length);
        expect(a.map((s) => s.cmd)).toEqual(b.map((s) => s.cmd));
        // 1 M + 3 C.
        expect(a.map((s) => s.cmd)).toEqual(['M', 'C', 'C', 'C']);
    });

    test('padding repeats the final endpoint as a degenerate curve', () => {
        // a has 1 curve (endpoint 10,10), b has 2 → a pads with a degenerate
        // curve at (10,10). At t=0 the padded tail mirrors the original tail.
        const f = interpolator('M0 0 L10 10', 'M0 0 L5 5 L10 10');
        const a = parseSerialized(f(0));
        const padded = a[a.length - 1];
        // Degenerate: all control points equal the endpoint (10,10).
        expect(padded.coords).toEqual([10, 10, 10, 10, 10, 10]);
    });

    test('close flag preserved through normalize', () => {
        const f = interpolator('M0 0 L10 10 Z', 'M0 0 L5 5 L10 10 Z');
        const a = parseSerialized(f(0));
        const b = parseSerialized(f(1));
        expect(a[a.length - 1].cmd).toBe('Z');
        expect(b[b.length - 1].cmd).toBe('Z');
    });
});

describe('formatPath (via interpolator output)', () => {
    test('rounds coordinates to 1e-3', () => {
        // 0.12345 → 0.123, 5.0006 → 5.001. Use a t=0 endpoint that carries the
        // raw coordinates through the (factory-internal) formatPath rounding.
        const f = interpolator('M0.12345 1 L5.0006 6', 'M0.12345 1 L5.0006 6');
        const out = f(0);
        expect(out).toContain('M 0.123 1');
        expect(out).toContain('5.001 6');
    });

    test('Z serializes with no coords', () => {
        const f = interpolator('M0 0 L10 10 Z', 'M0 0 L10 10 Z');
        const out = f(0);
        expect(out.trim().endsWith('Z')).toBe(true);
    });

    test('round-trip through parse + serialize is stable for canonical input', () => {
        // interpolator(d,d) at t=0 serializes parsePath(d); re-feeding that
        // string must serialize identically.
        const f1 = interpolator('M0 0 L10 10', 'M0 0 L10 10');
        const out = f1(0);
        const f2 = interpolator(out, out);
        expect(f2(0)).toBe(out);
    });
});

describe('Worker-safety: DOM-free module scan', () => {
    function stripComments(src) {
        let s = src.replace(/\/\*[\s\S]*?\*\//g, '');
        s = s.replace(/\/\/[^\n]*/g, '');
        return s;
    }

    test('index.js source (folds the path engine) is DOM-free', () => {
        const src = stripComments(readFileSync(resolve(HERE, 'index.js'), 'utf8'));
        expect(src).not.toMatch(/\bwindow\b/);
        expect(src).not.toMatch(/\bdocument\b/);
        expect(src).not.toMatch(/\bglobalThis\b/);
    });
});
