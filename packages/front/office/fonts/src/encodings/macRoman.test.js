// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingMacRoman } from './macRoman.js';
import { testRuntime } from './_test-runtime.js';
const { MAC_ROMAN, lookup } = testRuntime.resolve('encodingMacRoman');

describe('encodingMacRoman', () => {
    test('module metadata', () => { expect(encodingMacRoman.name).toBe('encodingMacRoman'); });
    test('256 entries', () => { expect(MAC_ROMAN.length).toBe(256); });
    test('ASCII', () => {
        expect(MAC_ROMAN[0x41]).toBe('A');
        expect(MAC_ROMAN[0x60]).toBe('grave');
    });
    test('high range', () => {
        expect(MAC_ROMAN[0x80]).toBe('Adieresis');
        expect(MAC_ROMAN[0xA9]).toBe('copyright');
    });
    test('factory lookup', () => {
        expect(lookup(0x41)).toBe('A');
    });
});
