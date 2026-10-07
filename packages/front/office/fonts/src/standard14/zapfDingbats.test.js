// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { standard14ZapfDingbats } from './zapfDingbats.js';
import { testRuntime } from './_test-runtime.js';
const { ZAPF_WIDTHS, zapfDingbatsFont } = testRuntime.resolve('standard14ZapfDingbats');

describe('standard14ZapfDingbats', () => {
    test('module metadata', () => { expect(standard14ZapfDingbats.name).toBe('standard14ZapfDingbats'); });
    test('Symbolic flag', () => { expect(zapfDingbatsFont.flags & 0x04).toBe(0x04); });
    test('widths populated for printable ASCII', () => {
        expect(ZAPF_WIDTHS[0x41]).toBe(600);
        expect(ZAPF_WIDTHS[0x20]).toBe(278);
    });
});
