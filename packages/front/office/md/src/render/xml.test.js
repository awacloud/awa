// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { renderXml } from '../../tests/_helpers/build.js';
import {
    Node,
    T_DOCUMENT, T_HEADING, T_PARAGRAPH, T_TEXT,
    T_LIST, T_ITEM, T_THEMATIC_BREAK, T_CODE_BLOCK
} from '../../tests/_helpers/build.js';

function doc(...children) {
    const d = new Node(T_DOCUMENT);
    for (const c of children) d.appendChild(c);
    return d;
}
function leaf(type, literal) { const n = new Node(type); n.literal = literal; return n; }

describe('renderXml', () => {
    test('empty document', () => {
        const out = renderXml(doc());
        expect(out).toContain('<?xml');
        expect(out).toContain('<document xmlns="http://commonmark.org/xml/1.0">');
        expect(out).toContain('</document>');
    });

    test('heading with level + text', () => {
        const h = new Node(T_HEADING); h.level = 2;
        h.appendChild(leaf(T_TEXT, 'Hi'));
        const out = renderXml(doc(h));
        expect(out).toContain('<heading level="2">');
        expect(out).toContain('<text>Hi</text>');
    });

    test('thematic break is self-closing', () => {
        const out = renderXml(doc(new Node(T_THEMATIC_BREAK)));
        expect(out).toContain('<thematic_break />');
    });

    test('code block carries info + literal', () => {
        const c = new Node(T_CODE_BLOCK); c.info = 'js'; c.literal = 'x';
        const out = renderXml(doc(c));
        expect(out).toContain('<code_block info="js">x</code_block>');
    });

    test('list emits type and tight attrs', () => {
        const list = new Node(T_LIST);
        list.listType = 'bullet'; list.listTight = true;
        list.appendChild(new Node(T_ITEM));
        const out = renderXml(doc(list));
        expect(out).toContain('<list type="bullet" tight="true">');
    });

    test('escapes special chars in literal', () => {
        const out = renderXml(doc(leaf(T_TEXT, 'a & <b>')));
        expect(out).toContain('a &amp; &lt;b&gt;');
    });

    test('throws on invalid root', () => {
        expect(() => renderXml(null)).toThrow();
    });
});
