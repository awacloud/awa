// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mdToc, mdFootnotes, tocGenerate as generate, collectHeadings, slugify, createMd } from '../../tests/_helpers/build.js';

describe('mdToc', () => {
    test('slugify lowercases and strips punctuation', () => {
        expect(slugify('Hello, World!')).toBe('hello-world');
        expect(slugify('  Foo Bar  ')).toBe('foo-bar');
    });

    test('collectHeadings returns level, text, slug', () => {
        const m = createMd();
        const ast = m.parse('# A\n## B\n### C\n');
        const hs = collectHeadings(ast);
        expect(hs.length).toBe(3);
        expect(hs[0]).toEqual({ level: 1, text: 'A', slug: 'a' });
        expect(hs[2].slug).toBe('c');
    });

    test('generate returns nested markdown list', () => {
        const m = createMd();
        const ast = m.parse('# A\n## B\n# C\n');
        const toc = generate(ast);
        expect(toc).toContain('- [A](#a)');
        expect(toc).toContain('  - [B](#b)');
        expect(toc).toContain('- [C](#c)');
    });

    test('disambiguates duplicate slugs', () => {
        const m = createMd();
        const ast = m.parse('# Same\n# Same\n# Same\n');
        const hs = collectHeadings(ast);
        expect(hs.map(h => h.slug)).toEqual(['same', 'same-1', 'same-2']);
    });

    test('respects minLevel / maxLevel', () => {
        const m = createMd();
        const ast = m.parse('# A\n## B\n### C\n#### D\n');
        const hs = collectHeadings(ast, { minLevel: 2, maxLevel: 3 });
        expect(hs.map(h => h.level)).toEqual([2, 3]);
    });

    test('install replaces [[TOC]] paragraph with nested list', () => {
        const m = createMd().use(mdToc);
        const html = m.renderHtml('[[TOC]]\n\n# A\n\n## B\n');
        expect(html).toContain('<ul>');
        expect(html).toContain('<a href="#a">A</a>');
        expect(html).toContain('<a href="#b">B</a>');
    });

    test('no [[TOC]] placeholder = no list injection', () => {
        const m = createMd().use(mdToc);
        const html = m.renderHtml('# Only heading\n');
        expect(html).toBe('<h1>Only heading</h1>\n');
    });

    test('generate returns empty string when no headings', () => {
        const m = createMd();
        const ast = m.parse('just text\n');
        expect(generate(ast)).toBe('');
    });
});

describe('mdToc heading text escaping (generate)', () => {
    test('link syntax in heading text does not become a live link in the TOC', () => {
        const src = '# a](javascript:alert(1)) [b\n';
        const m = createMd().use(mdToc);
        const toc = generate(m.parse(src));
        expect(toc).toBe('- [a\\](javascript:alert(1)) \\[b](#ajavascriptalert1-b)');
        const html = m.renderHtml('[[TOC]]\n\n' + src, { safe: false });
        const tocHtml = html.slice(0, html.indexOf('<h1>'));
        expect((tocHtml.match(/<a href="/g) || []).length).toBe(1);
        expect(tocHtml).toContain('<a href="#ajavascriptalert1-b">a](javascript:alert(1)) [b</a>');
        expect(html).not.toContain('href="javascript:');
    });

    const BS = String.fromCharCode(92);
    test.each([
        ['`', 'a`b', 'a`b'],
        ['*', 'a*b', 'a*b'],
        ['_', 'a_b', 'a_b'],
        ['<', 'a<b', 'a&lt;b'],
        ['>', 'a>b', 'a&gt;b'],
        ['~', 'a~b', 'a~b'],
        ['&', 'a&b', 'a&amp;b'],
        ['!', 'a!b', 'a!b'],
        ['backslash', 'a' + BS + BS + 'b', 'a' + BS + 'b'],
    ])('%s in a heading survives the TOC round trip as text', (_name, source, expected) => {
        const m = createMd().use(mdToc);
        const html = m.renderHtml('[[TOC]]\n\n# ' + source + '\n');
        const tocHtml = html.slice(0, html.indexOf('<h1>'));
        expect(tocHtml).toMatch(/<a href="#[^"]*">/);
        expect(tocHtml).toContain('>' + expected + '</a>');
        expect(tocHtml).not.toContain('<em>');
        expect(tocHtml).not.toContain('<code>');
        expect(tocHtml).not.toContain('<del>');
    });

    test('collectHeadings text stays unescaped', () => {
        const hs = collectHeadings(createMd().parse('# a*b_c[d]\n'));
        expect(hs[0].text).toBe('a*b_c[d]');
    });
});

describe('mdToc collectHeadings text divergences', () => {
    test('a soft break joins with one space (setext heading)', () => {
        const hs = collectHeadings(createMd().parse('Foo\nbar\n===\n'));
        expect(hs).toEqual([{ level: 1, text: 'Foo bar', slug: 'foo-bar' }]);
    });

    test('a hard break joins with one space', () => {
        const hs = collectHeadings(createMd().parse('Foo  \nbar\n===\n'));
        expect(hs).toEqual([{ level: 1, text: 'Foo bar', slug: 'foo-bar' }]);
    });

    test('image alt text is included (documented divergence)', () => {
        const hs = collectHeadings(createMd().parse('## ![alt](p.png)\n'));
        expect(hs).toEqual([{ level: 2, text: 'alt', slug: 'alt' }]);
    });

    test('a footnote reference marker is omitted (documented divergence)', () => {
        const m = createMd().use(mdFootnotes);
        const hs = collectHeadings(m.parse('## Note[^1]\n\n[^1]: n\n'));
        expect(hs).toEqual([{ level: 2, text: 'Note', slug: 'note' }]);
    });
});
