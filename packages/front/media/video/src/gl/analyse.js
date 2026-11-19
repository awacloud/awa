// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.gl.analyse` — the encoder's front end on the GPU.
 *
 * From an RGBA frame it gives the pyramid the encoder works on: the
 * colour approximation (`video.color`), then the exact Haar pyramid
 * (`video.haar` with `exact`). It is the part of the encoder that
 * touches every pixel of every frame.
 *
 * The shaders are integer programs, written from the two CPU kernels
 * line for line: the result is **bit for bit** the CPU's, which the
 * check page under `bench/gpu/` proves in a browser. One pass for the
 * colour, one pass a level; a level writes two textures, the picture at
 * half size (the three planes) and the luma's three detail bands. Only
 * what the encoder reads comes back from the GPU: the detail bands of
 * each level and the planes of the smallest picture.
 */

import { glModule } from './gl.js';

/**
 * @typedef {object} GlAnalyser
 * @property {(rgba: Uint8ClampedArray) => import('../haar/haar.js').HaarPyramid} forward The exact pyramid of the frame.
 * @property {() => void} dispose
 *
 * @typedef {object} GlAnalyseApi
 * @property {Record<string, string>} shaders The fragment programs, by name.
 * @property {(options: { width: number, height: number, levels: number, diagonal?: boolean, canvas?: OffscreenCanvas|HTMLCanvasElement }) => GlAnalyser} create
 */

export const glAnalyseModule = {
    name: 'video.gl.analyse',
    version: '0.1.0',
    type: 'lib.media.video',
    dependencies: ['video.gl'],
    deps: [glModule],

    /**
     * @param {import('./gl.js').GlApi} glApi
     * @returns {GlAnalyseApi}
     */
    factory(glApi) {
        const SHADERS = {
            // `video.color.forward`: a luma and two colour differences centred on 127.
            colour: `#version 300 es
precision highp int;
precision highp usampler2D;
uniform usampler2D source;
out ivec4 planes;
void main() {
    ivec4 c = ivec4(texelFetch(source, ivec2(gl_FragCoord.xy), 0));
    int y = (4 * c.r + 11 * c.g + c.b) >> 4;
    planes = ivec4(127 + ((y - c.r) >> 1), y, 127 + ((y - c.b) >> 1), 0);
}`,
            // One exact pass of \`video.haar\` on the three planes: averages by shift, differences kept whole.
            level: `#version 300 es
precision highp int;
precision highp isampler2D;
uniform isampler2D planes;
layout(location = 0) out ivec4 smaller;
layout(location = 1) out ivec4 detail;
void main() {
    ivec2 p = ivec2(gl_FragCoord.xy) * 2;
    ivec3 a = texelFetch(planes, p, 0).rgb;
    ivec3 b = texelFetch(planes, p + ivec2(1, 0), 0).rgb;
    ivec3 c = texelFetch(planes, p + ivec2(0, 1), 0).rgb;
    ivec3 d = texelFetch(planes, p + ivec2(1, 1), 0).rgb;
    ivec3 thTop = (a + b) >> 1;
    ivec3 tgTop = a - b;
    ivec3 thBottom = (c + d) >> 1;
    ivec3 tgBottom = c - d;
    smaller = ivec4((thTop + thBottom) >> 1, 0);
    // The luma's bands: gx, hy, gy.
    detail = ivec4((tgTop.g + tgBottom.g) >> 1, thTop.g - thBottom.g, tgTop.g - tgBottom.g, 0);
}`,
        };

        /**
         * @param {object} options
         * @param {number} options.width Divisible by 2^levels.
         * @param {number} options.height
         * @param {number} options.levels Passes, 1 to 6.
         * @param {boolean} [options.diagonal=true] Give the diagonal band.
         * @param {OffscreenCanvas|HTMLCanvasElement} [options.canvas]
         * @returns {GlAnalyser}
         * @throws {RangeError} On a bad size or count of levels.
         * @throws {Error} When WebGL2 is not available.
         */
        function create({ width, height, levels, diagonal = true, canvas }) {
            if (!Number.isInteger(levels) || levels < 1 || levels > 6) throw new RangeError(`video.gl.analyse: levels ${levels}`);
            if (width % (1 << levels) !== 0 || height % (1 << levels) !== 0) throw new RangeError(`video.gl.analyse: ${width}x${height} does not divide by 2^${levels}`);
            const context = glApi.create({ width, height, canvas });
            const colour = context.program(SHADERS.colour);
            const level = context.program(SHADERS.level);
            const source = context.texture({ width, height, format: 'rgba8ui' });
            const planes = context.texture({ width, height, format: 'rgba16i' });
            const first = context.target([planes]);
            // From the finest level to the coarsest: each reads the planes of the one before.
            const steps = [];
            let input = planes;
            for (let k = 1; k <= levels; k++) {
                const w = width >> k;
                const h = height >> k;
                const smaller = context.texture({ width: w, height: h, format: 'rgba16i' });
                const detail = context.texture({ width: w, height: h, format: 'rgba16i' });
                steps.push({ input, target: context.target([smaller, detail]), width: w, height: h });
                input = smaller;
            }

            return {
                /** @throws {RangeError} When the frame has not the configured size. */
                forward(rgba) {
                    if (rgba.length !== width * height * 4) throw new RangeError(`video.gl.analyse: a frame of ${rgba.length} bytes, ${width * height * 4} expected`);
                    context.upload(source, rgba);
                    context.run(colour, { target: first, inputs: { source } });
                    const out = new Array(levels);
                    steps.forEach((step, k) => {
                        context.run(level, { target: step.target, inputs: { planes: step.input } });
                        const raw = context.read(step.target, 1);
                        const n = step.width * step.height;
                        const gx = new Int16Array(n);
                        const hy = new Int16Array(n);
                        const gy = diagonal ? new Int16Array(n) : null;
                        for (let i = 0, j = 0; i < n; i++, j += 4) {
                            gx[i] = raw[j];
                            hy[i] = raw[j + 1];
                            if (gy) gy[i] = raw[j + 2];
                        }
                        out[levels - 1 - k] = { width: step.width, height: step.height, planes: [null, { gx, hy, gy }, null] };
                    });
                    const last = steps[levels - 1];
                    const raw = context.read(last.target, 0);
                    const n = last.width * last.height;
                    const base = [new Uint8ClampedArray(n), new Uint8ClampedArray(n), new Uint8ClampedArray(n)];
                    for (let i = 0, j = 0; i < n; i++, j += 4) {
                        base[0][i] = raw[j];
                        base[1][i] = raw[j + 1];
                        base[2][i] = raw[j + 2];
                    }
                    return { width, height, exact: true, base, levels: out };
                },
                dispose: () => context.dispose(),
            };
        }

        return { shaders: SHADERS, create };
    },
};
