// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the decoder's concealment of a lost packet
 * (row B1c): `createDecoder({ conceal })` and `decoder.lose()`.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../main.js';
import { signals } from '../../bench/lib/signals.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const codec = runtime.resolve('audio.codec');
const [, , , voiced] = signals({ rate: 48000, seconds: 1, seed: 9 }).map((s) => s.samples);

/** The packets of `count` frames. */
function packets(preset, count = 40) {
    const encoder = codec.createEncoder({ rate: 48000, preset });
    const out = [];
    for (let f = 0; f < count; f++) out.push(...encoder.push(voiced.subarray(f * 128, (f + 1) * 128)));
    return out;
}

const zeros = new Float32Array(128);

describe('audio.codec concealment', () => {
    test('a decoder conceals with silence by default, and refuses an unknown mode', () => {
        const decoder = codec.createDecoder();
        expect(decoder.lose()).toEqual([zeros]);
        for (const p of packets('voice', 3)) decoder.push(p);
        expect(decoder.lose()).toEqual([zeros]);
        expect(() => codec.createDecoder({ conceal: 'guess' })).toThrow(RangeError);
    });

    test('repeat gives the last frame again, at every loss in a row', () => {
        const decoder = codec.createDecoder({ conceal: 'repeat' });
        expect(decoder.lose()).toEqual([zeros]);
        let last = null;
        for (const p of packets('music', 5)) last = decoder.push(p)[0];
        const first = decoder.lose()[0];
        expect(first).toEqual(last);
        expect(first).not.toBe(last);                 // a copy: the caller may transfer it
        expect(decoder.lose()[0]).toEqual(last);
    });

    test('fade fades the last frame out, then gives zeros, then fades the next good frame in', () => {
        const list = packets('full-low', 12);
        const decoder = codec.createDecoder({ conceal: 'fade' });
        const plain = codec.createDecoder();
        let last = null;
        for (let k = 0; k < 8; k++) {
            last = decoder.push(list[k])[0];
            plain.push(list[k]);
        }
        const out = decoder.lose()[0];
        for (let i = 0; i < 128; i++) expect(out[i]).toBeCloseTo(last[i] * (1 - (i + 1) / 128), 6);
        expect(out[127]).toBe(0);
        expect(decoder.lose()).toEqual([zeros]);
        const back = decoder.push(list[10])[0];
        const reference = plain.push(list[10])[0];
        for (let i = 0; i < 32; i++) expect(back[i]).toBeCloseTo(reference[i] * ((i + 1) / 32), 6);
        expect(back.subarray(32)).toEqual(reference.subarray(32));
        // The frame after is untouched.
        expect(decoder.push(list[11])[0]).toEqual(plain.push(list[11])[0]);
    });

    describe('extend (row B1d)', () => {
        // A 500 Hz tone at 48 kHz: a period of 96 samples.
        const tone = new Float32Array(128 * 40).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 500 * i) / 48000));
        const tonePackets = (() => {
            const encoder = codec.createEncoder({ rate: 48000, preset: 'full' });
            const out = [];
            for (let f = 0; f < 40; f++) out.push(...encoder.push(tone.subarray(f * 128, (f + 1) * 128)));
            return out;
        })();
        const snr = (truth, got) => {
            let s = 0;
            let n = 0;
            for (let i = 0; i < truth.length; i++) {
                s += truth[i] * truth[i];
                n += (truth[i] - got[i]) ** 2;
            }
            return 10 * Math.log10(s / n);
        };
        const peak = (frame) => frame.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

        test('is accepted; silence stays the default; nothing held gives zeros', () => {
            const decoder = codec.createDecoder({ conceal: 'extend' });
            expect(decoder.lose()).toEqual([zeros]);
            expect(codec.createDecoder().lose()).toEqual([zeros]);
        });

        test('continues a periodic signal across a lost frame: only the gain ramp differs', () => {
            const decoder = codec.createDecoder({ conceal: 'extend' });
            const plain = codec.createDecoder();
            for (let k = 0; k < 10; k++) {
                decoder.push(tonePackets[k]);
                plain.push(tonePackets[k]);
            }
            const filled = decoder.lose()[0];
            const truth = plain.push(tonePackets[10])[0];
            expect(snr(truth, filled)).toBeGreaterThan(15);
            // A repeat of the frame would not line up: 128 is not a multiple of the period.
            const repeat = codec.createDecoder({ conceal: 'repeat' });
            for (let k = 0; k < 10; k++) repeat.push(tonePackets[k]);
            expect(snr(truth, repeat.lose()[0])).toBeLessThan(snr(truth, filled));
        });

        test('losses in a row fall a fifth a frame, then silence', () => {
            const decoder = codec.createDecoder({ conceal: 'extend' });
            for (let k = 0; k < 10; k++) decoder.push(tonePackets[k]);
            const run = Array.from({ length: 7 }, () => decoder.lose()[0]);
            const peaks = run.map(peak);
            expect(peaks[0]).toBeGreaterThan(0.45);
            for (let k = 1; k < 5; k++) expect(peaks[k]).toBeLessThan(peaks[k - 1]);
            expect(peaks[4]).toBeLessThan(0.11);
            expect(run[5]).toEqual(zeros);
            expect(run[6]).toEqual(zeros);
        });

        test('the frame after a hole crossfades from the continuation into the decoded frame', () => {
            const decoder = codec.createDecoder({ conceal: 'extend' });
            const never = codec.createDecoder();
            for (let k = 0; k < 10; k++) {
                decoder.push(tonePackets[k]);
                never.push(tonePackets[k]);
            }
            const filled = decoder.lose()[0];
            const back = decoder.push(tonePackets[11])[0];
            const reference = never.push(tonePackets[11])[0];
            // No step at the seam: the tone moves at most 0.033 a sample.
            expect(Math.abs(back[0] - filled[127])).toBeLessThan(0.1);
            expect(back.subarray(64)).toEqual(reference.subarray(64));
            // The stages untouched: the frame after is the decoder's own.
            expect(decoder.push(tonePackets[12])).toEqual(never.push(tonePackets[12]));
        });
    });

    test('a loss reaches no further: the next packets decode as if the lost one had never come', () => {
        for (const preset of ['voice', 'music', 'full-low']) {
            for (const conceal of ['silence', 'repeat']) {
                const list = packets(preset, 30);
                const lossy = codec.createDecoder({ conceal });
                const never = codec.createDecoder();
                for (let k = 0; k < 30; k++) {
                    if (k === 12 || k === 20 || k === 21) {
                        lossy.lose();
                        continue;
                    }
                    expect(lossy.push(list[k])).toEqual(never.push(list[k]));
                }
            }
        }
    });

    test('the encoder and the stream are unchanged by a concealing decoder', () => {
        const a = packets('voice', 20);
        const b = packets('voice', 20);
        expect(a).toEqual(b);
        const plain = codec.createDecoder();
        const fading = codec.createDecoder({ conceal: 'fade' });
        for (const p of a) expect(fading.push(p)).toEqual(plain.push(p));
    });
});

describe('audio.codec presets (pass P)', () => {
    test('the presets given out cannot be changed under every later encoder', () => {
        expect(Object.isFrozen(codec.presets)).toBe(true);
        expect(Object.isFrozen(codec.presets.voice)).toBe(true);
        expect(() => { 'use strict'; codec.presets.voice.bits = 3; }).toThrow(TypeError);
    });
});
