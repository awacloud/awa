// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GFM (GitHub Flavored Markdown) extension test suite.
 *
 * Hand-curated cases covering the GFM spec sections on tables (§4.10),
 * task list items (§5.3), strikethrough (§6.5), autolinks (§6.9), and
 * disallowed raw HTML (§6.11). Cases were transcribed from
 * `references/SPEC/Markdown/GitHub Flavored Markdown Spec.htm` —
 * extraction from the structured HTML was impractical due to
 * `<span class="space">` interleaving, so the examples were
 * hand-written from inspecting the spec.
 *
 * Failures are reported per-feature group.
 */

import { test, expect, describe } from 'bun:test';
import { md } from './_helpers/build.js';

// Spec examples pin the raw passthrough (and the tagfilter, which only acts
// on it): explicit opt-out of the default hardening (BL-2015).
function check(input, expected) {
    expect(md.renderHtml(input, { safe: false })).toBe(expected);
}

describe('GFM tables', () => {
    test('basic table', () => {
        check(
            '| foo | bar |\n| --- | --- |\n| baz | bim |\n',
            '<table>\n<thead>\n<tr>\n<th>foo</th>\n<th>bar</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>baz</td>\n<td>bim</td>\n</tr>\n</tbody>\n</table>\n'
        );
    });
    test('table with center+right alignment', () => {
        check(
            '| abc | defghi |\n:-: | -----------:\nbar | baz\n',
            '<table>\n<thead>\n<tr>\n<th align="center">abc</th>\n<th align="right">defghi</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td align="center">bar</td>\n<td align="right">baz</td>\n</tr>\n</tbody>\n</table>\n'
        );
    });
    test('table with left alignment', () => {
        check(
            '| a | b |\n| :--- | :--- |\n| 1 | 2 |\n',
            '<table>\n<thead>\n<tr>\n<th align="left">a</th>\n<th align="left">b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td align="left">1</td>\n<td align="left">2</td>\n</tr>\n</tbody>\n</table>\n'
        );
    });
    test('table broken by blockquote', () => {
        check(
            '| abc | def |\n| --- | --- |\n| bar | baz |\n> bar\n',
            '<table>\n<thead>\n<tr>\n<th>abc</th>\n<th>def</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>bar</td>\n<td>baz</td>\n</tr>\n</tbody>\n</table>\n<blockquote>\n<p>bar</p>\n</blockquote>\n'
        );
    });
    test('table with fewer cells in body row', () => {
        check(
            '| abc | def |\n| --- | --- |\n| bar |\n',
            '<table>\n<thead>\n<tr>\n<th>abc</th>\n<th>def</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>bar</td>\n<td></td>\n</tr>\n</tbody>\n</table>\n'
        );
    });
    test('table not recognized when header/delim cell counts differ', () => {
        check(
            '| abc | def |\n| --- |\n| bar |\n',
            '<p>| abc | def |\n| --- |\n| bar |</p>\n'
        );
    });
    test('header only', () => {
        check(
            '| h1 | h2 |\n| --- | --- |\n',
            '<table>\n<thead>\n<tr>\n<th>h1</th>\n<th>h2</th>\n</tr>\n</thead>\n</table>\n'
        );
    });
    test('escaped pipe in cell', () => {
        check(
            '| f\\|oo |\n| ------ |\n| a |\n',
            '<table>\n<thead>\n<tr>\n<th>f|oo</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>a</td>\n</tr>\n</tbody>\n</table>\n'
        );
    });
    test('inline markdown inside cells', () => {
        check(
            '| **bold** | *em* |\n| --- | --- |\n| `code` | x |\n',
            '<table>\n<thead>\n<tr>\n<th><strong>bold</strong></th>\n<th><em>em</em></th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>code</code></td>\n<td>x</td>\n</tr>\n</tbody>\n</table>\n'
        );
    });
    test('multiple body rows', () => {
        check(
            '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n',
            '<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n<tr>\n<td>3</td>\n<td>4</td>\n</tr>\n</tbody>\n</table>\n'
        );
    });
    test('no leading pipe', () => {
        check(
            'a | b\n--- | ---\n1 | 2\n',
            '<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n</tbody>\n</table>\n'
        );
    });
    test('extra body cells ignored', () => {
        check(
            '| a | b |\n| - | - |\n| 1 | 2 | 3 |\n',
            '<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n</tbody>\n</table>\n'
        );
    });
});

describe('GFM strikethrough', () => {
    test('basic single-tilde', () => {
        check('~Hi~\n', '<p><del>Hi</del></p>\n');
    });
    test('basic double-tilde', () => {
        check('~~Hi~~\n', '<p><del>Hi</del></p>\n');
    });
    test('mixed paragraph', () => {
        check('~~Hi~~ Hello, ~there~ world!\n',
              '<p><del>Hi</del> Hello, <del>there</del> world!</p>\n');
    });
    test('does not cross paragraphs', () => {
        check('This ~~has a\n\nnew paragraph~~.\n',
              '<p>This ~~has a</p>\n<p>new paragraph~~.</p>\n');
    });
    test('three tildes do not strike', () => {
        check('This will ~~~not~~~ strike.\n',
              '<p>This will ~~~not~~~ strike.</p>\n');
    });
    test('strike with emphasis inside', () => {
        check('~~*em*~~\n', '<p><del><em>em</em></del></p>\n');
    });
    test('emphasis with strike inside', () => {
        check('*~~struck~~*\n', '<p><em><del>struck</del></em></p>\n');
    });
    test('strike across word boundaries', () => {
        check('a ~~b c~~ d\n', '<p>a <del>b c</del> d</p>\n');
    });
    test('unmatched single tilde', () => {
        check('a ~ b\n', '<p>a ~ b</p>\n');
    });
    test('strikethrough with code inside', () => {
        check('~~`code`~~\n', '<p><del><code>code</code></del></p>\n');
    });
});

describe('GFM task list items', () => {
    test('basic unchecked + checked', () => {
        check(
            '- [ ] foo\n- [x] bar\n',
            '<ul>\n<li><input disabled="" type="checkbox"> foo</li>\n<li><input checked="" disabled="" type="checkbox"> bar</li>\n</ul>\n'
        );
    });
    test('uppercase X', () => {
        check(
            '- [X] done\n',
            '<ul>\n<li><input checked="" disabled="" type="checkbox"> done</li>\n</ul>\n'
        );
    });
    test('mixed with normal item', () => {
        check(
            '- [ ] todo\n- normal\n',
            '<ul>\n<li><input disabled="" type="checkbox"> todo</li>\n<li>normal</li>\n</ul>\n'
        );
    });
    test('ordered list task', () => {
        check(
            '1. [x] one\n2. [ ] two\n',
            '<ol>\n<li><input checked="" disabled="" type="checkbox"> one</li>\n<li><input disabled="" type="checkbox"> two</li>\n</ol>\n'
        );
    });
    test('task with inline emph', () => {
        check(
            '- [ ] *foo*\n',
            '<ul>\n<li><input disabled="" type="checkbox"> <em>foo</em></li>\n</ul>\n'
        );
    });
    test('no space after marker — not a task', () => {
        check(
            '- [x]done\n',
            '<ul>\n<li>[x]done</li>\n</ul>\n'
        );
    });
    test('task list inside blockquote', () => {
        check(
            '> - [x] q\n',
            '<blockquote>\n<ul>\n<li><input checked="" disabled="" type="checkbox"> q</li>\n</ul>\n</blockquote>\n'
        );
    });
    test('two task items both unchecked', () => {
        check(
            '- [ ] a\n- [ ] b\n',
            '<ul>\n<li><input disabled="" type="checkbox"> a</li>\n<li><input disabled="" type="checkbox"> b</li>\n</ul>\n'
        );
    });
    test('not a list — not a task', () => {
        check(
            '[ ] foo\n',
            '<p>[ ] foo</p>\n'
        );
    });
    test('plus list bullet task', () => {
        check(
            '+ [x] plus\n',
            '<ul>\n<li><input checked="" disabled="" type="checkbox"> plus</li>\n</ul>\n'
        );
    });
});

describe('GFM extended autolinks', () => {
    test('bare http URL', () => {
        check('https://example.com\n',
              '<p><a href="https://example.com">https://example.com</a></p>\n');
    });
    test('bare https URL with path', () => {
        check('see https://example.com/foo for info\n',
              '<p>see <a href="https://example.com/foo">https://example.com/foo</a> for info</p>\n');
    });
    test('www URL', () => {
        check('www.commonmark.org\n',
              '<p><a href="http://www.commonmark.org">www.commonmark.org</a></p>\n');
    });
    test('bare email', () => {
        check('foo@bar.baz\n',
              '<p><a href="mailto:foo@bar.baz">foo@bar.baz</a></p>\n');
    });
    test('trailing period stripped', () => {
        check('Visit https://example.com.\n',
              '<p>Visit <a href="https://example.com">https://example.com</a>.</p>\n');
    });
    test('trailing comma stripped', () => {
        check('See https://example.com, then go.\n',
              '<p>See <a href="https://example.com">https://example.com</a>, then go.</p>\n');
    });
    test('trailing closing paren stripped if unbalanced', () => {
        check('(https://example.com)\n',
              '<p>(<a href="https://example.com">https://example.com</a>)</p>\n');
    });
    test('balanced parens kept', () => {
        check('https://en.wikipedia.org/wiki/Markdown_(language)\n',
              '<p><a href="https://en.wikipedia.org/wiki/Markdown_(language)">https://en.wikipedia.org/wiki/Markdown_(language)</a></p>\n');
    });
    test('email with plus', () => {
        check('hello+xyz@mail.example\n',
              '<p><a href="mailto:hello+xyz@mail.example">hello+xyz@mail.example</a></p>\n');
    });
    test('inside emphasis', () => {
        check('*see https://example.com*\n',
              '<p><em>see <a href="https://example.com">https://example.com</a></em></p>\n');
    });
    test('multiple URLs', () => {
        check('a https://x.com and https://y.com b\n',
              '<p>a <a href="https://x.com">https://x.com</a> and <a href="https://y.com">https://y.com</a> b</p>\n');
    });
    test('trailing exclamation stripped', () => {
        check('Yay https://example.com!\n',
              '<p>Yay <a href="https://example.com">https://example.com</a>!</p>\n');
    });
    test('not inside code span', () => {
        check('`https://example.com`\n',
              '<p><code>https://example.com</code></p>\n');
    });
    test('not inside existing link', () => {
        check('[click https://example.com here](https://other.com)\n',
              '<p><a href="https://other.com">click https://example.com here</a></p>\n');
    });
    test('ftp scheme', () => {
        check('ftp://files.example.com/x\n',
              '<p><a href="ftp://files.example.com/x">ftp://files.example.com/x</a></p>\n');
    });
});

describe('GFM disallowed raw HTML', () => {
    test('script tag escaped', () => {
        check('<script>alert(1)</script>\n',
              '&lt;script>alert(1)&lt;/script>\n');
    });
    test('iframe tag escaped', () => {
        check('foo <iframe src="x"></iframe> bar\n',
              '<p>foo &lt;iframe src="x">&lt;/iframe> bar</p>\n');
    });
    test('title tag escaped', () => {
        check('<title>x</title>\n',
              '&lt;title>x&lt;/title>\n');
    });
    test('allowed tag not escaped', () => {
        check('<div>ok</div>\n',
              '<div>ok</div>\n');
    });
    test('style tag escaped inline', () => {
        check('a <style>b</style> c\n',
              '<p>a &lt;style>b&lt;/style> c</p>\n');
    });
});
