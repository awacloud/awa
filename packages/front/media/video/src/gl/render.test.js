// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the decoder's GPU back end that can run without
 * a GPU (row B3b): the module refuses cleanly, and the decoder hands its
 * pyramid to a `present` function. What the shaders draw is proven in
 * Chromium by the check page under `bench/gpu/`.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences } from '../../bench/lib/sequences.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const render = runtime.resolve('video.gl.render');
const codec = runtime.resolve('video.codec');
const color = runtime.resolve('video.color');
const haar = runtime.resolve('video.haar');
const post = runtime.resolve('video.post');

describe('video.gl.render without a GPU', () => {
    test('it refuses cleanly, and its shaders are integer programs', () => {
        expect(() => render.create({ width: 64, height: 32, levels: 2 })).toThrow('WebGL2');
        expect(() => render.create({ width: 60, height: 32, levels: 3 })).toThrow(RangeError);
        expect(() => render.create({ width: 64, height: 32, levels: 0 })).toThrow(RangeError);
        for (const [name, source] of Object.entries(render.shaders)) {
            expect(source.startsWith('#version 300 es')).toBe(true);
            expect(source).toContain('texelFetch');
            // Only the last pass, to the canvas, writes a float colour.
            if (name !== 'colour') expect(/(^|[^i])vec4\(/.test(source)).toBe(false);
        }
    });
});

describe('video.codec present', () => {
    const W = 128;
    const H = 96;
    const shapes = sequences({ width: W, height: H, frames: 12, fps: 24, seed: 3 }).find((s) => s.name === 'shapes');

    test('the decoder hands its pyramid and the filter to apply; rendered by the CPU kernels it is the picture', () => {
        for (const [preset, decoderPost] of [['quality', undefined], ['quality', 'none'], ['standard', { mode: 'chroma', passes: 2 }]]) {
            const encoder = codec.createEncoder({ width: W, height: H, fps: 24, preset });
            const plain = codec.createDecoder({ width: W, height: H, post: decoderPost });
            let shown = null;
            const presenting = codec.createDecoder({
                width: W,
                height: H,
                post: decoderPost,
                present(pyramid, filter) {
                    const planes = haar.inverse(pyramid);
                    shown = color.inverse(filter ? post.apply(planes, W, H, filter) : planes);
                },
            });
            for (let t = 0; t < 8; t++) {
                for (const packet of encoder.push(shapes.frame(t))) {
                    const picture = new Uint8ClampedArray(plain.push(packet));
                    expect(presenting.push(packet)).toBe(null);
                    expect(shown).toEqual(picture);
                }
            }
        }
    });

    test('a present that is not a function is refused', () => {
        expect(() => codec.createDecoder({ width: W, height: H, present: 'canvas' })).toThrow(RangeError);
    });
});
