// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { parser } from './parser.js';
import { secPolicy } from './secPolicy.js';

const sp = () => secPolicy.factory();

describe('parser module', () => {

    test('has correct module metadata', () => {
        expect(parser.name).toBe('parser');
        expect(parser.dependencies).toEqual(['secPolicy']);
        expect(typeof parser.factory).toBe('function');
    });

    describe('factory', () => {
        let p;

        beforeEach(() => {
            p = parser.factory(sp());
        });

        test('returns an object with fromHTML and toHTML', () => {
            expect(typeof p.fromHTML).toBe('function');
            expect(typeof p.toHTML).toBe('function');
        });

        // ── fromHTML ──────────────────────────────────────────────────────────────

        describe('fromHTML', () => {

            test('empty string returns empty template', () => {
                const result = p.fromHTML('');
                expect(result.template).toEqual([]);
            });

            test('single element returns one node', () => {
                const result = p.fromHTML('<div id="root"></div>');
                expect(result.template.length).toBe(1);
                expect(result.template[0].tag).toBe('div');
                expect(result.template[0].id).toBe('root');
            });

            test('preserves element id attribute', () => {
                const result = p.fromHTML('<span id="my-span">text</span>');
                expect(result.template[0].id).toBe('my-span');
            });

            test('auto-generates id when none provided', () => {
                const result = p.fromHTML('<div></div>');
                expect(typeof result.template[0].id).toBe('string');
                expect(result.template[0].id.length).toBeGreaterThan(0);
            });

            test('parses nested elements (parent before child order)', () => {
                const result = p.fromHTML('<div id="parent"><span id="child"></span></div>');
                expect(result.template.length).toBe(2);
                expect(result.template[0].id).toBe('parent');
                expect(result.template[1].id).toBe('child');
                expect(result.template[1].parent).toBe('parent');
            });

            test('parses text content into elm.text', () => {
                const result = p.fromHTML('<p id="p1">Hello</p>');
                expect(result.template[0].text).toBe('Hello');
            });

            test('parses #{var} placeholder in text content', () => {
                const result = p.fromHTML('<p id="p1">#{name}</p>');
                expect(result.template[0].map).toBeDefined();
                expect(result.template[0].map.some(m => m.name === 'name')).toBe(true);
            });

            test('parses #{var} in attribute values', () => {
                const result = p.fromHTML('<div id="d1" class="#{cls}"></div>');
                const node = result.template[0];
                expect(node.map.some(m => m.name === 'cls' && m.prop === 'class')).toBe(true);
            });

            // ── #{var} positioning: prefix / suffix / both-sides / multi ──────────
            // Regression: a marker with BOTH a leading and trailing static run
            // ("prefix#{v}suffix") used to drop the trailing run. See render.ssr
            // tests for the end-to-end render assertions on the same shapes.
            describe('#{var} static-run positioning', () => {
                const style = (v) => `<div id="d" style="${v}"></div>`;
                const styleNode = (raw) => p.fromHTML(style(raw)).template[0];

                test('prefix-only keeps append with the leading run as base', () => {
                    const n = styleNode('color:#{c}');
                    expect(n.data.style).toBe('color:');
                    const m = n.map.find(e => e.prop === 'style');
                    expect(m).toMatchObject({ name: 'c', append: true });
                    expect(m.tail).toBeUndefined();
                    expect(m.prepend).toBeUndefined();
                });

                test('suffix-only keeps prepend with the trailing run as base', () => {
                    const n = styleNode('#{c}!important');
                    expect(n.data.style).toBe('!important');
                    const m = n.map.find(e => e.prop === 'style');
                    expect(m).toMatchObject({ name: 'c', prepend: true });
                    expect(m.tail).toBeUndefined();
                });

                test('both-sides captures leading base AND trailing tail', () => {
                    const n = styleNode('display:block;inline-size:#{fillPct};block-size:10px');
                    expect(n.data.style).toBe('display:block;inline-size:');
                    const m = n.map.find(e => e.prop === 'style');
                    expect(m).toMatchObject({
                        name: 'fillPct', prop: 'style', data: true,
                        append: true, tail: ';block-size:10px',
                    });
                });

                test('multiple vars in one value keep interleaved static runs', () => {
                    const n = styleNode('a:#{v1};b:#{v2};c:1px');
                    expect(n.data.style).toBe('a:');
                    const ms = n.map.filter(e => e.prop === 'style');
                    expect(ms.map(m => m.name)).toEqual(['v1', 'v2']);
                    expect(ms[0].tail).toBe(';b:');
                    expect(ms[1].tail).toBe(';c:1px');
                });

                test('round-trips prefix/suffix/both-sides/multi through toHTML', () => {
                    for (const raw of [
                        'color:#{c}',
                        '#{c}!important',
                        'display:block;inline-size:#{fillPct};block-size:10px',
                        'a:#{v1};b:#{v2};c:1px',
                    ]) {
                        const out = p.toHTML(p.fromHTML(style(raw)));
                        expect(out).toContain(`style="${raw}"`);
                    }
                });
            });

            test('parses ${slot} text into elm.content', () => {
                const result = p.fromHTML('<div id="slot-host">${mySlot}</div>');
                expect(result.template[0].content).toBe('mySlot');
            });

            test('parses iterate block into iterates map', () => {
                const html = '<div id="list"><!-- $items --><span id="item">#{label}</span><!-- items$ --></div>';
                const result = p.fromHTML(html);
                expect(result.iterates).toBeDefined();
                expect(result.iterates.items).toBeDefined();
                expect(Array.isArray(result.iterates.items)).toBe(true);
            });

            test('result has no iterates key when no iterate blocks', () => {
                const result = p.fromHTML('<div id="x"></div>');
                expect(result.iterates).toBeUndefined();
            });

            test('blocked tags (script, iframe) are silently dropped', () => {
                const result = p.fromHTML('<div id="safe"><script>alert(1)</script></div>');
                const tags = result.template.map(n => n.tag);
                expect(tags).not.toContain('script');
            });

            test('on* event attributes are stripped', () => {
                const result = p.fromHTML('<div id="d" onclick="bad()"></div>');
                const node = result.template[0];
                if (node.attrs) {
                    expect(node.attrs).not.toContain('onclick');
                }
            });

            test('mixed text+element children: text gets a synthetic text node', () => {
                const html = '<div id="mixed">text<span id="s"></span></div>';
                const result = p.fromHTML(html);
                const textNode = result.template.find(n => n.tag === 'text' && n.parent === 'mixed');
                expect(textNode).toBeDefined();
            });

            test('attributes are tracked in elm.attrs array', () => {
                const result = p.fromHTML('<a id="link" href="https://example.com">link</a>');
                const node = result.template[0];
                expect(node.attrs).toContain('href');
            });

            test('multiple sibling root elements are all parsed', () => {
                const result = p.fromHTML('<div id="a"></div><div id="b"></div>');
                expect(result.template.length).toBe(2);
            });
        });

        // ── toHTML ────────────────────────────────────────────────────────────────

        describe('toHTML', () => {

            test('roundtrip: toHTML(fromHTML(html)) contains original element', () => {
                const html = '<div id="test-el"></div>';
                const parsed = p.fromHTML(html);
                const output = p.toHTML(parsed);
                expect(output).toContain('id="test-el"');
                expect(output).toContain('<div');
            });

            test('accepts a plain elm array (no iterates)', () => {
                const { template } = p.fromHTML('<p id="par">Hello</p>');
                const output = p.toHTML(template);
                expect(output).toContain('Hello');
            });

            test('restores #{var} placeholder in text', () => {
                const html = '<p id="p1">#{msg}</p>';
                const output = p.toHTML(p.fromHTML(html));
                expect(output).toContain('#{msg}');
            });

            test('restores #{var} placeholder in attribute', () => {
                const html = '<div id="d1" class="#{cls}"></div>';
                const output = p.toHTML(p.fromHTML(html));
                expect(output).toContain('#{cls}');
            });

            test('restores ${slot} notation', () => {
                const html = '<div id="host">${mySlot}</div>';
                const output = p.toHTML(p.fromHTML(html));
                expect(output).toContain('${mySlot}');
            });

            test('restores iterate block comment delimiters', () => {
                const html = '<ul id="list"><!-- $rows --><li id="row">#{text}</li><!-- rows$ --></ul>';
                const output = p.toHTML(p.fromHTML(html));
                expect(output).toContain('$rows');
                expect(output).toContain('rows$');
            });

            test('empty template array produces empty string', () => {
                expect(p.toHTML([])).toBe('');
            });
        });

        // ── factory isolation ─────────────────────────────────────────────────────

        describe('factory isolation', () => {
            test('multiple factory calls return independent instances', () => {
                const p2 = parser.factory(sp());
                expect(p).not.toBe(p2);
            });
        });

        // ── auto-id collision / per-document uniqueness ───────────────────────────
        //
        // Regression (P1, measured in the real `towards` dist build): the `pN`
        // auto-id counter is scoped to the parser INSTANCE while a site build
        // shares ONE parser across every document. An auto-minted `pN` could
        // therefore collide with an EXPLICIT `pN` id baked into the document
        // being parsed. `buildTree` indexes nodes by id (last write wins), so the
        // colliding node — on `lab/concepts/la-categorisation`, the page's only
        // `<h1>` — silently vanished from the emitted HTML.

        describe('auto-id collision (per-document uniqueness)', () => {

            /** Every id of a ParseResult (main template + iterate sub-templates). */
            const allIds = (r) => [
                ...r.template.map(e => e.id),
                ...Object.values(r.iterates || {}).flatMap(a => a.map(e => e.id)),
            ];

            /** Highest `p<n>` sequence number auto-minted in a ParseResult. */
            const maxSeq = (r) => Math.max(
                ...r.template
                    .map(e => /^p(\d+)$/.exec(e.id))
                    .filter(Boolean)
                    .map(m => Number(m[1]))
            );

            test('explicit pN met BEFORE the mint point keeps the <h1> unique', () => {
                const q = parser.factory(sp());
                // Advance the shared counter (p0, p1, p2).
                const warm = q.fromHTML('<div><span>a</span><span>b</span></div>');
                const next = maxSeq(warm) + 1;

                // The container carries the explicit id the counter is about to
                // mint; the id-less <h1> then mints the very same value.
                const r = q.fromHTML(
                    `<section id="p${next}"><h1>Title</h1><p id="body">text</p></section>`
                );

                const ids = allIds(r);
                expect(new Set(ids).size).toBe(ids.length);

                const h1 = r.template.find(e => e.tag === 'h1');
                expect(h1).toBeDefined();
                expect(h1.id).not.toBe(`p${next}`);

                const out = q.toHTML(r);
                expect(out).toContain('<h1');
                expect(out).toContain('Title');
                expect(out).toContain(`id="p${next}"`);
                expect(out).toContain('id="body"');
            });

            test('explicit pN met AFTER the mint point keeps the <h1> unique', () => {
                const q = parser.factory(sp());
                const warm = q.fromHTML('<div><span>a</span></div>');
                const next = maxSeq(warm) + 1;

                // <main> mints `next`, <h1> mints `next + 1` — and only the LAST
                // element reveals the explicit id that collides with it.
                const r = q.fromHTML(
                    `<main><h1>Title</h1><aside id="p${next + 1}">side</aside></main>`
                );

                const ids = allIds(r);
                expect(new Set(ids).size).toBe(ids.length);

                const h1 = r.template.find(e => e.tag === 'h1');
                expect(h1).toBeDefined();
                expect(h1.id).not.toBe(`p${next + 1}`);

                const out = q.toHTML(r);
                expect(out).toContain('<h1');
                expect(out).toContain('Title');
                expect(out).toContain(`id="p${next + 1}"`);
                expect(out).toContain('side');
            });

            test('explicit pN inside an iterate block is reserved too', () => {
                const q = parser.factory(sp());
                const warm = q.fromHTML('<div><span>a</span></div>');
                const next = maxSeq(warm) + 1;

                // <ul> mints `next`; the iterate row carries that same explicit id.
                const r = q.fromHTML(
                    `<ul><!-- $rows --><li id="p${next}">#{text}</li><!-- rows$ --></ul>`
                );

                const ids = allIds(r);
                expect(new Set(ids).size).toBe(ids.length);
                expect(r.template[0].id).not.toBe(`p${next}`);
            });

            // ── Regression lock: shared-instance scale ────────────────────────────
            // Every document embeds an explicit id that overlaps the running
            // counter; the outline must survive on every one of them.
            test('30 documents through ONE instance keep every <h1>', () => {
                const q = parser.factory(sp());
                for (let i = 0; i < 30; i++) {
                    const r = q.fromHTML(
                        `<article id="a${i}"><h1>H${i}</h1><p id="p${i}">body ${i}</p></article>`
                    );
                    const ids = allIds(r);
                    expect(new Set(ids).size).toBe(ids.length);

                    const h1 = r.template.find(e => e.tag === 'h1');
                    expect(h1).toBeDefined();

                    const out = q.toHTML(r);
                    expect(out).toContain(`H${i}`);
                    expect(out).toContain(`id="p${i}"`);
                    expect(out).toContain(`id="a${i}"`);
                }
            });

            // ── Regression lock: byte-stability ───────────────────────────────────
            // Documents WITHOUT explicit `pN` ids must keep the exact auto ids and
            // the exact serialisation they had before the collision fix — this is
            // the emitted-HTML / hydrate-key parity surface of the site builds
            // (towards: 101 routes, awacloud: 16).
            test('stability: a non-colliding document keeps its exact auto ids', () => {
                const q = parser.factory(sp());
                const r = q.fromHTML('<div class="a"><h1>T</h1><p>b</p></div>');
                expect(r.template.map(e => e.id)).toEqual(['p0', 'p1', 'p2']);
                expect(q.toHTML(r)).toBe(
                    '<div id="p0" class="a">\n'
                    + '  <h1 id="p1">T</h1>\n'
                    + '  <p id="p2">b</p>\n'
                    + '</div>'
                );
            });

            test('stability: the shared counter keeps running across documents', () => {
                const q = parser.factory(sp());
                expect(q.fromHTML('<div><span>a</span></div>').template.map(e => e.id))
                    .toEqual(['p0', 'p1']);
                expect(q.fromHTML('<section><em>b</em></section>').template.map(e => e.id))
                    .toEqual(['p2', 'p3']);
                expect(q.fromHTML('<p>c</p>').template.map(e => e.id))
                    .toEqual(['p4']);
            });

            test('stability: explicit non-pN ids never consume a counter value', () => {
                const q = parser.factory(sp());
                const r = q.fromHTML('<div id="root"><h1>T</h1><p id="body">b</p></div>');
                expect(r.template.map(e => e.id)).toEqual(['root', 'p0', 'body']);
            });
        });

        // ── cross-call id reservation (shared instance) ───────────────────────────
        //
        // BATCH_22 made the ids unique WITHIN one `fromHTML` call. A consumer
        // that assembles ONE logical document from SEVERAL calls on the same
        // parser instance (towards' `headings.js` parses each block separately)
        // needs the guarantee one seam further out — and the harm is the same
        // one: `buildTree` indexes by id with last-write-wins, so a cross-call
        // collision DELETES a subtree from the assembled output.

        describe('cross-call id reservation (shared instance)', () => {

            /** Every id of a ParseResult (main template + iterate sub-templates). */
            const allIds = (r) => [
                ...r.template.map(e => e.id),
                ...Object.values(r.iterates || {}).flatMap(a => a.map(e => e.id)),
            ];

            // ── Direction 1: accumulation (explicit id seen in an EARLIER call) ──

            test('an explicit pN from an earlier call is never re-minted later', () => {
                const q = parser.factory(sp());

                // Call 1 carries an explicit id ABOVE the running counter; its
                // <h1> mints p0.
                const r1 = q.fromHTML('<section id="p3"><h1>A</h1></section>');
                // Call 2 is id-less and advances the counter straight through p3.
                const r2 = q.fromHTML(
                    '<div><span>a</span><span>b</span><span>c</span><span>d</span></div>'
                );

                const ids = [...allIds(r1), ...allIds(r2)];
                expect(new Set(ids).size).toBe(ids.length);
            });

            test('the assembled document keeps its <h1> across the two calls', () => {
                const q = parser.factory(sp());
                const r1 = q.fromHTML('<section id="p3"><h1>A</h1></section>');
                const r2 = q.fromHTML(
                    '<div><span>a</span><span>b</span><span>c</span><span>d</span></div>'
                );

                // One logical document assembled from both calls: a colliding
                // `p3` makes `buildTree` drop the <section> subtree entirely.
                const out = q.toHTML([...r1.template, ...r2.template]);
                expect(out).toContain('<h1');
                expect(out).toContain('A');
            });

            // ── Direction 2: caller-supplied reservation ─────────────────────────

            test('documents the limit: an explicit pN arriving in a LATER call still collides', () => {
                const q = parser.factory(sp());
                const r1 = q.fromHTML('<div><span>a</span><span>b</span></div>');
                const r2 = q.fromHTML('<section id="p2"><h1>Title</h1></section>');

                const ids = [...allIds(r1), ...allIds(r2)];
                // Accumulation cannot cover this direction: call 1 had no way to
                // know about an id only call 2 reveals. Exactly one duplicate.
                expect(new Set(ids).size).toBe(ids.length - 1);
            });

            test('reserveIds on the first call makes the later explicit pN safe', () => {
                const q = parser.factory(sp());
                const r1 = q.fromHTML(
                    '<div><span>a</span><span>b</span></div>',
                    { reserveIds: ['p2'] }
                );
                const r2 = q.fromHTML('<section id="p2"><h1>Title</h1></section>');

                const ids = [...allIds(r1), ...allIds(r2)];
                expect(new Set(ids).size).toBe(ids.length);
                // `p2` survives ONLY as call 2's explicit id: call 1 skipped it.
                expect(r1.template.map(e => e.id)).not.toContain('p2');

                const out = q.toHTML([...r1.template, ...r2.template]);
                expect(out.match(/<h1/g) || []).toHaveLength(1);
                expect(out).toContain('Title');
            });

            test('reserveIds accepts any iterable and persists on the instance', () => {
                const q = parser.factory(sp());
                q.fromHTML('<div></div>', { reserveIds: new Set(['p1', 'p2']) });
                // The reservation still applies to a LATER call with no options.
                const r = q.fromHTML('<p>a</p><p>b</p>');
                expect(r.template.map(e => e.id)).toEqual(['p3', 'p4']);
            });

            test('reserveIds ignores empty / non-string entries', () => {
                const q = parser.factory(sp());
                const r = q.fromHTML('<div><span>x</span></div>', {
                    reserveIds: ['', '   ', 42, null, 'p1'],
                });
                expect(r.template.map(e => e.id)).toEqual(['p0', 'p2']);
            });

            // ── Memoisation × reservation ────────────────────────────────────────

            test('reserveIds bypasses the source-keyed cache (no stale ParseResult)', () => {
                const q = parser.factory(sp());
                const src = '<div><span>a</span></div>';

                const a = q.fromHTML(src);                 // cached → p0, p1
                expect(a.template.map(e => e.id)).toEqual(['p0', 'p1']);

                const b = q.fromHTML(src, { reserveIds: ['p2', 'p3'] });
                expect(b).not.toBe(a);
                expect(b.template.map(e => e.id)).toEqual(['p4', 'p5']);

                // The reserved-set parse is never STORED either: a later bare
                // call still gets the original cached entry.
                expect(q.fromHTML(src)).toBe(a);
            });

            // ── Byte-stability locks for the accumulation layer ──────────────────

            test('stability: explicit NON-pN ids accumulated across calls never shift the counter', () => {
                const q = parser.factory(sp());
                expect(q.fromHTML('<div id="a"><span>x</span></div>').template.map(e => e.id))
                    .toEqual(['a', 'p0']);
                expect(q.fromHTML('<div id="b"><span>y</span></div>').template.map(e => e.id))
                    .toEqual(['b', 'p1']);
            });

            test('stability: no reservation at all keeps the exact BATCH_22 ids', () => {
                const q = parser.factory(sp());
                expect(q.fromHTML('<div><span>a</span></div>').template.map(e => e.id))
                    .toEqual(['p0', 'p1']);
                expect(q.fromHTML('<section><em>b</em></section>').template.map(e => e.id))
                    .toEqual(['p2', 'p3']);
            });
        });

        // ── ParseResult cache ─────────────────────────────────────────────────────

        describe('ParseResult cache', () => {
            test('identical strings return the SAME ParseResult reference', () => {
                const p2 = parser.factory(sp());
                const a = p2.fromHTML('<div>#{n}</div>');
                const b = p2.fromHTML('<div>#{n}</div>');
                expect(a).toBe(b);
            });

            test('different strings produce different ParseResult', () => {
                const p2 = parser.factory(sp());
                const a = p2.fromHTML('<div>#{a}</div>');
                const b = p2.fromHTML('<div>#{b}</div>');
                expect(a).not.toBe(b);
            });

            test('cache.stats() tracks hits/misses', () => {
                const p2 = parser.factory(sp());
                p2.cache.clear();
                p2.fromHTML('<p>x</p>');
                p2.fromHTML('<p>x</p>');
                p2.fromHTML('<p>y</p>');
                const s = p2.cache.stats();
                expect(s.hits).toBe(1);
                expect(s.misses).toBe(2);
                expect(s.size).toBe(2);
            });

            test('cache.setMax(0) disables caching', () => {
                const p2 = parser.factory(sp());
                p2.cache.clear();
                p2.cache.setMax(0);
                const a = p2.fromHTML('<p>z</p>');
                const b = p2.fromHTML('<p>z</p>');
                expect(a).not.toBe(b);
                expect(p2.cache.size()).toBe(0);
            });

            test('cache evicts oldest beyond setMax', () => {
                const p2 = parser.factory(sp());
                p2.cache.clear();
                p2.cache.setMax(2);
                p2.fromHTML('<p>1</p>');
                p2.fromHTML('<p>2</p>');
                p2.fromHTML('<p>3</p>');
                expect(p2.cache.size()).toBe(2);
                expect(p2.cache.stats().evictions).toBeGreaterThanOrEqual(1);
            });
        });
    });
});
