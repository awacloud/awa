// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `video.motion` (row V12): content that only
 * moves — one vector for the frame, tiles that follow it or not.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences } from '../../bench/lib/sequences.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const color = runtime.resolve('video.color');
const motion = runtime.resolve('video.motion');
const select = runtime.resolve('video.select');

const W = 128;
const H = 96;
const set = sequences({ width: W, height: H, frames: 40, fps: 24, seed: 3 });
const byName = Object.fromEntries(set.map((s) => [s.name, s]));
const lumaOf = (sequence, t) => color.forward(sequence.frame(t))[1];

describe('video.motion', () => {
    test('a page that scrolls is one vector for the whole frame', () => {
        const s = byName.scroll;
        const found = motion.estimate(lumaOf(s, 6), lumaOf(s, 5), W, H);
        expect(found.moved).toBe(true);
        expect([found.dx, found.dy]).toEqual([0, -s.pixelsPerFrame]);
        expect(found.tiles).toBeNull();
    });

    test('a still scene, moving shapes and a scene cut are not a move', () => {
        expect(motion.estimate(lumaOf(byName.static, 6), lumaOf(byName.static, 5), W, H).moved).toBe(false);
        expect(motion.estimate(lumaOf(byName.shapes, 6), lumaOf(byName.shapes, 5), W, H).moved).toBe(false);
        expect(motion.estimate(lumaOf(byName.cut, 20), lumaOf(byName.cut, 19), W, H).moved).toBe(false);
    });

    test('apply moves the content; what is uncovered keeps its old value', () => {
        const plane = Uint8ClampedArray.from({ length: W * H }, (_, i) => (i * 7) % 251);
        const moved = motion.apply(plane, W, H, { dx: 3, dy: -2, tiles: null, tile: 0, moved: true });
        expect(moved).toBeInstanceOf(Uint8ClampedArray);
        expect(moved).not.toBe(plane);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const sx = x - 3;
                const sy = y + 2;
                const expected = sx >= 0 && sx < W && sy >= 0 && sy < H ? plane[sy * W + sx] : plane[y * W + x];
                if (moved[y * W + x] !== expected) throw new Error(`pixel ${x},${y}`);
            }
        }
        const kept = motion.apply(new Int16Array(plane), W, H, { dx: 0, dy: 0, tiles: null, tile: 0, moved: false });
        expect(kept).toBeInstanceOf(Int16Array);
        expect(Array.from(kept)).toEqual(Array.from(plane));
    });

    test('after the move, a scrolled page differs only where new content came in', () => {
        const s = byName.scroll;
        const before = lumaOf(s, 5);
        const now = lumaOf(s, 6);
        const found = motion.estimate(now, before, W, H);
        const moved = motion.apply(before, W, H, found);
        let differing = 0;
        for (let i = 0; i < now.length; i++) if (moved[i] !== now[i]) differing++;
        // Two new lines at the bottom, at most.
        expect(differing).toBeLessThanOrEqual(W * s.pixelsPerFrame);
        let plain = 0;
        for (let i = 0; i < now.length; i++) if (before[i] !== now[i]) plain++;
        expect(plain).toBeGreaterThan(differing * 10);
    });

    test('with tiles, a panel that scrolls beside a still area moves alone', () => {
        const s = byName.panel;
        const found = motion.estimate(lumaOf(s, 6), lumaOf(s, 5), W, H, { tile: 16 });
        expect(found.moved).toBe(true);
        expect([found.dx, found.dy]).toEqual([0, -s.pixelsPerFrame]);
        const across = Math.ceil(W / 16);
        expect(found.tiles.length).toBe(across * Math.ceil(H / 16));
        // Tiles wholly in the still part do not move; tiles wholly in the panel do.
        for (let ty = 0; ty < Math.ceil(H / 16) - 1; ty++) {
            for (let tx = 0; tx < across; tx++) {
                const flag = found.tiles[ty * across + tx];
                if ((tx + 1) * 16 <= s.panelLeft) expect(flag).toBe(0);
                if (tx * 16 >= s.panelLeft) expect(flag).toBe(1);
            }
        }
        const before = lumaOf(s, 5);
        const now = lumaOf(s, 6);
        const moved = motion.apply(before, W, H, found);
        let differing = 0;
        for (let i = 0; i < now.length; i++) if (moved[i] !== now[i]) differing++;
        expect(differing).toBeLessThan(W * H * 0.06);
    });

    test('a selector follows a move: nothing but the new content is sent', () => {
        const s = byName.scroll;
        const run = (follow) => {
            const selector = select.create({ width: W, height: H, fps: 24, rule: 'reference' });
            let sent = 0;
            for (let t = 0; t < 12; t++) {
                const luma = lumaOf(s, t);
                if (follow && t > 0) {
                    const found = motion.estimate(luma, selector.reference(), W, H);
                    if (found.moved) selector.remap((plane) => motion.apply(plane, W, H, found));
                }
                const { count } = selector.push(luma);
                if (t > 0) sent += count;
            }
            return sent;
        };
        expect(run(true)).toBeLessThan(run(false) / 10);
    });

    test('bad arguments are refused', () => {
        expect(() => motion.estimate(new Uint8ClampedArray(10), new Uint8ClampedArray(W * H), W, H)).toThrow();
        expect(() => motion.estimate(lumaOf(byName.scroll, 1), lumaOf(byName.scroll, 0), W, H, { tile: 3 })).toThrow();
        expect(() => motion.estimate(lumaOf(byName.scroll, 1), lumaOf(byName.scroll, 0), W, H, { range: 0 })).toThrow();
    });
});
