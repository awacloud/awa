// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { Node, Walker, walk, runtime, T_DOCUMENT, T_PARAGRAPH, T_TEXT, T_HEADING } from '../../tests/_helpers/build.js';

describe('Node', () => {
    test('appendChild links children', () => {
        const doc = new Node(T_DOCUMENT);
        const p1  = new Node(T_PARAGRAPH);
        const p2  = new Node(T_PARAGRAPH);
        doc.appendChild(p1);
        doc.appendChild(p2);
        expect(doc.firstChild).toBe(p1);
        expect(doc.lastChild).toBe(p2);
        expect(p1.next).toBe(p2);
        expect(p2.prev).toBe(p1);
        expect(p1.parent).toBe(doc);
    });

    test('unlink removes from parent', () => {
        const doc = new Node(T_DOCUMENT);
        const p1  = new Node(T_PARAGRAPH);
        const p2  = new Node(T_PARAGRAPH);
        doc.appendChild(p1); doc.appendChild(p2);
        p1.unlink();
        expect(doc.firstChild).toBe(p2);
        expect(p2.prev).toBeNull();
        expect(p1.parent).toBeNull();
    });

    test('insertAfter / insertBefore', () => {
        const doc = new Node(T_DOCUMENT);
        const p1  = new Node(T_PARAGRAPH);
        const p3  = new Node(T_PARAGRAPH);
        doc.appendChild(p1); doc.appendChild(p3);
        const p2 = new Node(T_PARAGRAPH);
        p1.insertAfter(p2);
        expect(p1.next).toBe(p2);
        expect(p2.next).toBe(p3);
        const p0 = new Node(T_PARAGRAPH);
        p1.insertBefore(p0);
        expect(doc.firstChild).toBe(p0);
        expect(p0.next).toBe(p1);
    });

    test('isContainer respects type table', () => {
        expect(new Node(T_DOCUMENT).isContainer).toBe(true);
        expect(new Node(T_PARAGRAPH).isContainer).toBe(true);
        expect(new Node(T_TEXT).isContainer).toBe(false);
    });
});

describe('Walker', () => {
    test('visits container twice (enter + exit) and leaves at root exit', () => {
        const doc = new Node(T_DOCUMENT);
        const h   = new Node(T_HEADING); h.level = 1;
        const t   = new Node(T_TEXT); t.literal = 'A';
        h.appendChild(t);
        doc.appendChild(h);

        const events = [...walk(doc)].map(e => `${e.entering ? '+' : '-'}${e.node.type}`);
        // Leaf nodes (text) fire only on enter, not on exit.
        expect(events).toEqual([
            '+document', '+heading', '+text',
            '-heading', '-document'
        ]);
    });

    test('empty container fires exit immediately', () => {
        const doc = new Node(T_DOCUMENT);
        const events = [...walk(doc)].map(e => `${e.entering ? '+' : '-'}${e.node.type}`);
        expect(events).toEqual(['+document', '-document']);
    });
});

describe('trusted HTML node factories', () => {
    const { trustedHtmlInline, trustedHtmlBlock } = runtime.resolve('mdNode');

    test('trustedHtmlInline builds a flagged html_inline node', () => {
        const n = trustedHtmlInline('<mark>');
        expect(n).toBeInstanceOf(Node);
        expect(n.type).toBe('html_inline');
        expect(n.literal).toBe('<mark>');
        expect(n._mdTrustedHtml).toBe(true);
        expect(n.htmlBlockType).toBeNull();
    });

    test('trustedHtmlBlock builds a flagged html_block node of type 6', () => {
        const n = trustedHtmlBlock('<div class="x"></div>');
        expect(n).toBeInstanceOf(Node);
        expect(n.type).toBe('html_block');
        expect(n.literal).toBe('<div class="x"></div>');
        expect(n.htmlBlockType).toBe(6);
        expect(n._mdTrustedHtml).toBe(true);
    });

    test('the marker is an own enumerable property', () => {
        for (const n of [trustedHtmlInline('a'), trustedHtmlBlock('a')]) {
            expect(Object.prototype.hasOwnProperty.call(n, '_mdTrustedHtml')).toBe(true);
            expect(Object.keys(n)).toContain('_mdTrustedHtml');
            expect(structuredClone({ f: n._mdTrustedHtml }).f).toBe(true);
        }
    });

    test('a non-string literal is stringified', () => {
        expect(trustedHtmlInline(42).literal).toBe('42');
        expect(trustedHtmlBlock(null).literal).toBe('null');
    });

    test('a plain Node never carries the marker', () => {
        expect(new Node('html_inline')._mdTrustedHtml).toBeUndefined();
        expect(Object.keys(new Node('html_block'))).not.toContain('_mdTrustedHtml');
    });
});
