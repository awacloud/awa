// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { embedToUnicodeBuilder } from './toUnicodeBuilder.js';
import { testRuntime } from './_test-runtime.js';
const { embedBuildToUnicode } = testRuntime.resolve('embedToUnicodeBuilder');

describe('embedToUnicodeBuilder', () => {
    test('module metadata', () => { expect(embedToUnicodeBuilder.name).toBe('embedToUnicodeBuilder'); });
    test('builds CMap', () => {
        const m = new Map([[1, 'A'], [2, 'B']]);
        const s = embedBuildToUnicode(m);
        expect(s).toContain('/CIDInit');
        // Consecutive cids 1,2 → 'A','B' get collapsed into a bfrange.
        expect(s).toContain('<0001> <0002> <0041>');
    });
});
