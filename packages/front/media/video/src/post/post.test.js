// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `video.post` (row V10): the restoration filter
 * of the decoder, its modes and its place in `video.codec`.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences } from '../../bench/lib/sequences.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const post = runtime.resolve('video.post');
const codec = runtime.resolve('video.codec');

const W = 8;
const H = 6;
const at = (x, y) => y * W + x;
const flat = (value) => new Uint8ClampedArray(W * H).fill(value);
/** Three planes: a colour difference, the luma, the other colour difference. */
const planesOf = (red, luma, blue) => [red, luma, blue];

describe('video.post', () => {
    test('the modes are listed; none changes nothing; a flat picture is left as it is', () => {
        expect(post.modes).toEqual(['none', 'laplace', 'laplace-clamped', 'gauss', 'chroma']);
        const luma = flat(90);
        luma[at(3, 2)] = 200;
        const planes = planesOf(flat(127), luma, flat(127));
        const same = post.apply(planes, W, H, { mode: 'none' });
        expect(same).toEqual(planes);
        for (const mode of post.modes) {
            const out = post.apply(planesOf(flat(60), flat(140), flat(200)), W, H, { mode });
            expect(out[0]).toEqual(flat(60));
            expect(out[1]).toEqual(flat(140));
            expect(out[2]).toEqual(flat(200));
        }
        expect(() => post.apply(planes, W, H, { mode: 'other' })).toThrow(RangeError);
        expect(() => post.apply(planes, W + 1, H, { mode: 'gauss' })).toThrow(RangeError);
    });

    test('laplace: the luma becomes the mean of its four neighbours, a colour plane gains its Laplacian', () => {
        const luma = flat(100);
        luma[at(3, 2)] = 180;
        const red = flat(100);
        red[at(3, 2)] = 120;
        const out = post.apply(planesOf(red, luma, flat(127)), W, H, { mode: 'laplace' });
        expect(out[1][at(3, 2)]).toBe(100);                 // (100 × 4) / 4
        expect(out[1][at(4, 2)]).toBe(120);                 // (180 + 100 × 3) / 4
        expect(out[1][at(5, 2)]).toBe(100);
        expect(out[0][at(3, 2)]).toBe(40);                  // 120 + (400 − 480)
        expect(out[0][at(4, 2)]).toBe(120);                 // 100 + (420 − 400)
        // The border is left as decoded, as in the original.
        luma[at(0, 0)] = 250;
        expect(post.apply(planesOf(red, luma, flat(127)), W, H, { mode: 'laplace' })[1][at(0, 0)]).toBe(250);
    });

    test('laplace-clamped, the original: only peaks are lowered', () => {
        const luma = flat(100);
        luma[at(3, 2)] = 180;                               // a peak
        luma[at(5, 4)] = 20;                                // a hollow
        const out = post.apply(planesOf(flat(127), luma, flat(127)), W, H, { mode: 'laplace-clamped' })[1];
        expect(out[at(3, 2)]).toBe(180 - (255 >> 2));       // its Laplacian, 320, is clamped to 255
        expect(out[at(5, 4)]).toBe(20);                     // a negative Laplacian is lost
        expect(out[at(4, 2)]).toBe(100);                    // the neighbours of a peak: negative too
        expect(out[at(5, 3)]).toBe(100 - (80 >> 2));        // the neighbours of a hollow are lowered
        for (let i = 0; i < out.length; i++) expect(out[i]).toBeLessThanOrEqual(luma[i]);
    });

    test('gauss: a 3×3 binomial blur on the three planes', () => {
        const luma = flat(0);
        luma[at(3, 2)] = 160;
        const out = post.apply(planesOf(flat(0), luma, flat(0)), W, H, { mode: 'gauss' })[1];
        expect(out[at(3, 2)]).toBe(40);                     // 4 / 16
        expect(out[at(4, 2)]).toBe(20);                     // 2 / 16
        expect(out[at(4, 3)]).toBe(10);                     // 1 / 16
        expect(out[at(5, 2)]).toBe(0);
    });

    test('chroma: the luma is left as decoded, the colour planes are smoothed', () => {
        const luma = flat(0);
        luma[at(3, 2)] = 160;
        const red = flat(0);
        for (let y = 0; y < H; y++) for (let x = 4; x < W; x++) red[at(x, y)] = 160;
        const out = post.apply(planesOf(red, luma, flat(127)), W, H, { mode: 'chroma' });
        expect(out[1]).toEqual(luma);
        expect(out[0][at(3, 2)]).toBeGreaterThan(0);
        expect(out[0][at(3, 2)]).toBeLessThan(160);
        expect(out[0][at(1, 2)]).toBe(0);
        expect(out[0][at(6, 2)]).toBe(160);
    });
});

describe('video.codec post', () => {
    const CW = 128;
    const CH = 96;
    const shapes = sequences({ width: CW, height: CH, frames: 8, fps: 24, seed: 3 }).find((s) => s.name === 'shapes');
    const config = { width: CW, height: CH, fps: 24, levels: 2, diagonal: true, select: { rule: 'reference', chroma: true }, detail: 4 };

    test('the filter is the decoder’s choice, off by default, and changes no byte', () => {
        const encoder = codec.createEncoder(config);
        const plain = codec.createDecoder({ width: CW, height: CH });
        const none = codec.createDecoder({ width: CW, height: CH, post: 'none' });
        const smoothed = codec.createDecoder({ width: CW, height: CH, post: 'chroma' });
        let a = null;
        let b = null;
        let c = null;
        for (let t = 0; t < 6; t++) {
            for (const packet of encoder.push(shapes.frame(t))) {
                a = new Uint8ClampedArray(plain.push(packet));
                b = new Uint8ClampedArray(none.push(packet));
                c = new Uint8ClampedArray(smoothed.push(packet));
            }
        }
        expect(b).toEqual(a);
        expect(encoder.picture()).toEqual(a);
        expect(c.some((v, i) => v !== a[i])).toBe(true);
        expect(() => codec.createDecoder({ width: CW, height: CH, post: 'other' })).toThrow(RangeError);
    });
});
