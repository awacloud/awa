// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingZapfDingbats } from './zapfDingbats.js';
import { testRuntime } from './_test-runtime.js';
const { ZAPF_DINGBATS } = testRuntime.resolve('encodingZapfDingbats');

describe('encodingZapfDingbats', () => {
    test('module metadata', () => { expect(encodingZapfDingbats.name).toBe('encodingZapfDingbats'); });
    test('256 entries', () => { expect(ZAPF_DINGBATS.length).toBe(256); });
    test('aN naming convention', () => {
        expect(ZAPF_DINGBATS[0x21]).toBe('a1');
        expect(ZAPF_DINGBATS[0x41]).toBe('a10');
        expect(ZAPF_DINGBATS[0xFE]).toBe('a191');
    });
});
