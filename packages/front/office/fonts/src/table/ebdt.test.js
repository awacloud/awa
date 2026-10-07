// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableEbdt } from './ebdt.js';
import { testRuntime } from './_test-runtime.js';
const { parseEbdt } = testRuntime.resolve('tableEbdt');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableEbdt', () => {
    test('module metadata', () => { expect(tableEbdt.name).toBe('tableEbdt'); });
    test('parses v2 header', () => {
        const u = new Uint8Array([0, 2, 0, 0, 0x01, 0x02, 0x03]);
        const t = parseEbdt(u);
        expect(t.majorVersion).toBe(2);
        const r = t.getRaw(4, 3);
        expect(Array.from(r)).toEqual([1, 2, 3]);
    });
    test('parses v3 header', () => {
        const u = new Uint8Array([0, 3, 0, 0]);
        expect(parseEbdt(u).majorVersion).toBe(3);
    });
    test('returns null for out-of-range raw slice', () => {
        const t = parseEbdt(new Uint8Array([0, 2, 0, 0]));
        expect(t.getRaw(10, 5)).toBeNull();
    });
    test('rejects bad version', () => {
        expect(() => parseEbdt(new Uint8Array([0, 1, 0, 0]))).toThrow(ParseError);
    });
    test('rejects truncated header', () => {
        expect(() => parseEbdt(new Uint8Array([0, 2]))).toThrow(ParseError);
    });
});
