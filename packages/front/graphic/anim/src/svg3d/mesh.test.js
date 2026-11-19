// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit tests for the pure `svg3d.mesh` kernel — descriptor shape,
 * DOM-free / Canvas-free source scan, BOTH accepted heightmap shapes decoding to
 * identical meshes on a known fixture, exact grid counts, 16×33 colour-LUT
 * dimensions, spot-checked precomputed normals/lengths/centroids/colour buckets,
 * and capture-freedom (bare-realm resolve).
 */

import { describe, test, expect } from 'bun:test';
import { svg3dVec3Module } from './vec3.js';
import { svg3dMeshModule } from './mesh.js';

const vec3 = svg3dVec3Module.factory();
const mesh = svg3dMeshModule.factory(vec3);

/**
 * Re-evaluate a descriptor's factory in a BARE realm — any module-scope capture
 * throws `ReferenceError`. Runtime half of the area's capture-freedom guard.
 *
 * @param {{ factory: Function }} mod
 * @returns {Function}
 */
function bareRealmFactory(mod) {
    const src = mod.factory.toString().replace(/^factory\s*\(/, 'function (');
    return new Function(`"use strict"; return (${src});`)();
}

/**
 * A known 5×5 heightmap fixture whose values are exact multiples of `1/255`, so
 * the sample form and the RGBA form describe the SAME terrain bit-for-bit.
 *
 * @returns {{ side: number, bytes: number[], samples: number[] }}
 */
function fixture() {
    const side = 5;
    const bytes = [];
    const samples = [];
    for (let j = 0; j < side; j += 1) {
        for (let i = 0; i < side; i += 1) {
            // Deterministic, non-flat, non-symmetric byte terrain.
            const byte = (i * 37 + j * 91 + i * j * 13) % 256;
            bytes.push(byte);
            samples.push(byte / 255);
        }
    }
    return { side, bytes, samples };
}

/**
 * Expand a byte heightmap into an `ImageData`-SHAPED view (red channel carries
 * the height; G/B/A are noise on purpose so the strided read is proven).
 *
 * @param {number[]} bytes
 * @param {number} side
 * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
 */
function asImageDataShape(bytes, side) {
    const data = new Uint8ClampedArray(side * side * 4);
    for (let p = 0; p < bytes.length; p += 1) {
        data[p * 4] = bytes[p];
        data[p * 4 + 1] = (bytes[p] * 7 + 11) % 256;
        data[p * 4 + 2] = (bytes[p] * 3 + 200) % 256;
        data[p * 4 + 3] = 255;
    }
    return { data, width: side, height: side };
}

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('svg3dMeshModule descriptor', () => {
    test('is a Worker-safe sibling kernel with a non-graphic.* name and vec3 DI', () => {
        expect(svg3dMeshModule.name).toBe('svg3d.mesh');
        expect(svg3dMeshModule.name.startsWith('graphic.')).toBe(false);
        expect(svg3dMeshModule.type).toBe('lib.graphic.svg3d');
        expect(svg3dMeshModule.version).toBe('0.1.0');
        expect(svg3dMeshModule.dependencies).toEqual(['svg3d.vec3']);
        expect(svg3dMeshModule.deps).toEqual([svg3dVec3Module]);
    });

    test('factory returns the prescribed kernel surface', () => {
        const api = svg3dMeshModule.factory(vec3);
        expect(typeof api.decodeHeightmap).toBe('function');
        expect(typeof api.buildGridMesh).toBe('function');
        expect(typeof api.buildColorLut).toBe('function');
        expect(api.BASE_LEVELS).toBe(16);
        expect(api.SHADE_LEVELS).toBe(33);
    });
});

// ── DOM-free / Canvas-free source scan ───────────────────────────────────────

describe('svg3d.mesh is DOM-free and Canvas-free by source scan', () => {
    test('mesh.js references no DOM/host global once comments are stripped', async () => {
        const src = await Bun.file(new URL('./mesh.js', import.meta.url)).text();
        const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        expect(/\bdocument\b/.test(body)).toBe(false);
        expect(/\bwindow\b/.test(body)).toBe(false);
        expect(/\brequestAnimationFrame\b/.test(body)).toBe(false);
        expect(/\bglobalThis\b/.test(body)).toBe(false);
        expect(/\bgetContext\b/.test(body)).toBe(false);
        expect(/\bdrawImage\b/.test(body)).toBe(false);
        expect(/\bgetImageData\b/.test(body)).toBe(false);
        // `ImageData` is only ever a SHAPE here, never a constructed instance.
        expect(/new\s+ImageData/.test(body)).toBe(false);
    });
});

// ── Heightmap decode — BOTH accepted shapes ──────────────────────────────────

describe('decodeHeightmap accepts both prescribed shapes', () => {
    test('sample shape { side, heights } round-trips into a Float64Array', () => {
        const f = fixture();
        const out = mesh.decodeHeightmap({ side: f.side, heights: f.samples });
        expect(out.side).toBe(f.side);
        expect(out.heights).toBeInstanceOf(Float64Array);
        expect(out.heights.length).toBe(f.side * f.side);
        for (let p = 0; p < out.heights.length; p += 1) {
            expect(out.heights[p]).toBeCloseTo(f.samples[p], 15);
        }
    });

    test('ImageData-shaped view decodes the RED channel with stride 4', () => {
        const f = fixture();
        const out = mesh.decodeHeightmap(asImageDataShape(f.bytes, f.side));
        expect(out.side).toBe(f.side);
        for (let p = 0; p < out.heights.length; p += 1) {
            expect(out.heights[p]).toBe(f.bytes[p] / 255);
        }
    });

    test('a Float64Array sample payload is accepted as well as a plain array', () => {
        const f = fixture();
        const a = mesh.decodeHeightmap({ side: f.side, heights: Float64Array.from(f.samples) });
        const b = mesh.decodeHeightmap({ side: f.side, heights: f.samples });
        expect([...a.heights]).toEqual([...b.heights]);
    });

    test('both shapes yield IDENTICAL heights on the known fixture', () => {
        const f = fixture();
        const fromSamples = mesh.decodeHeightmap({ side: f.side, heights: f.samples });
        const fromBytes = mesh.decodeHeightmap(asImageDataShape(f.bytes, f.side));
        expect([...fromBytes.heights]).toEqual([...fromSamples.heights]);
    });

    test('rejects unrecognised, non-square and short payloads', () => {
        expect(() => mesh.decodeHeightmap(null)).toThrow(TypeError);
        expect(() => mesh.decodeHeightmap({})).toThrow(TypeError);
        expect(() => mesh.decodeHeightmap({
            data: new Uint8ClampedArray(4 * 6), width: 3, height: 2,
        })).toThrow(TypeError);
        expect(() => mesh.decodeHeightmap({
            data: new Uint8ClampedArray(4), width: 3, height: 3,
        })).toThrow(RangeError);
        expect(() => mesh.decodeHeightmap({ side: 3, heights: [1, 2] })).toThrow(RangeError);
        expect(() => mesh.decodeHeightmap({ side: 0, heights: [] })).toThrow(TypeError);
    });
});

// ── Both shapes build IDENTICAL meshes ───────────────────────────────────────

describe('buildGridMesh accepts both heightmap shapes and builds identical meshes', () => {
    test('sample-shape and ImageData-shape inputs produce byte-identical meshes', () => {
        const f = fixture();
        const cells = f.side - 1;
        const a = mesh.buildGridMesh({ cells, heights: { side: f.side, heights: f.samples } });
        const b = mesh.buildGridMesh({ cells, heights: asImageDataShape(f.bytes, f.side) });

        expect([...b.positions]).toEqual([...a.positions]);
        expect([...b.indices]).toEqual([...a.indices]);
        expect([...b.normals]).toEqual([...a.normals]);
        expect([...b.normalLen]).toEqual([...a.normalLen]);
        expect([...b.centroids]).toEqual([...a.centroids]);
        expect([...b.baseQ]).toEqual([...a.baseQ]);
    });

    test('a raw Float64Array of samples is accepted directly', () => {
        const f = fixture();
        const cells = f.side - 1;
        const a = mesh.buildGridMesh({ cells, heights: Float64Array.from(f.samples) });
        const b = mesh.buildGridMesh({ cells, heights: asImageDataShape(f.bytes, f.side) });
        expect([...a.positions]).toEqual([...b.positions]);
    });

    test('a heightmap whose side does not match cells is rejected', () => {
        const f = fixture();
        expect(() => mesh.buildGridMesh({
            cells: 8, heights: asImageDataShape(f.bytes, f.side),
        })).toThrow(RangeError);
        expect(() => mesh.buildGridMesh({ cells: 8, heights: [1, 2, 3] })).toThrow(RangeError);
    });

    test('an invalid cells count is rejected', () => {
        expect(() => mesh.buildGridMesh({ cells: 0 })).toThrow(TypeError);
        expect(() => mesh.buildGridMesh({ cells: 2.5 })).toThrow(TypeError);
        expect(() => mesh.buildGridMesh({})).toThrow(TypeError);
    });
});

// ── Exact grid counts (the frozen grid convention) ───────────────────────────

describe('grid convention — (cells+1)² vertices, 2·cells² triangles', () => {
    test('cells = 4 gives exactly 25 vertices and 32 triangles', () => {
        const m = mesh.buildGridMesh({ cells: 4 });
        expect(m.cells).toBe(4);
        expect(m.side).toBe(5);
        expect(m.vertexCount).toBe(25);
        expect(m.triangleCount).toBe(32);
        expect(m.positions.length).toBe(75);
        expect(m.indices.length).toBe(96);
        expect(m.normals.length).toBe(96);
        expect(m.normalLen.length).toBe(32);
        expect(m.centroids.length).toBe(96);
        expect(m.baseQ.length).toBe(32);
    });

    test('the spike sizes 16 / 32 / 64 cells give 512 / 2048 / 8192 triangles', () => {
        for (const [cells, triangles] of [[16, 512], [32, 2048], [64, 8192]]) {
            const m = mesh.buildGridMesh({ cells });
            expect(m.triangleCount).toBe(triangles);
            expect(m.vertexCount).toBe((cells + 1) ** 2);
        }
    });

    test('every index is within the vertex range', () => {
        const m = mesh.buildGridMesh({ cells: 6 });
        for (let k = 0; k < m.indices.length; k += 1) {
            expect(m.indices[k]).toBeLessThan(m.vertexCount);
        }
    });
});

// ── Colour LUT ───────────────────────────────────────────────────────────────

describe('colour LUT — 16 base × 33 shade, built once', () => {
    test('buildColorLut has BASE_LEVELS × SHADE_LEVELS entries', () => {
        const lut = mesh.buildColorLut();
        expect(lut.length).toBe(16 * 33);
        expect(lut.length).toBe(mesh.BASE_LEVELS * mesh.SHADE_LEVELS);
    });

    test('every entry is a #rrggbb string', () => {
        const lut = mesh.buildColorLut();
        for (const c of lut) expect(/^#[0-9a-f]{6}$/.test(c)).toBe(true);
    });

    test('the mesh carries its LUT and its level dimensions', () => {
        const m = mesh.buildGridMesh({ cells: 4 });
        expect(m.baseLevels).toBe(16);
        expect(m.shadeLevels).toBe(33);
        expect(m.colorLut.length).toBe(16 * 33);
    });

    test('shade 0 is the brightest and the last shade the darkest for a base', () => {
        const lut = mesh.buildColorLut();
        const sum = (hex) => parseInt(hex.slice(1, 3), 16)
            + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
        for (let b = 0; b < 16; b += 1) {
            const bright = lut[b * 33];
            const dark = lut[b * 33 + 32];
            expect(sum(dark)).toBeLessThan(sum(bright));
        }
    });

    test('indexing is lut[baseQ * SHADE_LEVELS + shadeQ] — distinct bases differ', () => {
        const lut = mesh.buildColorLut();
        expect(lut[0 * 33 + 0]).not.toBe(lut[15 * 33 + 0]);
    });
});

// ── Precompute spot-checks ───────────────────────────────────────────────────

describe('build-time precompute — normals, lengths, centroids, colour buckets', () => {
    test('a flat plane has every normal pointing −y (up) with |n| = spacing²', () => {
        const m = mesh.buildGridMesh({ cells: 3, spacing: 10 });
        for (let f = 0; f < m.triangleCount; f += 1) {
            expect(m.normals[f * 3]).toBeCloseTo(0, 9);
            expect(m.normals[f * 3 + 1]).toBeLessThan(0);
            expect(m.normals[f * 3 + 2]).toBeCloseTo(0, 9);
            expect(m.normalLen[f]).toBeCloseTo(100, 9);
        }
    });

    test('normalLen equals |normal| for every face on a rough mesh', () => {
        const f = fixture();
        const m = mesh.buildGridMesh({ cells: f.side - 1, heights: f.samples });
        for (let t = 0; t < m.triangleCount; t += 1) {
            expect(m.normalLen[t]).toBeCloseTo(
                vec3.length3(m.normals[t * 3], m.normals[t * 3 + 1], m.normals[t * 3 + 2]), 9,
            );
        }
    });

    test('normals are the salvage cross product (p1−p2) × (p3−p2)', () => {
        const f = fixture();
        const m = mesh.buildGridMesh({ cells: f.side - 1, heights: f.samples });
        const out = new Float64Array(3);
        for (let t = 0; t < m.triangleCount; t += 1) {
            const i1 = m.indices[t * 3] * 3;
            const i2 = m.indices[t * 3 + 1] * 3;
            const i3 = m.indices[t * 3 + 2] * 3;
            vec3.cross3(
                m.positions[i1] - m.positions[i2],
                m.positions[i1 + 1] - m.positions[i2 + 1],
                m.positions[i1 + 2] - m.positions[i2 + 2],
                m.positions[i3] - m.positions[i2],
                m.positions[i3 + 1] - m.positions[i2 + 1],
                m.positions[i3 + 2] - m.positions[i2 + 2],
                out,
            );
            expect(m.normals[t * 3]).toBeCloseTo(out[0], 9);
            expect(m.normals[t * 3 + 1]).toBeCloseTo(out[1], 9);
            expect(m.normals[t * 3 + 2]).toBeCloseTo(out[2], 9);
        }
    });

    test('centroids are the mean of the three vertex positions', () => {
        const f = fixture();
        const m = mesh.buildGridMesh({ cells: f.side - 1, heights: f.samples });
        for (let t = 0; t < m.triangleCount; t += 1) {
            for (let axis = 0; axis < 3; axis += 1) {
                const s = m.positions[m.indices[t * 3] * 3 + axis]
                    + m.positions[m.indices[t * 3 + 1] * 3 + axis]
                    + m.positions[m.indices[t * 3 + 2] * 3 + axis];
                expect(m.centroids[t * 3 + axis]).toBeCloseTo(s / 3, 9);
            }
        }
    });

    test('positions are negative-up and centred on the origin', () => {
        const m = mesh.buildGridMesh({ cells: 4, spacing: 10, heightScale: 100, heights: new Float64Array(25).fill(1) });
        const xs = [];
        for (let v = 0; v < m.vertexCount; v += 1) {
            xs.push(m.positions[v * 3]);
            expect(m.positions[v * 3 + 1]).toBeCloseTo(-100, 9);
        }
        expect(Math.min(...xs)).toBeCloseTo(-20, 9);
        expect(Math.max(...xs)).toBeCloseTo(20, 9);
    });

    test('baseQ is in [0, BASE_LEVELS) and tracks height (flat lo vs flat hi)', () => {
        const lo = mesh.buildGridMesh({ cells: 3, heights: new Float64Array(16).fill(0) });
        const hi = mesh.buildGridMesh({ cells: 3, heights: new Float64Array(16).fill(1) });
        for (let f = 0; f < lo.triangleCount; f += 1) {
            expect(lo.baseQ[f]).toBe(0);
            expect(hi.baseQ[f]).toBe(mesh.BASE_LEVELS - 1);
        }
        const f = fixture();
        const rough = mesh.buildGridMesh({ cells: f.side - 1, heights: f.samples });
        for (let t = 0; t < rough.triangleCount; t += 1) {
            expect(rough.baseQ[t]).toBeGreaterThanOrEqual(0);
            expect(rough.baseQ[t]).toBeLessThan(mesh.BASE_LEVELS);
        }
    });
});

// ── Capture-freedom ──────────────────────────────────────────────────────────

describe('svg3d.mesh is capture-free', () => {
    test('the factory resolves in a bare realm with DI-injected vec3', () => {
        const api = bareRealmFactory(svg3dMeshModule)(vec3);
        const m = api.buildGridMesh({ cells: 4 });
        expect(m.triangleCount).toBe(32);
        expect(api.buildColorLut().length).toBe(16 * 33);
    });

    test('two factory instances share no mutable table', () => {
        const a = svg3dMeshModule.factory(vec3);
        const b = svg3dMeshModule.factory(vec3);
        const lutA = a.buildColorLut();
        lutA[0] = '#000000';
        expect(b.buildColorLut()[0]).not.toBe('#000000');
        expect(a.buildGridMesh).not.toBe(b.buildGridMesh);
    });

    test('each mesh gets its own LUT array (no shared mutable state)', () => {
        const m1 = mesh.buildGridMesh({ cells: 2 });
        const m2 = mesh.buildGridMesh({ cells: 2 });
        expect(m1.colorLut).not.toBe(m2.colorLut);
        expect(m1.colorLut).toEqual(m2.colorLut);
    });
});

// ── Water (the old `avgY == 0` faces) ───────────────────────────────────────

describe('water faces and their LUT', () => {
    test('a face is water when its three vertex heights are 0', () => {
        // 3×3 vertices, 2×2 cells: only the top-left vertex rises.
        const heights = [0.5, 0, 0, 0, 0, 0, 0, 0, 0];
        const m = mesh.buildGridMesh({ cells: 2, heights });
        expect(m.water.length).toBe(m.triangleCount);
        for (let f = 0; f < m.triangleCount; f += 1) {
            const vs = [m.indices[f * 3], m.indices[f * 3 + 1], m.indices[f * 3 + 2]];
            const flat = vs.every((v) => heights[v] === 0);
            expect(m.water[f]).toBe(flat ? 1 : 0);
        }
        expect([...m.water].filter((w) => w === 1).length).toBe(6);
    });

    test('waterLut: SHADE_LEVELS shades of #0000dd, darkened like the land LUT', () => {
        const m = mesh.buildGridMesh({ cells: 2 });
        expect(m.waterLut.length).toBe(mesh.SHADE_LEVELS);
        expect(m.waterLut[0]).toBe('#0000dd');
        for (let sh = 0; sh < mesh.SHADE_LEVELS; sh += 1) {
            const amt = Math.round(2.55 * -((sh / (mesh.SHADE_LEVELS - 1)) * 50));
            const b = Math.max(0, Math.min(255, 0xdd + amt)).toString(16).padStart(2, '0');
            expect(m.waterLut[sh]).toBe(`#0000${b}`);
        }
    });
});
