// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `video.codec` (row V8): the encoder and decoder
 * of the layered stream, its options, dropped units and lost packets.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences } from '../../bench/lib/sequences.js';
import { psnrLuma } from '../../bench/lib/metrics.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const color = runtime.resolve('video.color');
const haar = runtime.resolve('video.haar');
const pack = runtime.resolve('video.pack');
const codec = runtime.resolve('video.codec');

const W = 96;
const H = 64;
const FPS = 24;
const SHAPE = { width: W, height: H, fps: FPS };
const set = sequences({ width: W, height: H, frames: 200, fps: FPS, seed: 3 });
const [still, shapes, , scroll] = set;

/** Runs a sequence; `onPacket` may drop or cut a packet (return null to lose it). */
function run(sequence, frames, config, onPacket = (packet) => packet) {
    const encoder = codec.createEncoder({ ...SHAPE, ...config });
    const decoder = codec.createDecoder({ width: W, height: H });
    const pictures = [];
    let picture = null;
    let bytes = 0;
    for (let t = 0; t < frames; t++) {
        for (const packet of encoder.push(sequence.frame(t))) {
            bytes += packet.length;
            const kept = onPacket(packet, t);
            if (kept) picture = decoder.push(kept);
        }
        pictures.push(picture ? new Uint8ClampedArray(picture) : null);
    }
    return { pictures, bytes };
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('video.codec', () => {
    test('the first frame is the transforms themselves, whole', () => {
        for (const config of [{ levels: 2 }, { levels: 1, diagonal: true }, { levels: 3, diagonal: true }]) {
            const { pictures } = run(shapes, 1, config);
            const frame = shapes.frame(0);
            const direct = color.inverse(haar.inverse(haar.forward(color.forward(frame), W, H, config)));
            expect(same(pictures[0], direct)).toBe(true);
        }
    });

    test('the decoder reads the levels and the bands from the stream', () => {
        const encoder = codec.createEncoder({ ...SHAPE, levels: 3, diagonal: true });
        const packet = encoder.push(shapes.frame(0))[0];
        const info = codec.describe(packet);
        expect(info.levels).toBe(3);
        expect(info.diagonal).toBe(true);
        expect(info.units).toEqual([pack.types.BASE, pack.types.COLOUR, pack.types.DETAIL, pack.types.DETAIL + 1, pack.types.DETAIL + 2]);
        expect(info.move).toBeNull();
    });

    test('a still scene sends nothing once known', () => {
        const encoder = codec.createEncoder({ ...SHAPE, levels: 2 });
        expect(encoder.push(still.frame(0)).length).toBe(1);
        let sent = 0;
        for (let t = 1; t < 12; t++) sent += encoder.push(still.frame(t)).length;
        expect(sent).toBeLessThanOrEqual(3);            // the history rule settles within four frames
        const reference = codec.createEncoder({ ...SHAPE, levels: 2, select: { rule: 'reference', chroma: true } });
        reference.push(still.frame(0));
        for (let t = 1; t < 12; t++) expect(reference.push(still.frame(t)).length).toBe(0);
    });

    test('units dropped on the way still give a picture', () => {
        const config = { levels: 2, diagonal: true, select: { rule: 'reference', chroma: true } };
        const whole = run(shapes, 12, config);
        const drop = (types) => (packet) => pack.writeUnits(pack.readUnits(packet).filter((unit) => !types(unit.type)));
        const noColour = run(shapes, 12, config, drop((type) => type === pack.types.COLOUR));
        const noFine = run(shapes, 12, config, drop((type) => type === pack.types.DETAIL + 1));
        const baseOnly = run(shapes, 12, config, drop((type) => type >= pack.types.DETAIL));
        const frame = shapes.frame(11);
        const score = (result) => psnrLuma(frame, result.pictures[11]).psnr;
        // Without colour: every pixel is grey.
        const grey = noColour.pictures[11];
        for (let i = 0; i < grey.length; i += 4) expect(Math.abs(grey[i] - grey[i + 2])).toBeLessThanOrEqual(1);
        expect(score(whole)).toBeGreaterThan(score(noFine));
        expect(score(noFine)).toBeGreaterThanOrEqual(score(baseOnly));
        expect(score(baseOnly)).toBeGreaterThan(8);
    });

    test('a lost packet is repaired within the keep delay and the refresh budget', () => {
        for (const select of [{ rule: 'history' }, { rule: 'reference', chroma: true }]) {
            const config = { levels: 2, diagonal: true, select };
            const frames = 3 * FPS + 60;
            const whole = run(shapes, frames, config);
            const lossy = run(shapes, frames, config, (packet, t) => (t >= 10 && t <= 12 ? null : packet));
            expect(same(lossy.pictures[13], whole.pictures[13])).toBe(false);
            // What the loss left is only where the picture has not moved since; the refresh clears it.
            const last = frames - 1;
            let differing = 0;
            for (let i = 0; i < whole.pictures[last].length; i++) if (whole.pictures[last][i] !== lossy.pictures[last][i]) differing++;
            expect(differing).toBe(0);
        }
    });

    test('with the detail test, what only the details show is sent', () => {
        const base = { levels: 2, diagonal: true, select: { rule: 'reference', chroma: true } };
        const score = (config) => {
            const { pictures } = run(scroll, 16, config);
            return psnrLuma(scroll.frame(15), pictures[15]).psnr;
        };
        const without = score(base);
        const withDetail = score({ ...base, detail: 4 });
        expect(without).toBeLessThan(25);
        expect(withDetail).toBeGreaterThan(without + 15);
        // And on a still scene it adds nothing.
        const encoder = codec.createEncoder({ ...SHAPE, ...base, detail: 4 });
        encoder.push(still.frame(0));
        for (let t = 1; t < 12; t++) expect(encoder.push(still.frame(t)).length).toBe(0);
    });

    test('a bad configuration or packet is refused', () => {
        expect(() => codec.createEncoder({ ...SHAPE, levels: 0 })).toThrow();
        expect(() => codec.createEncoder({ width: 90, height: 64, fps: FPS, levels: 2 })).toThrow();
        expect(() => codec.createEncoder({ ...SHAPE, levels: 2, detail: -1 })).toThrow();
        const encoder = codec.createEncoder({ ...SHAPE, levels: 2 });
        expect(() => encoder.push(new Uint8ClampedArray(10))).toThrow();
        const packet = encoder.push(shapes.frame(0))[0];
        const decoder = codec.createDecoder({ width: W, height: H });
        expect(() => decoder.push(packet.subarray(0, packet.length - 3))).toThrow();
        // No base unit: nothing to place the rest on.
        const headless = pack.writeUnits(pack.readUnits(packet).filter((unit) => unit.type !== pack.types.BASE));
        expect(() => decoder.push(headless)).toThrow();
        expect(() => codec.createDecoder({ width: 100, height: 64 }).push(packet)).toThrow();
    });
});
