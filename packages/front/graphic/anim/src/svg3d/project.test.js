// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit tests for the pure `svg3d.project` kernel — descriptor
 * shape, DOM-free / Canvas-free source scan, **salvage parity** against a
 * reference-shaped projector transcribed from
 * `packages/front/@anim-old/SVG-3D/js/aJS3D/aJS-3D-v.0.1.js` (`render()`),
 * backface-cull band + painter order at the spike's default camera, the
 * `pz <= 0` DROP contract, zero per-frame allocation, and capture-freedom.
 *
 * The salvage parity block is guarded by an `existsSync` check on the reference
 * and **skips LOUDLY** (a `console.warn` plus a reported skip) if `@anim-old` is
 * absent from the tree — it must never be silently green.
 */

import { describe, test, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svg3dVec3Module } from './vec3.js';
import { svg3dMeshModule } from './mesh.js';
import { svg3dProjectModule } from './project.js';

const vec3 = svg3dVec3Module.factory();
const meshApi = svg3dMeshModule.factory(vec3);
const projectApi = svg3dProjectModule.factory(vec3);
const { createCamera, createFrameBuffers, projectFrame, SHADE_LEVELS } = projectApi;

/* ── salvage presence (ls-equivalent guard) ─────────────────────────────────── */

const SALVAGE_URL = new URL(
    '../../../../@anim-old/SVG-3D/js/aJS3D/aJS-3D-v.0.1.js',
    import.meta.url,
);
const SALVAGE_PATH = fileURLToPath(SALVAGE_URL);
const SALVAGE_PRESENT = existsSync(SALVAGE_PATH);

if (!SALVAGE_PRESENT) {
    // LOUD skip — the parity assertion is the whole point of this file; a silent
    // green here would mean the salvaged kernel is unverified.
    console.warn(
        `\n[svg3d.project] SALVAGE PARITY SKIPPED — reference not found at\n  ${SALVAGE_PATH}\n`
        + '  The ry→rx→rz order, perspective divide, dp>0 cull, shade formula and\n'
        + '  painter order are NOT verified against the legacy implementation in\n'
        + '  this run. Restore packages/front/@anim-old to re-enable.\n',
    );
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

/**
 * Re-evaluate a descriptor's factory in a BARE realm — any module-scope capture
 * throws `ReferenceError`.
 *
 * @param {{ factory: Function }} mod
 * @returns {Function}
 */
function bareRealmFactory(mod) {
    const src = mod.factory.toString().replace(/^factory\s*\(/, 'function (');
    return new Function(`"use strict"; return (${src});`)();
}

/**
 * Deterministic 32-bit LCG — `Math.random` is banned (non-reproducible).
 *
 * @param {number} seed
 * @returns {() => number} Successive values in `[0, 1)`.
 */
function lcg(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/**
 * Deterministic synthetic terrain in `[0, 1]`, `side × side` samples — enough
 * relief that the backface cull actually removes faces as the camera orbits.
 *
 * @param {number} side
 * @param {number} [seed]
 * @returns {Float64Array}
 */
function terrain(side, seed) {
    const h = new Float64Array(side * side);
    const rnd = lcg(seed === undefined ? 0x5eed : seed);
    for (let j = 0; j < side; j += 1) {
        for (let i = 0; i < side; i += 1) {
            const u = i / (side - 1);
            const v = j / (side - 1);
            const ridge = Math.sin(u * Math.PI * 3) * Math.cos(v * Math.PI * 2);
            const basin = Math.exp(-(((u - 0.5) ** 2 + (v - 0.5) ** 2) * 6));
            let value = 0.45 + 0.28 * ridge + 0.25 * basin + rnd() * 0.12;
            if (value < 0) value = 0;
            if (value > 1) value = 1;
            h[j * side + i] = value;
        }
    }
    return h;
}

/**
 * Build a test mesh of `cells` quads per side over the synthetic terrain.
 *
 * @param {number} cells
 * @returns {object}
 */
function testMesh(cells) {
    return meshApi.buildGridMesh({ cells, heights: terrain(cells + 1) });
}

/**
 * The salvage reference's projector, transcribed in SHAPE from
 * `aJS-3D-v.0.1.js` `render()` (lines 112–181): `{x,y,z}` vertex objects,
 * `{p1,p2,p3}` triangle object references, six trig calls per vertex, per-face
 * cross product and both vector lengths recomputed, one `{...}` draw record per
 * visible face, `Array#sort` on `posZ`. Only the DOM emission is dropped.
 *
 * @param {{ vertices: object[], triangles: object[] }} world
 * @param {object} camera
 * @returns {object[]} `toDraw`, in the reference's painter order.
 */
function referenceRender(world, camera) {
    const toDraw = [];
    for (let i = 0; i < world.vertices.length; i += 1) {
        const vertex = world.vertices[i];

        const dx = vertex.x - camera.x;
        const dy = vertex.y - camera.y;
        const dz = vertex.z - camera.z;

        const d1x = Math.cos(camera.ry) * dx + Math.sin(camera.ry) * dz;
        const d1y = dy;
        const d1z = Math.cos(camera.ry) * dz - Math.sin(camera.ry) * dx;

        const d2x = d1x;
        const d2y = Math.cos(camera.rx) * d1y - Math.sin(camera.rx) * d1z;
        const d2z = Math.cos(camera.rx) * d1z + Math.sin(camera.rx) * d1y;

        const d3x = Math.cos(camera.rz) * d2x + Math.sin(camera.rz) * d2y;
        const d3y = Math.cos(camera.rz) * d2y - Math.sin(camera.rz) * d2x;
        const d3z = d2z;

        const scale = camera.depth / d3z;
        vertex.posX = scale * d3x + camera.offsetX;
        vertex.posY = scale * d3y + camera.offsetY;
        vertex.posZ = scale;
    }

    for (let i = 0; i < world.triangles.length; i += 1) {
        const triangle = world.triangles[i];
        if (triangle.p1.posZ > 0 && triangle.p2.posZ > 0 && triangle.p3.posZ > 0) {
            const vector1 = {
                dx: triangle.p1.x - triangle.p2.x,
                dy: triangle.p1.y - triangle.p2.y,
                dz: triangle.p1.z - triangle.p2.z,
            };
            const vector2 = {
                dx: triangle.p3.x - triangle.p2.x,
                dy: triangle.p3.y - triangle.p2.y,
                dz: triangle.p3.z - triangle.p2.z,
            };
            const crossProduct = {
                dx: vector1.dy * vector2.dz - vector1.dz * vector2.dy,
                dy: vector1.dz * vector2.dx - vector1.dx * vector2.dz,
                dz: vector1.dx * vector2.dy - vector1.dy * vector2.dx,
            };
            const cameraVector = {
                dx: camera.x - (triangle.p1.x + triangle.p2.x + triangle.p3.x) / 3,
                dy: camera.y - (triangle.p1.y + triangle.p2.y + triangle.p3.y) / 3,
                dz: camera.z - (triangle.p1.z + triangle.p2.z + triangle.p3.z) / 3,
            };
            const dp = crossProduct.dx * cameraVector.dx
                + crossProduct.dy * cameraVector.dy
                + crossProduct.dz * cameraVector.dz;
            const length1 = Math.sqrt(
                cameraVector.dx * cameraVector.dx
                + cameraVector.dy * cameraVector.dy
                + cameraVector.dz * cameraVector.dz,
            );
            const length2 = Math.sqrt(
                crossProduct.dx * crossProduct.dx
                + crossProduct.dy * crossProduct.dy
                + crossProduct.dz * crossProduct.dz,
            );
            if (dp > 0) {
                toDraw.push({
                    face: i,
                    posX1: triangle.p1.posX, posY1: triangle.p1.posY,
                    posX2: triangle.p2.posX, posY2: triangle.p2.posY,
                    posX3: triangle.p3.posX, posY3: triangle.p3.posY,
                    posZ: (triangle.p1.posZ + triangle.p2.posZ + triangle.p3.posZ) / 3,
                    shade: 1 - dp / length1 / length2,
                });
            }
        }
    }

    toDraw.sort((a, b) => a.posZ - b.posZ);
    return toDraw;
}

/**
 * Materialise a flat-typed-array mesh into the reference's object world.
 *
 * @param {object} m
 * @returns {{ vertices: object[], triangles: object[] }}
 */
function toReferenceWorld(m) {
    const vertices = [];
    for (let v = 0; v < m.vertexCount; v += 1) {
        vertices.push({ x: m.positions[v * 3], y: m.positions[v * 3 + 1], z: m.positions[v * 3 + 2] });
    }
    const triangles = [];
    for (let f = 0; f < m.triangleCount; f += 1) {
        triangles.push({
            p1: vertices[m.indices[f * 3]],
            p2: vertices[m.indices[f * 3 + 1]],
            p3: vertices[m.indices[f * 3 + 2]],
        });
    }
    return { vertices, triangles };
}

/**
 * Quantise the reference's continuous shade exactly as the kernel does.
 *
 * @param {number} shade
 * @returns {number}
 */
function quantiseShade(shade) {
    const max = SHADE_LEVELS - 1;
    let q = Math.round(shade * max);
    if (q < 0) q = 0;
    if (q > max) q = max;
    return q;
}

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('svg3dProjectModule descriptor', () => {
    test('is a Worker-safe sibling kernel with a non-graphic.* name and vec3 DI', () => {
        expect(svg3dProjectModule.name).toBe('svg3d.project');
        expect(svg3dProjectModule.name.startsWith('graphic.')).toBe(false);
        expect(svg3dProjectModule.type).toBe('lib.graphic.svg3d');
        expect(svg3dProjectModule.version).toBe('0.1.0');
        expect(svg3dProjectModule.dependencies).toEqual(['svg3d.vec3']);
        expect(svg3dProjectModule.deps).toEqual([svg3dVec3Module]);
    });

    test('factory returns the prescribed kernel surface', () => {
        const api = svg3dProjectModule.factory(vec3);
        expect(typeof api.createCamera).toBe('function');
        expect(typeof api.createFrameBuffers).toBe('function');
        expect(typeof api.projectFrame).toBe('function');
        expect(api.SHADE_LEVELS).toBe(33);
    });

    test('SHADE_LEVELS agrees with svg3d.mesh (same LUT dimension)', () => {
        expect(SHADE_LEVELS).toBe(meshApi.SHADE_LEVELS);
        expect(testMesh(2).shadeLevels).toBe(SHADE_LEVELS);
    });

    test('the default camera is the spike-measured one (rx = 0.55, y = −900, depth = 900)', () => {
        const cam = createCamera({});
        expect(cam.rx).toBeCloseTo(0.55, 12);
        expect(cam.y).toBe(-900);
        expect(cam.depth).toBe(900);
        expect(cam.offsetX).toBe(640);
        expect(cam.offsetY).toBe(400);
    });
});

// ── DOM-free / Canvas-free source scan ───────────────────────────────────────

describe('svg3d.project is DOM-free and Canvas-free by source scan', () => {
    test('project.js references no DOM/host global once comments are stripped', async () => {
        const src = await Bun.file(new URL('./project.js', import.meta.url)).text();
        const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        expect(/\bdocument\b/.test(body)).toBe(false);
        expect(/\bwindow\b/.test(body)).toBe(false);
        expect(/\brequestAnimationFrame\b/.test(body)).toBe(false);
        expect(/\bglobalThis\b/.test(body)).toBe(false);
        expect(/\bgetContext\b/.test(body)).toBe(false);
        expect(/\bCanvas\b/.test(body)).toBe(false);
    });
});

// ── Salvage parity (the spike's proven method) ───────────────────────────────

describe('salvage parity vs @anim-old/SVG-3D aJS-3D-v.0.1.js', () => {
    test('the salvage reference is present in the tree (ls-equivalent guard)', () => {
        if (!SALVAGE_PRESENT) {
            console.warn(`[svg3d.project] salvage reference ABSENT: ${SALVAGE_PATH}`);
        }
        // Informational: records in the run whether parity actually ran.
        expect(typeof SALVAGE_PRESENT).toBe('boolean');
    });

    test.skipIf(!SALVAGE_PRESENT)(
        'identical visible set, painter order, quantised shade and coordinates (≥6 decimals)',
        () => {
            const m = testMesh(12);
            const cam = createCamera({});
            cam.ry = 0.83; cam.rx = 0.41; cam.rz = 0.12;

            const buf = createFrameBuffers(m);
            const count = projectFrame(m, cam, buf);
            const ref = referenceRender(toReferenceWorld(m), cam);

            // Identical visible SET size.
            expect(count).toBe(ref.length);
            expect(count).toBeGreaterThan(0);

            // Identical painter ORDER (face index sequence).
            expect([...buf.order.subarray(0, count)]).toEqual(ref.map((r) => r.face));

            // Identical quantised shade + painter key per visible face.
            for (let k = 0; k < count; k += 1) {
                const f = buf.order[k];
                expect(buf.shadeQ[f]).toBe(quantiseShade(ref[k].shade));
                expect(buf.depth[f]).toBeCloseTo(ref[k].posZ, 6);
            }

            // Projected COORDINATES equal to ≥ 6 decimals, per visible triangle.
            for (let k = 0; k < count; k += 1) {
                const f = buf.order[k];
                const a = m.indices[f * 3]; const b = m.indices[f * 3 + 1]; const c = m.indices[f * 3 + 2];
                expect(buf.px[a]).toBeCloseTo(ref[k].posX1, 6);
                expect(buf.py[a]).toBeCloseTo(ref[k].posY1, 6);
                expect(buf.px[b]).toBeCloseTo(ref[k].posX2, 6);
                expect(buf.py[b]).toBeCloseTo(ref[k].posY2, 6);
                expect(buf.px[c]).toBeCloseTo(ref[k].posX3, 6);
                expect(buf.py[c]).toBeCloseTo(ref[k].posY3, 6);
            }
        },
    );

    test.skipIf(!SALVAGE_PRESENT)('parity holds across an orbit of the default camera', () => {
        const m = testMesh(8);
        const cam = createCamera({});
        const buf = createFrameBuffers(m);
        for (let i = 0; i < 8; i += 1) {
            cam.ry = (i / 8) * Math.PI * 2;
            const count = projectFrame(m, cam, buf);
            const ref = referenceRender(toReferenceWorld(m), cam);
            expect(count).toBe(ref.length);
            expect([...buf.order.subarray(0, count)]).toEqual(ref.map((r) => r.face));
            for (let k = 0; k < count; k += 1) {
                expect(buf.shadeQ[buf.order[k]]).toBe(quantiseShade(ref[k].shade));
            }
        }
    });

    test.skipIf(!SALVAGE_PRESENT)('the reference file still contains the salvaged kernel', async () => {
        const src = await Bun.file(SALVAGE_URL).text();
        // The four salvaged invariants, still literally present in the reference.
        expect(src).toContain('camera.depth / d3z');
        expect(src).toContain('if(dp > 0)');
        expect(src).toContain('1-dp/length1/length2');
        expect(src).toContain('return a.posZ - b.posZ');
    });
});

// ── Cull + painter order at the spike's default camera ───────────────────────

describe('backface cull and painter order at the default camera (rx = 0.55, orbiting ry)', () => {
    test('visible-face counts stay in the measured 80–100 % band', () => {
        for (const cells of [16, 32]) {
            const m = testMesh(cells);
            const cam = createCamera({});
            const buf = createFrameBuffers(m);
            for (let i = 0; i < 8; i += 1) {
                cam.ry = (i / 8) * Math.PI * 2;
                const count = projectFrame(m, cam, buf);
                const ratio = count / m.triangleCount;
                expect(ratio).toBeGreaterThanOrEqual(0.8);
                expect(ratio).toBeLessThanOrEqual(1);
            }
        }
    });

    test('the cull actually removes faces (count varies over an orbit)', () => {
        const m = testMesh(32);
        const cam = createCamera({});
        const buf = createFrameBuffers(m);
        const counts = new Set();
        for (let i = 0; i < 8; i += 1) {
            cam.ry = (i / 8) * Math.PI * 2;
            counts.add(projectFrame(m, cam, buf));
        }
        expect(counts.size).toBeGreaterThan(1);
        for (const c of counts) expect(c).toBeLessThan(m.triangleCount);
    });

    test('painter order is ascending posZ (far first), and stable on ties', () => {
        const m = testMesh(12);
        const cam = createCamera({});
        const buf = createFrameBuffers(m);
        const count = projectFrame(m, cam, buf);
        expect(count).toBeGreaterThan(0);
        for (let k = 1; k < count; k += 1) {
            const prev = buf.depth[buf.order[k - 1]];
            const cur = buf.depth[buf.order[k]];
            expect(cur).toBeGreaterThanOrEqual(prev);
            // Stable: equal depths keep ascending face index.
            if (cur === prev) expect(buf.order[k]).toBeGreaterThan(buf.order[k - 1]);
        }
    });

    test('the visible order is a permutation of distinct face indices', () => {
        const m = testMesh(16);
        const cam = createCamera({});
        const buf = createFrameBuffers(m);
        const count = projectFrame(m, cam, buf);
        const seen = new Set([...buf.order.subarray(0, count)]);
        expect(seen.size).toBe(count);
        for (const f of seen) expect(f).toBeLessThan(m.triangleCount);
    });

    test('shade is quantised into [0, SHADE_LEVELS)', () => {
        const m = testMesh(16);
        const cam = createCamera({});
        const buf = createFrameBuffers(m);
        const count = projectFrame(m, cam, buf);
        for (let k = 0; k < count; k += 1) {
            const s = buf.shadeQ[buf.order[k]];
            expect(s).toBeGreaterThanOrEqual(0);
            expect(s).toBeLessThan(SHADE_LEVELS);
        }
    });
});

// ── pz <= 0 drops whole triangles (no near-plane clipping) ───────────────────

describe('pz <= 0 DROPS whole triangles — no near-plane clipping', () => {
    test('a camera inside the terrain drops faces rather than clipping them', () => {
        const m = testMesh(8);
        const far = createCamera({});
        const buf = createFrameBuffers(m);
        const farCount = projectFrame(m, far, buf);

        // Push the camera into the mesh so part of it falls at/behind the plane.
        const near = createCamera({ y: -10 });
        near.rx = 0;
        const nearCount = projectFrame(m, near, buf);

        expect(nearCount).toBeLessThan(farCount);
        // Whatever survives is a whole triangle: its three vertices all project
        // in front of the camera (no split vertex was introduced).
        for (let k = 0; k < nearCount; k += 1) {
            const f = buf.order[k];
            for (let e = 0; e < 3; e += 1) {
                expect(buf.pz[m.indices[f * 3 + e]]).toBeGreaterThan(0);
            }
        }
    });

    test('the vertex count is never changed by a drop (no clipping geometry)', () => {
        const m = testMesh(6);
        const cam = createCamera({ y: -5 });
        cam.rx = 0;
        const buf = createFrameBuffers(m);
        const count = projectFrame(m, cam, buf);
        expect(buf.px.length).toBe(m.vertexCount);
        expect(count).toBeLessThanOrEqual(m.triangleCount);
    });
});

// ── Zero per-frame allocation ────────────────────────────────────────────────

describe('projectFrame allocates nothing per frame', () => {
    test('the per-frame code path contains no allocation or array-copy token', () => {
        const src = svg3dProjectModule.factory.toString();
        const start = src.indexOf('function projectFrame');
        expect(start).toBeGreaterThan(0);
        const region = src.slice(start)
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, '');
        for (const token of [
            'new Float64Array', 'new Uint32Array', 'new Uint8Array', 'new Array',
            'new Map', 'new Set', 'new WeakMap',
            '.push(', '.slice(', '.subarray(', '.map(', '.filter(', '.concat(',
        ]) {
            expect(region.includes(token)).toBe(false);
        }
    });

    test('buffers are reused across frames (same object identity)', () => {
        const m = testMesh(8);
        const cam = createCamera({});
        const buf = createFrameBuffers(m);
        const refs = [buf.px, buf.py, buf.pz, buf.depth, buf.shadeQ, buf.order, buf.scratch, buf.m];
        for (let i = 0; i < 5; i += 1) {
            cam.ry = i * 0.3;
            projectFrame(m, cam, buf);
        }
        expect([buf.px, buf.py, buf.pz, buf.depth, buf.shadeQ, buf.order, buf.scratch, buf.m])
            .toEqual(refs);
    });

    test('the two-argument form reuses one cached buffer set per mesh', () => {
        const m = testMesh(6);
        const cam = createCamera({});
        const a = projectFrame(m, cam);
        const b = projectFrame(m, cam);
        expect(a).toBe(b);
        // ...and agrees with the explicit-buffer form.
        const buf = createFrameBuffers(m);
        expect(projectFrame(m, cam, buf)).toBe(a);
    });

    test('createFrameBuffers sizes every buffer from the mesh', () => {
        const m = testMesh(4);
        const buf = createFrameBuffers(m);
        expect(buf.px.length).toBe(m.vertexCount);
        expect(buf.py.length).toBe(m.vertexCount);
        expect(buf.pz.length).toBe(m.vertexCount);
        expect(buf.depth.length).toBe(m.triangleCount);
        expect(buf.shadeQ.length).toBe(m.triangleCount);
        expect(buf.order.length).toBe(m.triangleCount);
        expect(buf.scratch.length).toBe(m.triangleCount);
        expect(buf.m.length).toBe(9);
    });
});

// ── Determinism ──────────────────────────────────────────────────────────────

describe('projectFrame is deterministic', () => {
    test('the same mesh + camera give the same frame twice', () => {
        const m = testMesh(10);
        const cam = createCamera({});
        cam.ry = 1.7;
        const b1 = createFrameBuffers(m);
        const b2 = createFrameBuffers(m);
        const n1 = projectFrame(m, cam, b1);
        const n2 = projectFrame(m, cam, b2);
        expect(n1).toBe(n2);
        expect([...b1.order.subarray(0, n1)]).toEqual([...b2.order.subarray(0, n2)]);
        expect([...b1.px]).toEqual([...b2.px]);
        expect([...b1.shadeQ]).toEqual([...b2.shadeQ]);
    });
});

// ── Capture-freedom ──────────────────────────────────────────────────────────

describe('svg3d.project is capture-free', () => {
    test('the factory resolves in a bare realm with DI-injected vec3', () => {
        const api = bareRealmFactory(svg3dProjectModule)(vec3);
        const m = testMesh(6);
        const buf = api.createFrameBuffers(m);
        const count = api.projectFrame(m, api.createCamera({}), buf);
        expect(count).toBeGreaterThan(0);
        expect(api.SHADE_LEVELS).toBe(33);
    });

    test('two factory instances share no buffer cache', () => {
        const a = svg3dProjectModule.factory(vec3);
        const b = svg3dProjectModule.factory(vec3);
        expect(a.projectFrame).not.toBe(b.projectFrame);
        const m = testMesh(4);
        const cam = a.createCamera({});
        expect(a.projectFrame(m, cam)).toBe(b.projectFrame(m, cam));
    });
});

// ── Near distance (a vertex on or just in front of the camera plane) ─────────
// A camera standing among the vertices (the legacy SVG-3D framing) can put a
// vertex exactly on the camera plane: its depth is +0, its scale +Infinity, and
// a guard on the scale's sign keeps it, so the path data carries Infinity (the
// legacy page's `L-Infinity` defect). Vertices nearer than `camera.near` (default
// 1 world unit) drop their triangles, like vertices behind the camera.

describe('projectFrame: near distance', () => {
    function frameAt(camera) {
        const mesh = meshApi.buildGridMesh({ cells: 8, spacing: 40 });
        const buf = createFrameBuffers(mesh);
        const count = projectFrame(mesh, camera, buf);
        return { mesh, buf, count };
    }

    test('vertices exactly on the camera plane yield no non-finite screen coordinate', () => {
        // cells 8, spacing 40: the row j = 4 sits at z = 0, on the plane of a
        // camera at z = 0 looking level along +z from above the terrain.
        const { mesh, buf, count } = frameAt(createCamera({ x: 0, y: -100, z: 0, rx: 0, ry: 0, depth: 350 }));
        expect(count).toBeGreaterThan(0);
        for (let k = 0; k < count; k += 1) {
            const f = buf.order[k];
            for (let e = 0; e < 3; e += 1) {
                const v = mesh.indices[f * 3 + e];
                expect(Number.isFinite(buf.px[v])).toBe(true);
                expect(Number.isFinite(buf.py[v])).toBe(true);
            }
        }
    });

    test('a vertex nearer than camera.near drops its triangles', () => {
        // Camera 0.5 behind the plane of the row j = 4, looking +z: that row is
        // 0.5 in front — nearer than the default near distance of 1.
        const row4 = (v) => v >= 4 * 9 && v < 5 * 9;
        const uses = ({ mesh, buf, count }) => {
            let n = 0;
            for (let k = 0; k < count; k += 1) {
                const f = buf.order[k];
                if ([0, 1, 2].some((e) => row4(mesh.indices[f * 3 + e]))) n += 1;
            }
            return n;
        };
        expect(uses(frameAt(createCamera({ x: 0, y: -100, z: -0.5, rx: 0, ry: 0, depth: 350 })))).toBe(0);
        // With near: 0.1 the same row is far enough in front to be kept.
        expect(uses(frameAt(createCamera({ x: 0, y: -100, z: -0.5, rx: 0, ry: 0, depth: 350, near: 0.1 })))).toBeGreaterThan(0);
    });
});
