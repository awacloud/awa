// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingMacExpert } from './macExpert.js';
import { testRuntime } from './_test-runtime.js';
const { MAC_EXPERT } = testRuntime.resolve('encodingMacExpert');

describe('encodingMacExpert', () => {
    test('module metadata', () => { expect(encodingMacExpert.name).toBe('encodingMacExpert'); });
    test('256 entries', () => { expect(MAC_EXPERT.length).toBe(256); });
    test('expert smalls + figures', () => {
        expect(MAC_EXPERT[0x30]).toBe('zerooldstyle');
        expect(MAC_EXPERT[0x47]).toBe('onequarter');
        expect(MAC_EXPERT[0x61]).toBe('Asmall');
        expect(MAC_EXPERT[0x7A]).toBe('Zsmall');
    });
    test('sparse — undefined slots are .notdef', () => {
        expect(MAC_EXPERT[0x00]).toBe('.notdef');
        expect(MAC_EXPERT[0x80]).toBe('.notdef');
    });
});
