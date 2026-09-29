// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { linalg } from './linalg.js';

const EPSILON = 1e-5;
const near = (a, b) => Math.abs(a - b) < EPSILON;

describe('linalg module', () => {
    test('should have correct module metadata', () => {
        expect(linalg.name).toBe('linalg');
        expect(linalg.dependencies).toEqual([]);
        expect(typeof linalg.factory).toBe('function');
    });

    describe('factory', () => {
        const { vec2, vec3, vec4, mat3, mat4 } = linalg.factory();

        describe('vec3', () => {
            test('create returns Float32Array(3)', () => {
                const v = vec3.create();
                expect(v).toBeInstanceOf(Float32Array);
                expect(v.length).toBe(3);
            });

            test('create with initial values', () => {
                const v = vec3.create([1, 2, 3]);
                expect(v[0]).toBe(1); expect(v[1]).toBe(2); expect(v[2]).toBe(3);
            });

            test('add', () => {
                const out = vec3.create();
                const a = vec3.create([1, 2, 3]);
                const b = vec3.create([4, 5, 6]);
                vec3.add(out, a, b);
                expect([out[0], out[1], out[2]]).toEqual([5, 7, 9]);
            });

            test('dot perpendicular = 0', () => {
                const a = vec3.create([1, 0, 0]);
                const b = vec3.create([0, 1, 0]);
                expect(vec3.dot(a, b)).toBe(0);
            });

            test('dot parallel', () => {
                const a = vec3.create([2, 0, 0]);
                const b = vec3.create([3, 0, 0]);
                expect(vec3.dot(a, b)).toBe(6);
            });

            test('cross [1,0,0] x [0,1,0] = [0,0,1]', () => {
                const out = vec3.create();
                vec3.cross(out, vec3.create([1, 0, 0]), vec3.create([0, 1, 0]));
                expect(near(out[0], 0) && near(out[1], 0) && near(out[2], 1)).toBe(true);
            });

            test('normalize produces unit vector', () => {
                const out = vec3.create();
                vec3.normalize(out, vec3.create([3, 4, 0]));
                expect(near(vec3.length(out), 1)).toBe(true);
            });

            test('lerp midpoint', () => {
                const out = vec3.create();
                const a = vec3.create([0, 0, 0]);
                const b = vec3.create([2, 4, 6]);
                vec3.lerp(out, a, b, 0.5);
                expect([out[0], out[1], out[2]]).toEqual([1, 2, 3]);
            });

            test('equals', () => {
                const a = vec3.create([1, 2, 3]);
                const b = vec3.create([1, 2, 3]);
                expect(vec3.equals(a, b)).toBe(true);
            });

            test('aliasing safe: add(a, a, b)', () => {
                const a = vec3.create([1, 2, 3]);
                const b = vec3.create([1, 1, 1]);
                vec3.add(a, a, b);
                expect([a[0], a[1], a[2]]).toEqual([2, 3, 4]);
            });
        });

        describe('vec2', () => {
            test('create', () => expect(vec2.create([3, 4])).toBeInstanceOf(Float32Array));
            test('length', () => expect(near(vec2.length(vec2.create([3, 4])), 5)).toBe(true));
        });

        describe('vec4', () => {
            test('add', () => {
                const out = vec4.create();
                vec4.add(out, vec4.create([1,2,3,4]), vec4.create([1,1,1,1]));
                expect([out[0],out[1],out[2],out[3]]).toEqual([2,3,4,5]);
            });
        });

        describe('mat4', () => {
            test('create returns identity', () => {
                const m = mat4.create();
                expect(m[0]).toBe(1); expect(m[5]).toBe(1); expect(m[10]).toBe(1); expect(m[15]).toBe(1);
                expect(m[1]).toBe(0); expect(m[4]).toBe(0);
            });

            test('identity transform leaves vector unchanged', () => {
                const m = mat4.create();
                const out = vec3.create();
                mat4.transform(out, m, vec3.create([1, 2, 3]));
                expect(near(out[0], 1) && near(out[1], 2) && near(out[2], 3)).toBe(true);
            });

            test('translate identity then transform origin', () => {
                const m = mat4.create();
                const out = vec3.create();
                mat4.translate(m, m, [1, 2, 3]);
                mat4.transform(out, m, vec3.create([0, 0, 0]));
                expect(near(out[0], 1) && near(out[1], 2) && near(out[2], 3)).toBe(true);
            });

            test('rotate π/2 around Z axis: [1,0,0] → [0,1,0]', () => {
                const m = mat4.create();
                const out = vec3.create();
                mat4.rotate(m, m, Math.PI / 2, [0, 0, 1]);
                mat4.transform(out, m, vec3.create([1, 0, 0]));
                expect(near(out[0], 0) && near(out[1], 1) && near(out[2], 0)).toBe(true);
            });

            test('M * M^-1 ≈ identity', () => {
                const m = mat4.create();
                mat4.translate(m, m, [3, -1, 2]);
                mat4.rotate(m, m, 0.7, [0, 1, 0]);
                const inv = mat4.create();
                const ok = mat4.invert(inv, m);
                expect(ok).toBe(true);
                const prod = mat4.create();
                mat4.multiply(prod, m, inv);
                expect(near(prod[0], 1) && near(prod[5], 1) && near(prod[10], 1) && near(prod[15], 1)).toBe(true);
                expect(near(prod[1], 0) && near(prod[4], 0)).toBe(true);
            });

            test('perspective matrix has correct structure', () => {
                const m = mat4.create();
                mat4.perspective(m, Math.PI / 4, 1.5, 0.1, 100);
                expect(m[3]).toBe(0);
                expect(m[11]).toBe(-1);
                expect(m[15]).toBe(0);
                expect(m[0]).toBeGreaterThan(0);
            });

            test('lookAt: origin appears at distance 5 in view space', () => {
                const m = mat4.create();
                mat4.lookAt(m, [0, 0, 5], [0, 0, 0], [0, 1, 0]);
                const out = vec3.create();
                mat4.transform(out, m, vec3.create([0, 0, 0]));
                // in view space the world origin is 5 units in front: z = -5 (OpenGL forward = -Z)
                expect(near(Math.abs(out[2]), 5)).toBe(true);
            });

            test('scale', () => {
                const m = mat4.create();
                mat4.scale(m, m, [2, 3, 4]);
                const out = vec3.create();
                mat4.transform(out, m, vec3.create([1, 1, 1]));
                expect(near(out[0], 2) && near(out[1], 3) && near(out[2], 4)).toBe(true);
            });

            test('transpose', () => {
                const m = mat4.create();
                m[1] = 5; m[4] = 0;
                const t = mat4.create();
                mat4.transpose(t, m);
                expect(t[4]).toBe(5);
                expect(t[1]).toBe(0);
            });
        });

        describe('mat3', () => {
            test('create identity', () => {
                const m = mat3.create();
                expect(m[0]).toBe(1); expect(m[4]).toBe(1); expect(m[8]).toBe(1);
            });

            test('transform 2D', () => {
                const m = mat3.create();
                mat3.translate(m, m, [3, 4]);
                const out = vec2.create();
                mat3.transform(out, m, vec2.create([0, 0]));
                expect(near(out[0], 3) && near(out[1], 4)).toBe(true);
            });

            test('determinant of identity = 1', () => {
                expect(mat3.determinant(mat3.create())).toBe(1);
            });

            test('identity resets a modified matrix', () => {
                const m = mat3.create();
                mat3.translate(m, m, [5, 6]);
                mat3.identity(m);
                expect([...m]).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
            });

            test('copy duplicates a source matrix', () => {
                const src = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
                const out = mat3.create();
                mat3.copy(out, src);
                expect([...out]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
            });

            test('multiply matches hand-computed 3x3 matrix product (independent of translate/rotate)', () => {
                // A rows (row-major, derived from col-major storage): [1,4,7],[2,5,8],[3,6,9]
                // B rows: [9,6,3],[8,5,2],[7,4,1]
                // P = A*B, hand-computed via standard row*column dot products:
                // P = [[90,54,18],[114,69,24],[138,84,30]] -> col-major [90,114,138, 54,69,84, 18,24,30]
                const a = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
                const b = new Float32Array([9, 8, 7, 6, 5, 4, 3, 2, 1]);
                const out = mat3.create();
                mat3.multiply(out, a, b);
                expect([...out]).toEqual([90, 114, 138, 54, 69, 84, 18, 24, 30]);
            });

            test('rotate by pi/2 maps [1,0] to [0,1] (standard CCW rotation)', () => {
                const m = mat3.create();
                mat3.rotate(m, m, Math.PI / 2);
                const out = vec2.create();
                mat3.transform(out, m, vec2.create([1, 0]));
                expect(near(out[0], 0)).toBe(true);
                expect(near(out[1], 1)).toBe(true);
            });

            test('scale multiplies a point componentwise', () => {
                const m = mat3.create();
                mat3.scale(m, m, [2, 3]);
                const out = vec2.create();
                mat3.transform(out, m, vec2.create([1, 1]));
                expect(near(out[0], 2)).toBe(true);
                expect(near(out[1], 3)).toBe(true);
            });

            test('invert of a pure translation matrix equals the closed-form negative-translation matrix', () => {
                // For T = translate(I, [tx,ty]), the well-known closed form is
                // T^-1 = translate(I, [-tx,-ty]) — independent of the cofactor-expansion
                // implementation under test.
                const t = mat3.create();
                mat3.translate(t, t, [3, 4]);
                const inv = mat3.create();
                const ok = mat3.invert(inv, t);
                expect(ok).toBe(true);
                expect([...inv]).toEqual([1, 0, 0, 0, 1, 0, -3, -4, 1]);
            });

            test('invert returns false and leaves out untouched for a singular matrix', () => {
                const singular = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 1]); // determinant = 0
                const out = new Float32Array([9, 9, 9, 9, 9, 9, 9, 9, 9]);
                const ok = mat3.invert(out, singular);
                expect(ok).toBe(false);
                expect([...out]).toEqual([9, 9, 9, 9, 9, 9, 9, 9, 9]);
            });

            test('transpose matches the hand-derived transpose of a known matrix', () => {
                // A row-major: [1,4,7],[2,5,8],[3,6,9] -> A^T row-major: [1,2,3],[4,5,6],[7,8,9]
                // -> A^T col-major storage: [1,4,7, 2,5,8, 3,6,9]
                const m = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
                const out = mat3.create();
                mat3.transpose(out, m);
                expect([...out]).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
            });
        });

        describe('mat4 (remaining ops)', () => {
            test('identity resets a modified matrix', () => {
                const m = mat4.create();
                mat4.translate(m, m, [1, 2, 3]);
                mat4.identity(m);
                expect([...m]).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
            });

            test('copy duplicates a source matrix', () => {
                const src = Float32Array.from({ length: 16 }, (_, i) => i + 1);
                const out = mat4.create();
                mat4.copy(out, src);
                expect([...out]).toEqual([...src]);
            });

            test('multiply(T, S) composes translate-then-scale, matching direct geometric composition', () => {
                // T = translate(I,[1,2,3]); S = scale(I,[2,3,4]).
                // prod = T*S so prod*v = T*(S*v): S*[1,1,1] = [2,3,4]; T*[2,3,4] = [3,5,7].
                const t = mat4.create(); mat4.translate(t, t, [1, 2, 3]);
                const s = mat4.create(); mat4.scale(s, s, [2, 3, 4]);
                const prod = mat4.create();
                mat4.multiply(prod, t, s);
                const out = vec3.create();
                mat4.transform(out, prod, vec3.create([1, 1, 1]));
                expect(near(out[0], 3) && near(out[1], 5) && near(out[2], 7)).toBe(true);
            });

            test('rotate pi/2 around X axis maps [0,1,0] to [0,0,1] (standard right-hand rotation)', () => {
                const m = mat4.create();
                mat4.rotate(m, m, Math.PI / 2, [1, 0, 0]);
                const out = vec3.create();
                mat4.transform(out, m, vec3.create([0, 1, 0]));
                expect(near(out[0], 0) && near(out[1], 0) && near(out[2], 1)).toBe(true);
            });

            test('invert of a pure translation matrix equals the closed-form negative-translation matrix', () => {
                const t = mat4.create();
                mat4.translate(t, t, [5, -2, 7]);
                const inv = mat4.create();
                const ok = mat4.invert(inv, t);
                expect(ok).toBe(true);
                const expected = mat4.create();
                mat4.translate(expected, expected, [-5, 2, -7]);
                for (let i = 0; i < 16; i++) expect(near(inv[i], expected[i])).toBe(true);
            });

            test('transpose is correct when out and m alias the same matrix (in-place swap)', () => {
                const m = mat4.create();
                m[1] = 5; m[4] = 0; m[2] = 9; m[8] = 0; m[7] = 11; m[13] = 0;
                const expected = mat4.create();
                mat4.transpose(expected, m); // non-aliased reference (already covered elsewhere)
                mat4.transpose(m, m); // aliased: out === m
                expect([...m]).toEqual([...expected]);
            });

            test('ortho matches the textbook OpenGL orthographic projection formula', () => {
                // Symmetric frustum l=-1,r=1,b=-1,t=1,n=1,f=3:
                // standard form: M[0]=1, M[5]=1, M[10]=-2/(f-n)=-1, M[14]=-(f+n)/(f-n)=-2, M[15]=1.
                const m = mat4.create();
                mat4.ortho(m, -1, 1, -1, 1, 1, 3);
                expect(m[0]).toBeCloseTo(1, 6);
                expect(m[5]).toBeCloseTo(1, 6);
                expect(m[10]).toBeCloseTo(-1, 6);
                expect(m[12]).toBeCloseTo(0, 6);
                expect(m[13]).toBeCloseTo(0, 6);
                expect(m[14]).toBeCloseTo(-2, 6);
                expect(m[15]).toBeCloseTo(1, 6);

                // Geometric oracle: the near plane (view-space z=-1) maps to NDC z=-1,
                // the far plane (view-space z=-3) maps to NDC z=+1 (OpenGL convention).
                const near4 = vec4.create();
                mat4.transform4(near4, m, vec4.create([0, 0, -1, 1]));
                expect(near4[2]).toBeCloseTo(-1, 6);
                const far4 = vec4.create();
                mat4.transform4(far4, m, vec4.create([0, 0, -3, 1]));
                expect(far4[2]).toBeCloseTo(1, 6);
            });

            test('transform4 applies no perspective divide, unlike transform', () => {
                const m = mat4.create();
                mat4.translate(m, m, [1, 2, 3]);
                const out = vec4.create();
                mat4.transform4(out, m, vec4.create([0, 0, 0, 1]));
                expect([...out]).toEqual([1, 2, 3, 1]);
            });

            test('transform4 with w=0 (direction vector) is unaffected by translation — homogeneous-coordinate identity', () => {
                const m = mat4.create();
                mat4.translate(m, m, [10, 20, 30]);
                const out = vec4.create();
                mat4.transform4(out, m, vec4.create([1, 0, 0, 0]));
                expect([...out]).toEqual([1, 0, 0, 0]);
            });
        });
    });

    describe('factory (vec2/vec3/vec4 full operation set)', () => {
        const { vec2, vec3, vec4 } = linalg.factory();

        describe('vec2', () => {
            test('copy', () => {
                const out = vec2.create();
                vec2.copy(out, vec2.create([7, 8]));
                expect([out[0], out[1]]).toEqual([7, 8]);
            });
            test('set', () => {
                const out = vec2.create();
                vec2.set(out, 3, 4);
                expect([out[0], out[1]]).toEqual([3, 4]);
            });
            test('add', () => {
                const out = vec2.create();
                vec2.add(out, vec2.create([1, 2]), vec2.create([3, 4]));
                expect([out[0], out[1]]).toEqual([4, 6]);
            });
            test('sub', () => {
                const out = vec2.create();
                vec2.sub(out, vec2.create([5, 7]), vec2.create([2, 1]));
                expect([out[0], out[1]]).toEqual([3, 6]);
            });
            test('mul (componentwise)', () => {
                const out = vec2.create();
                vec2.mul(out, vec2.create([2, 3]), vec2.create([4, 5]));
                expect([out[0], out[1]]).toEqual([8, 15]);
            });
            test('scale', () => {
                const out = vec2.create();
                vec2.scale(out, vec2.create([2, 3]), 2.5);
                expect([out[0], out[1]]).toEqual([5, 7.5]);
            });
            test('dot', () => {
                expect(vec2.dot(vec2.create([1, 2]), vec2.create([3, 4]))).toBe(11); // 1*3+2*4
            });
            test('lengthSq', () => {
                expect(vec2.lengthSq(vec2.create([3, 4]))).toBe(25);
            });
            test('normalize of a zero vector falls back to the zero-length guard (no division by zero)', () => {
                const out = vec2.create();
                vec2.normalize(out, vec2.create([0, 0]));
                expect([out[0], out[1]]).toEqual([0, 0]);
            });
            test('distance', () => {
                expect(near(vec2.distance(vec2.create([0, 0]), vec2.create([3, 4])), 5)).toBe(true);
            });
            test('equals: true within epsilon, false beyond it', () => {
                expect(vec2.equals(vec2.create([1, 1]), vec2.create([1.0000001, 1]))).toBe(true);
                expect(vec2.equals(vec2.create([1, 1]), vec2.create([1.1, 1]))).toBe(false);
            });
        });

        describe('vec3 (remaining ops)', () => {
            test('copy', () => {
                const out = vec3.create();
                vec3.copy(out, vec3.create([1, 2, 3]));
                expect([...out]).toEqual([1, 2, 3]);
            });
            test('set', () => {
                const out = vec3.create();
                vec3.set(out, 4, 5, 6);
                expect([...out]).toEqual([4, 5, 6]);
            });
            test('sub', () => {
                const out = vec3.create();
                vec3.sub(out, vec3.create([5, 7, 9]), vec3.create([1, 2, 3]));
                expect([...out]).toEqual([4, 5, 6]);
            });
            test('mul (componentwise)', () => {
                const out = vec3.create();
                vec3.mul(out, vec3.create([2, 3, 4]), vec3.create([5, 6, 7]));
                expect([...out]).toEqual([10, 18, 28]);
            });
            test('scale', () => {
                const out = vec3.create();
                vec3.scale(out, vec3.create([1, 2, 3]), 3);
                expect([...out]).toEqual([3, 6, 9]);
            });
            test('lengthSq', () => {
                expect(vec3.lengthSq(vec3.create([1, 2, 2]))).toBe(9);
            });
            test('distance', () => {
                expect(near(vec3.distance(vec3.create([0, 0, 0]), vec3.create([1, 2, 2])), 3)).toBe(true);
            });
            test('equals false beyond epsilon', () => {
                expect(vec3.equals(vec3.create([1, 2, 3]), vec3.create([1, 2, 3.5]))).toBe(false);
            });
        });

        describe('vec4', () => {
            test('copy', () => {
                const out = vec4.create();
                vec4.copy(out, vec4.create([1, 2, 3, 4]));
                expect([...out]).toEqual([1, 2, 3, 4]);
            });
            test('set', () => {
                const out = vec4.create();
                vec4.set(out, 1, 2, 3, 4);
                expect([...out]).toEqual([1, 2, 3, 4]);
            });
            test('sub', () => {
                const out = vec4.create();
                vec4.sub(out, vec4.create([5, 6, 7, 8]), vec4.create([1, 1, 1, 1]));
                expect([...out]).toEqual([4, 5, 6, 7]);
            });
            test('mul (componentwise)', () => {
                const out = vec4.create();
                vec4.mul(out, vec4.create([1, 2, 3, 4]), vec4.create([2, 2, 2, 2]));
                expect([...out]).toEqual([2, 4, 6, 8]);
            });
            test('scale', () => {
                const out = vec4.create();
                vec4.scale(out, vec4.create([1, 2, 3, 4]), 2);
                expect([...out]).toEqual([2, 4, 6, 8]);
            });
            test('dot', () => {
                expect(vec4.dot(vec4.create([1, 2, 3, 4]), vec4.create([1, 1, 1, 1]))).toBe(10);
            });
            test('length', () => {
                expect(near(vec4.length(vec4.create([2, 0, 0, 0])), 2)).toBe(true);
            });
            test('lengthSq', () => {
                expect(vec4.lengthSq(vec4.create([1, 1, 1, 1]))).toBe(4);
            });
            test('normalize produces a unit vector, and falls back safely for the zero vector', () => {
                const out = vec4.create();
                vec4.normalize(out, vec4.create([2, 0, 0, 0]));
                expect(near(vec4.length(out), 1)).toBe(true);
                const zeroOut = vec4.create();
                vec4.normalize(zeroOut, vec4.create([0, 0, 0, 0]));
                expect([...zeroOut]).toEqual([0, 0, 0, 0]);
            });
            test('distance', () => {
                expect(near(vec4.distance(vec4.create([0, 0, 0, 0]), vec4.create([2, 0, 0, 0])), 2)).toBe(true);
            });
            test('lerp midpoint', () => {
                const out = vec4.create();
                vec4.lerp(out, vec4.create([0, 0, 0, 0]), vec4.create([4, 8, 2, 6]), 0.5);
                expect([...out]).toEqual([2, 4, 1, 3]);
            });
            test('equals: true within epsilon, false beyond it', () => {
                expect(vec4.equals(vec4.create([1, 2, 3, 4]), vec4.create([1, 2, 3, 4]))).toBe(true);
                expect(vec4.equals(vec4.create([1, 2, 3, 4]), vec4.create([1, 2, 3, 4.5]))).toBe(false);
            });
        });
    });
});
