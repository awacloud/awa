// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the block-of-frames experiment (row A5) and of
 * the bench harness's support for codecs that buffer.
 */

import { describe, test, expect } from 'bun:test';
import { signals } from '../lib/signals.js';
import { runCodec } from '../lib/harness.js';
import { blocked, block2d } from './block2d.js';
import { modules } from './modules.js';

const RATE = 44100;
const voiced = signals({ rate: RATE, seconds: 2, seed: 5 })[3];
const toInt = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));

/** Pushes whole frames, then flushes; returns the decoded samples and the packets. */
function run(codec, samples) {
    const encoder = codec.createEncoder(RATE);
    const decoder = codec.createDecoder(RATE);
    const packets = [];
    const parts = [];
    const take = (list) => {
        for (const packet of list) {
            packets.push(packet);
            parts.push(...decoder.push(packet));
        }
    };
    for (let f = 0; (f + 1) * 128 <= samples.length; f++) take(encoder.push(samples.subarray(f * 128, (f + 1) * 128)));
    take(encoder.flush());
    const out = new Float32Array(parts.reduce((sum, p) => sum + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return { out, packets };
}

describe('block2d', () => {
    test('with steps of 1 the decoded block is the 16-bit input, exactly', () => {
        for (const kind of ['haar', 'lift53']) {
            for (const frames of [4, 16]) {
                const samples = voiced.samples.subarray(0, 128 * 64);
                const { out, packets } = run(block2d('exact', { kind, frames, step: 1 }), samples);
                expect(packets.length).toBe(64 / frames);
                expect(out.length).toBe(samples.length);
                for (let i = 0; i < out.length; i++) {
                    if (out[i] !== Math.fround(toInt(samples[i]) / 32767)) throw new Error(`${kind} ${frames}: sample ${i}`);
                }
            }
        }
    });

    test('an incomplete last block is completed by flush', () => {
        const samples = voiced.samples.subarray(0, 128 * 10);
        const { out, packets } = run(block2d('partial', { kind: 'lift53', frames: 8, step: 1 }), samples);
        expect(packets.length).toBe(2);
        expect(out.length).toBe(128 * 16);
        for (let i = 0; i < samples.length; i++) {
            if (out[i] !== Math.fround(toInt(samples[i]) / 32767)) throw new Error(`sample ${i}`);
        }
        for (let i = samples.length; i < out.length; i++) expect(out[i] === 0).toBe(true);
    });

    test('a packet cut after a unit still decodes a whole block', () => {
        const codec = block2d('cut', { kind: 'lift53', frames: 8, step: 64 });
        const encoder = codec.createEncoder(RATE);
        let packet = null;
        for (let f = 0; f < 8; f++) packet = encoder.push(voiced.samples.subarray((40 + f) * 128, (41 + f) * 128))[0] ?? packet;
        const ends = codec.units(packet);
        expect(ends.length).toBe(6);
        expect(ends[5]).toBe(packet.length);
        for (const end of ends) {
            const frames = codec.createDecoder(RATE).push(packet.subarray(0, end));
            expect(frames.length).toBe(1);
            expect(frames[0].length).toBe(8 * 128);
        }
        expect(() => codec.createDecoder(RATE).push(packet.subarray(0, ends[1] - 1))).toThrow();
    });

    test('a larger step costs fewer bytes', () => {
        const bytes = (step) => run(block2d('q', { kind: 'lift53', frames: 8, step }), voiced.samples).packets.reduce((sum, p) => sum + p.length, 0);
        expect(bytes(256)).toBeLessThan(bytes(64));
        expect(bytes(64)).toBeLessThan(bytes(1));
    });
});

describe('blocked (one dimension, longer frame)', () => {
    test('n frames become one frame of the inner codec, exact at step 1', () => {
        const { wavelet } = modules;
        const codec = blocked('long', 4, {
            createEncoder: () => wavelet.createEncoder({ kind: 'lift53', levels: 7, step: 1, coding: 'nibbles', frame: 512 }),
            createDecoder: () => wavelet.createDecoder({ frame: 512 }),
        });
        const samples = voiced.samples.subarray(0, 128 * 40);
        const { out, packets } = run(codec, samples);
        expect(packets.length).toBe(10);
        expect(codec.latency).toBe(3 * 128);
        for (let i = 0; i < out.length; i++) {
            if (out[i] !== Math.fround(toInt(samples[i]) / 32767)) throw new Error(`sample ${i}`);
        }
    });
});

describe('harness with a buffering codec', () => {
    test('flush is called, the whole signal is scored, the latency is reported', () => {
        const row = runCodec(block2d('lift2d', { kind: 'lift53', frames: 8, step: 1 }), voiced, RATE);
        // 689 frames: 86 whole blocks and one completed by flush.
        expect(row.packets).toBe(87);
        expect(row.snr).toBeGreaterThan(80);
        expect(row.latencyMs).toBeCloseTo((7 * 128 * 1000) / RATE, 6);
        expect(row.decoded.length).toBe(voiced.samples.length);
    });
});
