// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `audio.baseline` — the owner's original voice chain, as
 * the baseline every later candidate is measured against.
 *
 * Encoder: low-pass filter → decimation → byte planes.
 * Decoder: byte planes → interpolation.
 *
 * Profiles keep the original pairings of a filter with a decimation
 * factor (`8k` ÷ 4, `12k` ÷ 3, `16k` ÷ 2), plus `raw` (planes only).
 * Those pairings alias: each filter cuts well above the Nyquist
 * frequency of the rate it is decimated to. The `factor` option lets the
 * same filter be paired with a rate it does protect (`8k` with 2).
 *
 * The chain works at 44 100 Hz, the rate the filters were designed for.
 * The profile, factor and interpolation are not carried in the packets:
 * both ends are configured alike, as in the original.
 */

import { planesModule } from './planes.js';
import { firModule } from './fir.js';
import { resampleModule } from './resample.js';

/**
 * @typedef {object} BaselineConfig
 * @property {number} [rate=44100] Must be 44100.
 * @property {'raw'|'8k'|'12k'|'16k'} [profile='raw']
 * @property {number} [factor] Decimation factor; the profile's by default.
 * @property {number} [depth=1] 1, 2 or 3 byte planes (encoder).
 * @property {number} [gain=1] Level applied after the filter (encoder).
 * @property {'fir'|'cosine'|'linear'} [interpolation='fir'] Decoder.
 *
 * @typedef {object} BaselineApi
 * @property {Record<string, { filter: string|null, factor: number }>} profiles
 * @property {(config?: BaselineConfig) => { push: (frame: Float32Array) => Uint8Array[], setDepth: (depth: number) => void }} createEncoder
 * @property {(config?: BaselineConfig) => { push: (packet: Uint8Array) => Float32Array[] }} createDecoder
 * @property {(config?: BaselineConfig) => number} delay Samples by which the decoded signal lags the source.
 */

export const baselineModule = {
    name: 'audio.baseline',
    version: '0.1.0',
    type: 'lib.media.audio',
    dependencies: ['audio.planes', 'audio.fir', 'audio.resample'],
    deps: [planesModule, firModule, resampleModule],

    /**
     * @param {import('./planes.js').PlanesApi} planes
     * @param {import('./fir.js').FirApi} fir
     * @param {import('./resample.js').ResampleApi} resample
     * @returns {BaselineApi}
     */
    factory(planes, fir, resample) {
        const RATE = 44100;
        const PROFILES = {
            raw: { filter: null, factor: 1 },
            '8k': { filter: '8k', factor: 4 },
            '12k': { filter: '12k', factor: 3 },
            '16k': { filter: '16k', factor: 2 },
        };

        /**
         * Resolves a configuration against its profile.
         * @param {BaselineConfig} config
         * @throws {RangeError} On a rate other than 44100, an unknown profile or depth.
         */
        function settle({ rate = RATE, profile = 'raw', factor, depth = 1, gain = 1, interpolation = 'fir' } = {}) {
            if (rate !== RATE) throw new RangeError(`audio.baseline: rate ${rate}, the chain works at ${RATE} Hz`);
            const base = PROFILES[profile];
            if (!base) throw new RangeError(`audio.baseline: profile ${profile}`);
            if (depth !== 1 && depth !== 2 && depth !== 3) throw new RangeError(`audio.baseline: depth ${depth}`);
            return { filter: base.filter, factor: base.filter ? (factor ?? base.factor) : 1, depth, gain, interpolation };
        }

        function createEncoder(config) {
            const settled = settle(config);
            let depth = settled.depth;
            const filter = settled.filter ? fir.create(fir.taps(settled.filter), { gain: settled.gain }) : null;
            const decimate = settled.filter ? resample.decimator(settled.factor) : null;
            return {
                /** @throws {RangeError} When `next` is not 1, 2 or 3. */
                setDepth(next) {
                    if (next !== 1 && next !== 2 && next !== 3) throw new RangeError(`audio.baseline: depth ${next}`);
                    depth = next;
                },
                push(frame) {
                    const kept = filter ? decimate.push(filter.push(frame)) : frame;
                    return kept.length === 0 ? [] : [planes.pack(kept, depth)];
                },
            };
        }

        function createDecoder(config) {
            const settled = settle(config);
            const interpolate = settled.filter
                ? resample.interpolator(settled.factor, { mode: settled.interpolation, taps: fir.taps(settled.filter) })
                : null;
            return {
                push(packet) {
                    const samples = planes.unpack(packet);
                    return [interpolate ? interpolate.push(samples) : samples];
                },
            };
        }

        function delay(config) {
            const settled = settle(config);
            if (!settled.filter) return 0;
            return fir.delay + (settled.interpolation === 'fir' ? fir.delay : settled.factor - 1);
        }

        return { profiles: PROFILES, createEncoder, createDecoder, delay };
    },
};
