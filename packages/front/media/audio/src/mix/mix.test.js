// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `audio.mix` (row A9): a mixer of frames, four ways.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../main.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const mix = runtime.resolve('audio.mix');

const f32 = (values) => Float32Array.from(values);

describe('audio.mix', () => {
    test('the limiter by default (D23); refuses an unknown mode and frames of different lengths; no frame is silence', () => {
        expect(mix.createMixer().mode).toBe('limit');
        expect(mix.createMixer({ mode: 'sum' }).mode).toBe('sum');
        expect(() => mix.createMixer({ mode: 'guess' })).toThrow(RangeError);
        const mixer = mix.createMixer({ mode: 'sum' });
        expect(() => mixer.mix([new Float32Array(128), new Float32Array(64)])).toThrow(RangeError);
        expect(mixer.mix([])).toEqual(new Float32Array(128));
    });

    test('sum: the samples added, cut at full scale, the cut ones counted', () => {
        const mixer = mix.createMixer({ mode: 'sum' });
        expect(mixer.mix([f32([0.25, -0.5, 0.75, -0.75]), f32([0.5, -0.25, 0.5, -0.5])])).toEqual(f32([0.75, -0.75, 1, -1]));
        expect(mixer.counts).toEqual({ frames: 1, cut: 2 });
    });

    test('envelope: the sum held between the lowest and the highest channel value — the lowest from the values (a4)', () => {
        const mixer = mix.createMixer({ mode: 'envelope' });
        // Sample 0: both positive, the sum 0.75 held to the highest, 0.5. Sample 1: of opposite signs, the
        // sum 0.25 lies between -0.25 and 0.5: kept. Sample 2: both negative, -0.75 held to the lowest, -0.5.
        // With the R&D's line (the minimum taken from the maxima) sample 1 would be held up to 0.5.
        expect(mixer.mix([f32([0.25, 0.5, -0.25]), f32([0.5, -0.25, -0.5])])).toEqual(f32([0.5, 0.25, -0.5]));
    });

    test('average: the sum over the number of channels', () => {
        const mixer = mix.createMixer({ mode: 'average' });
        expect(mixer.mix([f32([0.5, -1]), f32([0.25, 0.5]), f32([0.75, 0])])).toEqual(f32([0.5, -0.5 / 3]));
    });

    test('limit: a quiet mix passes as it is; a loud one stays under full scale; the gain comes back by `release` a frame', () => {
        const mixer = mix.createMixer({ mode: 'limit', release: 0.5 });
        const quiet = f32([0.25, -0.25, 0.125, 0]);
        expect(mixer.mix([quiet, quiet])).toEqual(f32([0.5, -0.5, 0.25, 0]));
        const loud = mixer.mix([f32([1, 0.5, -1, 0]), f32([1, 0.5, -1, 0])]);
        expect(Math.max(...loud.map(Math.abs))).toBeLessThanOrEqual(1);
        expect(loud).toEqual(f32([1, 0.5, -1, 0]));                      // the peak 2 turned down by half
        expect(mixer.gain).toBe(0.5);
        // The next frames, quiet: the gain comes back halfway to 1 each frame (0.75, then 0.875).
        expect(mixer.mix([quiet, quiet])).toEqual(f32([0.375, -0.375, 0.1875, 0]));
        expect(mixer.gain).toBe(0.75);
        mixer.mix([quiet, quiet]);
        expect(mixer.gain).toBe(0.875);
        expect(() => mix.createMixer({ mode: 'limit', release: 1 })).toThrow(RangeError);
    });

    test('gives a new array and leaves the inputs as they were (a5)', () => {
        for (const mode of ['sum', 'envelope', 'average', 'limit']) {
            const a = f32([0.25, 0.5]);
            const b = f32([0.5, -0.25]);
            const out = mix.createMixer({ mode }).mix([a, b]);
            expect(out).not.toBe(a);
            expect(out).not.toBe(b);
            expect(a).toEqual(f32([0.25, 0.5]));
            expect(b).toEqual(f32([0.5, -0.25]));
        }
    });
});

describe('audio.mix with no channel (pass P)', () => {
    test('no frame gives silence of the last length, and the limiter still comes back', () => {
        const mixer = mix.createMixer({ mode: 'limit', release: 0.5 });
        mixer.mix([f32([1, 1, 1, 1]), f32([1, 1, 1, 1])]);
        expect(mixer.gain).toBe(0.5);
        expect(mixer.mix([])).toEqual(new Float32Array(4));
        expect(mixer.gain).toBe(0.75);
    });
});
