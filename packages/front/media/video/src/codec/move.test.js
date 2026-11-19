// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the frame vector inside `video.codec` (row V12b).
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences } from '../../bench/lib/sequences.js';
import { psnrLuma } from '../../bench/lib/metrics.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const codec = runtime.resolve('video.codec');

const W = 128;
const H = 96;
const FPS = 24;
const set = sequences({ width: W, height: H, frames: 60, fps: FPS, seed: 3 });
const byName = Object.fromEntries(set.map((s) => [s.name, s]));
const BASE = { width: W, height: H, fps: FPS, diagonal: true, select: { rule: 'reference', chroma: true }, detail: 4 };

/** Runs a sequence; returns the bytes after the first frame, the last picture and whether both ends agree at every frame. */
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
        const mirror = encoder.picture();
        if (mirror.some((v, i) => v !== picture[i])) agree = false;
    }
    return { bytes, picture, agree };
}

describe('video.codec with a frame vector', () => {
    test('the encoder knows the picture its decoder shows', () => {
        for (const config of [{ levels: 1 }, { levels: 2 }, { levels: 2, motion: {} }, { levels: 1, motion: { tile: 32 } }]) {
            for (const name of ['shapes', 'scroll', 'panel']) expect(run(byName[name], 14, config).agree).toBe(true);
        }
    });

    test('a page that scrolls costs a fraction of what it did', () => {
        const frame = byName.scroll.frame(29);
        // The page moves by 2 pixels: with one pass that is a multiple of 2, the
        // pyramid moves as it is and the quality is kept.
        const plain1 = run(byName.scroll, 30, { levels: 1 });
        const moved1 = run(byName.scroll, 30, { levels: 1, motion: {} });
        expect(moved1.bytes).toBeLessThan(plain1.bytes / 3);
        expect(psnrLuma(frame, moved1.picture).psnr).toBeGreaterThan(psnrLuma(frame, plain1.picture).psnr - 3);
        // With two passes the pyramid is rebuilt from the moved picture at each
        // frame: the loss of each rebuild is held by the thresholds, not removed.
        const plain2 = run(byName.scroll, 30, { levels: 2 });
        const moved2 = run(byName.scroll, 30, { levels: 2, motion: {} });
        expect(moved2.bytes).toBeLessThan(plain2.bytes / 3);
        expect(psnrLuma(frame, moved2.picture).psnr).toBeGreaterThan(35);
        expect(psnrLuma(frame, moved2.picture).psnr).toBeLessThan(psnrLuma(frame, plain2.picture).psnr);
    });

    test('with tiles a scrolling panel beside a still area is followed', () => {
        const plain = run(byName.panel, 30, { levels: 2 });
        const tiles = run(byName.panel, 30, { levels: 2, motion: { tile: 32 } });
        expect(tiles.bytes).toBeLessThan(plain.bytes / 3);
        const frame = byName.panel.frame(29);
        expect(psnrLuma(frame, tiles.picture).psnr).toBeGreaterThan(38);
    });

    test('where nothing scrolls the stream is the same, byte for byte', () => {
        for (const name of ['static', 'shapes', 'cut']) {
            const plain = run(byName[name], 30, { levels: 2 });
            const moved = run(byName[name], 30, { levels: 2, motion: { tile: 32, position: false } });
            expect(moved.bytes).toBe(plain.bytes);
            // The position (row V13) costs its two bytes a packet, nothing else.
            const located = run(byName[name], 30, { levels: 2, motion: { tile: 32 } });
            expect(located.bytes).toBeGreaterThanOrEqual(plain.bytes);
            expect(located.bytes - plain.bytes).toBeLessThanOrEqual(2 * 30);
            expect((located.bytes - plain.bytes) % 2).toBe(0);
            expect(moved.picture).toEqual(plain.picture);
        }
    });

    test('the vector needs the reference rule; a bad tile is refused', () => {
        expect(() => codec.createEncoder({ ...BASE, levels: 2, select: { rule: 'history' }, motion: {} })).toThrow();
        expect(() => codec.createEncoder({ ...BASE, levels: 2, motion: { tile: 20 } })).toThrow();
        expect(() => codec.createEncoder({ ...BASE, levels: 3, motion: { tile: 4 } })).toThrow();
    });
});
