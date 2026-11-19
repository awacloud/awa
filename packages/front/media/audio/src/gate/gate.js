// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `audio.gate` — the activity gate (row A8a): which frames
 * carry sound worth sending.
 *
 * The level of a frame is its RMS. Two ways to decide (`mode`):
 *
 * - `counter`: a frame is active when its level reaches `threshold`, and
 *   the gate stays open for `hold` frames after the last that did.
 * - `smooth`: a peak follower — instant on a rise, falling by the factor
 *   `release` a frame — and the gate is open while it stands at
 *   `threshold` or above.
 *
 * Both open at once on a rise: no onset is cut by the gate itself. By
 * default (the owner's ruling D22, after listening set 9): a counter, a
 * threshold of 0.004, a hold of 96 frames (256 ms at 48 kHz). The follower
 * has no default `release`: it is given.
 */

/**
 * @typedef {object} GateApi
 * @property {(frame: Float32Array) => number} level The RMS of a frame.
 * @property {{ mode: 'counter', threshold: number, hold: number }} defaults The owner's values (D22).
 * @property {(options?: { mode?: 'counter', threshold?: number, hold?: number } | { mode: 'smooth', threshold?: number, release: number }) => { push: (frame: Float32Array) => boolean, readonly counts: { frames: number, active: number } }} createGate
 */

export const gateModule = {
    name: 'audio.gate',
    version: '0.2.1',
    type: 'lib.media.audio',
    dependencies: [],
    deps: [],

    /** @returns {GateApi} */
    factory() {
        function level(frame) {
            let sum = 0;
            for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
            return frame.length ? Math.sqrt(sum / frame.length) : 0;
        }

        /** The owner's ruling D22 (2026-11-14). */
        const defaults = Object.freeze({ mode: 'counter', threshold: 0.004, hold: 96 });

        function createGate({ mode = defaults.mode, threshold = defaults.threshold, hold = defaults.hold, release } = {}) {
            if (mode !== 'counter' && mode !== 'smooth') throw new RangeError(`audio.gate: mode ${mode}, counter or smooth`);
            if (!(typeof threshold === 'number' && threshold > 0 && Number.isFinite(threshold))) throw new RangeError(`audio.gate: threshold ${threshold}, a level above 0`);
            if (mode === 'counter' && !(Number.isInteger(hold) && hold >= 0)) throw new RangeError(`audio.gate: hold ${hold}, a whole number of frames`);
            if (mode === 'smooth' && !(typeof release === 'number' && release > 0 && release < 1)) throw new RangeError(`audio.gate: release ${release}, between 0 and 1`);
            let left = -1;          // counter: frames the gate stays open; -1 shut
            let follower = 0;       // smooth: the level followed
            const counts = { frames: 0, active: 0 };
            return {
                get counts() {
                    return { ...counts };
                },
                push(frame) {
                    // A level that is not a number (a bad sample) counts as silence: it must not stick the follower.
                    let l = level(frame);
                    if (!Number.isFinite(l)) l = 0;
                    let open;
                    if (mode === 'counter') {
                        if (l >= threshold) left = hold;
                        else if (left >= 0) left--;
                        open = left >= 0;
                    } else {
                        follower = Math.max(l, follower * release);
                        open = follower >= threshold;
                    }
                    counts.frames++;
                    if (open) counts.active++;
                    return open;
                },
            };
        }

        return { level, createGate, defaults };
    },
};
