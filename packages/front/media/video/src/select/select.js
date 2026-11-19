// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.select` — which pixels to send.
 *
 * The codec sends a pixel only when it changed, and sends every pixel
 * again from time to time so that a lost packet or a wrong decision does
 * not last. Three rules, measured side by side on the bench:
 *
 * `history` — the rule of the owner's original CPU tasks. Over the last
 * four frames of luma (the current one included):
 *
 *   avg = mean of the four      m1 = |now − previous|
 *   m3  = |now − avg|           m2 = |now − the one before|
 *                               m4 = |m1 − m2|
 *
 *   m1 > m2   ("outgoing")   selected when m3 > t0
 *   otherwise ("incoming")   selected when m4 > t1 or m3 > t2
 *
 * A pixel whose keep delay ended is due again; due pixels are sent within
 * a budget of a tenth of the picture a frame.
 *
 * `complete` — the rule of the owner's later GPU experiments: the same
 * tests with their own thresholds (`m1` against the frame two back, `m2`
 * against the previous one), and due pixels sent only on a "complete"
 * frame — every two seconds, or after a quiet frame — and only if they
 * moved at all.
 *
 * `reference` — explored by this package: compare each pixel with **the
 * value last sent for it**, the one the decoder shows. A pixel is
 * selected when it differs from that value by more than a threshold, on
 * the luma and, when asked, on the two colour differences. What the
 * viewer sees then never strays from the source by more than the
 * threshold, however slowly a picture drifts; no history is needed. The
 * refresh of due pixels is kept, for lost packets.
 *
 * In every rule the thresholds and the keep delay follow the amount of
 * change: a running mean of the selected count chooses one of five
 * levels.
 *
 * Differences from the original code: one keep plane instead of a
 * counter held in the alpha of each history frame; the level search no
 * longer falls off its last interval; and the refresh budget counts from
 * the first pixel, which the original never refreshed.
 */

/**
 * @typedef {object} Selector
 * @property {(luma: Uint8ClampedArray, chroma?: Uint8ClampedArray[]) => { mask: Uint8Array, count: number }} push The mask is reused at the next call. `chroma`: the two colour-difference planes, read by the `reference` rule when `chroma` is on.
 * @property {() => { level: number, keep: number, thresholds: number[], moving: number }} state
 * @property {() => ArrayLike<number>} reference The luma the receiver holds.
 * @property {(fn: (plane: any) => any) => void} remap Replaces every plane held, to follow a move of the picture.
 * @property {(luma: ArrayLike<number>, colour?: ArrayLike<number>[]) => void} adopt Sets what the receiver holds (`reference` rule).
 *
 * @typedef {object} SelectApi
 * @property {string[]} rules
 * @property {(config: { width: number, height: number, fps: number, rule?: string, chroma?: boolean, thresholds?: number[][] }) => Selector} create
 */

export const selectModule = {
    name: 'video.select',
    version: '0.6.0',
    type: 'lib.media.video',
    dependencies: [],
    deps: [],

    /** @returns {SelectApi} */
    factory() {
        const DEPTH = 4;
        const RULES = ['history', 'complete', 'reference'];
        // Thresholds per level of change, from a quiet picture to a busy one.
        const THRESHOLDS = {
            history: [[1, 2, 1], [2, 3, 2], [2, 4, 2], [3, 4, 3], [3, 5, 3]],
            complete: [[2, 2, 2], [3, 2, 2], [3, 2, 2], [4, 3, 3], [4, 3, 3]],
            // [luma, colour difference]
            reference: [[2, 2], [3, 3], [3, 3], [4, 4], [5, 5]],
        };

        /**
         * @param {object} config
         * @param {number} config.width Size of the planes the selection runs on.
         * @param {number} config.height
         * @param {number} config.fps Frame rate: the keep delay is one to three seconds.
         * @param {'history'|'complete'|'reference'} [config.rule='history']
         * @param {boolean} [config.chroma=false] `reference` only: also test the two colour differences.
         * @param {number[][]} [config.thresholds] Five rows replacing the rule's own.
         * @param {'shared'|'own'} [config.refresh='shared'] `reference` only: the budget of due pixels counts the changed ones too (the design), or has its own count — a picture where more than a tenth changes at every frame then still refreshes the rest.
         * @param {number} [config.minGroup=1] `reference` only: groups of fewer selected pixels in a row are not sent (claim 8 of the patent), unless one of them changed by more than twice the threshold or is due for refresh.
         * @param {number} [config.correct=0] `history` and `complete` only: a pixel selected at the previous frame is selected again when it differs from it by more than this (claim 4, error correction); 0: off.
         * @returns {Selector}
         * @throws {RangeError} On a bad size, frame rate, rule, threshold table, refresh, group or correction.
         */
        function create({ width, height, fps, rule = 'history', chroma = false, thresholds: table, refresh = 'shared', minGroup = 1, correct = 0 }) {
            if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError(`video.select: ${width}x${height}`);
            if (!(fps > 0)) throw new RangeError(`video.select: fps ${fps}`);
            if (!RULES.includes(rule)) throw new RangeError(`video.select: rule ${rule}`);
            if (refresh !== 'shared' && refresh !== 'own') throw new RangeError(`video.select: refresh ${refresh}`);
            const own = refresh === 'own';
            if (!Number.isInteger(minGroup) || minGroup < 1) throw new RangeError(`video.select: minGroup ${minGroup}`);
            if (!(correct >= 0)) throw new RangeError(`video.select: correct ${correct}`);
            const levels = table ?? THRESHOLDS[rule];
            if (levels.length !== 5) throw new RangeError('video.select: five threshold rows expected');
            const n = width * height;
            const history = Array.from({ length: DEPTH }, () => new Uint8ClampedArray(n));
            // `reference`: the values last sent. -1000: nothing sent yet, everything differs.
            const sent = rule === 'reference' ? Array.from({ length: chroma ? 3 : 1 }, () => new Int16Array(n).fill(-1000)) : null;
            let keepPlane = new Uint16Array(n);
            const mask = new Uint8Array(n);
            // `reference` rule: the pixels of the last frame sent because their keep delay ended, not because they changed.
            const due = new Uint8Array(n);
            const bounds = [n / 14, n / 12, n / 10, n / 4].map(Math.floor);
            const keeps = [fps, (fps * 3) >> 1, fps * 2, (fps * 5) >> 1, fps * 3].map(Math.round);
            const budget = Math.floor(n / 10);
            const period = Math.round(fps * 2);
            let slot = 0;
            let level = 3;
            let thresholds = rule === 'history' ? [2, 3, 2] : rule === 'complete' ? [4, 6, 4] : levels[3];
            let keep = keeps[4];
            let moving = 0;
            let sinceComplete = 0;
            let lastCount = n;

            return {
                /** @throws {RangeError} When a plane has not the configured size, or the colour planes are missing. */
                push(luma, colour) {
                    if (luma.length !== n) throw new RangeError(`video.select: a plane of ${luma.length}, ${n} expected`);
                    if (sent && chroma && (!colour || colour[0].length !== n || colour[1].length !== n)) throw new RangeError('video.select: the two colour planes are expected');
                    let count = 0;
                    if (rule === 'reference') {
                        const [tl, tc] = thresholds;
                        const sl = sent[0];
                        const sr = sent[1];
                        const sb = sent[2];
                        let refreshed = 0;      // due pixels sent in this frame
                        due.fill(0);
                        for (let i = 0; i < n; i++) {
                            let d = luma[i] - sl[i];
                            if (d < 0) d = -d;
                            let selected = d > tl;
                            // Strong: a change, or a refresh, that a small group must not hide.
                            let strong = d > 2 * tl;
                            if (chroma) {
                                let dr = colour[0][i] - sr[i];
                                if (dr < 0) dr = -dr;
                                let db = colour[1][i] - sb[i];
                                if (db < 0) db = -db;
                                if (dr > tc || db > tc) selected = true;
                                if (dr > 2 * tc || db > 2 * tc) strong = true;
                            }
                            if (!selected && keepPlane[i] === 0 && (own ? refreshed : count) < (budget * (i + 1)) / n) {
                                selected = true;
                                strong = true;
                                due[i] = 1;
                                refreshed++;
                            }
                            mask[i] = selected ? (strong ? 2 : 1) : 0;
                            if (selected) count++;
                        }
                        if (minGroup > 1) {
                            // Groups of fewer than `minGroup` weak pixels in a row are left for later.
                            let i = 0;
                            while (i < n) {
                                if (!mask[i]) { i++; continue; }
                                let end = i;
                                let kept = false;
                                while (end < n && mask[end]) {
                                    if (mask[end] === 2) kept = true;
                                    end++;
                                }
                                if (!kept && end - i < minGroup) {
                                    mask.fill(0, i, end);
                                    count -= end - i;
                                }
                                i = end;
                            }
                        }
                        for (let i = 0; i < n; i++) {
                            if (mask[i]) {
                                mask[i] = 1;
                                keepPlane[i] = keep;
                                sl[i] = luma[i];
                                if (chroma) { sr[i] = colour[0][i]; sb[i] = colour[1][i]; }
                            } else if (keepPlane[i] > 0) keepPlane[i]--;
                        }
                    } else {
                        const now = history[slot];
                        now.set(luma);
                        const previous = history[(slot + DEPTH - 1) % DEPTH];
                        const before = history[(slot + DEPTH - 2) % DEPTH];
                        const older = history[(slot + DEPTH - 3) % DEPTH];
                        slot = (slot + 1) % DEPTH;
                        const [t0, t1, t2] = thresholds;
                        const swapped = rule === 'complete';
                        sinceComplete++;
                        let complete = false;
                        if (swapped) {
                            if (sinceComplete > period) { complete = true; sinceComplete = 0; }
                            else if (lastCount < budget) complete = true;
                        }
                        for (let i = 0; i < n; i++) {
                            const v = now[i];
                            const avg = (v + previous[i] + before[i] + older[i]) >> 2;
                            let dp = v - previous[i];
                            if (dp < 0) dp = -dp;
                            let db = v - before[i];
                            if (db < 0) db = -db;
                            let m3 = v - avg;
                            if (m3 < 0) m3 = -m3;
                            const m1 = swapped ? db : dp;
                            const m2 = swapped ? dp : db;
                            let selected;
                            let incoming = false;
                            if (m1 > m2) {
                                selected = m3 > t0;
                            } else {
                                let m4 = m1 - m2;
                                if (m4 < 0) m4 = -m4;
                                selected = m4 > t1 || m3 > t2;
                                incoming = true;
                            }
                            // Error correction: sent at the previous frame, and changed again since.
                            if (!selected && correct > 0 && mask[i] && dp > correct) selected = true;
                            if (!selected && keepPlane[i] === 0) {
                                // A pixel whose keep delay ended is due again.
                                if (swapped) selected = complete && (dp > 0 || db > 0 || m3 > 0);
                                else selected = incoming && count < (budget * (i + 1)) / n;
                            }
                            if (selected) {
                                mask[i] = 1;
                                keepPlane[i] = keep;
                                count++;
                            } else {
                                mask[i] = 0;
                                if (keepPlane[i] > 0) keepPlane[i]--;
                            }
                        }
                    }
                    lastCount = count;
                    moving = (moving + count) >> 1;
                    level = 4;
                    for (let k = 0; k < bounds.length; k++) {
                        if (moving < bounds[k]) { level = k; break; }
                    }
                    thresholds = levels[level];
                    keep = keeps[level];
                    return { mask, count, due: sent ? due : null };
                },
                state: () => ({ level, keep, thresholds: thresholds.slice(), moving }),
                /** The luma the receiver holds: the values last sent (`reference` rule) or the previous frame. */
                reference: () => (sent ? sent[0] : history[(slot + DEPTH - 1) % DEPTH]),
                /**
                 * Replaces every plane the selector holds by `fn(plane)` — to follow a move of the picture.
                 * @param {(plane: any) => any} fn Returns a plane of the same type and size.
                 */
                /**
                 * Tells the selector what the receiver now holds (`reference` rule), after the picture was rebuilt.
                 * @param {ArrayLike<number>} luma
                 * @param {ArrayLike<number>[]} [colour]
                 * @throws {Error} With another rule.
                 */
                adopt(luma, colour) {
                    if (!sent) throw new Error('video.select: adopt needs the reference rule');
                    sent[0].set(luma);
                    if (chroma) { sent[1].set(colour[0]); sent[2].set(colour[1]); }
                },
                remap(fn) {
                    if (sent) for (let k = 0; k < sent.length; k++) sent[k] = fn(sent[k]);
                    else for (let k = 0; k < DEPTH; k++) history[k] = fn(history[k]);
                    keepPlane = fn(keepPlane);
                },
            };
        }

        return { rules: RULES, create };
    },
};
