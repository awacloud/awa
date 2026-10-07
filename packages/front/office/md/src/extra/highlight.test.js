// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mdHighlight, createMd } from '../../tests/_helpers/build.js';

describe('mdHighlight', () => {
    test('wraps ==text== in <mark>', () => {
        const m = createMd().use(mdHighlight);
        const html = m.renderHtml('A ==foo== B\n');
        expect(html).toBe('<p>A <mark>foo</mark> B</p>\n');
    });

    test('multiple highlights on a line', () => {
        const m = createMd().use(mdHighlight);
        const html = m.renderHtml('==a== and ==b==\n');
        expect(html).toContain('<mark>a</mark>');
        expect(html).toContain('<mark>b</mark>');
    });

    test('single = is left alone', () => {
        const m = createMd().use(mdHighlight);
        const html = m.renderHtml('a=b plain\n');
        expect(html).toBe('<p>a=b plain</p>\n');
    });

    test('==unclosed is left alone', () => {
        const m = createMd().use(mdHighlight);
        const html = m.renderHtml('a ==open here\n');
        expect(html).not.toContain('<mark>');
    });

    test('escapes HTML inside highlight', () => {
        const m = createMd().use(mdHighlight);
        const html = m.renderHtml('==a&b==\n');
        expect(html).toContain('<mark>a&amp;b</mark>');
    });

    test('does not affect code spans', () => {
        const m = createMd().use(mdHighlight);
        const html = m.renderHtml('`==x==`\n');
        expect(html).toContain('<code>==x==</code>');
    });
});

// BL-2015 — the `<mark>` `html_inline` nodes the extra builds are trusted;
// author raw HTML in the same document is not.
describe('mdHighlight — trusted nodes under the safe default', () => {
    const FIXTURE = 'A ==foo== B and ==bar==\n';

    test('benign output under the default equals { safe: false }', () => {
        const m = createMd().use(mdHighlight);
        const html = m.renderHtml(FIXTURE);
        expect(html).toContain('<mark>foo</mark>');
        expect(html).toBe(m.renderHtml(FIXTURE, { safe: false }));
    });

    test('author raw HTML in the same document is still stripped', () => {
        const m = createMd().use(mdHighlight);
        const src = 'A ==foo== <img src=y onerror=alert(2)>\n\n<img src=x onerror=alert(1)>\n';
        const html = m.renderHtml(src);
        expect(html).toContain('<mark>foo</mark>');
        expect(html).not.toContain('<img');
        expect(m.renderHtml(src, { safe: false })).toContain('<img src=x onerror');
    });
});
