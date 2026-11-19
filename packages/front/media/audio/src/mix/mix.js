// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `audio.mix` — a mixer of frames (row A9): several channels'
 * frames of one instant into one.
 *
 * Pushed one instant at a time (`mix(frames)`): whoever feeds it sets the
 * pace — the mixer has no timer of its own (the R&D's commented-out timer,
 * finding a6, has no place left). The output is a new array; the inputs
 * are left as they were (a5). Four ways (`mode`); the limiter by default —
 * the owner after listening set 10 (D23): « la version Limiteur est celle
 * qui a le meilleur résultat partout », the sum good at ordinary levels:
 *
 * - `sum`: the samples added, then cut at full scale (counted in `cut`).
 * - `envelope`: the R&D's — the sum held between the lowest and the
 *   highest channel value at that sample, the lowest taken from the
 *   values (finding a4: the R&D took it from the maxima).
 * - `average`: the sum divided by the number of channels.
 * - `limit`: the sum, then a gain that falls at once to keep the frame's
 *   peak at full scale and comes back slowly — its distance to 1
 *   multiplied by `release` a frame (0.9 unless given) — so that loud
 *   moments are turned down rather than cut or squeezed.
 */

/**
 * @typedef {object} MixApi
 * @property {(options?: { mode?: 'sum'|'envelope'|'average'|'limit', release?: number }) => { mix: (frames: Float32Array[]) => Float32Array, readonly mode: string, readonly gain: number, readonly counts: { frames: number, cut: number } }} createMixer
 */

export const mixModule = {
    name: 'audio.mix',
    version: '0.2.1',
    type: 'lib.media.audio',
    dependencies: [],
    deps: [],

    /** @returns {MixApi} */
    factory() {
        const MODES = ['sum', 'envelope', 'average', 'limit'];
        const FRAME = 128;

        function createMixer({ mode = 'limit', release = 0.9 } = {}) {
            if (!MODES.includes(mode)) throw new RangeError(`audio.mix: mode ${mode}, one of ${MODES.join(', ')}`);
            if (mode === 'limit' && !(typeof release === 'number' && release >= 0 && release < 1)) throw new RangeError(`audio.mix: release ${release}, from 0 to under 1`);
            let gain = 1;
            let length = FRAME;      // the last length mixed: what no channel gives silence of
            const counts = { frames: 0, cut: 0 };
            return {
                mode,
                get gain() {
                    return gain;
                },
                get counts() {
                    return { ...counts };
                },
                mix(frames) {
                    counts.frames++;
                    if (frames.length === 0) {
                        if (mode === 'limit') gain = 1 - (1 - gain) * release;
                        return new Float32Array(length);
                    }
                    const n = frames[0].length;
                    length = n;
                    for (const frame of frames) if (frame.length !== n) throw new RangeError(`audio.mix: frames of ${n} and ${frame.length} samples`);
                    const out = new Float32Array(n);
                    let peak = 0;
                    for (let i = 0; i < n; i++) {
                        let sum = 0;
                        let low = Infinity;
                        let high = -Infinity;
                        for (const frame of frames) {
                            const v = frame[i];
                            sum += v;
                            if (v < low) low = v;
                            if (v > high) high = v;
                        }
                        if (mode === 'envelope') sum = Math.min(high, Math.max(low, sum));
                        else if (mode === 'average') sum /= frames.length;
                        else if (mode === 'sum' && (sum > 1 || sum < -1)) {
                            counts.cut++;
                            sum = sum > 1 ? 1 : -1;
                        }
                        out[i] = sum;
                        if (Math.abs(sum) > peak) peak = Math.abs(sum);
                    }
                    if (mode === 'limit') {
                        gain = 1 - (1 - gain) * release;
                        if (peak * gain > 1) gain = 1 / peak;
                        if (gain !== 1) for (let i = 0; i < n; i++) out[i] *= gain;
                    }
                    return out;
                },
            };
        }

        return { createMixer };
    },
};
