// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `audio.nibbles` (row A5): the 4-bit band coding
 * and the plain 4-bit variable-length integers.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../main.js';
import { prng } from '../../bench/lib/signals.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const nibbles = runtime.resolve('audio.nibbles');

describe('audio.nibbles band coding', () => {
    test('a band round-trips, scaled by the step', () => {
        const random = prng(3);
        for (const spread of [1, 6, 40, 70000]) {
            const values = Int32Array.from({ length: 200 }, () => (random() < 0.6 ? 0 : Math.round((random() - 0.5) * 2 * spread)));
            const bytes = [];
            nibbles.put(bytes, values);
            const out = new Int32Array(200);
            const end = nibbles.read(Uint8Array.from(bytes), 0, out, 4);
            expect(end).toBe(bytes.length);
            expect(Array.from(out)).toEqual(Array.from(values, (v) => v * 4));
        }
    });

    test('an all-zero band is one byte; two bands follow each other', () => {
        const bytes = [];
        nibbles.put(bytes, new Int32Array(64));
        expect(bytes).toEqual([0xff]);
        nibbles.put(bytes, Int32Array.from([1, 0, 0, 0, 0, -2]));
        const packet = Uint8Array.from(bytes);
        const first = new Int32Array(64);
        const second = new Int32Array(6);
        const middle = nibbles.read(packet, 0, first, 1);
        expect(middle).toBe(1);
        expect(nibbles.read(packet, middle, second, 1)).toBe(packet.length);
        expect(Array.from(second)).toEqual([1, 0, 0, 0, 0, -2]);
    });

    test('a stream that runs out or overshoots is refused', () => {
        expect(() => nibbles.read(Uint8Array.from([0x00]), 0, new Int32Array(8), 1)).toThrow();
        expect(() => nibbles.read(Uint8Array.from([0xef]), 0, new Int32Array(8), 1)).toThrow();
    });
});

describe('audio.nibbles integers', () => {
    test('unsigned and signed integers round-trip in order', () => {
        const bytes = [];
        const writer = nibbles.writer(bytes);
        const unsigned = [0, 1, 7, 8, 63, 64, 1000, 65535, 1 << 20];
        const signed = [0, -1, 1, -4, 4, -300, 300, -32768, 32767];
        for (const u of unsigned) writer.unsigned(u);
        for (const v of signed) writer.signed(v);
        writer.end();
        const reader = nibbles.reader(Uint8Array.from(bytes));
        for (const u of unsigned) expect(reader.unsigned()).toBe(u);
        for (const v of signed) expect(reader.signed()).toBe(v);
    });

    test('small values cost one nibble, the next range two', () => {
        const cost = (u) => {
            const bytes = [];
            const writer = nibbles.writer(bytes);
            for (let i = 0; i < 16; i++) writer.unsigned(u);
            writer.end();
            return bytes.length / 16;
        };
        expect(cost(7)).toBe(0.5);
        expect(cost(8)).toBe(1);
        expect(cost(63)).toBe(1);
        expect(cost(64)).toBe(1.5);
    });

    test('reading past the end is refused', () => {
        const reader = nibbles.reader(Uint8Array.from([0x12]));
        expect(reader.unsigned()).toBe(1);
        expect(reader.unsigned()).toBe(2);
        expect(() => reader.unsigned()).toThrow();
    });
});
