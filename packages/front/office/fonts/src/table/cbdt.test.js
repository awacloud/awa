// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableCbdt } from './cbdt.js';
import { testRuntime } from './_test-runtime.js';
const { parseCbdt } = testRuntime.resolve('tableCbdt');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableCbdt', () => {
    test('module metadata', () => { expect(tableCbdt.name).toBe('tableCbdt'); });
    test('parses v3 header', () => {
        const u = new Uint8Array([0, 3, 0, 0, 0xAA, 0xBB, 0xCC]);
        const t = parseCbdt(u);
        expect(t.majorVersion).toBe(3);
        const r = t.getRaw(4, 3);
        expect(Array.from(r)).toEqual([0xAA, 0xBB, 0xCC]);
    });
    test('rejects bad version', () => {
        expect(() => parseCbdt(new Uint8Array([0, 1, 0, 0]))).toThrow(ParseError);
    });
});
