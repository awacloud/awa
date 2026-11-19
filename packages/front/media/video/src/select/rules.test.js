// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the three selection rules side by side (row V6):
 * what each guarantees, and what it does not.
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
const set = sequences({ width: W, height: H, frames: 200, fps: FPS, seed: 3 });

/**
 * Runs a rule over frames of planes and keeps what a decoder would show.
 * @returns {{ counts: number[], worst: number[] }} Per frame: pixels sent, and the largest luma gap between the source and the decoder's picture.
 */
function run(rule, frames, planesOf, options = {}) {
    const selector = select.create({ width: W, height: H, fps: FPS, rule, ...options });
    const shown = new Int16Array(W * H).fill(-1000);
    const counts = [];
    const worst = [];
    for (let t = 0; t < frames; t++) {
        const [red, luma, blue] = planesOf(t);
        const { mask, count } = selector.push(luma, [red, blue]);
        let gap = 0;
        for (let i = 0; i < mask.length; i++) {
            if (mask[i]) shown[i] = luma[i];
            const d = Math.abs(luma[i] - shown[i]);
            if (d > gap) gap = d;
        }
        counts.push(count);
        worst.push(gap);
    }
    return { counts, worst };
}

const planes = (sequence) => (t) => color.forward(sequence.frame(t));

/** A picture that brightens by one level every third frame: too slow for a frame-to-frame test. */
function drift(t) {
    const luma = new Uint8ClampedArray(W * H).fill(60 + Math.floor(t / 3));
    const flat = new Uint8ClampedArray(W * H).fill(127);
    return [flat, luma, flat];
}

describe('video.select rules', () => {
    test('the three rules are listed; an unknown one is refused', () => {
        expect(select.rules).toEqual(['history', 'complete', 'reference']);
        expect(() => select.create({ width: W, height: H, fps: FPS, rule: 'motion' })).toThrow();
        expect(() => select.create({ width: W, height: H, fps: FPS, thresholds: [[1, 1, 1]] })).toThrow();
    });

    test('every rule sends everything first, then nothing on a still scene', () => {
        for (const rule of select.rules) {
            const { counts } = run(rule, 20, planes(set[0]));
            expect(counts[0]).toBe(W * H);
            for (let t = 4; t < 20; t++) expect(counts[t]).toBe(0);
        }
    });

    test('complete: a pixel that does not move at all is never sent again', () => {
        // The due pixels come back on a complete frame only if they moved: on a
        // perfectly still scene nothing is ever refreshed, so a lost packet stays lost.
        const { counts } = run('complete', 200, planes(set[0]));
        for (let t = 4; t < 200; t++) expect(counts[t]).toBe(0);
        // The two other rules refresh.
        expect(run('history', 200, planes(set[0])).counts.slice(4).some((c) => c > 0)).toBe(true);
        expect(run('reference', 200, planes(set[0])).counts.slice(4).some((c) => c > 0)).toBe(true);
    });

    test('reference: the picture shown never strays beyond the threshold', () => {
        for (const planesOf of [planes(set[1]), planes(set[2]), drift]) {
            const { worst } = run('reference', 120, planesOf);
            for (let t = 0; t < 120; t++) expect(worst[t]).toBeLessThanOrEqual(5);
        }
    });

    test('a slow drift escapes the history rules until the refresh, not the reference rule', () => {
        const history = run('history', 60, drift);
        const complete = run('complete', 60, drift);
        const reference = run('reference', 60, drift);
        expect(Math.max(...history.worst.slice(4))).toBeGreaterThan(5);
        expect(Math.max(...complete.worst.slice(4))).toBeGreaterThan(5);
        expect(Math.max(...reference.worst.slice(4))).toBeLessThanOrEqual(5);
    });

    test('reference with colour: a change of colour at equal luma is sent', () => {
        // Two flat pictures of the same luma, different colour differences.
        const luma = new Uint8ClampedArray(W * H).fill(120);
        const a = [new Uint8ClampedArray(W * H).fill(127), luma, new Uint8ClampedArray(W * H).fill(127)];
        const b = [new Uint8ClampedArray(W * H).fill(150), luma, new Uint8ClampedArray(W * H).fill(100)];
        const flip = (t) => (t < 10 ? a : b);
        expect(run('reference', 12, flip, { chroma: true }).counts[10]).toBe(W * H);
        expect(run('reference', 12, flip).counts[10]).toBe(0);
        expect(run('history', 12, flip).counts[10]).toBe(0);
        const selector = select.create({ width: W, height: H, fps: FPS, rule: 'reference', chroma: true });
        expect(() => selector.push(luma)).toThrow();
    });

    test('under camera noise the reference rule sends less than the history rule', () => {
        const total = (rule, options) => run(rule, 60, planes(set[2]), options).counts.slice(8).reduce((sum, c) => sum + c, 0);
        expect(total('reference')).toBeLessThan(total('history'));
    });
});
