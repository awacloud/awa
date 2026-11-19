// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `audio.codec` (row A7): the retained codec, its
 * two shapes, its options and presets.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../main.js';
import { signals } from '../../bench/lib/signals.js';
import { snr } from '../../bench/lib/metrics.js';

const RATE = 44100;
const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const codec = runtime.resolve('audio.codec');
const fir = runtime.resolve('audio.fir');
const resample = runtime.resolve('audio.resample');
const wavelet = runtime.resolve('audio.wavelet');
const [tone, , , voiced] = signals({ rate: RATE, seconds: 2, seed: 5 }).map((s) => s.samples);

/** Encodes and decodes `x` frame by frame. */
function run(x, config, decoderConfig = {}, onFrame = () => {}) {
    const encoder = codec.createEncoder({ rate: RATE, ...config });
    const decoder = codec.createDecoder({ rate: RATE, ...decoderConfig });
    const out = new Float32Array(x.length);
    let bytes = 0;
    let at = 0;
    for (let f = 0; (f + 1) * 128 <= x.length; f++) {
        onFrame(encoder, f);
        for (const packet of encoder.push(x.subarray(f * 128, (f + 1) * 128))) {
            bytes += packet.length;
            for (const frame of decoder.push(packet)) {
                expect(frame.length).toBe(128);
                out.set(frame, at);
                at += frame.length;
            }
        }
    }
    expect(at).toBe(x.length);
    return { out, bytes };
}

describe('audio.codec', () => {
    test('the presets are starting points, each a set of options', () => {
        expect(codec.presets).toEqual({
            voice: { decimation: 4, bits: 6, soft: true },
            'voice-low': { decimation: 4, bits: 5, soft: true },
            music: { decimation: 2, bits: 9, soft: false },
            full: { decimation: 1, bits: 9, soft: false },
            'full-low': { decimation: 1, bits: 7, soft: false },
            'full-fixed': { decimation: 1, step: 64, soft: false },
        });
    });

    test('every preset gives the signal back, at its delay', () => {
        for (const preset of Object.keys(codec.presets)) {
            const { out } = run(voiced, { preset });
            const delay = codec.delay({ preset });
            const aligned = snr(voiced, out, { delay });
            expect(aligned).toBeGreaterThan(preset === 'full' ? 40 : 10);
            if (delay > 0) {
                expect(aligned).toBeGreaterThan(snr(voiced, out, { delay: delay + 1 }));
                expect(aligned).toBeGreaterThan(snr(voiced, out, { delay: delay - 1 }));
            }
        }
        expect(codec.delay({ preset: 'full' })).toBe(0);
        expect(codec.delay({ preset: 'voice' })).toBe(24 + 3 + 24);
        expect(codec.delay({ preset: 'music' })).toBe(24 + 1);
    });

    test('the voice preset is the cascade the owner listened to, sample for sample', () => {
        // The bench composition of rows A4b and A4d: 8k filter, ÷4, 5/3 wavelet at 6 bits, cosine, softening.
        const filter = fir.create(fir.taps('8k'));
        const decimate = resample.decimator(4);
        const encoder = wavelet.createEncoder({ kind: 'lift53', levels: 3, step: { bits: 6 }, baseStep: { bits: 8 }, coding: 'nibbles', frame: 32 });
        const decoder = wavelet.createDecoder({ frame: 32 });
        const interpolate = resample.interpolator(4, { mode: 'cosine' });
        const soften = fir.create(fir.taps('8k'));
        const expected = new Float32Array(voiced.length);
        for (let f = 0; (f + 1) * 128 <= voiced.length; f++) {
            const packet = encoder.push(decimate.push(filter.push(voiced.subarray(f * 128, (f + 1) * 128))))[0];
            expected.set(soften.push(interpolate.push(decoder.push(packet)[0])), f * 128);
        }
        expect(run(voiced, { preset: 'voice' }).out).toEqual(expected);
    });

    test('options override a preset; fewer bits cost fewer bytes', () => {
        const six = run(voiced, { preset: 'voice' });
        const five = run(voiced, { preset: 'voice', bits: 5 });
        const low = run(voiced, { preset: 'voice-low' });
        expect(five.bytes).toBeLessThan(six.bytes);
        expect(five.out).toEqual(low.out);
        const wide = run(voiced, { preset: 'voice', decimation: 2 });
        expect(wide.bytes).toBeGreaterThan(six.bytes);
    });

    test('the softening is the decoder’s choice and changes no byte', () => {
        const soft = run(tone, { preset: 'voice' });
        const plain = run(tone, { preset: 'voice' }, { soft: false });
        expect(plain.bytes).toBe(soft.bytes);
        expect(plain.out).not.toEqual(soft.out);
        // The encoder's wish travels in the packet; the decoder may overrule it.
        const forced = run(tone, { preset: 'music' }, { soft: true });
        expect(forced.out).not.toEqual(run(tone, { preset: 'music' }).out);
    });

    test('the bits change while the stream runs and the decoder follows', () => {
        const { out, bytes } = run(voiced, { preset: 'music' }, {}, (encoder, f) => { if (f === 300) encoder.setBits(5); });
        const high = run(voiced, { preset: 'music' });
        expect(bytes).toBeLessThan(high.bytes);
        const delay = codec.delay({ preset: 'music' });
        expect(snr(voiced, out, { delay })).toBeGreaterThan(10);
        expect(out.subarray(0, 128 * 290)).toEqual(high.out.subarray(0, 128 * 290));
    });

    test('a level 24 dB lower keeps its quality', () => {
        const delay = codec.delay({ preset: 'voice' });
        const stretch = voiced.subarray(1280, 1280 + 128 * 40);
        const quiet = stretch.map((v) => v / 16);
        const loud = snr(stretch, run(stretch, { preset: 'voice' }).out, { delay });
        const soft = snr(quiet, run(quiet, { preset: 'voice' }).out, { delay });
        expect(Math.abs(loud - soft)).toBeLessThan(3);
    });

    test('a bad configuration or packet is refused', () => {
        expect(() => codec.createEncoder({ rate: 32000, preset: 'voice' })).toThrow();
        expect(() => codec.createEncoder({ rate: RATE, preset: 'radio' })).toThrow();
        expect(() => codec.createEncoder({ rate: RATE, decimation: 3 })).toThrow();
        expect(() => codec.createEncoder({ rate: RATE, bits: 0 })).toThrow();
        const encoder = codec.createEncoder({ rate: RATE, preset: 'voice' });
        expect(() => encoder.push(new Float32Array(100))).toThrow();
        expect(() => encoder.setBits(40)).toThrow();
        const packet = encoder.push(new Float32Array(128))[0];
        const decoder = codec.createDecoder({ rate: RATE });
        expect(() => decoder.push(packet.subarray(0, 1))).toThrow();
        expect(() => decoder.push(Uint8Array.from([0xf0, 0, 0]))).toThrow();
        expect(() => codec.createDecoder({ rate: 32000 })).toThrow();
    });
});
