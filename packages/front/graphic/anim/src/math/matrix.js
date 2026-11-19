// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.matrix` — 2D affine Matrix + decomposition fw module descriptor.
 *
 * **Worker-safe**: this module MUST NOT reference `window`, `document`, or any
 * DOM global. It exports only a pure value class and pure functions — proven
 * DOM-free by the source-scan leg of `matrix.test.js`.
 *
 * The `Matrix` is the SVG/CSS 6-tuple `{a,b,c,d,e,f}` representing the affine
 * map `[a c e; b d f; 0 0 1]`. `decompose()` splits it into independently
 * lerpable channels (translate / rotate / scale / skew) so a `transform`
 * interpolation can blend each channel and recompose; `lerpDecomposition`
 * performs that channel-wise blend.
 *
 * The engine's first draft captured shear as a single `skew` angle. This
 * module upgrades that to a full **QR / Gram–Schmidt skewX/skewY split** (the
 * standard CSS matrix-decomposition algorithm), so `fromDecomposition(
 * decompose(M))` round-trips any affine `M` to within 1e-6. The shear of a
 * pure 2D affine map is carried on a single axis under this convention: `skewX`
 * holds the shear angle and `skewY` is `0` (kept in the typedef for symmetry
 * and forward compatibility, and blended by `lerpDecomposition`).
 *
 * @module graphic.matrix
 */

import { lerpModule } from './scalar.js';

/**
 * `graphic.matrix` module descriptor.
 *
 * Resolved value: `{ Matrix, lerpDecomposition }`
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof lerpModule], factory(lerp: (a: number, b: number, t: number) => number): { Matrix: typeof Matrix, lerpDecomposition: Function } }}
 */
export const matrixModule = {
    name: 'graphic.matrix',
    type: 'lib.graphic.math',
    version: '0.1.0',
    dependencies: ['graphic.lerp'],
    deps: [lerpModule],

    /**
     * Returns `{ Matrix, lerpDecomposition }`.
     *
     * @param {(a: number, b: number, t: number) => number} lerp Injected scalar lerp function.
     * @returns {{ Matrix: typeof Matrix, lerpDecomposition: (from: AffineDecomposition, to: AffineDecomposition, t: number) => AffineDecomposition }}
     */
    factory(lerp) {
        const DEG_PER_RAD = 180 / Math.PI;
        const RAD_PER_DEG = Math.PI / 180;

        /**
         * Affine decomposition produced by {@link Matrix#decompose}: the seven channels
         * an affine `transform` interpolation blends independently, then recomposes via
         * {@link Matrix.fromDecomposition}.
         *
         * Upgraded from the first draft's single-`skew` form to a QR **skewX/skewY** split. For a
         * pure 2D affine matrix the shear lands on `skewX` (degrees) and `skewY` is `0`;
         * `skewY` is retained so the channel set stays symmetric and lerp-stable.
         *
         * @typedef {Object} AffineDecomposition
         * @property {number} translateX Horizontal translation (the `e` term).
         * @property {number} translateY Vertical translation (the `f` term).
         * @property {number} rotate     Rotation in degrees.
         * @property {number} scaleX     Horizontal scale (negative when the matrix flips X).
         * @property {number} scaleY     Vertical scale.
         * @property {number} skewX      Shear angle around X in degrees (carries the affine shear).
         * @property {number} skewY      Shear angle around Y in degrees (0 for a pure affine map).
         */

        /**
         * 2D affine matrix `[a c e; b d f; 0 0 1]` stored as the 6-tuple
         * `{a,b,c,d,e,f}` (the SVG/CSS `matrix(...)` convention). A pure value object —
         * no DOM, no mutation of inputs; every operation returns a fresh `Matrix`.
         */
        class Matrix {
            /**
             * @param {number} [a=1] Scale/rotate term (col 1, row 1).
             * @param {number} [b=0] Skew/rotate term (col 1, row 2).
             * @param {number} [c=0] Skew/rotate term (col 2, row 1).
             * @param {number} [d=1] Scale/rotate term (col 2, row 2).
             * @param {number} [e=0] Horizontal translation.
             * @param {number} [f=0] Vertical translation.
             */
            constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
                this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
            }

            /**
             * The identity matrix.
             * @returns {Matrix}
             */
            static identity() { return new Matrix(); }

            /**
             * Compose an affine matrix from a (partial) decomposition — the exact
             * inverse of {@link Matrix#decompose}, so the pair round-trips any affine
             * map to within 1e-6. The linear part reconstructs the QR factorization
             * `R · K · S` (rotation · shear · scale): column 1 is the rotated, scaled X
             * axis; column 2 carries the shear (`tan(skewX)`) along column 1 plus the
             * scaled, rotated Y axis. Missing channels take neutral defaults
             * (translate/rotate/skew = 0, scale = 1).
             *
             * @param {Partial<AffineDecomposition>} d
             * @returns {Matrix}
             */
            static fromDecomposition(d) {
                const tx = d.translateX || 0;
                const ty = d.translateY || 0;
                const sx = (d.scaleX == null) ? 1 : d.scaleX;
                const sy = (d.scaleY == null) ? 1 : d.scaleY;
                const rot = (d.rotate || 0) * RAD_PER_DEG;
                const cos = Math.cos(rot);
                const sin = Math.sin(rot);
                const shear = Math.tan((d.skewX || 0) * RAD_PER_DEG);

                // QR reconstruction matching decompose():
                //   column 1 = scaleX · (cos, sin)
                //   column 2 = scaleY · (shear·col1n + perp)  with perp = (-sin, cos)
                return new Matrix(
                    sx * cos,
                    sx * sin,
                    sy * (shear * cos - sin),
                    sy * (shear * sin + cos),
                    tx,
                    ty,
                );
            }

            /**
             * Matrix product `this · other` (apply `other` first, then `this`).
             * @param {Matrix} o
             * @returns {Matrix}
             */
            multiply(o) {
                return new Matrix(
                    this.a * o.a + this.c * o.b,
                    this.b * o.a + this.d * o.b,
                    this.a * o.c + this.c * o.d,
                    this.b * o.c + this.d * o.d,
                    this.a * o.e + this.c * o.f + this.e,
                    this.b * o.e + this.d * o.f + this.f,
                );
            }

            /**
             * Decompose into translate / rotate / scale / skew channels for
             * channel-wise interpolation, using the standard CSS / QR (Gram–Schmidt)
             * 2D matrix-decomposition algorithm:
             *
             * 1. `scaleX = hypot(a, b)` — length of the first column.
             * 2. `shear = (a·c + b·d) / scaleX` — projection of column 2 onto the
             *    normalized column 1.
             * 3. `scaleY = hypot` of the de-sheared second column; `shear /= scaleY`.
             * 4. Negative determinant → mirror: flip the sign of `scaleX` (and the
             *    rotation reference) so the recomposition reproduces the flip.
             * 5. `rotate = atan2(b, a)`, `skewX = atan(shear)`, `skewY = 0`.
             *
             * @returns {AffineDecomposition}
             */
            decompose() {
                const { a, b, c, d, e, f } = this;

                let m11 = a, m12 = b, m21 = c, m22 = d;

                // Determinant sign → mirror handling. A negative determinant means an
                // axis is flipped; fold the flip into scaleX and negate that column so
                // the remaining QR steps see a right-handed basis.
                const det = m11 * m22 - m12 * m21;
                let signX = 1;
                if (det < 0) {
                    signX = -1;
                    m11 = -m11;
                    m12 = -m12;
                }

                // QR / Gram–Schmidt on the two column vectors (m11,m12) and (m21,m22).
                let scaleX = Math.hypot(m11, m12);
                // Normalize column 1.
                if (scaleX !== 0) { m11 /= scaleX; m12 /= scaleX; }

                // Shear = column1 · column2 (with column1 normalized).
                let shear = m11 * m21 + m12 * m22;
                // Remove the column-1 component from column 2.
                m21 -= m11 * shear;
                m22 -= m12 * shear;

                let scaleY = Math.hypot(m21, m22);
                if (scaleY !== 0) { shear /= scaleY; }

                const rotate = Math.atan2(m12, m11) * DEG_PER_RAD;
                const skewX = Math.atan(shear) * DEG_PER_RAD;

                return {
                    translateX: e,
                    translateY: f,
                    rotate,
                    scaleX: signX * scaleX,
                    scaleY,
                    skewX,
                    skewY: 0,
                };
            }

            /**
             * Serialize to the SVG/CSS `matrix(a,b,c,d,e,f)` string. Terms with
             * `|n| < 1e-10` round to `0` (kills `-0` and floating-point dust); the rest
             * round to 1e-6 precision.
             * @returns {string}
             */
            toString() {
                const r = (n) => (Math.abs(n) < 1e-10 ? 0 : Math.round(n * 1e6) / 1e6);
                return `matrix(${r(this.a)},${r(this.b)},${r(this.c)},${r(this.d)},${r(this.e)},${r(this.f)})`;
            }
        }

        /**
         * Lerp two decompositions channel-by-channel — the core of `transform`
         * interpolation. Blends all seven channels (translate X/Y, rotate, scale X/Y,
         * skew X/Y); `t` is not clamped (clamping is the Tween's job).
         *
         * @param {AffineDecomposition} from Decomposition at `t = 0`.
         * @param {AffineDecomposition} to   Decomposition at `t = 1`.
         * @param {number} t Normalized progress.
         * @returns {AffineDecomposition}
         */
        function lerpDecomposition(from, to, t) {
            return {
                translateX: lerp(from.translateX, to.translateX, t),
                translateY: lerp(from.translateY, to.translateY, t),
                rotate: lerp(from.rotate, to.rotate, t),
                scaleX: lerp(from.scaleX, to.scaleX, t),
                scaleY: lerp(from.scaleY, to.scaleY, t),
                skewX: lerp(from.skewX, to.skewX, t),
                skewY: lerp(from.skewY, to.skewY, t),
            };
        }

        return { Matrix, lerpDecomposition };
    },
};
