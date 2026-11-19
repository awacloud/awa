// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `audio.codec` — the codec retained after the bench and
 * the owner's listening sessions.
 *
 * Its heart is the 5/3 integer wavelet on each frame, quantised by a
 * step that follows the level of the frame, in a 4-bit coding. Two
 * shapes share one packet format:
 *
 *   - **cascade** — before the wavelet, the `8k` low-pass and a
 *     decimation by 4 or 2 (the owner's original chain); after it, the
 *     cosine interpolation and, at the decoder's choice, the same
 *     low-pass once more, which softens the rendering;
 *   - **full band** — the wavelet alone, nothing cut.
 *
 * Settings are options, not frozen profiles: the decimation (4, 2 or 1),
 * the quantisation — the bits kept under each frame's peak (the fewer,
 * the fewer bytes), or one fixed step — and the softening. The presets
 * are starting points:
 *
 *   voice       ÷4, 6 bits, softened    voice in a conversation
 *   voice-low   ÷4, 5 bits, softened    the same, fewer bytes
 *   music       ÷2, 9 bits              everything up to 8 kHz
 *   full        no decimation, 9 bits   the whole band
 *   full-low    no decimation, 7 bits   the whole band at about the cost of `music`
 *   full-fixed  no decimation, step 64  the whole band, fewest bytes
 *
 * The two ways to quantise differ on quiet passages: the bits follow the
 * level, so a passage that fades keeps its quality; a fixed step costs
 * fewer bytes and lets what falls under it go.
 *
 * A packet is one header byte — version, rate, decimation, the encoder's
 * wish for the softening — then the wavelet's packet, which carries its
 * own step. A decoder needs no setting; the bits may change at any frame.
 *
 * A lost packet does not reach further than its own frame: the wavelet's
 * packet decodes alone, and the next packet decodes as if the lost one had
 * never come. `decoder.lose()`, called for a packet known to be missing,
 * gives the frame that fills its hole (`conceal`): `silence`, the frame
 * before `repeat`ed, or that frame `fade`d out — zeros at the next losses,
 * and the first good frame after them faded in over 32 samples — or the
 * waveform `extend`ed (row B1d): its last period repeated from where it
 * stands (the lag of best correlation, 32 to 480 samples), its gain falling
 * linearly a fifth a frame, and the first good frame after the hole a
 * linear crossfade from that continuation over 64 samples. Knowing that a
 * packet is missing is the stream framing's.
 *
 * Rates: 44 100 Hz, the rate the low-pass was designed for, and
 * 48 000 Hz, the browsers' rate. At 48 000 Hz the chain is the same, sample
 * for sample: a filter acts on the normalised frequency, so the band each
 * preset keeps moves up with the rate (×1.088: `voice` keeps up to 6 kHz,
 * `music` up to 8.7 kHz), and a frame of 128 samples lasts 2.67 ms.
 */

import { firModule } from '../baseline/fir.js';
import { resampleModule } from '../baseline/resample.js';
import { waveletModule } from '../wavelet/wavelet.js';

/**
 * @typedef {object} AudioCodecConfig
 * @property {44100|48000} [rate=48000] The browsers' rate by default (owner ruling D25); 44 100 Hz is the rate the low-pass was designed for.
 * @property {'voice'|'voice-low'|'music'|'full'|'full-low'|'full-fixed'} [preset='voice']
 * @property {1|2|4} [decimation] Overrides the preset.
 * @property {number} [bits] Significant bits kept under each frame's peak, 1 to 14. Not with `step`.
 * @property {number} [step] One fixed quantisation step instead, a power of two from 1 to 32768 (on 16-bit samples).
 * @property {boolean} [soft] The softening the encoder asks of the decoder.
 *
 * @typedef {object} AudioCodecApi
 * @property {Record<string, { decimation: number, bits?: number, step?: number, soft: boolean }>} presets
 * @property {(config?: AudioCodecConfig) => { push: (frame: Float32Array) => Uint8Array[], setBits: (bits: number) => void, setStep: (step: number) => void }} createEncoder Frames of 128 samples.
 * @property {(config?: { rate?: 44100|48000, soft?: boolean, conceal?: 'silence'|'repeat'|'fade'|'extend' }) => { push: (packet: Uint8Array) => Float32Array[], lose: () => Float32Array[], readonly rate: number|null }} createDecoder
 *   Follows the rate its stream says and tells it (`rate`, null before the first packet); given a rate, refuses a packet of the other.
 *   `soft` overrules the encoder's wish.
 * @property {(config?: AudioCodecConfig) => number} delay Samples by which the decoded signal lags the source.
 */

export const codecModule = {
    name: 'audio.codec',
    version: '0.6.1',
    type: 'lib.media.audio',
    dependencies: ['audio.fir', 'audio.resample', 'audio.wavelet'],
    deps: [firModule, resampleModule, waveletModule],

    /**
     * @param {import('../baseline/fir.js').FirApi} fir
     * @param {import('../baseline/resample.js').ResampleApi} resample
     * @param {import('../wavelet/wavelet.js').WaveletApi} wavelet
     * @returns {AudioCodecApi}
     */
    factory(fir, resample, wavelet) {
        const RATE = 44100;     // the base rate: its header bit is 0
        /** The rate by default: the browsers' (owner ruling D25, 2026-11-14). */
        const DEFAULT_RATE = 48000;
        const RATES = [44100, 48000];
        const RATE_BIT = 8;     // in the header byte: set at 48 000 Hz
        const FRAME = 128;
        const VERSION = 1;
        const PRESETS = Object.freeze({
            voice: Object.freeze({ decimation: 4, bits: 6, soft: true }),
            'voice-low': Object.freeze({ decimation: 4, bits: 5, soft: true }),
            music: Object.freeze({ decimation: 2, bits: 9, soft: false }),
            full: Object.freeze({ decimation: 1, bits: 9, soft: false }),
            'full-low': Object.freeze({ decimation: 1, bits: 7, soft: false }),
            'full-fixed': Object.freeze({ decimation: 1, step: 64, soft: false }),
        });
        // Passes of the wavelet for a frame of 128, 64 or 32 samples.
        const LEVELS = { 1: 5, 2: 4, 4: 3 };

        /** @throws {RangeError} When the rate is neither 44100 nor 48000. */
        function checkRate(rate) {
            if (!RATES.includes(rate)) throw new RangeError(`audio.codec: rate ${rate}, the codec works at ${RATES.join(' or ')} Hz`);
        }

        /** @throws {RangeError} When `bits` is not an integer from 1 to 14. */
        function checkBits(bits) {
            if (!Number.isInteger(bits) || bits < 1 || bits > 14) throw new RangeError(`audio.codec: bits ${bits}`);
        }

        /** @throws {RangeError} When `step` is not a power of two from 1 to 32768. */
        function checkStep(step) {
            if (!Number.isInteger(step) || step < 1 || step > 32768 || (step & (step - 1)) !== 0) throw new RangeError(`audio.codec: step ${step}`);
        }

        /**
         * Resolves a configuration against its preset.
         * @param {AudioCodecConfig} config
         * @throws {RangeError} On a bad rate, preset, decimation, bits or step, or on both bits and step.
         */
        function settle({ rate = DEFAULT_RATE, preset = 'voice', decimation, bits, step, soft } = {}) {
            checkRate(rate);
            const base = PRESETS[preset];
            if (!base) throw new RangeError(`audio.codec: preset ${preset}`);
            if (bits !== undefined && step !== undefined) throw new RangeError('audio.codec: bits or step, not both');
            // The one given wins over the preset's; with neither, the preset's own.
            const quantise = bits !== undefined ? { bits } : step !== undefined ? { step } : base.step ? { step: base.step } : { bits: base.bits };
            const settled = { rate, decimation: decimation ?? base.decimation, quantise, soft: soft ?? base.soft };
            if (!LEVELS[settled.decimation]) throw new RangeError(`audio.codec: decimation ${settled.decimation}`);
            if (quantise.step !== undefined) checkStep(quantise.step);
            else checkBits(quantise.bits);
            return settled;
        }

        function createEncoder(config) {
            const { rate, decimation, quantise: initial, soft } = settle(config);
            const cascade = decimation > 1;
            const filter = cascade ? fir.create(fir.taps('8k')) : null;
            const decimate = cascade ? resample.decimator(decimation) : null;
            const header = (VERSION << 4) | (rate === RATE ? 0 : RATE_BIT) | (soft && cascade ? 4 : 0) | (decimation >> 1);
            // With bits, the base keeps two more than the details; with a fixed step, the base is kept whole.
            const make = ({ bits, step }) => wavelet.createEncoder({
                kind: 'lift53', levels: LEVELS[decimation], coding: 'nibbles', frame: FRAME / decimation,
                ...(step !== undefined ? { step, baseStep: 1 } : { step: { bits }, baseStep: { bits: Math.min(16, bits + 2) } }),
            });
            let encoder = make(initial);
            return {
                /** @throws {RangeError} When the frame is not 128 samples. */
                push(frame) {
                    if (frame.length !== FRAME) throw new RangeError(`audio.codec: frame of ${frame.length}, ${FRAME} expected`);
                    const inner = encoder.push(cascade ? decimate.push(filter.push(frame)) : frame)[0];
                    const packet = new Uint8Array(1 + inner.length);
                    packet[0] = header;
                    packet.set(inner, 1);
                    return [packet];
                },
                /**
                 * Changes the bits kept, from the next frame on.
                 * @throws {RangeError} When `bits` is not an integer from 1 to 14.
                 */
                setBits(bits) {
                    checkBits(bits);
                    encoder = make({ bits });
                },
                /**
                 * Changes to a fixed step, from the next frame on.
                 * @throws {RangeError} When `step` is not a power of two from 1 to 32768.
                 */
                setStep(step) {
                    checkStep(step);
                    encoder = make({ step });
                },
            };
        }

        const CONCEALS = ['silence', 'repeat', 'fade', 'extend'];
        const FADE_IN = 32;
        /** `extend` (row B1d): the history kept, the window matched, the lags tried, the fall a frame, the crossfade. */
        const EXTEND = { history: 1024, window: 192, minLag: 32, maxLag: 480, decay: 0.2, crossfade: 64 };

        /** The lag at which the end of `history` best matches itself a lag before (normalised correlation). */
        function periodOf(history, filled) {
            const { window, minLag } = EXTEND;
            const maxLag = Math.min(EXTEND.maxLag, filled - window);
            if (maxLag < minLag) return Math.min(FRAME, filled);
            const end = history.length;
            let best = FRAME;
            let score = -Infinity;
            for (let lag = minLag; lag <= maxLag; lag++) {
                let ab = 0;
                let aa = 0;
                let bb = 0;
                for (let n = end - window; n < end; n++) {
                    const a = history[n];
                    const b = history[n - lag];
                    ab += a * b;
                    aa += a * a;
                    bb += b * b;
                }
                const c = aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
                if (c > score) {
                    score = c;
                    best = lag;
                }
            }
            return best;
        }

        function createDecoder({ rate, soft, conceal = 'silence' } = {}) {
            if (rate !== undefined) checkRate(rate);
            if (!CONCEALS.includes(conceal)) throw new RangeError(`audio.codec: conceal ${conceal}`);
            let current = rate ?? null;     // the stream says its rate
            let stages = null;              // built from the stream: it says its decimation
            // A copy of the last frame given out, for `repeat` and `fade`: the caller may transfer its own.
            const last = new Float32Array(FRAME);
            let held = false;
            let lost = 0;                   // losses in a row
            // `extend`: the last samples given out, and the continuation of the current run of losses.
            const history = conceal === 'extend' ? new Float32Array(EXTEND.history) : null;
            let filled = 0;
            let run = null;
            const record = (samples) => {
                history.copyWithin(0, FRAME);
                history.set(samples, EXTEND.history - FRAME);
                filled = Math.min(EXTEND.history, filled + FRAME);
            };
            return {
                get rate() {
                    return current;
                },
                /** @throws {RangeError} On a malformed packet, or one of another rate than the one given. */
                push(packet) {
                    if (packet.length < 3 || packet[0] >> 4 !== VERSION || (packet[0] & 3) === 3) throw new RangeError('audio.codec: malformed packet');
                    const said = packet[0] & RATE_BIT ? RATES[1] : RATE;
                    if (rate !== undefined && said !== rate) throw new RangeError(`audio.codec: a packet at ${said} Hz, the decoder was made for ${rate} Hz`);
                    current = said;
                    const decimation = 1 << (packet[0] & 3);
                    const softened = decimation > 1 && (soft ?? (packet[0] & 4) !== 0);
                    if (!stages || stages.decimation !== decimation || stages.softened !== softened) {
                        stages = {
                            decimation,
                            softened,
                            decoder: wavelet.createDecoder({ frame: FRAME / decimation }),
                            interpolate: decimation > 1 ? resample.interpolator(decimation, { mode: 'cosine' }) : null,
                            soften: softened ? fir.create(fir.taps('8k')) : null,
                        };
                    }
                    let samples = stages.decoder.push(packet.subarray(1))[0];
                    if (stages.interpolate) samples = stages.interpolate.push(samples);
                    if (stages.soften) samples = stages.soften.push(samples);
                    if (conceal === 'fade' && lost > 0) {
                        samples = new Float32Array(samples);
                        for (let i = 0; i < FADE_IN; i++) samples[i] *= (i + 1) / FADE_IN;
                    }
                    if (history) {
                        if (run) {
                            // The good frame after a hole: a linear crossfade from the continuation.
                            samples = new Float32Array(samples);
                            const { template, period, phase, gain } = run;
                            for (let i = 0; i < EXTEND.crossfade; i++) {
                                const w = (i + 1) / EXTEND.crossfade;
                                samples[i] = template[(phase + i) % period] * gain * (1 - w) + samples[i] * w;
                            }
                            run = null;
                        }
                        record(samples);
                    }
                    lost = 0;
                    last.set(samples);
                    held = true;
                    return [samples];
                },
                /**
                 * The frame that stands in for a packet known to be missing. The decoder's stages are
                 * left as they are: the next packet decodes as if the lost one had never come.
                 * @returns {Float32Array[]} One frame of 128 samples, a new array.
                 */
                lose() {
                    lost++;
                    const out = new Float32Array(FRAME);
                    if (!held || conceal === 'silence') return [out];
                    if (history) {
                        if (!run) {
                            const period = periodOf(history, filled);
                            run = { period, template: history.slice(EXTEND.history - period), phase: 0, gain: 1 };
                        }
                        const { template, period, phase, gain } = run;
                        for (let i = 0; i < FRAME; i++) out[i] = template[(phase + i) % period] * Math.max(0, gain - (EXTEND.decay * (i + 1)) / FRAME);
                        run.phase = (phase + FRAME) % period;
                        run.gain = Math.max(0, gain - EXTEND.decay);
                        record(out);
                        return [out];
                    }
                    if (conceal === 'repeat') {
                        out.set(last);
                        return [out];
                    }
                    if (lost === 1) for (let i = 0; i < FRAME; i++) out[i] = last[i] * (1 - (i + 1) / FRAME);
                    return [out];
                },
            };
        }

        function delay(config) {
            const { decimation, soft } = settle(config);
            if (decimation === 1) return 0;
            return fir.delay + decimation - 1 + (soft ? fir.delay : 0);
        }

        return { presets: PRESETS, createEncoder, createDecoder, delay };
    },
};
