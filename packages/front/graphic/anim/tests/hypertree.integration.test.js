// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — `graphic.hypertree`: build + render + animated
 * focus on happy-dom. Covers the descriptor shape, DISTINCT per-instance
 * scoped-ids prefix (BATCH_4 collision lesson), node/link build counts, the focus
 * seam (writes ONLY through `svgApply.svgAttr`, no per-tick `getElementById`, no
 * 2nd rAF/scheduler leak), `focusSync` recenter, `focus()` real-timeline
 * convergence to the `focusSync` end-state, click-to-focus, and a clean
 * `dispose()`.
 *
 * happy-dom registers the DOM globals the resolved fw `dom` writer needs — the
 * `NodeList` global is referenced at first TICK (W2 lesson), so it MUST be
 * registered at the top of the file.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { hypertreeModule } from '../src/hypertree/hypertree.js';

// Resolve transitively (pulls svgBuild/scopedIds/timeline/tween/svgApply/
// scheduler + the injected pure kernels hypertree.layout/measure, and fw
// dom/secPolicy via deps).
const runtime = new ModuleRuntime();
runtime.registerDeep(hypertreeModule);
const { Hypertree, hypertree } = runtime.resolve('graphic.hypertree');
const { Scheduler } = runtime.resolve('graphic.scheduler');
const { SVG_NS } = runtime.resolve('graphic.svgApply');

/** A manual-clock scheduler so timelines register HERE, never on the shared singleton. */
function manualScheduler() {
    return new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
}

function svgRoot() {
    return document.createElementNS(SVG_NS, 'svg');
}

/** root(3) → a(2: a1,a2), b(1: b1), c(leaf) — 7 nodes, 6 edges. */
function sampleTree() {
    return {
        id: 'root',
        label: 'Root',
        children: [
            { id: 'a', label: 'Alpha', children: [{ id: 'a1' }, { id: 'a2' }] },
            { id: 'b', children: [{ id: 'b1' }] },
            { id: 'c' },
        ],
    };
}

function makeTree(extra) {
    return new Hypertree(svgRoot(), sampleTree(), { duration: 100, ...extra });
}

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('hypertreeModule descriptor', () => {
    test('has the frozen name / type / version', () => {
        expect(hypertreeModule.name).toBe('graphic.hypertree');
        expect(hypertreeModule.type).toBe('fw.dom.graphic');
        expect(hypertreeModule.version).toBe('0.1.0');
    });

    test('dependencies are the topo tuple (5 engine + scheduler + 2 pure kernels)', () => {
        expect(hypertreeModule.dependencies).toEqual([
            'graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline',
            'graphic.tween', 'graphic.svgApply', 'graphic.scheduler',
            'hypertree.layout', 'hypertree.measure',
        ]);
    });

    test('deps mirror dependencies in the same order', () => {
        expect(hypertreeModule.deps.map((d) => d.name)).toEqual(hypertreeModule.dependencies);
    });

    test('factory returns { Hypertree, hypertree }', () => {
        expect(typeof Hypertree).toBe('function');
        expect(typeof hypertree).toBe('function');
    });
});

// ── Construction / build ─────────────────────────────────────────────────────

describe('Hypertree construction + render', () => {
    test('throws without svgRoot or a tree id', () => {
        expect(() => new Hypertree(null, sampleTree())).toThrow('svgRoot is required');
        expect(() => new Hypertree(svgRoot(), { children: [] })).toThrow('must have an id');
    });

    test('throws on a cyclic tree (via the layout kernel)', () => {
        const dup = { id: 'root', children: [{ id: 'x' }, { id: 'x' }] };
        expect(() => new Hypertree(svgRoot(), dup)).toThrow('cycle or duplicate id');
    });

    test('builds a namespace-correct <g> tree appended to svgRoot', () => {
        const host = svgRoot();
        const t = new Hypertree(host, sampleTree(), { duration: 100 });
        expect(t.el.namespaceURI).toBe(SVG_NS);
        expect(t.el.tagName).toBe('g');
        expect(host.contains(t.el)).toBe(true);
        expect(t.rootId).toBe('root');
    });

    test('one node group per node, one link path per edge', () => {
        const t = makeTree();
        expect(t._nodeEls.size).toBe(7);
        expect(t._linkEls.size).toBe(6);
        for (const el of t._nodeEls.values()) expect(el.tagName).toBe('g');
        for (const el of t._linkEls.values()) expect(el.tagName).toBe('path');
    });

    test('the root starts centred; node() exposes read-only positioned data', () => {
        const t = makeTree();
        const root = t.node('root');
        expect(root.x).toBe(t._center);
        expect(root.y).toBe(t._center);
        expect(root.depth).toBe(0);
        expect(() => t.node('zzz')).toThrow('unknown node');
    });
});

// ── Distinct per-instance prefix (BATCH_4 collision lesson) ───────────────────

describe('distinct scopedIds prefix per instance', () => {
    test('two default-prefix trees mint distinct prefixes → no id collision', () => {
        const t1 = makeTree();
        const t2 = makeTree();
        expect(t1.prefix).not.toBe(t2.prefix);
        const id1 = t1._nodeEls.get('root').getAttribute('id');
        const id2 = t2._nodeEls.get('root').getAttribute('id');
        expect(id1).not.toBe(id2);
    });

    test('ids use the instance prefix', () => {
        const t = makeTree({ prefix: 'my-tree' });
        expect(t.prefix).toBe('my-tree');
        expect(t._nodeEls.get('a1').getAttribute('id')).toContain('my-tree');
    });
});

// ── Focus seam: svgApply-only writes, no getElementById, no 2nd rAF ───────────

describe('focus seam on the shared scheduler', () => {
    /** Build a Hypertree whose svgApply is a spy delegating to the real writer. */
    function spyTree(sched) {
        const svgBuild = runtime.resolve('graphic.svgBuild');
        const scopedIds = runtime.resolve('graphic.scopedIds');
        const timelineMod = runtime.resolve('graphic.timeline');
        const tweenMod = runtime.resolve('graphic.tween');
        const realApply = runtime.resolve('graphic.svgApply');
        const schedulerMod = runtime.resolve('graphic.scheduler');
        const layoutApi = runtime.resolve('hypertree.layout');
        const measureApi = runtime.resolve('hypertree.measure');

        const writes = [];
        const spyApply = {
            SVG_NS: realApply.SVG_NS,
            svgAttr(target, name, value) {
                writes.push({ target, name, value });
                return realApply.svgAttr(target, name, value);
            },
        };
        const api = hypertreeModule.factory(
            svgBuild, scopedIds, timelineMod, tweenMod, spyApply, schedulerMod, layoutApi, measureApi,
        );
        const t = new api.Hypertree(svgRoot(), sampleTree(), { duration: 100, scheduler: sched });
        return { t, writes };
    }

    test('focus writes route ONLY through svgApply.svgAttr; positions actually change', () => {
        const sched = manualScheduler();
        const { t, writes } = spyTree(sched);
        t.focus('a1');
        writes.length = 0;
        sched.tick(0);
        const at0 = t._nodeEls.get('a1').getAttribute('transform');
        sched.tick(50);
        const atMid = t._nodeEls.get('a1').getAttribute('transform');
        // every write of this frame targeted a bound node group or link path
        expect(writes.length).toBeGreaterThan(0);
        for (const w of writes) expect(w.name === 'transform' || w.name === 'd').toBe(true);
        expect(atMid).not.toBe(at0);
    });

    test('the timeline registers on the injected scheduler — no 2nd rAF/leak', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched });
        t.focus('a1');
        expect(sched.active.size).toBe(1);
        sched.tick(0);
        sched.tick(100);
        expect(sched.active.size).toBe(0);
    });

    test('no getElementById in the tick path (targets bound by reference)', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched });
        const orig = document.getElementById;
        let calls = 0;
        document.getElementById = function (...a) { calls += 1; return orig.apply(this, a); };
        try {
            t.focus('a1');
            sched.tick(0); sched.tick(50); sched.tick(100);
        } finally {
            document.getElementById = orig;
        }
        expect(calls).toBe(0);
    });
});

// ── focusSync + focus() convergence ───────────────────────────────────────────

describe('focusSync + animated focus convergence', () => {
    /** Snapshot every node group's transform attribute, keyed by node id. */
    function transforms(t) {
        const out = {};
        for (const [id, el] of t._nodeEls) out[id] = el.getAttribute('transform');
        return out;
    }

    test('focusSync recenters immediately (no scheduler activity)', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched });
        t.focusSync('a1');
        expect(sched.active.size).toBe(0);
        const a1 = t.node('a1');
        expect(a1.x).toBeCloseTo(t._center, 6);
        expect(a1.y).toBeCloseTo(t._center, 6);
        expect(t.focusId).toBe('a1');
    });

    test('focus() driven to completion equals focusSync() end-state', () => {
        const schedA = manualScheduler();
        const animated = makeTree({ scheduler: schedA });
        const tl = animated.focus('b1');
        expect(tl).toBeTruthy();
        schedA.tick(0);
        schedA.tick(100); // completes
        const animatedTransforms = transforms(animated);

        const sync = makeTree({ scheduler: manualScheduler() });
        sync.focusSync('b1');
        const syncTransforms = transforms(sync);

        expect(animatedTransforms).toEqual(syncTransforms);
        expect(animated.focusId).toBe('b1');
    });

    test('onFocus fires with the focused id on completion', () => {
        const sched = manualScheduler();
        const seen = [];
        const t = new Hypertree(svgRoot(), sampleTree(), {
            duration: 100, scheduler: sched, onFocus: (id) => seen.push(id),
        });
        t.focus('c');
        expect(seen).toEqual([]);      // not yet — animation in flight
        sched.tick(0);
        sched.tick(100);
        expect(seen).toEqual(['c']);
    });
});

// ── Click-to-focus + dispose ──────────────────────────────────────────────────

describe('click-to-focus + dispose', () => {
    test('clicking a node group starts a focus transition', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched });
        t._nodeEls.get('a1').dispatchEvent(new Event('click', { bubbles: true }));
        expect(sched.active.size).toBe(1);
        sched.tick(0);
        sched.tick(100);
        expect(t.focusId).toBe('a1');
    });

    test('dispose() unregisters in-flight timelines (scheduler left clean)', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched });
        t.focus('a1');
        expect(sched.active.size).toBe(1);
        t.dispose();
        expect(sched.active.size).toBe(0);
    });

    test('dispose() removes click listeners (no focus after disposal)', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched });
        t.dispose();
        t._nodeEls.get('a1').dispatchEvent(new Event('click', { bubbles: true }));
        expect(sched.active.size).toBe(0);
    });
});
