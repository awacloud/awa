// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the sparse-points experiment (row A6).
 */

import { describe, test, expect } from 'bun:test';
import { prng } from '../lib/signals.js';
import { snr } from '../lib/metrics.js';
import { points, ease } from './points.js';

const RATE = 44100;

/** A sine of `n` samples. */
function sine(freq, n, amp = 0.8) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / RATE);
    return out;
}

/** Pushes whole frames, then flushes. */
function run(codec, samples) {
    const encoder = codec.createEncoder(RATE);
    const decoder = codec.createDecoder(RATE);
    const parts = [];
    let bytes = 0;
    let count = 0;
    const gaps = [];
    const take = (list) => {
        for (const packet of list) {
            bytes += packet.length;
            for (const [gap] of codec.read(packet)) {
                gaps.push(gap);
                count++;
            }
            parts.push(...decoder.push(packet));
        }
    };
    for (let f = 0; (f + 1) * 128 <= samples.length; f++) take(encoder.push(samples.subarray(f * 128, (f + 1) * 128)));
    take(encoder.flush());
    const out = new Float32Array(parts.reduce((sum, p) => sum + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return { out, bytes, count, gaps };
}

describe('ease', () => {
    test('every transition goes from 0 to 1', () => {
        for (const family of ['sine', 'cubic', 'linear']) {
            for (const shape of ['inOut', 'in', 'out', 'line']) {
                const f = ease(family, shape);
                expect(f(0)).toBeCloseTo(0, 12);
                expect(f(1)).toBeCloseTo(1, 12);
                expect(f(0.5)).toBeGreaterThan(0);
                expect(f(0.5)).toBeLessThan(1);
            }
        }
    });

    test('the shapes are flat where a turning point sits', () => {
        const slope = (f, t) => (f(t + 1e-6) - f(t - 1e-6)) / 2e-6;
        for (const family of ['sine', 'cubic']) {
            expect(Math.abs(slope(ease(family, 'inOut'), 1e-6))).toBeLessThan(1e-3);
            expect(Math.abs(slope(ease(family, 'inOut'), 1 - 1e-6))).toBeLessThan(1e-3);
            expect(Math.abs(slope(ease(family, 'in'), 1e-6))).toBeLessThan(1e-3);
            expect(slope(ease(family, 'in'), 1 - 1e-6)).toBeGreaterThan(1);
            expect(slope(ease(family, 'out'), 1e-6)).toBeGreaterThan(1);
            expect(Math.abs(slope(ease(family, 'out'), 1 - 1e-6))).toBeLessThan(1e-3);
        }
        // The linear family ignores the shape.
        expect(ease('linear', 'inOut')(0.25)).toBe(0.25);
        expect(() => ease('bounce', 'inOut')).toThrow();
    });
});

describe('points', () => {
    const tone = sine(997, 128 * 300);

    test('after flush the decoded length is the source length', () => {
        for (const threshold of [0, 256, 4096]) {
            const { out } = run(points('p', { threshold, step: 16, family: 'sine' }), tone);
            expect(out.length).toBe(tone.length);
        }
    });

    test('no gap exceeds maxGap, and silence costs the forced points only', () => {
        const { gaps } = run(points('p', { threshold: 256, step: 16, family: 'sine', maxGap: 48 }), sine(60, 128 * 100));
        expect(Math.max(...gaps)).toBeLessThanOrEqual(48);
        const silence = run(points('p', { threshold: 256, step: 16, family: 'sine', maxGap: 64 }), new Float32Array(128 * 100));
        expect(silence.count).toBe(200);
        expect(silence.out.every((v) => v === 0)).toBe(true);
        // Per frame: a count, then two points of three nibbles each — four bytes.
        expect(silence.bytes).toBe(400);
    });

    test('a pure tone: two points a period; sine transitions beat straight lines', () => {
        const result = run(points('p', { threshold: 0, step: 1, family: 'sine' }), tone);
        const periods = (tone.length * 997) / RATE;
        expect(result.count).toBeGreaterThan(periods * 2 * 0.95);
        expect(result.count).toBeLessThan(periods * 2 * 1.05);
        const sineScore = snr(tone, result.out);
        const lineScore = snr(tone, run(points('p', { threshold: 0, step: 1, family: 'linear' }), tone).out);
        const cubicScore = snr(tone, run(points('p', { threshold: 0, step: 1, family: 'cubic' }), tone).out);
        expect(sineScore).toBeGreaterThan(20);
        expect(sineScore).toBeGreaterThan(lineScore + 5);
        expect(cubicScore).toBeGreaterThan(lineScore);
    });

    test('a threshold above the noise leaves the points of the clean tone', () => {
        // A low tone: its slope is gentle enough for a faint noise to reverse it.
        const low = sine(200, 128 * 300);
        const random = prng(9);
        const noisy = low.map((v) => v + 0.004 * (2 * random() - 1));       // about ±130 on 16 bits
        const clean = run(points('p', { threshold: 600, step: 16, family: 'sine' }), low);
        const kept = run(points('p', { threshold: 600, step: 16, family: 'sine' }), noisy);
        const all = run(points('p', { threshold: 0, step: 16, family: 'sine' }), noisy);
        expect(Math.abs(kept.count - clean.count)).toBeLessThan(clean.count * 0.1);
        expect(all.count).toBeGreaterThan(clean.count * 3);
        // What is rebuilt stays the tone, not the noise.
        expect(snr(low, kept.out)).toBeGreaterThan(15);
    });

    test('a coarser value step costs fewer bytes', () => {
        const voice = sine(180, 128 * 200).map((v, i) => v * 0.6 + 0.2 * Math.sin((2 * Math.PI * 1900 * i) / RATE));
        const fine = run(points('p', { threshold: 64, step: 1, family: 'sine' }), voice);
        const coarse = run(points('p', { threshold: 64, step: 256, family: 'sine' }), voice);
        expect(coarse.bytes).toBeLessThan(fine.bytes);
        expect(coarse.count).toBe(fine.count);
    });

    test('a bad configuration or a cut packet is refused', () => {
        expect(() => points('p', { threshold: -1, step: 16, family: 'sine' })).toThrow();
        expect(() => points('p', { threshold: 0, step: 3, family: 'sine' })).toThrow();
        expect(() => points('p', { threshold: 0, step: 16, family: 'sine', maxGap: 1 })).toThrow();
        const codec = points('p', { threshold: 0, step: 16, family: 'sine' });
        const packet = codec.createEncoder(RATE).push(tone.subarray(0, 128))[0];
        expect(() => codec.createDecoder(RATE).push(packet.subarray(0, 1))).toThrow();
    });
});
