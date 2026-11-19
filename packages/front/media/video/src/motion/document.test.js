// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The vector on a real document (row V17): a white page
 * with a few lines of text, scrolled by a mouse-wheel step. Little of
 * the picture changes, and it moves far — a real capture showed
 * steps of 32, 64 and 96 pixels at 15 frames a second.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { prng } from '../../bench/lib/sequences.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const motion = runtime.resolve('video.motion');
const codec = runtime.resolve('video.codec');

const W = 640;
const H = 360;

/** A white page: lines of small dark marks every 24 pixels, a grey toolbar on top that does not scroll. */
function page(offset) {
    const luma = new Uint8ClampedArray(W * H).fill(250);
    const random = prng(8);
    const marks = [];
    for (let line = 0; line < 60; line++) for (let k = 0; k < 14; k++) marks.push([line * 24 + 6, 60 + Math.floor(random() * 500), 3 + Math.floor(random() * 5)]);
    for (const [top, left, width] of marks) {
        for (let dy = 0; dy < 9; dy++) {
            const y = top + dy - offset + 40;
            if (y < 40 || y >= H) continue;
            for (let dx = 0; dx < width; dx++) luma[y * W + left + dx] = 30;
        }
    }
    for (let i = 0; i < 40 * W; i++) luma[i] = 200;
    return luma;
}

describe('video.motion on a document', () => {
    test('a wheel step on a mostly white page is found, with the options of the screen preset', () => {
        const options = codec.presets.screen.motion;
        for (const step of [32, 64, 96]) {
            const before = page(100);
            const after = page(100 + step);
            let changed = 0;
            for (let i = 0; i < before.length; i++) if (Math.abs(before[i] - after[i]) > 3) changed++;
            // Little of the picture changes: under the tenth the search used to wait for.
            expect(changed / before.length).toBeLessThan(0.1);
            const found = motion.estimate(after, before, W, H, options);
            expect(found.moved).toBe(true);
            expect([found.dx, found.dy]).toEqual([0, -step]);
        }
    });

    test('a still page is not searched, and a page with nothing in common is not moved', () => {
        const options = codec.presets.screen.motion;
        expect(motion.estimate(page(100), page(100), W, H, options).searched).toBe(false);
        const random = prng(2);
        const noise = Uint8ClampedArray.from({ length: W * H }, () => Math.floor(random() * 256));
        expect(motion.estimate(noise, page(100), W, H, options).moved).toBe(false);
    });
});
