// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingStandard } from './standard.js';
import { testRuntime } from './_test-runtime.js';
const { STANDARD } = testRuntime.resolve('encodingStandard');

describe('encodingStandard', () => {
    test('module metadata', () => { expect(encodingStandard.name).toBe('encodingStandard'); });
    test('256 entries', () => { expect(STANDARD.length).toBe(256); });
    test('ASCII', () => {
        expect(STANDARD[0x41]).toBe('A');
        expect(STANDARD[0x27]).toBe('quoteright');   // Adobe std maps quote at 0x27
    });
    test('Adobe std high range', () => {
        expect(STANDARD[0xA1]).toBe('exclamdown');
        expect(STANDARD[0xFB]).toBe('germandbls');
        expect(STANDARD[0xAE]).toBe('fi');
    });
});
