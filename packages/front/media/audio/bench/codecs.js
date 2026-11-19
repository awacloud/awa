// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The codecs the bench runs, in table order. The three
 * references come first; each Track A row appends its candidates here.
 */

import { identity, pcm16, pcm8 } from './lib/reference.js';
import { modules } from './experiments/modules.js';
import { blocked, block2d } from './experiments/block2d.js';
import { points } from './experiments/points.js';

const { baseline, wavelet, fir, resample, codec } = modules;

/**
 * Wraps a baseline configuration as a bench codec.
 * @param {string} name
 * @param {import('../src/baseline/baseline.js').BaselineConfig} config
 */
function base(name, config) {
    return {
        name,
        delay: baseline.delay(config),
        createEncoder: (rate) => baseline.createEncoder({ rate, ...config }),
        createDecoder: (rate) => baseline.createDecoder({ rate, ...config }),
    };
}

/**
 * Wraps a wavelet configuration as a bench codec. `keep` cuts every
 * packet to its first `keep` units between the encoder and the decoder,
 * as a relay lowering the quality would.
 * @param {string} name
 * @param {import('../src/wavelet/wavelet.js').WaveletConfig} config
 * @param {number} [keep]
 */
function wave(name, config, keep) {
    return {
        name,
        delay: 0,
        createEncoder: () => {
            const encoder = wavelet.createEncoder(config);
            if (!keep) return encoder;
            return { push: (frame) => encoder.push(frame).map((packet) => packet.subarray(0, wavelet.units(packet)[keep - 1])) };
        },
        createDecoder: () => wavelet.createDecoder(),
    };
}

/**
 * The cascade asked by the owner: the original chain with a wavelet in
 * place of the byte planes. Encoder: the `8k` filter, decimation by
 * `factor`, the wavelet on the decimated frame (128 / factor samples).
 * Decoder: the wavelet, then the original cosine interpolation.
 * @param {string} name
 * @param {number} factor 2 or 4.
 * @param {import('../src/wavelet/wavelet.js').WaveletConfig} config
 */
function cascade(name, factor, config) {
    const frame = 128 / factor;
    return {
        name,
        delay: fir.delay + factor - 1,
        createEncoder: () => {
            const filter = fir.create(fir.taps('8k'));
            const decimate = resample.decimator(factor);
            const encoder = wavelet.createEncoder({ ...config, frame });
            return { push: (samples) => encoder.push(decimate.push(filter.push(samples))) };
        },
        createDecoder: () => {
            const decoder = wavelet.createDecoder({ frame });
            const interpolate = resample.interpolator(factor, { mode: 'cosine' });
            return { push: (packet) => decoder.push(packet).map((samples) => interpolate.push(samples)) };
        },
    };
}

/**
 * A codec whose decoder output goes through the `8k` low-pass once more:
 * the softened rendering asked for the economy profile.
 * @param {string} name
 * @param {{ delay: number, createEncoder: Function, createDecoder: Function }} codec
 */
function soften(name, codec) {
    return {
        ...codec,
        name,
        delay: codec.delay + fir.delay,
        createDecoder: (rate) => {
            const decoder = codec.createDecoder(rate);
            const filter = fir.create(fir.taps('8k'));
            return { push: (packet) => decoder.push(packet).map((samples) => filter.push(samples)) };
        },
    };
}

/**
 * One dimension on a longer frame: `frames` frames of 128 samples as one
 * frame of the 5/3 wavelet, 4-bit coding.
 * @param {string} name
 * @param {number} frames
 * @param {number} levels
 * @param {number} step
 */
function long(name, frames, levels, step) {
    const frame = frames * 128;
    return blocked(name, frames, {
        createEncoder: () => wavelet.createEncoder({ kind: 'lift53', levels, step, coding: 'nibbles', frame }),
        createDecoder: () => wavelet.createDecoder({ frame }),
    });
}

/**
 * A codec fed through the `8k` low-pass: what the filter removes is not
 * given to the encoder.
 * @param {string} name
 * @param {{ delay: number, latency?: number, createEncoder: Function, createDecoder: Function }} codec
 */
function filtered(name, codec) {
    return {
        ...codec,
        name,
        delay: codec.delay + fir.delay,
        createEncoder: (rate) => {
            const encoder = codec.createEncoder(rate);
            const filter = fir.create(fir.taps('8k'));
            return { push: (samples) => encoder.push(filter.push(samples)), flush: () => encoder.flush() };
        },
    };
}

/**
 * The economy chain with the sparse points in place of the wavelet: the
 * `8k` filter, decimation by `factor`, the points of the decimated
 * signal, then the cosine interpolation.
 * @param {string} name
 * @param {number} factor
 * @param {{ threshold: number, step: number, family: string, maxGap?: number }} config
 */
function cascadePoints(name, factor, config) {
    const inner = points('', config);
    return {
        name,
        delay: fir.delay + factor - 1,
        latency: inner.latency * factor,
        createEncoder: () => {
            const filter = fir.create(fir.taps('8k'));
            const decimate = resample.decimator(factor);
            const encoder = inner.createEncoder();
            return { push: (samples) => encoder.push(decimate.push(filter.push(samples))), flush: () => encoder.flush() };
        },
        createDecoder: () => {
            const decoder = inner.createDecoder();
            const interpolate = resample.interpolator(factor, { mode: 'cosine' });
            return { push: (packet) => decoder.push(packet).map((samples) => interpolate.push(samples)) };
        },
    };
}

/**
 * `audio.codec` as a bench codec.
 * @param {string} name
 * @param {import('../src/codec/codec.js').AudioCodecConfig} config
 */
function retained(name, config) {
    return {
        name,
        delay: codec.delay(config),
        createEncoder: (rate) => codec.createEncoder({ rate, ...config }),
        createDecoder: (rate) => codec.createDecoder({ rate }),
    };
}

export const codecs = [
    identity,
    pcm16,
    pcm8,

    // Row A3 — the original chain. Depth: b8 / b16 / b24 = 1 / 2 / 3 planes.
    base('raw-b8', { profile: 'raw', depth: 1 }),
    base('raw-b16', { profile: 'raw', depth: 2 }),
    base('raw-b24', { profile: 'raw', depth: 3 }),
    // The original pairings (each aliases), original cosine interpolation.
    base('8k-d4-b8-cos', { profile: '8k', depth: 1, interpolation: 'cosine' }),
    base('8k-d4-b16-cos', { profile: '8k', depth: 2, interpolation: 'cosine' }),
    base('12k-d3-b16-cos', { profile: '12k', depth: 2, interpolation: 'cosine' }),
    base('16k-d2-b16-cos', { profile: '16k', depth: 2, interpolation: 'cosine' }),
    // The same pairings with the reconstruction filter.
    base('8k-d4-b16-fir', { profile: '8k', depth: 2, interpolation: 'fir' }),
    base('12k-d3-b16-fir', { profile: '12k', depth: 2, interpolation: 'fir' }),
    base('16k-d2-b16-fir', { profile: '16k', depth: 2, interpolation: 'fir' }),
    // The alias-free pairing of the 8k table, both interpolations.
    base('8k-d2-b16-cos', { profile: '8k', factor: 2, depth: 2, interpolation: 'cosine' }),
    base('8k-d2-b16-fir', { profile: '8k', factor: 2, depth: 2, interpolation: 'fir' }),
    base('8k-d2-b8-fir', { profile: '8k', factor: 2, depth: 1, interpolation: 'fir' }),
    // The original gain of the 8k profile (QA3).
    base('8k-d4-b16-cos-g1.25', { profile: '8k', depth: 2, interpolation: 'cosine', gain: 1.25 }),

    // Row A4 — one-dimensional Haar, 5 levels (base of 4 averages per frame).
    // q: the quantisation step of the details, on 16-bit integers.
    wave('haar5-q1', { levels: 5, step: 1 }),
    wave('haar5-q64', { levels: 5, step: 64 }),
    wave('haar5-q256', { levels: 5, step: 256 }),
    wave('haar5-q1024', { levels: 5, step: 1024 }),
    // A step growing with the frequency of the band (coarsest band first).
    wave('haar5-q16to512', { levels: 5, step: [16, 32, 64, 128, 512] }),
    wave('haar5-q64to2048', { levels: 5, step: [64, 128, 256, 512, 2048] }),
    // Layer cuts on the lossless stream: the finest band dropped, then two.
    wave('haar5-q1-keep5', { levels: 5, step: 1 }, 5),
    wave('haar5-q1-keep4', { levels: 5, step: 1 }, 4),
    wave('haar5-q64-keep5', { levels: 5, step: 64 }, 5),

    // Row A4b — the same Haar with the 4-bit coding (zero runs).
    wave('haar5-q64-nib', { levels: 5, step: 64, coding: 'nibbles' }),
    wave('haar5-q256-nib', { levels: 5, step: 256, coding: 'nibbles' }),
    // The 5/3 lifting wavelet, byte coding then 4-bit coding.
    wave('lift5-q1', { kind: 'lift53', levels: 5, step: 1 }),
    wave('lift5-q64', { kind: 'lift53', levels: 5, step: 64 }),
    wave('lift5-q256', { kind: 'lift53', levels: 5, step: 256 }),
    wave('lift5-q64-nib', { kind: 'lift53', levels: 5, step: 64, coding: 'nibbles' }),
    wave('lift5-q128-nib', { kind: 'lift53', levels: 5, step: 128, coding: 'nibbles' }),
    wave('lift5-q256-nib', { kind: 'lift53', levels: 5, step: 256, coding: 'nibbles' }),
    wave('lift5-q512-nib', { kind: 'lift53', levels: 5, step: 512, coding: 'nibbles' }),
    wave('lift5-q1024-nib', { kind: 'lift53', levels: 5, step: 1024, coding: 'nibbles' }),
    wave('lift5-q64to2048-nib', { kind: 'lift53', levels: 5, step: [64, 128, 256, 512, 2048], coding: 'nibbles' }),
    // Layer cuts on the 5/3 stream.
    wave('lift5-q64-nib-keep5', { kind: 'lift53', levels: 5, step: 64, coding: 'nibbles' }, 5),
    wave('lift5-q64-nib-keep4', { kind: 'lift53', levels: 5, step: 64, coding: 'nibbles' }, 4),

    // The cascade, economy side: 8k filter, decimation by 4, a wavelet on
    // 32 samples (3 levels), cosine interpolation by 4.
    cascade('8k-d4-haar3-q256', 4, { levels: 3, step: 256, baseStep: 64 }),
    cascade('8k-d4-haar3-q256-nib', 4, { levels: 3, step: 256, baseStep: 64, coding: 'nibbles' }),
    cascade('8k-d4-lift3-q128-nib', 4, { kind: 'lift53', levels: 3, step: 128, baseStep: 64, coding: 'nibbles' }),
    cascade('8k-d4-lift3-q256-nib', 4, { kind: 'lift53', levels: 3, step: 256, baseStep: 64, coding: 'nibbles' }),
    cascade('8k-d4-lift3-q512-nib', 4, { kind: 'lift53', levels: 3, step: 512, baseStep: 64, coding: 'nibbles' }),
    cascade('8k-d4-lift3-q1024-nib', 4, { kind: 'lift53', levels: 3, step: 1024, baseStep: 128, coding: 'nibbles' }),
    // The cascade, quality side: decimation by 2, a wavelet on 64 samples
    // (4 levels), cosine interpolation by 2.
    cascade('8k-d2-lift4-q16-nib', 2, { kind: 'lift53', levels: 4, step: 16, baseStep: 16, coding: 'nibbles' }),
    cascade('8k-d2-lift4-q64-nib', 2, { kind: 'lift53', levels: 4, step: 64, baseStep: 16, coding: 'nibbles' }),
    cascade('8k-d2-lift4-q128-nib', 2, { kind: 'lift53', levels: 4, step: 128, baseStep: 32, coding: 'nibbles' }),
    cascade('8k-d2-lift4-q256-nib', 2, { kind: 'lift53', levels: 4, step: 256, baseStep: 64, coding: 'nibbles' }),

    // The economy profile with a softened rendering: the 8k low-pass after
    // the cosine interpolation.
    soften('8k-d4-b8-cos-soft', base('', { profile: '8k', depth: 1, interpolation: 'cosine' })),
    soften('8k-d4-lift3-q256-nib-soft', cascade('', 4, { kind: 'lift53', levels: 3, step: 256, baseStep: 64, coding: 'nibbles' })),

    // Row A5 — a block of frames. One dimension: a longer frame (f: samples).
    long('lift-f256-q64', 2, 6, 64),
    long('lift-f512-q64', 4, 7, 64),
    long('lift-f1024-q64', 8, 7, 64),
    long('lift-f256-q256', 2, 6, 256),
    long('lift-f1024-q256', 8, 7, 256),
    // Two dimensions: n frames × 128 samples, along the frame then across the frames.
    block2d('lift2d-4x128-q64', { kind: 'lift53', frames: 4, step: 64 }),
    block2d('lift2d-8x128-q64', { kind: 'lift53', frames: 8, step: 64 }),
    block2d('lift2d-16x128-q64', { kind: 'lift53', frames: 16, step: 64 }),
    block2d('lift2d-128x128-q64', { kind: 'lift53', frames: 128, step: 64 }),
    block2d('haar2d-8x128-q64', { kind: 'haar', frames: 8, step: 64 }),
    block2d('lift2d-8x128-q256', { kind: 'lift53', frames: 8, step: 256 }),
    block2d('lift2d-128x128-q256', { kind: 'lift53', frames: 128, step: 256 }),

    // Row A6 — sparse points and transition functions.
    // t: the reversal that makes a turning point, q: the step of the values
    // (both on 16-bit values), then the family of transitions.
    points('pts-t0-q16-sine', { threshold: 0, step: 16, family: 'sine' }),
    points('pts-t64-q16-sine', { threshold: 64, step: 16, family: 'sine' }),
    points('pts-t256-q64-sine', { threshold: 256, step: 64, family: 'sine' }),
    points('pts-t256-q64-cubic', { threshold: 256, step: 64, family: 'cubic' }),
    points('pts-t256-q64-linear', { threshold: 256, step: 64, family: 'linear' }),
    points('pts-t1024-q256-sine', { threshold: 1024, step: 256, family: 'sine' }),
    points('pts-t1024-q256-linear', { threshold: 1024, step: 256, family: 'linear' }),
    points('pts-t2048-q256-sine', { threshold: 2048, step: 256, family: 'sine' }),
    // A longer wait allowed before a through-point.
    points('pts-t256-q64-sine-g128', { threshold: 256, step: 64, family: 'sine', maxGap: 128 }),
    // The same behind the 8k low-pass.
    filtered('8k-pts-t256-q64-sine', points('', { threshold: 256, step: 64, family: 'sine' })),
    filtered('8k-pts-t1024-q256-sine', points('', { threshold: 1024, step: 256, family: 'sine' })),

    // After the owner's listening session (2026-11-12): the coarser economy
    // cascades with the softened decoder…
    soften('8k-d4-lift3-q512-nib-soft', cascade('', 4, { kind: 'lift53', levels: 3, step: 512, baseStep: 64, coding: 'nibbles' })),
    soften('8k-d4-lift3-q1024-nib-soft', cascade('', 4, { kind: 'lift53', levels: 3, step: 1024, baseStep: 128, coding: 'nibbles' })),
    // …and the points cumulated with the economy chain, plain and softened.
    cascadePoints('8k-d4-pts-t0-q64', 4, { threshold: 0, step: 64, family: 'sine', maxGap: 16 }),
    cascadePoints('8k-d4-pts-t256-q256', 4, { threshold: 256, step: 256, family: 'sine', maxGap: 16 }),
    soften('8k-d4-pts-t0-q64-soft', cascadePoints('', 4, { threshold: 0, step: 64, family: 'sine', maxGap: 16 })),
    soften('8k-d4-pts-t256-q256-soft', cascadePoints('', 4, { threshold: 256, step: 256, family: 'sine', maxGap: 16 })),

    // Row A4d — steps that follow the level of each frame. rN: N significant bits kept
    // under the frame's peak for the details (the base keeps two more).
    cascade('8k-d4-lift3-r7-nib', 4, { kind: 'lift53', levels: 3, step: { bits: 7 }, baseStep: { bits: 9 }, coding: 'nibbles' }),
    soften('8k-d4-lift3-r7-nib-soft', cascade('', 4, { kind: 'lift53', levels: 3, step: { bits: 7 }, baseStep: { bits: 9 }, coding: 'nibbles' })),
    cascade('8k-d4-lift3-r6-nib', 4, { kind: 'lift53', levels: 3, step: { bits: 6 }, baseStep: { bits: 8 }, coding: 'nibbles' }),
    soften('8k-d4-lift3-r6-nib-soft', cascade('', 4, { kind: 'lift53', levels: 3, step: { bits: 6 }, baseStep: { bits: 8 }, coding: 'nibbles' })),
    cascade('8k-d4-lift3-r5-nib', 4, { kind: 'lift53', levels: 3, step: { bits: 5 }, baseStep: { bits: 7 }, coding: 'nibbles' }),
    soften('8k-d4-lift3-r5-nib-soft', cascade('', 4, { kind: 'lift53', levels: 3, step: { bits: 5 }, baseStep: { bits: 7 }, coding: 'nibbles' })),
    cascade('8k-d2-lift4-r11-nib', 2, { kind: 'lift53', levels: 4, step: { bits: 11 }, baseStep: { bits: 13 }, coding: 'nibbles' }),
    cascade('8k-d2-lift4-r9-nib', 2, { kind: 'lift53', levels: 4, step: { bits: 9 }, baseStep: { bits: 11 }, coding: 'nibbles' }),
    cascade('8k-d2-lift4-r8-nib', 2, { kind: 'lift53', levels: 4, step: { bits: 8 }, baseStep: { bits: 10 }, coding: 'nibbles' }),
    wave('lift5-r10-nib', { kind: 'lift53', levels: 5, step: { bits: 10 }, baseStep: { bits: 14 }, coding: 'nibbles' }),
    wave('lift5-r9-nib', { kind: 'lift53', levels: 5, step: { bits: 9 }, baseStep: { bits: 13 }, coding: 'nibbles' }),

    // Row A7 — the retained codec, by preset.
    retained('codec-voice', { preset: 'voice' }),
    retained('codec-voice-low', { preset: 'voice-low' }),
    retained('codec-music', { preset: 'music' }),
    retained('codec-full', { preset: 'full' }),
    retained('codec-full-7', { preset: 'full', bits: 7 }),
    // Row A7b — the two full-band settings retained after listening set 5, as presets.
    retained('codec-full-low', { preset: 'full-low' }),
    retained('codec-full-fixed', { preset: 'full-fixed' }),
];
