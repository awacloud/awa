// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { framesModule } from './frames.js';

// Resolve the frames descriptor transitively (pulls scheduler + svgApply, and
// fw dom/secPolicy via deps). Resolved surfaces come from the same runtime so
// tests use the very values the factory was wired with.
const runtime = new ModuleRuntime();
runtime.registerDeep(framesModule);
const { Frames, frames } = runtime.resolve('graphic.frames');
const { Scheduler, scheduler: shared } = runtime.resolve('graphic.scheduler');
const { SVG_NS } = runtime.resolve('graphic.svgApply');

/**
 * A scheduler with a no-op schedule so we drive frames manually via tick().
 * Pass it as `opts.scheduler` so `play()` registers on THIS instance, never on
 * the shared singleton (no cross-test leakage).
 */
function manualScheduler() {
    return new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
}

/** N discrete frame elements as plain spy objects (attribute recorders). */
function makeFrameEls(n) {
    return Array.from({ length: n }, () => {
        const attrs = {};
        return { attrs, setAttribute(k, v) { this.attrs[k] = v; } };
    });
}

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('framesModule descriptor', () => {
    test('has the frozen name / type / version', () => {
        expect(framesModule.name).toBe('graphic.frames');
        expect(framesModule.type).toBe('fw.dom.graphic');
        expect(framesModule.version).toBe('0.1.0');
    });

    test('dependencies are exactly the frozen tuple in order', () => {
        expect(framesModule.dependencies).toEqual(['graphic.scheduler', 'graphic.svgApply']);
    });

    test('deps mirror dependencies in the same order', () => {
        expect(framesModule.deps.map(d => d.name)).toEqual(framesModule.dependencies);
    });

    test('factory returns { Frames, frames }', () => {
        const api = framesModule.factory(
            runtime.resolve('graphic.scheduler'),
            runtime.resolve('graphic.svgApply'),
        );
        expect(typeof api.Frames).toBe('function');
        expect(typeof api.frames).toBe('function');
    });
});

// ── Construction / errors / state ────────────────────────────────────────────

describe('Frames construction', () => {
    test('throws when neither frames nor sprite is given', () => {
        expect(() => new Frames({})).toThrow('Frames: frames or sprite is required');
    });

    test('throws when frames is empty', () => {
        expect(() => new Frames({ frames: [] })).toThrow('Frames: frames must not be empty');
    });

    test('throws when frames and sprite are both given', () => {
        expect(() => new Frames({ frames: makeFrameEls(2), sprite: { target: {}, cols: 1, rows: 1, frameW: 1, frameH: 1 } }))
            .toThrow('mutually exclusive');
    });

    test('discrete frameCount = frames.length; defaults fps/loop/pingPong', () => {
        const f = new Frames({ frames: makeFrameEls(4) });
        expect(f.frameCount).toBe(4);
        expect(f.fps).toBe(12);
        expect(f.loop).toBe(true);
        expect(f.pingPong).toBe(false);
        expect(f.frame).toBe(0);
        expect(f.playing).toBe(false);
        expect(f.done).toBe(false);
    });

    test('sprite frameCount = cols * rows', () => {
        const f = new Frames({ sprite: { target: { setAttribute() {} }, cols: 3, rows: 2, frameW: 10, frameH: 10 } });
        expect(f.frameCount).toBe(6);
    });

    test('fps <= 0 is coerced to the positive default', () => {
        expect(new Frames({ frames: makeFrameEls(2), fps: 0 }).fps).toBe(12);
        expect(new Frames({ frames: makeFrameEls(2), fps: -5 }).fps).toBe(12);
    });

    test('binds discrete targets by reference', () => {
        const els = makeFrameEls(3);
        const f = new Frames({ frames: els });
        expect(f._frames).toBe(els);
        expect(f._frames[0]).toBe(els[0]);
    });
});

// ── Injected-clock timing ────────────────────────────────────────────────────

describe('Frames timing (injected clock)', () => {
    test('index advances at floor(elapsed*fps/1000), applying only on change', () => {
        const s = manualScheduler();
        const seen = [];
        // fps 10 → one frame per 100 ms.
        const f = new Frames({
            frames: makeFrameEls(5), fps: 10, loop: false,
            apply: (i) => seen.push(i), scheduler: s,
        });
        f.play();
        s.tick(0);    // raw 0 → frame 0
        s.tick(50);   // raw 0 → no change
        s.tick(100);  // raw 1 → frame 1
        s.tick(150);  // raw 1 → no change
        s.tick(250);  // raw 2 → frame 2
        expect(seen).toEqual([0, 1, 2]);
        expect(f.frame).toBe(2);
    });

    test('start time is fixed on the first tick, not on play()', () => {
        const s = manualScheduler();
        const seen = [];
        const f = new Frames({ frames: makeFrameEls(4), fps: 10, loop: false, apply: (i) => seen.push(i), scheduler: s });
        f.play();
        s.tick(1000); // first tick → elapsed measured from here
        s.tick(1100); // +100 ms → frame 1
        expect(seen).toEqual([0, 1]);
    });
});

// ── loop / pingPong ──────────────────────────────────────────────────────────

describe('Frames loop / pingPong', () => {
    test('loop wraps last→first over ≥2 cycles', () => {
        const s = manualScheduler();
        const seen = [];
        const f = new Frames({ frames: makeFrameEls(3), fps: 10, loop: true, apply: (i) => seen.push(i), scheduler: s });
        f.play();
        for (let t = 0; t <= 700; t += 100) s.tick(t);
        // raw 0..7 over 3 frames → 0,1,2,0,1,2,0,1
        expect(seen).toEqual([0, 1, 2, 0, 1, 2, 0, 1]);
        expect(f.done).toBe(false);
    });

    test('pingPong bounces 0..N-1..1 with no duplicate endpoints', () => {
        const s = manualScheduler();
        const seen = [];
        const f = new Frames({ frames: makeFrameEls(3), fps: 10, loop: true, pingPong: true, apply: (i) => seen.push(i), scheduler: s });
        f.play();
        for (let t = 0; t <= 800; t += 100) s.tick(t);
        // period = 4 → 0,1,2,1,0,1,2,1,0
        expect(seen).toEqual([0, 1, 2, 1, 0, 1, 2, 1, 0]);
    });

    test('non-loop pingPong ends after the full bounce', () => {
        const s = manualScheduler();
        const seen = [];
        let completed = 0;
        const f = new Frames({
            frames: makeFrameEls(3), fps: 10, loop: false, pingPong: true,
            apply: (i) => seen.push(i), onComplete: () => { completed += 1; }, scheduler: s,
        });
        f.play();
        for (let t = 0; t <= 600; t += 100) s.tick(t);
        // last position = 2*(3-1) = 4 → 0,1,2,1,0 then done
        expect(seen).toEqual([0, 1, 2, 1, 0]);
        expect(f.done).toBe(true);
        expect(completed).toBe(1);
    });
});

// ── seek ─────────────────────────────────────────────────────────────────────

describe('Frames#seek', () => {
    test('clamps, applies immediately, fires onFrame, does NOT auto-play', () => {
        const s = manualScheduler();
        const seen = [];
        const onFrame = [];
        const f = new Frames({
            frames: makeFrameEls(4), apply: (i) => seen.push(i),
            onFrame: (i) => onFrame.push(i), scheduler: s,
        });
        f.seek(2);
        expect(seen).toEqual([2]);
        expect(onFrame).toEqual([2]);
        expect(f.frame).toBe(2);
        expect(s.active.has(f)).toBe(false); // no auto-play
    });

    test('seek clamps out-of-range (no throw)', () => {
        const f = new Frames({ frames: makeFrameEls(3), apply: () => {} });
        f.seek(99);
        expect(f.frame).toBe(2);
        f.seek(-4);
        expect(f.frame).toBe(0);
    });
});

// ── play / pause ─────────────────────────────────────────────────────────────

describe('Frames play / pause', () => {
    test('play registers; pause removes and freezes at the current frame', () => {
        const s = manualScheduler();
        const f = new Frames({ frames: makeFrameEls(5), fps: 10, loop: false, scheduler: s });
        f.play();
        expect(s.active.has(f)).toBe(true);
        expect(f.playing).toBe(true);
        s.tick(0);
        s.tick(200); // frame 2
        f.pause();
        expect(s.active.has(f)).toBe(false);
        expect(f.playing).toBe(false);
        expect(f.frame).toBe(2);
    });

    test('resume after pause re-registers and continues stepping', () => {
        const s = manualScheduler();
        const seen = [];
        const f = new Frames({ frames: makeFrameEls(5), fps: 10, loop: false, apply: (i) => seen.push(i), scheduler: s });
        f.play();
        s.tick(0);
        s.tick(100); // frame 1
        f.pause();
        f.play();
        expect(s.active.has(f)).toBe(true);
        s.tick(500); // restarts timing → frame 0 again from this boundary
        s.tick(600); // +100 → frame 1
        expect(seen).toContain(1);
        expect(f.playing).toBe(true);
    });
});

// ── onFrame / onComplete ─────────────────────────────────────────────────────

describe('Frames callbacks', () => {
    test('onFrame fires with the correct index on change only', () => {
        const s = manualScheduler();
        const idx = [];
        const f = new Frames({ frames: makeFrameEls(4), fps: 10, loop: false, onFrame: (i) => idx.push(i), scheduler: s });
        f.play();
        s.tick(0);
        s.tick(50);  // no change
        s.tick(100); // 1
        s.tick(200); // 2
        expect(idx).toEqual([0, 1, 2]);
    });

    test('onComplete fires once at the non-looping end; never when loop:true', () => {
        const s = manualScheduler();
        let done = 0;
        const f = new Frames({ frames: makeFrameEls(3), fps: 10, loop: false, onComplete: () => { done += 1; }, scheduler: s });
        f.play();
        s.tick(0);
        s.tick(100);
        s.tick(200); // frame 2 = last → done
        s.tick(300); // already done — no re-fire
        expect(done).toBe(1);
        expect(f.done).toBe(true);
        expect(s.active.has(f)).toBe(false);

        const looped = new Frames({ frames: makeFrameEls(3), fps: 10, loop: true, onComplete: () => { throw new Error('must not fire'); }, scheduler: s });
        looped.play();
        for (let t = 0; t <= 1000; t += 100) s.tick(t);
        expect(looped.done).toBe(false);
    });
});

// ── Default writers: discrete + sprite ───────────────────────────────────────

describe('Frames default writers', () => {
    test('discrete default shows frame i (display:inline) and hides the rest', () => {
        const s = manualScheduler();
        const els = makeFrameEls(3);
        const f = new Frames({ frames: els, fps: 10, loop: false, scheduler: s });
        f.play();
        s.tick(0); // frame 0 shown
        expect(els[0].attrs.display).toBe('inline');
        expect(els[1].attrs.display).toBe('none');
        expect(els[2].attrs.display).toBe('none');
        s.tick(100); // frame 1 shown
        expect(els[0].attrs.display).toBe('none');
        expect(els[1].attrs.display).toBe('inline');
    });

    test('sprite default retargets viewBox to the window of frame i (row-major)', () => {
        const s = manualScheduler();
        const target = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
        const f = new Frames({
            sprite: { target, cols: 2, rows: 2, frameW: 10, frameH: 20 },
            fps: 10, loop: false, scheduler: s,
        });
        f.play();
        s.tick(0);   // frame 0 → col0,row0
        expect(target.attrs.viewBox).toBe('0 0 10 20');
        s.tick(100); // frame 1 → col1,row0
        expect(target.attrs.viewBox).toBe('10 0 10 20');
        s.tick(200); // frame 2 → col0,row1
        expect(target.attrs.viewBox).toBe('0 20 10 20');
    });

    test('default writers route through a real Happy-DOM element', () => {
        const s = manualScheduler();
        const rect = document.createElementNS(SVG_NS, 'rect');
        const f = new Frames({
            sprite: { target: rect, cols: 2, rows: 1, frameW: 5, frameH: 5 },
            fps: 10, loop: false, scheduler: s,
        });
        f.play();
        s.tick(0);
        expect(rect.getAttribute('viewBox')).toBe('0 0 5 5');
    });
});

// ── Reference-bound: no per-tick DOM query ───────────────────────────────────

describe('Frames reference-bound', () => {
    test('the writer receives the bound targets — no DOM query on the step path', () => {
        const s = manualScheduler();
        const els = makeFrameEls(3);
        let receivedFrames = null;
        const f = new Frames({
            frames: els, fps: 10, loop: false,
            apply: (_i, api) => { receivedFrames = api.frames; }, scheduler: s,
        });
        f.play();
        s.tick(0);
        expect(receivedFrames).toBe(els);
    });

    test('factory source has no getElementById/querySelector on any path', () => {
        const src = framesModule.factory.toString();
        expect(src).not.toContain('getElementById');
        expect(src).not.toContain('querySelector');
    });
});

// ── Worker-safe timing (DOM-free frame index) ────────────────────────────────

describe('Frames timing is Worker-safe (DOM-free frame index)', () => {
    test('_window computes a viewBox string with no DOM access', () => {
        const f = new Frames({ sprite: { target: { setAttribute() {} }, cols: 3, rows: 3, frameW: 8, frameH: 8 } });
        // Pure numeric computation — no window/document touched.
        expect(f._window(0)).toBe('0 0 8 8');
        expect(f._window(4)).toBe('8 8 8 8'); // col1,row1
        expect(f._window(8)).toBe('16 16 8 8'); // col2,row2
    });

    test('factory frame-index helpers reference no window/document', () => {
        const src = framesModule.factory.toString();
        const idx = src.indexOf('function frameIndexOf');
        const end = src.indexOf('class Frames');
        const pureRegion = src.slice(idx, end);
        expect(pureRegion).not.toContain('document');
        expect(pureRegion).not.toContain('window');
    });
});

// ── Shared-scheduler invariant ───────────────────────────────────────────────

describe('Frames shared-scheduler invariant', () => {
    test('two Frames tick from ONE scheduler (no second loop)', () => {
        const s = manualScheduler();
        const a = new Frames({ frames: makeFrameEls(3), fps: 10, loop: true, scheduler: s });
        const b = new Frames({ frames: makeFrameEls(4), fps: 10, loop: true, scheduler: s });
        a.play(); b.play();
        expect(s.active.has(a)).toBe(true);
        expect(s.active.has(b)).toBe(true);
        s.tick(0);
        s.tick(100);
        expect(a.frame).toBe(1);
        expect(b.frame).toBe(1);
    });

    test('frames() convenience defaults to the shared scheduler and does NOT auto-play', () => {
        const f = frames({ frames: makeFrameEls(2) });
        expect(f).toBeInstanceOf(Frames);
        expect(f._scheduler).toBe(shared);
        expect(shared.active.has(f)).toBe(false);
    });
});
