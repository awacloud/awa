// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { sceneModule } from './scene.js';

// Resolve the scene descriptor transitively (pulls svgBuild + scopedIds +
// timeline + tween + scheduler + their own deps). Everything the tests touch
// comes from the SAME runtime the scene was wired with.
const runtime = new ModuleRuntime();
runtime.registerAllDeep([sceneModule]);
const { createScene } = runtime.resolve('graphic.scene');
const { Scheduler } = runtime.resolve('graphic.scheduler');
const sharedScheduler = runtime.resolve('graphic.scheduler').scheduler;

/** A scheduler with a no-op schedule so tests drive frames manually via tick(). */
function manualScheduler() {
    return new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
}

/** A minimal one-rect scene spec with a single `refs` entry named "box". */
function boxSpec(extra) {
    return {
        template: { tag: 'rect', attrs: { id: 'box', x: 0, width: 10 } },
        refs: { box: 'box' },
        events: {
            grow: {
                at: 'box',
                animations: [{ property: 'width', from: 10, to: 100, duration: 1000 }],
            },
        },
        ...extra,
    };
}

// ── createScene: scoped root, disjoint ids across instances ──────────────────

describe('createScene — scoped root', () => {
    test('builds the SVG root via svgBuild with a scoped id', () => {
        const scene = createScene(boxSpec());
        expect(scene.root.tagName).toBe('rect');
        // Default prefix is a DISTINCT `scene-<n>` (GAPS #3, BATCH_16) — assert
        // the FORMAT, never an absolute index (the factory-scope counter is
        // shared by every default-constructed scene in this file's runtime).
        expect(scene.root.getAttribute('id')).toMatch(/^scene-\d+-box-0$/);
    });

    test('an explicit prefix is used verbatim, the empty string included', () => {
        expect(createScene(boxSpec({ prefix: 'card' }))._scope.prefix).toBe('card');
        expect(createScene(boxSpec({ prefix: '' }))._scope.prefix).toBe('');
        expect(createScene(boxSpec())._scope.prefix).toMatch(/^scene-\d+$/);
    });

    test('two scenes with distinct prefixes mint disjoint ids — no collision in one document', () => {
        const a = createScene(boxSpec({ prefix: 'a' }));
        const b = createScene(boxSpec({ prefix: 'b' }));
        expect(a.root.getAttribute('id')).toBe('a-box-0');
        expect(b.root.getAttribute('id')).toBe('b-box-0');
        expect(a.root.getAttribute('id')).not.toBe(b.root.getAttribute('id'));
        expect(a.root).not.toBe(b.root); // disjoint DOM nodes too
        // Both attach cleanly to the same document without id clashes.
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.appendChild(a.root);
        svg.appendChild(b.root);
        expect(svg.childNodes.length).toBe(2);
    });

    test('two scenes from the identical DEFAULT-prefix spec mint disjoint ids (GAPS #3)', () => {
        const a = createScene(boxSpec());
        const b = createScene(boxSpec());
        // Historical collision (GAPS #3): both defaulted to the bare 'scene'
        // prefix and each scope restarted its counter at 0, so both roots got
        // the identical string 'scene-box-0' — a document-wide DOM id clash for
        // any host embedding two default-constructed scenes. The default prefix
        // now carries a distinct per-instance index.
        expect(a._scope.prefix).not.toBe(b._scope.prefix);
        expect(a.root.getAttribute('id')).not.toBe(b.root.getAttribute('id'));
        expect(a.root.getAttribute('id')).toMatch(/^scene-\d+-box-0$/);
        expect(b.root.getAttribute('id')).toMatch(/^scene-\d+-box-0$/);
        expect(a.root).not.toBe(b.root);
        expect(a._scope).not.toBe(b._scope);

        // Both attach to ONE document with a duplicate-free id union.
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.appendChild(a.root);
        svg.appendChild(b.root);
        const ids = [a.root.getAttribute('id'), b.root.getAttribute('id')];
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('an explicit prefix bypasses the default counter (byte-identical mints)', () => {
        // Interleaved default constructions must not shift an explicit scope's
        // minted strings by a single byte.
        createScene(boxSpec());
        const a = createScene(boxSpec({ prefix: 'fixed' }));
        createScene(boxSpec());
        const b = createScene(boxSpec({ prefix: 'fixed' }));
        expect(a.root.getAttribute('id')).toBe('fixed-box-0');
        expect(b.root.getAttribute('id')).toBe('fixed-box-0');
    });
});

// ── scene.el(name): reference-bound element, target of a tween write ─────────

describe('scene.el', () => {
    test('resolves a refs name to the built element', () => {
        const scene = createScene(boxSpec());
        expect(scene.el('box')).toBe(scene.root);
    });

    test('a tween writes to the ref-bound node (assert via the built element attribute)', () => {
        const scene = createScene(boxSpec());
        const target = scene.el('box');
        const s = manualScheduler();
        const tl = scene.on('grow');
        // Rebind the compiled timeline onto a manual scheduler for deterministic driving.
        tl._scheduler = s;
        for (const c of tl._children) c.tween._scheduler = s;
        tl.play();
        s.tick(0);
        expect(target.getAttribute('width')).toBe('10');
        s.tick(1000);
        expect(target.getAttribute('width')).toBe('100');
        expect(tl.done).toBe(true);
    });

    test('unknown ref throws the exact message', () => {
        const scene = createScene(boxSpec());
        expect(() => scene.el('nope')).toThrow('scene: unknown ref "nope"');
    });
});

// ── scene.on / scene.fire: fresh Timeline on the shared scheduler ────────────

describe('scene.on', () => {
    test('returns a fresh Timeline that does NOT auto-play', () => {
        const scene = createScene(boxSpec());
        const tl = scene.on('grow');
        expect(tl.done).toBe(false);
        expect(sharedScheduler.active.has(tl)).toBe(false);
    });

    test('unknown event throws the exact message', () => {
        const scene = createScene(boxSpec());
        expect(() => scene.on('missing')).toThrow('scene: unknown event "missing"');
        expect(() => scene.fire('missing')).toThrow('scene: unknown event "missing"');
    });
});

describe('scene.fire', () => {
    test('fires a playing Timeline on the shared scheduler; driving frames advances + completes', () => {
        const scene = createScene(boxSpec());
        const tl = scene.fire('grow');
        expect(sharedScheduler.active.has(tl)).toBe(true);
        sharedScheduler.tick(0);
        expect(tl.done).toBe(false);
        sharedScheduler.tick(1000);
        expect(tl.done).toBe(true);
        expect(sharedScheduler.active.has(tl)).toBe(false);
    });
});

// ── mode: sequence | parallel | stagger ───────────────────────────────────────

describe('EventSpec.mode', () => {
    function twoAnimSpec(mode, stepMs) {
        return {
            template: {
                tag: 'g',
                children: [
                    { tag: 'rect', attrs: { id: 'a', x: 0 } },
                    { tag: 'rect', attrs: { id: 'b', x: 0 } },
                ],
            },
            refs: { a: 'a', b: 'b' },
            events: {
                go: {
                    at: 'a',
                    mode,
                    stepMs,
                    animations: [
                        { target: 'a', property: 'x', from: 0, to: 10, duration: 200 },
                        { target: 'b', property: 'x', from: 0, to: 10, duration: 200 },
                    ],
                },
            },
        };
    }

    test('sequence maps to Timeline.sequence (B starts after A ends)', () => {
        const scene = createScene(twoAnimSpec('sequence'));
        const s = manualScheduler();
        const tl = scene.on('go');
        tl._scheduler = s;
        for (const c of tl._children) c.tween._scheduler = s;
        tl.play();
        s.tick(0);
        expect(tl._children[0].offset).toBe(0);
        expect(tl._children[1].offset).toBe(200);
    });

    test('parallel maps to Timeline.parallel (both offset 0)', () => {
        const scene = createScene(twoAnimSpec('parallel'));
        const tl = scene.on('go');
        expect(tl._children.every((c) => c.offset === 0)).toBe(true);
    });

    test('stagger(stepMs) maps to Timeline.stagger', () => {
        const scene = createScene(twoAnimSpec('stagger', 50));
        const tl = scene.on('go');
        expect(tl._children[0].offset).toBe(0);
        expect(tl._children[1].offset).toBe(50);
    });

    test('mode defaults to parallel when omitted', () => {
        const scene = createScene(twoAnimSpec(undefined));
        const tl = scene.on('go');
        expect(tl._children.every((c) => c.offset === 0)).toBe(true);
    });
});

// ── loop: re-fire on completion ───────────────────────────────────────────────

describe('EventSpec.loop', () => {
    test('re-fires on completion, driven for N cycles with an injected clock', () => {
        const r = new ModuleRuntime();
        r.registerAllDeep([sceneModule]);
        const { createScene: createLoopScene } = r.resolve('graphic.scene');
        const { Scheduler: LoopScheduler } = r.resolve('graphic.scheduler');
        const s = new LoopScheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });

        const spec = {
            template: { tag: 'rect', attrs: { id: 'box', x: 0 } },
            refs: { box: 'box' },
            events: {
                pulse: {
                    at: 'box',
                    loop: true,
                    animations: [{ property: 'x', from: 0, to: 10, duration: 100 }],
                },
            },
        };
        const scene = createLoopScene(spec);
        const target = scene.el('box');
        const tl = scene.on('pulse');
        tl._scheduler = s;
        for (const c of tl._children) c.tween._scheduler = s;
        tl.play();

        // Cycle 1: drives 0 -> 100ms, completes, onComplete re-fires (on the
        // SHARED scheduler by default — this test only asserts value + done on
        // the manually driven first cycle).
        s.tick(0);
        s.tick(100);
        expect(target.getAttribute('x')).toBe('10');
        expect(tl.done).toBe(true);
    });

    test('loop re-fire registers the next cycle on the shared scheduler (single-scheduler invariant)', () => {
        const scene = createScene({
            template: { tag: 'rect', attrs: { id: 'box', x: 0 } },
            refs: { box: 'box' },
            events: {
                pulse: {
                    at: 'box',
                    loop: true,
                    animations: [{ property: 'x', from: 0, to: 10, duration: 50 }],
                },
            },
        });
        const tl1 = scene.fire('pulse');
        expect(sharedScheduler.active.has(tl1)).toBe(true);
        sharedScheduler.tick(0);
        sharedScheduler.tick(50); // completes → onComplete re-fires
        expect(tl1.done).toBe(true);
        expect(sharedScheduler.active.has(tl1)).toBe(false);
        // A NEW timeline for the same event is now active (re-fired), still on
        // the shared scheduler — no second scheduler was created.
        expect(sharedScheduler.active.size).toBe(1);
    });
});

// ── Single-scheduler invariant across multiple fired events ──────────────────

describe('single-scheduler invariant', () => {
    test('firing multiple events creates no second scheduler — all register on scheduler.scheduler', () => {
        // Isolated runtime (own shared scheduler singleton) so this assertion is
        // not affected by other tests' timelines left active on the module-level
        // shared scheduler (e.g. a still-looping timeline from another test).
        const r = new ModuleRuntime();
        r.registerAllDeep([sceneModule]);
        const { createScene: createIsolatedScene } = r.resolve('graphic.scene');
        const isolatedShared = r.resolve('graphic.scheduler').scheduler;

        const scene = createIsolatedScene({
            template: {
                tag: 'g',
                children: [
                    { tag: 'rect', attrs: { id: 'a', x: 0 } },
                    { tag: 'rect', attrs: { id: 'b', x: 0 } },
                ],
            },
            refs: { a: 'a', b: 'b' },
            events: {
                ea: { at: 'a', animations: [{ property: 'x', from: 0, to: 10, duration: 100 }] },
                eb: { at: 'b', animations: [{ property: 'x', from: 0, to: 10, duration: 100 }] },
            },
        });
        const t1 = scene.fire('ea');
        const t2 = scene.fire('eb');
        expect(isolatedShared.active.has(t1)).toBe(true);
        expect(isolatedShared.active.has(t2)).toBe(true);
        // Exactly the two timelines are active — no children registered directly,
        // and no alternate scheduler instance was ever constructed by the scene.
        expect(isolatedShared.active.size).toBe(2);
    });
});

// ── Lifecycle: stop / dispose, and a loop that stays stoppable ───────────────

describe('Scene lifecycle', () => {
    /** An isolated runtime: its own shared scheduler, driven by tick(). */
    function isolated() {
        const r = new ModuleRuntime();
        r.registerAllDeep([sceneModule]);
        return { createScene: r.resolve('graphic.scene').createScene, shared: r.resolve('graphic.scheduler').scheduler };
    }
    const loopSpec = () => ({
        template: { tag: 'g', children: [{ tag: 'rect', attrs: { id: 'box', x: 0 } }, { tag: 'rect', attrs: { id: 'dot', x: 0 } }] },
        refs: { box: 'box', dot: 'dot' },
        events: {
            pulse: { at: 'box', loop: true, animations: [{ property: 'x', from: 0, to: 10, duration: 50 }] },
            blink: { at: 'dot', loop: true, animations: [{ property: 'x', from: 0, to: 5, duration: 50 }] },
        },
    });

    test('stop(name) ends a loop even after it re-fired a cycle the caller never held', () => {
        const { createScene: make, shared } = isolated();
        const scene = make(loopSpec());
        const tl1 = scene.fire('pulse');
        shared.tick(0);
        shared.tick(50); // cycle 1 completes → re-fired
        expect(tl1.done).toBe(true);
        expect(shared.active.size).toBe(1);
        scene.stop('pulse');
        expect(shared.active.size).toBe(0);
        shared.tick(100);
        shared.tick(200);
        expect(shared.active.size).toBe(0);
    });

    test('stop() without a name ends every event; a later fire restarts the loop', () => {
        const { createScene: make, shared } = isolated();
        const scene = make(loopSpec());
        scene.fire('pulse');
        scene.fire('blink');
        expect(shared.active.size).toBe(2);
        scene.stop();
        expect(shared.active.size).toBe(0);
        scene.fire('pulse');
        shared.tick(0);
        shared.tick(50); // re-fires: the loop runs again
        expect(shared.active.size).toBe(1);
        scene.stop('pulse');
        expect(shared.active.size).toBe(0);
    });

    test('a timeline from on() stays the caller\'s, but its loop continuation obeys stop(name)', () => {
        const { createScene: make, shared } = isolated();
        const scene = make(loopSpec());
        const tl = scene.on('pulse');
        tl.play();
        shared.tick(0);
        scene.stop('pulse');
        expect(shared.active.has(tl)).toBe(true); // not the scene's to stop
        shared.tick(50); // the caller's cycle completes: no re-fire
        expect(tl.done).toBe(true);
        expect(shared.active.size).toBe(0);
    });

    test('dispose() stops everything, detaches root, is idempotent; on/fire then throw', () => {
        const { createScene: make, shared } = isolated();
        const scene = make(loopSpec());
        const parent = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        parent.appendChild(scene.root);
        scene.fire('pulse');
        scene.fire('blink');
        scene.dispose();
        expect(shared.active.size).toBe(0);
        expect(scene.root.parentNode).toBeNull();
        expect(() => scene.dispose()).not.toThrow();
        expect(() => scene.fire('pulse')).toThrow('scene: disposed');
        expect(() => scene.on('pulse')).toThrow('scene: disposed');
    });
});
