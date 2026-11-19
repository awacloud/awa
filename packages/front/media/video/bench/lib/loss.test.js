// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the lost-packet measure (row V13).
 */

import { describe, test, expect } from 'bun:test';
import { sequences } from './sequences.js';
import { identity, hold4 } from './reference.js';
import { measureLoss, pattern } from './loss.js';

const set = sequences({ width: 64, height: 48, frames: 40, fps: 24, seed: 2 });
const byName = Object.fromEntries(set.map((s) => [s.name, s]));

describe('bench loss measure', () => {
    test('nothing lost: nothing damaged', () => {
        const row = measureLoss(identity, byName.shapes, new Set());
        expect(row.lost).toBe(0);
        expect(row.damaged).toBe(0);
        expect(row.worstGap).toBe(0);
        expect(row.repair).toBe(0);
        expect(row.healed).toBe(true);
    });

    test('a codec that sends every frame whole is damaged for the lost frames only', () => {
        const row = measureLoss(identity, byName.shapes, new Set([10, 11]));
        expect(row.lost).toBe(2);
        expect(row.damaged).toBe(2);
        expect(row.repair).toBe(1);
        expect(row.healed).toBe(true);
        expect(row.worstGap).toBeGreaterThan(10);
        // On a still scene the lost frame is the one already shown.
        expect(measureLoss(identity, byName.static, new Set([10])).damaged).toBe(0);
    });

    test('a codec that sends one frame in four stays damaged until its next packet', () => {
        const row = measureLoss(hold4, byName.shapes, new Set([12]));
        expect(row.lost).toBe(1);
        expect(row.damaged).toBe(4);
        expect(row.repair).toBe(4);
    });

    test('damage that lasts to the end is said not healed', () => {
        const frozen = {
            name: 'first-only',
            createEncoder: () => { let sent = false; return { push: (frame) => (sent ? [] : ((sent = true), [new Uint8Array(frame.buffer.slice(0))])) }; },
            createDecoder: () => ({ push: (packet) => new Uint8ClampedArray(packet) }),
        };
        const row = measureLoss(frozen, byName.static, new Set([0]));
        expect(row.healed).toBe(false);
        expect(row.repair).toBe(40);
    });

    test('patterns: one packet, a burst, a seeded share', () => {
        expect([...pattern('one', { at: 30 })]).toEqual([30]);
        expect([...pattern('burst', { at: 30, length: 3 })]).toEqual([30, 31, 32]);
        const random = pattern('random', { share: 0.05, frames: 400, seed: 7, from: 10 });
        expect(random.size).toBeGreaterThan(8);
        expect(random.size).toBeLessThan(40);
        expect(Math.min(...random)).toBeGreaterThanOrEqual(10);
        expect([...pattern('random', { share: 0.05, frames: 400, seed: 7, from: 10 })]).toEqual([...random]);
        expect(() => pattern('other', {})).toThrow(RangeError);
    });
});
