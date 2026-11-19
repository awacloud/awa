// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `svg3d.vec3` — the pure 3D vector / 3×3 rotation kernel of
 * `graphic.svg3d`, authored **pure**, **DOM-free**, **Canvas-free** and
 * **capture-free** as an fw module descriptor.
 *
 * **Why this module exists at all**: `graphic.matrix` (`src/math/matrix.js`) is
 * **2D-affine only** (`a,b,c,d,e,f` + QR decompose) — it cannot represent a
 * 3-axis rotation or a perspective divide. A software-3D pipeline therefore
 * carries its own 3D vector kernel; that is a deliberate, measured design fact,
 * **not** an oversight.
 *
 * Salvage reference (authorized, never ported):
 * `packages/front/@anim-old/SVG-3D/js/aJS3D/aJS-3D-v.0.1.js` (`render()`). The
 * reference recomputed `Math.cos`/`Math.sin` for all three angles **inside the
 * per-vertex loop** — 6 trig calls per vertex per frame — and rotated
 * sequentially (`ry`, then `rx`, then `rz`). {@link rotationMatrix3} composes
 * that exact axis order into ONE row-major 3×3 matrix built once per frame; the
 * composition is **parity-locked** against a transcription of the reference's
 * sequential rotation in `vec3.test.js`.
 *
 * Honest note (measured cost decomposition): hoisting the trig out of the vertex
 * loop measured **within noise** at ≥ 2 048 triangles — the JIT already hoists
 * the loop-invariant `Math.cos(camera.ry)` and the generational GC absorbs the
 * churn. The composed form is retained for **allocation discipline and Worker
 * portability**, not on a measured speed claim.
 *
 * Numeric style: scalar arguments + caller-owned out-arrays, never `{x,y,z}`
 * object allocation.
 *
 * **Canvas-free / DOM-free contract**: this file references no `document`,
 * `window`, `requestAnimationFrame`, `globalThis` and no Canvas API — it is
 * Worker-safe by construction and locked by a source scan in `vec3.test.js`.
 *
 * @module svg3d.vec3
 */

/**
 * `svg3d.vec3` — pure 3D vector kernel descriptor. No dependencies, no DOM.
 *
 * It carries a **non-`graphic.*` name** on purpose: it is a pure sibling kernel
 * DI-injected into `svg3d.mesh` / `svg3d.project` (and, through them, into the
 * composed `graphic.svg3d` DOM module), pulled by `registerDeep` and **not** a
 * member of the public `graphicModules` registry.
 *
 * Resolved value: `{ dot3, cross3, length3, rotationMatrix3, applyMatrix3 }`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [], factory: () => object }}
 */
export const svg3dVec3Module = {
    name: 'svg3d.vec3',
    type: 'lib.graphic.svg3d',
    version: '0.1.0',
    dependencies: [],
    deps: [],

    factory() {
        /**
         * Dot product of two 3-vectors given as scalars.
         *
         * @param {number} ax @param {number} ay @param {number} az
         * @param {number} bx @param {number} by @param {number} bz
         * @returns {number}
         */
        function dot3(ax, ay, az, bx, by, bz) {
            return ax * bx + ay * by + az * bz;
        }

        /**
         * Cross product `a × b`, written into `out[0..2]`.
         *
         * The argument order matches the salvage kernel's face-normal
         * convention (`n = (p1 − p2) × (p3 − p2)`).
         *
         * @param {number} ax @param {number} ay @param {number} az
         * @param {number} bx @param {number} by @param {number} bz
         * @param {Float64Array|number[]} out Caller-owned 3-slot destination.
         * @returns {Float64Array|number[]} `out`.
         */
        function cross3(ax, ay, az, bx, by, bz, out) {
            out[0] = ay * bz - az * by;
            out[1] = az * bx - ax * bz;
            out[2] = ax * by - ay * bx;
            return out;
        }

        /**
         * Euclidean length of a 3-vector.
         *
         * @param {number} x @param {number} y @param {number} z
         * @returns {number}
         */
        function length3(x, y, z) {
            return Math.sqrt(x * x + y * y + z * z);
        }

        /**
         * Build the composed 3×3 rotation matrix for the salvaged axis order
         * (`ry`, then `rx`, then `rz`) as a row-major `Float64Array(9)`.
         *
         * Equivalent to `M = Rz · Rx · Ry` with each factor transcribed from the
         * reference's sequential `d1` / `d2` / `d3` assignments. Parity-locked:
         * `applyMatrix3(rotationMatrix3(rx, ry, rz), v)` reproduces the
         * reference's sequential rotation of `v` (see `vec3.test.js`).
         *
         * @param {number} rx Pitch, radians.
         * @param {number} ry Yaw, radians.
         * @param {number} rz Roll, radians.
         * @param {Float64Array} [out] Reusable 9-slot buffer; allocated when omitted.
         * @returns {Float64Array} Row-major 3×3.
         */
        function rotationMatrix3(rx, ry, rz, out) {
            const m = out || new Float64Array(9);
            const cx = Math.cos(rx); const sx = Math.sin(rx);
            const cy = Math.cos(ry); const sy = Math.sin(ry);
            const cz = Math.cos(rz); const sz = Math.sin(rz);

            m[0] = cz * cy + sz * sx * sy;
            m[1] = sz * cx;
            m[2] = cz * sy - sz * sx * cy;

            m[3] = -sz * cy + cz * sx * sy;
            m[4] = cz * cx;
            m[5] = -sz * sy - cz * sx * cy;

            m[6] = -cx * sy;
            m[7] = sx;
            m[8] = cx * cy;
            return m;
        }

        /**
         * Apply a row-major 3×3 matrix to a vector, writing into `out[0..2]`.
         *
         * @param {Float64Array|number[]} m Row-major 3×3.
         * @param {number} x @param {number} y @param {number} z
         * @param {Float64Array|number[]} out Caller-owned 3-slot destination.
         * @returns {Float64Array|number[]} `out`.
         */
        function applyMatrix3(m, x, y, z, out) {
            out[0] = m[0] * x + m[1] * y + m[2] * z;
            out[1] = m[3] * x + m[4] * y + m[5] * z;
            out[2] = m[6] * x + m[7] * y + m[8] * z;
            return out;
        }

        return { dot3, cross3, length3, rotationMatrix3, applyMatrix3 };
    },
};
