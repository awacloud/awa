// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { renderHtml, runtime, createMd } from '../../tests/_helpers/build.js';

const _bp = runtime.resolve('blockParser');
const parse = (s) => _bp.parse(s).document;
const r = (s, opts) => renderHtml(parse(s), opts);

describe('renderHtml', () => {
    test('paragraph', () => {
        expect(r('foo bar\n')).toBe('<p>foo bar</p>\n');
    });

    test('headings 1..6', () => {
        for (let lvl = 1; lvl <= 6; lvl++) {
            const md = '#'.repeat(lvl) + ' h' + lvl + '\n';
            expect(r(md)).toBe('<h' + lvl + '>h' + lvl + '</h' + lvl + '>\n');
        }
    });

    test('thematic break', () => {
        expect(r('---\n')).toBe('<hr />\n');
    });

    test('fenced code block with info', () => {
        expect(r('```js\nlet x = 1;\n```\n'))
            .toBe('<pre><code class="language-js">let x = 1;\n</code></pre>\n');
    });

    test('indented code block', () => {
        expect(r('    code line\n'))
            .toBe('<pre><code>code line\n</code></pre>\n');
    });

    test('blockquote wraps paragraph', () => {
        const html = r('> quoted\n');
        expect(html).toContain('<blockquote>');
        expect(html).toContain('<p>quoted</p>');
        expect(html).toContain('</blockquote>');
    });

    test('tight bullet list (no <p>)', () => {
        const html = r('- a\n- b\n');
        expect(html).toBe('<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n');
    });

    test('ordered list with start', () => {
        const html = r('3. foo\n4. bar\n');
        expect(html).toContain('<ol start="3">');
        expect(html).toContain('<li>foo</li>');
    });

    test('escapes HTML in paragraph text', () => {
        expect(r('a < b & c\n')).toBe('<p>a &lt; b &amp; c</p>\n');
    });

    test('escapes HTML in code', () => {
        expect(r('    a < b\n')).toBe('<pre><code>a &lt; b\n</code></pre>\n');
    });

    test('html block passes through unescaped', () => {
        const html = r('<div>\nraw\n</div>\n', { safe: false });
        expect(html).toContain('<div>');
        expect(html).toContain('raw');
    });

    test('safe mode strips html blocks', () => {
        const html = r('<div>danger</div>\n', { safe: true });
        expect(html).not.toContain('<div>');
    });

    test('throws on invalid root', () => {
        expect(() => renderHtml(null)).toThrow();
        expect(() => renderHtml({})).toThrow();
    });
});

// BL-2015 / BL-2036 — output hardening is the DEFAULT; `{ safe: false }`
// is the explicit opt-out that restores the CommonMark raw passthrough.
describe('renderHtml — safe by default', () => {
    const HOSTILE = [
        // [markdown, CommonMark passthrough output under { safe: false }]
        ['[x](javascript:alert(1))\n', '<p><a href="javascript:alert(1)">x</a></p>\n'],
        ['![i](javascript:alert(1))\n', '<p><img src="javascript:alert(1)" alt="i" /></p>\n'],
        ['[v](VBScript:x) [f](file:///etc/passwd) [d](data:text/html,x)\n',
            '<p><a href="VBScript:x">v</a> <a href="file:///etc/passwd">f</a> <a href="data:text/html,x">d</a></p>\n'],
        ['<img src=x onerror=alert(1)>\n', '<img src=x onerror=alert(1)>\n'],
        ['a <span onclick="x()">t</span>\n', '<p>a <span onclick="x()">t</span></p>\n'],
        ['<div onclick="x()">d</div>\n', '<div onclick="x()">d</div>\n']
    ];

    test('default renderHtml neutralises dangerous URL schemes', () => {
        const m = createMd();
        expect(m.renderHtml('[x](javascript:alert(1))\n')).toBe('<p><a href="">x</a></p>\n');
        expect(m.renderHtml('![i](javascript:alert(1))\n')).toBe('<p><img src="" alt="i" /></p>\n');
        expect(m.renderHtml('[v](VBScript:x) [f](file:///etc/passwd) [d](data:text/html,x)\n'))
            .toBe('<p><a href="">v</a> <a href="">f</a> <a href="">d</a></p>\n');
    });

    test('default renderHtml strips author raw HTML (block and inline)', () => {
        const m = createMd();
        expect(m.renderHtml('<img src=x onerror=alert(1)>\n')).toBe('');
        expect(m.renderHtml('a <span onclick="x()">t</span>\n')).toBe('<p>a t</p>\n');
        expect(m.renderHtml('<div onclick="x()">d</div>\n')).toBe('');
    });

    test('default bare renderer strips an html_block', () => {
        expect(r('<div>danger</div>\n')).toBe('');
    });

    test('{ safe: false } restores the CommonMark passthrough byte-for-byte', () => {
        const m = createMd();
        for (const [src, raw] of HOSTILE) {
            expect(m.renderHtml(src, { safe: false })).toBe(raw);
        }
        expect(r('<div>danger</div>\n', { safe: false })).toBe('<div>danger</div>\n');
    });

    test('instance option createMd({ safe: false }) is honoured, per-call option wins', () => {
        const raw = createMd({ safe: false });
        const hardened = createMd({ safe: true });
        for (const [src, out] of HOSTILE) {
            expect(raw.renderHtml(src)).toBe(out);
            expect(raw.renderHtml(src, { safe: true })).toBe(hardened.renderHtml(src));
            expect(hardened.renderHtml(src, { safe: false })).toBe(out);
        }
    });

    test('allowDataImage keeps only safe data: images, and only matters while safe', () => {
        const m = createMd();
        const png = '![p](data:image/png;base64,AAAA)\n';
        expect(m.renderHtml(png)).toBe('<p><img src="" alt="p" /></p>\n');
        expect(m.renderHtml(png, { allowDataImage: true }))
            .toBe('<p><img src="data:image/png;base64,AAAA" alt="p" /></p>\n');
        expect(m.renderHtml('[d](data:text/html,x)\n', { allowDataImage: true }))
            .toBe('<p><a href="">d</a></p>\n');
        expect(m.renderHtml(png, { safe: false }))
            .toBe('<p><img src="data:image/png;base64,AAAA" alt="p" /></p>\n');
    });

    test('a node flagged as extension-built (_mdTrustedHtml) survives the default', () => {
        const ast = parse('x\n');
        const Node = ast.constructor;
        const trusted = new Node('html_block');
        trusted.literal = '<div class="ext"></div>';
        trusted._mdTrustedHtml = true;
        ast.appendChild(trusted);
        const authored = new Node('html_block');
        authored.literal = '<div class="author"></div>';
        ast.appendChild(authored);
        const html = renderHtml(ast);
        expect(html).toContain('<div class="ext"></div>');
        expect(html).not.toContain('author');
    });

    test('nodes from the mdNode trusted factories survive the default; an authored html_block does not', () => {
        const { trustedHtmlInline, trustedHtmlBlock } = runtime.resolve('mdNode');
        const ast = parse('x\n');
        const Node = ast.constructor;
        ast.appendChild(trustedHtmlBlock('<div class="ext-block"></div>'));
        const authored = new Node('html_block');
        authored.literal = '<div class="author"></div>';
        ast.appendChild(authored);
        const para = ast.firstChild;
        para.appendChild(trustedHtmlInline('<mark>'));
        para.appendChild(trustedHtmlInline('</mark>'));
        const html = renderHtml(ast);
        expect(html).toContain('<div class="ext-block"></div>');
        expect(html).toContain('<mark></mark>');
        expect(html).not.toContain('author');
        expect(renderHtml(ast, { safe: false })).toContain('author');
    });
});
