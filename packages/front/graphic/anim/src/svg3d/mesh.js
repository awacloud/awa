// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `svg3d.mesh` — heightmap decode + grid-mesh builder with
 * build-time precompute, the pure geometry source of `graphic.svg3d`.
 * **DOM-free, Canvas-free, capture-free**, Worker-safe.
 *
 * ## Canvas-free contract (frozen)
 *
 * This module **never** touches a Canvas. It accepts an **already-decoded**
 * heightmap in either of two shapes:
 *
 *  - `{ side, heights: Float64Array|number[] }` — a plain sample grid;
 *  - `{ data: Uint8ClampedArray, width, height }` — an `ImageData`-**shaped**
 *    view whose **red channel** is read by a pure strided decode.
 *
 * A caller that starts from a `.png` performs the four-line
 * `drawImage` + `getImageData` round-trip **in application code** and hands over
 * the bytes. The spike measured that decode is a **one-time init cost, not a
 * per-frame cost** (worst case 0.376 ms = 2.3 % of ONE frame, paid once), so a
 * hard Canvas dependency buys nothing while costing Worker portability — and its
 * expensive half is unmeasurable under happy-dom (`getContext('2d')` is `null`).
 *
 * ## Build-time precompute
 *
 * For a rigid mesh under a moving camera, face normals, their lengths and
 * centroids are **static in world space**, so they are computed ONCE here rather
 * than every frame. Likewise the `BASE_LEVELS × SHADE_LEVELS` (16 × 33) colour
 * **LUT**: no colour string is ever built per frame (the salvage reference built
 * one `shadeColor()` hex string per triangle per frame).
 *
 * Salvage reference (authorized, never ported):
 * `packages/front/@anim-old/SVG-3D/js/aJS3D/aJS-3D-v.0.1.js` (`init()`). Its
 * structure is deliberately not reproduced: it stored vertices as `{x,y,z}`
 * objects and triangles as `{p1,p2,p3}` object references; this builder uses
 * flat typed arrays (`Float64Array` positions + `Uint32Array` indices).
 *
 * Grid convention: `cells` = quads per side ⇒ `(cells+1)²` vertices and
 * `2·cells²` triangles. 16 / 32 / 64 cells give exactly 512 / 2 048 / 8 192
 * triangles; **8 192 is the recommended working ceiling** measured by the spike
 * (3.34 ms/frame against a 16.67 ms budget with the bucketed path-`d` DOM
 * strategy).
 *
 * @module svg3d.mesh
 */

import { svg3dVec3Module } from './vec3.js';

/**
 * `svg3d.mesh` — pure mesh kernel descriptor. DI-injected `svg3d.vec3`, no DOM,
 * no Canvas. Non-`graphic.*` name on purpose: it is a sibling kernel pulled by
 * `registerDeep`, **not** a member of the public `graphicModules` registry.
 *
 * Resolved value: `{ BASE_LEVELS, SHADE_LEVELS, decodeHeightmap, buildColorLut,
 * buildGridMesh }`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof svg3dVec3Module], factory: (vec3: object) => object }}
 */
export const svg3dMeshModule = {
    name: 'svg3d.mesh',
    type: 'lib.graphic.svg3d',
    version: '0.1.0',
    dependencies: ['svg3d.vec3'],
    deps: [svg3dVec3Module],

    factory(vec3) {
        /** Number of quantised base-colour buckets in the shade LUT. */
        const BASE_LEVELS = 16;
        /** Number of quantised shade levels in the shade LUT. */
        const SHADE_LEVELS = 33;

        /** Default world spacing between adjacent grid samples. */
        const DEFAULT_SPACING = 40;
        /** Default world height of a normalised sample value of `1`. */
        const DEFAULT_HEIGHT_SCALE = 220;

        /* ───────────────────────────── heightmap ───────────────────────────── */

        /**
         * @typedef {Object} HeightmapSamples
         * @property {number} side Samples per side.
         * @property {Float64Array} heights `side²` normalised samples in `[0, 1]`,
         *   row-major (`j*side + i`).
         */

        /**
         * Decode a heightmap from either accepted shape into `{ side, heights }`.
         *
         * Accepted shapes (see the Canvas-free contract above):
         *  1. `{ side: number, heights: Float64Array|number[] }` — copied into a
         *     fresh `Float64Array`; values are used as-is (expected in `[0, 1]`).
         *  2. `{ data: Uint8ClampedArray|Uint8Array, width: number, height: number }`
         *     — an `ImageData`-shaped view. The **red** channel of every pixel is
         *     read with stride 4 and normalised by `/255`. `width` must equal
         *     `height` (the mesh grid is square).
         *
         * Pure and DOM-free: no `ImageData` instance, no Canvas, no DOM global is
         * required — only the duck-typed shape.
         *
         * @param {object} source One of the two accepted shapes.
         * @returns {HeightmapSamples} Freshly allocated samples.
         * @throws {TypeError} On an unrecognised shape or a non-square image.
         * @throws {RangeError} On a payload too short for the declared size.
         */
        function decodeHeightmap(source) {
            if (source === null || typeof source !== 'object') {
                throw new TypeError(
                    'svg3d.mesh: heightmap must be { side, heights } or { data, width, height }',
                );
            }

            if (source.data !== undefined && source.data !== null) {
                const width = source.width;
                const height = source.height;
                if (!Number.isInteger(width) || !Number.isInteger(height)
                    || width < 1 || height < 1) {
                    throw new TypeError('svg3d.mesh: image heightmap needs integer width/height ≥ 1');
                }
                if (width !== height) {
                    throw new TypeError(
                        `svg3d.mesh: image heightmap must be square (got ${width}×${height})`,
                    );
                }
                const n = width * height;
                if (source.data.length < n * 4) {
                    throw new RangeError(
                        `svg3d.mesh: image heightmap needs ${n * 4} bytes, got ${source.data.length}`,
                    );
                }
                const heights = new Float64Array(n);
                for (let p = 0; p < n; p += 1) heights[p] = source.data[p * 4] / 255;
                return { side: width, heights };
            }

            if (source.heights !== undefined && source.heights !== null) {
                const side = source.side;
                if (!Number.isInteger(side) || side < 1) {
                    throw new TypeError('svg3d.mesh: sample heightmap needs an integer side ≥ 1');
                }
                const src = source.heights;
                if (src.length !== side * side) {
                    throw new RangeError(
                        `svg3d.mesh: sample heightmap needs ${side * side} values, got ${src.length}`,
                    );
                }
                const heights = new Float64Array(side * side);
                for (let p = 0; p < heights.length; p += 1) heights[p] = src[p];
                return { side, heights };
            }

            throw new TypeError(
                'svg3d.mesh: heightmap must be { side, heights } or { data, width, height }',
            );
        }

        /* ────────────────────────────── colour LUT ─────────────────────────── */

        /**
         * Two-digit hex clamp helper for the LUT.
         *
         * @param {number} c
         * @returns {string}
         */
        function hex2(c) {
            let v = Math.round(c);
            if (v < 0) v = 0;
            if (v > 255) v = 255;
            const s = v.toString(16);
            return s.length === 1 ? `0${s}` : s;
        }

        /**
         * Build the `BASE_LEVELS × SHADE_LEVELS` hex-colour lookup table ONCE,
         * replacing the reference's per-triangle-per-frame `shadeColor()` string
         * construction. Index with `lut[baseQ * SHADE_LEVELS + shadeQ]`.
         *
         * The ramp reproduces the salvage reference's terrain colouring
         * (`red = 258 − avgY >> 1`, `green = 256 + avgY >> 1`, `blue = 51`)
         * quantised into `BASE_LEVELS` buckets, darkened per shade level by the
         * reference's `shadeColor(colour, −(shade·50))` amount.
         *
         * @returns {string[]} `BASE_LEVELS * SHADE_LEVELS` `#rrggbb` strings.
         */
        function buildColorLut() {
            const lut = new Array(BASE_LEVELS * SHADE_LEVELS);
            for (let b = 0; b < BASE_LEVELS; b += 1) {
                const h = b / (BASE_LEVELS - 1);
                const r0 = 129 - h * 127;
                const g0 = 128 + h * 127;
                const b0 = 51;
                for (let s = 0; s < SHADE_LEVELS; s += 1) {
                    const amt = Math.round(2.55 * -((s / (SHADE_LEVELS - 1)) * 50));
                    lut[b * SHADE_LEVELS + s] = `#${hex2(r0 + amt)}${hex2(g0 + amt)}${hex2(b0 + amt)}`;
                }
            }
            return lut;
        }

        /**
         * The water shade row: the legacy water colour `#0000DD` darkened per
         * shade level by the same `shadeColor(colour, −(shade·50))` amount as the
         * land LUT. Index with `waterLut[shadeQ]`.
         *
         * @returns {string[]} `SHADE_LEVELS` `#rrggbb` strings.
         */
        function buildWaterLut() {
            const lut = new Array(SHADE_LEVELS);
            for (let s = 0; s < SHADE_LEVELS; s += 1) {
                const amt = Math.round(2.55 * -((s / (SHADE_LEVELS - 1)) * 50));
                lut[s] = `#${hex2(amt)}${hex2(amt)}${hex2(0xdd + amt)}`;
            }
            return lut;
        }

        /* ───────────────────────────── grid mesh ───────────────────────────── */

        /**
         * @typedef {Object} Mesh
         * @property {number} cells Quads per side.
         * @property {number} side Vertices per side (`cells + 1`).
         * @property {number} vertexCount `side²`.
         * @property {number} triangleCount `2·cells²`.
         * @property {number} spacing World spacing between adjacent samples.
         * @property {number} heightScale World height of a sample value of `1`.
         * @property {Float64Array} positions `3·vertexCount` world XYZ. **`y` is
         *   negative-up** (salvage convention): higher terrain is more negative `y`.
         * @property {Uint32Array} indices `3·triangleCount` vertex indices.
         * @property {Float64Array} normals `3·triangleCount` **static** world-space
         *   face normals (`(p1−p2) × (p3−p2)`, unnormalised).
         * @property {Float64Array} normalLen `triangleCount` precomputed `|n|`.
         * @property {Float64Array} centroids `3·triangleCount` static world-space centroids.
         * @property {Uint8Array} baseQ `triangleCount` quantised base-colour bucket.
         * @property {Uint8Array} water `triangleCount` flags: 1 when the face's three
         *   vertex heights are 0 (the legacy `avgY == 0` water rule).
         * @property {string[]} waterLut `shadeLevels` water colours (`#0000dd` shaded).
         * @property {number} baseLevels `BASE_LEVELS`.
         * @property {number} shadeLevels `SHADE_LEVELS`.
         * @property {string[]} colorLut `baseLevels × shadeLevels` `#rrggbb` strings.
         */

        /**
         * Normalise the `heights` option into a `Float64Array` of `side²` samples.
         *
         * Accepts a raw `Float64Array|number[]`, either heightmap shape accepted by
         * {@link decodeHeightmap}, or `undefined` (⇒ a flat plane of zeros).
         *
         * @param {Float64Array|number[]|object|undefined} heights
         * @param {number} side
         * @returns {Float64Array}
         * @throws {RangeError} When a value array does not hold `side²` values,
         *   or a decoded heightmap's side differs from `side`; plus what
         *   {@link decodeHeightmap} throws for a malformed heightmap.
         */
        function normaliseHeights(heights, side) {
            const n = side * side;
            if (heights === undefined || heights === null) return new Float64Array(n);

            if (typeof heights.length === 'number') {
                if (heights.length !== n) {
                    throw new RangeError(
                        `svg3d.mesh: heights needs ${n} values for cells=${side - 1}, got ${heights.length}`,
                    );
                }
                const out = new Float64Array(n);
                for (let p = 0; p < n; p += 1) out[p] = heights[p];
                return out;
            }

            const decoded = decodeHeightmap(heights);
            if (decoded.side !== side) {
                throw new RangeError(
                    `svg3d.mesh: heightmap side ${decoded.side} does not match cells=${side - 1} (needs ${side})`,
                );
            }
            return decoded.heights;
        }

        /**
         * Build a heightmap grid mesh with static per-face normals, normal
         * lengths, centroids and quantised base-colour buckets precomputed, plus
         * the shade colour LUT.
         *
         * Winding is chosen so a face normal points `−y` (up), i.e. a camera above
         * the terrain sees the terrain and not its back.
         *
         * @param {{ cells: number, heights?: (Float64Array|number[]|object), spacing?: number, heightScale?: number }} opts
         * @returns {Mesh}
         * @throws {TypeError} When `cells` is not an integer ≥ 1.
         * @throws {RangeError} When `heights` does not match the grid size.
         */
        function buildGridMesh(opts) {
            const o = opts || {};
            const cells = o.cells;
            if (!Number.isInteger(cells) || cells < 1) {
                throw new TypeError('svg3d.mesh: cells must be an integer ≥ 1');
            }
            const side = cells + 1;
            const spacing = o.spacing === undefined ? DEFAULT_SPACING : o.spacing;
            const heightScale = o.heightScale === undefined ? DEFAULT_HEIGHT_SCALE : o.heightScale;
            const heights = normaliseHeights(o.heights, side);

            const vertexCount = side * side;
            const triangleCount = 2 * cells * cells;

            const positions = new Float64Array(vertexCount * 3);
            const half = (cells * spacing) / 2;
            for (let j = 0; j < side; j += 1) {
                for (let i = 0; i < side; i += 1) {
                    const v = j * side + i;
                    positions[v * 3] = i * spacing - half;
                    positions[v * 3 + 1] = -heights[v] * heightScale;
                    positions[v * 3 + 2] = j * spacing - half;
                }
            }

            const indices = new Uint32Array(triangleCount * 3);
            let t = 0;
            for (let j = 0; j < cells; j += 1) {
                for (let i = 0; i < cells; i += 1) {
                    const v00 = j * side + i;
                    const v10 = v00 + 1;
                    const v01 = v00 + side;
                    const v11 = v01 + 1;
                    indices[t * 3] = v00; indices[t * 3 + 1] = v11; indices[t * 3 + 2] = v10; t += 1;
                    indices[t * 3] = v00; indices[t * 3 + 1] = v01; indices[t * 3 + 2] = v11; t += 1;
                }
            }

            const normals = new Float64Array(triangleCount * 3);
            const normalLen = new Float64Array(triangleCount);
            const centroids = new Float64Array(triangleCount * 3);
            const baseQ = new Uint8Array(triangleCount);
            const water = new Uint8Array(triangleCount);
            const n = new Float64Array(3);

            for (let f = 0; f < triangleCount; f += 1) {
                const i1 = indices[f * 3] * 3;
                const i2 = indices[f * 3 + 1] * 3;
                const i3 = indices[f * 3 + 2] * 3;

                const p1x = positions[i1]; const p1y = positions[i1 + 1]; const p1z = positions[i1 + 2];
                const p2x = positions[i2]; const p2y = positions[i2 + 1]; const p2z = positions[i2 + 2];
                const p3x = positions[i3]; const p3y = positions[i3 + 1]; const p3z = positions[i3 + 2];

                // Salvage kernel: v1 = p1 − p2, v2 = p3 − p2, n = v1 × v2.
                vec3.cross3(
                    p1x - p2x, p1y - p2y, p1z - p2z,
                    p3x - p2x, p3y - p2y, p3z - p2z,
                    n,
                );
                normals[f * 3] = n[0]; normals[f * 3 + 1] = n[1]; normals[f * 3 + 2] = n[2];
                normalLen[f] = vec3.length3(n[0], n[1], n[2]);

                const cx = (p1x + p2x + p3x) / 3;
                const cy = (p1y + p2y + p3y) / 3;
                const cz = (p1z + p2z + p3z) / 3;
                centroids[f * 3] = cx; centroids[f * 3 + 1] = cy; centroids[f * 3 + 2] = cz;

                // Height-ramp base colour, quantised into BASE_LEVELS buckets.
                const hNorm = heightScale > 0 ? Math.min(1, Math.max(0, -cy / heightScale)) : 0;
                let q = Math.round(hNorm * (BASE_LEVELS - 1));
                if (q < 0) q = 0;
                if (q > BASE_LEVELS - 1) q = BASE_LEVELS - 1;
                baseQ[f] = q;

                // Legacy water: a face whose three samples are exactly 0.
                water[f] = (heights[indices[f * 3]] === 0 && heights[indices[f * 3 + 1]] === 0
                    && heights[indices[f * 3 + 2]] === 0) ? 1 : 0;
            }

            return {
                cells,
                side,
                vertexCount,
                triangleCount,
                spacing,
                heightScale,
                positions,
                indices,
                normals,
                normalLen,
                centroids,
                baseQ,
                water,
                baseLevels: BASE_LEVELS,
                shadeLevels: SHADE_LEVELS,
                colorLut: buildColorLut(),
                waterLut: buildWaterLut(),
            };
        }

        return {
            BASE_LEVELS,
            SHADE_LEVELS,
            decodeHeightmap,
            buildColorLut,
            buildGridMesh,
        };
    },
};
