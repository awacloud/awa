// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview cmark's pathological cases (cmark 0.31.2
 * `test/pathological_tests.py`) at small sizes: the output of each case
 * matches cmark's pattern, and inputs over the default size limits are
 * refused with the typed `md/limit-exceeded`.
 *
 * The input generators and patterns are a JavaScript port of cmark's
 * (BSD-2-Clause; notice and provenance in
 * `_fixtures/cmark-pathological/PROVENANCE.md`). The timing of the same
 * cases at their upstream sizes is measured by `tools/office-scorecard`
 * (`axis-d`), never here: this file asserts outputs only.
 *
 * @module md/tests/cmark-pathological.integration
 */

import { test, expect, describe } from 'bun:test';
import { createMd } from './_helpers/build.js';

const k = (n, s) => Math.max(2, Math.round(n * s));
const NUL = String.fromCharCode(0);
const FFFD = String.fromCharCode(0xfffd);

function hashCollisions(s) {
    const COUNT = k(25000, s);
    const badhash = (ref) => {
        let h = 0;
        for (let i = 0; i < ref.length; i++) h = (ref.charCodeAt(i) + ((h << 6) >>> 0) + ((h << 16) >>> 0) - h) >>> 0;
        return h % 16 === 0;
    };
    const keys = [];
    for (let i = 0; keys.length < COUNT; i++) if (badhash(`x${i}`)) keys.push(`x${i}`);
    const bad = keys[0];
    return {
        input: keys.slice(1).map((key) => `[${key}]: /url\n\n[${bad}]\n\n`).join(''),
        check: new RegExp(`(<p>\\[${bad}]</p>\\n){${COUNT - 1}}`),
    };
}

/** [name, input(s), pattern(s), render] — render 'md' = renderMarkdown, else renderHtml. */
const CASES = [
    ['nested strong emph', (s) => '*a **a '.repeat(k(32500, s)) + 'b' + ' a** a*'.repeat(k(32500, s)), (s) => new RegExp(`(<em>a <strong>a ){${k(32500, s)}}b( a</strong> a</em>){${k(32500, s)}}`)],
    ['many emph closers with no openers', (s) => 'a_ '.repeat(k(32500, s)), (s) => new RegExp(`(a[_] ){${k(32500, s) - 1}}a_`)],
    ['many emph openers with no closers', (s) => '_a '.repeat(k(32500, s)), (s) => new RegExp(`(_a ){${k(32500, s) - 1}}_a`)],
    ['many link closers with no openers', (s) => 'a]'.repeat(k(32500, s)), (s) => new RegExp(`(a\\]){${k(32500, s)}}`)],
    ['many link openers with no closers', (s) => '[a'.repeat(k(32500, s)), (s) => new RegExp(`(\\[a){${k(32500, s)}}`)],
    ['mismatched openers and closers', (s) => '*a_ '.repeat(k(25000, s)), (s) => new RegExp(`([*]a[_] ){${k(25000, s) - 1}}[*]a_`)],
    ['issue #389', (s) => '*a '.repeat(k(20000, s)) + '_a*_ '.repeat(k(20000, s)), (s) => new RegExp(`(<em>a ){${k(20000, s)}}(_a<\\/em>_ ?){${k(20000, s)}}`)],
    ['openers and closers multiple of 3', (s) => 'a**b' + 'c* '.repeat(k(25000, s)), (s) => new RegExp(`a[*][*]b(c[*] ){${k(25000, s) - 1}}c[*]`)],
    ['link openers and emph closers', (s) => '[ a_'.repeat(k(25000, s)), (s) => new RegExp(`(\\[ a_){${k(25000, s)}}`)],
    ['pattern [ (]( repeated', (s) => '[ (]('.repeat(k(40000, s)), (s) => new RegExp(`(\\[ \\(\\]\\(){${k(40000, s)}}`)],
    ['pattern ![[]() repeated', (s) => '![[]()'.repeat(k(160000, s)), (s) => new RegExp(`(!\\[<a href=""></a>){${k(160000, s)}}`)],
    ['hard link/emph case', () => '**x [a*b**c*](d)', () => /\*\*x <a href="d">a<em>b\*\*c<\/em><\/a>/],
    ['nested brackets', (s) => '['.repeat(k(25000, s)) + 'a' + ']'.repeat(k(25000, s)), (s) => new RegExp(`\\[{${k(25000, s)}}a\\]{${k(25000, s)}}`)],
    ['nested block quotes', (s) => '> '.repeat(k(25000, s)) + 'a', (s) => new RegExp(`(<blockquote>\\n){${k(25000, s)}}`)],
    ['deeply nested lists', (s) => Array.from({ length: k(500, s) }, (_, x) => '  '.repeat(x) + '* a\n').join(''),
        (s) => new RegExp(`<ul>\\n(<li>a\\n<ul>\\n){${k(500, s) - 1}}<li>a</li>\\n</ul>\\n(</li>\\n</ul>\\n){${k(500, s) - 1}}`)],
    ['U+0000 in input', () => `abc${NUL}de${NUL}`, () => new RegExp(`abc${FFFD}?de${FFFD}?`)],
    ['backticks', (s) => Array.from({ length: k(2499, s) }, (_, x) => 'e' + '`'.repeat(x + 1)).join(''), () => /^<p>[e`]*<\/p>\n$/],
    ['unclosed links A', (s) => '[a](<b'.repeat(k(30000, s)), (s) => new RegExp(`(\\[a]\\(&lt;b){${k(30000, s)}}`)],
    ['unclosed links B', (s) => '[a](b'.repeat(k(30000, s)), (s) => new RegExp(`(\\[a]\\(b){${k(30000, s)}}`)],
    ['unclosed <!--', (s) => '</' + '<!--'.repeat(k(300000, s)), (s) => new RegExp(`\\&lt;\\/(\\&lt;!--){${k(300000, s)}}`)],
    ['empty lines in deeply nested lists', (s) => '- '.repeat(k(30000, s)) + 'x' + '\n'.repeat(k(30000, s)), () => /^(<\w+>\n?)+x(<\/\w+>\n)+$/],
    ['empty lines in deeply nested lists in blockquote', (s) => '> ' + '- '.repeat(k(30000, s)) + 'x\n' + '>\n'.repeat(k(30000, s)), () => /^(<\w+>\n?)+x(<\/\w+>\n)+$/],
    ['emph in deep blockquote', (s) => '>'.repeat(k(100000, s)) + 'a*'.repeat(k(100000, s)), () => /^(<\w+>\n)+<p>.*<\/p>\n(<\/\w+>\n)+$/],
    ['reference collisions', (s) => hashCollisions(s).input, (s) => hashCollisions(s).check],
    ['nested inlines', (s) => '*'.repeat(k(20000, s)) + 'a' + '*'.repeat(k(20000, s)), () => /^\*+a\*+\n?$/, 'md'],
];

const opts = { extendedAutolinks: false, disallowedRawHtml: false };
function render(md, [, input, , kind], s) {
    const src = input(s);
    return kind === 'md' ? md.renderMarkdown(md.parse(src)) : md.renderHtml(src, { safe: false });
}

describe('cmark pathological cases at small sizes', () => {
    const lifted = createMd({ ...opts, maxDepth: Infinity, maxNodes: Infinity });

    test('25 cases ported', () => {
        expect(CASES).toHaveLength(25);
        expect(new Set(CASES.map((c) => c[0])).size).toBe(25);
    });

    for (const c of CASES) {
        test(`${c[0]}: output matches cmark's pattern`, () => {
            expect(render(lifted, c, 0.01)).toMatch(c[2](0.01));
        });
    }
});

describe('inputs over the default limits are refused with the typed error', () => {
    const strict = createMd(opts);
    const byName = (name) => CASES.find((c) => c[0] === name);

    for (const [name, s, kind] of [
        ['nested block quotes', 0.06, 'maxDepth'],
        ['empty lines in deeply nested lists', 0.05, 'maxDepth'],
        ['pattern [ (]( repeated', 1, 'maxNodes'],
    ]) {
        test(`${name} at ${s} of its upstream size: md/limit-exceeded (${kind})`, () => {
            let err;
            try {
                render(strict, byName(name), s);
            } catch (e) {
                err = e;
            }
            expect(err && err.code).toBe('md/limit-exceeded');
            expect(err.context.kind).toBe(kind);
        });
    }
});
