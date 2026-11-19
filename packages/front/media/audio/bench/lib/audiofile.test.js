// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the bench's readers of real audio files (row A2b):
 * PCM WAV, FLAC, the mono mix and the rate conversion.
 *
 * The FLAC fixtures built here use verbatim and constant subframes only.
 * The predicted and Rice-coded paths are proven on real files, by the MD5
 * of the decoded samples that every FLAC file carries (see the track).
 */

import { describe, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { readWav, decodeFlac, toMono, resample } from './audiofile.js';
import { snr } from './metrics.js';

/** A PCM WAV file from interleaved integer samples. */
function wav(interleaved, channels, bits, rate) {
    const bytesPer = bits / 8;
    const out = new Uint8Array(44 + interleaved.length * bytesPer);
    const view = new DataView(out.buffer);
    const ascii = (at, text) => { for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i); };
    ascii(0, 'RIFF'); view.setUint32(4, out.length - 8, true); ascii(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * channels * bytesPer, true);
    view.setUint16(32, channels * bytesPer, true); view.setUint16(34, bits, true);
    ascii(36, 'data'); view.setUint32(40, interleaved.length * bytesPer, true);
    interleaved.forEach((v, i) => {
        for (let b = 0; b < bytesPer; b++) out[44 + i * bytesPer + b] = (v >> (8 * b)) & 0xff;
    });
    return out;
}

/** Writes bits, most significant first. */
function bitWriter() {
    const bytes = [];
    let current = 0;
    let filled = 0;
    return {
        bytes,
        put(value, count) {
            for (let i = count - 1; i >= 0; i--) {
                current = (current << 1) | (Math.floor(value / 2 ** i) & 1);
                if (++filled === 8) { bytes.push(current); current = 0; filled = 0; }
            }
        },
        align() { while (filled !== 0) this.put(0, 1); },
    };
}

/**
 * A minimal FLAC file: 16-bit, blocks of `block` samples, one subframe
 * kind per channel.
 * @param {Int32Array[]} channels
 * @param {{ rate: number, block: number, assignment?: number, constant?: boolean }} options
 */
function flac(channels, { rate, block, assignment = channels.length - 1, constant = false }) {
    const total = channels[0].length;
    const w = bitWriter();
    for (const c of 'fLaC') w.put(c.charCodeAt(0), 8);
    w.put(0x80, 8); w.put(34, 24);                              // last block: STREAMINFO
    w.put(block, 16); w.put(block, 16); w.put(0, 24); w.put(0, 24);
    w.put(rate, 20); w.put(channels.length - 1, 3); w.put(15, 5); w.put(total, 36);
    const pcm = new Uint8Array(total * channels.length * 2);
    for (let i = 0; i < total; i++) channels.forEach((ch, c) => new DataView(pcm.buffer).setInt16((i * channels.length + c) * 2, ch[i], true));
    for (const byte of createHash('md5').update(pcm).digest()) w.put(byte, 8);
    for (let start = 0, frame = 0; start < total; start += block, frame++) {
        const n = Math.min(block, total - start);
        w.put(0xfff8, 16);
        w.put(7, 4); w.put(0, 4);                               // block size in 16 bits; rate from STREAMINFO
        w.put(assignment, 4); w.put(4, 3); w.put(0, 1);         // 16 bits
        w.put(frame, 8);                                        // frame number (one UTF-8 byte: under 128 frames)
        w.put(n - 1, 16);
        w.put(0, 8);                                            // CRC-8, not checked
        // Stereo decorrelation, as an encoder would do it.
        let subs = channels.map((ch) => ch.subarray(start, start + n));
        if (assignment === 8) subs = [subs[0], subs[0].map((v, i) => v - subs[1][i])];
        if (assignment === 10) subs = [subs[0].map((v, i) => (v + subs[1][i]) >> 1), subs[0].map((v, i) => v - subs[1][i])];
        subs.forEach((sub, c) => {
            const bits = 16 + ((assignment === 8 || assignment === 10) && c === 1 ? 1 : 0);
            w.put(0, 1);
            if (constant) { w.put(0, 6); w.put(0, 1); w.put(sub[0] < 0 ? sub[0] + 2 ** bits : sub[0], bits); return; }
            w.put(1, 6); w.put(0, 1);                           // verbatim
            for (const v of sub) w.put(v < 0 ? v + 2 ** bits : v, bits);
        });
        w.align();
        w.put(0, 16);                                           // CRC-16, not checked
    }
    return Uint8Array.from(w.bytes);
}

const left = Int32Array.from({ length: 1000 }, (_, i) => Math.round(12000 * Math.sin(i / 7)));
const right = Int32Array.from({ length: 1000 }, (_, i) => Math.round(-9000 * Math.sin(i / 11) + 300));

describe('readWav', () => {
    test('16-bit stereo and 24-bit mono are read to floats per channel', () => {
        const stereo = readWav(wav(Array.from({ length: 2000 }, (_, i) => (i % 2 ? right : left)[i >> 1]), 2, 16, 48000));
        expect(stereo.rate).toBe(48000);
        expect(stereo.channels.length).toBe(2);
        expect(stereo.channels[0][5]).toBeCloseTo(left[5] / 32768, 9);
        expect(stereo.channels[1][999]).toBeCloseTo(right[999] / 32768, 9);
        const mono = readWav(wav([0, 8388607, -8388608, 4194304], 1, 24, 44100));
        expect(Array.from(mono.channels[0])).toEqual([0, Math.fround(8388607 / 8388608), -1, 0.5]);
    });

    test('a file that is not PCM is refused', () => {
        const bytes = wav([0, 0], 1, 16, 44100);
        bytes[20] = 3;
        expect(() => readWav(bytes)).toThrow();
        expect(() => readWav(new Uint8Array(10))).toThrow();
    });
});

describe('decodeFlac', () => {
    test('independent, left/side and mid/side stereo decode to the samples, MD5 right', () => {
        for (const assignment of [1, 8, 10]) {
            const file = decodeFlac(flac([left, right], { rate: 48000, block: 256, assignment }));
            expect(file.rate).toBe(48000);
            expect(file.bits).toBe(16);
            expect(file.total).toBe(1000);
            expect(file.md5Checked).toBe(true);
            for (let i = 0; i < 1000; i++) {
                if (file.channels[0][i] !== Math.fround(left[i] / 32768) || file.channels[1][i] !== Math.fround(right[i] / 32768)) throw new Error(`${assignment}: sample ${i}`);
            }
        }
    });

    test('constant subframes and a mono stream decode', () => {
        const flat = new Int32Array(600).fill(-1234);
        const file = decodeFlac(flac([flat], { rate: 44100, block: 200, constant: true }));
        expect(file.channels.length).toBe(1);
        expect(file.channels[0].every((v) => v === Math.fround(-1234 / 32768))).toBe(true);
        expect(file.md5Checked).toBe(true);
    });

    test('a range keeps only its samples; the whole file is still verified', () => {
        const file = decodeFlac(flac([left, right], { rate: 48000, block: 256 }), { start: 300, count: 450 });
        expect(file.channels[0].length).toBe(450);
        expect(file.channels[0][0]).toBe(Math.fround(left[300] / 32768));
        expect(file.channels[1][449]).toBe(Math.fround(right[749] / 32768));
        expect(file.md5Checked).toBe(true);
    });

    test('a damaged stream fails its MD5; a non-FLAC file is refused', () => {
        const bytes = flac([left, right], { rate: 48000, block: 256 });
        bytes[bytes.length - 20] ^= 0x10;
        expect(decodeFlac(bytes).md5Checked).toBe(false);
        expect(() => decodeFlac(new Uint8Array([1, 2, 3, 4, 5]))).toThrow();
    });
});

describe('toMono and resample', () => {
    test('the mono mix is the mean of the channels', () => {
        const mono = toMono([Float32Array.from([1, 0, -0.5]), Float32Array.from([0, 0, 0.5])]);
        expect(Array.from(mono)).toEqual([0.5, 0, 0]);
    });

    test('48 kHz to 44.1 kHz keeps a tone and its length', () => {
        const n = 48000;
        const tone = Float32Array.from({ length: n }, (_, i) => 0.7 * Math.sin((2 * Math.PI * 1000 * i) / 48000));
        const out = resample(tone, 48000, 44100);
        expect(out.length).toBe(44100);
        const ideal = Float32Array.from({ length: 44100 }, (_, i) => 0.7 * Math.sin((2 * Math.PI * 1000 * i) / 44100));
        // Away from the two ends, where the filter lacks samples.
        expect(snr(ideal.subarray(200, 43900), out.subarray(200, 43900))).toBeGreaterThan(60);
    });

    test('what lies above the new band is removed; the same rate is a copy', () => {
        const high = Float32Array.from({ length: 48000 }, (_, i) => 0.7 * Math.sin((2 * Math.PI * 23000 * i) / 48000));
        const out = resample(high, 48000, 44100);
        let peak = 0;
        for (let i = 200; i < out.length - 200; i++) peak = Math.max(peak, Math.abs(out[i]));
        expect(peak).toBeLessThan(0.02);
        const same = resample(high, 48000, 48000);
        expect(same).toEqual(high);
    });
});
