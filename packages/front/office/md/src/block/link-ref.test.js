// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for ./link-ref.js — block-phase link reference
 * definition parsing.
 */

import { describe, test, expect } from 'bun:test';
import { testRuntime } from './_test-runtime.js';

const { parseReference } = testRuntime.resolve('mdBlockLinkRef');

describe('link-ref module', () => {
    test('parseReference is a function', () => {
        expect(typeof parseReference).toBe('function');
    });

    test('parses a simple definition', () => {
        const refmap = {};
        const n = parseReference('[foo]: /url\n', refmap);
        expect(n).toBeGreaterThan(0);
        expect(refmap.FOO).toBeDefined();
        expect(refmap.FOO.destination).toBe('/url');
        expect(refmap.FOO.title).toBeNull();
    });

    test('parses a definition with a quoted title', () => {
        const refmap = {};
        const n = parseReference('[bar]: /baz "the title"\n', refmap);
        expect(n).toBeGreaterThan(0);
        expect(refmap.BAR.destination).toBe('/baz');
        expect(refmap.BAR.title).toBe('the title');
    });

    test('returns 0 if no definition is present', () => {
        const refmap = {};
        const n = parseReference('not a definition\n', refmap);
        expect(n).toBe(0);
        expect(Object.keys(refmap)).toEqual([]);
    });

    test('returns 0 for empty label', () => {
        const refmap = {};
        const n = parseReference('[]: /url\n', refmap);
        expect(n).toBe(0);
    });

    test('normalizes label case', () => {
        const refmap = {};
        parseReference('[FoO]: /x\n', refmap);
        expect(refmap.FOO).toBeDefined();
    });
});
