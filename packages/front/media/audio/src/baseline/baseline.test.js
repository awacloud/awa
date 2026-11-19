// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the baseline chain (row A3): `audio.planes`,
 * `audio.fir`, `audio.resample`, `audio.baseline`.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../main.js';
import { snr } from '../../bench/lib/metrics.js';

const RATE = 44100;
const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const planes = runtime.resolve('audio.planes');
const fir = runtime.resolve('audio.fir');
const resample = runtime.resolve('audio.resample');
const baseline = runtime.resolve('audio.baseline');

/** A sine of `n` samples at `freq` Hz. */
function sine(freq, n, amp = 1) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / RATE);
    return out;
}

/** Pushes `x` through `stage.push` in chunks of the given sizes, cycling. */
function stream(stage, x, sizes) {
    const parts = [];
    let at = 0;
    for (let k = 0; at < x.length; k++) {
        const size = Math.min(sizes[k % sizes.length], x.length - at);
        parts.push(stage.push(x.subarray(at, at + size)));
        at += size;
    }
    const out = new Float32Array(parts.reduce((sum, p) => sum + p.length, 0));
    let to = 0;
    for (const p of parts) { out.set(p, to); to += p.length; }
    return out;
}

/** Magnitude of a filter's response at `freq`, in dB. */
function responseDb(taps, freq) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < taps.length; k++) {
        const w = (2 * Math.PI * freq * k) / RATE;
        re += taps[k] * Math.cos(w);
        im -= taps[k] * Math.sin(w);
    }
    return 20 * Math.log10(Math.hypot(re, im));
}

/** Runs a baseline configuration over `x`, frame by frame. */
function roundTrip(x, config, depthAt = () => config.depth ?? 3) {
    const encoder = baseline.createEncoder({ rate: RATE, ...config });
    const decoder = baseline.createDecoder({ rate: RATE, ...config });
    const parts = [];
    for (let f = 0; (f + 1) * 128 <= x.length; f++) {
        encoder.setDepth(depthAt(f));
        for (const packet of encoder.push(x.subarray(f * 128, (f + 1) * 128))) parts.push(...decoder.push(packet));
    }
    const out = new Float32Array(parts.reduce((sum, p) => sum + p.length, 0));
    let to = 0;
    for (const p of parts) { out.set(p, to); to += p.length; }
    return out;
}

describe('audio.planes', () => {
    test('a packet is the depth followed by that many planes', () => {
        const frame = sine(997, 128);
        for (const depth of [1, 2, 3]) {
            const packet = planes.pack(frame, depth);
            expect(packet).toBeInstanceOf(Uint8Array);
            expect(packet[0]).toBe(depth);
            expect(packet.length).toBe(1 + depth * 128);
        }
    });

    test('the error stays within half a step of the depth', () => {
        const frame = sine(997, 128, 0.98);
        for (const depth of [1, 2, 3]) {
            const back = planes.unpack(planes.pack(frame, depth));
            const halfStep = 2 ** (-8 * depth);
            let worst = 0;
            for (let i = 0; i < frame.length; i++) worst = Math.max(worst, Math.abs(back[i] - frame[i]));
            expect(worst).toBeLessThanOrEqual(halfStep * 1.0001);
        }
    });

    test('full scale does not wrap (finding a8)', () => {
        const frame = new Float32Array([-1, 1, -1.5, 1.5, 0]);
        for (const depth of [1, 2, 3]) {
            const back = planes.unpack(planes.pack(frame, depth));
            const step = 2 ** (1 - 8 * depth);
            expect(back[0]).toBeLessThan(-1 + step);
            expect(back[1]).toBeGreaterThanOrEqual(1 - step);
            expect(back[2]).toBeCloseTo(back[0], 9);
            expect(back[3]).toBeCloseTo(back[1], 9);
            expect(back[4]).toBe(0);
        }
    });

    test('depths 1 and 2 score at the theory on a tone', () => {
        // 0.98 of full scale: the top step of a depth is not reachable.
        const tone = sine(997, 128 * 600, 0.98);
        const through = (depth) => {
            const out = new Float32Array(tone.length);
            for (let f = 0; f < 600; f++) out.set(planes.unpack(planes.pack(tone.subarray(f * 128, (f + 1) * 128), depth)), f * 128);
            return snr(tone, out);
        };
        const level = 20 * Math.log10(0.98);
        expect(Math.abs(through(1) - (49.92 + level))).toBeLessThan(0.5);
        expect(Math.abs(through(2) - (98.08 + level))).toBeLessThan(0.5);
    });

    test('a malformed packet is refused', () => {
        expect(() => planes.unpack(new Uint8Array([4, 0, 0, 0, 0]))).toThrow();
        expect(() => planes.unpack(new Uint8Array([2, 0, 0, 0]))).toThrow();
        expect(() => planes.pack(new Float32Array(4), 0)).toThrow();
    });
});

describe('audio.fir', () => {
    // Bounds measured on the owned tables (track, item notes of A3).
    const bands = { '8k': [8000, 11025, -33], '12k': [12000, 13230, -22.5], '16k': [16000, 17640, -29.3] };

    test('three profiles of 49 symmetric taps with a DC gain of 1', () => {
        expect(fir.profiles).toEqual(['8k', '12k', '16k']);
        expect(fir.delay).toBe(24);
        for (const name of fir.profiles) {
            const taps = fir.taps(name);
            expect(taps.length).toBe(49);
            let sum = 0;
            for (let k = 0; k < 49; k++) {
                sum += taps[k];
                expect(taps[k]).toBe(taps[48 - k]);
            }
            expect(Math.abs(sum - 1)).toBeLessThan(1e-4);
        }
    });

    test('each table holds its measured pass and stop bands', () => {
        for (const [name, [pass, stop, floor]] of Object.entries(bands)) {
            const taps = fir.taps(name);
            for (let f = 0; f <= pass; f += 50) {
                const db = responseDb(taps, f);
                expect(db).toBeGreaterThan(-5);
                expect(db).toBeLessThan(0.85);
            }
            for (let f = stop; f <= RATE / 2; f += 50) expect(responseDb(taps, f)).toBeLessThan(floor);
        }
    });

    test('the streaming filter equals the convolution whatever the frame split', () => {
        const x = sine(1234, 2000, 0.7);
        for (const name of fir.profiles) {
            const taps = fir.taps(name);
            const direct = new Float32Array(x.length);
            for (let n = 0; n < x.length; n++) {
                let acc = 0;
                for (let k = 0; k < 49 && k <= n; k++) acc += taps[k] * x[n - k];
                direct[n] = acc;
            }
            for (const sizes of [[128], [1], [7, 300, 64], [2000]]) {
                const out = stream(fir.create(taps), x, sizes);
                expect(out.length).toBe(x.length);
                let worst = 0;
                for (let n = 0; n < x.length; n++) worst = Math.max(worst, Math.abs(out[n] - direct[n]));
                expect(worst).toBeLessThan(1e-6);
            }
        }
    });

    test('the gain option scales the output', () => {
        const x = sine(500, 256, 0.2);
        const plain = fir.create(fir.taps('8k')).push(x);
        const loud = fir.create(fir.taps('8k'), { gain: 1.25 }).push(x);
        for (let i = 0; i < x.length; i++) expect(loud[i]).toBeCloseTo(plain[i] * 1.25, 6);
    });

    test('an unknown profile is refused', () => {
        expect(() => fir.taps('4k')).toThrow();
    });
});

describe('audio.resample', () => {
    test('the decimator keeps exactly one sample in M over a long run (finding a1)', () => {
        const total = 128 * 7813;                                   // just over 10^6 samples
        const frame = new Float32Array(128);
        for (const factor of [2, 3, 4]) {
            const stage = resample.decimator(factor);
            let kept = 0;
            for (let pushed = 0; pushed < total; pushed += 128) kept += stage.push(frame).length;
            expect(kept).toBe(Math.ceil(total / factor));
        }
    });

    test('the decimator does not depend on the frame split (finding a2)', () => {
        const x = sine(700, 3001, 0.5);
        for (const factor of [2, 3, 4]) {
            const whole = resample.decimator(factor).push(x);
            for (let i = 0; i < whole.length; i++) expect(whole[i]).toBe(x[i * factor]);
            for (const sizes of [[128], [1], [5, 77, 129]]) {
                expect(stream(resample.decimator(factor), x, sizes)).toEqual(whole);
            }
        }
    });

    test('every interpolator returns M samples per sample, split-independent', () => {
        const x = sine(300, 1000, 0.5);
        for (const factor of [2, 3, 4]) {
            for (const mode of ['fir', 'cosine', 'linear']) {
                const make = () => resample.interpolator(factor, { mode, taps: fir.taps('8k') });
                const whole = make().push(x);
                expect(whole.length).toBe(x.length * factor);
                const split = stream(make(), x, [3, 50, 128]);
                let worst = 0;
                for (let i = 0; i < whole.length; i++) worst = Math.max(worst, Math.abs(split[i] - whole[i]));
                expect(worst).toBeLessThan(1e-6);
            }
        }
    });

    test('cosine and linear pass through the samples they were given', () => {
        const x = sine(300, 200, 0.5);
        for (const mode of ['cosine', 'linear']) {
            const out = resample.interpolator(4, { mode }).push(x);
            for (let i = 0; i < x.length; i++) expect(out[i * 4 + 3]).toBeCloseTo(x[i], 6);
        }
        const out = resample.interpolator(2, { mode: 'linear' }).push(new Float32Array([0, 1, 0]));
        expect(Array.from(out)).toEqual([0, 0, 0.5, 1, 0.5, 0]);
    });

    test('an unknown mode or a bad factor is refused', () => {
        expect(() => resample.interpolator(2, { mode: 'cubic' })).toThrow();
        expect(() => resample.interpolator(2, { mode: 'fir' })).toThrow();
        expect(() => resample.decimator(0)).toThrow();
        expect(() => resample.decimator(2.5)).toThrow();
    });
});

describe('audio.baseline', () => {
    const tone = sine(3000, 128 * 400, 0.8);
    const aliasFree = { profile: '8k', factor: 2 };

    test('the profiles keep the old pairings', () => {
        expect(baseline.profiles).toEqual({
            raw: { filter: null, factor: 1 },
            '8k': { filter: '8k', factor: 4 },
            '12k': { filter: '12k', factor: 3 },
            '16k': { filter: '16k', factor: 2 },
        });
    });

    test('raw is the planes alone, no delay', () => {
        expect(baseline.delay({ profile: 'raw' })).toBe(0);
        const out = roundTrip(tone, { profile: 'raw', depth: 3 });
        expect(out.length).toBe(tone.length);
        expect(snr(tone, out)).toBeGreaterThan(120);
    });

    test('the declared delay aligns a tone in the band (alias-free pairing)', () => {
        for (const interpolation of ['fir', 'cosine', 'linear']) {
            const config = { ...aliasFree, interpolation };
            const out = roundTrip(tone, config);
            expect(out.length).toBe(tone.length);
            const aligned = snr(tone, out, { delay: baseline.delay(config) });
            expect(aligned).toBeGreaterThan(interpolation === 'fir' ? 20 : 3);
            expect(aligned).toBeGreaterThan(snr(tone, out, { delay: baseline.delay(config) + 1 }));
            expect(aligned).toBeGreaterThan(snr(tone, out, { delay: baseline.delay(config) - 1 }));
        }
    });

    test('the reconstruction filter beats the linear interpolator (finding a3)', () => {
        const score = (interpolation) => {
            const config = { ...aliasFree, interpolation };
            return snr(tone, roundTrip(tone, config), { delay: baseline.delay(config) });
        };
        expect(score('fir')).toBeGreaterThan(score('linear'));
    });

    test('every old profile yields the source length, rounded up to the factor', () => {
        for (const profile of ['8k', '12k', '16k']) {
            const { factor } = baseline.profiles[profile];
            for (const interpolation of ['fir', 'cosine']) {
                const out = roundTrip(tone, { profile, interpolation });
                expect(out.length).toBe(Math.ceil(tone.length / factor) * factor);
            }
        }
    });

    test('the depth changes between frames and the decoder follows', () => {
        const depths = [1, 2, 3];
        const out = roundTrip(tone, { profile: 'raw' }, (f) => depths[f % 3]);
        expect(out.length).toBe(tone.length);
        const coarse = roundTrip(tone, { profile: 'raw', depth: 1 });
        expect(snr(tone, out)).toBeGreaterThan(snr(tone, coarse));
        expect(snr(tone, out)).toBeLessThan(snr(tone, roundTrip(tone, { profile: 'raw', depth: 3 })));
    });

    test('a rate other than 44100 Hz, an unknown profile or depth are refused', () => {
        expect(() => baseline.createEncoder({ rate: 48000, profile: '8k' })).toThrow();
        expect(() => baseline.createDecoder({ rate: 48000, profile: '8k' })).toThrow();
        expect(() => baseline.createEncoder({ rate: RATE, profile: '4k' })).toThrow();
        expect(() => baseline.createEncoder({ rate: RATE, profile: 'raw', depth: 4 })).toThrow();
    });
});
