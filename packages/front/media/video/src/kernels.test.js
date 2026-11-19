// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `video.color` (row V3) and `video.haar` (row V4).
 * The error bounds are the ones measured over the whole RGB cube and on
 * the bench scene (`evidence/media-codecs/video-measure.mjs`, track).
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from './main.js';
import { sequences } from '../bench/lib/sequences.js';
import { psnrLuma, psnrColour } from '../bench/lib/metrics.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const color = runtime.resolve('video.color');
const haar = runtime.resolve('video.haar');

const W = 96;
const H = 64;
const frame = sequences({ width: W, height: H, frames: 4, fps: 24, seed: 3 })[1].frame(2);

describe('video.color', () => {
    test('a pixel becomes a luma and two differences centred on 127', () => {
        expect(color.offset).toBe(127);
        const [red, luma, blue] = color.forward(Uint8ClampedArray.from([90, 90, 90, 255, 255, 0, 0, 255, 0, 0, 255, 255]));
        expect(Array.from(luma)).toEqual([90, 63, 15]);          // (4R + 11G + B) >> 4
        expect(Array.from(red)).toEqual([127, 127 + ((63 - 255) >> 1), 127 + (15 >> 1)]);
        expect(Array.from(blue)).toEqual([127, 127 + (63 >> 1), 127 + ((15 - 255) >> 1)]);
    });

    test('the planes have one byte a pixel; the inverse gives RGBA with alpha 255', () => {
        const planes = color.forward(frame);
        expect(planes.length).toBe(3);
        for (const plane of planes) expect(plane.length).toBe(W * H);
        const back = color.inverse(planes);
        expect(back.length).toBe(frame.length);
        for (let i = 3; i < back.length; i += 4) if (back[i] !== 255) throw new Error('alpha');
        const into = new Uint8ClampedArray(frame.length);
        expect(color.inverse(planes, into)).toBe(into);
    });

    test('forward then inverse errs by at most 1 on red and blue, 2 on green', () => {
        // A lattice through the whole cube, its corners and edges included.
        const values = [];
        for (let v = 0; v < 256; v += 5) values.push(v);
        const rgba = new Uint8ClampedArray(values.length ** 3 * 4);
        let i = 0;
        for (const r of values) for (const g of values) for (const b of values) { rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255; i += 4; }
        const back = color.inverse(color.forward(rgba));
        const worst = [0, 0, 0];
        for (let p = 0; p < rgba.length; p += 4) for (let c = 0; c < 3; c++) worst[c] = Math.max(worst[c], Math.abs(back[p + c] - rgba[p + c]));
        expect(worst[0]).toBeLessThanOrEqual(1);
        expect(worst[1]).toBeLessThanOrEqual(2);
        expect(worst[2]).toBeLessThanOrEqual(1);
        expect(psnrColour(rgba, back).psnr).toBeGreaterThan(48);
    });
});

describe('video.haar', () => {
    const planes = color.forward(frame);

    test('the pyramid has the sizes of its levels, coarsest first', () => {
        const pyramid = haar.forward(planes, W, H, { levels: 3 });
        expect(pyramid.base.length).toBe(3);
        for (const plane of pyramid.base) expect(plane.length).toBe((W >> 3) * (H >> 3));
        expect(pyramid.levels.map((level) => [level.width, level.height])).toEqual([[12, 8], [24, 16], [48, 32]]);
        for (const level of pyramid.levels) expect(level.planes[1].gx.length).toBe(level.width * level.height);
    });

    test('the defaults keep luma detail only, without the diagonal band', () => {
        const pyramid = haar.forward(planes, W, H, { levels: 2 });
        for (const level of pyramid.levels) {
            expect(level.planes[0]).toBeNull();
            expect(level.planes[2]).toBeNull();
            expect(level.planes[1].gy).toBeNull();
        }
        const full = haar.forward(planes, W, H, { levels: 2, diagonal: true, chroma: 'all' });
        for (const level of full.levels) for (const bands of level.planes) expect(bands.gy.length).toBe(level.width * level.height);
    });

    test('a flat plane has a flat base and neutral details', () => {
        const flat = [new Uint8ClampedArray(W * H).fill(127), new Uint8ClampedArray(W * H).fill(200), new Uint8ClampedArray(W * H).fill(127)];
        const pyramid = haar.forward(flat, W, H, { levels: 3, diagonal: true });
        expect(pyramid.base[1].every((v) => v === 200)).toBe(true);
        for (const level of pyramid.levels) {
            const { gx, hy, gy } = level.planes[1];
            expect(gx.every((v) => v === 127) && hy.every((v) => v === 127) && gy.every((v) => v === 127)).toBe(true);
        }
        expect(haar.inverse(pyramid)[1].every((v) => v === 200)).toBe(true);
    });

    test('with every band kept the picture comes back close; the defaults cost quality', () => {
        const score = (options) => {
            const back = color.inverse(haar.inverse(haar.forward(planes, W, H, options)));
            return [psnrLuma(frame, back).psnr, psnrColour(frame, back).psnr];
        };
        const all = score({ levels: 3, diagonal: true, chroma: 'all' });
        const defaults = score({ levels: 3 });
        const withDiagonal = score({ levels: 3, diagonal: true });
        const withChroma = score({ levels: 3, chroma: 'all' });
        expect(all[0]).toBeGreaterThan(38);
        expect(all[1]).toBeGreaterThan(34);
        expect(withDiagonal[0]).toBeGreaterThan(defaults[0] + 3);       // the diagonal band is luma detail
        expect(withChroma[1]).toBeGreaterThan(defaults[1] + 3);         // colour detail is colour
        expect(all[0]).toBeGreaterThan(withDiagonal[0]);
    });

    test('fewer levels used give the picture of the size below, enlarged', () => {
        const pyramid = haar.forward(planes, W, H, { levels: 2 });
        const base = haar.inverse(pyramid, { levels: 0 })[1];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (base[y * W + x] !== pyramid.base[1][(y >> 2) * (W >> 2) + (x >> 2)]) throw new Error(`pixel ${x},${y}`);
        }
        const score = (levels) => psnrLuma(frame, color.inverse(haar.inverse(pyramid, { levels }))).psnr;
        expect(score(2)).toBeGreaterThan(score(1));
        expect(score(1)).toBeGreaterThanOrEqual(score(0));
    });

    test('a size that does not divide, or a bad option, is refused', () => {
        expect(() => haar.forward(planes, W, H, { levels: 7 })).toThrow();
        expect(() => haar.forward(planes, W, H, { levels: 0 })).toThrow();
        expect(() => haar.forward([new Uint8ClampedArray(90 * 64)], 90, 64, { levels: 2 })).toThrow();
        expect(() => haar.forward(planes, W, H, { levels: 2, chroma: 'half' })).toThrow();
    });
});
