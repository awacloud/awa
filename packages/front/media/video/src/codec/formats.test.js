// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of row V16: `video.reduce`, and the `reduce` and
 * `maxFps` options of `video.codec` with the presets that use them.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences } from '../../bench/lib/sequences.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const codec = runtime.resolve('video.codec');
const reduce = runtime.resolve('video.reduce');

const W = 128;
const H = 96;
const set = sequences({ width: W, height: H, frames: 40, fps: 30, seed: 3 });
const shapes = set.find((s) => s.name === 'shapes');

describe('video.reduce', () => {
    test('a picture reduced by averaging; by 1 it is the picture itself', () => {
        const rgba = new Uint8ClampedArray(4 * 4 * 4);
        for (let i = 0; i < 16; i++) rgba.set([i * 10, 100, 200 - i, 255], i * 4);
        const half = reduce.reduce(rgba, 4, 4, 2);
        expect(half.length).toBe(2 * 2 * 4);
        // Pixels 0, 1, 4, 5 → reds 0, 10, 40, 50.
        // Blues 200, 199, 196, 195: 197.5, rounded up.
        expect([half[0], half[1], half[2], half[3]]).toEqual([25, 100, 198, 255]);
        expect(half[4 * 3]).toBe(Math.round((100 + 110 + 140 + 150) / 4));
        expect(reduce.reduce(rgba, 4, 4, 1)).toEqual(rgba);
        expect(reduce.reduce(rgba, 4, 4, 4).length).toBe(4);
    });

    test('a size that does not divide, or a bad factor, is refused', () => {
        const rgba = new Uint8ClampedArray(6 * 4 * 4);
        expect(() => reduce.reduce(rgba, 6, 4, 4)).toThrow(RangeError);
        expect(() => reduce.reduce(rgba, 6, 4, 0)).toThrow(RangeError);
        expect(() => reduce.reduce(rgba, 6, 4, 1.5)).toThrow(RangeError);
        expect(() => reduce.reduce(rgba, 6, 5, 1)).toThrow(RangeError);
    });
});

describe('video.codec reduce and maxFps', () => {
    const OPTIONS = { levels: 2, diagonal: true, detail: 4, quant: 4, coding: 'nibbles' };

    test('the encoder says what it codes', () => {
        expect(codec.createEncoder({ width: W, height: H, fps: 30, ...OPTIONS }).coded).toEqual({ width: W, height: H, fps: 30 });
        expect(codec.createEncoder({ width: W, height: H, fps: 30, ...OPTIONS, reduce: 2, maxFps: 15 }).coded).toEqual({ width: W / 2, height: H / 2, fps: 15 });
        // The rate is never exceeded: 24 frames a second under a limit of 15 become 12, 60 become 15.
        expect(codec.createEncoder({ width: W, height: H, fps: 24, ...OPTIONS, maxFps: 15 }).coded.fps).toBe(12);
        expect(codec.createEncoder({ width: W, height: H, fps: 60, ...OPTIONS, maxFps: 15 }).coded.fps).toBe(15);
        expect(codec.createEncoder({ width: W, height: H, fps: 12, ...OPTIONS, maxFps: 15 }).coded.fps).toBe(12);
    });

    test('the stream is the one of an encoder given the reduced frames at the reduced rate', () => {
        const direct = codec.createEncoder({ width: W, height: H, fps: 30, ...OPTIONS, reduce: 2, maxFps: 15 });
        const byHand = codec.createEncoder({ width: W / 2, height: H / 2, fps: 15, ...OPTIONS });
        const decoder = codec.createDecoder(direct.coded);
        let sent = 0;
        for (let t = 0; t < 20; t++) {
            const packets = direct.push(shapes.frame(t));
            if (t % 2 === 1) {
                expect(packets).toEqual([]);
                continue;
            }
            expect(packets).toEqual(byHand.push(reduce.reduce(shapes.frame(t), W, H, 2)));
            for (const packet of packets) {
                sent++;
                expect(decoder.push(packet).length).toBe((W / 2) * (H / 2) * 4);
            }
        }
        expect(sent).toBeGreaterThan(5);
        expect(direct.picture()).toEqual(byHand.picture());
    });

    test('bad options and sizes are refused', () => {
        expect(() => codec.createEncoder({ width: W, height: H, fps: 30, ...OPTIONS, reduce: 3 })).toThrow(RangeError);
        expect(() => codec.createEncoder({ width: W, height: H, fps: 30, ...OPTIONS, reduce: 0 })).toThrow(RangeError);
        expect(() => codec.createEncoder({ width: W, height: H, fps: 30, ...OPTIONS, maxFps: 0 })).toThrow(RangeError);
        // 128 x 96 reduced by 8 is 16 x 12, which two passes of the pyramid divide; by 16 it is 8 x 6, which they do not.
        expect(codec.createEncoder({ width: W, height: H, fps: 30, ...OPTIONS, reduce: 8 }).coded.width).toBe(16);
        expect(() => codec.createEncoder({ width: W, height: H, fps: 30, ...OPTIONS, reduce: 16 })).toThrow(RangeError);
        const encoder = codec.createEncoder({ width: W, height: H, fps: 30, ...OPTIONS, reduce: 2 });
        expect(() => encoder.push(new Uint8ClampedArray(16))).toThrow(RangeError);
    });

    test('the economy side of the presets: fewer frames, then a smaller picture', () => {
        expect(codec.presets.economy.maxFps).toBe(15);
        expect(codec.presets.low).toEqual({ ...codec.presets.economy, reduce: 2 });
        expect(codec.presets.minimal).toEqual({ ...codec.presets.low, maxFps: 10 });
        for (const name of ['quality', 'standard', 'screen']) {
            expect(codec.presets[name].maxFps).toBe(undefined);
            expect(codec.presets[name].reduce).toBe(undefined);
        }
        const coded = (preset) => codec.createEncoder({ width: W, height: H, fps: 30, preset }).coded;
        expect(coded('economy')).toEqual({ width: W, height: H, fps: 15 });
        expect(coded('low')).toEqual({ width: W / 2, height: H / 2, fps: 15 });
        expect(coded('minimal')).toEqual({ width: W / 2, height: H / 2, fps: 10 });
        const bytes = (preset) => {
            const encoder = codec.createEncoder({ width: W, height: H, fps: 30, preset });
            let total = 0;
            for (let t = 0; t < 30; t++) for (const packet of encoder.push(shapes.frame(t))) total += packet.length;
            return total;
        };
        expect(bytes('economy')).toBeLessThan(bytes('standard'));
        expect(bytes('low')).toBeLessThan(bytes('economy'));
        expect(bytes('minimal')).toBeLessThan(bytes('low'));
    });
});
