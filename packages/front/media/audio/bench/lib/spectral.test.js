// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the bench's spectral figure (row A4).
 */

import { describe, test, expect } from 'bun:test';
import { signals } from './signals.js';
import { fft, logSpectralDistance } from './spectral.js';

const RATE = 44100;
const set = signals({ rate: RATE, seconds: 2, seed: 5 });
const noise = set[2].samples;
const voiced = set[3].samples;

describe('fft', () => {
    test('a sine on an exact bin has all its energy there', () => {
        const n = 512;
        const re = new Float64Array(n);
        const im = new Float64Array(n);
        for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 37 * i) / n);
        fft(re, im);
        for (let k = 0; k < n; k++) {
            const magnitude = Math.hypot(re[k], im[k]);
            if (k === 37 || k === n - 37) expect(magnitude).toBeCloseTo(n / 2, 6);
            else expect(magnitude).toBeLessThan(1e-9);
        }
    });

    test('a length that is not a power of two is refused', () => {
        expect(() => fft(new Float64Array(500), new Float64Array(500))).toThrow();
    });
});

describe('logSpectralDistance', () => {
    test('identical signals are at distance 0', () => {
        expect(logSpectralDistance(voiced, voiced, { rate: RATE })).toBe(0);
    });

    test('a scaled copy is at the distance of its gain in dB', () => {
        // White noise: every bin sits far above the floor.
        const half = noise.map((v) => v * 0.5);
        expect(logSpectralDistance(noise, half, { rate: RATE })).toBeCloseTo(6.0206, 2);
        const tenth = noise.map((v) => v * 0.1);
        expect(logSpectralDistance(noise, tenth, { rate: RATE, maxHz: 5000 })).toBeCloseTo(20, 1);
    });

    test('what lies under the floor in both signals is not compared', () => {
        // The voiced signal holds nothing above 5 kHz. A hiss there, 100 dB under
        // full scale, is under the floor of every frame but the faint ones at the
        // edge of a burst; 40 dB under full scale, it counts everywhere.
        const hiss = (amp) => voiced.map((v, i) => v + amp * Math.sin(2 * Math.PI * 0.4 * i));
        const faint = logSpectralDistance(voiced, hiss(1e-5), { rate: RATE });
        const loud = logSpectralDistance(voiced, hiss(1e-2), { rate: RATE });
        expect(faint).toBeLessThan(0.2);
        expect(loud).toBeGreaterThan(0.5);
        expect(loud).toBeGreaterThan(faint * 5);
    });

    test('the band limit is honoured', () => {
        // Remove everything by holding each pair of samples: the top of the band suffers most.
        const held = new Float32Array(voiced.length);
        for (let i = 0; i < voiced.length; i += 2) {
            held[i] = voiced[i];
            held[i + 1] = voiced[i];
        }
        const low = logSpectralDistance(voiced, held, { rate: RATE, maxHz: 2000 });
        const wide = logSpectralDistance(voiced, held, { rate: RATE, maxHz: 20000 });
        expect(low).toBeGreaterThan(0);
        expect(wide).toBeGreaterThan(low);
    });

    test('a declared delay is compensated', () => {
        const delay = 48;
        const late = new Float32Array(voiced.length + delay);
        late.set(voiced, delay);
        expect(logSpectralDistance(voiced, late, { rate: RATE, delay })).toBe(0);
    });

    test('silent reference frames are skipped; all silent gives NaN', () => {
        const silence = new Float32Array(4096);
        expect(logSpectralDistance(silence, silence, { rate: RATE })).toBeNaN();
    });
});
