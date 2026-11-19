// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `audio.fir` — the three low-pass filters of the original
 * chain and their streaming form.
 *
 * Each filter has 49 symmetric coefficients, designed for 44 100 Hz by
 * least squares against a band template (AwaCloud's own design data,
 * carried over unchanged from `audio_codec/audio.js`). Measured:
 *
 * | Profile | Pass band            | Stop band, worst      |
 * |---------|----------------------|-----------------------|
 * | `8k`    | 0 – 8 kHz, −4.9 dB at the edge  | −33.2 dB from 11.025 kHz |
 * | `12k`   | 0 – 12 kHz, −4.6 dB at the edge | −22.6 dB from 13.23 kHz  |
 * | `16k`   | 0 – 16 kHz, −4.6 dB at the edge | −29.3 dB from 17.64 kHz  |
 *
 * The DC gain of each is 1. The group delay is 24 samples.
 *
 * The streaming filter is the folded form of a symmetric FIR — half the
 * multiplications — over a history of 48 samples carried from one frame
 * to the next, so that the output does not depend on how the signal is
 * cut into frames.
 */

/**
 * @typedef {object} FirStage
 * @property {(frame: Float32Array) => Float32Array} push Filters one frame; same length out.
 *
 * @typedef {object} FirApi
 * @property {string[]} profiles
 * @property {number} delay Group delay in samples.
 * @property {(profile: string) => Float64Array} taps The 49 coefficients of a profile.
 * @property {(taps: Float64Array, options?: { gain?: number }) => FirStage} create
 */

export const firModule = {
    name: 'audio.fir',
    version: '0.1.0',
    type: 'lib.media.audio',
    dependencies: [],
    deps: [],

    /** @returns {FirApi} */
    factory() {
        // First 25 of the 49 symmetric coefficients (index 24 is the centre).
        const HALVES = {
            '8k': [
                5.835344668440215e-3,
                1.207670355689957e-2,
                3.628930999711129e-3,
                -1.098952512288859e-2,
                -1.347869255002761e-2,
                1.298326878695542e-3,
                1.643252722573007e-2,
                1.228678732097032e-2,
                -8.250437046091757e-3,
                -2.091531661915094e-2,
                -8.528132874612303e-3,
                1.660503472605344e-2,
                2.445037966956920e-2,
                2.150973714415642e-3,
                -2.734020116468861e-2,
                -2.747830487200785e-2,
                8.891750452662019e-3,
                4.370122519696534e-2,
                2.984556836479041e-2,
                -3.196049050178818e-2,
                -7.745721005630141e-2,
                -3.120703204372183e-2,
                1.165003239124577e-1,
                2.842877477120000e-1,
                3.592274369038371e-1,
            ],
            '12k': [
                -5.587120172983613e-3,
                1.144489268763611e-2,
                2.690539560306888e-3,
                -1.386489634160403e-2,
                1.443338836740374e-3,
                1.531209682276975e-2,
                -6.681629473639574e-3,
                -1.530277133885497e-2,
                1.273814403946199e-2,
                1.339550460668116e-2,
                -1.922233225371550e-2,
                -9.203124306076543e-3,
                2.569340897870787e-2,
                2.312653488819719e-3,
                -3.173749005444105e-2,
                7.915967805286174e-3,
                3.700535561439293e-2,
                -2.294017383777565e-2,
                -4.126223478875596e-2,
                4.685974772480764e-2,
                4.435195306085959e-2,
                -9.551590363826855e-2,
                -4.625727226166277e-2,
                3.134235437286977e-1,
                5.459756030252204e-1,
            ],
            '16k': [
                -1.156642942933906e-2,
                7.697726634531787e-3,
                2.346181185639543e-3,
                -1.206299250705073e-2,
                1.434446955151034e-2,
                -6.518851740030160e-3,
                -7.164304882503122e-3,
                1.765173755766413e-2,
                -1.690430749137106e-2,
                3.760977582959306e-3,
                1.422408835044725e-2,
                -2.483293395363581e-2,
                1.908852149410022e-2,
                1.841789895541316e-3,
                -2.568221165067949e-2,
                3.553731666818632e-2,
                -2.076253620865955e-2,
                -1.431006422421126e-2,
                4.961583227331740e-2,
                -5.840875845098970e-2,
                2.180255461212732e-2,
                5.884004626360145e-2,
                -1.594721683127804e-1,
                2.424364395680536e-1,
                7.369957544271405e-1,
            ],
        };
        const profiles = Object.keys(HALVES);

        /**
         * @param {string} profile
         * @returns {Float64Array} A fresh copy of the 49 coefficients.
         * @throws {RangeError} When the profile is unknown.
         */
        function taps(profile) {
            const half = HALVES[profile];
            if (!half) throw new RangeError(`audio.fir: profile ${profile}`);
            const full = new Float64Array(49);
            for (let k = 0; k < 25; k++) {
                full[k] = half[k];
                full[48 - k] = half[k];
            }
            return full;
        }

        /**
         * Builds a streaming filter for symmetric coefficients of odd length.
         *
         * @param {Float64Array} coefficients
         * @param {object} [options]
         * @param {number} [options.gain=1] Multiplies the output.
         * @returns {FirStage}
         * @throws {RangeError} When the length is even.
         */
        function create(coefficients, { gain = 1 } = {}) {
            if (coefficients.length % 2 !== 1) throw new RangeError('audio.fir: odd length expected');
            const span = coefficients.length - 1;
            const centre = span / 2;
            let history = new Float64Array(span);
            return {
                push(frame) {
                    const n = frame.length;
                    const x = new Float64Array(span + n);
                    x.set(history, 0);
                    x.set(frame, span);
                    const out = new Float32Array(n);
                    for (let i = 0; i < n; i++) {
                        let acc = coefficients[centre] * x[i + centre];
                        for (let j = 0; j < centre; j++) acc += coefficients[j] * (x[span + i - j] + x[i + j]);
                        out[i] = acc * gain;
                    }
                    history = x.slice(n);
                    return out;
                },
            };
        }

        return { profiles, delay: 24, taps, create };
    },
};
