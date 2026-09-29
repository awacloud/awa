// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// SSR / server-side path : exercises the internal tokenizer when DOMParser is
// not available. We delete the global before importing parser so the factory's
// `typeof DOMParser !== 'undefined'` check is false on first call. Other test
// files register happy-dom globally - we restore it on teardown.

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

let savedDOMParser;
beforeAll(() => {
    savedDOMParser = globalThis.DOMParser;
    delete globalThis.DOMParser;
});
afterAll(() => {
    if (savedDOMParser) globalThis.DOMParser = savedDOMParser;
});

import { parser } from './parser.js';
import { secPolicy } from './secPolicy.js';

const sp = () => secPolicy.factory();

describe('parser - SSR tokenizer (no DOMParser)', () => {

    test('DOMParser is unavailable in this test scope', () => {
        expect(typeof DOMParser).toBe('undefined');
    });

    test('fromHTML parses a simple element', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<div>hello</div>');
        expect(r.template).toHaveLength(1);
        expect(r.template[0].tag).toBe('div');
        expect(r.template[0].text).toBe('hello');
    });

    test('parses nested elements with parent links', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<div><h1>title</h1><p>body</p></div>');
        expect(r.template.length).toBe(3);
        expect(r.template[0].tag).toBe('div');
        expect(r.template[1].parent).toBe(r.template[0].id);
        expect(r.template[1].tag).toBe('h1');
        expect(r.template[2].tag).toBe('p');
    });

    test('extracts #{var} bindings on text', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<h1>#{title}</h1>');
        const h1 = r.template[0];
        expect(h1.map).toBeDefined();
        expect(h1.map[0]).toMatchObject({ name: 'title', prop: 'text' });
    });

    test('extracts #{var} bindings on attributes', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<a href="#{url}">link</a>');
        const a = r.template[0];
        expect(a.attrs).toEqual(['href']);
        expect(a.map[0]).toMatchObject({ name: 'url', prop: 'href', data: true });
    });

    test('preserves explicit HTML id', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<div id="root"><span id="lbl">x</span></div>');
        expect(r.template[0].id).toBe('root');
        expect(r.template[1].id).toBe('lbl');
    });

    test('auto-generates ids when missing', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<div><span>x</span></div>');
        expect(r.template[0].id).toMatch(/^p\d+$/);
        expect(r.template[1].id).toMatch(/^p\d+$/);
        expect(r.template[0].id).not.toBe(r.template[1].id);
    });

    test('content slot inlined on parent (no siblings)', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<div>${body}</div>');
        expect(r.template[0].content).toBe('body');
    });

    test('content slot as span when has siblings', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<div><h1>title</h1>${body}</div>');
        // Three nodes : div, h1, synthetic span for the slot.
        expect(r.template.length).toBe(3);
        const slot = r.template[2];
        expect(slot.tag).toBe('span');
        expect(slot.content).toBe('body');
    });

    test('iterate block becomes parseResult.iterates entry', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML(
            '<ul><!-- $item --><li>#{text}</li><!-- item$ --></ul>'
        );
        expect(r.iterates).toBeDefined();
        expect(r.iterates.item).toHaveLength(1);
        expect(r.iterates.item[0].tag).toBe('li');
        expect(r.iterates.item[0].map[0].name).toBe('text');
    });

    test('void elements close themselves (br, hr, img, input)', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<div><br><hr><img src="/x"><input></div>');
        expect(r.template.length).toBe(5);
        expect(r.template.slice(1).map(e => e.tag)).toEqual(['br', 'hr', 'img', 'input']);
    });

    test('self-closing syntax also works', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<div><img src="/x" /><br/></div>');
        expect(r.template.length).toBe(3);
        expect(r.template[1].tag).toBe('img');
        expect(r.template[2].tag).toBe('br');
    });

    test('attribute quoting variants (double, single, unquoted)', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<input type="text" name=\'x\' disabled value=foo>');
        const el = r.template[0];
        expect(el.data.type).toBe('text');
        expect(el.data.name).toBe('x');
        expect(el.data.value).toBe('foo');
        // Boolean attribute (no value) → empty string.
        expect(el.attrs).toContain('disabled');
    });

    test('HTML entities decoded in attribute values', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<a href="?a=1&amp;b=2">x</a>');
        expect(r.template[0].data.href).toBe('?a=1&b=2');
    });

    test('blocks dangerous tags (script/iframe/object/embed)', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML(
            '<div><script>evil()</script><iframe src="x"></iframe></div>'
        );
        // Only <div> survives ; blocked tags are dropped and not represented.
        // (With sibling text the div becomes a container with a synthetic
        //  text node, which is tested separately.)
        const tags = r.template.map(e => e.tag);
        expect(tags).not.toContain('script');
        expect(tags).not.toContain('iframe');
        expect(tags).toContain('div');
    });

    test('filters on* event handlers from attributes', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<button onclick="evil()" class="ok">x</button>');
        const b = r.template[0];
        expect(b.attrs).toEqual(['class']);
        expect(b.data.onclick).toBeUndefined();
    });

    test('roundtrip via toHTML restores #{...} placeholders', () => {
        const p = parser.factory(sp());
        const html = '<div><h1>#{title}</h1></div>';
        const r = p.fromHTML(html);
        const back = p.toHTML(r);
        // back is reformatted but contains the placeholders.
        expect(back).toContain('#{title}');
        expect(back).toContain('<h1');
    });

    test('SVG : children of <svg> get svg_ prefix tags', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<svg><use href="#i"/></svg>');
        expect(r.template[0].tag).toBe('svg');
        expect(r.template[1].tag).toBe('svg_use');
    });

    test('numeric entities decoded (decimal)', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<p>&#65;&#66;&#67;</p>');
        expect(r.template[0].text).toBe('ABC');
    });

    test('numeric entities decoded (hex)', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<p>&#x41;&#x42;&#x43;</p>');
        expect(r.template[0].text).toBe('ABC');
    });

    test('out-of-range numeric entities left as-is', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<p>&#999999999;</p>');
        expect(r.template[0].text).toContain('&#999999999;');
    });

    // ── auto-id collision on the SSR path ─────────────────────────────────────
    // The static site build runs through this tokenizer, so the per-document
    // uniqueness guarantee must hold here as well as under DOMParser.
    // See parser.test.js > 'auto-id collision (per-document uniqueness)'.

    test('auto ids skip explicit pN ids of the document being parsed', () => {
        const p = parser.factory(sp());
        // Advance the shared counter (p0, p1).
        p.fromHTML('<div><span>a</span></div>');

        const r = p.fromHTML('<section id="p2"><h1>Title</h1><p id="body">text</p></section>');
        const ids = r.template.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);

        const h1 = r.template.find(e => e.tag === 'h1');
        expect(h1).toBeDefined();
        expect(h1.id).not.toBe('p2');

        const out = p.toHTML(r);
        expect(out).toContain('<h1');
        expect(out).toContain('Title');
        expect(out).toContain('id="p2"');
    });

    test('stability: a non-colliding document keeps its exact auto ids', () => {
        const p = parser.factory(sp());
        const r = p.fromHTML('<div class="a"><h1>T</h1><p>b</p></div>');
        expect(r.template.map(e => e.id)).toEqual(['p0', 'p1', 'p2']);
    });

    // ── cross-call id reservation on the SSR path ─────────────────────────────
    // The static site build assembles pages from several `fromHTML` calls on a
    // shared parser and runs through this tokenizer, so the cross-call
    // guarantee must hold here too.
    // See parser.test.js > 'cross-call id reservation (shared instance)'.

    test('an explicit pN from an earlier call is never re-minted later', () => {
        const p = parser.factory(sp());
        const r1 = p.fromHTML('<section id="p3"><h1>A</h1></section>');
        const r2 = p.fromHTML(
            '<div><span>a</span><span>b</span><span>c</span><span>d</span></div>'
        );

        const ids = [...r1.template.map(e => e.id), ...r2.template.map(e => e.id)];
        expect(new Set(ids).size).toBe(ids.length);

        const out = p.toHTML([...r1.template, ...r2.template]);
        expect(out).toContain('<h1');
        expect(out).toContain('A');
    });

    test('reserveIds on the first call makes a later explicit pN safe', () => {
        const p = parser.factory(sp());
        const r1 = p.fromHTML(
            '<div><span>a</span><span>b</span></div>',
            { reserveIds: ['p2'] }
        );
        const r2 = p.fromHTML('<section id="p2"><h1>Title</h1></section>');

        const ids = [...r1.template.map(e => e.id), ...r2.template.map(e => e.id)];
        expect(new Set(ids).size).toBe(ids.length);
        // `p2` survives ONLY as call 2's explicit id: call 1 skipped it.
        expect(r1.template.map(e => e.id)).not.toContain('p2');

        const out = p.toHTML([...r1.template, ...r2.template]);
        expect(out.match(/<h1/g) || []).toHaveLength(1);
        expect(out).toContain('Title');
    });

    test('reserveIds bypasses the source-keyed cache', () => {
        const p = parser.factory(sp());
        const src = '<div><span>a</span></div>';
        const a = p.fromHTML(src);
        expect(a.template.map(e => e.id)).toEqual(['p0', 'p1']);

        const b = p.fromHTML(src, { reserveIds: ['p2', 'p3'] });
        expect(b).not.toBe(a);
        expect(b.template.map(e => e.id)).toEqual(['p4', 'p5']);
        expect(p.fromHTML(src)).toBe(a);
    });

    test('stability: no reservation at all keeps the exact BATCH_22 ids', () => {
        const p = parser.factory(sp());
        expect(p.fromHTML('<div><span>a</span></div>').template.map(e => e.id))
            .toEqual(['p0', 'p1']);
        expect(p.fromHTML('<section><em>b</em></section>').template.map(e => e.id))
            .toEqual(['p2', 'p3']);
    });
});
