// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Tests for `createPageflip(el, opts)` — the constructible helper
 * that absorbs the seven-positional-dependency hand-wiring.
 *
 * Covers the plan's four required shapes: the happy path (constructs, mounts,
 * renders something measurable), `dispose()` idempotent AND residue-free (no DOM
 * left behind, no tickable left on the scheduler), two instances on one page
 * with no id/DOM collision, and verbatim option forwarding (the helper invents
 * nothing).
 *
 * happy-dom is registered at the TOP of the file: the fw `dom` writer reaches
 * the `NodeList` global at the first tick, not at import (package memory rule).
 * Turns are driven through a MANUAL-clock scheduler passed as `opts.scheduler`,
 * so nothing ever registers on a shared production singleton.
 *
 * Invariant this file maintains: EVERY test disposes every handle it creates.
 * The helper's runtime is reference-counted, and the "released after the last
 * dispose" test reads that refcount through the identity of the resolved
 * `Pageflip` class — a leaked live handle would falsify it.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { pageflipModule } from './pageflip.js';
import { createPageflip } from './create.js';

// A PROBE runtime, independent of the helper's own private one: it only sources
// the `Scheduler` class and `SVG_NS` for assertions. The helper is never handed
// anything from here except a duck-typed scheduler instance.
const probe = new ModuleRuntime();
probe.registerDeep(pageflipModule);
const { Scheduler } = probe.resolve('graphic.scheduler');
const { SVG_NS } = probe.resolve('graphic.svgApply');

/** A manual-clock scheduler — frames advance only when `tick()` is called. */
function manualScheduler() {
    return new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
}

const DIMS = { width: 320, height: 480 };
const makePages = () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

/** A fresh detached mount point. */
function stage() {
    return document.createElement('div');
}

/** Options with a manual scheduler, so no test ever touches the shared one. */
function opts(extra) {
    return { pages: makePages(), ...DIMS, duration: 100, scheduler: manualScheduler(), ...extra };
}

// ── Happy path ───────────────────────────────────────────────────────────────

describe('createPageflip — happy path', () => {
    test('returns { instance, dispose } and mounts a namespace-correct book', () => {
        const el = stage();
        const h = createPageflip(el, opts());

        expect(typeof h.dispose).toBe('function');
        expect(h.instance).toBeDefined();
        expect(el.childNodes.length).toBe(1);
        expect(el.firstChild).toBe(h.instance.el);
        expect(h.instance.el.namespaceURI).toBe(SVG_NS);
        expect(h.instance.el.tagName).toBe('svg');

        h.dispose();
    });

    test('renders something measurable: three page groups, the first one visible', () => {
        const el = stage();
        const h = createPageflip(el, opts());

        expect(h.instance.pageCount).toBe(3);
        expect(h.instance.index).toBe(0);
        expect(h.instance.currentId).toBe('a');
        // The leaf-clip <defs>, one <g> per page, and the turning <path>.
        expect(h.instance.el.childNodes.length).toBe(5);
        expect(h.instance._pageEls[0].getAttribute('display')).toBe('inline');
        expect(h.instance._pageEls[1].getAttribute('display')).toBe('none');

        h.dispose();
    });

    test('the returned instance is the real Pageflip: a turn advances the page', () => {
        const el = stage();
        const sched = manualScheduler();
        const h = createPageflip(el, opts({ scheduler: sched }));

        const tl = h.instance.next();
        expect(tl).not.toBeNull();
        sched.tick(0);
        sched.tick(100);
        expect(h.instance.index).toBe(1);
        expect(h.instance.currentId).toBe('b');

        h.dispose();
    });

    test('mounting replaces the target\'s previous children (Pageflip#mountInto semantics)', () => {
        const el = stage();
        el.appendChild(document.createElement('span'));
        const h = createPageflip(el, opts());

        expect(el.childNodes.length).toBe(1);
        expect(el.firstChild).toBe(h.instance.el);

        h.dispose();
    });
});

// ── Verbatim option forwarding (no invented options) ─────────────────────────

describe('createPageflip — options are forwarded verbatim', () => {
    test('an explicit prefix reaches the real constructor', () => {
        const el = stage();
        const h = createPageflip(el, opts({ prefix: 'my-book' }));

        expect(h.instance.prefix).toBe('my-book');
        expect(h.instance._turnPath.getAttribute('id')).toContain('my-book');

        h.dispose();
    });

    test('duration and the injected scheduler are honoured (turn completes at t=duration)', () => {
        const el = stage();
        const sched = manualScheduler();
        const h = createPageflip(el, opts({ duration: 40, scheduler: sched }));

        h.instance.next();
        sched.tick(0);
        expect(sched.active.size).toBe(1);   // registered on OUR scheduler
        sched.tick(39);
        expect(h.instance.index).toBe(0);    // not done yet
        sched.tick(40);
        expect(h.instance.index).toBe(1);    // completed exactly at `duration`

        h.dispose();
    });
});

// ── Argument / error handling ────────────────────────────────────────────────

describe('createPageflip — argument handling', () => {
    test('throws when el is missing or not mountable', () => {
        expect(() => createPageflip(null, opts())).toThrow('el must be an element');
        expect(() => createPageflip({}, opts())).toThrow('el must be an element');
    });

    test('a constructor error propagates unchanged and leaves the helper usable', () => {
        const el = stage();
        expect(() => createPageflip(el, { pages: [], ...DIMS })).toThrow('non-empty array');
        expect(el.childNodes.length).toBe(0);   // nothing was mounted

        // The failed acquisition was released, so a valid call still works.
        const h = createPageflip(el, opts());
        expect(el.firstChild).toBe(h.instance.el);
        h.dispose();
    });
});

// ── Two instances on one page: no id / DOM collision ─────────────────────────

describe('createPageflip — two instances never collide', () => {
    test('default-prefix books mint distinct prefixes and disjoint DOM ids', () => {
        const elA = stage();
        const elB = stage();
        const a = createPageflip(elA, opts());
        const b = createPageflip(elB, opts());

        expect(a.instance.prefix).not.toBe(b.instance.prefix);

        const idsOf = (root) => {
            const acc = [];
            (function walk(n) {
                if (n && n.getAttribute) {
                    const v = n.getAttribute('id');
                    if (v) acc.push(v);
                }
                for (const c of (n && n.childNodes) || []) walk(c);
            })(root);
            return acc;
        };
        const idsA = idsOf(a.instance.el);
        const idsB = idsOf(b.instance.el);
        expect(idsA.length).toBeGreaterThan(0);
        expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);

        a.dispose();
        b.dispose();
    });

    test('each book mounts into its own element and turns independently', () => {
        const elA = stage();
        const elB = stage();
        const schedA = manualScheduler();
        const a = createPageflip(elA, opts({ scheduler: schedA }));
        const b = createPageflip(elB, opts());

        a.instance.next();
        schedA.tick(0);
        schedA.tick(100);

        expect(a.instance.index).toBe(1);
        expect(b.instance.index).toBe(0);
        expect(elA.firstChild).toBe(a.instance.el);
        expect(elB.firstChild).toBe(b.instance.el);

        a.dispose();
        b.dispose();
    });
});

// ── dispose: idempotent + residue-free ───────────────────────────────────────

describe('createPageflip — dispose', () => {
    test('leaves no DOM residue: the mount is empty and the subtree detached', () => {
        const el = stage();
        const h = createPageflip(el, opts());
        const built = h.instance.el;

        h.dispose();

        expect(el.childNodes.length).toBe(0);
        expect(built.parentNode).toBeNull();
    });

    test('cancels an in-flight turn — the scheduler holds nothing afterwards', () => {
        const el = stage();
        const sched = manualScheduler();
        const h = createPageflip(el, opts({ scheduler: sched }));

        h.instance.next();
        sched.tick(0);
        expect(sched.active.size).toBe(1);

        h.dispose();
        expect(sched.active.size).toBe(0);
    });

    test('no further frame reaches the book after dispose', () => {
        const el = stage();
        const sched = manualScheduler();
        const h = createPageflip(el, opts({ scheduler: sched }));

        h.instance.next();
        sched.tick(0);
        h.dispose();
        sched.tick(50);   // would have been a mid-turn frame

        expect(sched.active.size).toBe(0);
        expect(h.instance.index).toBe(0);   // the turn never completed
    });

    test('is idempotent — a second call is a no-op and never throws', () => {
        const el = stage();
        const sched = manualScheduler();
        const h = createPageflip(el, opts({ scheduler: sched }));

        h.instance.next();
        sched.tick(0);
        h.dispose();

        expect(() => h.dispose()).not.toThrow();
        expect(() => h.dispose()).not.toThrow();
        expect(el.childNodes.length).toBe(0);
    });
});

// ── Local runtime: shared while live, released with the last instance ────────

describe('createPageflip — local runtime lifecycle', () => {
    test('concurrent helpers share ONE resolved surface (one scheduler, one prefix counter)', () => {
        const a = createPageflip(stage(), opts());
        const b = createPageflip(stage(), opts());

        // Same resolved factory closure ⇒ same class identity.
        expect(b.instance.constructor).toBe(a.instance.constructor);

        a.dispose();
        b.dispose();
    });

    test('the runtime is released once the last instance is disposed', () => {
        const a = createPageflip(stage(), opts());
        const ctor = a.instance.constructor;
        a.dispose();

        const b = createPageflip(stage(), opts());
        expect(b.instance.constructor).not.toBe(ctor);   // rebuilt from scratch
        b.dispose();
    });
});
