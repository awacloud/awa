// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Unit tests for the inline parser.
 *
 * Targets tricky cases the official suite covers in aggregate but
 * which are easier to debug in isolation here.
 */

import { test, expect, describe } from 'bun:test';
import { md, createMd, mdMath } from '../../tests/_helpers/build.js';

function h(s) { return md.renderHtml(s); }

describe('inline parser — emphasis', () => {
    test('simple emph', () => {
        expect(h('*foo*\n')).toBe('<p><em>foo</em></p>\n');
    });
    test('simple strong', () => {
        expect(h('**foo**\n')).toBe('<p><strong>foo</strong></p>\n');
    });
    test('triple is emph+strong', () => {
        expect(h('***foo***\n')).toBe('<p><em><strong>foo</strong></em></p>\n');
    });
    test('underscore intraword does not open', () => {
        expect(h('foo_bar_baz\n')).toBe('<p>foo_bar_baz</p>\n');
    });
    test('asterisk intraword opens', () => {
        expect(h('foo*bar*baz\n')).toBe('<p>foo<em>bar</em>baz</p>\n');
    });
    test('nested emph + strong', () => {
        expect(h('*foo **bar** baz*\n'))
            .toBe('<p><em>foo <strong>bar</strong> baz</em></p>\n');
    });
    test('strong then emph', () => {
        expect(h('**foo *bar* baz**\n'))
            .toBe('<p><strong>foo <em>bar</em> baz</strong></p>\n');
    });
});

describe('inline parser — code spans', () => {
    test('simple', () => {
        expect(h('`foo`\n')).toBe('<p><code>foo</code></p>\n');
    });
    test('multiple backticks', () => {
        expect(h('``foo`bar``\n')).toBe('<p><code>foo`bar</code></p>\n');
    });
    test('strips one surrounding space', () => {
        expect(h('` `` `\n')).toBe('<p><code>``</code></p>\n');
    });
    test('unmatched leaves literal', () => {
        expect(h('`foo\n')).toBe('<p>`foo</p>\n');
    });
    test('preserves spaces when all space', () => {
        expect(h('`  `\n')).toBe('<p><code>  </code></p>\n');
    });
});

describe('inline parser — links', () => {
    test('inline link', () => {
        expect(h('[foo](/uri)\n')).toBe('<p><a href="/uri">foo</a></p>\n');
    });
    test('inline link with title', () => {
        expect(h('[foo](/uri "t")\n'))
            .toBe('<p><a href="/uri" title="t">foo</a></p>\n');
    });
    test('balanced brackets in label', () => {
        expect(h('[a [b] c](/uri)\n')).toBe('<p><a href="/uri">a [b] c</a></p>\n');
    });
    test('reference link', () => {
        expect(h('[foo][bar]\n\n[bar]: /uri\n'))
            .toBe('<p><a href="/uri">foo</a></p>\n');
    });
    test('collapsed reference link', () => {
        expect(h('[foo][]\n\n[foo]: /uri\n'))
            .toBe('<p><a href="/uri">foo</a></p>\n');
    });
    test('shortcut reference link', () => {
        expect(h('[foo]\n\n[foo]: /uri\n'))
            .toBe('<p><a href="/uri">foo</a></p>\n');
    });
    test('case-insensitive label', () => {
        expect(h('[FOO]\n\n[foo]: /uri\n'))
            .toBe('<p><a href="/uri">FOO</a></p>\n');
    });
    test('no links in links', () => {
        expect(h('[foo [bar](/u)](/v)\n'))
            .toBe('<p>[foo <a href="/u">bar</a>](/v)</p>\n');
    });
});

describe('inline parser — images', () => {
    test('inline image', () => {
        expect(h('![alt](/i.png)\n'))
            .toBe('<p><img src="/i.png" alt="alt" /></p>\n');
    });
    test('image strips alt tags', () => {
        expect(h('![*hi*](/i)\n'))
            .toBe('<p><img src="/i" alt="hi" /></p>\n');
    });
    test('nested images render alt as plaintext', () => {
        expect(h('![foo ![bar](/b)](/a)\n'))
            .toBe('<p><img src="/a" alt="foo bar" /></p>\n');
    });
});

describe('inline parser — autolinks', () => {
    test('url autolink', () => {
        expect(h('<http://x.com>\n'))
            .toBe('<p><a href="http://x.com">http://x.com</a></p>\n');
    });
    test('email autolink', () => {
        expect(h('<a@b.com>\n'))
            .toBe('<p><a href="mailto:a@b.com">a@b.com</a></p>\n');
    });
});

describe('inline parser — html inline', () => {
    // Raw passthrough is the explicit `safe: false` opt-out (BL-2015).
    const raw = (s) => md.renderHtml(s, { safe: false });
    test('open tag passes through', () => {
        expect(raw('a <b> c\n')).toBe('<p>a <b> c</p>\n');
    });
    test('comment passes through', () => {
        expect(raw('a <!-- x --> b\n')).toBe('<p>a <!-- x --> b</p>\n');
    });
    test('the default strips both', () => {
        expect(h('a <b> c\n')).toBe('<p>a  c</p>\n');
        expect(h('a <!-- x --> b\n')).toBe('<p>a  b</p>\n');
    });
});

describe('inline parser — entities and escapes', () => {
    test('named entity', () => {
        expect(h('&amp;\n')).toBe('<p>&amp;</p>\n');
    });
    test('numeric entity', () => {
        expect(h('&#42;\n')).toBe('<p>*</p>\n');
    });
    test('hex entity', () => {
        expect(h('&#x2A;\n')).toBe('<p>*</p>\n');
    });
    test('backslash escape', () => {
        expect(h('\\*not emph\\*\n')).toBe('<p>*not emph*</p>\n');
    });
    test('backslash-newline = hard break', () => {
        expect(h('a\\\nb\n')).toBe('<p>a<br />\nb</p>\n');
    });
});

describe('inline parser — line breaks', () => {
    test('soft break', () => {
        expect(h('a\nb\n')).toBe('<p>a\nb</p>\n');
    });
    test('two-space hard break', () => {
        expect(h('a  \nb\n')).toBe('<p>a<br />\nb</p>\n');
    });
});

describe('inline parser — smartDashes', () => {
    const dashes = createMd({ smartDashes: true });
    function d(s) { return dashes.renderHtml(s); }

    test('off by default: hyphens and periods stay literal', () => {
        expect(h('a--b c---d e...\n')).toBe('<p>a--b c---d e...</p>\n');
        expect(createMd({ smart: true }).renderHtml('a--b e...\n')).toBe('<p>a--b e...</p>\n');
    });
    test('two hyphens: en dash, three: em dash', () => {
        expect(d('a--b c---d\n')).toBe('<p>a–b c—d</p>\n');
    });
    test('longer runs: homogeneous when possible, em dashes first, fewest en dashes', () => {
        const runs = [4, 5, 6, 7, 8, 9, 13].map((n) => '-'.repeat(n)).join(' ');
        expect(d('x ' + runs + '\n')).toBe('<p>x –– —– —— —–– –––– ——— ———––</p>\n');
    });
    test('a single hyphen is kept', () => {
        expect(d('one-two\n')).toBe('<p>one-two</p>\n');
    });
    test('three periods: ellipsis, left to right', () => {
        expect(d('a...b....\n')).toBe('<p>a…b….</p>\n');
    });
    test('escaped hyphens and periods stay literal', () => {
        expect(d('\\-- \\-\\-\\- x\\.\\.\\.\n')).toBe('<p>-- --- x...</p>\n');
    });
    test('entities stay literal', () => {
        expect(d('&#45;&#45; &#46;&#46;&#46;\n')).toBe('<p>-- ...</p>\n');
    });
    test('code spans, raw HTML and <> autolinks are untouched', () => {
        const raw = createMd({ smartDashes: true, disallowedRawHtml: false });
        expect(raw.renderHtml('`a--b...` <span title="a--b">x</span> <http://a.example/b--c...>\n', { safe: false }))
            .toBe('<p><code>a--b...</code> <span title="a--b">x</span> <a href="http://a.example/b--c...">http://a.example/b--c...</a></p>\n');
    });
    test('link text and image alt are converted, destinations and titles are not', () => {
        expect(d('[a--b](/x--y "t--u") ![c...](/i...)\n'))
            .toBe('<p><a href="/x--y" title="t--u">a–b</a> <img src="/i..." alt="c…" /></p>\n');
    });
    test('an extended autolink keeps its hyphens and periods', () => {
        expect(d('see -- www.a--b.example/c...d and https://x--y.example/p--q -- mail a--b@c--d.example ...\n'))
            .toBe('<p>see – <a href="http://www.a--b.example/c...d">www.a--b.example/c...d</a> and '
                + '<a href="https://x--y.example/p--q">https://x--y.example/p--q</a> – mail '
                + '<a href="mailto:a--b@c--d.example">a--b@c--d.example</a> …</p>\n');
    });
    test('periods glued to an extended autolink stay literal; a word GFM does not link is converted', () => {
        expect(d('www.a.example... --www.b.example\n'))
            .toBe('<p><a href="http://www.a.example">www.a.example</a>... –www.b.example</p>\n');
    });
    test('with extended autolinks off, every run is converted', () => {
        expect(createMd({ smartDashes: true, extendedAutolinks: false }).renderHtml('www.a--b.example\n'))
            .toBe('<p>www.a–b.example</p>\n');
    });
    test('independent of smart: quotes stay straight', () => {
        expect(d('"a--b"\n')).toBe('<p>&quot;a–b&quot;</p>\n');
        expect(createMd({ smart: true, smartDashes: true }).renderHtml('"a--b"\n')).toBe('<p>“a–b”</p>\n');
    });
    test('a math span is untouched', () => {
        expect(createMd({ smartDashes: true }).use(mdMath).renderHtml('x-- $a--b...$ y...\n'))
            .toBe('<p>x– <span class="math inline">a--b...</span> y…</p>\n');
    });
    test('inline sourcepos positions do not move', () => {
        const src = 'a--b *c---d* e...f\n';
        const spans = (m) => {
            const out = [];
            const w = m.parse(src).walker();
            let ev;
            while ((ev = w.next())) if (ev.entering && ev.node.sourcepos) out.push(JSON.stringify(ev.node.sourcepos));
            return out;
        };
        expect(spans(createMd({ sourcepos: true, smartDashes: true }))).toEqual(spans(createMd({ sourcepos: true })));
    });
});
