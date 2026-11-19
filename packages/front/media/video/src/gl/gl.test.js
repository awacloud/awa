// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the GPU modules that can run without a GPU
 * (row B3a): they load, register and refuse cleanly where WebGL2 is not
 * there, and the codec takes a front end. What the shaders compute is
 * proven in Chromium by the check page under `bench/gpu/`.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences } from '../../bench/lib/sequences.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const gl = runtime.resolve('video.gl');
const analyse = runtime.resolve('video.gl.analyse');
const codec = runtime.resolve('video.codec');
const color = runtime.resolve('video.color');
const haar = runtime.resolve('video.haar');

describe('video.gl without a GPU', () => {
    test('it says WebGL2 is not there, and creating it fails with a clear error', () => {
        expect(gl.supported()).toBe(false);
        expect(() => gl.create({ width: 16, height: 16 })).toThrow('WebGL2');
        expect(() => analyse.create({ width: 64, height: 32, levels: 2 })).toThrow('WebGL2');
        expect(() => analyse.create({ width: 60, height: 32, levels: 3 })).toThrow(RangeError);
        expect(() => analyse.create({ width: 64, height: 32, levels: 0 })).toThrow(RangeError);
    });

    test('the shaders are integer programs', () => {
        for (const source of Object.values(analyse.shaders)) {
            expect(source.startsWith('#version 300 es')).toBe(true);
            expect(source).not.toContain('float ');
            expect(source).toContain('texelFetch');
        }
    });
});

describe('video.codec front end', () => {
    const W = 128;
    const H = 96;
    const shapes = sequences({ width: W, height: H, frames: 12, fps: 24, seed: 3 }).find((s) => s.name === 'shapes');
    const options = { width: W, height: H, fps: 24, preset: 'standard' };

    test('an encoder given a front end that computes the same pyramid emits the same packets', () => {
        let calls = 0;
        const front = (rgba) => {
            calls++;
            return haar.forward(color.forward(rgba), W, H, { levels: 2, diagonal: true, exact: true });
        };
        const plain = codec.createEncoder(options);
        const fronted = codec.createEncoder({ ...options, analyse: front });
        for (let t = 0; t < 10; t++) expect(fronted.push(shapes.frame(t))).toEqual(plain.push(shapes.frame(t)));
        expect(calls).toBe(10);
    });

    test('a front end needs the exact pyramid, and is not for the vector or a reduced picture yet', () => {
        const front = () => null;
        expect(() => codec.createEncoder({ ...options, exact: false, analyse: front })).toThrow(RangeError);
        expect(() => codec.createEncoder({ ...options, preset: 'screen', analyse: front })).toThrow(RangeError);
        expect(() => codec.createEncoder({ ...options, preset: 'low', analyse: front })).toThrow(RangeError);
        expect(() => codec.createEncoder({ ...options, analyse: 'gpu' })).toThrow(RangeError);
    });
});

describe('video.gl, probed once (pass P)', () => {
    test('supported() probes WebGL2 once, and gives the probe context back', () => {
        const made = [];
        const lost = [];
        globalThis.OffscreenCanvas = class {
            getContext(kind) {
                made.push(kind);
                return { getExtension: (name) => (name === 'WEBGL_lose_context' ? { loseContext: () => lost.push(kind) } : null) };
            }
        };
        try {
            const fresh = new ModuleRuntime();
            fresh.registerAllDeep(mediaVideoModules);
            const probe = fresh.resolve('video.gl');
            expect(probe.supported()).toBe(true);
            expect(probe.supported()).toBe(true);
            expect(made).toEqual(['webgl2']);
            expect(lost).toEqual(['webgl2']);
        } finally {
            delete globalThis.OffscreenCanvas;
        }
    });
});
