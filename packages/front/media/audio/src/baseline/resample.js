// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `audio.resample` — integer-factor decimation and
 * interpolation that stay exact and continuous across frames.
 *
 * The original chain rebuilt a resampling grid inside every 128-sample
 * window and truncated the block length, which lost samples on the
 * factor 3 (finding a1) and restarted the grid at each window (a2). Here
 * a decimator keeps one sample in M with its phase carried from frame to
 * frame, and an interpolator returns exactly M samples per sample.
 *
 * Interpolation modes:
 *   - `fir`     zero insertion, then a low-pass filter — the
 *               reconstruction filter the original decoder lacked (a3);
 *               delay: the filter's group delay;
 *   - `cosine`  the original cosine transition between two samples;
 *   - `linear`  a straight line between two samples.
 * `cosine` and `linear` emit, for each sample received, the M values that
 * end on it: delay M − 1.
 */

import { firModule } from './fir.js';

/**
 * @typedef {object} ResampleStage
 * @property {(samples: Float32Array) => Float32Array} push
 *
 * @typedef {object} ResampleApi
 * @property {(factor: number) => ResampleStage} decimator
 * @property {(factor: number, options: { mode: 'fir'|'cosine'|'linear', taps?: Float64Array }) => ResampleStage} interpolator
 */

export const resampleModule = {
    name: 'audio.resample',
    version: '0.1.0',
    type: 'lib.media.audio',
    dependencies: ['audio.fir'],
    deps: [firModule],

    /**
     * @param {import('./fir.js').FirApi} fir
     * @returns {ResampleApi}
     */
    factory(fir) {
        /** @throws {RangeError} When `factor` is not a positive integer. */
        function check(factor) {
            if (!Number.isInteger(factor) || factor < 1) throw new RangeError(`audio.resample: factor ${factor}`);
        }

        /**
         * Keeps the samples whose index in the whole stream is a multiple
         * of `factor`. The caller filters first.
         *
         * @param {number} factor
         * @returns {ResampleStage}
         */
        function decimator(factor) {
            check(factor);
            let skip = 0;      // samples to drop before the next kept one
            return {
                push(samples) {
                    const n = samples.length;
                    const count = n > skip ? Math.ceil((n - skip) / factor) : 0;
                    const out = new Float32Array(count);
                    for (let k = 0; k < count; k++) out[k] = samples[skip + k * factor];
                    skip = count === 0 ? skip - n : skip + count * factor - n;
                    return out;
                },
            };
        }

        /**
         * @param {number} factor
         * @param {object} options
         * @param {'fir'|'cosine'|'linear'} options.mode
         * @param {Float64Array} [options.taps] The low-pass of mode `fir`.
         * @returns {ResampleStage}
         * @throws {RangeError} On an unknown mode, or mode `fir` without taps.
         */
        function interpolator(factor, { mode, taps } = {}) {
            check(factor);
            if (mode === 'fir') {
                if (!taps) throw new RangeError('audio.resample: mode fir needs taps');
                // Zero insertion divides the level by the factor: the gain restores it.
                const filter = fir.create(taps, { gain: factor });
                return {
                    push(samples) {
                        const stuffed = new Float32Array(samples.length * factor);
                        for (let i = 0; i < samples.length; i++) stuffed[i * factor] = samples[i];
                        return filter.push(stuffed);
                    },
                };
            }
            if (mode !== 'cosine' && mode !== 'linear') throw new RangeError(`audio.resample: mode ${mode}`);
            const weights = new Float64Array(factor);
            for (let j = 1; j <= factor; j++) {
                const t = j / factor;
                weights[j - 1] = mode === 'linear' ? t : 0.5 - 0.5 * Math.cos(Math.PI * t);
            }
            let previous = 0;
            return {
                push(samples) {
                    const out = new Float32Array(samples.length * factor);
                    for (let i = 0; i < samples.length; i++) {
                        const current = samples[i];
                        for (let j = 0; j < factor; j++) out[i * factor + j] = previous + (current - previous) * weights[j];
                        previous = current;
                    }
                    return out;
                },
            };
        }

        return { decimator, interpolator };
    },
};
