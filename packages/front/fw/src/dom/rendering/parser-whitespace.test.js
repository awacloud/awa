// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// fromHTML keeps the whitespace an inline sibling renders (BL-2374, D9 G7):
// `or <span>choose a file</span>` used to become "or" + "choose a file",
// rendered "orchoose a file". Whitespace beside block elements and at a
// parent's edges, and a whitespace-only node, are still dropped.

import { GlobalRegistrator } from '@happy-dom/global-registrator';
if (!globalThis.document) GlobalRegistrator.register();
import { describe, test, expect } from 'bun:test';
import { parser } from './parser.js';
import { secPolicy } from './secPolicy.js';

const p = parser.factory(secPolicy.factory());
const texts = (html) => p.fromHTML(html).template.filter((e) => e.tag === 'text').map((e) => e.text);

describe('fromHTML: whitespace beside inline elements', () => {
    test('the boundary space on the side of an inline sibling is kept', () => {
        expect(texts('<p>Drop it here or <span>choose a file</span></p>')).toEqual(['Drop it here or ']);
        expect(texts('<p><b>Bold</b> and then text</p>')).toEqual([' and then text']);
        expect(texts('<p>a <em>b</em> c</p>')).toEqual(['a ', ' c']);
    });

    test('a whitespace-only node between two inline elements is still dropped (it would render as a <span>)', () => {
        expect(texts('<p><b>one</b>\n   <i>two</i></p>')).toEqual([]);
    });

    test('beside block elements and at the edges it is dropped, as before', () => {
        expect(texts('<div>\n  <p>x</p>\n  <p>y</p>\n</div>')).toEqual([]);
        expect(texts('<div>\n  lead <p>x</p></div>')).toEqual(['lead']);
        expect(texts('<p>  <b>x</b></p>')).toEqual([]);
    });

    test('a round trip through toHTML keeps the spaces', () => {
        const html = p.toHTML(p.fromHTML('<p>or <span>choose</span> now</p>'));
        expect(html.replace(/\s+id="[^"]*"/g, '')).toContain('<p>or <span>choose</span> now</p>');
    });
});
