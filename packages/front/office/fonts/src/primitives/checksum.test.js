// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontChecksum } from './checksum.js';
const { calcTableChecksum, computeChecksumAdjustment } = fontChecksum.factory();

describe('fontChecksum', () => {
    test('module metadata', () => {
        expect(fontChecksum.name).toBe('fontChecksum');
    });

    test('checksum of empty buffer is 0', () => {
        expect(calcTableChecksum(new Uint8Array(0))).toBe(0);
    });

    test('checksum of a single 4-byte BE word', () => {
        expect(calcTableChecksum(new Uint8Array([0x00, 0x00, 0x00, 0x01]))).toBe(1);
        expect(calcTableChecksum(new Uint8Array([0x00, 0x01, 0x00, 0x00]))).toBe(0x00010000);
    });

    test('checksum sums multiple words', () => {
        const u = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3]);
        expect(calcTableChecksum(u)).toBe(6);
    });

    test('checksum pads tail with zeros', () => {
        // 5 bytes -> word1 = bytes[0..3] = 0x00000001, word2 padded = 0xFF000000
        const u = new Uint8Array([0, 0, 0, 1, 0xFF]);
        expect(calcTableChecksum(u)).toBe((1 + 0xFF000000) >>> 0);
    });

    test('wraps modulo 2^32', () => {
        const u = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02]);
        // 0xFFFFFFFF + 2 = 0x100000001 -> mod 2^32 = 1
        expect(calcTableChecksum(u)).toBe(1);
    });

    test('checksumAdjustment = 0xB1B0AFBA - sum', () => {
        const u = new Uint8Array([0, 0, 0, 1]);
        expect(computeChecksumAdjustment(u)).toBe((0xB1B0AFBA - 1) >>> 0);
    });
});
