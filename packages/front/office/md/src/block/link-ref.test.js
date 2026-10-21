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

    test('a label may hold a backslash just before a line end', () => {
        for (const src of ['[\\\nfoo]: /uri\n', '[a\\\nfoo]: /uri\n']) {
            const refmap = {};
            expect(parseReference(src, refmap)).toBe(src.length);
            expect(Object.values(refmap)[0].destination).toBe('/uri');
        }
    });

    test('an empty title followed by text is dropped, the definition is kept', () => {
        for (const second of ['""third [test]\n', "''third\n", '()third\n']) {
            for (const first of ['[test]:example\n', '[test]: example\n']) {
                const refmap = {};
                expect(parseReference(first + second, refmap)).toBe(first.length);
                expect(refmap.TEST.destination).toBe('example');
                expect(refmap.TEST.title).toBeNull();
            }
        }
    });

    test('a title that ends the line is kept, an empty one included', () => {
        const refmap = {};
        expect(parseReference('[a]: /u ""\n', refmap)).toBe(11);
        expect(refmap.A.destination).toBe('/u');
        const withTitle = {};
        expect(parseReference('[b]: /u\n"t"\n', withTitle)).toBe(12);
        expect(withTitle.B.title).toBe('t');
    });

    test('text after the destination or after a same-line title rejects the definition', () => {
        for (const src of ['[a]: /u x\n', '[a]: /u "t" x\n', '[a]: /u "" x\n']) {
            const refmap = {};
            expect(parseReference(src, refmap)).toBe(0);
            expect(Object.keys(refmap)).toEqual([]);
        }
    });
});
