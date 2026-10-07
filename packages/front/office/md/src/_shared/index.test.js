// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mdShared } from './index.js';
import { Node } from '../../tests/_helpers/build.js';

describe('mdShared module', () => {
    test('module metadata', () => {
        expect(mdShared.name).toBe('mdShared');
        expect(mdShared.dependencies).toEqual([]);
        expect(typeof mdShared.factory).toBe('function');
    });

    test('factory exposes expected API', () => {
        const s = mdShared.factory();
        expect(typeof s.escapeHtml).toBe('function');
        expect(typeof s.unescapeHtml).toBe('function');
        expect(typeof s.escapeForRegex).toBe('function');
        expect(typeof s.createLocalWalker).toBe('function');
    });

    describe('escapeHtml', () => {
        const { escapeHtml } = mdShared.factory();

        test('escapes the four canonical entities', () => {
            expect(escapeHtml('&')).toBe('&amp;');
            expect(escapeHtml('<')).toBe('&lt;');
            expect(escapeHtml('>')).toBe('&gt;');
            expect(escapeHtml('"')).toBe('&quot;');
        });

        test('handles ampersand before others (no double-encoding)', () => {
            expect(escapeHtml('a & b < c > d "e"'))
                .toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
        });

        test('passes non-special text through unchanged', () => {
            expect(escapeHtml("hello world 123 ' /")).toBe("hello world 123 ' /");
        });

        test('coerces non-string input', () => {
            expect(escapeHtml(42)).toBe('42');
            expect(escapeHtml(null)).toBe('null');
        });
    });

    describe('unescapeHtml', () => {
        const { unescapeHtml, escapeHtml } = mdShared.factory();

        test('decodes the four canonical entities', () => {
            expect(unescapeHtml('&amp;')).toBe('&');
            expect(unescapeHtml('&lt;')).toBe('<');
            expect(unescapeHtml('&gt;')).toBe('>');
            expect(unescapeHtml('&quot;')).toBe('"');
        });

        test('round-trips with escapeHtml for non-pathological input', () => {
            const samples = ['hello', 'a < b', '"quoted"', 'A & B & C', '<<>>'];
            for (const s of samples) {
                expect(unescapeHtml(escapeHtml(s))).toBe(s);
            }
        });

        test('coerces non-string input', () => {
            expect(unescapeHtml(7)).toBe('7');
        });
    });

    describe('escapeForRegex', () => {
        const { escapeForRegex } = mdShared.factory();

        test('escapes every regex metacharacter', () => {
            expect(escapeForRegex('-/\\^$*+?.()|[]{}'))
                .toBe('\\-\\/\\\\\\^\\$\\*\\+\\?\\.\\(\\)\\|\\[\\]\\{\\}');
        });

        test('leaves alphanumerics untouched', () => {
            expect(escapeForRegex('abcXYZ012')).toBe('abcXYZ012');
        });

        test('produces a safe RegExp body', () => {
            const fence = '---';
            const re = new RegExp('^' + escapeForRegex(fence) + '$');
            expect(re.test('---')).toBe(true);
            expect(re.test('--x')).toBe(false);
        });
    });

    describe('createLocalWalker', () => {
        const { createLocalWalker } = mdShared.factory();

        test('returns a class with a `next()` method', () => {
            const W = createLocalWalker(new Set(['document']), new Set());
            const root = new Node('document');
            const w = new W(root);
            expect(typeof w.next).toBe('function');
        });

        test('walks a flat document : containers emit enter/leave, leaves emit enter only', () => {
            const W = createLocalWalker(new Set(['document']), new Set());
            const root = new Node('document');
            const child = new Node('text');
            child.literal = 'hello';
            root.appendChild(child);
            const w = new W(root);

            const seen = [];
            let step;
            while ((step = w.next())) {
                seen.push({ type: step.node.type, entering: step.entering });
            }
            // Same semantics as the canonical walker in `ast/walker.js` :
            // containers emit two events (enter + leave) ; non-container
            // leaves emit a single `entering:true` event.
            expect(seen).toEqual([
                { type: 'document', entering: true },
                { type: 'text', entering: true },
                { type: 'document', entering: false }
            ]);
        });

        test('treats unknown node types as leaves (predicate honored)', () => {
            const W = createLocalWalker(new Set(['document']), new Set());
            const root = new Node('document');
            const para = new Node('paragraph'); // not in our sets → leaf
            const text = new Node('text');
            text.literal = 'x';
            para.appendChild(text);
            root.appendChild(para);
            const w = new W(root);

            const visited = [];
            let s;
            while ((s = w.next())) {
                visited.push(s.node.type + (s.entering ? '+' : '-'));
            }
            // `paragraph` is NOT in BLOCK/INLINE here so it never descends
            // into its `text` child.
            expect(visited).toEqual(['document+', 'paragraph+', 'document-']);
        });

        test('descends into INLINE containers', () => {
            const W = createLocalWalker(new Set(['document']), new Set(['paragraph']));
            const root = new Node('document');
            const para = new Node('paragraph');
            const text = new Node('text');
            text.literal = 'x';
            para.appendChild(text);
            root.appendChild(para);
            const w = new W(root);

            const visited = [];
            let s;
            while ((s = w.next())) {
                visited.push(s.node.type + (s.entering ? '+' : '-'));
            }
            // Now `paragraph` is a container → emits enter + leave, and
            // its `text` leaf gets a single enter.
            expect(visited).toEqual([
                'document+', 'paragraph+', 'text+', 'paragraph-', 'document-'
            ]);
        });

        test('accepts array form for BLOCK/INLINE', () => {
            const W = createLocalWalker(['document'], ['paragraph']);
            const root = new Node('document');
            root.appendChild(new Node('paragraph'));
            const w = new W(root);
            let count = 0;
            while (w.next()) count++;
            // doc+, para+ (no children → leaf-style), para-, doc-
            expect(count).toBe(4);
        });
    });
});
