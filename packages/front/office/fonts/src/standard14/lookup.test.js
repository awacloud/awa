// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { standard14Lookup } from './lookup.js';
import { testRuntime } from './_test-runtime.js';
const { ContractError } = testRuntime.resolve('fontErrors');
const { lookupStandard14, isStandard14, STANDARD_14_NAMES } = testRuntime.resolve('standard14Lookup');

describe('standard14Lookup', () => {
    test('module metadata', () => { expect(standard14Lookup.name).toBe('standard14Lookup'); });
    test('14 standard names', () => { expect(STANDARD_14_NAMES.length).toBe(14); });
    test('lookup returns metrics', () => {
        const h = lookupStandard14('Helvetica');
        expect(h.fontName).toBe('Helvetica');
        expect(h.widths[0x41]).toBe(667);
    });
    test('isStandard14', () => {
        expect(isStandard14('Helvetica')).toBe(true);
        expect(isStandard14('Arial')).toBe(false);
    });
    test('rejects unknown', () => {
        expect(() => lookupStandard14('Arial')).toThrow(ContractError);
    });
});
