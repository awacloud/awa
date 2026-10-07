// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runtime, ContractError } from '../../tests/_helpers/build.js';
import { mdHtmlDocument } from './html-document.js';

const doc = runtime.resolve('mdHtmlDocument');
const tocApi = runtime.resolve('mdToc');
const themeApi = runtime.resolve('mdHtmlTheme');
const mdApi = runtime.resolve('md');

/** Run `fn`, returning `{ value }` or `{ error: { code, context } }` (never throws). */
function attempt(fn) {
    try {
        return { value: fn() };
    } catch (e) {
        return { error: { code: e && e.code, context: e && e.context, isContract: e instanceof ContractError } };
    }
}

function frag(source, options, path) {
    return doc.renderFragment({ path: path || 'doc.md', source }, options);
}

/** Warnings minus the title/fallback of untitled fixtures. */
function w(f) {
    return f.warnings.filter((x) => x.code !== 'title/fallback');
}

/** The <body> part of a built page (the embedded CSS names every class). */
function bodyOf(html) {
    return html.slice(html.indexOf('<body'));
}

function build1(source, extra) {
    return doc.build({ documents: [{ path: 'a.md', source }], ...(extra || {}) });
}

const THREE = [
    { path: 'a.md', source: '# Alpha\n\nSee [b](b.md#sec).\n\n## One\n\n## Two\n' },
    { path: 'b.md', source: '# Beta\n\n## Sec\n\ntext\n' },
    { path: 'c.md', source: '# Gamma\n\nbody\n' }
];

const NOTICE_FIXED = [
    '@awacloud/md html-document — the stylesheet and script embedded in this file',
    'Copyright (c) 2026 AwaCloud SAS',
    'SPDX-License-Identifier: AGPL-3.0-only',
    'Dual-licensed; see the NOTICE file of @awacloud/md for licensing and any additional terms.',
    'This notice covers the embedded stylesheet and script only, not the document content.'
];

// ─── Shape / registration ────────────────────────────────────────────────────

describe('mdHtmlDocument — descriptor shape', () => {
    test('descriptor { name, dependencies (exact), factory }', () => {
        expect(mdHtmlDocument.name).toBe('mdHtmlDocument');
        expect(mdHtmlDocument.dependencies).toEqual(
            ['mdErrors', 'md', 'sanitize', 'mdToc', 'mdFrontmatter', 'mdFootnotes', 'mdAdmonitions', 'mdHtmlTheme']);
        expect(typeof mdHtmlDocument.factory).toBe('function');
        expect(mdHtmlDocument.factory.toString()).toContain('function');
    });

    test('api keys pinned exhaustively', () => {
        expect(Object.keys(doc)).toEqual(['renderFragment', 'build']);
    });
});

// ─── renderFragment ──────────────────────────────────────────────────────────

describe('renderFragment — heading anchors', () => {
    test('ids on every level equal collectHeadings slugs; duplicates get -1, -2', () => {
        const src = '# H one\n\n## H two\n\n### H three\n\n#### H four\n\n##### H five\n\n###### H six\n\n## Dup\n\n## Dup\n\n## Dup\n';
        const f = frag(src);
        const m = mdApi.createMd();
        const slugs = tocApi.collectHeadings(m.parse(src), { minLevel: 1, maxLevel: 6 }).map((h) => h.slug);
        expect(slugs).toEqual(['h-one', 'h-two', 'h-three', 'h-four', 'h-five', 'h-six', 'dup', 'dup-1', 'dup-2']);
        for (let n = 1; n <= 6; n++) {
            expect(f.html).toContain('<h' + n + ' id="' + slugs[n - 1] + '">');
        }
        expect(f.html).toContain('<h2 id="dup">');
        expect(f.html).toContain('<h2 id="dup-1">');
        expect(f.html).toContain('<h2 id="dup-2">');
        expect(f.headings.map((h) => h.id)).toEqual(slugs);
        expect(f.headings[0]).toEqual({ level: 1, text: 'H one', id: 'h-one' });
        expect(f.warnings).toEqual([]);
    });

    test('pairing robustness: a raw <h2> before ## A is never anchored, no warning', () => {
        const f = frag('<h2>R</h2>\n\n## A\n');
        expect(f.html).toContain('<h2>R</h2>');
        expect(f.html).toContain('<h2 id="a">A</h2>');
        expect((f.html.match(/ id="/g) || []).length).toBe(1);
        expect(w(f)).toEqual([]);
    });

    test('text-walk mode (raw heading present) still anchors headings with entities', () => {
        const f = frag('<h2>R</h2>\n\n## A & b\n\n### x < y\n');
        expect(f.html).toContain('<h2 id="a-b">');
        expect(f.html).toContain('<h3 id="x-y">');
        expect(w(f)).toEqual([]);
    });

    test('headings whose rendered text differs from the AST text are still anchored', () => {
        // setext soft break (joined with a space: foo-bar, as GitHub), image alt, tag-like code span, footnote ref.
        const src = 'Foo\nbar\n===\n\n## ![alt](p.png)\n\n## `a<b>c`\n\n## Note[^1]\n\n## Last\n\n[^1]: n\n';
        const f = frag(src);
        expect(f.html).toContain('<h1 id="foo-bar">');
        expect(f.html).toContain('<h2 id="alt">');
        expect(f.html).toContain('<h2 id="abc">');
        expect(f.html).toContain('<h2 id="note">');
        expect(f.html).toContain('<h2 id="last">');
        expect(f.warnings).toEqual([]);
    });

    test('heading/unanchored is reachable only when a raw heading shifts the walk (pinned)', () => {
        // A raw <h2> forces the text walk; a heading whose rendered text differs
        // from its AST text (image alt) then stays unanchored and is reported.
        const f = frag('<h2>R</h2>\n\n## ![alt](p.png)\n');
        expect(w(f).map((x) => x.code)).toEqual(['heading/unanchored']);
        expect(w(f)[0]).toEqual({ code: 'heading/unanchored', document: 'doc.md', detail: 'alt' });
        // Default extras on a representative corpus: never.
        const g = frag('# T\n\n[[TOC]]\n\n## A\n\n> [!NOTE]\n> n\n\nx[^a]\n\n[^a]: f\n\n### B\n');
        expect(g.warnings.filter((w) => w.code === 'heading/unanchored')).toEqual([]);
    });
});

describe('renderFragment — title precedence', () => {
    test('explicit > yaml title (quoted / unquoted) > first H1 > basename', () => {
        const src = '---\ntitle: "Yaml T"\n---\n# H1 T\n';
        expect(doc.renderFragment({ path: 'x.md', source: src, title: 'Explicit' }).title).toBe('Explicit');
        expect(frag(src).title).toBe('Yaml T');
        expect(frag("---\ntitle: 'Single Q'\n---\n# H\n").title).toBe('Single Q');
        expect(frag('---\ntitle:   Plain T  \n---\n# H\n').title).toBe('Plain T');
        expect(frag('Intro\n\n# H1 T\n\n# Other\n').title).toBe('H1 T');
        const f = frag('## only h2\n', undefined, 'dir/sub/My-File.md');
        expect(f.title).toBe('My-File');
        expect(f.warnings).toEqual([{ code: 'title/fallback', document: 'dir/sub/My-File.md', detail: 'My-File' }]);
    });

    test('yaml without a title line falls through to the H1', () => {
        expect(frag('---\nauthor: x\n---\n# From H1\n').title).toBe('From H1');
    });
});

describe('renderFragment — extras', () => {
    test('default extras: admonition, footnote and [[TOC]] survive the sanitiser', () => {
        const f = frag('# T\n\n[[TOC]]\n\n## Sec\n\n> [!NOTE]\n> body\n\nref[^a]\n\n[^a]: foot\n');
        expect(f.html).toContain('<div class="admonition admonition-note">');
        expect(f.html).toContain('<p class="admonition-title">Note</p>');
        expect(f.html).toContain('<sup class="footnote-ref"><a href="#fn-a" id="fnref-a">1</a></sup>');
        expect(f.html).toContain('<section class="footnotes">');
        expect(f.html).toContain('<li id="fn-a">');
        expect(f.html).toContain('<a href="#sec">Sec</a>');
    });

    test('extras: [] → [!NOTE] rendered as a plain blockquote', () => {
        const f = frag('> [!NOTE]\n> body\n', { extras: [] });
        expect(f.html).toContain('<blockquote>');
        expect(f.html).toContain('[!NOTE]');
        expect(f.html).not.toContain('admonition');
    });

    test('extras: [emoji] → :smile: expanded', () => {
        const emoji = runtime.resolve('mdEmoji');
        const f = frag('hi :smile:\n', { extras: [emoji] });
        expect(f.html).not.toContain(':smile:');
        expect(frag('hi :smile:\n').html).toContain(':smile:');
    });
});

describe('renderFragment — id prefix', () => {
    const SRC = '# T\n\n[[TOC]]\n\n## Sec\n\nref[^a]\n\n[^a]: foot\n';

    test("idPrefix 'x--' prefixes heading ids, fn-/fnref- ids and every href=\"#…\"", () => {
        const f = frag(SRC, { idPrefix: 'x--' });
        expect(f.html).toContain('<h1 id="x--t">');
        expect(f.html).toContain('<h2 id="x--sec">');
        expect(f.html).toContain('id="x--fnref-a"');
        expect(f.html).toContain('href="#x--fn-a"');
        expect(f.html).toContain('<li id="x--fn-a">');
        expect(f.html).toContain('href="#x--fnref-a"');
        expect(f.html).toContain('<a href="#x--sec">Sec</a>');
        expect(f.html).not.toMatch(/\sid="(?!x--)/);
        expect(f.html).not.toMatch(/href="#(?!x--)/);
        expect(f.html).not.toContain('x--x--');
        expect(f.headings.map((h) => h.id)).toEqual(['x--t', 'x--sec']);
    });

    test("idPrefix '' leaves [[TOC]] links as #slug", () => {
        const f = frag(SRC);
        expect(f.html).toContain('<a href="#t">T</a>');
        expect(f.html).toContain('<a href="#sec">Sec</a>');
        expect(f.html).toContain('<h2 id="sec">');
    });

    test('id option wins over docIdOf(path)', () => {
        expect(frag('x\n', undefined, 'docs/My File.md').id).toBe('docs-my-file');
        expect(frag('x\n', { id: 'custom' }).id).toBe('custom');
        expect(frag('x\n', undefined, '.md').id).toBe('doc');
    });
});

describe('renderFragment — links', () => {
    test("https:// gets target+rel under 'new-tab' (default), nothing under 'same-tab'", () => {
        const a = frag('[w](https://example.com/x)\n');
        expect(a.html).toContain('<a href="https://example.com/x" target="_blank" rel="noopener noreferrer">');
        const b = frag('[w](https://example.com/x)\n', { links: { external: 'same-tab' } });
        expect(b.html).toContain('<a href="https://example.com/x">');
        expect(b.html).not.toContain('target=');
    });

    test('mailto: follows the same policy', () => {
        expect(frag('[m](mailto:a@b.c)\n').html).toContain('<a href="mailto:a@b.c" target="_blank" rel="noopener noreferrer">');
        expect(frag('[m](mailto:a@b.c)\n', { links: { external: 'same-tab' } }).html).toContain('<a href="mailto:a@b.c">');
    });

    test('external rewrite is idempotent on raw anchors that already carry target/rel', () => {
        const f = frag('<a href="https://e.x" target="_blank" rel="noopener noreferrer">e</a>\n');
        expect((f.html.match(/target=/g) || []).length).toBe(1);
        expect((f.html.match(/rel=/g) || []).length).toBe(1);
    });

    test('relative ../b/c.md#frag normalises; the resolve hook receives it and wins', () => {
        const seen = [];
        const resolve = (target, from) => { seen.push({ target, from: from.path }); return 'https://resolved.example/c#' + target.fragment; };
        const f = doc.renderFragment({ path: 'a/d.md', source: '[c](../b/c.md#frag)\n' }, { links: { resolve } });
        expect(seen).toEqual([{ target: { path: 'b/c.md', fragment: 'frag', markdown: true }, from: 'a/d.md' }]);
        expect(f.html).toContain('href="https://resolved.example/c#frag"');
        expect(w(f)).toEqual([]);
    });

    test('backslashes, ./ segments, percent-encoding and case-insensitive .MD', () => {
        const seen = [];
        const resolve = (t) => { seen.push(t); return null; };
        doc.renderFragment({ path: 'x\\y\\z.md', source: '[a](./q/../My%20Doc.MD)\n' }, { links: { resolve } });
        expect(seen).toEqual([{ path: 'x/y/My Doc.MD', fragment: null, markdown: true }]);
    });

    test("unresolved → md-dead-link + title + warning ('neutralise' default)", () => {
        const f = frag('[x](missing.md#s)\n');
        expect(f.html).toContain('<a class="md-dead-link" title="missing.md#s">x</a>');
        expect(f.html).not.toContain('href="missing.md');
        expect(w(f)).toEqual([{ code: 'link/unresolved', document: 'doc.md', detail: 'missing.md#s' }]);
    });

    test("'keep' → untouched + the same warning", () => {
        const f = frag('[x](missing.md)\n', { links: { unresolved: 'keep' } });
        expect(f.html).toContain('<a href="missing.md">x</a>');
        expect(w(f)).toEqual([{ code: 'link/unresolved', document: 'doc.md', detail: 'missing.md' }]);
    });

    test('a .png relative link and a root-relative .md link are untouched', () => {
        const f = frag('[p](img/p.png) [r](/abs/x.md)\n');
        expect(f.html).toContain('<a href="img/p.png">p</a>');
        expect(f.html).toContain('<a href="/abs/x.md">r</a>');
        expect(w(f)).toEqual([]);
    });
});

describe('renderFragment — links.resolve is consulted for every relative target', () => {
    function collect(src, ret) {
        const seen = [];
        const f = frag(src, { links: { resolve: (t) => { seen.push(t); return ret(t); } } });
        return { seen, f };
    }

    test('non-.md relative targets reach resolve with markdown: false', () => {
        const { seen } = collect('[p](img/p.png) [d](dir/) [f](dir/f.txt#x)\n', () => null);
        expect(seen).toEqual([
            { path: 'img/p.png', fragment: null, markdown: false },
            { path: 'dir', fragment: null, markdown: false },
            { path: 'dir/f.txt', fragment: 'x', markdown: false }
        ]);
    });

    test('a string return rewrites the href (attribute-escaped, sanitised after)', () => {
        const { f } = collect('[p](img/p.png)\n', () => 'https://cdn.example/p.png?a=1&b=2');
        expect(f.html).toContain('<a href="https://cdn.example/p.png?a=1&amp;b=2">p</a>');
        expect(w(f)).toEqual([]);
        const js = frag('[p](img/p.png)\n', { links: { resolve: () => 'javascript:alert(1)' } }).html.toLowerCase();
        expect(js).not.toContain('javascript:');
        expect(js).toContain('<a>p</a>');
    });

    test('null leaves a non-.md tag verbatim with NO link/unresolved warning, under both policies', () => {
        for (const unresolved of ['neutralise', 'keep']) {
            const f = frag('[p](img/p.png)\n', { links: { unresolved, resolve: () => null } });
            expect(f.html).toContain('<a href="img/p.png">p</a>');
            expect(w(f)).toEqual([]);
        }
    });

    test('.md targets behave as before: markdown: true, null → unresolved policy', () => {
        const { seen, f } = collect('[x](missing.md#s)\n', () => null);
        expect(seen).toEqual([{ path: 'missing.md', fragment: 's', markdown: true }]);
        expect(f.html).toContain('<a class="md-dead-link" title="missing.md#s">x</a>');
        expect(w(f)).toEqual([{ code: 'link/unresolved', document: 'doc.md', detail: 'missing.md#s' }]);
    });

    test('regression control: a relative link to an image without a resolver stays verbatim', () => {
        const f = frag('[p](img/p.png)\n');
        expect(f.html).toContain('<a href="img/p.png">p</a>');
        expect(w(f)).toEqual([]);
        const b = build1('[p](img/p.png)\n');
        expect(b.html).toContain('<a href="img/p.png">p</a>');
        expect(b.warnings.map((x) => x.code)).toEqual(['title/fallback']);
    });

    test('in-page, external, root-relative and scheme hrefs never reach resolve', () => {
        const { seen } = collect('[a](#x) [b](https://e.x) [c](/abs/p.png) [d](//h/p.png) [e](ftp://h/p) [f]()\n', () => null);
        expect(seen).toEqual([]);
    });

    test('build: the caller resolve sees non-.md targets; a string wins, null keeps the tag', () => {
        const seen = [];
        const r = doc.build({ documents: [{ path: 'a.md', source: '# A\n\n[p](img/p.png) [q](img/q.png)\n' }], links: {
            resolve: (t) => { seen.push(t.path + ':' + t.markdown); return t.path === 'img/p.png' ? 'assets/p.png' : null; }
        } });
        expect(seen).toEqual(['img/p.png:false', 'img/q.png:false']);
        expect(r.html).toContain('<a href="assets/p.png">p</a>');
        expect(r.html).toContain('<a href="img/q.png">q</a>');
        expect(r.warnings).toEqual([]);
    });

    test('HTML comments never survive rendering (see also the comment trick case below)', () => {
        const f = frag('before <!-- hidden --> after\n\n<!-- block -->\n\ntext\n');
        expect(f.html).not.toContain('<!--');
        expect(f.html).not.toContain('hidden');
        expect(f.html).not.toContain('block');
    });
});

describe('renderFragment — reservedIds', () => {
    test('a heading whose id is reserved is renamed to slug-1; others untouched', () => {
        const f = frag('## x\n\n## y\n', { reservedIds: ['x'] });
        expect(f.html).toContain('<h2 id="x-1">x</h2>');
        expect(f.html).toContain('<h2 id="y">y</h2>');
        expect(f.headings.map((h) => h.id)).toEqual(['x-1', 'y']);
    });

    test('the reservation applies to the final id (idPrefix + slug)', () => {
        const f = frag('## x\n', { idPrefix: 'p--', reservedIds: new Set(['x']) });
        expect(f.headings[0].id).toBe('p--x');
        const g = frag('## x\n', { idPrefix: 'p--', reservedIds: ['p--x'] });
        expect(g.headings[0].id).toBe('p--x-1');
        expect(g.html).toContain('<h2 id="p--x-1">');
    });

    test('the renamed id never collides with another heading of the same fragment', () => {
        const f = frag('## a\n\n## a 1\n', { reservedIds: ['a'] });
        // slugs: a, a-1 → `a` is reserved, `a-1` is a heading of the fragment → first free is a-2.
        expect(f.headings.map((h) => h.id)).toEqual(['a-2', 'a-1']);
        expect(new Set(f.headings.map((h) => h.id)).size).toBe(2);
    });

    test('a reserved id and its -1 both taken → -2; every in-document #slug link follows the rename', () => {
        const f = frag('# T\n\n[[TOC]]\n\n## x\n\n[go](#x)\n', { reservedIds: ['x', 'x-1'] });
        expect(f.html).toContain('<h2 id="x-2">x</h2>');
        expect(f.html).toContain('<a href="#x-2">x</a>');
        expect(f.html).toContain('<a href="#x-2">go</a>');
        const p = frag('## x\n\n[go](#x)\n', { idPrefix: 'd--', reservedIds: ['d--x'] });
        expect(p.html).toContain('<h2 id="d--x-1">x</h2>');
        expect(p.html).toContain('<a href="#d--x-1">go</a>');
    });

    test('no collision → output byte-identical to the option-less call', () => {
        const src = '# T\n\n[[TOC]]\n\n## A\n\n## B\n\nref[^a]\n\n[^a]: foot\n';
        expect(frag(src, { reservedIds: ['zzz', 'a--b'] })).toEqual(frag(src));
        expect(frag(src, { idPrefix: 'd--', reservedIds: [] })).toEqual(frag(src, { idPrefix: 'd--' }));
    });

    test('validation: an iterable of strings or nothing, else md/document-bad-option', () => {
        for (const bad of [42, 'abc', {}, [1], new Set([null])]) {
            const r = attempt(() => frag('## x\n', { reservedIds: bad }));
            expect(r.error && r.error.code).toBe('md/document-bad-option');
            expect(r.error.context.option).toBe('reservedIds');
        }
        expect(attempt(() => frag('## x\n', { reservedIds: undefined })).error).toBeUndefined();
        expect(attempt(() => frag('## x\n', { reservedIds: null })).error).toBeUndefined();
    });
});

describe('renderFragment — XSS table (sanitiser is the last pass)', () => {
    const CASES = [
        ['script tag', '<script>alert(1)</script>\n', ['<script']],
        ['img onerror', '<img src=x onerror=alert(1)>\n', ['onerror']],
        ['javascript: link', '[x](javascript:alert(1))\n', ['javascript:']],
        ['data:text/html link', '[x](data:text/html,<script>)\n', ['data:', '<script']],
        ['data: image', '![x](data:image/png;base64,AAA)\n', ['data:']],
        ['style tag', '<style>body{display:none}</style>\n', ['<style']],
        ['iframe', '<iframe src=//evil></iframe>\n', ['<iframe']],
        ['onclick', '<a href="x" onclick="1">y</a>\n', ['onclick']],
        ['svg onload', '<svg onload=1></svg>\n', ['<svg', 'onload']],
        ['comment trick', '<!-- --><script>alert(1)</script>\n', ['<!--', '<script']],
        ['[[TOC]] with injected heading', '[[TOC]]\n\n## <script>alert(1)</script>\n', ['<script']]
    ];
    for (const [name, src, tokens] of CASES) {
        test(name, () => {
            const html = frag(src).html.toLowerCase();
            for (const t of tokens) expect(html).not.toContain(t);
        });
    }

    test('the sanitiser runs after the link pass: a hostile resolve() result cannot survive', () => {
        const js = frag('[x](b.md)\n', { links: { resolve: () => 'javascript:alert(1)' } }).html.toLowerCase();
        expect(js).not.toContain('javascript:');
        expect(js).toContain('<a>x</a>');
        const q = frag('[x](b.md)\n', { links: { resolve: () => '"><script>alert(1)</script>' } }).html.toLowerCase();
        expect(q).not.toContain('<script');
        expect(q).not.toMatch(/href="[^"]*"[^ >]/);
    });

    test('<input … formaction> survives only as <input type="text" />', () => {
        const html = frag('<input type=text name=q formaction=//evil>\n').html;
        expect(html).toContain('<input type="text" />');
        expect(html.toLowerCase()).not.toContain('formaction');
        expect(html.toLowerCase()).not.toContain('name=');
        expect(html.toLowerCase()).not.toContain('evil');
    });

    test('heading with an <img onerror>: clean html, clean id, escaped TOC text', () => {
        const f = frag('## <img src=x onerror=alert(1)>\n\n## Two\n');
        expect(f.html.toLowerCase()).not.toContain('onerror=');
        expect(f.headings[0].id).toMatch(/^[a-z0-9_-]+$/);
        const { html } = build1('## <img src=x onerror=alert(1)>\n\n## Two\n');
        const nav = /<nav class="md-toc">[\s\S]*?<\/nav>/.exec(html)[0];
        expect(nav).not.toContain('<img');
        expect(nav).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    test('footnote id [^"><script>] causes no attribute breakout', () => {
        const html = frag('x[^"><script>]\n\n[^"><script>]: body\n').html.toLowerCase();
        expect(html).not.toContain('<script');
        expect(html).not.toMatch(/="[^"]*"[^ >/]/);
    });
});

describe('renderFragment — task list', () => {
    test('- [x] keeps <input checked disabled type=checkbox />', () => {
        const html = frag('- [x] done\n- [ ] todo\n').html;
        expect(html).toMatch(/<input checked="" disabled="" type="checkbox" \/> done/);
        expect(html).toMatch(/<input disabled="" type="checkbox" \/> todo/);
    });
});

// ─── build ───────────────────────────────────────────────────────────────────

describe('build — single document', () => {
    test('no sidebar, no script, md-single, visible article, bare ids, doc title', () => {
        const r = build1('# Hello\n\n## Sec\n');
        expect(r.html.startsWith('<!DOCTYPE html>\n<html lang="en">')).toBe(true);
        expect(r.html).not.toContain('<aside');
        expect(r.html).not.toContain('<script');
        expect(bodyOf(r.html)).not.toContain('md-nav-toggle');
        expect(r.html).toContain('<body class="md-document md-theme-auto md-single">');
        expect(r.html).toContain('<article class="md-doc" id="a">');
        expect(r.html).not.toMatch(/<article[^>]* hidden/);
        expect(r.html).toContain('<h2 id="sec">');
        expect(r.html).toContain('<title>Hello</title>');
        expect(r.html).toContain('<meta name="referrer" content="no-referrer">');
        expect(r.documents).toHaveLength(1);
        expect(r.warnings).toEqual([]);
    });

    test('single mode: a link to itself resolves to #fragment or #docId', () => {
        const r = build1('# A\n\n## Sec\n\n[s](a.md#sec) [t](a.md)\n');
        expect(r.html).toContain('<a href="#sec">s</a>');
        expect(r.html).toContain('<a href="#a">t</a>');
    });
});

describe('build — three documents', () => {
    const r = doc.build({ documents: THREE });

    test('md-multi, three nav items, articles 2-3 hidden, prefixed ids', () => {
        expect(r.html).toContain('<body class="md-document md-theme-auto md-multi">');
        expect((r.html.match(/<a class="md-nav-item"/g) || []).length).toBe(3);
        expect(r.html).toContain('<article class="md-doc" id="a">');
        expect(r.html).toContain('<article class="md-doc" id="b" hidden>');
        expect(r.html).toContain('<article class="md-doc" id="c" hidden>');
        expect(r.html).toContain('<h2 id="a--one">');
        expect(r.html).toContain('<h2 id="b--sec">');
        expect(r.html).toContain('<title>Documents</title>');
        expect(r.html).toContain('<button id="md-nav-toggle" aria-label="Menu">&#9776;</button>');
    });

    test('a.md → b.md#sec resolves to #b--sec', () => {
        expect(r.html).toContain('<a href="#b--sec">b</a>');
        expect(r.warnings).toEqual([]);
    });

    test('pager prev/next on the middle article; missing sides are empty spans', () => {
        const b = /<article class="md-doc" id="b"[\s\S]*?<\/article>/.exec(r.html)[0];
        expect(b).toContain('<div class="md-pager"><a class="md-pager-prev" href="#a">&larr; Alpha</a><a class="md-pager-next" href="#c">Gamma &rarr;</a></div>');
        const a = /<article class="md-doc" id="a"[\s\S]*?<\/article>/.exec(r.html)[0];
        expect(a).toContain('<div class="md-pager"><span></span><a class="md-pager-next" href="#b">');
        const c = /<article class="md-doc" id="c"[\s\S]*?<\/article>/.exec(r.html)[0];
        expect(c).toContain('&larr; Beta</a><span></span></div>');
    });

    test('one <script> whose ids JSON has no <', () => {
        expect((r.html.match(/<script>/g) || []).length).toBe(1);
        const script = /<script>([\s\S]*?)<\/script>/.exec(r.html)[1];
        expect(script).toContain('var ids = ["a","b","c"];');
        const ids = /var ids = (\[[^\]]*\]);/.exec(script)[1];
        expect(ids).not.toContain('<');
    });

    test("the caller's resolve wins over the set; null falls through to the set", () => {
        const calls = [];
        const r2 = doc.build({ documents: THREE, links: { resolve: (t, from) => {
            calls.push(from.path + '→' + t.path);
            return t.fragment === 'sec' ? 'https://ext.example/b' : null;
        } } });
        expect(calls).toEqual(['a.md→b.md']);
        expect(r2.html).toContain('<a href="https://ext.example/b">b</a>');
        const r3 = doc.build({ documents: THREE, links: { resolve: () => null } });
        expect(r3.html).toContain('<a href="#b--sec">b</a>');
    });

    test('warnings flatten documents[].warnings in document order', () => {
        const w = doc.build({ documents: [
            { path: 'x.md', source: 'no title [d](dead.md)\n' },
            { path: 'y.md', source: '[e](gone.md)\n' }
        ] });
        expect(w.warnings.map((x) => x.document + ':' + x.code)).toEqual(
            ['x.md:title/fallback', 'x.md:link/unresolved', 'y.md:title/fallback', 'y.md:link/unresolved']);
        expect(w.warnings).toEqual([...w.documents[0].warnings, ...w.documents[1].warnings]);
    });
});

describe('build — router script (fake DOM)', () => {
    function runRouter(html, hash) {
        const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
        const articles = [...html.matchAll(/<article class="md-doc" id="([^"]+)"/g)].map((m) => ({ id: m[1], hidden: false }));
        const items = [...html.matchAll(/data-doc="([^"]+)"/g)].map((m) => {
            const cls = new Set();
            return { doc: m[1], cls, getAttribute: () => m[1], classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } };
        });
        const state = { scrolledTop: 0, scrolledTo: null, listeners: {}, bodyCls: new Set() };
        const toggleBtn = { addEventListener: (_e, fn) => { state.toggle = fn; } };
        const fakeDocument = {
            querySelectorAll: (sel) => (sel === 'article.md-doc' ? articles : items),
            getElementById: (id) => (id === 'md-nav-toggle' ? toggleBtn
                : (html.includes('id="' + id + '"') ? { scrollIntoView: () => { state.scrolledTo = id; } } : null)),
            body: { classList: { toggle: (c) => (state.bodyCls.has(c) ? state.bodyCls.delete(c) : state.bodyCls.add(c)) } }
        };
        const fakeWindow = {
            location: { hash },
            addEventListener: (e, fn) => { state.listeners[e] = fn; },
            scrollTo: () => { state.scrolledTop++; }
        };
        new Function('window', 'document', script)(fakeWindow, fakeDocument);
        return { articles, items, state, fakeWindow };
    }

    const html = doc.build({ documents: THREE }).html;

    test('no hash → first document, scroll to top', () => {
        const { articles, items, state } = runRouter(html, '');
        expect(articles.map((a) => a.hidden)).toEqual([false, true, true]);
        expect(items.map((i) => i.cls.has('active'))).toEqual([true, false, false]);
        expect(state.scrolledTop).toBe(1);
    });

    test('#b--sec → document b shown, fragment scrolled into view', () => {
        const { articles, state } = runRouter(html, '#b--sec');
        expect(articles.map((a) => a.hidden)).toEqual([true, false, true]);
        expect(state.scrolledTo).toBe('b--sec');
    });

    test('#c → document c; unknown hash → first; hashchange re-routes; toggle flips md-nav-open', () => {
        const r1 = runRouter(html, '#c');
        expect(r1.articles.map((a) => a.hidden)).toEqual([true, true, false]);
        const r2 = runRouter(html, '#nope');
        expect(r2.articles.map((a) => a.hidden)).toEqual([false, true, true]);
        r2.fakeWindow.location.hash = '#b';
        r2.state.listeners.hashchange();
        expect(r2.articles.map((a) => a.hidden)).toEqual([true, false, true]);
        r2.state.toggle();
        expect(r2.state.bodyCls.has('md-nav-open')).toBe(true);
    });
});

describe('build — doc ids, TOC, theme', () => {
    test('doc-id dedupe: docs/a.md, docs-a.md → docs-a, docs-a-1', () => {
        const r = doc.build({ documents: [{ path: 'docs/a.md', source: '# A\n' }, { path: 'docs-a.md', source: '# B\n' }] });
        expect(r.documents.map((d) => d.id)).toEqual(['docs-a', 'docs-a-1']);
        expect(r.html).toContain('<h1 id="docs-a-1--b">');
    });

    test('single mode: a heading that slugs to the article id is renamed; TOC and headings agree', () => {
        const r = build1('## A\n');
        expect(r.html).toContain('<article class="md-doc" id="a">');
        expect(r.html).toContain('<h2 id="a-1">A</h2>');
        expect((r.html.match(/ id="a"/g) || []).length).toBe(1);
        expect(r.documents[0].headings[0].id).toBe('a-1');
        const t = build1('## A\n\n## B\n').html;
        expect(t).toContain('<a href="#a-1" data-level="2">A</a>');
        expect(t).toContain('<a href="#b" data-level="2">B</a>');
        // `a-1` is taken by the second heading → the first becomes a-2 (deterministic).
        const u = build1('## A\n\n## A 1\n');
        expect(u.documents[0].headings.map((h) => h.id)).toEqual(['a-2', 'a-1']);
        expect(u.html).toContain('<h2 id="a-2">A</h2>');
    });

    test('multi mode: ids stay unique under the <docId>--<slug> scheme', () => {
        const r = doc.build({ documents: [
            { path: 'a--b.md', source: '## c\n' },
            { path: 'a.md', source: '## b--c\n' },
            { path: 'z.md', source: '# md nav toggle\n\n[l](a.md#b--c)\n' }
        ] });
        expect(r.documents.map((d) => d.headings.map((h) => h.id))).toEqual([['a--b--c'], ['a--b--c-1'], ['z--md-nav-toggle']]);
        expect(r.html).toContain('<h2 id="a--b--c">c</h2>');
        expect(r.html).toContain('<h2 id="a--b--c-1">b--c</h2>');
        // The cross link resolves to the first owner of the id (documented).
        expect(r.html).toContain('<a href="#a--b--c">l</a>');
        const ids = [...r.html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size).toBe(ids.length);
        expect((r.html.match(/id="md-nav-toggle"/g) || []).length).toBe(1);
    });

    test('multi mode: a heading id equal to a later article id is renamed in the earlier fragment', () => {
        const r = doc.build({ documents: [
            { path: 'p.md', source: '## q\n' },
            { path: 'p--q.md', source: 'text\n' }
        ] });
        // article ids: p, p--q ; heading id p--q is reserved by the second article.
        expect(r.documents[0].headings[0].id).toBe('p--q-1');
        const ids = [...r.html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('default TOC renders only with ≥ 2 headings in 2..3', () => {
        const one = build1('# T\n\n## Only\n\n#### Deep\n').html;
        expect(one).not.toContain('<nav class="md-toc">');
        const two = build1('# T\n\n## A\n\n### B\n\n#### C\n').html;
        expect(two).toContain('<nav class="md-toc"><span class="md-toc-label">On this page</span> <a href="#a-1" data-level="2">A</a> · <a href="#b" data-level="3">B</a></nav>');   // `a` is the article id → the heading is a-1
    });

    test('toc: false → no nav.md-toc; {1..6, minHeadings 1} → every heading', () => {
        expect(bodyOf(build1('## A\n\n## B\n', { toc: false }).html)).not.toContain('md-toc');
        expect(bodyOf(build1('## A\n\n## B\n').html)).toContain('<nav class="md-toc">');
        const all = build1('# A\n\n###### F\n', { toc: { minLevel: 1, maxLevel: 6, minHeadings: 1 } }).html;
        expect(all).toContain('<a href="#a-1" data-level="1">A</a> · <a href="#f" data-level="6">F</a>');
    });

    test("theme: md-theme-dark + css('dark') embedded; 'auto' default; 'sepia' throws", () => {
        const dark = build1('# A\n', { theme: 'dark' }).html;
        expect(dark).toContain('md-theme-dark');
        expect(dark).toContain(themeApi.css('dark'));
        const auto = build1('# A\n').html;
        expect(auto).toContain('md-theme-auto');
        expect(auto).toContain(themeApi.css('auto'));
        expect(attempt(() => build1('# A\n', { theme: 'sepia' })).error.code).toBe('md/document-bad-option');
    });
});

describe('build — escaping, lang, css, notice', () => {
    test('classification / title / path are escaped, never tags', () => {
        const r = doc.build({
            documents: [{ path: '<b>p.md', source: '# T\n', title: '<i>t</i>' }, { path: 'q.md', source: '# Q\n' }],
            title: '"><script>x</script>',
            classification: { label: '"><script>', version: '<v>', date: '<d>' }
        });
        expect(r.html).not.toContain('<script>x');
        expect(r.html).not.toContain('"><script>');
        expect(r.html).toContain('<span class="md-classification">&quot;&gt;&lt;script&gt;</span>');
        expect(r.html).toContain('<title>&quot;&gt;&lt;script&gt;x&lt;/script&gt;</title>');
        expect(r.html).toContain('<span class="md-nav-path">&lt;b&gt;p.md</span>');
        expect(r.html).toContain('<span class="md-nav-title">&lt;i&gt;t&lt;/i&gt;</span>');
        expect(r.html).toContain('<span class="md-doc-version">&lt;v&gt;</span>');
        expect(r.html).toContain('<footer class="md-footer">&quot;&gt;&lt;script&gt; · &lt;v&gt; · &lt;d&gt;</footer>');
        expect((r.html.match(/<script>/g) || []).length).toBe(1);   // the router only
    });

    test("lang 'fr-FR' accepted, 'x y' rejected", () => {
        expect(build1('# A\n', { lang: 'fr-FR' }).html).toContain('<html lang="fr-FR">');
        const e = attempt(() => build1('# A\n', { lang: 'x y' })).error;
        expect(e.code).toBe('md/document-bad-option');
        expect(e.context).toEqual({ option: 'lang', got: 'x y' });
    });

    test('css </style breakout neutralised; only one </style> before </head>', () => {
        const html = build1('# A\n', { css: 'p{color:red}</style><script>1</script>' }).html;
        const head = html.slice(0, html.indexOf('</head>'));
        expect((head.match(/<\/style>/gi) || []).length).toBe(1);
        expect(head).toContain('p{color:red}<\\/style><script>1</script>');
        expect(html).not.toMatch(/<\/style>\s*<script>1/);
    });

    test('notice: five fixed lines in head comment, <style> head and (multi) <script> head', () => {
        const multi = doc.build({ documents: THREE, notice: { extra: '*/ bad --> x' } }).html;
        const block = NOTICE_FIXED.join('\n');
        expect(multi).toContain('<!--\n' + block + '\n');
        expect(multi).toContain('<style>/*!\n' + block + '\n');
        expect(multi).toContain('<script>/*!\n' + block + '\n');
        expect(multi).toContain('\n* / bad --\\u003e x\n');
        expect(multi).not.toContain('*/ bad');
        expect(multi).not.toContain('Source:');
        // Head comment closes exactly once.
        const head = multi.slice(0, multi.indexOf('<style>'));
        expect((head.match(/-->/g) || []).length).toBe(1);
    });

    test('notice.source line present iff given', () => {
        const withSrc = build1('# A\n', { notice: { source: 'https://src.example/x' } }).html;
        expect(withSrc).toContain('\nSource: https://src.example/x\n');
        expect((withSrc.match(/Source: https:\/\/src\.example\/x/g) || []).length).toBe(2);   // comment + style (single: no script)
        expect(build1('# A\n').html).not.toContain('Source:');
    });

    test('determinism: byte-identical twice; document order changes nav order', () => {
        expect(doc.build({ documents: THREE }).html).toBe(doc.build({ documents: THREE }).html);
        const reordered = doc.build({ documents: [THREE[2], THREE[0], THREE[1]] }).html;
        const nav = (h) => [...h.matchAll(/data-doc="([^"]+)"/g)].map((m) => m[1]);
        expect(nav(doc.build({ documents: THREE }).html)).toEqual(['a', 'b', 'c']);
        expect(nav(reordered)).toEqual(['c', 'a', 'b']);
    });
});

// ─── errors ──────────────────────────────────────────────────────────────────

describe('errors', () => {
    const D = [{ path: 'a.md', source: '# A\n' }];
    const BAD_INPUT = [
        ['documents missing', () => doc.build({}), { index: null, field: 'documents' }],
        ['options undefined', () => doc.build(), { index: null, field: 'documents' }],
        ['documents not an array', () => doc.build({ documents: 'a.md' }), { index: null, field: 'documents' }],
        ['documents empty', () => doc.build({ documents: [] }), { index: null, field: 'documents' }],
        ['entry not an object', () => doc.build({ documents: [D[0], 'x'] }), { index: 1, field: null }],
        ['path not a string', () => doc.build({ documents: [{ path: 1, source: '' }] }), { index: 0, field: 'path' }],
        ['path empty', () => doc.build({ documents: [{ path: '', source: '' }] }), { index: 0, field: 'path' }],
        ['source not a string', () => doc.build({ documents: [{ path: 'a.md', source: null }] }), { index: 0, field: 'source' }],
        ['title not a string', () => doc.build({ documents: [{ path: 'a.md', source: '', title: 3 }] }), { index: 0, field: 'title' }],
        ['renderFragment: bad document', () => doc.renderFragment({ path: 'a.md' }), { index: null, field: 'source' }],
        ['renderFragment: not an object', () => doc.renderFragment(null), { index: null, field: null }]
    ];
    for (const [name, fn, ctx] of BAD_INPUT) {
        test('md/document-bad-input — ' + name, () => {
            const r = attempt(fn);
            expect(r.value).toBeUndefined();
            expect(r.error.code).toBe('md/document-bad-input');
            expect(r.error.isContract).toBe(true);
            expect(r.error.context).toEqual(ctx);
        });
    }

    const BAD_OPTION = [
        ['theme', { theme: 'sepia' }, 'theme'],
        ['lang not a string', { lang: 5 }, 'lang'],
        ['lang regex', { lang: 'english-language-tag-too-long-x' }, 'lang'],
        ['links not an object', { links: 'x' }, 'links'],
        ['links.external', { links: { external: 'popup' } }, 'links.external'],
        ['links.unresolved', { links: { unresolved: 'drop' } }, 'links.unresolved'],
        ['links.resolve', { links: { resolve: 'fn' } }, 'links.resolve'],
        ['toc true', { toc: true }, 'toc'],
        ['toc level 0', { toc: { minLevel: 0 } }, 'toc'],
        ['toc level 7', { toc: { maxLevel: 7 } }, 'toc'],
        ['toc non-integer', { toc: { minLevel: 2.5 } }, 'toc'],
        ['toc min > max', { toc: { minLevel: 4, maxLevel: 2 } }, 'toc'],
        ['toc minHeadings', { toc: { minHeadings: -1 } }, 'toc'],
        ['extras not an array', { extras: {} }, 'extras'],
        ['extras entry without install', { extras: [{ name: 'x' }] }, 'extras'],
        ['title', { title: 1 }, 'title'],
        ['css', { css: 1 }, 'css'],
        ['notice not an object', { notice: 'x' }, 'notice'],
        ['notice.source', { notice: { source: 1 } }, 'notice.source'],
        ['notice.extra', { notice: { extra: {} } }, 'notice.extra'],
        ['classification not an object', { classification: 1 }, 'classification'],
        ['classification.label', { classification: { label: 1 } }, 'classification.label'],
        ['classification.version', { classification: { version: 1 } }, 'classification.version'],
        ['classification.date', { classification: { date: 1 } }, 'classification.date']
    ];
    for (const [name, opts, option] of BAD_OPTION) {
        test('md/document-bad-option — ' + name, () => {
            const r = attempt(() => doc.build({ documents: D, ...opts }));
            expect(r.value).toBeUndefined();
            expect(r.error.code).toBe('md/document-bad-option');
            expect(r.error.isContract).toBe(true);
            expect(r.error.context.option).toBe(option);
            expect('got' in r.error.context).toBe(true);
        });
    }

    test('validation throws before any work (the resolve hook is never called)', () => {
        let calls = 0;
        const r = attempt(() => doc.build({ documents: [{ path: 'a.md', source: '[x](b.md)\n' }],
            links: { resolve: () => { calls++; return null; } }, theme: 'sepia' }));
        expect(r.error.code).toBe('md/document-bad-option');
        expect(calls).toBe(0);
    });
});

// ─── realm ───────────────────────────────────────────────────────────────────

describe('realm', () => {
    test('no node:/process./Bun. token; every @awacloud/ specifier ends in .js', () => {
        const src = readFileSync(new URL('./html-document.js', import.meta.url), 'utf8');
        expect(src).not.toMatch(/node:/);
        expect(src).not.toMatch(/\bprocess\./);
        expect(src).not.toMatch(/\bBun\./);
        const specs = [...src.matchAll(/from\s+['"](@awacloud\/[^'"]+)['"]/g)].map((m) => m[1]);
        expect(specs.length).toBeGreaterThan(0);
        for (const s of specs) expect(s).toMatch(/\.js$/);
    });
});
