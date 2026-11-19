// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of row V15: selected pixels sent as differences
 * from what the decoder holds (`delta`).
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences } from '../../bench/lib/sequences.js';
import { fw } from '../../bench/lib/fw.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const codec = runtime.resolve('video.codec');
const pack = runtime.resolve('video.pack');

const W = 128;
const H = 96;
const FPS = 24;
const set = sequences({ width: W, height: H, frames: 200, fps: FPS, seed: 3 });
const byName = Object.fromEntries(set.map((s) => [s.name, s]));
const BASE = { width: W, height: H, fps: FPS, levels: 2, diagonal: true, detail: 4, coding: 'nibbles' };

/** Runs a sequence; `onPacket` may drop or cut a packet (return null to lose it). */
function run(sequence, frames, config, onPacket = (packet) => packet) {
    const encoder = codec.createEncoder({ ...BASE, ...config });
    const decoder = codec.createDecoder({ width: W, height: H });
    const packets = [];
    const pictures = [];
    let bytes = 0;
    let deflated = 0;
    let picture = null;
    let agree = true;
    for (let t = 0; t < frames; t++) {
        for (const packet of encoder.push(sequence.frame(t))) {
            packets.push(packet);
            bytes += packet.length;
            deflated += fw.deflate.deflateSync(packet, { level: 6 }).length;
            const kept = onPacket(packet, t);
            if (kept) picture = new Uint8ClampedArray(decoder.push(kept));
        }
        pictures.push(picture);
        if (encoder.picture().some((v, i) => v !== picture[i])) agree = false;
    }
    return { packets, pictures, bytes, deflated, picture, agree };
}

describe('video.codec delta', () => {
    const variants = [{}, { quant: 4 }, { exact: true, quant: 2 }, { exact: true, quant: 4, motion: { tile: 32 } }, { quant: 16, smooth: 3 }];

    test('the same pictures as without it, and both ends agree', () => {
        for (const config of variants) {
            for (const name of ['shapes', 'camera', 'scroll']) {
                const plain = run(byName[name], 14, config);
                const delta = run(byName[name], 14, { ...config, delta: true });
                expect(delta.agree).toBe(true);
                expect(delta.picture).toEqual(plain.picture);
            }
        }
    });

    test('content that persists and changes a little: the differences cost far less than the values', () => {
        // On generated noise that is new at every frame a difference is as large as a value; the gain shows where
        // content persists (measured on real clips, row V15). Here: a still picture whose light rises slowly.
        const still = byName.static.frame(0);
        const fade = { frame: (t) => still.map((v, k) => (k % 4 === 3 ? v : Math.min(255, v + (t >> 1)))) };
        for (const config of [{ quant: 4 }, { exact: true, quant: 2 }]) {
            const plain = run(fade, 40, config);
            const delta = run(fade, 40, { ...config, delta: true });
            expect(delta.picture).toEqual(plain.picture);
            expect(delta.bytes - delta.packets[0].length).toBeLessThan((plain.bytes - plain.packets[0].length) * 0.6);
            expect(delta.deflated).toBeLessThan(plain.deflated);
        }
    });

    test('hold: details that have not really moved cost nothing; both ends agree', () => {
        for (const config of [{ quant: 4 }, { exact: true, quant: 2 }]) {
            const delta = run(byName.camera, 30, { ...config, delta: true });
            const held = run(byName.camera, 30, { ...config, delta: true, hold: 4 });
            expect(held.agree).toBe(true);
            expect(held.bytes).toBeLessThan(delta.bytes);
            expect(held.deflated).toBeLessThan(delta.deflated);
        }
        expect(() => codec.createEncoder({ ...BASE, hold: 4 })).toThrow(RangeError);
        expect(() => codec.createEncoder({ ...BASE, delta: true, hold: -1 })).toThrow(RangeError);
    });

    test('the stream says it; without the option nothing changes', () => {
        const delta = run(byName.shapes, 3, { delta: true });
        expect(codec.describe(delta.packets[0]).delta).toBe(true);
        const plain = run(byName.shapes, 3, {});
        expect(codec.describe(plain.packets[0]).delta).toBe(false);
        expect(run(byName.shapes, 3, { delta: false }).packets).toEqual(plain.packets);
        expect(() => codec.createEncoder({ ...BASE, delta: true, select: { rule: 'history' } })).toThrow(RangeError);
    });

    test('a lost packet is repaired within the keep delay and the refresh budget', () => {
        const frames = 3 * FPS + 60;
        const whole = run(byName.shapes, frames, { quant: 4, delta: true });
        const lossy = run(byName.shapes, frames, { quant: 4, delta: true }, (packet, t) => (t >= 10 && t <= 12 ? null : packet));
        expect(lossy.pictures[13]).not.toEqual(whole.pictures[13]);
        expect(lossy.pictures[frames - 1]).toEqual(whole.pictures[frames - 1]);
    });

    test('content that changes at every frame is repaired too: a whole value leans on no difference', () => {
        // A scrolling page without the vector: every pixel is a difference at every frame, between two whole values.
        const frames = 4 * FPS;
        const whole = run(byName.scroll, frames, { quant: 4, delta: true });
        const lossy = run(byName.scroll, frames, { quant: 4, delta: true }, (packet, t) => (t === 10 ? null : packet));
        expect(lossy.pictures[12]).not.toEqual(whole.pictures[12]);
        expect(lossy.pictures[frames - 1]).toEqual(whole.pictures[frames - 1]);
    });

    test('dropped units still give a picture; a cut packet is refused', () => {
        const drop = (keep) => (packet) => pack.writeUnits(pack.readUnits(packet).filter((unit) => keep(unit.type)));
        const all = run(byName.shapes, 10, { quant: 4, delta: true });
        const noColour = run(byName.shapes, 10, { quant: 4, delta: true }, drop((type) => type !== pack.types.COLOUR));
        const baseOnly = run(byName.shapes, 10, { quant: 4, delta: true }, drop((type) => type < pack.types.DETAIL));
        expect(noColour.picture.length).toBe(all.picture.length);
        expect(baseOnly.picture.length).toBe(all.picture.length);
        expect(noColour.picture).not.toEqual(all.picture);
        const decoder = codec.createDecoder({ width: W, height: H });
        expect(() => decoder.push(all.packets[0].subarray(0, all.packets[0].length - 25))).toThrow(RangeError);
    });
});
