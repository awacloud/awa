// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit tests for the pure `svg3d.vec3` kernel — descriptor shape,
 * DOM-free source scan (Worker-safe contract), algebraic identities for
 * dot/cross/length, rotation-order parity against a transcription of the salvage
 * reference's sequential rotation, and capture-freedom (bare-realm resolve).
 */

import { describe, test, expect } from 'bun:test';
import { svg3dVec3Module } from './vec3.js';

const vec3 = svg3dVec3Module.factory();

/**
 * Re-evaluate a descriptor's factory in a BARE realm (no module scope at all).
 * Any capture of a module-scope binding throws `ReferenceError` here — this is
 * the runtime half of the area's standing capture-freedom guard (the static half
 * is `fw/no-factory-capture`, wired by the package-local `eslint.config.js` and
 * proven non-vacuous by `tests/lint-capture.integration.test.js`).
 *
 * @param {{ factory: Function }} mod
 * @returns {Function} The factory, recompiled with no lexical parent scope.
 */
function bareRealmFactory(mod) {
    const src = mod.factory.toString().replace(/^factory\s*\(/, 'function (');
    return new Function(`"use strict"; return (${src});`)();
}

/**
 * The salvage reference's sequential rotation, transcribed verbatim in shape from
 * `packages/front/@anim-old/SVG-3D/js/aJS3D/aJS-3D-v.0.1.js` (`render()`,
 * the `d1`/`d2`/`d3` assignments). The composed matrix must reproduce it.
 *
 * @param {number} dx @param {number} dy @param {number} dz
 * @param {number} rx @param {number} ry @param {number} rz
 * @returns {number[]} `[x, y, z]`
 */
function rotateSequentialReference(dx, dy, dz, rx, ry, rz) {
    const d1x = Math.cos(ry) * dx + Math.sin(ry) * dz;
    const d1y = dy;
    const d1z = Math.cos(ry) * dz - Math.sin(ry) * dx;

    const d2x = d1x;
    const d2y = Math.cos(rx) * d1y - Math.sin(rx) * d1z;
    const d2z = Math.cos(rx) * d1z + Math.sin(rx) * d1y;

    const d3x = Math.cos(rz) * d2x + Math.sin(rz) * d2y;
    const d3y = Math.cos(rz) * d2y - Math.sin(rz) * d2x;
    const d3z = d2z;

    return [d3x, d3y, d3z];
}

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('svg3dVec3Module descriptor', () => {
    test('is a pure, Worker-safe leaf descriptor with a non-graphic.* name', () => {
        expect(svg3dVec3Module.name).toBe('svg3d.vec3');
        expect(svg3dVec3Module.name.startsWith('graphic.')).toBe(false);
        expect(svg3dVec3Module.type).toBe('lib.graphic.svg3d');
        expect(svg3dVec3Module.version).toBe('0.1.0');
        expect(svg3dVec3Module.dependencies).toEqual([]);
        expect(svg3dVec3Module.deps).toEqual([]);
    });

    test('factory returns the prescribed kernel surface', () => {
        const api = svg3dVec3Module.factory();
        expect(typeof api.dot3).toBe('function');
        expect(typeof api.cross3).toBe('function');
        expect(typeof api.length3).toBe('function');
        expect(typeof api.rotationMatrix3).toBe('function');
        expect(typeof api.applyMatrix3).toBe('function');
    });
});

// ── DOM-free source scan (FINDINGS structural finding 3) ─────────────────────

describe('svg3d.vec3 is DOM-free and Canvas-free by source scan', () => {
    test('vec3.js references no DOM/host global once comments are stripped', async () => {
        const src = await Bun.file(new URL('./vec3.js', import.meta.url)).text();
        const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        expect(/\bdocument\b/.test(body)).toBe(false);
        expect(/\bwindow\b/.test(body)).toBe(false);
        expect(/\brequestAnimationFrame\b/.test(body)).toBe(false);
        expect(/\bglobalThis\b/.test(body)).toBe(false);
        expect(/\bgetContext\b/.test(body)).toBe(false);
        expect(/\bCanvas\b/.test(body)).toBe(false);
    });
});

// ── dot / cross / length algebraic identities ────────────────────────────────

describe('dot3 / cross3 / length3 algebraic identities', () => {
    const A = [1.5, -2.25, 3.75];
    const B = [-0.5, 4, 2];

    test('dot3 is commutative and matches the manual sum', () => {
        expect(vec3.dot3(...A, ...B)).toBeCloseTo(
            A[0] * B[0] + A[1] * B[1] + A[2] * B[2], 12,
        );
        expect(vec3.dot3(...A, ...B)).toBeCloseTo(vec3.dot3(...B, ...A), 12);
    });

    test('cross3 is orthogonal to both operands', () => {
        const n = vec3.cross3(...A, ...B, new Float64Array(3));
        expect(vec3.dot3(n[0], n[1], n[2], ...A)).toBeCloseTo(0, 10);
        expect(vec3.dot3(n[0], n[1], n[2], ...B)).toBeCloseTo(0, 10);
    });

    test('cross3 is anti-commutative and writes into (and returns) out', () => {
        const out = new Float64Array(3);
        const ab = vec3.cross3(...A, ...B, out);
        expect(ab).toBe(out);
        const ba = vec3.cross3(...B, ...A, new Float64Array(3));
        for (let i = 0; i < 3; i += 1) expect(ab[i]).toBeCloseTo(-ba[i], 12);
    });

    test('cross3 of parallel vectors is zero', () => {
        const n = vec3.cross3(...A, A[0] * 3, A[1] * 3, A[2] * 3, new Float64Array(3));
        for (let i = 0; i < 3; i += 1) expect(n[i]).toBeCloseTo(0, 10);
    });

    test('|a×b|² + (a·b)² = |a|²·|b|² (Lagrange identity)', () => {
        const n = vec3.cross3(...A, ...B, new Float64Array(3));
        const lhs = vec3.length3(n[0], n[1], n[2]) ** 2 + vec3.dot3(...A, ...B) ** 2;
        const rhs = (vec3.length3(...A) ** 2) * (vec3.length3(...B) ** 2);
        expect(lhs).toBeCloseTo(rhs, 8);
    });

    test('length3 is the Euclidean norm; 3-4-5 and zero are exact', () => {
        expect(vec3.length3(3, 4, 0)).toBe(5);
        expect(vec3.length3(0, 0, 0)).toBe(0);
        expect(vec3.length3(2, 3, 6)).toBeCloseTo(7, 12);
    });
});

// ── Rotation-order parity vs the salvage sequential reference ────────────────

describe('rotationMatrix3 — ry → rx → rz order, parity-locked to the salvage', () => {
    const ANGLES = [
        [0, 0, 0],
        [0.55, 0, 0],
        [0.55, 1.2, 0],
        [0.41, 0.83, 0.12],
        [-1.1, 2.7, -0.6],
        [Math.PI / 2, Math.PI / 3, Math.PI / 5],
    ];
    const VECTORS = [
        [1, 0, 0], [0, 1, 0], [0, 0, 1],
        [120, -55.5, 480], [-3.25, 7.125, -0.5],
    ];

    test('composed matrix reproduces the sequential reference rotation', () => {
        const out = new Float64Array(3);
        const m = new Float64Array(9);
        for (const [rx, ry, rz] of ANGLES) {
            vec3.rotationMatrix3(rx, ry, rz, m);
            for (const [x, y, z] of VECTORS) {
                vec3.applyMatrix3(m, x, y, z, out);
                const ref = rotateSequentialReference(x, y, z, rx, ry, rz);
                expect(out[0]).toBeCloseTo(ref[0], 9);
                expect(out[1]).toBeCloseTo(ref[1], 9);
                expect(out[2]).toBeCloseTo(ref[2], 9);
            }
        }
    });

    test('the identity rotation is the identity matrix', () => {
        const m = vec3.rotationMatrix3(0, 0, 0);
        // `toBeCloseTo` rather than `toEqual`: a zero entry may legitimately be
        // the signed `-0` produced by `-cx * sy` at sy = 0.
        const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        for (let i = 0; i < 9; i += 1) expect(m[i]).toBeCloseTo(identity[i], 15);
    });

    test('the rotation is orthonormal (rows unit-length and mutually orthogonal)', () => {
        const m = vec3.rotationMatrix3(0.41, 0.83, 0.12, new Float64Array(9));
        for (let r = 0; r < 3; r += 1) {
            expect(vec3.length3(m[r * 3], m[r * 3 + 1], m[r * 3 + 2])).toBeCloseTo(1, 10);
        }
        expect(vec3.dot3(m[0], m[1], m[2], m[3], m[4], m[5])).toBeCloseTo(0, 10);
        expect(vec3.dot3(m[0], m[1], m[2], m[6], m[7], m[8])).toBeCloseTo(0, 10);
        expect(vec3.dot3(m[3], m[4], m[5], m[6], m[7], m[8])).toBeCloseTo(0, 10);
    });

    test('rotation preserves length', () => {
        const m = vec3.rotationMatrix3(-1.1, 2.7, -0.6, new Float64Array(9));
        const out = new Float64Array(3);
        vec3.applyMatrix3(m, 120, -55.5, 480, out);
        expect(vec3.length3(out[0], out[1], out[2])).toBeCloseTo(vec3.length3(120, -55.5, 480), 8);
    });

    test('rotationMatrix3 reuses the out buffer (no allocation when given one)', () => {
        const m = new Float64Array(9);
        expect(vec3.rotationMatrix3(0.3, 0.4, 0.5, m)).toBe(m);
    });
});

// ── Capture-freedom ──────────────────────────────────────────────────────────

describe('svg3d.vec3 is capture-free', () => {
    test('the factory resolves in a bare realm (no module-scope capture)', () => {
        const api = bareRealmFactory(svg3dVec3Module)();
        expect(typeof api.rotationMatrix3).toBe('function');
        const m = api.rotationMatrix3(0, 0, 0);
        const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        for (let i = 0; i < 9; i += 1) expect(m[i]).toBeCloseTo(identity[i], 15);
        expect(api.length3(3, 4, 0)).toBe(5);
    });

    test('two factory instances share no function identity', () => {
        const a = svg3dVec3Module.factory();
        const b = svg3dVec3Module.factory();
        expect(a.rotationMatrix3).not.toBe(b.rotationMatrix3);
        expect(a.length3(3, 4, 0)).toBe(b.length3(3, 4, 0));
    });
});
