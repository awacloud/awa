// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableLtsh } from './ltsh.js';
import { testRuntime } from './_test-runtime.js';
const { parseLtsh } = testRuntime.resolve('tableLtsh');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableLtsh', () => {
    test('module metadata', () => { expect(tableLtsh.name).toBe('tableLtsh'); });
    test('parses yPels', () => {
        const u = new Uint8Array([0, 0, 0, 3, 8, 9, 10]);
        const t = parseLtsh(u);
        expect(t.numGlyphs).toBe(3);
        expect(Array.from(t.yPels)).toEqual([8, 9, 10]);
    });
    test('rejects truncated', () => {
        const u = new Uint8Array([0, 0, 0, 5, 1, 2]);
        expect(() => parseLtsh(u)).toThrow(ParseError);
    });
});
