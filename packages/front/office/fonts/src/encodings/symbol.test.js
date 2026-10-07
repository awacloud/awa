// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingSymbol } from './symbol.js';
import { testRuntime } from './_test-runtime.js';
const { SYMBOL } = testRuntime.resolve('encodingSymbol');

describe('encodingSymbol', () => {
    test('module metadata', () => { expect(encodingSymbol.name).toBe('encodingSymbol'); });
    test('256 entries', () => { expect(SYMBOL.length).toBe(256); });
    test('Greek uppercase', () => {
        expect(SYMBOL[0x41]).toBe('Alpha');
        expect(SYMBOL[0x57]).toBe('Omega');
    });
    test('math operators', () => {
        expect(SYMBOL[0xC8]).toBe('union');
        expect(SYMBOL[0xD6]).toBe('radical');
    });
});
