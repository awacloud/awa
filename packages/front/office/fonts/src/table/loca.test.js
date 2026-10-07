// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableLoca } from './loca.js';
import { testRuntime } from './_test-runtime.js';
const { parseLoca, encodeLoca } = testRuntime.resolve('tableLoca');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableLoca', () => {
    test('module metadata', () => { expect(tableLoca.name).toBe('tableLoca'); });

    test('short roundtrip', () => {
        const offsets = new Uint32Array([0, 4, 8, 12]);
        const { bytes, indexToLocFormat } = encodeLoca(offsets);
        expect(indexToLocFormat).toBe(0);
        const dec = parseLoca(bytes, 3, 0);
        expect(Array.from(dec)).toEqual([0, 4, 8, 12]);
    });

    test('long roundtrip when offsets exceed short range', () => {
        const offsets = new Uint32Array([0, 200000]);
        const { bytes, indexToLocFormat } = encodeLoca(offsets);
        expect(indexToLocFormat).toBe(1);
        const dec = parseLoca(bytes, 1, 1);
        expect(dec[1]).toBe(200000);
    });

    test('forces long when an offset is odd', () => {
        const offsets = new Uint32Array([0, 7]);
        const { indexToLocFormat } = encodeLoca(offsets);
        expect(indexToLocFormat).toBe(1);
    });

    test('rejects bad format', () => {
        expect(() => parseLoca(new Uint8Array(8), 1, 2)).toThrow(ParseError);
    });

    test('rejects short input', () => {
        expect(() => parseLoca(new Uint8Array(2), 5, 0)).toThrow(ParseError);
    });
});
