// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of row V9b: the stages the patent names — strips,
 * small groups, smoothing, error correction. The strips are tested as a
 * module: row V11 took them out of the codec.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences, prng } from '../../bench/lib/sequences.js';
import { psnrLuma } from '../../bench/lib/metrics.js';
import { fw } from '../../bench/lib/fw.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const codec = runtime.resolve('video.codec');
const strips = runtime.resolve('video.strips');
const select = runtime.resolve('video.select');
const color = runtime.resolve('video.color');

const W = 128;
const H = 96;
const FPS = 24;
const set = sequences({ width: W, height: H, frames: 60, fps: FPS, seed: 3 });
const byName = Object.fromEntries(set.map((s) => [s.name, s]));
const BASE = { width: W, height: H, fps: FPS, levels: 2, diagonal: true, select: { rule: 'reference', chroma: true }, detail: 4 };

function run(sequence, frames, config) {
    const encoder = codec.createEncoder({ ...BASE, ...config });
    const decoder = codec.createDecoder({ width: W, height: H });
    const packets = [];
    let bytes = 0;
    let picture = null;
    let agree = true;
    for (let t = 0; t < frames; t++) {
        for (const packet of encoder.push(sequence.frame(t))) {
            packets.push(packet);
            bytes += packet.length;
            picture = new Uint8ClampedArray(decoder.push(packet));
        }
        if (encoder.picture().some((v, i) => v !== picture[i])) agree = false;
    }
    return { bytes, picture, agree, packets, psnr: psnrLuma(sequence.frame(frames - 1), picture).psnr };
}

describe('video.strips', () => {
    const roundTrip = (values) => {
        const bytes = [];
        strips.put(bytes, values);
        const out = new Int32Array(values.length);
        const end = strips.read(Uint8Array.from(bytes), 0, out);
        expect(end).toBe(bytes.length);
        expect(out).toEqual(Int32Array.from(values));
        return bytes.length;
    };

    test('near values, repetitions, jumps and large values come back exactly', () => {
        const random = prng(4);
        const values = new Int32Array(4000);
        let v = 120;
        for (let i = 0; i < values.length; i++) {
            const r = random();
            if (r < 0.5) v += Math.round((random() - 0.5) * 6);
            else if (r > 0.97) v = Math.floor(random() * 3000);
            values[i] = Math.max(0, v);
        }
        values.fill(77, 500, 900);
        const length = roundTrip(values);
        expect(length).toBeLessThan(values.length * 0.8);
        roundTrip(new Int32Array(0));
        roundTrip(Int32Array.of(5));
        roundTrip(Int32Array.of(0, 13, 14, 15, 255, 256, 65535));
    });

    test('a flat table costs a few bytes; a cut table is refused', () => {
        expect(roundTrip(new Int32Array(1000).fill(42))).toBeLessThan(100);
        const bytes = [];
        strips.put(bytes, Int32Array.from({ length: 200 }, (_, i) => (i * 37) % 251));
        expect(() => strips.read(Uint8Array.from(bytes.slice(0, 20)), 0, new Int32Array(200))).toThrow(RangeError);
    });
});

describe('video.codec smoothing', () => {
    const deflated = (packets) => packets.reduce((sum, packet) => sum + fw.deflate.deflateSync(packet, { level: 6 }).length, 0);

    test('off by default: the stream is as it was', () => {
        expect(run(byName.camera, 6, { smooth: 0 }).packets).toEqual(run(byName.camera, 6, {}).packets);
    });

    test('both ends agree, the picture moves little, the lossless stage finds more to remove', () => {
        const plain = run(byName.camera, 10, { quant: 4, coding: 'nibbles' });
        const smooth = run(byName.camera, 10, { quant: 4, coding: 'nibbles', smooth: 4 });
        expect(smooth.agree).toBe(true);
        expect(smooth.bytes).toBe(plain.bytes);
        expect(deflated(smooth.packets)).toBeLessThan(deflated(plain.packets));
        expect(smooth.psnr).toBeGreaterThan(plain.psnr - 3);
        expect(() => codec.createEncoder({ ...BASE, smooth: -1 })).toThrow(RangeError);
    });
});

describe('video.select small groups and error correction', () => {
    const SW = 32;
    const SH = 16;
    const n = SW * SH;

    test('a lone weak change is not selected, a pair is, a lone strong one is', () => {
        const selector = select.create({ width: SW, height: SH, fps: FPS, rule: 'reference', minGroup: 2 });
        const luma = new Uint8ClampedArray(n).fill(100);
        selector.push(luma);
        const { thresholds } = selector.state();
        const weak = thresholds[0] + 1;
        luma[40] += weak;                       // alone
        luma[200] += weak;                      // a pair
        luma[201] += weak;
        luma[300] += 60;                        // alone, strong
        const { mask, count } = selector.push(luma);
        expect(mask[40]).toBe(0);
        expect(mask[200] && mask[201]).toBe(1);
        expect(mask[300]).toBe(1);
        expect(count).toBe(3);
        // The lone weak pixel was not taken as sent: it is still seen as changed, and still alone.
        expect(selector.push(luma).mask[40]).toBe(0);
        // Without the option it goes.
        const plain = select.create({ width: SW, height: SH, fps: FPS, rule: 'reference' });
        plain.push(new Uint8ClampedArray(n).fill(100));
        expect(plain.push(luma).mask[40]).toBe(1);
        expect(() => select.create({ width: SW, height: SH, fps: FPS, rule: 'reference', minGroup: 0 })).toThrow(RangeError);
    });

    test('with small groups dropped a still picture is still refreshed', () => {
        const selector = select.create({ width: SW, height: SH, fps: FPS, rule: 'reference', minGroup: 3 });
        const luma = new Uint8ClampedArray(n).fill(100);
        const seen = new Uint8Array(n);
        let missing = n;
        selector.push(luma);
        for (let t = 0; t < 4 * FPS && missing > 0; t++) {
            const { mask } = selector.push(luma);
            for (let i = 0; i < n; i++) if (mask[i] && !seen[i]) { seen[i] = 1; missing--; }
        }
        expect(missing).toBe(0);
    });

    test('error correction only adds pixels, and adds some on moving content', () => {
        for (const rule of ['history', 'complete']) {
            const plain = select.create({ width: W, height: H, fps: FPS, rule });
            const corrected = select.create({ width: W, height: H, fps: FPS, rule, correct: 3 });
            let more = 0;
            for (let t = 0; t < 20; t++) {
                const luma = color.forward(byName.shapes.frame(t))[1];
                const a = plain.push(luma).count;
                const b = corrected.push(luma).count;
                expect(b).toBeGreaterThanOrEqual(a);
                more += b - a;
            }
            expect(more).toBeGreaterThan(0);
        }
        expect(() => select.create({ width: W, height: H, fps: FPS, rule: 'history', correct: -1 })).toThrow(RangeError);
    });
});
