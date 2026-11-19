// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `audio.gate` (row A8a): the activity gate, by a
 * hold counter or by a peak follower.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../main.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const gate = runtime.resolve('audio.gate');

/** A frame of 128 samples of RMS `level` (a square wave of that amplitude). Powers of two: exact in float32. */
const at = (level) => new Float32Array(128).map((_, i) => (i % 2 ? level : -level));
const silence = new Float32Array(128);

describe('audio.gate', () => {
    test("the owner's values by default (D22): a counter, a threshold of 0.004, a hold of 96 frames", () => {
        const g = gate.createGate();
        expect(g.push(at(2 ** -9))).toBe(false);                    // 0.00195: under 0.004
        expect(g.push(at(2 ** -7))).toBe(true);                     // 0.0078: over it
        const held = Array.from({ length: 97 }, () => g.push(silence));
        expect(held.slice(0, 96).every(Boolean)).toBe(true);
        expect(held[96]).toBe(false);
        expect(gate.defaults).toEqual({ mode: 'counter', threshold: 0.004, hold: 96 });
    });

    test('refuses a bad parameter and an unknown mode', () => {
        expect(() => gate.createGate({ mode: 'counter', threshold: -1, hold: 4 })).toThrow(RangeError);
        expect(() => gate.createGate({ mode: 'counter', threshold: 0.01, hold: 1.5 })).toThrow(RangeError);
        expect(() => gate.createGate({ mode: 'smooth', threshold: 0.01 })).toThrow(RangeError);
        expect(() => gate.createGate({ mode: 'smooth', threshold: 0.01, release: 1 })).toThrow(RangeError);
        expect(() => gate.createGate({ mode: 'guess', threshold: 0.01, hold: 4 })).toThrow(RangeError);
    });

    test('the level of a frame is its RMS', () => {
        expect(gate.level(at(0.25))).toBe(0.25);
        expect(gate.level(silence)).toBe(0);
    });

    test('counter: shut on silence, open at once at the threshold, open for `hold` frames after the last such frame', () => {
        const g = gate.createGate({ mode: 'counter', threshold: 2 ** -7, hold: 3 });
        expect(g.push(silence)).toBe(false);
        expect(g.push(at(2 ** -8))).toBe(false);
        expect(g.push(at(2 ** -7))).toBe(true);
        expect([1, 2, 3].map(() => g.push(silence))).toEqual([true, true, true]);
        expect(g.push(silence)).toBe(false);
        // A new frame at the threshold during the hold starts it again.
        g.push(at(0.5));
        g.push(silence);
        g.push(at(2 ** -6));
        expect([1, 2, 3, 4].map(() => g.push(silence))).toEqual([true, true, true, false]);
        expect(g.counts).toEqual({ frames: 14, active: 10 });
    });

    test('smooth: open at once, open while the level released a frame at a time stays at the threshold', () => {
        const g = gate.createGate({ mode: 'smooth', threshold: 2 ** -7, release: 0.5 });
        expect(g.push(silence)).toBe(false);
        expect(g.push(at(2 ** -4))).toBe(true);
        // 2^-4 → 2^-5, 2^-6, 2^-7 (open: at the threshold), 2^-8 (shut).
        expect([1, 2, 3, 4].map(() => g.push(silence))).toEqual([true, true, true, false]);
        // A rise is followed at once.
        expect(g.push(at(0.3))).toBe(true);
        expect(g.counts).toEqual({ frames: 7, active: 5 });
    });
});

describe('audio.gate against a bad sample (pass P)', () => {
    test('a frame whose level is not a number counts as silence, and the follower is not stuck shut', () => {
        const nan = new Float32Array(128).fill(NaN);
        const smooth = gate.createGate({ mode: 'smooth', threshold: 2 ** -7, release: 0.5 });
        expect(smooth.push(nan)).toBe(false);
        expect(smooth.push(at(2 ** -4))).toBe(true);
        const counter = gate.createGate({ threshold: 2 ** -7, hold: 0 });
        counter.push(at(2 ** -4));
        expect(counter.push(nan)).toBe(false);
    });
});
