// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Spatial interpolation - linear, bilinear, bicubic, Hermite, Catmull-Rom, Bézier, barycentric.
 * Distinct from easing (time-based). No active timers.
 */

/**
 * Object returned by `interp.factory()`.
 * @typedef {object} InterpAPI
 * @property {(a: number, b: number, t: number) => number} linear
 * @property {(edge0: number, edge1: number, x: number) => number} smoothstep
 * @property {(edge0: number, edge1: number, x: number) => number} smootherstep
 * @property {(p0: number, p1: number, m0: number, m1: number, t: number) => number} cubicHermite
 * @property {(p0: number, p1: number, p2: number, p3: number, t: number, alpha?: number) => number} catmullRom
 * @property {(p0: number, p1: number, p2: number, t: number) => number} bezier2
 * @property {(p0: number, p1: number, p2: number, p3: number, t: number) => number} bezier3
 * @property {(q11: number, q21: number, q12: number, q22: number, x: number, y: number) => number} bilinear
 * @property {(s4x4: number[][], x: number, y: number) => number} bicubic
 * @property {(out: ArrayLike<number>, a: ArrayLike<number>, b: ArrayLike<number>, t: number) => ArrayLike<number>} vec
 * @property {(p: {x:number,y:number}, a: {x:number,y:number}, b: {x:number,y:number}, c: {x:number,y:number}) => {u:number, v:number, w:number}} barycentric
 * @property {(samples: ArrayLike<number>, t: number) => number} sample
 * @property {(samples: ArrayLike<number>, w: number, h: number, x: number, y: number) => number} sample2D
 */

export const interp = {
    name: 'interp',
    version: '1.0.0',
    type: 'fw.io.math',
    dependencies: [],

    /** @returns {InterpAPI} */
    factory() {
        /**
         * Scalar linear interpolation between a and b.
         * @param {number} a
         * @param {number} b
         * @param {number} t typically in [0, 1]
         * @returns {number}
         */
        function linear(a, b, t) {
            return a + t * (b - a);
        }

        /**
         * GLSL `smoothstep`: cubic Hermite interpolation between two edges.
         * @param {number} edge0
         * @param {number} edge1
         * @param {number} x
         * @returns {number} value in [0, 1]
         */
        function smoothstep(edge0, edge1, x) {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        }

        /**
         * Ken Perlin's improved smoothstep (`6t^5 - 15t^4 + 10t^3`).
         * @param {number} edge0
         * @param {number} edge1
         * @param {number} x
         * @returns {number}
         */
        function smootherstep(edge0, edge1, x) {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return t * t * t * (t * (t * 6 - 15) + 10);
        }

        /**
         * Scalar cubic Hermite interpolation between p0 and p1 with tangents m0 and m1.
         * @param {number} p0
         * @param {number} p1
         * @param {number} m0
         * @param {number} m1
         * @param {number} t in [0, 1]
         * @returns {number}
         */
        function cubicHermite(p0, p1, m0, m1, t) {
            const t2 = t * t, t3 = t2 * t;
            return (2 * t3 - 3 * t2 + 1) * p0 +
                   (t3 - 2 * t2 + t) * m0 +
                   (-2 * t3 + 3 * t2) * p1 +
                   (t3 - t2) * m1;
        }

        /**
         * **Scalar** Catmull-Rom spline (centripetal by default, Barry-Goldman
         * algorithm). The internal `dist(a, b)` is `Math.abs(b - a)` - points
         * are treated as 1D values, NOT as positions in 2D/3D space. For
         * multi-dimensional points call this once per component.
         * @param {number} p0
         * @param {number} p1
         * @param {number} p2
         * @param {number} p3
         * @param {number} t parametric position in [0, 1] across the p1→p2 segment
         * @param {number} [alpha=0.5] 0=uniform, 0.5=centripetal, 1=chordal
         * @returns {number}
         */
        function catmullRom(p0, p1, p2, p3, t, alpha = 0.5) {
            // Centripetal Catmull-Rom using Barry-Goldman algorithm (scalar).
            function dist(a, b) { return Math.abs(b - a); }
            function tj(tj0, p_j, p_j1) {
                return tj0 + Math.pow(dist(p_j, p_j1) || 1e-10, alpha);
            }
            const t0 = 0;
            const t1 = tj(t0, p0, p1);
            const t2 = tj(t1, p1, p2);
            const t3 = tj(t2, p2, p3);
            const tt = linear(t1, t2, t);
            const A1 = linear(p0, p1, (tt - t0) / (t1 - t0 || 1e-10));
            const A2 = linear(p1, p2, (tt - t1) / (t2 - t1 || 1e-10));
            const A3 = linear(p2, p3, (tt - t2) / (t3 - t2 || 1e-10));
            const B1 = linear(A1, A2, (tt - t0) / (t2 - t0 || 1e-10));
            const B2 = linear(A2, A3, (tt - t1) / (t3 - t1 || 1e-10));
            return linear(B1, B2, (tt - t1) / (t2 - t1 || 1e-10));
        }

        /**
         * Quadratic Bézier (scalar).
         * @param {number} p0
         * @param {number} p1
         * @param {number} p2
         * @param {number} t in [0, 1]
         * @returns {number}
         */
        function bezier2(p0, p1, p2, t) {
            const u = 1 - t;
            return u * u * p0 + 2 * u * t * p1 + t * t * p2;
        }

        /**
         * Cubic Bézier (scalar).
         * @param {number} p0
         * @param {number} p1
         * @param {number} p2
         * @param {number} p3
         * @param {number} t in [0, 1]
         * @returns {number}
         */
        function bezier3(p0, p1, p2, p3, t) {
            const u = 1 - t, u2 = u * u, t2 = t * t;
            return u2 * u * p0 + 3 * u2 * t * p1 + 3 * u * t2 * p2 + t2 * t * p3;
        }

        /**
         * Bilinear interpolation of a 2×2 grid.
         * @param {number} q11 corner (0,0)
         * @param {number} q21 corner (1,0)
         * @param {number} q12 corner (0,1)
         * @param {number} q22 corner (1,1)
         * @param {number} x in [0, 1]
         * @param {number} y in [0, 1]
         * @returns {number}
         */
        function bilinear(q11, q21, q12, q22, x, y) {
            return q11 * (1 - x) * (1 - y) +
                   q21 * x * (1 - y) +
                   q12 * (1 - x) * y +
                   q22 * x * y;
        }

        /**
         * Bicubic interpolation over a 4×4 sample grid using scalar
         * Catmull-Rom on rows then columns.
         * @param {number[][]} s4x4 samples (4 rows × 4 cols)
         * @param {number} x in [0, 1]
         * @param {number} y in [0, 1]
         * @returns {number}
         */
        function bicubic(s4x4, x, y) {
            const rows = [0, 1, 2, 3].map(r => {
                const row = s4x4[r];
                return catmullRom(row[0], row[1], row[2], row[3], x);
            });
            return catmullRom(rows[0], rows[1], rows[2], rows[3], y);
        }

        /**
         * Vector linear interpolation component-wise (out = a + t(b - a)).
         * @param {ArrayLike<number>} out destination, must have same length as a/b
         * @param {ArrayLike<number>} a
         * @param {ArrayLike<number>} b
         * @param {number} t
         * @returns {ArrayLike<number>} out
         */
        function vec(out, a, b, t) {
            if (out.length !== a.length || out.length !== b.length)
                throw new Error('interp: vec dimension mismatch');
            // @ts-ignore - ArrayLike index write is valid on Float32Array/number[] at runtime
            for (let i = 0; i < out.length; i++) out[i] = a[i] + t * (b[i] - a[i]);
            return out;
        }

        /**
         * Barycentric coordinates of point p inside triangle (a, b, c).
         * Throws on a degenerate (collinear or zero-area) triangle, whose
         * denominator would be 0.
         * @param {{x:number,y:number}} p
         * @param {{x:number,y:number}} a
         * @param {{x:number,y:number}} b
         * @param {{x:number,y:number}} c
         * @returns {{u:number, v:number, w:number}}
         */
        function barycentric(p, a, b, c) {
            const v0x = b.x - a.x, v0y = b.y - a.y;
            const v1x = c.x - a.x, v1y = c.y - a.y;
            const v2x = p.x - a.x, v2y = p.y - a.y;
            const d00 = v0x * v0x + v0y * v0y;
            const d01 = v0x * v1x + v0y * v1y;
            const d11 = v1x * v1x + v1y * v1y;
            const d20 = v2x * v0x + v2y * v0y;
            const d21 = v2x * v1x + v2y * v1y;
            const denom = d00 * d11 - d01 * d01;
            if (Math.abs(denom) < 1e-12) {
                throw new Error('interp.barycentric: degenerate triangle (collinear or coincident vertices)');
            }
            const v = (d11 * d20 - d01 * d21) / denom;
            const w = (d00 * d21 - d01 * d20) / denom;
            const u = 1 - v - w;
            return { u, v, w };
        }

        /**
         * Sample a 1D array of values at parametric position t ∈ [0, 1] with
         * linear interpolation. Out-of-range t is clamped.
         * @param {ArrayLike<number>} samples non-empty
         * @param {number} t in [0, 1]
         * @returns {number}
         */
        function sample(samples, t) {
            const n = samples.length;
            if (n === 1) return samples[0];
            const idx = t * (n - 1);
            const lo = Math.max(0, Math.min(n - 2, Math.floor(idx)));
            return linear(samples[lo], samples[lo + 1], idx - lo);
        }

        /**
         * Sample a 2D array (row-major, length `w * h`) at (x, y) ∈ [0,1]²
         * with bilinear interpolation. Out-of-range coordinates are clamped.
         * @param {ArrayLike<number>} samples
         * @param {number} w width (number of samples per row)
         * @param {number} h height (number of rows)
         * @param {number} x in [0, 1]
         * @param {number} y in [0, 1]
         * @returns {number}
         */
        function sample2D(samples, w, h, x, y) {
            const xi = x * (w - 1), yi = y * (h - 1);
            const x0 = Math.max(0, Math.min(w - 2, Math.floor(xi)));
            const y0 = Math.max(0, Math.min(h - 2, Math.floor(yi)));
            const tx = xi - x0, ty = yi - y0;
            const q11 = samples[y0 * w + x0], q21 = samples[y0 * w + x0 + 1];
            const q12 = samples[(y0 + 1) * w + x0], q22 = samples[(y0 + 1) * w + x0 + 1];
            return bilinear(q11, q21, q12, q22, tx, ty);
        }

        return { linear, smoothstep, smootherstep, cubicHermite, catmullRom, bezier2, bezier3, bilinear, bicubic, vec, barycentric, sample, sample2D };
    },
};
