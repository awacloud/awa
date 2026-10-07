// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for ./code-span.js — inline code span parsing.
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

describe('code-span module', () => {
    test('single backticks wrap content in code node', () => {
        const p = parse('a `code` b');
        const code = p.firstChild.next;
        expect(code.type).toBe('code');
        expect(code.literal).toBe('code');
    });

    test('multiple backticks of matching length close the span', () => {
        const p = parse('a ``co`de`` b');
        const code = p.firstChild.next;
        expect(code.type).toBe('code');
        expect(code.literal).toBe('co`de');
    });

    test('mismatched backtick runs leave them as literal text', () => {
        const p = parse('a `b');
        // No closing — should be left as literal backtick text
        let kinds = [];
        let c = p.firstChild;
        while (c) { kinds.push(c.type); c = c.next; }
        expect(kinds).not.toContain('code');
    });

    test('inner single space is trimmed', () => {
        const p = parse('` foo `');
        const code = p.firstChild;
        expect(code.type).toBe('code');
        expect(code.literal).toBe('foo');
    });
});
