// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// SSR-only path : exercises render.toHTML with the SSR tokenizer fallback
// (no DOMParser available). Together they prove the framework can produce
// server-rendered HTML in pure Node/Bun without any DOM polyfill.

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

let savedDOMParser;
beforeAll(() => {
    savedDOMParser = globalThis.DOMParser;
    delete globalThis.DOMParser;
});
afterAll(() => {
    if (savedDOMParser) globalThis.DOMParser = savedDOMParser;
});

import { render } from './render.js';
import { parser } from './parser.js';
import { secPolicy } from './secPolicy.js';

function setup() {
    const sp = secPolicy.factory();
    return { r: render.factory(sp), p: parser.factory(sp) };
}

describe('render.toHTML (SSR)', () => {

    test('serialises a simple template with #{var} bound', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<h1>#{title}</h1>');
        const html = r.toHTML(tpl, { title: 'Hello' });
        expect(html).toContain('<h1');
        expect(html).toContain('Hello');
        expect(html).not.toContain('#{');
    });

    test('hydration marker data-fw-id present by default', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<h1>x</h1>');
        const html = r.toHTML(tpl, {});
        expect(html).toMatch(/data-fw-id="[^"]+"/);
    });

    // ── #{var} static-run positioning (tokenizer fallback path) ──────────────
    // Regression: a marker with BOTH a leading and trailing static run in one
    // value ("prefix#{v}suffix") dropped the trailing run. Exercises the
    // no-DOMParser tokenizer used for SSR in pure Node/Bun.
    describe('#{var} interleaved static runs', () => {
        test('prefix-only still renders (unchanged behaviour)', () => {
            const { r, p } = setup();
            const tpl = p.fromHTML('<div style="color:#{c}"></div>');
            expect(r.toHTML(tpl, { c: 'red' })).toContain('style="color:red"');
        });

        test('suffix-only still renders (unchanged behaviour)', () => {
            const { r, p } = setup();
            const tpl = p.fromHTML('<div style="#{c}"></div>');
            expect(r.toHTML(tpl, { c: 'red' })).toContain('style="red"');
        });

        test('both-sides keeps the trailing run in a style attribute', () => {
            const { r, p } = setup();
            const tpl = p.fromHTML(
                '<div style="display:block;inline-size:#{fillPct};block-size:10px"></div>');
            const html = r.toHTML(tpl, { fillPct: '60%' });
            expect(html).toContain(
                'style="display:block;inline-size:60%;block-size:10px"');
        });

        test('missing value keeps both static runs (statics unconditional)', () => {
            const { r, p } = setup();
            const tpl = p.fromHTML(
                '<div style="display:block;inline-size:#{fillPct};block-size:10px"></div>');
            const html = r.toHTML(tpl, {});
            expect(html).toContain(
                'style="display:block;inline-size:;block-size:10px"');
        });

        test('multiple vars with interleaved static runs render in order', () => {
            const { r, p } = setup();
            const tpl = p.fromHTML('<p>a#{v1}b#{v2}c</p>');
            expect(r.toHTML(tpl, { v1: '1', v2: '2' })).toContain('>a1b2c<');
        });

        test('both-sides in text content preserves the tail', () => {
            const { r, p } = setup();
            const tpl = p.fromHTML('<p>Loading #{pct}% done</p>');
            expect(r.toHTML(tpl, { pct: '42' })).toContain('>Loading 42% done<');
        });
    });

    test('opts.hydrate=false strips the marker', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<h1>x</h1>');
        const html = r.toHTML(tpl, {}, { hydrate: false });
        expect(html).not.toContain('data-fw-id');
    });

    test('opts.idPrefix namespaces the marker', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<h1 id="t">x</h1>');
        const html = r.toHTML(tpl, {}, { idPrefix: 'main' });
        expect(html).toContain('data-fw-id="main:t"');
    });

    test('escapes text content', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<p>#{msg}</p>');
        const html = r.toHTML(tpl, { msg: '<script>x</script>' });
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>');
    });

    test('escapes attribute values', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<a href="#{url}">x</a>');
        const html = r.toHTML(tpl, { url: 'http://x.com?a="1"' });
        // The value contains a quote that must be escaped to &quot;
        expect(html).toContain('&quot;1&quot;');
    });

    test('blocks javascript: in href (URL safety)', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<a href="#{u}">x</a>');
        const html = r.toHTML(tpl, { u: 'javascript:alert(1)' });
        expect(html).not.toContain('javascript:');
        expect(html).not.toMatch(/href=/);
    });

    test('blocks DOM clobbering names', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<input name="#{n}">');
        const html = r.toHTML(tpl, { n: 'cookie' });
        expect(html).not.toMatch(/name="cookie"/);
    });

    test('boolean attributes render as bare tokens', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<details open="#{open}">x</details>');
        // '' → present as boolean attr, null → removed.
        expect(r.toHTML(tpl, { open: '' })).toMatch(/<details[^>]*\sopen[\s>]/);
        expect(r.toHTML(tpl, { open: null })).not.toMatch(/\sopen[\s=>]/);
    });

    test('void elements self-close with " />"', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<img src="/x.png" alt="#{a}">');
        const html = r.toHTML(tpl, { a: 'desc' });
        expect(html).toMatch(/<img[^>]*\/>/);
    });

    test('nested children serialise in order', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<div><h1>A</h1><p>B</p></div>');
        const html = r.toHTML(tpl, {});
        const a = html.indexOf('A');
        const b = html.indexOf('B');
        expect(a).toBeGreaterThan(-1);
        expect(b).toBeGreaterThan(a);
    });

    test('content slot resolved via opts.slots (string)', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<div>${body}</div>');
        const html = r.toHTML(tpl, {}, { slots: { body: '<span>inner</span>' } });
        expect(html).toContain('<span>inner</span>');
    });

    test('content slot resolved via opts.slots (function)', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<div>${body}</div>');
        const html = r.toHTML(tpl, {}, { slots: { body: () => '<em>lazy</em>' } });
        expect(html).toContain('<em>lazy</em>');
    });

    test('empty slot renders empty body', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<div>${body}</div>');
        const html = r.toHTML(tpl, {});
        expect(html).toMatch(/<div[^>]*><\/div>/);
    });

    test('iterate block expands per opts.iterates row', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML(
            '<ul><!-- $row --><li>#{t}</li><!-- row$ --></ul>'
        );
        const html = r.toHTML(tpl, {}, {
            iterates: { row: [{ t: 'A' }, { t: 'B' }, { t: 'C' }] },
        });
        expect(html).toContain('A');
        expect(html).toContain('B');
        expect(html).toContain('C');
        // Three <li>
        expect(html.match(/<li[\s>]/g)).toHaveLength(3);
    });

    test('default + prepend bindings work in attributes', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<div class="foo-#{cls}">x</div>');
        const html = r.toHTML(tpl, { cls: 'active' });
        expect(html).toContain('class="foo-active"');
    });

    test('on* event attributes filtered (no runtime exposure)', () => {
        const { r, p } = setup();
        // parser already strips on* ; verify SSR doesn't re-introduce them
        const tpl = p.fromHTML('<button>x</button>');
        // Inject a fake attr in the tree to verify SSR also filters.
        tpl.template[0].attrs = ['onclick', 'class'];
        tpl.template[0].data = { onclick: 'evil()', class: 'ok' };
        const html = r.toHTML(tpl, {});
        expect(html).not.toContain('onclick');
        expect(html).toContain('class="ok"');
    });

    test('accepts a raw elm-array', () => {
        const { r } = setup();
        const arr = [
            { id: 'a', tag: 'p', text: 'static' },
        ];
        const html = r.toHTML(arr, {});
        expect(html).toContain('<p');
        expect(html).toContain('static');
    });

    test('idPrefix preserves nested element ids', () => {
        const { r, p } = setup();
        const tpl = p.fromHTML('<div id="x"><span id="y">x</span></div>');
        const html = r.toHTML(tpl, {}, { idPrefix: 'k' });
        expect(html).toContain('data-fw-id="k:x"');
        expect(html).toContain('data-fw-id="k:y"');
    });
});
