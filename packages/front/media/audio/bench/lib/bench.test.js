// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the audio bench: signals, metrics, WAV, harness and
 * the three reference codecs (row A2 of the media-codecs lane).
 */

import { describe, test, expect } from 'bun:test';
import { signals, FRAME } from './signals.js';
import { snr, segmentalSnr } from './metrics.js';
import { encodeWav, decodeWav } from './wav.js';
import { runCodec } from './harness.js';
import { identity, pcm16, pcm8 } from './reference.js';

const RATE = 44100;
const SECONDS = 2;

/** Theoretical SNR of a full-scale sine through a uniform quantiser. */
const theoretical = (bits) => 6.02 * bits + 1.76;

/**
 * Uniform mid-tread quantiser on [-1, 1].
 * @param {Float32Array} x
 * @param {number} bits
 * @returns {Float32Array}
 */
function quantise(x, bits) {
    const scale = 2 ** (bits - 1) - 1;
    return x.map((v) => Math.round(v * scale) / scale);
}

describe('signals', () => {
    const set = signals({ rate: RATE, seconds: SECONDS, seed: 7 });

    test('the set names the five signals', () => {
        expect(set.map((s) => s.name)).toEqual(['tone', 'sweep', 'noise', 'voiced', 'voiced-noisy']);
    });

    test('every signal is a whole number of frames within [-1, 1]', () => {
        for (const { name, samples } of set) {
            expect(samples).toBeInstanceOf(Float32Array);
            expect(samples.length % FRAME).toBe(0);
            expect(samples.length).toBe(Math.floor((RATE * SECONDS) / FRAME) * FRAME);
            let peak = 0;
            for (const v of samples) peak = Math.max(peak, Math.abs(v));
            expect(peak, name).toBeLessThanOrEqual(1);
            expect(peak, name).toBeGreaterThan(0.1);
        }
    });

    test('the same seed gives the same samples, another seed other noise', () => {
        const again = signals({ rate: RATE, seconds: SECONDS, seed: 7 });
        const other = signals({ rate: RATE, seconds: SECONDS, seed: 8 });
        for (let i = 0; i < set.length; i++) expect(again[i].samples).toEqual(set[i].samples);
        expect(other[2].samples).not.toEqual(set[2].samples);
        expect(other[0].samples).toEqual(set[0].samples);
    });

    test('the voiced signal has silences between its bursts', () => {
        const { samples } = set[3];
        let silent = 0;
        const frames = samples.length / FRAME;
        for (let f = 0; f < frames; f++) {
            let energy = 0;
            for (let i = 0; i < FRAME; i++) energy += samples[f * FRAME + i] ** 2;
            if (energy === 0) silent++;
        }
        expect(silent / frames).toBeGreaterThan(0.15);
        expect(silent / frames).toBeLessThan(0.6);
    });
});

describe('metrics', () => {
    const tone = signals({ rate: RATE, seconds: SECONDS, seed: 1 })[0].samples;

    test('snr is infinite on identical signals', () => {
        expect(snr(tone, tone)).toBe(Infinity);
    });

    test('snr matches the theory of a uniform quantiser', () => {
        // The tone is full scale by construction.
        expect(Math.abs(snr(tone, quantise(tone, 8)) - theoretical(8))).toBeLessThan(0.5);
        expect(Math.abs(snr(tone, quantise(tone, 16)) - theoretical(16))).toBeLessThan(0.5);
    });

    test('a declared delay is compensated', () => {
        const delay = 48;
        const late = new Float32Array(tone.length);
        late.set(tone.subarray(0, tone.length - delay), delay);
        expect(snr(tone, late)).toBeLessThan(10);
        expect(snr(tone, late, { delay })).toBe(Infinity);
    });

    test('segmental snr clamps each frame and skips silent reference frames', () => {
        const ref = new Float32Array(FRAME * 4);
        const out = new Float32Array(FRAME * 4);
        for (let i = 0; i < FRAME; i++) {
            const v = Math.sin((2 * Math.PI * i) / 16);
            ref[i] = v;                 // frame 0: exact → clamped to 35
            out[i] = v;
            ref[FRAME + i] = v;         // frame 1: decoded as zero → 0 dB
            ref[3 * FRAME + i] = v;     // frame 3: inverted → -6 dB
            out[3 * FRAME + i] = -v;
        }                               // frame 2: silent reference → skipped
        expect(segmentalSnr(ref, out)).toBeCloseTo((35 + 0 - 6.0206) / 3, 3);
    });
});

describe('wav', () => {
    test('a 16-bit mono file round-trips within one quantisation step', () => {
        const samples = signals({ rate: RATE, seconds: 1, seed: 3 })[1].samples;
        const bytes = encodeWav(samples, RATE);
        const view = new DataView(bytes.buffer);
        expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
        expect(view.getUint32(4, true)).toBe(bytes.length - 8);
        expect(String.fromCharCode(...bytes.subarray(8, 16))).toBe('WAVEfmt ');
        expect(view.getUint16(22, true)).toBe(1);
        expect(view.getUint32(24, true)).toBe(RATE);
        expect(view.getUint16(32, true)).toBe(2);
        expect(view.getUint16(34, true)).toBe(16);
        expect(view.getUint32(40, true)).toBe(samples.length * 2);
        const back = decodeWav(bytes);
        expect(back.rate).toBe(RATE);
        expect(back.samples.length).toBe(samples.length);
        let worst = 0;
        for (let i = 0; i < samples.length; i++) worst = Math.max(worst, Math.abs(back.samples[i] - samples[i]));
        expect(worst).toBeLessThanOrEqual(1 / 32767);
    });
});

describe('harness and reference codecs', () => {
    const tone = signals({ rate: RATE, seconds: SECONDS, seed: 1 })[0];

    test('identity is lossless and costs four bytes a sample', () => {
        const row = runCodec(identity, tone, RATE);
        expect(row.codec).toBe('identity');
        expect(row.signal).toBe('tone');
        expect(row.snr).toBe(Infinity);
        expect(row.rawBytesPerSecond).toBeCloseTo(RATE * 4, 6);
        expect(row.deflatedBytesPerSecond).toBeGreaterThan(0);
        expect(row.frames).toBe(tone.samples.length / FRAME);
        expect(row.microsPerFrame).toBeGreaterThanOrEqual(0);
        expect(row.decoded.length).toBe(tone.samples.length);
    });

    test('pcm16 and pcm8 score at their theoretical figures on the tone', () => {
        const r16 = runCodec(pcm16, tone, RATE);
        const r8 = runCodec(pcm8, tone, RATE);
        expect(Math.abs(r16.snr - theoretical(16))).toBeLessThan(0.5);
        expect(Math.abs(r8.snr - theoretical(8))).toBeLessThan(0.5);
        expect(r16.rawBytesPerSecond).toBeCloseTo(RATE * 2, 6);
        expect(r8.rawBytesPerSecond).toBeCloseTo(RATE, 6);
    });

    test('deflate shrinks a silent stream and each packet inflates back', () => {
        const silence = { name: 'silence', samples: new Float32Array(FRAME * 64) };
        const row = runCodec(pcm16, silence, RATE);
        expect(row.deflatedBytesPerSecond).toBeLessThan(row.rawBytesPerSecond / 10);
        expect(row.inflateChecked).toBe(true);
    });
});
