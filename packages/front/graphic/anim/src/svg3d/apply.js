// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `svg3d.apply` — the `svg3d` DOM application layer: the two
 * competing per-frame write strategies for a projected mesh, authored **pure
 * mechanics** (no perf/business ceiling checks — that is `graphic.svg3d`'s
 * job) and **capture-free** as an fw module descriptor. Re-authored (never
 * imported) from a measured de-risking spike's reference rigs.
 *
 * It is a sibling kernel of `graphic.svg3d` — DI-injected via `deps` (like
 * `pageflip.fold`/`pageflip.compose` are injected into `graphic.pageflip`) so
 * the composed module's own factory never captures a module-scope import (the
 * two rig builders would otherwise be free variables inside `graphic.svg3d`'s
 * `factory()`, which `fw/no-factory-capture` forbids). It carries a
 * **non-`graphic.*` name** on purpose: pulled by `registerDeep`, **not** a
 * member of the public `graphicModules` registry.
 *
 * Both rigs build a namespace-correct SVG subtree via the frozen
 * `graphic.svgBuild` (through a caller-supplied `graphic.scopedIds` scope) and
 * write EVERY attribute through the frozen `graphic.svgApply.svgAttr` — no raw
 * `setAttribute` (fw `parser` has no SVG namespace). Colours come exclusively
 * from the mesh's own build-time LUT (`mesh.colorLut` / `mesh.baseQ` /
 * `mesh.shadeLevels`, precomputed by `svg3d.mesh`) — no colour string is ever
 * built per frame. Emitted coordinates are quantised to **1 decimal**:
 * materially shorter attribute values at no
 * visible cost.
 *
 * Both rigs implement **slot mapping, never DOM reordering**:
 * a fixed number of DOM elements in fixed document
 * order, the k-th element receiving the k-th painter-ordered visible face (or
 * painter-rank slice, for the bucketed path rig); surplus slots blank
 * (`points=''` / empty `d`) when the visible count shrinks.
 *
 *  - `createPathRig` — the FROZEN DEFAULT (a measured decision): `buckets`
 *    `<path>` elements, each carrying a contiguous painter-rank slice of the
 *    visible faces serialized as one multi-subpath `d`. Exact painter order at
 *    bucket granularity; shading is the bucket mean. Cheap at any supported
 *    mesh size — measured 3.1×–5.0× fewer attribute writes and ms/frame than
 *    the per-polygon rig.
 *  - `createPolygonRig` — the OPT-IN alternative for small meshes where
 *    per-face DOM identity is genuinely needed (`mode: 'polygons'`, callers
 *    ceiling-checked by `graphic.svg3d` at ≤ 2 048 triangles): one `<polygon>`
 *    per potentially-visible face.
 *
 * Neither rig imposes a triangle-count ceiling itself — that is a business/
 * perf-budget decision owned by `graphic.svg3d` (the composed module), which
 * validates BEFORE calling either builder. This file stays purely mechanical,
 * mirroring the spike's own separation.
 *
 * **DOM-bound, NOT Worker-safe** — this module builds and mutates SVG DOM nodes.
 *
 * @module svg3d.apply
 */

/**
 * `svg3d.apply` — DOM-bound rig-builder descriptor. No dependencies of its
 * own (every collaborator it needs — `svgBuild`/`svgApply`/`mesh`/`idScope` —
 * arrives per-call through the builders' own `opts`, not via DI). Non-
 * `graphic.*` name on purpose: a sibling kernel pulled by `registerDeep`,
 * **not** a member of the public `graphicModules` registry.
 *
 * Resolved value: `{ createPolygonRig, createPathRig }`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [], factory: () => object }}
 */
export const svg3dApplyModule = {
    name: 'svg3d.apply',
    type: 'lib.graphic.svg3d',
    version: '0.1.0',
    dependencies: [],
    deps: [],

    factory() {
        /** Coordinate quantisation: 1 decimal. */
        const round1 = (v) => Math.round(v * 10) / 10;

        /**
         * @typedef {Object} Rig
         * @property {SVGElement} root The built `<svg>` root (NOT auto-attached to any document here).
         * @property {number} nodeCount Number of DOM face/bucket nodes written per full frame.
         * @property {(buf: object, count: number) => number} update
         *   Write one frame from the projector's output buffers; returns the number of
         *   attribute writes performed (perf-lock instrumentation).
         */

        /**
         * Build the per-polygon rig: one `<polygon>` per potentially-visible face,
         * bound BY REFERENCE once at construction (no per-tick DOM lookup).
         *
         * @param {{
         *   svgBuild: { build: Function }, svgApply: { svgAttr: Function },
         *   mesh: object, width?: number, height?: number,
         *   writeFill?: boolean, idScope?: { id: (rawId?: string) => string, ref?: Function },
         * }} opts
         * @returns {Rig}
         */
        function createPolygonRig(opts) {
            const { svgBuild, svgApply, mesh } = opts;
            const width = opts.width === undefined ? 1280 : opts.width;
            const height = opts.height === undefined ? 800 : opts.height;
            const writeFill = opts.writeFill !== false;
            const capacity = mesh.triangleCount;

            const children = new Array(capacity);
            for (let k = 0; k < capacity; k += 1) {
                children[k] = { tag: 'polygon', attrs: { points: '', fill: '#000000' } };
            }
            const root = svgBuild.build({
                tag: 'svg',
                attrs: { id: 'root', width, height, viewBox: `0 0 ${width} ${height}` },
                children: [{ tag: 'g', attrs: { id: 'faces' }, children }],
            }, { idScope: opts.idScope });

            // Bind by reference ONCE (standing perf rule: no per-tick DOM lookup).
            const group = root.childNodes[0];
            /** @type {SVGElement[]} */
            const els = new Array(capacity);
            for (let k = 0; k < capacity; k += 1) els[k] = group.childNodes[k];

            const { svgAttr } = svgApply;
            const idx = mesh.indices;
            const baseQ = mesh.baseQ;
            const lut = mesh.colorLut;
            const shadeLevels = mesh.shadeLevels;
            let prevCount = 0;

            /**
             * @param {object} buf
             * @param {number} count
             * @returns {number} attribute writes performed
             */
            function update(buf, count) {
                const { px, py, order, shadeQ } = buf;
                let writes = 0;
                for (let k = 0; k < count; k += 1) {
                    const f = order[k];
                    const a = idx[f * 3]; const b = idx[f * 3 + 1]; const c = idx[f * 3 + 2];
                    const points = `${round1(px[a])},${round1(py[a])} `
                        + `${round1(px[b])},${round1(py[b])} `
                        + `${round1(px[c])},${round1(py[c])}`;
                    const el = els[k];
                    svgAttr(el, 'points', points);
                    writes += 1;
                    if (writeFill) {
                        svgAttr(el, 'fill', lut[baseQ[f] * shadeLevels + shadeQ[f]]);
                        writes += 1;
                    }
                }
                // Blank surplus slots when the visible count shrinks (structural finding 1).
                for (let k = count; k < prevCount; k += 1) {
                    svgAttr(els[k], 'points', '');
                    writes += 1;
                }
                prevCount = count;
                return writes;
            }

            return { root, nodeCount: capacity, update };
        }

        /**
         * Build the bucketed-path rig (FROZEN DEFAULT, a measured decision):
         * `buckets` `<path>` elements in painter-rank order, each a multi-subpath
         * `d` covering a contiguous slice of the visible faces.
         *
         * With `faceColors`, each painter slice is split into colour classes —
         * `base` altitude classes plus water, times `shade` shade classes — one
         * `<path>` per class with a FIXED fill (the class-centre LUT colour),
         * stroked with that fill (width 1) so the seams close, as the legacy
         * renderer stroked every face. Every face goes to its slice's class path,
         * so each face keeps its own altitude and shading (the default fills a
         * slice with its mean colour). A path whose `d` did not change is not
         * written. Painter order stays exact between slices.
         *
         * @param {{
         *   svgBuild: { build: Function }, svgApply: { svgAttr: Function },
         *   mesh: object, buckets?: number, width?: number, height?: number,
         *   idScope?: { id: (rawId?: string) => string, ref?: Function },
         *   faceColors?: boolean|{ base?: number, shade?: number },
         * }} opts
         * @returns {Rig}
         */
        function createPathRig(opts) {
            if (opts.faceColors) return createClassedPathRig(opts);
            const { svgBuild, svgApply, mesh } = opts;
            const buckets = opts.buckets === undefined ? 16 : opts.buckets;
            const width = opts.width === undefined ? 1280 : opts.width;
            const height = opts.height === undefined ? 800 : opts.height;

            const children = new Array(buckets);
            for (let k = 0; k < buckets; k += 1) {
                children[k] = { tag: 'path', attrs: { d: '', fill: '#000000' } };
            }
            const root = svgBuild.build({
                tag: 'svg',
                attrs: { id: 'root', width, height, viewBox: `0 0 ${width} ${height}` },
                children: [{ tag: 'g', attrs: { id: 'faces' }, children }],
            }, { idScope: opts.idScope });

            const group = root.childNodes[0];
            /** @type {SVGElement[]} */
            const paths = new Array(buckets);
            for (let k = 0; k < buckets; k += 1) paths[k] = group.childNodes[k];

            const { svgAttr } = svgApply;
            const idx = mesh.indices;
            const baseQ = mesh.baseQ;
            const lut = mesh.colorLut;
            const shadeLevels = mesh.shadeLevels;

            /**
             * @param {object} buf
             * @param {number} count
             * @returns {number} attribute writes performed
             */
            function update(buf, count) {
                const { px, py, order, shadeQ } = buf;
                const per = Math.ceil(count / buckets) || 1;
                let writes = 0;
                for (let bkt = 0; bkt < buckets; bkt += 1) {
                    const start = bkt * per;
                    const end = Math.min(count, start + per);
                    let d = '';
                    let sumShade = 0;
                    let sumBase = 0;
                    for (let k = start; k < end; k += 1) {
                        const f = order[k];
                        const a = idx[f * 3]; const b = idx[f * 3 + 1]; const c = idx[f * 3 + 2];
                        d += `M${round1(px[a])} ${round1(py[a])}`
                            + `L${round1(px[b])} ${round1(py[b])}`
                            + `L${round1(px[c])} ${round1(py[c])}Z`;
                        sumShade += shadeQ[f];
                        sumBase += baseQ[f];
                    }
                    const n = end - start;
                    // Always written — every bucket gets a value every frame
                    // (possibly empty), so the fixed-slot rig is inherently
                    // blank-safe when the visible count shrinks; no separate
                    // surplus-blanking pass is needed (unlike the polygon rig).
                    svgAttr(paths[bkt], 'd', d);
                    writes += 1;
                    if (n > 0) {
                        const sq = Math.round(sumShade / n);
                        const bq = Math.round(sumBase / n);
                        svgAttr(paths[bkt], 'fill', lut[bq * shadeLevels + sq]);
                        writes += 1;
                    }
                }
                return writes;
            }

            return { root, nodeCount: buckets, update };
        }

        /**
         * The `faceColors` variant of {@link createPathRig}.
         *
         * @param {object} opts See {@link createPathRig}.
         * @returns {Rig}
         */
        function createClassedPathRig(opts) {
            const { svgBuild, svgApply, mesh } = opts;
            const fc = typeof opts.faceColors === 'object' ? opts.faceColors : {};
            const buckets = opts.buckets === undefined ? 16 : opts.buckets;
            const width = opts.width === undefined ? 1280 : opts.width;
            const height = opts.height === undefined ? 800 : opts.height;
            const base = fc.base > 0 ? fc.base : 6;
            const shade = fc.shade > 0 ? fc.shade : 6;
            const classes = (base + 1) * shade;
            const baseLevels = mesh.baseLevels;
            const shadeLevels = mesh.shadeLevels;
            const lut = mesh.colorLut;

            // Class colours: the LUT at each class centre; the water row last.
            const fills = new Array(classes);
            for (let b = 0; b <= base; b += 1) {
                for (let s = 0; s < shade; s += 1) {
                    const sl = Math.round(((s + 0.5) / shade) * (shadeLevels - 1));
                    fills[b * shade + s] = b === base
                        ? mesh.waterLut[sl]
                        : lut[Math.round(((b + 0.5) / base) * (baseLevels - 1)) * shadeLevels + sl];
                }
            }
            const total = buckets * classes;
            const children = new Array(total);
            for (let k = 0; k < total; k += 1) {
                const fill = fills[k % classes];
                children[k] = { tag: 'path', attrs: { d: '', fill, stroke: fill, 'stroke-width': 1, 'stroke-linejoin': 'round' } };
            }
            const root = svgBuild.build({
                tag: 'svg',
                attrs: { id: 'root', width, height, viewBox: `0 0 ${width} ${height}` },
                children: [{ tag: 'g', attrs: { id: 'faces' }, children }],
            }, { idScope: opts.idScope });

            const group = root.childNodes[0];
            /** @type {SVGElement[]} */
            const paths = new Array(total);
            for (let k = 0; k < total; k += 1) paths[k] = group.childNodes[k];
            /** @type {string[]} The `d` last written to each path. */
            const written = new Array(total).fill('');
            /** @type {string[]} Per-class `d` accumulators for one slice, reused. */
            const acc = new Array(classes).fill('');

            const { svgAttr } = svgApply;
            const idx = mesh.indices;
            const baseQ = mesh.baseQ;
            const water = mesh.water;

            /**
             * @param {object} buf
             * @param {number} count
             * @returns {number} attribute writes performed
             */
            function update(buf, count) {
                const { px, py, order, shadeQ } = buf;
                const per = Math.ceil(count / buckets) || 1;
                let writes = 0;
                for (let bkt = 0; bkt < buckets; bkt += 1) {
                    const start = bkt * per;
                    const end = Math.min(count, start + per);
                    for (let c = 0; c < classes; c += 1) acc[c] = '';
                    for (let k = start; k < end; k += 1) {
                        const f = order[k];
                        let sc = Math.floor((shadeQ[f] / shadeLevels) * shade);
                        if (sc > shade - 1) sc = shade - 1;
                        let bc = base;
                        if (!water[f]) {
                            bc = Math.floor((baseQ[f] / baseLevels) * base);
                            if (bc > base - 1) bc = base - 1;
                        }
                        const a = idx[f * 3]; const b = idx[f * 3 + 1]; const c = idx[f * 3 + 2];
                        acc[bc * shade + sc] += `M${round1(px[a])} ${round1(py[a])}`
                            + `L${round1(px[b])} ${round1(py[b])}`
                            + `L${round1(px[c])} ${round1(py[c])}Z`;
                    }
                    const off = bkt * classes;
                    for (let c = 0; c < classes; c += 1) {
                        const d = acc[c];
                        if (written[off + c] !== d) {
                            svgAttr(paths[off + c], 'd', d);
                            written[off + c] = d;
                            writes += 1;
                        }
                    }
                }
                return writes;
            }

            return { root, nodeCount: total, update };
        }

        return { createPolygonRig, createPathRig };
    },
};
