// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Generated test signals of the audio bench. Everything is
 * computed from a seed and a sample rate: no recorded material, the same
 * samples on every run.
 */

/** Frame length of the codecs under test, in samples. */
export const FRAME = 128;

/**
 * Seeded generator of uniform numbers in [0, 1) (mulberry32).
 * @param {number} seed
 * @returns {() => number}
 */
export function prng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Full-scale sine. 997 Hz shares no short period with the usual rates, so
 * quantisation noise on it behaves as the theory assumes.
 */
function tone(n, rate) {
    const out = new Float32Array(n);
    const w = (2 * Math.PI * 997) / rate;
    for (let i = 0; i < n; i++) out[i] = Math.sin(w * i);
    return out;
}

/** Logarithmic sweep from 50 Hz to 16 kHz (or 45 % of the rate). */
function sweep(n, rate) {
    const out = new Float32Array(n);
    const f0 = 50;
    const f1 = Math.min(16000, rate * 0.45);
    const k = Math.log(f1 / f0);
    const seconds = n / rate;
    for (let i = 0; i < n; i++) {
        const t = i / rate;
        const phase = (2 * Math.PI * f0 * seconds * (Math.exp((k * t) / seconds) - 1)) / k;
        out[i] = 0.8 * Math.sin(phase);
    }
    return out;
}

/** White noise, uniform in [-amp, amp]. */
function noise(n, random, amp) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = amp * (2 * random() - 1);
    return out;
}

/**
 * A voiced-like signal: bursts of a harmonic series on a gliding pitch,
 * shaped by three formant-like bumps, separated by exact silences. Bursts
 * and silences start on frame edges so that silent frames are all zero.
 */
function voiced(n, rate, random) {
    const out = new Float32Array(n);
    const formants = [[700, 130], [1200, 170], [2600, 250]];
    const ramp = Math.round(rate * 0.02);
    const frames = (ms) => Math.max(1, Math.round((rate * ms) / 1000 / FRAME));
    let pos = 0;
    while (pos < n) {
        const length = Math.min(frames(200 + 250 * random()) * FRAME, n - pos);
        const pitch0 = 100 + 60 * random();
        const pitch1 = pitch0 * (0.85 + 0.4 * random());
        let phase = 0;
        for (let i = 0; i < length; i++) {
            const pitch = pitch0 + ((pitch1 - pitch0) * i) / length;
            phase += (2 * Math.PI * pitch) / rate;
            let v = 0;
            for (let h = 1; h * pitch < 5000; h++) {
                const f = h * pitch;
                let gain = 0.05 / h;
                for (const [centre, width] of formants) gain += Math.exp(-(((f - centre) / width) ** 2)) / Math.sqrt(h);
                v += gain * Math.sin(h * phase);
            }
            const edge = Math.min(i, length - 1 - i);
            const envelope = edge < ramp ? 0.5 - 0.5 * Math.cos((Math.PI * edge) / ramp) : 1;
            out[pos + i] = v * envelope;
        }
        pos += length + frames(100 + 200 * random()) * FRAME;
    }
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    if (peak > 0) for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * 0.7;
    return out;
}

/**
 * The bench's signal set.
 *
 * @param {object} options
 * @param {number} options.rate Sample rate in Hz.
 * @param {number} options.seconds Duration; rounded down to whole frames.
 * @param {number} options.seed Seed of every random choice.
 * @returns {{ name: string, samples: Float32Array }[]}
 */
export function signals({ rate, seconds, seed }) {
    const n = Math.floor((rate * seconds) / FRAME) * FRAME;
    const clean = voiced(n, rate, prng(seed ^ 0x51ed));
    const hiss = noise(n, prng(seed ^ 0x9e37), 0.02);
    const noisy = new Float32Array(n);
    for (let i = 0; i < n; i++) noisy[i] = Math.max(-1, Math.min(1, clean[i] + hiss[i]));
    return [
        { name: 'tone', samples: tone(n, rate) },
        { name: 'sweep', samples: sweep(n, rate) },
        { name: 'noise', samples: noise(n, prng(seed), 0.5) },
        { name: 'voiced', samples: clean },
        { name: 'voiced-noisy', samples: noisy },
    ];
}
