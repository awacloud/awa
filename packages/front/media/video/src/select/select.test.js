// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `video.select` (row V5): the selection of the
 * pixels to send, first candidate — the rule of the owner's CPU tasks.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences } from '../../bench/lib/sequences.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const color = runtime.resolve('video.color');
const select = runtime.resolve('video.select');

const W = 96;
const H = 64;
const FPS = 24;
const FRAMES = 140;
const set = sequences({ width: W, height: H, frames: FRAMES, fps: FPS, seed: 3 });
const lumaOf = (sequence, t) => color.forward(sequence.frame(t))[1];

/** Runs the selection over a sequence; returns the count and the mask of each frame. */
function run(sequence, frames = FRAMES) {
    const selector = select.create({ width: W, height: H, fps: FPS });
    const out = [];
    for (let t = 0; t < frames; t++) {
        const { mask, count } = selector.push(lumaOf(sequence, t));
        out.push({ count, mask: Uint8Array.from(mask) });
    }
    return out;
}

describe('video.select', () => {
    test('a frame gives a mask of one byte a pixel and its count', () => {
        const selector = select.create({ width: W, height: H, fps: FPS });
        const { mask, count } = selector.push(lumaOf(set[0], 0));
        expect(mask.length).toBe(W * H);
        expect(count).toBe(mask.reduce((sum, v) => sum + v, 0));
        expect(mask.every((v) => v === 0 || v === 1)).toBe(true);
        // Nothing was known before the first frame: everything is sent.
        expect(count).toBe(W * H);
    });

    test('a still scene sends nothing once it is known, until the keep delay ends', () => {
        const frames = run(set[0]);
        // The history holds four frames: it settles within the first four.
        for (let t = 4; t < FPS; t++) expect(frames[t].count).toBe(0);
    });

    test('a still scene is refreshed within its budget, and every pixel within a bound', () => {
        const frames = run(set[0]);
        const budget = (W * H) / 10;
        for (let t = 4; t < FRAMES; t++) expect(frames[t].count).toBeLessThanOrEqual(budget + 1);
        // After the first frames every pixel comes again: the longest keep delay
        // is three seconds, the budget then needs about ten frames.
        const seen = new Uint8Array(W * H);
        for (let t = 4; t < 4 + 3 * FPS + 30; t++) frames[t].mask.forEach((v, i) => { if (v) seen[i] = 1; });
        expect(seen.reduce((sum, v) => sum + v, 0)).toBe(W * H);
    });

    test('what moves is selected', () => {
        const frames = run(set[1], 40);
        for (let t = 10; t < 40; t++) {
            const now = lumaOf(set[1], t);
            const before = lumaOf(set[1], t - 1);
            let changed = 0;
            let caught = 0;
            for (let i = 0; i < now.length; i++) {
                if (Math.abs(now[i] - before[i]) > 8) {
                    changed++;
                    if (frames[t].mask[i]) caught++;
                }
            }
            expect(changed).toBeGreaterThan(0);
            expect(caught / changed).toBeGreaterThan(0.95);
            // And not much more than what moved.
            expect(frames[t].count).toBeLessThan(changed * 4 + (W * H) / 10);
        }
    });

    test('the thresholds follow the amount of change', () => {
        const still = select.create({ width: W, height: H, fps: FPS });
        const busy = select.create({ width: W, height: H, fps: FPS });
        for (let t = 0; t < 12; t++) {
            still.push(lumaOf(set[0], t));
            busy.push(lumaOf(set[3], t));          // scrolling text: everything changes
        }
        expect(still.state().level).toBe(0);
        expect(busy.state().level).toBeGreaterThan(still.state().level);
        expect(busy.state().keep).toBeGreaterThan(still.state().keep);
    });

    test('a bad size or frame is refused', () => {
        expect(() => select.create({ width: 0, height: 10, fps: 24 })).toThrow();
        expect(() => select.create({ width: 10, height: 10, fps: 0 })).toThrow();
        const selector = select.create({ width: W, height: H, fps: FPS });
        expect(() => selector.push(new Uint8ClampedArray(10))).toThrow();
    });
});
