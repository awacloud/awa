// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of what row V13 added against lost packets: the
 * position a stream with a frame vector carries, by which a decoder that
 * missed a move catches up, and a refresh budget of its own.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences, prng } from '../../bench/lib/sequences.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const codec = runtime.resolve('video.codec');
const select = runtime.resolve('video.select');

const W = 128;
const H = 96;
const FPS = 24;
const set = sequences({ width: W, height: H, frames: 80, fps: FPS, seed: 3 });
const byName = Object.fromEntries(set.map((s) => [s.name, s]));
const BASE = { width: W, height: H, fps: FPS, levels: 2, diagonal: true, exact: true, select: { rule: 'reference', chroma: true }, detail: 4 };

/** Share of the pixels whose green differs by more than 2 between two pictures. */
function apart(a, b) {
    let wrong = 0;
    for (let i = 1; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 2) wrong++;
    return wrong / (a.length / 4);
}

/** One encoder, a decoder that gets everything and one that misses `lost`; the share apart at each frame. */
function run(sequence, frames, config, lost) {
    const encoder = codec.createEncoder({ ...BASE, ...config });
    const whole = codec.createDecoder({ width: W, height: H });
    const lossy = codec.createDecoder({ width: W, height: H });
    const shares = [];
    const packets = [];
    let a = null;
    let b = null;
    for (let t = 0; t < frames; t++) {
        for (const packet of encoder.push(sequence.frame(t))) {
            packets.push(packet);
            a = new Uint8ClampedArray(whole.push(packet));
            if (!lost.has(t)) b = new Uint8ClampedArray(lossy.push(packet));
        }
        shares.push(apart(a, b));
    }
    return { shares, packets };
}

describe('video.codec position', () => {
    test('a stream with a vector says where the picture stands; one without says nothing', () => {
        const moving = run(byName.scroll, 6, { motion: {} }, new Set()).packets;
        const positions = moving.map((packet) => codec.describe(packet).position);
        expect(positions[0]).toEqual({ x: 0, y: 0 });
        expect(positions[5]).toEqual({ x: 0, y: (256 - 2 * 5) & 0xff });
        const still = run(byName.scroll, 3, {}, new Set()).packets;
        expect(codec.describe(still[2]).position).toBe(null);
        // And it can be left out.
        const bare = run(byName.scroll, 3, { motion: { position: false } }, new Set()).packets;
        expect(codec.describe(bare[2]).position).toBe(null);
        expect(bare[2].length).toBe(moving[2].length - 2);
    });

    test('a decoder that missed a move catches up at the next packet', () => {
        const lost = new Set([10]);
        const without = run(byName.scroll, 14, { motion: { position: false } }, lost).shares;
        const withIt = run(byName.scroll, 14, { motion: {} }, lost).shares;
        expect(without[9]).toBe(0);
        expect(without[12]).toBeGreaterThan(0.2);
        expect(withIt[10]).toBeGreaterThan(0.2);
        expect(withIt[11]).toBeLessThan(0.08);
        expect(withIt[13]).toBeLessThan(0.08);
    });

    test('three moves missed in a row are caught up at once', () => {
        const shares = run(byName.scroll, 18, { motion: {} }, new Set([10, 11, 12])).shares;
        expect(shares[12]).toBeGreaterThan(0.2);
        expect(shares[13]).toBeLessThan(0.15);
    });

    test('tiles: the catch-up moves the tiles that move, not the still area', () => {
        const shares = run(byName.panel, 16, { motion: { tile: 32 } }, new Set([10])).shares;
        const without = run(byName.panel, 16, { motion: { tile: 32, position: false } }, new Set([10])).shares;
        expect(shares[12]).toBeLessThan(without[12] / 2);
    });

    test('nothing lost: the position changes no picture', () => {
        const a = run(byName.panel, 12, { motion: { tile: 32 } }, new Set());
        expect(a.shares.every((share) => share === 0)).toBe(true);
    });
});

describe('video.select refresh budget', () => {
    const SW = 32;
    const SH = 32;
    const n = SW * SH;

    /** Frames until every pixel of the still lower half was selected again after the first frame; Infinity if never. */
    function refreshedWithin(refresh, frames) {
        const selector = select.create({ width: SW, height: SH, fps: FPS, rule: 'reference', refresh });
        const random = prng(5);
        const luma = new Uint8ClampedArray(n).fill(100);
        const seen = new Uint8Array(n);
        let missing = n / 2;
        for (let t = 0; t < frames; t++) {
            // The upper half changes at every frame: half of the picture, five times the refresh budget.
            for (let i = 0; i < n / 2; i++) luma[i] = Math.floor(random() * 256);
            const { mask } = selector.push(luma);
            if (t === 0) continue;
            for (let i = n / 2; i < n; i++) {
                if (mask[i] && !seen[i]) { seen[i] = 1; missing--; }
            }
            if (missing === 0) return t;
        }
        return Infinity;
    }

    test('shared with the changes, a busy picture starves the refresh; on its own it does not', () => {
        expect(refreshedWithin('shared', 8 * FPS)).toBe(Infinity);
        expect(refreshedWithin(undefined, 8 * FPS)).toBe(Infinity);
        expect(refreshedWithin('own', 8 * FPS)).toBeLessThanOrEqual(3 * FPS + 12);
    });

    test('on a quiet picture both refresh alike', () => {
        const count = (refresh) => {
            const selector = select.create({ width: SW, height: SH, fps: FPS, rule: 'reference', refresh });
            const luma = new Uint8ClampedArray(n).fill(100);
            let total = 0;
            for (let t = 0; t < 6 * FPS; t++) total += selector.push(luma).count;
            return total;
        };
        expect(count('own')).toBe(count('shared'));
        expect(() => select.create({ width: SW, height: SH, fps: FPS, rule: 'reference', refresh: 'other' })).toThrow(RangeError);
    });
});
