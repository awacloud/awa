// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the exact pyramid (in `video.haar` and as an
 * option of `video.codec`) and of the cheaper vector search.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences, prng } from '../../bench/lib/sequences.js';
import { psnrLuma } from '../../bench/lib/metrics.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const color = runtime.resolve('video.color');
const haar = runtime.resolve('video.haar');
const codec = runtime.resolve('video.codec');
const motion = runtime.resolve('video.motion');

const W = 128;
const H = 96;
const FPS = 24;
const set = sequences({ width: W, height: H, frames: 60, fps: FPS, seed: 3 });
const byName = Object.fromEntries(set.map((s) => [s.name, s]));
const BASE = { width: W, height: H, fps: FPS, diagonal: true, select: { rule: 'reference', chroma: true }, detail: 4 };

function run(sequence, frames, config) {
    const encoder = codec.createEncoder({ ...BASE, ...config });
    const decoder = codec.createDecoder({ width: W, height: H });
    let bytes = 0;
    let picture = null;
    let agree = true;
    for (let t = 0; t < frames; t++) {
        for (const packet of encoder.push(sequence.frame(t))) {
            if (t > 0) bytes += packet.length;
            picture = new Uint8ClampedArray(decoder.push(packet));
        }
        if (encoder.picture().some((v, i) => v !== picture[i])) agree = false;
    }
    return { bytes, picture, agree };
}

/** Largest gap between the luma planes of two pictures. */
function lumaError(frame, picture) {
    const sent = color.forward(frame)[1];
    const shown = color.forward(picture)[1];
    let worst = 0;
    for (let i = 0; i < sent.length; i++) worst = Math.max(worst, Math.abs(sent[i] - shown[i]));
    return worst;
}

describe('video.haar exact', () => {
    test('with every band kept, any plane comes back exactly', () => {
        const random = prng(11);
        const planes = [0, 1, 2].map(() => Uint8ClampedArray.from({ length: W * H }, () => Math.floor(random() * 256)));
        for (const levels of [1, 2, 3, 4]) {
            const pyramid = haar.forward(planes, W, H, { levels, diagonal: true, chroma: 'all', exact: true });
            expect(pyramid.exact).toBe(true);
            expect(pyramid.levels[0].planes[1].gx).toBeInstanceOf(Int16Array);
            const back = haar.inverse(pyramid);
            for (let p = 0; p < 3; p++) {
                if (back[p].some((v, i) => v !== planes[p][i])) throw new Error(`plane ${p} at ${levels} levels`);
            }
        }
    });

    test('the design’s arithmetic does not; its loss grows with the passes', () => {
        const planes = color.forward(byName.shapes.frame(2));
        const loss = (levels, exact) => {
            const back = haar.inverse(haar.forward(planes, W, H, { levels, diagonal: true, chroma: 'all', exact }));
            let worst = 0;
            for (let i = 0; i < back[1].length; i++) worst = Math.max(worst, Math.abs(back[1][i] - planes[1][i]));
            return worst;
        };
        expect(loss(3, true)).toBe(0);
        expect(loss(1, false)).toBeGreaterThan(0);
        expect(loss(3, false)).toBeGreaterThan(loss(1, false));
    });

    test('a flat plane has no detail; fewer levels give the smaller picture enlarged', () => {
        const flat = [new Uint8ClampedArray(W * H).fill(127), new Uint8ClampedArray(W * H).fill(200), new Uint8ClampedArray(W * H).fill(127)];
        const pyramid = haar.forward(flat, W, H, { levels: 2, diagonal: true, exact: true });
        for (const level of pyramid.levels) {
            const { gx, hy, gy } = level.planes[1];
            expect(gx.every((v) => v === 0) && hy.every((v) => v === 0) && gy.every((v) => v === 0)).toBe(true);
        }
        const planes = color.forward(byName.shapes.frame(2));
        const real = haar.forward(planes, W, H, { levels: 2, diagonal: true, exact: true });
        const small = haar.inverse(real, { levels: 0 })[1];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (small[y * W + x] !== real.base[1][(y >> 2) * (W >> 2) + (x >> 2)]) throw new Error(`pixel ${x},${y}`);
        }
    });
});

describe('video.codec exact', () => {
    test('the first frame is the luma itself; the stream says it is exact', () => {
        const encoder = codec.createEncoder({ ...BASE, levels: 2, exact: true });
        const decoder = codec.createDecoder({ width: W, height: H });
        const frame = byName.shapes.frame(0);
        const packet = encoder.push(frame)[0];
        expect(codec.describe(packet).exact).toBe(true);
        const picture = decoder.push(packet);
        // The luma plane is carried exactly; the colour approximation itself errs by at most 2.
        // (Colour stays at the smallest size, so a measure on the RGB picture is capped by it.)
        expect(lumaError(frame, picture)).toBeLessThanOrEqual(2);
        expect(lumaError(frame, run(byName.shapes, 1, { levels: 2 }).picture)).toBeGreaterThan(2);
    });

    test('both ends agree, with and without a move', () => {
        for (const config of [{ levels: 2, exact: true }, { levels: 2, exact: true, motion: { tile: 32 } }]) {
            for (const name of ['shapes', 'scroll', 'panel']) expect(run(byName[name], 14, config).agree).toBe(true);
        }
    });

    test('with the exact pyramid a vector that is not aligned no longer costs quality', () => {
        const frame = byName.scroll.frame(29);
        const lossy = run(byName.scroll, 30, { levels: 2, motion: {} });
        const still = run(byName.scroll, 30, { levels: 2, exact: true });
        const exact = run(byName.scroll, 30, { levels: 2, exact: true, motion: {} });
        const score = (result) => psnrLuma(frame, result.picture).psnr;
        expect(score(exact)).toBeGreaterThan(score(lossy) + 5);
        expect(score(exact)).toBeGreaterThan(score(still) - 3);
        expect(exact.bytes).toBeLessThan(still.bytes / 3);
    });

    test('the detail threshold keeps its meaning: a camera noise costs no more than twice the bytes', () => {
        const plain = run(byName.camera, 20, { levels: 2 });
        const exact = run(byName.camera, 20, { levels: 2, exact: true });
        expect(exact.bytes).toBeLessThan(plain.bytes * 2.5);
    });

    test('a decoder follows a stream that turns exact', () => {
        const decoder = codec.createDecoder({ width: W, height: H });
        const plain = codec.createEncoder({ ...BASE, levels: 2 });
        const exact = codec.createEncoder({ ...BASE, levels: 2, exact: true });
        const frame = byName.shapes.frame(0);
        decoder.push(plain.push(frame)[0]);
        const picture = decoder.push(exact.push(frame)[0]);
        expect(lumaError(frame, picture)).toBeLessThanOrEqual(2);
    });
});

describe('video.motion search', () => {
    const lumaOf = (sequence, t) => color.forward(sequence.frame(t))[1];

    test('nothing is searched when little of the picture changed', () => {
        // Moving shapes change a few percent of the picture: under the share asked, no search.
        const found = motion.estimate(lumaOf(byName.shapes, 6), lumaOf(byName.shapes, 5), W, H, { minChange: 0.2 });
        expect(found.moved).toBe(false);
        expect(found.searched).toBe(false);
        // A scrolling page changes most of it: searched and found.
        const page = motion.estimate(lumaOf(byName.scroll, 6), lumaOf(byName.scroll, 5), W, H, { minChange: 0.2 });
        expect(page.searched).toBe(true);
        expect([page.dx, page.dy]).toEqual([0, -byName.scroll.pixelsPerFrame]);
        // With no floor everything that is not still is searched.
        expect(motion.estimate(lumaOf(byName.shapes, 6), lumaOf(byName.shapes, 5), W, H, { minChange: 0 }).searched).toBe(true);
    });

    test('the two-stage search finds the same vectors', () => {
        for (const name of ['scroll', 'panel']) {
            for (const t of [3, 9, 20]) {
                const found = motion.estimate(lumaOf(byName[name], t), lumaOf(byName[name], t - 1), W, H, { tile: 16 });
                expect(found.moved).toBe(true);
                expect([found.dx, found.dy]).toEqual([0, -2]);
            }
        }
        expect(() => motion.estimate(lumaOf(byName.scroll, 1), lumaOf(byName.scroll, 0), W, H, { minChange: 2 })).toThrow();
    });
});
