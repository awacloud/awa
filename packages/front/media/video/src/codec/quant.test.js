// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of row V9a: `video.nibbles`, and the `quant` and
 * `coding` options of `video.codec`.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences, prng } from '../../bench/lib/sequences.js';
import { psnrLuma } from '../../bench/lib/metrics.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const codec = runtime.resolve('video.codec');
const nibbles = runtime.resolve('video.nibbles');

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
    let later = 0;
    let picture = null;
    let agree = true;
    for (let t = 0; t < frames; t++) {
        for (const packet of encoder.push(sequence.frame(t))) {
            packets.push(packet);
            bytes += packet.length;
            if (t > 0) later++;
            picture = new Uint8ClampedArray(decoder.push(packet));
        }
        if (encoder.picture().some((v, i) => v !== picture[i])) agree = false;
    }
    return { bytes, later, picture, agree, packets, psnr: psnrLuma(sequence.frame(frames - 1), picture).psnr };
}

describe('video.nibbles', () => {
    test('a band of integers comes back exactly', () => {
        const random = prng(9);
        const values = new Int32Array(5000);
        for (let i = 0; i < values.length; i++) {
            const r = random();
            values[i] = r < 0.7 ? 0 : r < 0.95 ? Math.round((random() - 0.5) * 12) : Math.round((random() - 0.5) * 2000);
        }
        values.fill(0, 1000, 1400);
        values.fill(0, 4900);
        const bytes = [];
        nibbles.put(bytes, values);
        expect(bytes.length).toBeLessThan(values.length / 2);
        const out = new Int32Array(values.length);
        const end = nibbles.read(Uint8Array.from(bytes), 0, out);
        expect(end).toBe(bytes.length);
        expect(out).toEqual(values);
    });

    test('nothing but zeros costs one byte; a cut band is refused', () => {
        const bytes = [];
        nibbles.put(bytes, new Int32Array(300));
        expect(bytes.length).toBe(1);
        const full = [];
        nibbles.put(full, Int32Array.from({ length: 64 }, (_, i) => i - 32));
        expect(() => nibbles.read(Uint8Array.from(full.slice(0, 10)), 0, new Int32Array(64))).toThrow(RangeError);
    });
});

describe('video.codec quant and coding', () => {
    test('with the defaults the stream is unchanged, and says so', () => {
        const plain = run(byName.shapes, 6, {});
        const stated = run(byName.shapes, 6, { quant: 1, coding: 'bytes' });
        expect(stated.packets).toEqual(plain.packets);
        const said = codec.describe(plain.packets[0]);
        expect(said.quant).toBe(1);
        expect(said.coding).toBe('bytes');
        const coded = codec.describe(run(byName.shapes, 2, { quant: 4, coding: 'nibbles' }).packets[0]);
        expect(coded.quant).toBe(4);
        expect(coded.coding).toBe('nibbles');
    });

    test('both ends hold the quantised values, with exact and motion too', () => {
        for (const config of [{ quant: 4 }, { quant: 4, coding: 'nibbles' }, { quant: 2, coding: 'nibbles', exact: true }, { quant: 4, coding: 'nibbles', exact: true, motion: { tile: 32 } }]) {
            for (const name of ['shapes', 'camera', 'scroll']) expect(run(byName[name], 12, config).agree).toBe(true);
        }
    });

    test('a larger step costs fewer bytes and the quality falls by steps', () => {
        const rows = [1, 2, 4, 8, 16].map((quant) => run(byName.shapes, 12, { quant, coding: 'nibbles' }));
        for (let k = 1; k < rows.length; k++) {
            expect(rows[k].bytes).toBeLessThan(rows[k - 1].bytes);
            // A step twice as large costs at most the 6 dB of one bit.
            expect(rows[k].psnr).toBeGreaterThan(rows[k - 1].psnr - 6.5);
        }
        expect(rows[2].bytes).toBeLessThan(rows[0].bytes * 0.8);
        expect(rows[4].psnr).toBeGreaterThan(24);
    });

    test('a still scene sends nothing more, whatever the step', () => {
        for (const quant of [1, 4, 16]) {
            for (const exact of [false, true]) expect(run(byName.static, 20, { quant, coding: 'nibbles', exact }).later).toBe(0);
        }
    });

    test('the 4-bit coding changes no picture and costs fewer bytes', () => {
        for (const exact of [false, true]) {
            const bytes = run(byName.shapes, 12, { quant: 4, exact });
            const coded = run(byName.shapes, 12, { quant: 4, exact, coding: 'nibbles' });
            expect(coded.picture).toEqual(bytes.picture);
            expect(coded.bytes).toBeLessThan(bytes.bytes);
        }
    });

    test('bad options and cut packets are refused', () => {
        for (const quant of [0, 3, 128, 1.5]) expect(() => codec.createEncoder({ ...BASE, quant })).toThrow(RangeError);
        expect(() => codec.createEncoder({ ...BASE, coding: 'other' })).toThrow(RangeError);
        const packet = run(byName.shapes, 1, { quant: 4, coding: 'nibbles' }).packets[0];
        const decoder = codec.createDecoder({ width: W, height: H });
        expect(() => decoder.push(packet.subarray(0, packet.length - 40))).toThrow(RangeError);
    });
});
