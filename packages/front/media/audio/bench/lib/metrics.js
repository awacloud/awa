// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Objective quality figures of the audio bench. They compare
 * a decoded signal with its source sample by sample; they say nothing of
 * perceived quality, which stays a listening judgement.
 */

import { FRAME } from './signals.js';

/**
 * Ratio of two energies in dB. Zero noise is a perfect score.
 * @param {number} signal
 * @param {number} noise
 * @returns {number}
 */
function decibels(signal, noise) {
    if (noise === 0) return Infinity;
    if (signal === 0) return -Infinity;
    return 10 * Math.log10(signal / noise);
}

/**
 * Signal-to-noise ratio of `out` against `ref`, in dB.
 *
 * @param {Float32Array} ref The source.
 * @param {Float32Array} out The decoded signal.
 * @param {object} [options]
 * @param {number} [options.delay=0] Samples by which `out` lags `ref`.
 * @returns {number}
 */
export function snr(ref, out, { delay = 0 } = {}) {
    const n = Math.min(ref.length, out.length - delay);
    let signal = 0;
    let noise = 0;
    for (let i = 0; i < n; i++) {
        const d = out[i + delay] - ref[i];
        signal += ref[i] * ref[i];
        noise += d * d;
    }
    return decibels(signal, noise);
}

/**
 * Segmental SNR: the mean of per-frame SNR, each clamped to
 * [`min`, `max`] dB, over the frames whose source is not silent. It weighs
 * quiet passages like loud ones, closer to what is heard than a global SNR.
 *
 * @param {Float32Array} ref
 * @param {Float32Array} out
 * @param {object} [options]
 * @param {number} [options.delay=0]
 * @param {number} [options.frame=FRAME]
 * @param {number} [options.min=-10]
 * @param {number} [options.max=35]
 * @param {number} [options.silence=1e-9] Mean-square level under which a source frame is skipped.
 * @returns {number} NaN when every source frame is silent.
 */
export function segmentalSnr(ref, out, { delay = 0, frame = FRAME, min = -10, max = 35, silence = 1e-9 } = {}) {
    const n = Math.min(ref.length, out.length - delay);
    let sum = 0;
    let count = 0;
    for (let start = 0; start + frame <= n; start += frame) {
        let signal = 0;
        let noise = 0;
        for (let i = start; i < start + frame; i++) {
            const d = out[i + delay] - ref[i];
            signal += ref[i] * ref[i];
            noise += d * d;
        }
        if (signal / frame < silence) continue;
        sum += Math.max(min, Math.min(max, decibels(signal, noise)));
        count++;
    }
    return count === 0 ? NaN : sum / count;
}
