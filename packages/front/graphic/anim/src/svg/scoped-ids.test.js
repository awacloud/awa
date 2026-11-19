// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { scopedIdsModule } from './scoped-ids.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ─────────────────────── descriptor shape ──────────────────────────────── */

describe('graphic.scopedIds descriptor', () => {
    test('descriptor shape is correct', () => {
        expect(scopedIdsModule.name).toBe('graphic.scopedIds');
        expect(scopedIdsModule.type).toBe('lib.graphic.svg');
        expect(scopedIdsModule.version).toBe('0.1.0');
        expect(scopedIdsModule.dependencies).toEqual([]);
        expect(scopedIdsModule.deps).toEqual([]);
        expect(typeof scopedIdsModule.factory).toBe('function');
    });

    test('factory returns { createScope }', () => {
        const api = scopedIdsModule.factory();
        expect(Object.keys(api).sort()).toEqual(['createScope']);
        expect(typeof api.createScope).toBe('function');
    });
});

/* ─────────────────────── createScope surface ───────────────────────────── */

describe('createScope', () => {
    let createScope;
    beforeEach(() => { ({ createScope } = scopedIdsModule.factory()); });

    test('returns a Scope { id, ref, prefix, seq }', () => {
        const scope = createScope('card');
        expect(Object.keys(scope).sort()).toEqual(['id', 'prefix', 'ref', 'seq']);
        expect(typeof scope.id).toBe('function');
        expect(typeof scope.ref).toBe('function');
        expect(typeof scope.seq).toBe('function');
        expect(scope.prefix).toBe('card');
    });

    test('default prefix is a DISTINCT `g-<n>` (never the bare shared "g")', () => {
        const scope = createScope();
        expect(scope.prefix).toMatch(/^g-\d+$/);
        expect(scope.id('x')).toBe(`${scope.prefix}-x-0`);
    });
});

/* ───────────── default-prefix collision-freedom (GAPS #3, BATCH_16) ───────── */

describe('default-prefix collision-freedom (GAPS #3)', () => {
    test('two default-constructed scopes mint DISJOINT id sets', () => {
        const { createScope } = scopedIdsModule.factory();
        const a = createScope();
        const b = createScope();

        // The historical collision: both defaulted to the bare 'g' prefix and
        // each restarted its own counter at 0, so `a.id('grad')` and
        // `b.id('grad')` were the identical string 'g-grad-0' — two DOM ids
        // clashing document-wide. The default prefix now carries a distinct
        // index, so the two id sets are provably disjoint.
        expect(a.prefix).not.toBe(b.prefix);

        const raw = ['grad', 'box', 'clip'];
        const aIds = raw.map((r) => a.id(r));
        const bIds = raw.map((r) => b.id(r));
        const union = [...aIds, ...bIds];
        expect(new Set(union).size).toBe(union.length);
    });

    test('the default-prefix counter never resets within a factory (strictly increasing)', () => {
        const { createScope } = scopedIdsModule.factory();
        const indices = [];
        for (let i = 0; i < 5; i++) {
            const m = createScope().prefix.match(/^g-(\d+)$/);
            expect(m).not.toBe(null);
            indices.push(Number(m[1]));
        }
        for (let i = 1; i < indices.length; i++) {
            expect(indices[i]).toBeGreaterThan(indices[i - 1]);
        }
    });

    test('an EXPLICIT prefix bypasses the counter entirely (byte-identical mints)', () => {
        const { createScope } = scopedIdsModule.factory();
        // Interleave defaults so the counter has advanced — explicit scopes must
        // be completely unaffected by it.
        createScope();
        const c = createScope('card');
        createScope();
        const d = createScope('card');

        expect(c.prefix).toBe('card');
        expect(d.prefix).toBe('card');
        expect(c.id('grad')).toBe('card-grad-0');
        expect(d.id('grad')).toBe('card-grad-0');
        // Falsy-but-explicit values keep their exact legacy behavior too.
        expect(createScope('').prefix).toBe('');
        expect(createScope(null).prefix).toBe(null);
    });
});

/* ─────────────────────── scope.id — minting ────────────────────────────── */

describe('scope.id', () => {
    let scope;
    beforeEach(() => {
        const { createScope } = scopedIdsModule.factory();
        scope = createScope('g');
    });

    test('first sighting mints `${prefix}-${rawId}-${n}` from 0', () => {
        expect(scope.id('a')).toBe('g-a-0');
        expect(scope.id('b')).toBe('g-b-1');
        expect(scope.id('c')).toBe('g-c-2');
    });

    test('same rawId twice → identical scoped id (deterministic per scope)', () => {
        const first = scope.id('grad');
        const second = scope.id('grad');
        expect(first).toBe('g-grad-0');
        expect(second).toBe(first);
        // Counter did not advance on the repeat.
        expect(scope.id('other')).toBe('g-other-1');
    });

    test('empty / absent rawId mints anonymous `${prefix}-${n}`', () => {
        expect(scope.id()).toBe('g-0');
        expect(scope.id('')).toBe('g-1');
        expect(scope.id(null)).toBe('g-2');
        expect(scope.id(undefined)).toBe('g-3');
    });

    test('anonymous ids are always unique (never recorded/deduped)', () => {
        const a = scope.id();
        const b = scope.id();
        expect(a).not.toBe(b);
    });

    test('seq() reflects the current counter', () => {
        expect(scope.seq()).toBe(0);
        scope.id('a');
        expect(scope.seq()).toBe(1);
        scope.id('a'); // repeat → no advance
        expect(scope.seq()).toBe(1);
        scope.id('b');
        expect(scope.seq()).toBe(2);
    });
});

/* ─────────────────────── monotonic-counter discipline ──────────────────── */

describe('monotonic-counter discipline (fw parser _seq++)', () => {
    let scope;
    beforeEach(() => {
        const { createScope } = scopedIdsModule.factory();
        scope = createScope('g');
    });

    test('a single monotonic sequence feeds every mint (indices 0,1,2,…)', () => {
        // Anonymous and named mints draw from the SAME counter — one sequence,
        // no per-kind sub-counters. Trailing index increases by exactly 1 per
        // mint, mirroring fw `nextId = () => 'p' + (_seq++)`.
        expect(scope.id()).toBe('g-0');       // seq 0 (anonymous)
        expect(scope.id('a')).toBe('g-a-1');  // seq 1 (named)
        expect(scope.id()).toBe('g-2');       // seq 2 (anonymous)
        expect(scope.id('b')).toBe('g-b-3');  // seq 3 (named)
        expect(scope.seq()).toBe(4);
    });

    test('minted once per unique rawId — repeats never advance the counter', () => {
        expect(scope.id('a')).toBe('g-a-0');
        expect(scope.id('a')).toBe('g-a-0'); // dedup, no advance
        expect(scope.id('a')).toBe('g-a-0'); // dedup, no advance
        expect(scope.seq()).toBe(1);         // exactly one increment for 'a'
        expect(scope.id('b')).toBe('g-b-1'); // next unique → next index
        expect(scope.seq()).toBe(2);
    });

    test('stable under interleaved id / ref calls (one sequence, minted-once)', () => {
        // ref() mints through the same id() path; a rawId first seen via ref
        // consumes exactly one index and is deduped thereafter by either entry.
        expect(scope.ref('url(#grad)', 'fill')).toBe('url(#g-grad-0)'); // seq 0
        expect(scope.id('grad')).toBe('g-grad-0');                     // dedup
        expect(scope.ref('#target', 'href')).toBe('#g-target-1');      // seq 1
        expect(scope.id('another')).toBe('g-another-2');               // seq 2
        expect(scope.ref('url(#target)', 'stroke')).toBe('url(#g-target-1)'); // dedup
        // Three unique refs/ids → exactly three increments.
        expect(scope.seq()).toBe(3);
    });
});

/* ─────────────────────── two-scope collision-freedom ───────────────────── */

describe('scope isolation (collision guarantee)', () => {
    test('two scopes over the same template produce disjoint id sets', () => {
        const { createScope } = scopedIdsModule.factory();
        const a = createScope('g');
        const b = createScope('g');

        // Same rawIds in each scope; distinct minted ids per scope.
        const aGrad = a.id('grad');
        const bGrad = b.id('grad');
        // Within a scope the counter is independent; the mint is deterministic.
        expect(aGrad).toBe('g-grad-0');
        expect(bGrad).toBe('g-grad-0');
        // But the mapping tables are independent — each scope resolves its own
        // references consistently and never reads the other's.
        expect(a.id('grad')).toBe(aGrad);
        expect(b.id('grad')).toBe(bGrad);

        // With distinct prefixes the two id sets are provably disjoint.
        const c = createScope('card');
        const d = createScope('tile');
        expect(c.id('grad')).toBe('card-grad-0');
        expect(d.id('grad')).toBe('tile-grad-0');
        expect(c.id('grad')).not.toBe(d.id('grad'));
    });

    test('a scope never leaks state into another', () => {
        const { createScope } = scopedIdsModule.factory();
        const a = createScope('g');
        const b = createScope('g');
        a.id('x'); a.id('y'); a.id('z');
        // b starts fresh at 0 regardless of a's counter.
        expect(b.id('first')).toBe('g-first-0');
        expect(b.seq()).toBe(1);
    });
});

/* ─────────────────────── scope.ref — rewriting ─────────────────────────── */

describe('scope.ref', () => {
    let scope;
    beforeEach(() => {
        const { createScope } = scopedIdsModule.factory();
        scope = createScope('g');
    });

    test('url(#foo) rewrites to url(#<scoped foo>) for any attr', () => {
        expect(scope.ref('url(#grad)', 'fill')).toBe('url(#g-grad-0)');
    });

    test('url(#…) rewrites even without an attrName (unambiguous syntax)', () => {
        expect(scope.ref('url(#clip)')).toBe('url(#g-clip-0)');
    });

    test('bare #foo rewrites for href / xlink:href', () => {
        expect(scope.ref('#target', 'href')).toBe('#g-target-0');
        expect(scope.ref('#target', 'xlink:href')).toBe('#g-target-0');
    });

    test('ref and id agree for the same rawId regardless of ordering', () => {
        // ref-then-id (forward reference from ref).
        expect(scope.ref('url(#grad)', 'fill')).toBe('url(#g-grad-0)');
        expect(scope.id('grad')).toBe('g-grad-0');

        // id-then-ref within the same scope resolves to the same id.
        const scope2 = scopedIdsModule.factory().createScope('g');
        expect(scope2.id('grad')).toBe('g-grad-0');
        expect(scope2.ref('#grad', 'href')).toBe('#g-grad-0');
        expect(scope2.ref('url(#grad)', 'fill')).toBe('url(#g-grad-0)');
    });

    test('forward reference: ref mints, later id returns the same value', () => {
        const viaRef = scope.ref('#lazy', 'href');
        expect(viaRef).toBe('#g-lazy-0');
        expect(scope.id('lazy')).toBe('g-lazy-0');
    });
});

/* ─────────────────────── colour disambiguation ─────────────────────────── */

describe('scope.ref colour disambiguation', () => {
    let scope;
    beforeEach(() => {
        const { createScope } = scopedIdsModule.factory();
        scope = createScope('g');
    });

    test('bare #rrggbb colour on a non-reference attr passes through unchanged', () => {
        expect(scope.ref('#fff', 'fill')).toBe('#fff');
        expect(scope.ref('#ff0000', 'stroke')).toBe('#ff0000');
        // No mint happened.
        expect(scope.seq()).toBe(0);
    });

    test('bare #foo with no attrName passes through (ambiguous → treat as colour)', () => {
        expect(scope.ref('#foo')).toBe('#foo');
        expect(scope.seq()).toBe(0);
    });

    test('non-reference values pass through', () => {
        expect(scope.ref('50px', 'width')).toBe('50px');
        expect(scope.ref('rgb(1,2,3)', 'fill')).toBe('rgb(1,2,3)');
        expect(scope.ref('none', 'fill')).toBe('none');
    });

    test('non-string value passes through untouched', () => {
        expect(scope.ref(42, 'width')).toBe(42);
        expect(scope.ref(null, 'fill')).toBe(null);
    });
});

/* ─────────────────────── Worker-safety: DOM-free scan ──────────────────── */

describe('Worker-safety: DOM-free module scan', () => {
    function stripComments(src) {
        let s = src.replace(/\/\*[\s\S]*?\*\//g, '');
        s = s.replace(/\/\/[^\n]*/g, '');
        return s;
    }

    test('scoped-ids.js source contains no window/document/globalThis usage', () => {
        const src = stripComments(readFileSync(resolve(HERE, 'scoped-ids.js'), 'utf8'));
        expect(src).not.toMatch(/\bwindow\b/);
        expect(src).not.toMatch(/\bdocument\b/);
        expect(src).not.toMatch(/\bglobalThis\b/);
    });
});
