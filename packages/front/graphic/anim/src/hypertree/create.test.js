// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Tests for `createHypertree(rootEl, opts)` — the constructible
 * helper that absorbs the eight-positional-dependency hand-wiring AND the
 * SVG-root recipe.
 *
 * Covers the plan's required shapes: the happy path (constructs, mounts, renders
 * something measurable), caller-supplied vs helper-created SVG root,
 * `dispose()` idempotent AND residue-free (listeners off, nothing left ticking,
 * no DOM left behind), two instances on one page with no id/DOM collision, and
 * verbatim option forwarding (the helper invents nothing beyond carrying `tree`
 * inside `opts`, which the prescribed two-parameter signature forces).
 *
 * happy-dom is registered at the TOP of the file: the fw `dom` writer reaches
 * the `NodeList` global at the first tick, not at import (package memory rule).
 * Focus transitions are driven through a MANUAL-clock scheduler passed as
 * `opts.scheduler`, so nothing ever registers on a shared production singleton.
 *
 * Invariant this file maintains: EVERY test disposes every handle it creates.
 * The helper's runtime is reference-counted, and the "released after the last
 * dispose" test reads that refcount through the identity of the resolved
 * `Hypertree` class — a leaked live handle would falsify it.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { hypertreeModule } from './hypertree.js';
import { createHypertree } from './create.js';

// A PROBE runtime, independent of the helper's own private one: it only sources
// the `Scheduler` class and `SVG_NS` for assertions. The helper is never handed
// anything from here except a duck-typed scheduler instance.
const probe = new ModuleRuntime();
probe.registerDeep(hypertreeModule);
const { Scheduler } = probe.resolve('graphic.scheduler');
const { SVG_NS } = probe.resolve('graphic.svgApply');

/** A manual-clock scheduler — frames advance only when `tick()` is called. */
function manualScheduler() {
    return new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
}

/** root(3) → a(2: a1,a2), b(1: b1), c(leaf) — 7 nodes, 6 edges. */
const sampleTree = () => ({
    id: 'root',
    label: 'Root',
    children: [
        { id: 'a', label: 'Alpha', children: [{ id: 'a1' }, { id: 'a2' }] },
        { id: 'b', children: [{ id: 'b1' }] },
        { id: 'c' },
    ],
});

/** A fresh detached plain (HTML) container. */
function container() {
    return document.createElement('div');
}

/** A fresh detached, conformant SVG root. */
function svgRoot() {
    const el = document.createElementNS(SVG_NS, 'svg');
    el.setAttribute('viewBox', '0 0 42 42');   // caller-owned sizing
    return el;
}

/** Options with a manual scheduler, so no test ever touches the shared one. */
function opts(extra) {
    return { tree: sampleTree(), duration: 100, scheduler: manualScheduler(), ...extra };
}

/** Every `id` attribute in a subtree, in document order. */
function idsOf(root) {
    const acc = [];
    (function walk(n) {
        if (n && n.getAttribute) {
            const v = n.getAttribute('id');
            if (v) acc.push(v);
        }
        for (const c of (n && n.childNodes) || []) walk(c);
    })(root);
    return acc;
}

// ── Happy path ───────────────────────────────────────────────────────────────

describe('createHypertree — happy path', () => {
    test('returns { instance, root, dispose } and builds the tree under the root', () => {
        const el = container();
        const h = createHypertree(el, opts());

        expect(typeof h.dispose).toBe('function');
        expect(h.instance).toBeDefined();
        expect(h.root.namespaceURI).toBe(SVG_NS);
        expect(h.instance.el.parentNode).toBe(h.root);
        expect(h.instance.rootId).toBe('root');
        expect(h.instance.focusId).toBe('root');

        h.dispose();
    });

    test('renders something measurable: every node is positioned, every link drawn', () => {
        const el = container();
        const h = createHypertree(el, opts({ radius: 400 }));

        const ids = ['root', 'a', 'a1', 'a2', 'b', 'b1', 'c'];
        for (const id of ids) {
            const g = h.instance._nodeEls.get(id);
            expect(g).toBeDefined();
            expect(g.getAttribute('transform')).toMatch(/^translate\(-?[\d.]+ -?[\d.]+\)$/);
        }
        // The root sits at the centre (R, R) of the layout square.
        expect(h.instance.node('root').x).toBe(400);
        expect(h.instance.node('root').y).toBe(400);
        for (const link of h.instance._linkEls.values()) {
            expect(link.getAttribute('d')).toMatch(/^M .* Q .*/);
        }

        h.dispose();
    });

    test('the returned instance is the real Hypertree: a focus transition runs', () => {
        const el = container();
        const sched = manualScheduler();
        const focused = [];
        const h = createHypertree(el, opts({
            scheduler: sched, onFocus: (id) => focused.push(id),
        }));

        h.instance.focus('a');
        sched.tick(0);
        expect(sched.active.size).toBe(1);
        sched.tick(100);

        expect(h.instance.focusId).toBe('a');
        expect(focused).toEqual(['a']);
        expect(sched.active.size).toBe(0);

        h.dispose();
    });

    test('click-to-focus works through the helper-mounted subtree', () => {
        const el = container();
        const sched = manualScheduler();
        const h = createHypertree(el, opts({ scheduler: sched }));

        h.instance._nodeEls.get('c').dispatchEvent(new Event('click', { bubbles: true }));
        sched.tick(0);
        sched.tick(100);

        expect(h.instance.focusId).toBe('c');

        h.dispose();
    });
});

// ── SVG-root recipe: helper-created vs caller-supplied ───────────────────────

describe('createHypertree — SVG-root recipe', () => {
    test('a plain container gets a namespace-correct <svg> sized to the layout', () => {
        const el = container();
        const h = createHypertree(el, opts({ radius: 400 }));

        expect(el.childNodes.length).toBe(1);
        expect(el.firstChild).toBe(h.root);
        expect(h.root.namespaceURI).toBe(SVG_NS);
        expect(h.root.tagName).toBe('svg');
        // viewBox == 2R × 2R, derived from the LIVE layout, not a duplicated default.
        expect(h.root.getAttribute('viewBox')).toBe('0 0 800 800');
        expect(h.root.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');

        h.dispose();
    });

    test('the default radius yields a matching viewBox (no hardcoded duplicate)', () => {
        const el = container();
        const h = createHypertree(el, opts());   // no explicit radius

        const r = h.instance.node('root').x;
        expect(h.root.getAttribute('viewBox')).toBe(`0 0 ${r * 2} ${r * 2}`);

        h.dispose();
    });

    test('a caller-supplied conformant SVG root is used AS-IS — never re-sized', () => {
        const root = svgRoot();
        const h = createHypertree(root, opts({ radius: 400 }));

        expect(h.root).toBe(root);
        expect(root.getAttribute('viewBox')).toBe('0 0 42 42');          // untouched
        expect(root.getAttribute('preserveAspectRatio')).toBeNull();      // untouched
        // The tree is built directly into it — no intermediate <svg>.
        expect(h.instance.el.parentNode).toBe(root);
        expect(root.childNodes.length).toBe(1);

        h.dispose();
    });

    test('a caller-supplied <g> is conformant too (SVG namespace, used as-is)', () => {
        const g = document.createElementNS(SVG_NS, 'g');
        const h = createHypertree(g, opts());

        expect(h.root).toBe(g);
        expect(h.instance.el.parentNode).toBe(g);

        h.dispose();
    });
});

// ── Verbatim option forwarding (no invented options) ─────────────────────────

describe('createHypertree — options are forwarded verbatim', () => {
    test('an explicit prefix reaches the real constructor', () => {
        const h = createHypertree(container(), opts({ prefix: 'my-tree' }));

        expect(h.instance.prefix).toBe('my-tree');
        expect(idsOf(h.instance.el).every((id) => id.startsWith('my-tree-'))).toBe(true);

        h.dispose();
    });

    test('onNodeClick / ignoreWhileFocusing reach the module unchanged', () => {
        const sched = manualScheduler();
        const seen = [];
        const h = createHypertree(container(), opts({
            scheduler: sched,
            ignoreWhileFocusing: true,
            onNodeClick: (id) => { seen.push(id); return false; },   // veto
        }));

        h.instance._nodeEls.get('b').dispatchEvent(new Event('click', { bubbles: true }));
        expect(seen).toEqual(['b']);
        expect(sched.active.size).toBe(0);       // the veto cancelled the focus
        expect(h.instance.focusId).toBe('root');

        h.dispose();
    });

    test('`tree` is stripped from the forwarded options (module sees its own shape)', () => {
        const h = createHypertree(container(), opts({ radius: 400 }));
        // A tree option leaking through would not change behaviour, but the
        // instance must be built from the POSITIONAL tree argument — proven by
        // the node set actually laid out.
        expect(h.instance.node('a1')).toBeDefined();
        expect(() => h.instance.node('nope')).toThrow('unknown node');

        h.dispose();
    });
});

// ── Argument / error handling ────────────────────────────────────────────────

describe('createHypertree — argument handling', () => {
    test('throws when rootEl or opts.tree is missing', () => {
        expect(() => createHypertree(null, opts())).toThrow('rootEl is required');
        expect(() => createHypertree(container(), {})).toThrow('opts.tree is required');
    });

    test('a constructor error propagates and removes the root the helper had inserted', () => {
        const el = container();
        const cyclic = { id: 'root', children: [{ id: 'x' }, { id: 'x' }] };

        expect(() => createHypertree(el, opts({ tree: cyclic }))).toThrow('cycle or duplicate id');
        expect(el.childNodes.length).toBe(0);   // no orphan <svg> left behind

        // The failed acquisition was released, so a valid call still works.
        const h = createHypertree(el, opts());
        expect(el.childNodes.length).toBe(1);
        h.dispose();
    });
});

// ── Two instances on one page: no id / DOM collision ─────────────────────────

describe('createHypertree — two instances never collide', () => {
    test('default-prefix trees mint distinct prefixes and disjoint DOM ids', () => {
        const a = createHypertree(container(), opts());
        const b = createHypertree(container(), opts());

        expect(a.instance.prefix).not.toBe(b.instance.prefix);

        const idsA = idsOf(a.instance.el);
        const idsB = idsOf(b.instance.el);
        expect(idsA.length).toBeGreaterThan(0);
        expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);

        a.dispose();
        b.dispose();
    });

    test('each tree focuses independently', () => {
        const schedA = manualScheduler();
        const a = createHypertree(container(), opts({ scheduler: schedA }));
        const b = createHypertree(container(), opts());

        a.instance.focus('c');
        schedA.tick(0);
        schedA.tick(100);

        expect(a.instance.focusId).toBe('c');
        expect(b.instance.focusId).toBe('root');

        a.dispose();
        b.dispose();
    });
});

// ── dispose: idempotent + residue-free ───────────────────────────────────────

describe('createHypertree — dispose', () => {
    test('leaves no DOM residue when the helper created the root', () => {
        const el = container();
        const h = createHypertree(el, opts());
        const built = h.instance.el;
        const root = h.root;

        h.dispose();

        expect(el.childNodes.length).toBe(0);
        expect(root.parentNode).toBeNull();
        expect(built.parentNode).toBeNull();
    });

    test('a caller-supplied root is kept but emptied of the tree', () => {
        const root = svgRoot();
        const h = createHypertree(root, opts());
        const built = h.instance.el;

        h.dispose();

        expect(root.childNodes.length).toBe(0);
        expect(built.parentNode).toBeNull();
        expect(root.getAttribute('viewBox')).toBe('0 0 42 42');   // still the caller's
    });

    test('removes the click listeners — a click after dispose focuses nothing', () => {
        const sched = manualScheduler();
        const h = createHypertree(container(), opts({ scheduler: sched }));
        const node = h.instance._nodeEls.get('a');

        h.dispose();
        node.dispatchEvent(new Event('click', { bubbles: true }));

        expect(sched.active.size).toBe(0);
        expect(h.instance.focusId).toBe('root');
    });

    test('cancels an in-flight focus — the scheduler holds nothing afterwards', () => {
        const sched = manualScheduler();
        const h = createHypertree(container(), opts({ scheduler: sched }));

        h.instance.focus('a');
        sched.tick(0);
        expect(sched.active.size).toBe(1);

        h.dispose();
        expect(sched.active.size).toBe(0);
        expect(h.instance.focusId).toBe('root');   // the superseded focus never settled
    });

    test('is idempotent — a second call is a no-op and never throws', () => {
        const el = container();
        const sched = manualScheduler();
        const h = createHypertree(el, opts({ scheduler: sched }));

        h.instance.focus('a');
        sched.tick(0);
        h.dispose();

        expect(() => h.dispose()).not.toThrow();
        expect(() => h.dispose()).not.toThrow();
        expect(el.childNodes.length).toBe(0);
    });
});

// ── Local runtime: shared while live, released with the last instance ────────

describe('createHypertree — local runtime lifecycle', () => {
    test('concurrent helpers share ONE resolved surface (one scheduler, one prefix counter)', () => {
        const a = createHypertree(container(), opts());
        const b = createHypertree(container(), opts());

        // Same resolved factory closure ⇒ same class identity.
        expect(b.instance.constructor).toBe(a.instance.constructor);

        a.dispose();
        b.dispose();
    });

    test('the runtime is released once the last instance is disposed', () => {
        const a = createHypertree(container(), opts());
        const ctor = a.instance.constructor;
        a.dispose();

        const b = createHypertree(container(), opts());
        expect(b.instance.constructor).not.toBe(ctor);   // rebuilt from scratch
        b.dispose();
    });
});
