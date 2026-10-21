// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for ./autolink-ext.js — GFM extended autolinks.
 */

import { describe, test, expect } from 'bun:test';
import { Node, runtime } from '../../tests/_helpers/build.js';

const {
    trimTrailingPunct, scanExtAutolinks, processExtendedAutolinks
} = runtime.resolve('mdInlineAutolinkExt');
const { makeText } = runtime.resolve('mdInlineHelpers');

describe('autolink-ext module', () => {
    test('trimTrailingPunct strips ASCII punctuation', () => {
        expect(trimTrailingPunct('http://x.com.')).toBe('http://x.com');
        expect(trimTrailingPunct('http://x.com!')).toBe('http://x.com');
        expect(trimTrailingPunct('http://x.com')).toBe('http://x.com');
    });

    test('trimTrailingPunct strips unbalanced trailing close-paren', () => {
        expect(trimTrailingPunct('http://x.com)')).toBe('http://x.com');
        expect(trimTrailingPunct('http://x.com/(a)')).toBe('http://x.com/(a)');
    });

    test('trimTrailingPunct strips trailing entity suffix', () => {
        expect(trimTrailingPunct('http://x.com&amp;')).toBe('http://x.com');
    });

    test('scanExtAutolinks finds bare http URL', () => {
        const m = scanExtAutolinks('see http://example.com here');
        expect(m.length).toBe(1);
        expect(m[0].url).toBe('http://example.com');
        expect(m[0].isWww).toBe(false);
        expect(m[0].isEmail).toBe(false);
    });

    test('scanExtAutolinks finds www. URL when ≥2 dots', () => {
        const m = scanExtAutolinks('see www.example.com here');
        expect(m.length).toBe(1);
        expect(m[0].isWww).toBe(true);
    });

    test('scanExtAutolinks finds email', () => {
        const m = scanExtAutolinks('write a@b.com please');
        expect(m.length).toBe(1);
        expect(m[0].isEmail).toBe(true);
    });

    test('an email address ending in - or _ is not an autolink (GFM 6.9: only . may end it)', () => {
        for (const text of ['a@b.c-', 'a@b.c_', 'a@b.c-_', 'mail a@b.c- now', '(a@b.c-)', 'a@b.c-.', 'a.b-c_d@a.b-', 'a.b-c_d@a.b_']) {
            expect(scanExtAutolinks(text)).toEqual([]);
        }
    });

    test('a trailing . stays outside the address; - inside a label, - and _ in the local part, other punctuation are kept', () => {
        const urls = (text) => scanExtAutolinks(text).map((m) => m.url);
        expect(urls('a@b.c.')).toEqual(['a@b.c']);
        expect(urls('a@b-c.d')).toEqual(['a@b-c.d']);
        expect(urls('a.b-c_d@a.b')).toEqual(['a.b-c_d@a.b']);
        expect(urls('a.b-c_d@a.b.')).toEqual(['a.b-c_d@a.b']);
        expect(urls('a@b.c, and x@y.z')).toEqual(['a@b.c', 'x@y.z']);
    });

    test('a - or _ run that continues into the address is left as before (out of this fix)', () => {
        // GFM allows _ in the domain; md's regex does not and links the prefix.
        expect(scanExtAutolinks('a@b.c_d').map((m) => m.url)).toEqual(['a@b.c']);
        expect(scanExtAutolinks('a@b.c-.d').map((m) => m.url)).toEqual(['a@b.c']);
    });

    test('processExtendedAutolinks wraps detected URL in a link node', () => {
        const root = new Node('paragraph');
        root.appendChild(makeText('see http://example.com here'));
        processExtendedAutolinks(root);
        // Expect: text + link(text) + text
        const kinds = [];
        let c = root.firstChild;
        while (c) { kinds.push(c.type); c = c.next; }
        expect(kinds).toContain('link');
    });
});
