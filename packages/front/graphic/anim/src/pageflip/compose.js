// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `pageflip.compose` — the **module-local** polygon serializer for
 * `graphic.pageflip` (a measured decision). The fold solver produces a small
 * closed polygon as an array of `{x,y}` vertices; `compose(vertices)` serializes
 * it to a closed `M · L… · Z` path `d` string, rounding to 1e-3 for parity with
 * the frozen `graphic.interpolate` serializer output shape.
 *
 * Q4 (frozen): `graphic.pageflip` owns this small serializer rather than exposing
 * or reusing the frozen interpolator's internal `formatPath` — that operates on
 * canonical `{cmd, coords}` cubic segments after `parsePath`, machinery the fold
 * polygon never needs. The frozen core stays internal and untouched.
 *
 * Pure, **Worker-safe** (DOM-free), capture-free (all state in-factory).
 *
 * @module pageflip.compose
 */

/**
 * `pageflip.compose` module descriptor. No dependencies, no DOM. Injected into
 * `graphic.pageflip` via DI (keeping the pageflip factory capture-free); it is
 * NOT a member of the public `graphicModules` registry.
 *
 * Resolved value: `{ compose }`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [], factory: () => { compose: (vertices: Array<{x:number,y:number}>) => string } }}
 */
export const composeModule = {
    name: 'pageflip.compose',
    type: 'lib.graphic.pageflip',
    version: '0.1.0',
    dependencies: [],
    deps: [],

    factory() {
        /** Round to 1e-3 (parity with the frozen interpolate serializer rounding). */
        const round = (n) => Math.round(n * 1e3) / 1e3;

        /**
         * Serialize a bare `{x,y}` vertex array into a closed polygon `d` string:
         * `M v0 · L v1 · … · L vn · Z`. This is the fold solver's output shape.
         * An empty (or non-array) input yields `''`.
         *
         * @param {Array<{x:number,y:number}>} vertices
         * @returns {string} The path `d` string.
         */
        function compose(vertices) {
            if (!Array.isArray(vertices) || vertices.length === 0) return '';
            const parts = new Array(vertices.length);
            for (let i = 0; i < vertices.length; i += 1) {
                const p = vertices[i];
                parts[i] = `${i === 0 ? 'M' : 'L'} ${round(p.x)} ${round(p.y)}`;
            }
            parts.push('Z');
            return parts.join(' ');
        }

        return { compose };
    },
};
