// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `svg3d.project` — the per-frame projection pass of
 * `graphic.svg3d`: 3-axis rotate → perspective divide → backface cull → normal
 * shading → painter sort. **DOM-free, Canvas-free, capture-free**, Worker-safe.
 *
 * ## Pipeline (salvaged, parity-locked)
 *
 * Every stage is transcribed from the salvage reference
 * `packages/front/@anim-old/SVG-3D/js/aJS3D/aJS-3D-v.0.1.js` (`render()`) and
 * parity-tested against a reference-shaped transcription in `project.test.js`:
 *
 *  1. **rotate** every vertex about the camera by the composed `ry`→`rx`→`rz`
 *     matrix from `svg3d.vec3`;
 *  2. **perspective divide** — `scale = camera.depth / rotatedZ`, then
 *     `x' = scale·rx + offsetX`, `y' = scale·ry + offsetY`; the per-vertex
 *     `scale` doubles as the painter key;
 *  3. **backface cull** — `dp = n · (camera − centroid)`, keep only `dp > 0`;
 *  4. **shade** — `shade = 1 − dp/|c|/|n|` (the reference's exact association),
 *     quantised into `SHADE_LEVELS` buckets so a colour is a LUT index, never a
 *     string built per frame;
 *  5. **painter sort** — visible faces ordered by **ascending** mean projected
 *     `posZ` (far first). The sort is a stable in-place bottom-up merge over a
 *     preallocated scratch buffer, so painter order for equal depths is the
 *     ascending face index — matching the reference's stable `Array#sort`.
 *
 * ## Near-distance DROP of whole triangles — there is no near-plane clipping
 *
 * A triangle with **any** vertex at or behind the camera plane, or nearer to it
 * than `camera.near` (default 1 world unit), is discarded whole; it is **not**
 * split against the near plane. The near distance keeps a vertex exactly on the
 * plane (depth `+0`, scale `+Infinity`) out of the path data.
 * Near-plane clipping is an **explicit non-goal**. Practical consequence: a
 * triangle straddling the camera plane **disappears** rather than being clipped,
 * which reads as a hole in the terrain. **Guidance: keep the camera far enough
 * back that it does not happen** — the default camera (`y = −900`,
 * `depth = 900`, `rx = 0.55`) is framed so that the recommended mesh sizes
 * (≤ 8 192 triangles, a 64×64 quad grid) stay entirely in front of it.
 *
 * ## Zero per-frame allocation
 *
 * {@link projectFrame} allocates nothing: all vertex, depth, shade, order and
 * matrix storage lives in reusable typed-array {@link FrameBuffers} created once
 * per mesh. Honest note (measured cost decomposition): this discipline measured
 * **within noise** against a reference-shaped projector at ≥ 2 048 triangles —
 * the JIT hoists the loop-invariant trig and the generational GC absorbs the
 * per-face object churn. It is retained on the **Worker-portability and
 * allocation-discipline** argument, **not** on a measured speed claim.
 *
 * The kernel is never the frame-budget constraint: 73 728 triangles project,
 * cull, shade and painter-sort in 5.48 ms against a 16.67 ms budget. The binding
 * constraint is the DOM write leg, owned by the composed `graphic.svg3d` module.
 *
 * @module svg3d.project
 */

import { svg3dVec3Module } from './vec3.js';

/**
 * `svg3d.project` — pure projector descriptor. DI-injected `svg3d.vec3`, no DOM,
 * no Canvas. Non-`graphic.*` name on purpose: it is a sibling kernel pulled by
 * `registerDeep`, **not** a member of the public `graphicModules` registry.
 *
 * Resolved value: `{ SHADE_LEVELS, createCamera, createFrameBuffers,
 * projectFrame }`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof svg3dVec3Module], factory: (vec3: object) => object }}
 */
export const svg3dProjectModule = {
    name: 'svg3d.project',
    type: 'lib.graphic.svg3d',
    version: '0.1.0',
    dependencies: ['svg3d.vec3'],
    deps: [svg3dVec3Module],

    factory(vec3) {
        /**
         * Shade quantisation levels. Must match `svg3d.mesh`'s `SHADE_LEVELS`
         * (the LUT's second dimension); a mesh built by `svg3d.mesh` carries
         * `shadeLevels` and that value wins, this is the fallback.
         */
        const SHADE_LEVELS = 33;

        /**
         * @typedef {Object} Camera
         * @property {number} x @property {number} y @property {number} z World position.
         * @property {number} rx Pitch, radians. @property {number} ry Yaw. @property {number} rz Roll.
         * @property {number} depth Focal depth — the perspective-divide numerator.
         * @property {number} offsetX @property {number} offsetY Screen centre, px.
         */

        /**
         * @typedef {Object} FrameBuffers
         * @property {Float64Array} px `vertexCount` projected screen X.
         * @property {Float64Array} py `vertexCount` projected screen Y.
         * @property {Float64Array} pz `vertexCount` projected scale (the painter key).
         * @property {Float64Array} depth `triangleCount` per-face mean projected scale.
         * @property {Uint8Array} shadeQ `triangleCount` quantised shade, `0..levels-1`.
         * @property {Uint32Array} order Face indices; only `[0, count)` is meaningful.
         * @property {Uint32Array} scratch Merge-sort scratch, `triangleCount`.
         * @property {Float64Array} m Reusable row-major 3×3 rotation matrix.
         */

        /**
         * Build a camera framing a mesh of the given viewport.
         *
         * Defaults reproduce the spike's measured camera: `rx = 0.55`, `y = −900`
         * (negative-up world), `depth = 900` — far enough back that no supported
         * mesh size straddles the camera plane (see the near-distance note above).
         *
         * `near` (default 1 world unit) is the near distance: a vertex nearer than
         * it to the camera plane drops its triangles.
         *
         * @param {{ width?: number, height?: number, depth?: number, near?: number, x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number }} [opts]
         * @returns {Camera}
         */
        function createCamera(opts) {
            const o = opts || {};
            const width = o.width === undefined ? 1280 : o.width;
            const height = o.height === undefined ? 800 : o.height;
            return {
                x: o.x === undefined ? 0 : o.x,
                y: o.y === undefined ? -900 : o.y,
                z: o.z === undefined ? 0 : o.z,
                rx: o.rx === undefined ? 0.55 : o.rx,
                ry: o.ry === undefined ? 0 : o.ry,
                rz: o.rz === undefined ? 0 : o.rz,
                depth: o.depth === undefined ? 900 : o.depth,
                near: o.near === undefined ? 1 : o.near,
                offsetX: width / 2,
                offsetY: height / 2,
            };
        }

        /**
         * Allocate the reusable per-frame buffers for a mesh. Call ONCE per mesh;
         * {@link projectFrame} never allocates.
         *
         * @param {object} mesh A mesh from `svg3d.mesh`.
         * @returns {FrameBuffers}
         */
        function createFrameBuffers(mesh) {
            return {
                px: new Float64Array(mesh.vertexCount),
                py: new Float64Array(mesh.vertexCount),
                pz: new Float64Array(mesh.vertexCount),
                depth: new Float64Array(mesh.triangleCount),
                shadeQ: new Uint8Array(mesh.triangleCount),
                order: new Uint32Array(mesh.triangleCount),
                scratch: new Uint32Array(mesh.triangleCount),
                m: new Float64Array(9),
            };
        }

        /**
         * Per-mesh buffer cache backing the two-argument `projectFrame(mesh,
         * camera)` call form: buffers are created on the first frame and reused
         * for every later frame, so that form is allocation-free too. Callers
         * needing explicit control pass their own buffers as the third argument.
         */
        const frameBufferCache = new WeakMap();

        /**
         * Buffers for `mesh`, created on first use.
         *
         * @param {object} mesh
         * @returns {FrameBuffers}
         */
        function bufferFor(mesh) {
            let b = frameBufferCache.get(mesh);
            if (b === undefined) {
                b = createFrameBuffers(mesh);
                frameBufferCache.set(mesh, b);
            }
            return b;
        }

        /**
         * Project one frame: rotate + perspective divide, backface cull, normal
         * shading, painter sort. **Allocates nothing.**
         *
         * On return, `buf.order[0..count)` lists the visible faces far-to-near;
         * for a face `f`, `buf.depth[f]` is its painter key, `buf.shadeQ[f]` its
         * quantised shade, and `buf.px[v]` / `buf.py[v]` the screen coordinates of
         * its vertices `v = mesh.indices[f*3 + k]`.
         *
         * Faces with any vertex at or behind the camera plane are **dropped
         * whole** — see the near-distance note in the module header.
         *
         * @param {object} mesh A mesh from `svg3d.mesh`.
         * @param {Camera} camera
         * @param {FrameBuffers} [buf] Reusable buffers; the per-mesh cache is used
         *   when omitted.
         * @returns {number} Number of visible faces.
         */
        function projectFrame(mesh, camera, buf) {
            const b = buf || bufferFor(mesh);
            const m = vec3.rotationMatrix3(camera.rx, camera.ry, camera.rz, b.m);
            const m0 = m[0]; const m1 = m[1]; const m2 = m[2];
            const m3 = m[3]; const m4 = m[4]; const m5 = m[5];
            const m6 = m[6]; const m7 = m[7]; const m8 = m[8];

            const pos = mesh.positions;
            const px = b.px; const py = b.py; const pz = b.pz;
            const camX = camera.x; const camY = camera.y; const camZ = camera.z;
            const fd = camera.depth; const ox = camera.offsetX; const oy = camera.offsetY;
            // Near distance: a vertex nearer than this to the camera plane drops
            // its triangles, like one behind it. Without it a vertex exactly on the
            // plane (depth +0) scales to +Infinity and passes the guard below.
            const near = camera.near === undefined ? 1 : Math.max(camera.near, 1e-9);

            for (let v = 0, nv = mesh.vertexCount; v < nv; v += 1) {
                const dx = pos[v * 3] - camX;
                const dy = pos[v * 3 + 1] - camY;
                const dz = pos[v * 3 + 2] - camZ;

                const rxv = m0 * dx + m1 * dy + m2 * dz;
                const ryv = m3 * dx + m4 * dy + m5 * dz;
                const rzv = m6 * dx + m7 * dy + m8 * dz;

                const scale = fd / rzv;
                px[v] = scale * rxv + ox;
                py[v] = scale * ryv + oy;
                pz[v] = rzv < near ? 0 : scale;
            }

            const idx = mesh.indices;
            const nrm = mesh.normals;
            const nlen = mesh.normalLen;
            const cen = mesh.centroids;
            const depth = b.depth; const shadeQ = b.shadeQ; const order = b.order;
            const levels = mesh.shadeLevels > 0 ? mesh.shadeLevels : SHADE_LEVELS;
            const shadeMax = levels - 1;

            let count = 0;
            for (let f = 0, tc = mesh.triangleCount; f < tc; f += 1) {
                const a = idx[f * 3]; const bb = idx[f * 3 + 1]; const c = idx[f * 3 + 2];
                const za = pz[a]; const zb = pz[bb]; const zc = pz[c];
                // Reference guard: all three vertices strictly in front of the
                // camera. A failing triangle is DROPPED, never clipped.
                if (za <= 0 || zb <= 0 || zc <= 0) continue;

                const vx = camX - cen[f * 3];
                const vy = camY - cen[f * 3 + 1];
                const vz = camZ - cen[f * 3 + 2];

                const nx = nrm[f * 3]; const ny = nrm[f * 3 + 1]; const nz = nrm[f * 3 + 2];
                const dp = nx * vx + ny * vy + nz * vz;
                if (dp <= 0) continue; // backface

                const lenCam = Math.sqrt(vx * vx + vy * vy + vz * vz);
                // Association kept EXACTLY as the reference (`1 - dp/len1/len2`)
                // so the quantised shade is bit-for-bit parity-locked.
                let sq = Math.round((1 - dp / lenCam / nlen[f]) * shadeMax);
                if (sq < 0) sq = 0;
                if (sq > shadeMax) sq = shadeMax;
                shadeQ[f] = sq;

                depth[f] = (za + zb + zc) / 3;
                order[count] = f;
                count += 1;
            }

            sortByDepth(order, b.scratch, depth, count);
            return count;
        }

        /**
         * Stable bottom-up merge sort of `order[0..count)` by ascending
         * `depth[face]`, using a preallocated `scratch` buffer — no allocation, no
         * comparator closure, no `subarray` view.
         *
         * Stability matters for salvage parity: the reference collected faces in
         * ascending index order and sorted them with a stable `Array#sort`, so
         * equal depths keep ascending face order here too.
         *
         * @param {Uint32Array} order Face indices, sorted in place.
         * @param {Uint32Array} scratch Same length as `order`.
         * @param {Float64Array} depth Painter key per face index.
         * @param {number} count Meaningful prefix length.
         * @returns {void}
         */
        function sortByDepth(order, scratch, depth, count) {
            let src = order;
            let dst = scratch;
            for (let width = 1; width < count; width *= 2) {
                for (let lo = 0; lo < count; lo += width * 2) {
                    let mid = lo + width; if (mid > count) mid = count;
                    let hi = lo + width * 2; if (hi > count) hi = count;
                    let i = lo; let j = mid; let k = lo;
                    while (i < mid && j < hi) {
                        if (depth[src[j]] < depth[src[i]]) { dst[k] = src[j]; j += 1; } else { dst[k] = src[i]; i += 1; }
                        k += 1;
                    }
                    while (i < mid) { dst[k] = src[i]; i += 1; k += 1; }
                    while (j < hi) { dst[k] = src[j]; j += 1; k += 1; }
                }
                const tmp = src; src = dst; dst = tmp;
            }
            if (src !== order) {
                for (let k = 0; k < count; k += 1) order[k] = src[k];
            }
        }

        return { SHADE_LEVELS, createCamera, createFrameBuffers, projectFrame };
    },
};
