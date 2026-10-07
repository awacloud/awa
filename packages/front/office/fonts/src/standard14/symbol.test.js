// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { standard14Symbol } from './symbol.js';
import { testRuntime } from './_test-runtime.js';
const { SYMBOL_WIDTHS, symbolFont } = testRuntime.resolve('standard14Symbol');

describe('standard14Symbol', () => {
    test('module metadata', () => { expect(standard14Symbol.name).toBe('standard14Symbol'); });
    test('Symbolic flag set', () => { expect(symbolFont.flags & 0x04).toBe(0x04); });
    test('widths length 256', () => { expect(SYMBOL_WIDTHS.length).toBe(256); });
    test('built-in encoding', () => { expect(symbolFont.encoding).toBe('Symbol'); });
});
