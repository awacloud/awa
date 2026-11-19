// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the two full-band settings the owner retained
 * after listening set 5 (row A7b): 7 bits under the peak, and the fixed
 * step of 64.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../main.js';
import { signals } from '../../bench/lib/signals.js';

const RATE = 44100;
const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const codec = runtime.resolve('audio.codec');
const wavelet = runtime.resolve('audio.wavelet');
const [, , , voiced] = signals({ rate: RATE, seconds: 2, seed: 5 }).map((s) => s.samples);

/** Encodes and decodes `x` frame by frame. */
function run(x, config, onFrame = () => {}) {
    const encoder = codec.createEncoder({ rate: RATE, ...config });
    const decoder = codec.createDecoder({ rate: RATE });
    const out = new Float32Array(x.length);
    let bytes = 0;
    for (let f = 0; (f + 1) * 128 <= x.length; f++) {
        onFrame(encoder, f);
        const packet = encoder.push(x.subarray(f * 128, (f + 1) * 128))[0];
        bytes += packet.length;
        out.set(decoder.push(packet)[0], f * 128);
    }
    return { out, bytes };
}

describe('audio.codec retained full-band settings', () => {
    test('two presets carry them', () => {
        expect(codec.presets['full-low']).toEqual({ decimation: 1, bits: 7, soft: false });
        expect(codec.presets['full-fixed']).toEqual({ decimation: 1, step: 64, soft: false });
        expect(codec.delay({ preset: 'full-low' })).toBe(0);
        expect(codec.delay({ preset: 'full-fixed' })).toBe(0);
    });

    test('full-low is the full band at 7 bits the owner listened to', () => {
        const low = run(voiced, { preset: 'full-low' });
        expect(low.out).toEqual(run(voiced, { preset: 'full', bits: 7 }).out);
        expect(low.bytes).toBeLessThan(run(voiced, { preset: 'full' }).bytes);
    });

    test('full-fixed is the wavelet at a fixed step of 64 he listened to, sample for sample', () => {
        // The bench codec `lift5-q64-nib`.
        const encoder = wavelet.createEncoder({ kind: 'lift53', levels: 5, step: 64, coding: 'nibbles' });
        const decoder = wavelet.createDecoder();
        const expected = new Float32Array(voiced.length);
        let bytes = 0;
        for (let f = 0; (f + 1) * 128 <= voiced.length; f++) {
            const packet = encoder.push(voiced.subarray(f * 128, (f + 1) * 128))[0];
            bytes += packet.length + 1;
            expected.set(decoder.push(packet)[0], f * 128);
        }
        const fixed = run(voiced, { preset: 'full-fixed' });
        expect(fixed.out).toEqual(expected);
        expect(fixed.bytes).toBe(bytes);
    });

    test('a fixed step is an option of every shape; the last of step and bits given wins over the preset', () => {
        const coarse = run(voiced, { preset: 'full-fixed', step: 256 });
        expect(coarse.bytes).toBeLessThan(run(voiced, { preset: 'full-fixed' }).bytes);
        expect(run(voiced, { preset: 'voice', step: 64 }).bytes).toBeGreaterThan(0);
        // Bits given on a fixed-step preset: the step follows the level again.
        expect(run(voiced, { preset: 'full-fixed', bits: 7 }).out).toEqual(run(voiced, { preset: 'full-low' }).out);
        expect(run(voiced, { preset: 'full', step: 64 }).out).toEqual(run(voiced, { preset: 'full-fixed' }).out);
    });

    test('the step changes while the stream runs, and back to bits', () => {
        const switched = run(voiced, { preset: 'full-low' }, (encoder, f) => {
            if (f === 100) encoder.setStep(64);
            if (f === 200) encoder.setBits(7);
        });
        const low = run(voiced, { preset: 'full-low' }).out;
        const fixed = run(voiced, { preset: 'full-fixed' }).out;
        expect(switched.out.subarray(0, 100 * 128)).toEqual(low.subarray(0, 100 * 128));
        expect(switched.out.subarray(100 * 128, 200 * 128)).toEqual(fixed.subarray(100 * 128, 200 * 128));
        expect(switched.out.subarray(200 * 128, 300 * 128)).toEqual(low.subarray(200 * 128, 300 * 128));
    });

    test('a bad step is refused', () => {
        for (const step of [0, 3, 48, 65536, -64, 1.5]) {
            expect(() => codec.createEncoder({ preset: 'full', step })).toThrow(RangeError);
        }
        expect(() => codec.createEncoder({ preset: 'full', step: 64, bits: 7 })).toThrow(RangeError);
        expect(() => codec.createEncoder({ preset: 'full' }).setStep(3)).toThrow(RangeError);
    });
});
