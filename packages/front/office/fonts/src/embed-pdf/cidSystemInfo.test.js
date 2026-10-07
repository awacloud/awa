// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { embedCidSystemInfo } from './cidSystemInfo.js';
import { testRuntime } from './_test-runtime.js';
const { buildCidSystemInfo } = testRuntime.resolve('embedCidSystemInfo');

describe('embedCidSystemInfo', () => {
    test('module metadata', () => { expect(embedCidSystemInfo.name).toBe('embedCidSystemInfo'); });

    test('defaults to Identity-H', () => {
        expect(buildCidSystemInfo({ os2: {} })).toEqual({ Registry: 'Adobe', Ordering: 'Identity', Supplement: 0 });
    });

    test('detects Japan1 from Shift-JIS bit', () => {
        const r = buildCidSystemInfo({ os2: { ulCodePageRange1: 0x80000000 } });
        expect(r.Ordering).toBe('Japan1');
    });

    test('detects GB1 from GB2312 bit', () => {
        const r = buildCidSystemInfo({ os2: { ulCodePageRange1: 0x40000000 } });
        expect(r.Ordering).toBe('GB1');
    });

    test('handles missing font/os2', () => {
        expect(buildCidSystemInfo(null).Ordering).toBe('Identity');
    });
});
