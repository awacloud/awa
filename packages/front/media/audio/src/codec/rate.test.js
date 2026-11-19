// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `audio.codec` at 48 000 Hz (row A10): the same
 * chain at the browsers' rate, a stream that says its rate, a decoder
 * that follows it.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../main.js';
import { signals } from '../../bench/lib/signals.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const codec = runtime.resolve('audio.codec');
const [, , , voiced] = signals({ rate: 48000, seconds: 1, seed: 7 }).map((s) => s.samples);

/** Encodes `x` frame by frame; returns the packets. */
function encode(x, config) {
    const encoder = codec.createEncoder(config);
    const packets = [];
    for (let f = 0; (f + 1) * 128 <= x.length; f++) packets.push(...encoder.push(x.subarray(f * 128, (f + 1) * 128)));
    return packets;
}

/** Decodes packets one by one into one signal. */
function decode(packets, decoder) {
    const out = new Float32Array(packets.length * 128);
    packets.forEach((packet, f) => out.set(decoder.push(packet)[0], f * 128));
    return out;
}

describe('audio.codec at 48 000 Hz', () => {
    test('every preset is the same chain at either rate: same packets after the header, same samples', () => {
        for (const preset of Object.keys(codec.presets)) {
            const at44 = encode(voiced, { rate: 44100, preset });
            const at48 = encode(voiced, { rate: 48000, preset });
            expect(at48.length).toBe(at44.length);
            for (let f = 0; f < at44.length; f++) expect(at48[f].subarray(1)).toEqual(at44[f].subarray(1));
            const out44 = decode(at44, codec.createDecoder({ rate: 44100 }));
            const out48 = decode(at48, codec.createDecoder({ rate: 48000 }));
            expect(out48).toEqual(out44);
        }
    });

    test('the header says the rate; a 44 100 Hz stream is unchanged', () => {
        // The header bytes of 0.2.0: version 1, the softening wish, the decimation.
        const before = { voice: 0x16, 'voice-low': 0x16, music: 0x11, full: 0x10, 'full-low': 0x10, 'full-fixed': 0x10 };
        for (const [preset, header] of Object.entries(before)) {
            // No rate given: 48 000 Hz since the owner's ruling D25.
            expect(encode(voiced.subarray(0, 128), { preset })[0][0]).toBe(header | 8);
            expect(encode(voiced.subarray(0, 128), { rate: 44100, preset })[0][0]).toBe(header);
            expect(encode(voiced.subarray(0, 128), { rate: 48000, preset })[0][0]).toBe(header | 8);
        }
    });

    test('a decoder follows the rate of its stream and tells it', () => {
        const decoder = codec.createDecoder();
        expect(decoder.rate).toBeNull();
        decoder.push(encode(voiced.subarray(0, 128), { rate: 48000, preset: 'voice' })[0]);
        expect(decoder.rate).toBe(48000);
        decoder.push(encode(voiced.subarray(0, 128), { rate: 44100, preset: 'voice' })[0]);
        expect(decoder.rate).toBe(44100);
        expect(codec.createDecoder({ rate: 48000 }).rate).toBe(48000);
    });

    test('a decoder created with a rate refuses a packet of the other rate', () => {
        const at48 = encode(voiced.subarray(0, 128), { rate: 48000, preset: 'music' })[0];
        const at44 = encode(voiced.subarray(0, 128), { rate: 44100, preset: 'music' })[0];
        expect(() => codec.createDecoder({ rate: 44100 }).push(at48)).toThrow(RangeError);
        expect(() => codec.createDecoder({ rate: 48000 }).push(at44)).toThrow(RangeError);
    });

    test('the delay is the same in samples at both rates', () => {
        for (const preset of Object.keys(codec.presets)) {
            expect(codec.delay({ rate: 48000, preset })).toBe(codec.delay({ rate: 44100, preset }));
        }
    });

    test('48 000 Hz by default, the browsers’ rate (D25); a 44 100 Hz stream still says it', () => {
        const [packet] = encode(voiced.subarray(0, 128), { preset: 'voice' });
        expect(packet[0] & 8).toBe(8);                         // the header's 48 000 Hz bit
        const decoder = codec.createDecoder();
        decoder.push(packet);
        expect(decoder.rate).toBe(48000);
        expect(codec.delay({ preset: 'voice' })).toBe(codec.delay({ rate: 48000, preset: 'voice' }));
        const [old] = encode(voiced.subarray(0, 128), { rate: 44100, preset: 'voice' });
        expect(old[0] & 8).toBe(0);
    });

    test('any other rate is refused', () => {
        for (const rate of [8000, 16000, 32000, 96000, 44100.5]) {
            expect(() => codec.createEncoder({ rate })).toThrow(RangeError);
            expect(() => codec.createDecoder({ rate })).toThrow(RangeError);
            expect(() => codec.delay({ rate })).toThrow(RangeError);
        }
    });
});
