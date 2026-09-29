// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    parseArgs,
    run,
    compileOne,
    compileJsx,
    jsxToHTML,
    deepDiff,
    findNonSerializable,
} from './index.js';
import { parser } from '../../../src/dom/rendering/parser.js';
import { secPolicy } from '../../../src/dom/rendering/secPolicy.js';
import { template } from '../../../src/dom/rendering/template.js';
import { render } from '../../../src/dom/rendering/render.js';
import { uiSession }       from '../../../src/dom/rendering/uiSession.js';
import { uiSessionCore }   from '../../../src/dom/rendering/uiSession-core.js';
import { uiSessionDirect } from '../../../src/dom/rendering/uiSession-direct.js';
import { uiSessionList }   from '../../../src/dom/rendering/uiSession-list.js';
import { dom }    from '../../../src/dom/query/dom.js';
import { events } from '../../../src/dom/query/events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '_tmp-test');
const FIXTURE_CARD = join(__dirname, '_fixtures', 'card.jsx');
const FIXTURE_NAV  = join(__dirname, '_fixtures', 'nav.jsx');

/** Create a fresh parser + template + render context (shared counter reset). */
function makeCtx() {
    const sp  = secPolicy.factory();
    const p   = parser.factory(sp);
    const tpl = template.factory(sp);
    const ren = render.factory(sp);
    return { p, tpl, ren, sp };
}

beforeAll(async () => {
    if (existsSync(TMP)) await rm(TMP, { recursive: true, force: true });
    await mkdir(TMP, { recursive: true });
});

afterAll(async () => {
    if (existsSync(TMP)) await rm(TMP, { recursive: true, force: true });
});

// ── parseArgs ──────────────────────────────────────────────────────────────

describe('parseArgs', () => {
    test('defaults', () => {
        const o = parseArgs(['foo.jsx']);
        expect(o.input).toBe('foo.jsx');
        expect(o.out).toBeNull();
        expect(o.ext).toBe('.parseresult.json');
        expect(o.glob).toBe('**/*.jsx');
        expect(o.minify).toBe(false);
        expect(o.verify).toBe(false);
        expect(o.esm).toBe(false);
    });

    test('all flags', () => {
        const o = parseArgs(['x.jsx', '--out', 'dist', '--ext', '.pr.json',
            '--glob', '**/*.jsx', '--minify', '--verify', '--esm']);
        expect(o.out).toBe('dist');
        expect(o.ext).toBe('.pr.json');
        expect(o.glob).toBe('**/*.jsx');
        expect(o.minify).toBe(true);
        expect(o.verify).toBe(true);
        expect(o.esm).toBe(true);
    });

    test('rejects unknown flag', () => {
        expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
    });

    test('--help sets _help flag and returns early', () => {
        const o = parseArgs(['--help']);
        expect(o._help).toBe(true);
    });
});

// ── deepDiff ───────────────────────────────────────────────────────────────

describe('deepDiff', () => {
    test('equal values return empty string', () => {
        expect(deepDiff({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe('');
    });

    test('reports diverging object key path', () => {
        expect(deepDiff({ a: 1 }, { a: 2 })).toContain('a');
    });

    test('reports diverging array index path', () => {
        expect(deepDiff([1, 2, 3], [1, 2, 4])).toContain('[2]');
    });

    test('detects missing key', () => {
        expect(deepDiff({ a: 1 }, {})).not.toBe('');
    });
});

// ── findNonSerializable ────────────────────────────────────────────────────

describe('findNonSerializable', () => {
    test('accepts plain JSON-safe shapes', () => {
        expect(findNonSerializable({ a: 1, b: 'x', c: [true, null, { d: 2 }] })).toBe('');
    });

    test('rejects functions', () => {
        expect(findNonSerializable({ fn: () => {} })).toContain('function');
    });

    test('rejects class instances', () => {
        expect(findNonSerializable({ d: new Date() })).toContain('non-plain object');
    });
});

// ── jsxToHTML ──────────────────────────────────────────────────────────────

describe('jsxToHTML', () => {
    test('static text passes through unchanged', () => {
        expect(jsxToHTML('<div id="r">hello</div>')).toBe('<div id="r">hello</div>');
    });

    test('{ident} in text content → #{ident}', () => {
        expect(jsxToHTML('<div id="r">{name}</div>')).toBe('<div id="r">#{name}</div>');
    });

    test('unquoted attr={ident} → attr="#{ident}"', () => {
        expect(jsxToHTML('<div id="r" class={cls}></div>')).toBe('<div id="r" class="#{cls}"></div>');
    });

    test('quoted attr with {ident} → #{ident} inside value', () => {
        expect(jsxToHTML('<div id="r" class="a {cls} b"></div>')).toBe('<div id="r" class="a #{cls} b"></div>');
    });

    test('<Slot name="x"/> → ${x}', () => {
        expect(jsxToHTML('<div id="r"><Slot name="content"/></div>')).toBe('<div id="r">${content}</div>');
    });

    test('<Each name="x">…</Each> → <!-- $x -->…<!-- x$ -->', () => {
        const result = jsxToHTML('<ul id="r"><Each name="items"><li>{label}</li></Each></ul>');
        expect(result).toBe('<ul id="r"><!-- $items --><li>#{label}</li><!-- items$ --></ul>');
    });

    test('JSX block comments stripped', () => {
        const result = jsxToHTML('<div id="r">{/* comment */}{name}</div>');
        expect(result).toBe('<div id="r">#{name}</div>');
    });

    test('throws on non-identifier binding in text', () => {
        expect(() => jsxToHTML('<div id="r">{a + b}</div>')).toThrow(/not a plain binding name/);
    });

    test('throws on non-identifier binding in quoted attr', () => {
        expect(() => jsxToHTML('<div id="r" class="{a.b}"></div>')).toThrow(/not a plain binding name/);
    });

    test('throws on non-identifier binding in unquoted attr', () => {
        expect(() => jsxToHTML('<div id="r" class={a.b}></div>')).toThrow(/not a plain binding name/);
    });

    test('throws on </Each> without matching <Each>', () => {
        expect(() => jsxToHTML('</Each>')).toThrow(/<\/Each>/);
    });

    test('${slot} in text (from Slot lowering) not double-transformed', () => {
        // After <Slot> lowering the text is ${content} — must not become $#{content}
        const result = jsxToHTML('<div id="r"><Slot name="content"/></div>');
        expect(result).toContain('${content}');
        expect(result).not.toContain('$#{');
    });
});

// ── compileJsx: mapping rules — deep-equal to parser.fromHTML() ────────────

describe('compileJsx — mapping rules', () => {
    /**
     * Each case: [label, jsxSource, equivalentHTMLTemplate]
     * A fresh parser is used per case so auto-IDs are deterministic.
     */
    const RULES = [
        [
            'static text',
            '<div id="r">text</div>',
            '<div id="r">text</div>',
        ],
        [
            'text binding',
            '<div id="r">{name}</div>',
            '<div id="r">#{name}</div>',
        ],
        [
            'attr binding (unquoted)',
            '<div id="r" class={cls}></div>',
            '<div id="r" class="#{cls}"></div>',
        ],
        [
            'mixed attr (static + binding)',
            '<div id="r" class="a {cls} b"></div>',
            '<div id="r" class="a #{cls} b"></div>',
        ],
        [
            'named slot',
            '<div id="r"><Slot name="content"/></div>',
            '<div id="r">${content}</div>',
        ],
        [
            'iteration block',
            '<ul id="r"><Each name="items"><li>{label}</li></Each></ul>',
            '<ul id="r"><!-- $items --><li>#{label}</li><!-- items$ --></ul>',
        ],
    ];

    for (const [label, jsx, html] of RULES) {
        test(`${label}: deep-equals parser.fromHTML() on equivalent template`, () => {
            const { p } = makeCtx();
            // Reuse the same parser instance so auto-IDs are in sync.
            const fromJsx  = compileJsx(jsx, { parser: p });
            const fromHTML = p.fromHTML(html);
            const diff = deepDiff(fromJsx, fromHTML);
            expect(diff).toBe('');
        });
    }
});

// ── compileJsx: secPolicy parity ──────────────────────────────────────────

describe('compileJsx — secPolicy parity', () => {
    test('<script> tag is silently dropped (same as parser.fromHTML)', () => {
        const { p } = makeCtx();
        const fromJsx  = compileJsx('<div id="r"><script>alert(1)</script></div>', { parser: p });
        const fromHTML = p.fromHTML('<div id="r"><script>alert(1)</script></div>');
        expect(deepDiff(fromJsx, fromHTML)).toBe('');
        // script content absent from template
        const ids = fromJsx.template.map(n => n.tag);
        expect(ids).not.toContain('script');
    });

    test('on* event attribute is silently dropped (same as parser.fromHTML)', () => {
        const { p } = makeCtx();
        // on* attributes use unquoted JSX binding syntax
        const fromJsx  = compileJsx('<div id="r" onclick={handler}></div>', { parser: p });
        const fromHTML = p.fromHTML('<div id="r" onclick="#{handler}"></div>');
        expect(deepDiff(fromJsx, fromHTML)).toBe('');
        // onclick must not appear in attrs
        const elm = fromJsx.template[0];
        expect(elm.attrs ?? []).not.toContain('onclick');
    });

    test('javascript: URL stored as-is at parse time (secPolicy enforces at render)', () => {
        const { p } = makeCtx();
        const fromJsx  = compileJsx('<a id="r" href="javascript:alert(1)">x</a>', { parser: p });
        const fromHTML = p.fromHTML('<a id="r" href="javascript:alert(1)">x</a>');
        expect(deepDiff(fromJsx, fromHTML)).toBe('');
    });

    test('<object> tag is silently dropped', () => {
        const { p } = makeCtx();
        const fromJsx = compileJsx('<div id="r"><object data="x.swf"></object></div>', { parser: p });
        expect(fromJsx.template.every(n => n.tag !== 'object')).toBe(true);
    });
});

// ── compileOne (single file) ───────────────────────────────────────────────

describe('compileOne', () => {
    test('produces JSON artifact from card.jsx fixture', async () => {
        const r = await compileOne(FIXTURE_CARD, {
            out: TMP, ext: '.parseresult.json', minify: false,
            verify: false, esm: false,
        });
        expect(existsSync(r.output)).toBe(true);
        const parsed = JSON.parse(await readFile(r.output, 'utf8'));
        expect(Array.isArray(parsed.template)).toBe(true);
        expect(parsed.template.length).toBeGreaterThan(0);
        expect(r.nodes).toBeGreaterThan(0);
    });

    test('card.jsx fixture matches expected parseresult.json', async () => {
        const r = await compileOne(FIXTURE_CARD, {
            out: TMP, ext: '.card-check.json', minify: false,
            verify: false, esm: false,
        });
        const actual   = JSON.parse(await readFile(r.output, 'utf8'));
        const expected = JSON.parse(await readFile(
            join(__dirname, '_fixtures', 'card.jsx.parseresult.json'), 'utf8'
        ));
        expect(deepDiff(actual, expected)).toBe('');
    });

    test('nav.jsx fixture matches expected parseresult.json', async () => {
        // compileOne is self-contained: a fresh parser per call means the
        // synthetic-ID counter starts at 0, matching the fixture IDs (p0, p1).
        const r = await compileOne(FIXTURE_NAV, {
            out: TMP, ext: '.nav-check.json', minify: false,
            verify: false, esm: false,
        });
        const actual   = JSON.parse(await readFile(r.output, 'utf8'));
        const expected = JSON.parse(await readFile(
            join(__dirname, '_fixtures', 'nav.jsx.parseresult.json'), 'utf8'
        ));
        expect(deepDiff(actual, expected)).toBe('');
    });

    test('--verify round-trips through template.fromParseResult', async () => {
        const r = await compileOne(FIXTURE_CARD, {
            out: TMP, ext: '.verify.json', minify: true,
            verify: true, esm: false,
        });
        expect(existsSync(r.output)).toBe(true);
    });

    test('--esm emits sibling .js file with export default', async () => {
        const r = await compileOne(FIXTURE_CARD, {
            out: TMP, ext: '.esm.json', minify: true,
            verify: false, esm: true,
        });
        const esmPath = r.output.replace(/\.json$/, '.js');
        expect(existsSync(esmPath)).toBe(true);
        const src = await readFile(esmPath, 'utf8');
        expect(src).toContain('export default');
        expect(src).toContain('do not edit');
    });

    test('empty JSX produces empty template', async () => {
        const empty = join(TMP, 'empty.jsx');
        await writeFile(empty, '', 'utf8');
        const r = await compileOne(empty, {
            out: TMP, ext: '.empty.json', minify: false,
            verify: true, esm: false,
        });
        const parsed = JSON.parse(await readFile(r.output, 'utf8'));
        expect(parsed.template).toEqual([]);
    });
});

// ── run (directory walk) ───────────────────────────────────────────────────

describe('run — directory walk', () => {
    test('walks directory and emits one output per .jsx file', async () => {
        const subdir = join(TMP, 'walk');
        await mkdir(subdir, { recursive: true });
        await writeFile(join(subdir, 'a.jsx'), '<div id="a"><Slot name="slot"/></div>', 'utf8');
        await writeFile(join(subdir, 'b.jsx'), '<span id="b">{x}</span>', 'utf8');
        await writeFile(join(subdir, 'ignore.txt'), 'not jsx', 'utf8');

        const out = join(TMP, 'walk-out');
        const results = await run({
            input: subdir, out, ext: '.parseresult.json',
            glob: '**/*.jsx', minify: false, verify: false, esm: false,
        });
        expect(results.length).toBe(2);
        const files = await readdir(out);
        expect(files.filter(f => f.endsWith('.parseresult.json')).length).toBe(2);
    });
});

// ── run (error cases) ─────────────────────────────────────────────────────

describe('run — error cases', () => {
    test('missing input rejects', async () => {
        await expect(run({
            input: null, out: null, ext: '.parseresult.json',
            glob: '**/*.jsx', minify: false, verify: false, esm: false,
        })).rejects.toThrow(/missing/);
    });

    test('non-existent input rejects', async () => {
        await expect(run({
            input: join(TMP, 'does-not-exist.jsx'), out: null,
            ext: '.parseresult.json', glob: '**/*.jsx',
            minify: false, verify: false, esm: false,
        })).rejects.toThrow(/not found/);
    });
});

// ── Integration: compiled fixture renders to the same output as HTML twin ──

describe('integration — SSR round-trip', () => {
    test('card.jsx ParseResult renders same toHTML output as HTML twin', async () => {
        const { p, ren } = makeCtx();

        // JSX path
        const cardJsx = await readFile(FIXTURE_CARD, 'utf8');
        const fromJsx = compileJsx(cardJsx, { parser: p });

        // HTML twin path (same parser instance — IDs will match)
        const cardHTML = `<article id="card">
  <h2 id="card-title">#{title}</h2>
  <p id="card-body" class="#{bodyClass}">#{summary}</p>
  <a id="card-link" href="/items/#{id}" class="btn #{btnClass}">Read more</a>
  <div id="card-slot">\${footer}</div>
</article>`;
        const fromHTML = p.fromHTML(cardHTML);

        // Both ParseResults must be deep-equal.
        expect(deepDiff(fromJsx, fromHTML)).toBe('');

        // SSR render with sample data — output must be identical.
        const data = { title: 'Hello', bodyClass: 'intro', summary: 'World', id: '42', btnClass: 'primary' };
        const ssrJsx  = ren.toHTML(fromJsx,  data, { hydrate: false });
        const ssrHTML = ren.toHTML(fromHTML, data, { hydrate: false });
        expect(ssrJsx).toBe(ssrHTML);
    });

    test('nav.jsx ParseResult with iterate data renders same toHTML output as HTML twin', async () => {
        // Use two independent parser instances so auto-IDs start at 0 in both.
        const ctxJsx  = makeCtx();
        const ctxHTML = makeCtx();

        const navJsx = await readFile(FIXTURE_NAV, 'utf8');
        const fromJsx  = compileJsx(navJsx, { parser: ctxJsx.p });

        const navHTML = `<nav id="main-nav">
  <ul id="nav-list">
    <!-- $items -->
    <li><a href="#{href}">#{label}</a></li>
    <!-- items$ -->
  </ul>
  <span id="nav-title">\${pageTitle}</span>
</nav>`;
        const fromHTML = ctxHTML.p.fromHTML(navHTML);

        // Both ParseResults must be deep-equal (IDs match because both parsers
        // start at 0 and process the same elements).
        expect(deepDiff(fromJsx, fromHTML)).toBe('');

        const data = {};
        const opts = {
            hydrate: false,
            iterates: { items: [{ href: '/a', label: 'Home' }, { href: '/b', label: 'About' }] },
        };
        const ssrJsx  = ctxJsx.ren.toHTML(fromJsx,  data, opts);
        const ssrHTML = ctxHTML.ren.toHTML(fromHTML, data, opts);
        expect(ssrJsx).toBe(ssrHTML);
    });

    // ── SSR toHTML({ hydrate: true }) → uiSession.hydrate() round-trip ──────
    // Exercises the data-fw-id hydration path end-to-end on a compiled JSX
    // fixture: render its ParseResult to HTML with hydration markers enabled,
    // mount that HTML as the server would, then re-hydrate a client session
    // against the SAME compiled block and assert the existing DOM nodes are
    // reused (not rebuilt) and mutations target them in place.

    /** Build a uiSession bound to an already-mounted container. */
    function makeSession(containerName, containerEl) {
        const sp      = secPolicy.factory();
        const tplInst = template.factory(sp);
        const rnd     = render.factory(sp);
        const prs     = parser.factory(sp);
        const dm      = dom.factory(sp);
        const ev      = events.factory();
        tplInst.init(containerName, { to: containerEl, main: true });
        return uiSession.factory(
            uiSessionCore.factory(tplInst, rnd, prs, dm, ev),
            uiSessionDirect.factory(dm, ev),
            uiSessionList.factory(tplInst, rnd, dm),
        )(containerName);
    }

    test('compiled card.jsx: toHTML({hydrate:true}) then hydrate() reuses SSR nodes', async () => {
        // 1. Compile the JSX fixture to a ParseResult (self-contained).
        const cardJsx = await readFile(FIXTURE_CARD, 'utf8');
        const block   = compileJsx(cardJsx);

        const data = {
            title: 'Hello', bodyClass: 'intro', summary: 'World',
            id: '42', btnClass: 'primary',
        };

        // 2. SSR render WITH hydration markers (data-fw-id) + idPrefix.
        const ssrRender = render.factory(secPolicy.factory());
        const html = ssrRender.toHTML(block, data, { hydrate: true, idPrefix: 'app' });

        // The HTML twin: markers must be present on the compiled output.
        expect(html).toContain('data-fw-id="app:card"');
        expect(html).toContain('data-fw-id="app:card-title"');

        // 3. Mount as if delivered by the server.
        const container = document.createElement('div');
        document.body.appendChild(container);
        container.innerHTML = html;

        const ssrCard  = container.querySelector('[data-fw-id="app:card"]');
        const ssrTitle = container.querySelector('[data-fw-id="app:card-title"]');
        const ssrLink  = container.querySelector('[data-fw-id="app:card-link"]');
        expect(ssrCard).not.toBeNull();
        expect(ssrTitle).not.toBeNull();
        expect(ssrTitle.textContent).toBe('Hello');

        // 4. Client: create a session and hydrate against the SAME compiled
        //    JSX block (compileJsx output is consumable unchanged by hydrate).
        const ui = makeSession('app', container);
        ui.hydrate([{ id: 'card', block, data }], { idPrefix: 'app' });

        // 5. Hydration reused the existing DOM nodes (same references).
        expect(ui.get('card')).toBe(ssrCard);
        expect(ui.get('card', 'card-title')).toBe(ssrTitle);
        expect(ui.get('card', 'card-link')).toBe(ssrLink);

        // 6. A mutation targets the existing node in place — no rebuild.
        ui.text('card', 'card-title', 'Rewritten');
        expect(ssrTitle.textContent).toBe('Rewritten');
        expect(ui.get('card', 'card-title')).toBe(ssrTitle);

        container.remove();
    });
});
