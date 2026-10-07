// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Sibling tests for the shared inline-parser helpers.
 */

import { describe, test, expect } from 'bun:test';
import {
    unescapeString, normalizeURI, escapeXml,
    C_NEWLINE, C_SPACE, C_BACKSLASH,
    OPENTAG, CLOSETAG, reHtmlTag, ENTITY, ESCAPABLE
} from '../tests/_helpers/build.js';

describe('common module', () => {
    describe('unescapeString', () => {
        test('decodes named entities', () => {
            expect(unescapeString('a &amp; b')).toBe('a & b');
            expect(unescapeString('&lt;x&gt;')).toBe('<x>');
        });

        test('decodes numeric / hex references', () => {
            expect(unescapeString('&#65;')).toBe('A');
            expect(unescapeString('&#x41;')).toBe('A');
        });

        test('removes backslash escapes', () => {
            expect(unescapeString('\\*hi\\*')).toBe('*hi*');
            expect(unescapeString('\\[a\\]')).toBe('[a]');
        });

        test('passes through strings with no escapes or entities', () => {
            expect(unescapeString('hello world')).toBe('hello world');
        });
    });

    describe('normalizeURI', () => {
        test('percent-encodes spaces and unsafe bytes', () => {
            const out = normalizeURI('http://example.com/a b');
            expect(out).toContain('a%20b');
        });

        test('keeps reserved characters used in URLs', () => {
            const out = normalizeURI('http://x.com/p?q=1&r=2#frag');
            expect(out).toContain('?');
            expect(out).toContain('&');
            expect(out).toContain('#');
        });

        test('returns input unchanged on encoding failure (best effort)', () => {
            // mdurlEncode never throws for plain strings — just verify
            // a degenerate input passes through without throwing.
            expect(typeof normalizeURI('')).toBe('string');
        });
    });

    describe('escapeXml', () => {
        test('escapes &, <, >, "', () => {
            expect(escapeXml('a&b')).toBe('a&amp;b');
            expect(escapeXml('<x>')).toBe('&lt;x&gt;');
            expect(escapeXml('he said "hi"')).toBe('he said &quot;hi&quot;');
        });

        test('passes strings with no special chars unchanged', () => {
            expect(escapeXml('plain')).toBe('plain');
        });
    });

    describe('regexp / constant exports', () => {
        test('character-code constants are integers', () => {
            expect(C_NEWLINE).toBe(10);
            expect(C_SPACE).toBe(32);
            expect(C_BACKSLASH).toBe(92);
        });

        test('OPENTAG / CLOSETAG / ENTITY are valid regex pieces', () => {
            expect(typeof OPENTAG).toBe('string');
            expect(typeof CLOSETAG).toBe('string');
            expect(typeof ENTITY).toBe('string');
            expect(typeof ESCAPABLE).toBe('string');
            // sanity: compile a regex that wraps OPENTAG
            const re = new RegExp(OPENTAG);
            expect(re.test('<div class="x">')).toBe(true);
        });

        test('reHtmlTag matches a basic tag', () => {
            expect(reHtmlTag.test('<p>')).toBe(true);
            expect(reHtmlTag.test('</p>')).toBe(true);
            expect(reHtmlTag.test('plain')).toBe(false);
        });
    });
});
