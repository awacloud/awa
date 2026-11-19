// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `video.pack` (row V7): the geometry in its two
 * forms and the packet of separable units.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { prng } from '../../bench/lib/sequences.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const pack = runtime.resolve('video.pack');

/** A mask of `n` pixels with a rectangle of ones, or random ones. */
function block(n, from, to) {
    const mask = new Uint8Array(n);
    mask.fill(1, from, to);
    return mask;
}
function noisy(n, share, seed) {
    const random = prng(seed);
    return Uint8Array.from({ length: n }, () => (random() < share ? 1 : 0));
}

describe('video.pack geometry', () => {
    const masks = [
        new Uint8Array(1000), new Uint8Array(1000).fill(1), block(1000, 0, 10), block(1000, 990, 1000),
        block(1000, 300, 420), noisy(1000, 0.5, 1), noisy(1000, 0.02, 2), noisy(1003, 0.3, 3),
    ];

    test('both forms give the mask back, and where it ends', () => {
        for (const mask of masks) {
            for (const form of ['bits', 'runs', 'auto']) {
                const bytes = pack.encodeMask(mask, form);
                const framed = Uint8Array.from([9, 9, ...bytes, 7]);
                const back = pack.decodeMask(framed, 2, mask.length);
                expect(Array.from(back.mask)).toEqual(Array.from(mask));
                expect(back.selected).toBe(mask.reduce((sum, v) => sum + v, 0));
                expect(back.end).toBe(2 + bytes.length);
            }
        }
    });

    test('auto takes the shorter form', () => {
        for (const mask of masks) {
            const auto = pack.encodeMask(mask).length;
            expect(auto).toBe(Math.min(pack.encodeMask(mask, 'bits').length, pack.encodeMask(mask, 'runs').length));
        }
        // A few objects: runs; a noisy frame: bits.
        expect(pack.encodeMask(block(100000, 4000, 9000))[0]).toBe(1);
        expect(pack.encodeMask(block(100000, 4000, 9000)).length).toBeLessThan(10);
        expect(pack.encodeMask(noisy(100000, 0.3, 4))[0]).toBe(0);
    });

    test('a run of 16 384 pixels and more is carried (finding v1)', () => {
        for (const length of [16383, 16384, 20000, 2100000]) {
            const mask = block(length + 50, 20, 20 + length);
            const back = pack.decodeMask(pack.encodeMask(mask, 'runs'), 0, mask.length);
            expect(back.selected).toBe(length);
            expect(back.mask[19]).toBe(0);
            expect(back.mask[20]).toBe(1);
            expect(back.mask[20 + length - 1]).toBe(1);
            expect(back.mask[20 + length]).toBe(0);
        }
    });

    test('a malformed geometry is refused', () => {
        expect(() => pack.decodeMask(Uint8Array.from([0, 255]), 0, 100)).toThrow();        // bitmask cut short
        expect(() => pack.decodeMask(Uint8Array.from([1, 60, 60]), 0, 100)).toThrow();     // runs overshoot
        expect(() => pack.decodeMask(Uint8Array.from([1, 60]), 0, 100)).toThrow();         // runs stop early
        expect(() => pack.decodeMask(Uint8Array.from([5, 0]), 0, 8)).toThrow();            // unknown form
        expect(() => pack.encodeMask(new Uint8Array(8), 'zip')).toThrow();
    });
});

describe('video.pack units', () => {
    const units = [
        { type: pack.types.BASE, bytes: Uint8Array.from([1, 2, 3]) },
        { type: pack.types.COLOUR, bytes: new Uint8Array(300).fill(7) },
        { type: pack.types.DETAIL, bytes: new Uint8Array(0) },
        { type: pack.types.DETAIL + 1, bytes: Uint8Array.from([9]) },
    ];

    test('units come back with their type and bytes', () => {
        const back = pack.readUnits(pack.writeUnits(units));
        expect(back.length).toBe(4);
        back.forEach((unit, k) => {
            expect(unit.type).toBe(units[k].type);
            expect(Array.from(unit.bytes)).toEqual(Array.from(units[k].bytes));
        });
        expect(pack.readUnits(new Uint8Array(0))).toEqual([]);
    });

    test('any subset of the units is a valid packet', () => {
        const kept = [units[0], units[3]];
        const back = pack.readUnits(pack.writeUnits(kept));
        expect(back.map((unit) => unit.type)).toEqual([pack.types.BASE, pack.types.DETAIL + 1]);
    });

    test('a packet cut inside a unit is refused', () => {
        const packet = pack.writeUnits(units);
        expect(() => pack.readUnits(packet.subarray(0, packet.length - 1))).toThrow();
        expect(() => pack.readUnits(packet.subarray(0, 4))).toThrow();
    });
});

describe('video.pack edge cases (pass P)', () => {
    test('a mask byte other than 0 or 1 is read as set, the same in both forms', () => {
        const pack = runtime.resolve('video.pack');
        expect(pack.encodeMask(Uint8Array.of(0, 2, 255, 0), 'runs')).toEqual(pack.encodeMask(Uint8Array.of(0, 1, 1, 0), 'runs'));
        expect(pack.encodeMask(Uint8Array.of(0, 2, 255, 0), 'bits')).toEqual(pack.encodeMask(Uint8Array.of(0, 1, 1, 0), 'bits'));
    });

    test('a unit type outside 0 to 255 is refused, not cut', () => {
        const pack = runtime.resolve('video.pack');
        expect(() => pack.writeUnits([{ type: 256, bytes: new Uint8Array(1) }])).toThrow(RangeError);
        expect(() => pack.writeUnits([{ type: -1, bytes: new Uint8Array(1) }])).toThrow(RangeError);
    });
});
