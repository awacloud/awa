// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mdFootnotes, stripFootnoteDefs, createMd } from '../../tests/_helpers/build.js';

describe('mdFootnotes', () => {
    test('renders a single footnote reference and definition', () => {
        const m = createMd().use(mdFootnotes);
        const html = m.renderHtml('Hello[^1] world.\n\n[^1]: A note.\n');
        expect(html).toContain('<sup class="footnote-ref"><a href="#fn-1" id="fnref-1">1</a></sup>');
        expect(html).toContain('<section class="footnotes">');
        expect(html).toContain('A note.');
        expect(html).toContain('<a href="#fnref-1" class="footnote-back">');
    });

    test('numbers footnotes by order of reference', () => {
        const m = createMd().use(mdFootnotes);
        const html = m.renderHtml('a[^b] and c[^a].\n\n[^a]: A.\n\n[^b]: B.\n');
        // First referenced is "b" → 1, second is "a" → 2.
        expect(html.indexOf('id="fnref-b"')).toBeGreaterThan(-1);
        expect(html.indexOf('id="fnref-a"')).toBeGreaterThan(-1);
        const m1 = html.match(/href="#fn-b"[^>]*>1</);
        const m2 = html.match(/href="#fn-a"[^>]*>2</);
        expect(m1).not.toBeNull();
        expect(m2).not.toBeNull();
    });

    test('ignores references with no matching definition', () => {
        const m = createMd().use(mdFootnotes);
        const html = m.renderHtml('See [^missing].\n');
        expect(html).toContain('[^missing]');
        expect(html).not.toContain('<section class="footnotes">');
    });

    test('drops unused definitions silently', () => {
        const m = createMd().use(mdFootnotes);
        const html = m.renderHtml('Plain text.\n\n[^unused]: orphan\n');
        expect(html).not.toContain('orphan');
        expect(html).not.toContain('<section class="footnotes">');
    });

    test('stripFootnoteDefs collects ids and bodies', () => {
        const { rest, defs } = stripFootnoteDefs('Body[^x]\n\n[^x]: first\n');
        expect(defs.get('x')).toBe('first');
        expect(rest).not.toContain('[^x]: first');
    });

    test('attaches footnotes table to document.data', () => {
        const m = createMd().use(mdFootnotes);
        const ast = m.parse('See[^z].\n\n[^z]: bottom\n');
        expect(ast.data.footnotes.order).toEqual(['z']);
        expect(ast.data.footnotes.defs.get('z')).toBe('bottom');
    });

    test('multiple refs to same id share one entry', () => {
        const m = createMd().use(mdFootnotes);
        const html = m.renderHtml('a[^k] b[^k].\n\n[^k]: shared\n');
        const matches = html.match(/href="#fn-k"/g);
        expect(matches.length).toBe(2);
        // Only one <li> in the footnotes list.
        const lis = html.match(/<li id="fn-k">/g);
        expect(lis.length).toBe(1);
    });

    test('escapes special characters in footnote bodies', () => {
        const m = createMd().use(mdFootnotes);
        const html = m.renderHtml('See[^h].\n\n[^h]: a < b & c\n');
        expect(html).toContain('a &lt; b &amp; c');
    });
});

// BL-2015 — the reference `html_inline` node the extra builds is trusted;
// author raw HTML in the same document is not.
describe('mdFootnotes — trusted nodes under the safe default', () => {
    const FIXTURE = 'Hello[^1] world and[^b].\n\n[^1]: A note.\n\n[^b]: B.\n';

    test('benign output under the default equals { safe: false }', () => {
        const m = createMd().use(mdFootnotes);
        const html = m.renderHtml(FIXTURE);
        expect(html).toContain('<sup class="footnote-ref"><a href="#fn-1" id="fnref-1">1</a></sup>');
        expect(html).toBe(m.renderHtml(FIXTURE, { safe: false }));
    });

    test('author raw HTML in the same document is still stripped', () => {
        const m = createMd().use(mdFootnotes);
        const src = 'Hello[^1] <img src=y onerror=alert(2)>.\n\n<img src=x onerror=alert(1)>\n\n[^1]: A note.\n';
        const html = m.renderHtml(src);
        expect(html).toContain('<sup class="footnote-ref">');
        expect(html).not.toContain('<img');
        expect(m.renderHtml(src, { safe: false })).toContain('<img src=x onerror');
    });
});
