// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.gl.render` — the decoder's back end on the GPU.
 *
 * From the pyramid a decoder holds it draws the picture into a canvas:
 * the inverse exact pyramid (`video.haar`), the colour-only smoothing
 * when asked (`video.post`, mode `chroma`), the colour inverse
 * (`video.color`). Nothing comes back to the CPU.
 *
 * The pyramid stays where packets are written into it, on the CPU; its
 * planes are uploaded as they are, one texture a plane and a band. The
 * shaders are integer programs written from the CPU kernels line for
 * line — the clamp of each level included — so the picture is **bit for
 * bit** the CPU's, which the check page under `bench/gpu/` proves in a
 * browser. Only the last pass writes a colour to the canvas.
 */

import { glModule } from './gl.js';

/**
 * @typedef {object} GlRenderer
 * @property {(pyramid: import('../haar/haar.js').HaarPyramid, filter?: { mode: string, passes?: number }|null) => void} draw Draws the picture into the canvas.
 * @property {() => Uint8ClampedArray} read The picture last drawn, RGBA, row 0 first — for checks: it reads back from the GPU.
 * @property {WebGL2RenderingContext} context
 * @property {() => void} dispose
 *
 * @typedef {object} GlRenderApi
 * @property {Record<string, string>} shaders The fragment programs, by name.
 * @property {(options: { width: number, height: number, levels: number, diagonal?: boolean, canvas?: OffscreenCanvas|HTMLCanvasElement }) => GlRenderer} create
 */

export const glRenderModule = {
    name: 'video.gl.render',
    version: '0.1.1',
    type: 'lib.media.video',
    dependencies: ['video.gl'],
    deps: [glModule],

    /**
     * @param {import('./gl.js').GlApi} glApi
     * @returns {GlRenderApi}
     */
    factory(glApi) {
        const SHADERS = {
            // The smallest picture: its three planes side by side in one texture.
            base: `#version 300 es
precision highp int;
precision highp usampler2D;
uniform usampler2D red;
uniform usampler2D luma;
uniform usampler2D blue;
out ivec4 planes;
void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    planes = ivec4(int(texelFetch(red, p, 0).r), int(texelFetch(luma, p, 0).r), int(texelFetch(blue, p, 0).r), 0);
}`,
            // One inverse exact pass of \`video.haar\`. The luma takes its three bands; the colour planes have none: repeated.
            level: `#version 300 es
precision highp int;
precision highp isampler2D;
uniform isampler2D smaller;
uniform isampler2D gx;
uniform isampler2D hy;
uniform isampler2D gy;
uniform int diagonal;
out ivec4 planes;
void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    ivec2 q = p >> 1;
    ivec3 low = texelFetch(smaller, q, 0).rgb;
    int dv = texelFetch(hy, q, 0).r;
    int g = texelFetch(gx, q, 0).r;
    int dg = diagonal != 0 ? texelFetch(gy, q, 0).r : 0;
    int thTop = low.g + ((dv + 1) >> 1);
    int th = (p.y & 1) == 0 ? thTop : thTop - dv;
    int tgTop = g + ((dg + 1) >> 1);
    int tg = (p.y & 1) == 0 ? tgTop : tgTop - dg;
    int left = th + ((tg + 1) >> 1);
    int luma = (p.x & 1) == 0 ? left : left - tg;
    // The CPU stores each level in clamped bytes.
    planes = ivec4(low.r, clamp(luma, 0, 255), low.b, 0);
}`,
            // \`video.post\`, mode chroma: the 3×3 binomial blur of the two colour planes, the edge repeated.
            chroma: `#version 300 es
precision highp int;
precision highp isampler2D;
uniform isampler2D planes;
out ivec4 smoothed;
void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    ivec2 last = textureSize(planes, 0) - 1;
    ivec2 sum = ivec2(0);
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            int weight = (2 - abs(dx)) * (2 - abs(dy));
            sum += weight * texelFetch(planes, clamp(p + ivec2(dx, dy), ivec2(0), last), 0).rb;
        }
    }
    smoothed = ivec4((sum.x + 8) >> 4, texelFetch(planes, p, 0).g, (sum.y + 8) >> 4, 0);
}`,
            // \`video.color.inverse\`, to the canvas: row 0 of the picture at the top.
            colour: `#version 300 es
precision highp int;
precision highp float;
precision highp isampler2D;
uniform isampler2D planes;
out vec4 colour;
void main() {
    ivec2 size = textureSize(planes, 0);
    ivec2 p = ivec2(int(gl_FragCoord.x), size.y - 1 - int(gl_FragCoord.y));
    ivec3 v = texelFetch(planes, p, 0).rgb;
    int r = clamp(v.g - ((v.r - 127) << 1), 0, 255);
    int b = clamp(v.g - ((v.b - 127) << 1), 0, 255);
    // Math.round(n / 11) for n = 16y − 4r − b, kept positive for the division: floor((2n + 11) / 22).
    int n = (v.g << 4) - (r << 2) - b + 2200;
    int g = clamp((2 * n + 11) / 22 - 200, 0, 255);
    colour = vec4(float(r) / 255.0, float(g) / 255.0, float(b) / 255.0, 1.0);
}`,
        };

        /**
         * @param {object} options
         * @param {number} options.width Divisible by 2^levels.
         * @param {number} options.height
         * @param {number} options.levels Passes of the pyramid, 1 to 6.
         * @param {boolean} [options.diagonal=true] The pyramid has its diagonal band.
         * @param {OffscreenCanvas|HTMLCanvasElement} [options.canvas] Where to draw; of the picture's size.
         * @returns {GlRenderer}
         * @throws {RangeError} On a bad size or count of levels.
         * @throws {Error} When WebGL2 is not available.
         */
        function create({ width, height, levels, diagonal = true, canvas }) {
            if (!Number.isInteger(levels) || levels < 1 || levels > 6) throw new RangeError(`video.gl.render: levels ${levels}`);
            if (width % (1 << levels) !== 0 || height % (1 << levels) !== 0) throw new RangeError(`video.gl.render: ${width}x${height} does not divide by 2^${levels}`);
            const context = glApi.create({ width, height, canvas });
            try {
                return build(context, width, height, levels, diagonal);
            } catch (error) {
                // A shader, a texture format or a target refused: what was made is freed.
                context.dispose();
                throw error;
            }
        }

        function build(context, width, height, levels, diagonal) {
            const programs = { base: context.program(SHADERS.base), level: context.program(SHADERS.level), chroma: context.program(SHADERS.chroma), colour: context.program(SHADERS.colour) };
            const bw = width >> levels;
            const bh = height >> levels;
            const baseIn = ['r8ui', 'r8ui', 'r8ui'].map((format) => context.texture({ width: bw, height: bh, format }));
            const baseOut = context.texture({ width: bw, height: bh, format: 'rgba16i' });
            const baseTarget = context.target([baseOut]);
            // From the coarsest level to the finest.
            const steps = [];
            let smaller = baseOut;
            for (let k = 0; k < levels; k++) {
                const w = bw << k;
                const h = bh << k;
                const bands = { gx: context.texture({ width: w, height: h, format: 'r16i' }), hy: context.texture({ width: w, height: h, format: 'r16i' }), gy: context.texture({ width: w, height: h, format: 'r16i' }) };
                const out = context.texture({ width: w * 2, height: h * 2, format: 'rgba16i' });
                steps.push({ smaller, bands, out, target: context.target([out]) });
                smaller = out;
            }
            const full = smaller;
            // Two full-size textures for the filter to go back and forth.
            const spare = context.texture({ width, height, format: 'rgba16i' });
            const spareTarget = context.target([spare]);
            const fullTarget = steps[levels - 1].target;

            return {
                /**
                 * @throws {RangeError} On a pyramid of another shape or arithmetic, or a filter the GPU does not do.
                 */
                draw(pyramid, filter = null) {
                    if (pyramid.width !== width || pyramid.height !== height || pyramid.levels.length !== levels) throw new RangeError('video.gl.render: a pyramid of another shape');
                    if (!pyramid.exact) throw new RangeError('video.gl.render: the exact pyramid only');
                    const mode = filter ? filter.mode : 'none';
                    if (mode !== 'none' && mode !== 'chroma') throw new RangeError(`video.gl.render: filter ${mode}`);
                    baseIn.forEach((texture, k) => context.upload(texture, pyramid.base[k]));
                    context.run(programs.base, { target: baseTarget, inputs: { red: baseIn[0], luma: baseIn[1], blue: baseIn[2] } });
                    steps.forEach((step, k) => {
                        const bands = pyramid.levels[k].planes[1];
                        context.upload(step.bands.gx, bands.gx);
                        context.upload(step.bands.hy, bands.hy);
                        if (bands.gy) context.upload(step.bands.gy, bands.gy);
                        context.run(programs.level, { target: step.target, inputs: { smaller: step.smaller, gx: step.bands.gx, hy: step.bands.hy, gy: step.bands.gy }, ints: { diagonal: diagonal && bands.gy ? 1 : 0 } });
                    });
                    let planes = full;
                    if (mode === 'chroma') {
                        const passes = filter.passes ?? 1;
                        if (!Number.isInteger(passes) || passes < 0 || passes > 16) throw new RangeError(`video.gl.render: filter passes ${passes}, 0 to 16`);
                        for (let k = 0; k < passes; k++) {
                            const toSpare = planes === full;
                            context.run(programs.chroma, { target: toSpare ? spareTarget : fullTarget, inputs: { planes } });
                            planes = toSpare ? spare : full;
                        }
                    }
                    context.run(programs.colour, { target: null, inputs: { planes } });
                },
                read: () => context.readCanvas(),
                /** The WebGL2 context, for a caller that has to wait for the drawing to end (`finish`). */
                context: context.gl,
                dispose: () => context.dispose(),
            };
        }

        return { shaders: SHADERS, create };
    },
};
