// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The shared parse cache (`parser.createCache` + `fromHTML(html, { cache })`)
// is TRANSPARENT: whatever a hit returns is exactly what a fresh parse on the
// calling instance would return, auto ids included — so instances with
// different histories can share one cache without an id collision. Every
// test compares an instance using the cache with a twin whose caching is off,
// fed the same sequence; both the DOMParser path and the internal tokenizer
// (SSR) are exercised.

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect } from 'bun:test';
import { parser } from './parser.js';
import { secPolicy } from './secPolicy.js';

const make = () => parser.factory(secPolicy.factory());
const plain = () => { const p = make(); p.cache.setMax(0); return p; };

const CHROME = '<header><nav><a href="/">home</a><a href="/x">#{label}</a></nav></header>';
const LIST = '<ul><!-- $rows --><li>#{name}</li><li>${slot}</li><!-- rows$ --></ul>';
const EXPLICIT = '<div id="p3"><span>a</span><p>b</p><section id="p7">c</section></div>';
const MIXED = '<main><h1>T</h1>text #{v}<b>bold</b>${s}</main>';
const DOCS = [CHROME, EXPLICIT, LIST, CHROME, MIXED, CHROME, LIST, EXPLICIT];

/** Feed `docs` to `p` (with `opts`), returning every result. */
const feed = (p, docs, opts) => docs.map((d) => p.fromHTML(d, opts));

for (const path of ['DOMParser', 'tokenizer']) {
    describe(`parser shared cache — ${path}`, () => {
        const withPath = (fn) => {
            const saved = globalThis.DOMParser;
            if (path === 'tokenizer') delete globalThis.DOMParser;
            try { return fn(); } finally { if (path === 'tokenizer') globalThis.DOMParser = saved; }
        };

        test('one instance with a shared cache returns what an uncached twin returns', () => withPath(() => {
            const cache = make().createCache();
            const a = make(), b = plain();
            expect(feed(a, DOCS, { cache })).toEqual(feed(b, DOCS));
            expect(cache.stats().hits).toBeGreaterThan(0);
        }));

        test('instances with different histories share one cache and stay equal to uncached twins', () => withPath(() => {
            const cache = make().createCache();
            const warm = make();
            feed(warm, [MIXED, CHROME, LIST, EXPLICIT], { cache });   // fills the cache from another counter state
            const a = make(), b = plain();
            const prefix = ['<p>one</p>', '<p>two</p><p>three</p>'];
            feed(a, prefix); feed(b, prefix);                          // a's counter is now past p0..p2
            expect(feed(a, DOCS, { cache })).toEqual(feed(b, DOCS));
            // the counters advanced identically: the next fresh parse agrees too
            expect(a.fromHTML('<div><i>x</i></div>')).toEqual(b.fromHTML('<div><i>x</i></div>'));
        }));

        test('a hit never re-uses an id the instance already minted', () => withPath(() => {
            const cache = make().createCache();
            make().fromHTML(CHROME, { cache });                       // cached with ids p0.. from a fresh counter
            const a = make();
            const first = a.fromHTML('<p>x</p><p>y</p>');              // a mints p0, p1
            const hit = a.fromHTML(CHROME, { cache });
            const ids = (r) => r.template.map((e) => e.id);
            expect(ids(hit).filter((id) => ids(first).includes(id))).toEqual([]);
        }));

        test('reserveIds between calls is honoured on a hit', () => withPath(() => {
            const cache = make().createCache();
            make().fromHTML(LIST, { cache });
            const a = make(), b = plain();
            a.fromHTML('<p>r</p>', { reserveIds: ['p1', 'p2'] }); b.fromHTML('<p>r</p>', { reserveIds: ['p1', 'p2'] });
            expect(a.fromHTML(LIST, { cache })).toEqual(b.fromHTML(LIST));
        }));
    });
}

describe('parser shared cache — contract', () => {
    test('createCache: size, clear, stats, max', () => {
        const p = make();
        const cache = p.createCache({ max: 2 });
        p.fromHTML('<a>1</a>', { cache }); p.fromHTML('<a>2</a>', { cache }); p.fromHTML('<a>3</a>', { cache });
        expect(cache.size()).toBe(2);
        expect(cache.stats()).toMatchObject({ misses: 3, evictions: 1, size: 2, max: 2 });
        cache.clear();
        expect(cache.size()).toBe(0);
        const off = p.createCache({ max: 0 });
        p.fromHTML('<a>1</a>', { cache: off });
        expect(off.size()).toBe(0);
    });

    test('a shared-cache result is a copy', () => {
        const cache = make().createCache();
        const a = make();
        a.fromHTML(CHROME, { cache }).template[0].tag = 'mutated';
        expect(make().fromHTML(CHROME, { cache }).template[0].tag).toBe('header');
    });

    test('reserveIds bypasses the shared cache', () => {
        const cache = make().createCache();
        make().fromHTML(CHROME, { cache, reserveIds: ['p0'] });
        expect(cache.size()).toBe(0);
    });

    test('the per-instance cache keeps its semantics (a hit returns the first parse\'s ids)', () => {
        const p = make();
        const x = p.fromHTML(CHROME);
        p.fromHTML('<p>z</p>');
        expect(p.fromHTML(CHROME)).toEqual(x);
    });
});
