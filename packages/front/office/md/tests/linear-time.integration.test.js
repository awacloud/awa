// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Inline inputs that used to take quadratic time.
 *
 * Shapes from cmark's pathological tests (repeated unclosed link
 * destinations, repeated `![[]()`, repeated unclosed `<!--`) and their
 * siblings (unclosed `<?`, `<![CDATA[`, `<!A`). Each runs with the size
 * limits lifted, so the time is the parser's own, against a budget about
 * fifty times the linear cost and several times below the quadratic one.
 * The output legs pin that the fixes change no rendering, except the
 * nesting cap on link destination parentheses (32 levels, as cmark).
 *
 * @module md/tests/linear-time.integration
 */

import { test, expect, describe } from 'bun:test';
import { createMd } from './_helpers/build.js';

const BUDGET_MS = 1500;
const md = createMd({ extendedAutolinks: false, disallowedRawHtml: false, maxDepth: Infinity, maxNodes: Infinity });

function timed(src) {
    const t0 = performance.now();
    const html = md.renderHtml(src, { safe: false });
    return { html, ms: performance.now() - t0 };
}

describe('linear time on repeated unclosed constructs', () => {
    const SHAPES = [
        ['unclosed link destinations', '[a](b'.repeat(20000), /^<p>(\[a\]\(b){20000}<\/p>\n$/],
        ['repeated ![[]()', '![[]()'.repeat(160000), /^<p>(!\[<a href=""><\/a>){160000}<\/p>\n$/],
        ['unclosed comments', '</' + '<!--'.repeat(120000), /^<p>&lt;\/(&lt;!--){120000}<\/p>\n$/],
        ['unclosed processing instructions', 'x' + '<?'.repeat(100000), /^<p>x(&lt;\?){100000}<\/p>\n$/],
        ['unclosed CDATA sections', 'x' + '<![CDATA['.repeat(50000), /^<p>x(&lt;!\[CDATA\[){50000}<\/p>\n$/],
        ['unclosed declarations', 'x' + '<!A '.repeat(100000), /^<p>x(&lt;!A ?){100000}<\/p>\n$/],
    ];
    for (const [name, src, expected] of SHAPES) {
        test(`${name}: expected output within ${BUDGET_MS} ms`, () => {
            const { html, ms } = timed(src);
            expect(html).toMatch(expected);
            expect(ms).toBeLessThan(BUDGET_MS);
        });
    }
});

describe('the fixes change no rendering', () => {
    const r = (src) => md.renderHtml(src, { safe: false });

    test('links never contain links; images may; an unmatched bracket after a link changes nothing', () => {
        expect(r('[foo [bar](/uri)](/uri)\n')).toBe('<p>[foo <a href="/uri">bar</a>](/uri)</p>\n');
        expect(r('[a [b](c) [d] e](f)\n')).toBe('<p>[a <a href="c">b</a> [d] e](f)</p>\n');
        expect(r('![a [b](c)](d)\n')).toBe('<p><img src="d" alt="a b" /></p>\n');
        expect(r('[a [b](c) ![d](e) f](g)\n')).toBe('<p>[a <a href="c">b</a> <img src="e" alt="d" /> f](g)</p>\n');
    });

    test('inline HTML with its end is raw, without it text', () => {
        expect(r('x <? a ?> <? b\n')).toBe('<p>x <? a ?> &lt;? b</p>\n');
        expect(r('x <!-- a --> <!-- b\n')).toBe('<p>x <!-- a --> &lt;!-- b</p>\n');
        expect(r('x <!A b> <!A c\n')).toBe('<p>x <!A b> &lt;!A c</p>\n');
        expect(r('x <![CDATA[ a ]]> <![CDATA[ b\n')).toBe('<p>x <![CDATA[ a ]]> &lt;![CDATA[ b</p>\n');
        expect(r('x <? <? ?>\n')).toBe('<p>x <? <? ?></p>\n');
    });

    test('the end search of one paragraph does not leak into the next', () => {
        expect(r('x <!--\n\ny <!-- b -->\n')).toBe('<p>x &lt;!--</p>\n<p>y <!-- b --></p>\n');
        expect(r('a <? b ?> <?\n\nc ?> <? d ?>\n')).toBe('<p>a <? b ?> &lt;?</p>\n<p>c ?&gt; <? d ?></p>\n');
    });
});

describe('linear time on deep lists followed by blank lines', () => {
    const NESTED = /^(<\w+>\n?)+x(<\/\w+>\n)+$/;

    test(`deep list then blank lines: expected output within ${BUDGET_MS} ms`, () => {
        const { html, ms } = timed('- '.repeat(12000) + 'x' + '\n'.repeat(12000));
        expect(html).toMatch(NESTED);
        expect(ms).toBeLessThan(BUDGET_MS);
    });

    test(`the same in a block quote: expected output within ${BUDGET_MS} ms`, () => {
        const { html, ms } = timed('> ' + '- '.repeat(12000) + 'x\n' + '>\n'.repeat(12000));
        expect(html).toMatch(NESTED);
        expect(ms).toBeLessThan(BUDGET_MS);
    });

    test('blank-line runs in list items render as before', () => {
        const r = (src) => md.renderHtml(src, { safe: false });
        expect(r('- a\n\n      code\n\n\n      more\n')).toBe('<ul>\n<li>\n<p>a</p>\n<pre><code>code\n\n\nmore\n</code></pre>\n</li>\n</ul>\n');
        expect(r('- ```\n  a\n\n\n  b\n  ```\n')).toBe('<ul>\n<li>\n<pre><code>a\n\n\nb\n</code></pre>\n</li>\n</ul>\n');
        expect(r('- <pre>\n  a\n\n\n  b</pre>\n')).toBe('<ul>\n<li>\n<pre>\na\n\n\nb</pre>\n</li>\n</ul>\n');
        expect(r('- a\n\n\n- b\n')).toBe('<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>\n');
        expect(r('- a\n  \n  \n  b\n')).toBe('<ul>\n<li>\n<p>a</p>\n<p>b</p>\n</li>\n</ul>\n');
        expect(r('- a\n  - b\n\n\n  c\n')).toBe('<ul>\n<li>\n<p>a</p>\n<ul>\n<li>b</li>\n</ul>\n<p>c</p>\n</li>\n</ul>\n');
        expect(r('> - a\n>\n>\n> b\n')).toBe('<blockquote>\n<ul>\n<li>a</li>\n</ul>\n<p>b</p>\n</blockquote>\n');
        expect(r('- a\n\n\n\n')).toBe('<ul>\n<li>a</li>\n</ul>\n');
    });

    test('list nodes keep their public shape', () => {
        const list = md.parse('- a\n\n\n- b\n').firstChild;
        expect(Object.keys(list).sort()).toEqual(Object.keys(md.parse('- a\n- b\n').firstChild).sort());
    });
});

describe('linear time on emphasis whose openers were removed (cmark issue 389)', () => {
    const N = 80000;
    const src = '*a '.repeat(N) + '_a*_ '.repeat(N);

    test(`expected output within ${BUDGET_MS} ms`, () => {
        const { html, ms } = timed(src);
        expect(html).toMatch(new RegExp(`(<em>a ){${N}}(_a</em>_ ?){${N}}`));
        expect(ms).toBeLessThan(BUDGET_MS);
    });

    test(`under the default limits the refusal comes within ${BUDGET_MS} ms`, () => {
        const strict = createMd({ extendedAutolinks: false, disallowedRawHtml: false });
        const t0 = performance.now();
        expect(() => strict.renderHtml(src, { safe: false })).toThrow('nesting depth exceeded');
        expect(performance.now() - t0).toBeLessThan(BUDGET_MS);
    });
});

describe('link destination parentheses: nesting capped at 32 levels', () => {
    const r = (src) => md.renderHtml(src, { safe: false });
    const parens = (n) => 'x' + '('.repeat(n) + ')'.repeat(n);

    test('up to 32 levels a destination is read, inline and in a definition', () => {
        expect(r(`[a](${parens(3)})\n`)).toBe('<p><a href="x((()))">a</a></p>\n');
        expect(r(`[a](${parens(32)})\n`)).toBe(`<p><a href="${parens(32)}">a</a></p>\n`);
        expect(r(`[a]: ${parens(32)}\n\n[a]\n`)).toBe(`<p><a href="${parens(32)}">a</a></p>\n`);
    });

    test('33 levels is no destination: the text stays text', () => {
        expect(r(`[a](${parens(33)})\n`)).toBe(`<p>[a](${parens(33)})</p>\n`);
        expect(r(`[a]: ${parens(33)}\n\n[a]\n`)).toBe(`<p>[a]: ${parens(33)}</p>\n<p>[a]</p>\n`);
    });
});
