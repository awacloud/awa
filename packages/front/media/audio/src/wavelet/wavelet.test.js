// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `audio.wavelet` (rows A4, A4b, A4c): the reversible
 * integer Haar and 5/3 pyramids, their layered packet and its two codings.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../main.js';
import { signals, prng } from '../../bench/lib/signals.js';
import { snr } from '../../bench/lib/metrics.js';

const RATE = 44100;
const KINDS = ['haar', 'lift53'];
const CODINGS = ['bytes', 'nibbles'];
const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const wavelet = runtime.resolve('audio.wavelet');
const voiced = signals({ rate: RATE, seconds: 2, seed: 5 })[3].samples;
/** A frame in the middle of a voiced burst. */
const busy = voiced.subarray(1280, 1408);

/** A frame of random 16-bit integers. */
function randomFrame(seed, length = 128) {
    const random = prng(seed);
    const frame = new Int32Array(length);
    for (let i = 0; i < length; i++) frame[i] = Math.floor(random() * 65536) - 32768;
    return frame;
}

/** The 16-bit integers the codec works on. */
const toInt = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));

/** Encodes and decodes `x` frame by frame; `cut` may shorten each packet. */
function roundTrip(x, config, cut = (packet) => packet) {
    const frame = config.frame ?? 128;
    const encoder = wavelet.createEncoder(config);
    const decoder = wavelet.createDecoder({ frame });
    const out = new Float32Array(x.length);
    let bytes = 0;
    for (let f = 0; (f + 1) * frame <= x.length; f++) {
        for (const packet of encoder.push(x.subarray(f * frame, (f + 1) * frame))) {
            const kept = cut(packet);
            bytes += kept.length;
            const frames = decoder.push(kept);
            expect(frames.length).toBe(1);
            expect(frames[0].length).toBe(frame);
            out.set(frames[0], f * frame);
        }
    }
    return { out, bytes };
}

/** Throws at the first sample of `out` that is not the 16-bit value of `x`. */
function expectExact(x, out, label) {
    for (let i = 0; i < out.length; i++) {
        if (out[i] !== Math.fround(toInt(x[i]) / 32767)) throw new Error(`${label}: sample ${i} differs`);
    }
}

describe('audio.wavelet transforms', () => {
    test('the two kinds are listed', () => {
        expect(wavelet.kinds).toEqual(KINDS);
        expect(wavelet.codings).toEqual(CODINGS);
    });

    test('each pyramid is exactly reversible at every level count', () => {
        for (const kind of KINDS) {
            for (const length of [128, 64, 32]) {
                for (let levels = 1; 1 << levels <= length && levels <= 7; levels++) {
                    for (let seed = 1; seed <= 4; seed++) {
                        const frame = randomFrame(seed * 31 + levels, length);
                        const bands = wavelet.forward(frame, levels, kind);
                        expect(bands.length).toBe(levels + 1);
                        expect(bands[0].length).toBe(length >> levels);
                        for (let k = 1; k <= levels; k++) expect(bands[k].length).toBe(length >> (levels - k + 1));
                        expect(Array.from(wavelet.inverse(bands, kind))).toEqual(Array.from(frame));
                    }
                }
            }
        }
    });

    test('haar: the base band holds the block averages', () => {
        const frame = new Int32Array(128);
        for (let i = 0; i < 128; i++) frame[i] = i < 64 ? 100 : -300;
        const bands = wavelet.forward(frame, 6);
        expect(Array.from(bands[0])).toEqual([100, -300]);
        for (let k = 1; k <= 6; k++) expect(bands[k].every((d) => d === 0)).toBe(true);
    });

    test('lift53: a ramp has zero interior details, haar has none at zero', () => {
        const ramp = Int32Array.from({ length: 128 }, (_, i) => 6 * i - 300);
        const [, lifted] = wavelet.forward(ramp, 1, 'lift53');
        for (let i = 0; i < 63; i++) expect(lifted[i]).toBe(0);
        const [, plain] = wavelet.forward(ramp, 1, 'haar');
        expect(plain.every((d) => d === -6)).toBe(true);
    });

    test('with the details at zero: lift53 interpolates the base, haar holds it', () => {
        const base = Int32Array.from([0, 100, 40, -60]);
        const zeros = new Int32Array(4);
        expect(Array.from(wavelet.inverse([base, zeros], 'lift53'))).toEqual([0, 50, 100, 70, 40, -10, -60, -60]);
        expect(Array.from(wavelet.inverse([base, zeros], 'haar'))).toEqual([0, 0, 100, 100, 40, 40, -60, -60]);
    });

    test('a bad level count, kind or frame length is refused', () => {
        expect(() => wavelet.forward(new Int32Array(128), 0)).toThrow();
        expect(() => wavelet.forward(new Int32Array(128), 8)).toThrow();
        expect(() => wavelet.forward(new Int32Array(100), 3)).toThrow();
        expect(() => wavelet.forward(new Int32Array(128), 3, 'db4')).toThrow();
    });
});

describe('audio.wavelet codec', () => {
    test('with steps of 1 the decoded frame is the 16-bit input, exactly', () => {
        for (const kind of KINDS) {
            for (const coding of CODINGS) {
                for (const levels of [1, 5, 7]) {
                    const { out } = roundTrip(voiced, { kind, coding, levels, step: 1 });
                    expectExact(voiced, out, `${kind} ${coding} ${levels}`);
                }
            }
        }
    });

    test('random full-range frames survive both codings exactly', () => {
        for (const kind of KINDS) {
            for (const coding of CODINGS) {
                const encoder = wavelet.createEncoder({ kind, coding, levels: 4, step: 1 });
                const decoder = wavelet.createDecoder();
                for (let seed = 1; seed <= 6; seed++) {
                    const ints = randomFrame(seed);
                    const frame = Float32Array.from(ints, (v) => v / 32767);
                    const back = decoder.push(encoder.push(frame)[0])[0];
                    for (let i = 0; i < 128; i++) {
                        if (back[i] !== Math.fround(toInt(frame[i]) / 32767)) throw new Error(`${kind} ${coding}: sample ${i}`);
                    }
                }
            }
        }
    });

    test('a larger step costs fewer bytes and more error, monotonically', () => {
        // On the 4-bit coding: the byte coding has a floor of one byte per
        // coefficient, which a 5/3 band reaches at a small step already.
        for (const kind of KINDS) {
            let previous = roundTrip(voiced, { kind, levels: 5, step: 1, coding: 'nibbles' });
            let previousSnr = snr(voiced, previous.out);
            for (const step of [16, 64, 256, 1024]) {
                const current = roundTrip(voiced, { kind, levels: 5, step, coding: 'nibbles' });
                const currentSnr = snr(voiced, current.out);
                expect(current.bytes).toBeLessThan(previous.bytes);
                expect(currentSnr).toBeLessThan(previousSnr);
                previous = current;
                previousSnr = currentSnr;
            }
        }
    });

    test('a step quantises by rounding to its multiple', () => {
        const frame = Float32Array.from(randomFrame(11), (v) => v / 32767);
        const ints = Int32Array.from(frame, toInt);
        for (const kind of KINDS) {
            const bands = wavelet.forward(ints, 3, kind);
            for (let k = 1; k <= 3; k++) bands[k] = bands[k].map((d) => Math.round(d / 64) * 64);
            bands[0] = bands[0].map((v) => Math.round(v / 16) * 16);
            const expected = wavelet.inverse(bands, kind);
            const back = wavelet.createDecoder().push(wavelet.createEncoder({ kind, levels: 3, step: 64, baseStep: 16 }).push(frame)[0])[0];
            for (let i = 0; i < 128; i++) expect(back[i]).toBe(Math.fround(expected[i] / 32767));
        }
    });

    test('a step is a power of two from 1 to 32768', () => {
        for (const step of [1, 2, 64, 32768]) expect(() => wavelet.createEncoder({ levels: 3, step })).not.toThrow();
        for (const step of [0, 3, 100, 65536, 1.5, -2]) {
            expect(() => wavelet.createEncoder({ levels: 3, step })).toThrow();
            expect(() => wavelet.createEncoder({ levels: 3, baseStep: step })).toThrow();
        }
        expect(() => wavelet.createEncoder({ levels: 3, step: [1, 2] })).toThrow();
    });

    test('one step per level is accepted, coarsest level first', () => {
        const fine = roundTrip(voiced, { levels: 3, step: [1, 1, 1], coding: 'nibbles' });
        const shaped = roundTrip(voiced, { levels: 3, step: [1, 16, 256], coding: 'nibbles' });
        expect(shaped.bytes).toBeLessThan(fine.bytes);
        // Finer bands quantised harder: the error grows, the stream still decodes.
        expect(snr(voiced, shaped.out)).toBeLessThan(snr(voiced, fine.out));
        for (const levels of [2, 5, 6, 7]) {
            const step = Array.from({ length: levels }, (_, k) => 1 << k);
            const uniform = roundTrip(voiced, { levels, step: 1 });
            const exact = roundTrip(voiced, { levels, step: new Array(levels).fill(1) });
            expect(exact.out).toEqual(uniform.out);
            expect(snr(voiced, roundTrip(voiced, { levels, step }).out)).toBeGreaterThan(20);
        }
    });

    test('a base step quantises the base within half a step', () => {
        const fine = roundTrip(voiced, { levels: 5, step: 1 });
        const coarse = roundTrip(voiced, { levels: 5, step: 1, baseStep: 256 });
        expect(coarse.bytes).toBeLessThan(fine.bytes);
        let worst = 0;
        for (let i = 0; i < fine.out.length; i++) worst = Math.max(worst, Math.abs(coarse.out[i] - fine.out[i]));
        expect(worst).toBeLessThanOrEqual(128 / 32767 + 1e-6);
        expect(worst).toBeGreaterThan(0);
    });

    test('a frame length other than 128 is a configuration of both ends', () => {
        const x = voiced.subarray(0, 32 * 500);
        for (const kind of KINDS) {
            const { out } = roundTrip(x, { kind, levels: 3, step: 1, frame: 32 });
            expectExact(x, out, kind);
        }
        const encoder = wavelet.createEncoder({ levels: 3, frame: 32 });
        expect(() => encoder.push(new Float32Array(128))).toThrow();
        expect(() => wavelet.createEncoder({ levels: 6, frame: 32 })).toThrow();
        const packet = encoder.push(new Float32Array(32))[0];
        expect(() => wavelet.createDecoder({ frame: 20 }).push(packet)).toThrow();
    });
});

describe('audio.wavelet level-following step', () => {
    /** A voiced stretch without silence, at a given level. */
    const loud = voiced.subarray(1280, 1280 + 128 * 40);
    const at = (gain) => loud.map((v) => v * gain);
    const score = (x, config) => snr(x, roundTrip(x, config).out);

    test('the step of a frame is its peak, less the bits kept', () => {
        const frame = new Float32Array(128);
        frame[10] = 0.5;                                    // 16384 on 16 bits: 15 significant bits
        const packet = wavelet.createEncoder({ levels: 3, step: { bits: 7 }, baseStep: { bits: 9 } }).push(frame)[0];
        expect(packet[1]).toBe(((15 - 9) << 4) | (15 - 7));
        frame[10] = 0.5 / 16;                               // 11 significant bits
        const quiet = wavelet.createEncoder({ levels: 3, step: { bits: 7 }, baseStep: { bits: 9 } }).push(frame)[0];
        expect(quiet[1]).toBe(((11 - 9) << 4) | (11 - 7));
        frame[10] = 0.001;                                  // 33: 6 significant bits, fewer than asked
        const faint = wavelet.createEncoder({ levels: 3, step: { bits: 7 }, baseStep: { bits: 9 } }).push(frame)[0];
        expect(faint[1]).toBe(0);
    });

    test('a quiet signal keeps the quality of a loud one; a fixed step does not', () => {
        for (const kind of KINDS) {
            const relative = { kind, levels: 5, step: { bits: 7 }, baseStep: { bits: 9 }, coding: 'nibbles' };
            const fixed = { kind, levels: 5, step: 256, baseStep: 64, coding: 'nibbles' };
            const loudScore = score(at(1), relative);
            const quietScore = score(at(1 / 16), relative);
            expect(Math.abs(loudScore - quietScore)).toBeLessThan(3);
            expect(score(at(1), fixed) - score(at(1 / 16), fixed)).toBeGreaterThan(15);
        }
    });

    test('at full level it is the fixed step of the same exponent', () => {
        // Peaks of this stretch stay between 2^14 and 2^15 in every frame checked.
        const frame = new Float32Array(128);
        for (let i = 0; i < 128; i++) frame[i] = 0.6 * Math.sin(i / 3);
        const relative = wavelet.createEncoder({ kind: 'lift53', levels: 5, step: { bits: 7 }, baseStep: { bits: 9 }, coding: 'nibbles' }).push(frame)[0];
        const fixed = wavelet.createEncoder({ kind: 'lift53', levels: 5, step: 256, baseStep: 64, coding: 'nibbles' }).push(frame)[0];
        expect(Array.from(relative)).toEqual(Array.from(fixed));
    });

    test('a decoder needs no setting: the step travels in each packet', () => {
        const x = Float32Array.from(loud, (v, i) => v * (i < loud.length / 2 ? 1 : 1 / 32));
        const { out } = roundTrip(x, { kind: 'lift53', levels: 5, step: { bits: 8 }, coding: 'nibbles' });
        const half = loud.length / 2;
        expect(snr(x.subarray(0, half), out.subarray(0, half))).toBeGreaterThan(25);
        expect(snr(x.subarray(half), out.subarray(half))).toBeGreaterThan(25);
    });

    test('a bad number of bits is refused', () => {
        for (const bits of [0, 17, 2.5, -1]) {
            expect(() => wavelet.createEncoder({ levels: 3, step: { bits } })).toThrow();
            expect(() => wavelet.createEncoder({ levels: 3, baseStep: { bits } })).toThrow();
        }
    });
});

describe('audio.wavelet packet', () => {
    test('the header is two bytes: no unit length, no step inside a unit', () => {
        for (const kind of KINDS) {
            const packet = wavelet.createEncoder({ kind, levels: 5, step: 64, baseStep: 16, coding: 'bytes' }).push(busy)[0];
            // Version 1, 5 levels; then the exponents of 16 and 64.
            expect(packet[0] >> 6).toBe(1);
            expect(packet[0] & 7).toBe(5);
            expect(packet[1]).toBe((4 << 4) | 6);
            // Byte coding at this step: one or two bytes a value, 128 values.
            expect(packet.length).toBeGreaterThanOrEqual(2 + 128);
            expect(wavelet.units(packet)[0]).toBeGreaterThanOrEqual(2 + 4);
        }
    });

    test('one step per level costs half a byte per further level', () => {
        const uniform = (levels) => wavelet.createEncoder({ levels, step: 1 }).push(busy)[0].length;
        const each = (levels) => wavelet.createEncoder({ levels, step: [2, ...new Array(levels - 1).fill(1)] }).push(new Float32Array(128))[0].length;
        const silent = (levels) => wavelet.createEncoder({ levels, step: 1 }).push(new Float32Array(128))[0].length;
        expect(uniform(5)).toBeGreaterThan(0);
        for (const levels of [2, 3, 5, 6, 7]) expect(each(levels) - silent(levels)).toBe(Math.ceil((levels - 1) / 2));
    });

    test('a silent frame is the header and the base', () => {
        for (const coding of CODINGS) {
            const packet = wavelet.createEncoder({ levels: 5, step: 1, coding }).push(new Float32Array(128))[0];
            expect(packet.length).toBe(2 + 4);
            expect(wavelet.units(packet)).toEqual([6]);
            expect(wavelet.createDecoder().push(packet)[0].every((v) => v === 0)).toBe(true);
        }
    });

    test('trailing bands that quantise to zero are not written', () => {
        // A slow ramp: only the coarse bands survive a large step.
        const ramp = Float32Array.from({ length: 128 }, (_, i) => (i - 64) / 200);
        const encoder = wavelet.createEncoder({ kind: 'haar', levels: 5, step: 512, coding: 'nibbles' });
        const packet = encoder.push(ramp)[0];
        const ends = wavelet.units(packet);
        expect(ends.length).toBeLessThan(6);
        expect(ends[ends.length - 1]).toBe(packet.length);
        expect(wavelet.createDecoder().push(packet)[0].length).toBe(128);
    });

    test('a packet of the first format (version 0) is refused', () => {
        // The A4 layout: levels, then length-prefixed units.
        const old = Uint8Array.from([1, 64, ...new Array(64).fill(0), 2, 1, 0xff]);
        expect(() => wavelet.createDecoder().push(old)).toThrow();
    });
});

describe('audio.wavelet nibble coding', () => {
    test('it decodes to exactly the samples of the byte coding', () => {
        for (const kind of KINDS) {
            for (const step of [1, 64, 256, 1024, [64, 128, 256, 512, 2048]]) {
                const bytes = roundTrip(voiced, { kind, levels: 5, step, coding: 'bytes' });
                const nibbles = roundTrip(voiced, { kind, levels: 5, step, coding: 'nibbles' });
                expect(nibbles.out).toEqual(bytes.out);
            }
        }
    });

    test('it is smaller than the byte coding once coefficients are small', () => {
        for (const kind of KINDS) {
            const bytes = roundTrip(voiced, { kind, levels: 5, step: 256, coding: 'bytes' });
            const nibbles = roundTrip(voiced, { kind, levels: 5, step: 256, coding: 'nibbles' });
            expect(nibbles.bytes).toBeLessThan(bytes.bytes * 0.75);
        }
    });

    test('long runs of zeros, isolated values and large values round-trip', () => {
        const frame = new Float32Array(128);
        frame[5] = 0.9;          // large coefficients near the start
        frame[70] = -0.0004;     // a small one after a long run
        frame[127] = 0.25;       // and one at the very end
        for (const kind of KINDS) {
            const packet = wavelet.createEncoder({ kind, levels: 2, step: 1, coding: 'nibbles' }).push(frame)[0];
            const back = wavelet.createDecoder().push(packet)[0];
            for (let i = 0; i < 128; i++) expect(back[i]).toBe(Math.fround(toInt(frame[i]) / 32767));
        }
    });

    test('a nibble stream that stops before its band is complete is refused', () => {
        // Header: version 1, 1 level, nibble coding; exponents 0. Base: 64 zero deltas.
        const head = [64 | 16 | 1, 0, ...new Array(64).fill(0)];
        // Two zero codes, then nothing: 62 values are missing.
        expect(() => wavelet.createDecoder().push(Uint8Array.from([...head, 0x00]))).toThrow();
        // Runs of 18 zeros, four times: 72 values for a band of 64.
        expect(() => wavelet.createDecoder().push(Uint8Array.from([...head, 0xef, 0xef, 0xef, 0xef]))).toThrow();
        // The same header with a well-formed band decodes.
        expect(wavelet.createDecoder().push(Uint8Array.from([...head, 0xff]))[0].length).toBe(128);
    });
});

describe('audio.wavelet layers', () => {
    const levels = 5;

    test('a packet is the base then one unit per band, coarsest first', () => {
        for (const coding of CODINGS) {
            const packet = wavelet.createEncoder({ levels, step: 1, coding }).push(busy)[0];
            const ends = wavelet.units(packet);
            expect(ends.length).toBe(levels + 1);
            expect(ends[levels]).toBe(packet.length);
            for (let k = 1; k <= levels; k++) expect(ends[k]).toBeGreaterThan(ends[k - 1]);
        }
    });

    test('a packet cut at any unit boundary decodes to a full frame', () => {
        for (const kind of KINDS) {
            for (const coding of CODINGS) {
                let previous = Infinity;
                for (let kept = levels + 1; kept >= 1; kept--) {
                    const { out } = roundTrip(voiced, { kind, coding, levels, step: 1 }, (packet) => {
                        const ends = wavelet.units(packet);
                        return kept <= ends.length ? packet.subarray(0, ends[kept - 1]) : packet;
                    });
                    const score = snr(voiced, out);
                    expect(score).toBeLessThanOrEqual(previous);
                    previous = score;
                }
                expect(previous).toBeGreaterThan(0);
            }
        }
    });

    test('haar: with every detail unit cut, the frame is the staircase of the base', () => {
        const packet = wavelet.createEncoder({ levels, step: 1 }).push(busy)[0];
        const base = wavelet.createDecoder().push(packet.subarray(0, wavelet.units(packet)[0]))[0];
        const block = 1 << levels;
        const averages = wavelet.forward(Int32Array.from(busy, toInt), levels)[0];
        for (let i = 0; i < 128; i++) expect(base[i]).toBe(Math.fround(averages[Math.floor(i / block)] / 32767));
    });

    test('lift53: cutting the finest unit hurts less than with haar', () => {
        const cutFinest = (kind) => snr(voiced, roundTrip(voiced, { kind, levels, step: 1 }, (packet) => {
            const ends = wavelet.units(packet);
            return ends.length > levels ? packet.subarray(0, ends[levels - 1]) : packet;
        }).out);
        expect(cutFinest('lift53')).toBeGreaterThan(cutFinest('haar') + 3);
    });

    test('the units of a shorter frame are found with its length', () => {
        const encoder = wavelet.createEncoder({ kind: 'lift53', levels: 3, step: 1, frame: 32 });
        const packet = encoder.push(busy.subarray(0, 32))[0];
        const ends = wavelet.units(packet, 32);
        expect(ends.length).toBe(4);
        expect(ends[3]).toBe(packet.length);
        expect(wavelet.createDecoder({ frame: 32 }).push(packet.subarray(0, ends[1]))[0].length).toBe(32);
    });

    test('a packet cut inside a unit, or with a bad header, is refused', () => {
        for (const coding of CODINGS) {
            const packet = wavelet.createEncoder({ levels, step: 1, coding }).push(busy)[0];
            const ends = wavelet.units(packet);
            expect(() => wavelet.createDecoder().push(packet.subarray(0, ends[1] - 1))).toThrow();
            expect(() => wavelet.createDecoder().push(packet.subarray(0, ends[0] - 1))).toThrow();
        }
        expect(() => wavelet.createDecoder().push(new Uint8Array([64, 0]))).toThrow();     // no level
        expect(() => wavelet.createDecoder().push(new Uint8Array([65]))).toThrow();        // header cut
        expect(() => wavelet.createDecoder().push(new Uint8Array([]))).toThrow();
    });
});
