// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingLookup } from './lookup.js';
import { testRuntime } from './_test-runtime.js';
const { ContractError } = testRuntime.resolve('fontErrors');
const { lookupEncoding, findCode, KNOWN_ENCODINGS } = testRuntime.resolve('encodingLookup');

describe('encodingLookup', () => {
    test('module metadata', () => { expect(encodingLookup.name).toBe('encodingLookup'); });
    test('known encodings', () => {
        for (const n of ['WinAnsiEncoding', 'MacRomanEncoding', 'MacExpertEncoding', 'StandardEncoding', 'Symbol', 'ZapfDingbats']) {
            expect(KNOWN_ENCODINGS).toContain(n);
        }
    });
    test('lookup', () => {
        expect(lookupEncoding('WinAnsiEncoding')[0x41]).toBe('A');
        expect(lookupEncoding('Symbol')[0x41]).toBe('Alpha');
    });
    test('findCode reverse', () => {
        expect(findCode('WinAnsiEncoding', 'A')).toBe(0x41);
        expect(findCode('Symbol', 'Alpha')).toBe(0x41);
        expect(findCode('WinAnsiEncoding', 'unknown-glyph')).toBeNull();
    });
    test('rejects unknown', () => {
        expect(() => lookupEncoding('nope')).toThrow(ContractError);
    });
});
