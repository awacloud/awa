// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for ./escapes.js — backslash escapes and entities.
 */

import { describe, test, expect } from 'bun:test';
import { Node, runtime } from '../../tests/_helpers/build.js';

const ip = runtime.resolve('inlineParserBuilder')({});

function parse(text) {
    const p = new Node('paragraph');
    p.stringContent = text;
    ip.parse(p, {});
    return p;
}

describe('escapes module', () => {
    test('backslash-escaped punctuation becomes literal text', () => {
        const p = parse('a\\*b');
        // a, then *, then b — emph should NOT activate
        let kinds = [];
        let c = p.firstChild;
        while (c) { kinds.push(c.type); c = c.next; }
        expect(kinds).not.toContain('emph');
    });

    test('backslash before newline becomes a hard line break', () => {
        const p = parse('a\\\nb');
        let hasLineBreak = false;
        let c = p.firstChild;
        while (c) { if (c.type === 'linebreak') hasLineBreak = true; c = c.next; }
        expect(hasLineBreak).toBe(true);
    });

    test('backslash before non-escapable char is preserved as literal', () => {
        const p = parse('a\\b');
        const text = [];
        let c = p.firstChild;
        while (c) { if (c.literal) text.push(c.literal); c = c.next; }
        expect(text.join('')).toContain('\\');
    });

    test('named HTML entity is decoded', () => {
        const p = parse('&amp;');
        const first = p.firstChild;
        expect(first.literal).toBe('&');
    });

    test('numeric HTML entity is decoded', () => {
        const p = parse('&#65;');
        const first = p.firstChild;
        expect(first.literal).toBe('A');
    });
});
