// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit + animation-seam tests for `graphic.pageflip`. Covers the
 * descriptor shape, the DISTINCT per-instance scoped-ids prefix (BATCH_4
 * collision lesson), the turn seam (writes ONLY through `svgApply.svgAttr`, a
 * single `<path>` `d` mutation per frame, NO 2nd rAF/scheduler leak), and the
 * programmatic `next` / `previous` / `goTo` navigation (bounds-safe).
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { pageflipModule } from './pageflip.js';
import { events as fwEvents } from '@awacloud/fw/dom/query/events.js';

// Resolve the pageflip descriptor transitively (pulls svgBuild/scopedIds/
// timeline/tween/svgApply + the injected pure kernels pageflip.fold/compose,
// and fw dom/secPolicy via deps).
const runtime = new ModuleRuntime();
runtime.registerDeep(pageflipModule);
const { Pageflip, pageflip } = runtime.resolve('graphic.pageflip');
const { Scheduler } = runtime.resolve('graphic.scheduler');
const { SVG_NS } = runtime.resolve('graphic.svgApply');

/**
 * A scheduler with a no-op schedule so we drive the turn manually via tick().
 * Pass it as `opts.scheduler` so timelines register on THIS instance, never on
 * the shared singleton (no cross-test leakage).
 */
function manualScheduler() {
    return new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
}

const DIMS = { width: 320, height: 480 };
const makePages = () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

function makeBook(extra) {
    return new Pageflip({ pages: makePages(), ...DIMS, ...extra });
}

/**
 * Build a Pageflip whose `svgApply` is a spy that records every write and
 * delegates to the real writer. Manual factory wiring (mirrors the spike's
 * resolveEngine spy) so we can assert the write path. Module-scope so both
 * the turn-seam and dispose test groups can share it.
 * @param {object} sched
 */
function spyBook(sched) {
    const svgBuild = runtime.resolve('graphic.svgBuild');
    const scopedIds = runtime.resolve('graphic.scopedIds');
    const timelineMod = runtime.resolve('graphic.timeline');
    const tweenMod = runtime.resolve('graphic.tween');
    const realApply = runtime.resolve('graphic.svgApply');
    const foldApi = runtime.resolve('pageflip.fold');
    const composeApi = runtime.resolve('pageflip.compose');

    const writes = [];
    const spyApply = {
        SVG_NS: realApply.SVG_NS,
        svgAttr(target, name, value) {
            writes.push({ target, name, value });
            return realApply.svgAttr(target, name, value);
        },
    };
    const api = pageflipModule.factory(
        svgBuild, scopedIds, timelineMod, tweenMod, spyApply, foldApi, composeApi,
    );
    const book = new api.Pageflip({ pages: makePages(), ...DIMS, duration: 100, scheduler: sched });
    return { book, writes };
}

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('pageflipModule descriptor', () => {
    test('has the frozen name / type / version', () => {
        expect(pageflipModule.name).toBe('graphic.pageflip');
        expect(pageflipModule.type).toBe('fw.dom.graphic');
        expect(pageflipModule.version).toBe('0.1.0');
    });

    test('dependencies are the frozen tuple in topo order', () => {
        expect(pageflipModule.dependencies).toEqual([
            'graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline',
            'graphic.tween', 'graphic.svgApply', 'pageflip.fold', 'pageflip.compose',
        ]);
    });

    test('deps mirror dependencies in the same order', () => {
        expect(pageflipModule.deps.map(d => d.name)).toEqual(pageflipModule.dependencies);
    });

    test('factory returns { Pageflip, pageflip }', () => {
        expect(typeof Pageflip).toBe('function');
        expect(typeof pageflip).toBe('function');
    });
});

// ── Construction / build ─────────────────────────────────────────────────────

describe('Pageflip construction', () => {
    test('throws on empty pages', () => {
        expect(() => new Pageflip({ pages: [], ...DIMS })).toThrow('non-empty array');
    });

    test('throws on non-positive dimensions', () => {
        expect(() => new Pageflip({ pages: makePages(), width: 0, height: 480 }))
            .toThrow('positive');
    });

    test('builds a namespace-correct SVG root; turn <path> bound by reference', () => {
        const book = makeBook();
        expect(book.el.namespaceURI).toBe(SVG_NS);
        expect(book.el.tagName).toBe('svg');
        expect(book._turnPath.tagName).toBe('path');
        expect(book._turnPath.namespaceURI).toBe(SVG_NS);
        expect(book.index).toBe(0);
        expect(book.pageCount).toBe(3);
        expect(book.currentId).toBe('a');
    });

    test('the first page is shown, the rest hidden', () => {
        const book = makeBook();
        expect(book._pageEls[0].getAttribute('display')).toBe('inline');
        expect(book._pageEls[1].getAttribute('display')).toBe('none');
        expect(book._pageEls[2].getAttribute('display')).toBe('none');
    });
});

// ── Distinct per-instance prefix (BATCH_4 collision lesson) ───────────────────

describe('distinct scopedIds prefix per instance', () => {
    test('two default-prefix books mint distinct prefixes → no id collision', () => {
        const b1 = makeBook();
        const b2 = makeBook();
        expect(b1.prefix).not.toBe(b2.prefix);
        // The turning <path> ids differ across instances (document-wide unique).
        const id1 = b1._turnPath.getAttribute('id');
        const id2 = b2._turnPath.getAttribute('id');
        expect(id1).not.toBe(id2);
    });

    test('an explicit prefix is honoured', () => {
        const book = makeBook({ prefix: 'my-book' });
        expect(book.prefix).toBe('my-book');
        expect(book._turnPath.getAttribute('id')).toContain('my-book');
    });
});

// ── Turn seam: svgApply-only writes, one d/frame, no 2nd rAF ──────────────────

describe('turn seam on the shared scheduler', () => {
    test('turn d writes route ONLY through svgApply.svgAttr; the d actually changes', () => {
        const sched = manualScheduler();
        const { book, writes } = spyBook(sched);
        book.next();
        writes.length = 0;
        sched.tick(0);            // p = 0 (flat)
        const d0 = book._turnPath.getAttribute('d');
        sched.tick(50);           // p = 0.5 (mid-fold)
        const dMid = book._turnPath.getAttribute('d');
        // The turning path's d was written via the spy (svgApply path).
        expect(writes.some(w => w.name === 'd' && w.target === book._turnPath)).toBe(true);
        expect(dMid).not.toBe(d0);
    });

    test('exactly two d mutations per (mid) frame — the leaf and its clip, no other write', () => {
        const sched = manualScheduler();
        const { book, writes } = spyBook(sched);
        book.next();
        sched.tick(0);            // fixes start time
        writes.length = 0;
        sched.tick(50);           // a single mid frame
        expect(writes.length).toBe(2);
        expect(writes.every(w => w.name === 'd')).toBe(true);
        expect(writes.map(w => w.target)).toEqual([book._turnPath, book._clipPath]);
    });

    test('the timeline registers on the injected scheduler — no 2nd rAF/leak', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        book.next();
        expect(sched.active.size).toBe(1);   // single tickable
        sched.tick(0);
        sched.tick(100);                     // completes
        expect(sched.active.size).toBe(0);   // self-stopped, no leak
    });

    test('no getElementById in the tick path (target bound by reference)', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 40, scheduler: sched });
        const orig = document.getElementById;
        let calls = 0;
        document.getElementById = function (...a) { calls++; return orig.apply(this, a); };
        try {
            book.next();
            sched.tick(0); sched.tick(20); sched.tick(40);
        } finally {
            document.getElementById = orig;
        }
        expect(calls).toBe(0);
    });
});

// ── The turning leaf, its clip and the page underneath ───────────────────────
// Rendering model of the old aJSFlip turn: the lifted page shows where it is not
// yet lifted, the revealed page shows in the lifted region, and the leaf back
// lies on top. Before it, the leaf was a stage-coloured polygon over a whole
// current page, and the page underneath appeared only at completion. Pages stay
// in reading order (consumers read them in DOM order), so the revealed page,
// always the later one, paints above and is the one clipped.

describe('turning leaf, clip and page underneath', () => {
    /** Index of a page group among the book root's children (paint order). */
    const paintIndex = (book, i) => Array.prototype.indexOf.call(book.el.childNodes, book._pageEls[i]);

    test('the corner follows the old two legs: (w,0) → (0,0.1h) → (−w,0)', () => {
        const book = makeBook({ scheduler: manualScheduler() });
        const { width: w, height: h } = DIMS;
        expect(book._cornerAt(0)).toEqual({ x: w, y: 0 });
        expect(book._cornerAt(0.25)).toEqual({ x: w / 2, y: 0.05 * h });
        expect(book._cornerAt(0.5)).toEqual({ x: 0, y: 0.1 * h });
        expect(book._cornerAt(0.75)).toEqual({ x: -w / 2, y: 0.05 * h });
        expect(book._cornerAt(1)).toEqual({ x: -w, y: 0 });
    });

    test('a scoped <clipPath> holds the clip <path>, bound by reference', () => {
        const book = makeBook({ scheduler: manualScheduler() });
        expect(book._clipPath.tagName).toBe('path');
        const clip = book._clipPath.parentNode;
        expect(clip.tagName).toBe('clipPath');
        expect(clip.getAttribute('id')).toContain(book.prefix);
    });

    test('forward turn: both pages shown, the revealed page clipped to the lifted region', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        book.next();
        sched.tick(0);
        sched.tick(50);
        expect(book._pageEls[0].getAttribute('display')).toBe('inline');
        expect(book._pageEls[1].getAttribute('display')).toBe('inline');
        expect(book._pageEls[2].getAttribute('display')).toBe('none');
        // Reading order kept: page 1 paints above page 0 and is the clipped one.
        expect(paintIndex(book, 1)).toBeGreaterThan(paintIndex(book, 0));
        const clipId = book._clipPath.parentNode.getAttribute('id');
        expect(book._pageEls[1].getAttribute('clip-path')).toBe(`url(#${clipId})`);
        expect(book._pageEls[0].getAttribute('clip-path')).toBe('none');
        // The clip is the page ring plus the unlifted polygon, even-odd.
        expect(book._clipPath.getAttribute('clip-rule')).toBe('evenodd');
        expect(book._clipPath.getAttribute('d').startsWith(
            `M 0 0 L ${DIMS.width} 0 L ${DIMS.width} ${DIMS.height} L 0 ${DIMS.height} Z M `)).toBe(true);
        // The leaf is painted above every page.
        expect(Array.prototype.indexOf.call(book.el.childNodes, book._turnPath))
            .toBeGreaterThan(paintIndex(book, 0));
        expect(book._clipPath.getAttribute('d')).not.toBe('');
        expect(book._turnPath.getAttribute('d')).not.toBe('');
    });

    test('backward turn: the fold runs reversed, the current (later) page is the clipped one', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        book.next(); sched.tick(0); sched.tick(100);       // → index 1
        book.previous();
        sched.tick(200); sched.tick(225);                   // early in the backward turn
        const clipId = book._clipPath.parentNode.getAttribute('id');
        expect(book._pageEls[1].getAttribute('clip-path')).toBe(`url(#${clipId})`);
        expect(book._pageEls[0].getAttribute('clip-path')).toBe('none');
        // Reversed fold: 25 % into the backward turn is p = 0.75 of the fold.
        const fwd = makeBook({ scheduler: manualScheduler() });
        fwd._applyFold(0.75);
        expect(book._clipPath.getAttribute('d')).toBe(fwd._clipPath.getAttribute('d'));
    });

    test('at rest after a turn: one page shown, empty leaf, no clip', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        book.next(); sched.tick(0); sched.tick(100);
        expect(book._pageEls.map(el => el.getAttribute('display'))).toEqual(['none', 'inline', 'none']);
        expect(book._turnPath.getAttribute('d')).toBe('');
        expect(book._pageEls[1].getAttribute('clip-path')).toBe('none');
    });

    test('the leaf back fill defaults to paper and takes the backFill option', () => {
        expect(makeBook()._turnPath.getAttribute('fill')).toBe('#e9e6df');
        expect(makeBook({ backFill: '#123456' })._turnPath.getAttribute('fill')).toBe('#123456');
    });
});

// ── Two-page spread (opt-in) ─────────────────────────────────────────────────
// The old aJSFlip book: spread 0 shows the first page on the right, spread s
// shows pages 2s−1 | 2s (0-based). A forward turn lifts the right page off the
// next spread's right page; the leaf carries the next spread's left page (the
// verso) under the fold's pattern transform. A backward turn is the forward
// turn of the previous spread played in reverse.

describe('two-page spread', () => {
    const SIX = () => ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => ({ id }));
    const makeSpread = (extra) => new Pageflip({ pages: SIX(), ...DIMS, spread: true, ...extra });
    /** The page id a slot shows, or null when the slot is hidden. */
    function shows(book, slot) {
        const el = book._slots[slot];
        if (el.getAttribute('display') === 'none') return null;
        const href = el.getAttribute('href');
        const i = book._pageEls.findIndex((p) => `#${p.getAttribute('id')}` === href);
        return i < 0 ? `?${href}` : book._pages[i].id;
    }
    const view = (book) => ({
        left: shows(book, 'left'), right: shows(book, 'right'),
        beneath: shows(book, 'beneath'), back: shows(book, 'back'),
    });
    /** Run one whole turn on a manual scheduler. */
    function turn(sched, start, call) {
        const tl = call();
        sched.tick(start);
        sched.tick(start + 100);
        return tl;
    }

    test('the book is two pages wide, the pages built once under <defs> in reading order', () => {
        const book = makeSpread();
        expect(book.el.getAttribute('viewBox')).toBe(`0 0 ${2 * DIMS.width} ${DIMS.height}`);
        expect(book.el.getAttribute('width')).toBe(String(2 * DIMS.width));
        // A tilted leaf may overhang the book edge, as in the old book.
        expect(book.el.getAttribute('overflow')).toBe('visible');
        expect(makeBook().el.getAttribute('overflow')).toBeNull();
        const defs = book._pageEls[0].parentNode;
        expect(defs.tagName).toBe('defs');
        expect(book._pageEls.every((el) => el.parentNode === defs)).toBe(true);
        const order = Array.prototype.filter.call(defs.childNodes, (n) => book._pageEls.includes(n));
        expect(order).toEqual(book._pageEls);
    });

    test('spread 0 rests with the first page on the right and nothing on the left', () => {
        const book = makeSpread({ scheduler: manualScheduler() });
        expect(view(book)).toEqual({ left: null, right: 'p1', beneath: null, back: null });
        expect(book.index).toBe(0);
        expect(book.currentId).toBe('p1');
        expect(book.pageCount).toBe(6);
    });

    test('next moves by spread: 0 → [p2|p3] → [p4|p5] → [p6|-]', () => {
        const sched = manualScheduler();
        const book = makeSpread({ duration: 100, scheduler: sched });
        turn(sched, 0, () => book.next());
        expect(view(book)).toEqual({ left: 'p2', right: 'p3', beneath: null, back: null });
        expect(book.index).toBe(1);
        turn(sched, 200, () => book.next());
        expect(view(book)).toEqual({ left: 'p4', right: 'p5', beneath: null, back: null });
        turn(sched, 400, () => book.next());
        expect(view(book)).toEqual({ left: 'p6', right: null, beneath: null, back: null });
        expect(book.index).toBe(5);
        expect(book.next()).toBeNull();
    });

    test('forward turn mid-frame: right clipped, next right beneath, verso on the leaf', () => {
        const sched = manualScheduler();
        const book = makeSpread({ duration: 100, scheduler: sched });
        turn(sched, 0, () => book.next());              // → [p2|p3]
        book.next();                                    // → [p4|p5]
        sched.tick(200); sched.tick(250);
        expect(view(book)).toEqual({ left: 'p2', right: 'p3', beneath: 'p5', back: 'p4' });
        const underId = book._clipPath.parentNode.getAttribute('id');
        expect(book._slots.right.getAttribute('clip-path')).toBe(`url(#${underId})`);
        expect(book._leaf.getAttribute('display')).toBe('inline');
        expect(book._verso.getAttribute('transform')).toMatch(/^translate\(.+\) rotate\(.+\)$/);
    });

    test('at the end of a forward turn the verso lies exactly on the left page', () => {
        const sched = manualScheduler();
        const book = makeSpread({ duration: 100, scheduler: sched });
        book.next();
        sched.tick(0); sched.tick(99.999);
        const m = /translate\((\S+) (\S+)\) rotate\((\S+)\)/.exec(book._verso.getAttribute('transform'));
        expect(Number(m[1])).toBeCloseTo(-DIMS.width, 0);
        expect(Number(m[2])).toBeCloseTo(0, 0);
        expect(Number(m[3])).toBeCloseTo(0, 0);
    });

    test('backward turn: the previous forward turn played in reverse, resting on the previous spread', () => {
        const sched = manualScheduler();
        const book = makeSpread({ duration: 100, scheduler: sched });
        turn(sched, 0, () => book.next());
        turn(sched, 200, () => book.next());            // [p4|p5]
        book.previous();
        sched.tick(400); sched.tick(425);               // p = 0.75 of the reversed fold
        expect(view(book)).toEqual({ left: 'p2', right: 'p3', beneath: 'p5', back: 'p4' });
        const fwd = makeSpread({ scheduler: manualScheduler() });
        fwd._applySpread(0.75);
        expect(book._clipPath.getAttribute('d')).toBe(fwd._clipPath.getAttribute('d'));
        expect(book._turnPath.getAttribute('d')).toBe(fwd._turnPath.getAttribute('d'));
        sched.tick(500);
        expect(view(book)).toEqual({ left: 'p2', right: 'p3', beneath: null, back: null });
        expect(book.index).toBe(1);
        expect(book._leaf.getAttribute('display')).toBe('none');
        expect(book._slots.right.getAttribute('clip-path')).toBe('none');
    });

    test('a mid frame writes exactly the leaf clip d, the under clip d, the verso transform and the leaf edge d', () => {
        const sched = manualScheduler();
        const svgBuild = runtime.resolve('graphic.svgBuild');
        const realApply = runtime.resolve('graphic.svgApply');
        const writes = [];
        const spyApply = {
            SVG_NS: realApply.SVG_NS,
            svgAttr(target, name, value) { writes.push({ target, name }); return realApply.svgAttr(target, name, value); },
        };
        const api = pageflipModule.factory(
            svgBuild, runtime.resolve('graphic.scopedIds'), runtime.resolve('graphic.timeline'),
            runtime.resolve('graphic.tween'), spyApply, runtime.resolve('pageflip.fold'), runtime.resolve('pageflip.compose'),
        );
        const book = new api.Pageflip({ pages: SIX(), ...DIMS, spread: true, duration: 100, scheduler: sched });
        book.next();
        sched.tick(0);
        writes.length = 0;
        sched.tick(50);
        expect(writes.map((w) => [w.target, w.name])).toEqual([
            [book._turnPath, 'd'], [book._clipPath, 'd'], [book._verso, 'transform'], [book._shade.leafEdge, 'd'],
        ]);
    });

    test('bounds: previous at spread 0, goTo within the current spread, goTo across spreads', () => {
        const sched = manualScheduler();
        const book = makeSpread({ duration: 100, scheduler: sched });
        expect(book.previous()).toBeNull();
        expect(book.goTo('p1')).toBeNull();
        turn(sched, 0, () => book.goTo('p6'));
        expect(view(book)).toEqual({ left: 'p6', right: null, beneath: null, back: null });
        expect(book.goTo('p6')).toBeNull();
        turn(sched, 200, () => book.goTo('p3'));
        expect(view(book)).toEqual({ left: 'p2', right: 'p3', beneath: null, back: null });
        expect(book.goTo('p2')).toBeNull();
        expect(book.currentId).toBe('p2');
    });

    test('dispose mid-turn leaves the scheduler empty and detaches the book', () => {
        const sched = manualScheduler();
        const book = makeSpread({ duration: 100, scheduler: sched });
        const stage = document.createElement('div');
        book.mountInto(stage);
        book.next();
        sched.tick(0);
        book.dispose();
        expect(sched.active.size).toBe(0);
        expect(stage.childNodes.length).toBe(0);
    });
});

// ── Spread shadows (spine gutters, stack edges, leaf edge) ───────────────────
// The old aJSFlip shading: two #767676 gradients; gutter rects at the spine
// whose widths follow the reading progress p = 2s/n; the page stacks' outer
// edges stroked with the outer-opaque gradient (0.2 % of the old viewport); the
// leaf outline stroked during a turn. The single-page book stays unshaded.

describe('spread shadows', () => {
    const SIX = () => ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => ({ id }));
    const makeSpread = (extra) => new Pageflip({ pages: SIX(), ...DIMS, spread: true, duration: 100, ...extra });
    const W = DIMS.width;
    const num = (el, a) => Number(el.getAttribute(a));
    const shown = (el) => el.getAttribute('display') !== 'none';
    const gradId = (book, raw) => book._scope.id(raw);
    function turn(sched, start, call) { call(); sched.tick(start); sched.tick(start + 100); }

    test('two scoped #767676 gradients, opaque at the left (shade-r) and at the right (shade-l)', () => {
        const book = makeSpread();
        const grads = [...book.el.querySelectorAll('linearGradient')];
        expect(grads.map((g) => g.getAttribute('id')).sort())
            .toEqual([gradId(book, 'shade-l'), gradId(book, 'shade-r')].sort());
        const byId = new Map(grads.map((g) => [g.getAttribute('id'), g]));
        const r = byId.get(gradId(book, 'shade-r'));
        const l = byId.get(gradId(book, 'shade-l'));
        expect([r.getAttribute('x1'), r.getAttribute('x2')]).toEqual(['0%', '100%']);
        expect([l.getAttribute('x1'), l.getAttribute('x2')]).toEqual(['100%', '0%']);
        for (const g of grads) {
            const stops = [...g.querySelectorAll('stop')];
            expect(stops.map((st) => st.getAttribute('stop-color'))).toEqual(['#767676', '#767676']);
            expect(stops.map((st) => st.getAttribute('stop-opacity'))).toEqual(['1', '0']);
        }
    });

    test('gutters follow the reading progress p = 2s/n, written at rest', () => {
        const sched = manualScheduler();
        const book = makeSpread({ scheduler: sched });
        const { gutterLeft: gl, gutterRight: gr } = book._shade;
        expect(gl.getAttribute('fill')).toBe(`url(#${gradId(book, 'shade-l')})`);
        expect(gr.getAttribute('fill')).toBe(`url(#${gradId(book, 'shade-r')})`);
        expect(gl.getAttribute('fill-opacity')).toBe('0.5');
        expect(num(gl, 'width')).toBeCloseTo(0, 9);
        expect(num(gr, 'width')).toBeCloseTo(0.05 * W, 9);
        expect(num(gr, 'x')).toBeCloseTo(0, 9);
        turn(sched, 0, () => book.next());                         // s = 1, p = 1/3
        expect(num(gl, 'width')).toBeCloseTo(0.05 * W / 3, 9);
        expect(num(gl, 'x')).toBeCloseTo(-0.05 * W / 3, 9);
        expect(num(gr, 'width')).toBeCloseTo(0.05 * W * 2 / 3, 9);
    });

    test('the shadow option scales the gutters; 0 hides them', () => {
        expect(num(makeSpread({ shadow: 0.1 })._shade.gutterRight, 'width')).toBeCloseTo(0.1 * W, 9);
        expect(num(makeSpread({ shadow: 0 })._shade.gutterRight, 'width')).toBeCloseTo(0, 9);
    });

    test('stack edges: right while pages follow the right page, left whenever a left page exists', () => {
        const sched = manualScheduler();
        const book = makeSpread({ scheduler: sched });
        const { edgeLeft: el, edgeRight: er } = book._shade;
        const m = Math.sqrt(W * W + DIMS.height * DIMS.height) - DIMS.height;
        const sw = 0.002 * Math.sqrt(((2 * W) ** 2 + (DIMS.height + 2 * m) ** 2) / 2);
        expect(num(er, 'stroke-width')).toBeCloseTo(sw, 6);
        expect(er.getAttribute('fill')).toBe('none');
        expect(er.getAttribute('stroke')).toBe(`url(#${gradId(book, 'shade-l')})`);
        expect(el.getAttribute('stroke')).toBe(`url(#${gradId(book, 'shade-r')})`);
        expect([shown(el), shown(er)]).toEqual([false, true]);      // [ - | p1 ]
        turn(sched, 0, () => book.next());
        expect([shown(el), shown(er)]).toEqual([true, true]);       // [ p2 | p3 ]
        turn(sched, 200, () => book.goTo('p6'));
        expect([shown(el), shown(er)]).toEqual([true, false]);      // [ p6 | - ]
    });

    test('the leaf edge follows the turn polygon during a turn, hidden at rest', () => {
        const sched = manualScheduler();
        const book = makeSpread({ scheduler: sched });
        const edge = book._shade.leafEdge;
        expect(shown(edge)).toBe(false);
        expect(edge.getAttribute('stroke')).toBe(`url(#${gradId(book, 'shade-r')})`);
        book.next();
        sched.tick(0); sched.tick(50);
        expect(shown(edge)).toBe(true);
        expect(edge.getAttribute('d')).toBe(book._turnPath.getAttribute('d'));
        sched.tick(100);
        expect(shown(edge)).toBe(false);
    });

    test('paint order: pages, then gutters and stack edges, then the leaf', () => {
        const book = makeSpread();
        const spine = book._slots.right.parentNode;
        const at = (n) => Array.prototype.indexOf.call(spine.childNodes, n);
        const { gutterLeft, gutterRight, edgeLeft, edgeRight, leafEdge } = book._shade;
        for (const n of [gutterLeft, gutterRight, edgeLeft, edgeRight]) {
            expect(at(n)).toBeGreaterThan(at(book._slots.right));
            expect(at(n)).toBeLessThan(at(book._leaf));
        }
        expect(at(leafEdge)).toBeGreaterThan(at(book._leaf));
    });

    test('the single-page book stays unshaded', () => {
        expect(makeBook().el.querySelectorAll('linearGradient').length).toBe(0);
    });
});

// ── Four corners, hover peel, corner drag (spread + fw events) ──────────────
// The old aJSFlip pointer model: four 40 % corner zones at the spread's outer
// corners; hover peels the corner inward by 20 % of min(w, h) in 250 ms; a press
// drags the corner with the pointer; a release past a quarter page beyond the
// spine completes the turn, otherwise it goes back; a click runs the two-leg
// turn. Bottom corners mirror y. The pointer comes from the fw `events` module,
// passed as an instance option.

describe('four corners and pointer', () => {
    const SIX = () => ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => ({ id }));
    const W = DIMS.width;
    const H = DIMS.height;
    const M = 0.2 * Math.min(W, H);
    function makeIx(extra) {
        const sched = manualScheduler();
        const book = new Pageflip({
            pages: SIX(), ...DIMS, spread: true, duration: 100, scheduler: sched,
            events: fwEvents.factory(), ...extra,
        });
        // Client coordinates = book coordinates (identity screen CTM).
        book.el.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return { book, sched };
    }
    function pe(book, type, x, y, buttons = 0) {
        book.el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, buttons, pointerId: 1, bubbles: true }));
    }
    /** Parse a composed polygon `M x y L x y … Z` into points. */
    function pts(d) {
        const n = d.replace(/[MLZ]/g, ' ').trim().split(/\s+/).map(Number);
        const out = [];
        for (let i = 0; i < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
        return out;
    }
    const restView = (book) => ({ index: book.index, leaf: book._leaf.getAttribute('display') });

    test('a bottom corner is the top fold mirrored in y, its verso pinned by its bottom-left corner', () => {
        const { book } = makeIx();
        const c = { x: W * 0.5, y: 30 };
        book._applyCorner(c, false);
        const top = { turn: pts(book._turnPath.getAttribute('d')), under: pts(book._clipPath.getAttribute('d')) };
        const t = /translate\((\S+) (\S+)\) rotate\((\S+)\)/.exec(book._verso.getAttribute('transform'));
        book._applyCorner(c, true);
        const bottom = { turn: pts(book._turnPath.getAttribute('d')), under: pts(book._clipPath.getAttribute('d')) };
        expect(bottom.turn.map((p) => [p.x, p.y])).toEqual(top.turn.map((p) => [p.x, Math.round((H - p.y) * 1e3) / 1e3]));
        expect(bottom.under.map((p) => [p.x, p.y])).toEqual(top.under.map((p) => [p.x, Math.round((H - p.y) * 1e3) / 1e3]));
        expect(book._verso.getAttribute('transform'))
            .toBe(`translate(${t[1]} ${H - Number(t[2])}) rotate(${-Number(t[3])}) translate(0 ${-H})`);
    });

    test('a left corner at (−w, 0) is the leaf lying on the left page', () => {
        const { book } = makeIx();
        book._applyCorner({ x: -W, y: 0 }, false);
        const p = pts(book._turnPath.getAttribute('d'));
        const xs = p.map((q) => q.x);
        const ys = p.map((q) => q.y);
        expect(Math.min(...xs)).toBeCloseTo(-W, 6);
        expect(Math.max(...xs)).toBeCloseTo(0, 6);
        expect(Math.min(...ys)).toBeCloseTo(0, 6);
        expect(Math.max(...ys)).toBeCloseTo(H, 6);
    });

    test('zones: 40 % corners of the spread; right active with a next spread, left with a previous one', () => {
        const { book, sched } = makeIx();
        expect(book._zoneAt(2 * W - 5, 5)).toEqual({ side: 'R', bottom: false });
        expect(book._zoneAt(2 * W - 5, H - 5)).toEqual({ side: 'R', bottom: true });
        expect(book._zoneAt(5, 5)).toEqual({ side: 'L', bottom: false });
        expect(book._zoneAt(5, H - 5)).toEqual({ side: 'L', bottom: true });
        expect(book._zoneAt(2 * W - 0.41 * W, 5)).toBeNull();
        expect(book._zoneAt(W, H / 2)).toBeNull();
        expect(book._zoneActive({ side: 'R', bottom: false })).toBe(true);
        expect(book._zoneActive({ side: 'L', bottom: false })).toBe(false);   // spread 0
        book.goTo('p6'); sched.tick(0); sched.tick(100);
        expect(book._zoneActive({ side: 'R', bottom: false })).toBe(false);   // last spread
        expect(book._zoneActive({ side: 'L', bottom: true })).toBe(true);
    });

    test('hover peels the corner inward by 20 % of min(w, h) in 250 ms, leaving peels it back', () => {
        const { book, sched } = makeIx();
        pe(book, 'pointermove', 2 * W - 10, 10);
        sched.tick(0); sched.tick(250);
        expect(book._ix.corner.x).toBeCloseTo(W - M, 6);
        expect(book._ix.corner.y).toBeCloseTo(M, 6);
        expect(book._ix.bottom).toBe(false);
        expect(book._leaf.getAttribute('display')).toBe('inline');
        pe(book, 'pointermove', W, H / 2);
        sched.tick(300); sched.tick(550);
        expect(restView(book)).toEqual({ index: 0, leaf: 'none' });
        expect(sched.active.size).toBe(0);
    });

    test('a bottom-corner hover peels the mirrored corner', () => {
        const { book, sched } = makeIx();
        pe(book, 'pointermove', 2 * W - 10, H - 10);
        sched.tick(0); sched.tick(250);
        expect(book._ix.bottom).toBe(true);
        expect(book._ix.corner.x).toBeCloseTo(W - M, 6);
        expect(book._ix.corner.y).toBeCloseTo(M, 6);
    });

    test('a hover on an inactive zone does nothing', () => {
        const { book, sched } = makeIx();
        pe(book, 'pointermove', 10, 10);          // TL at spread 0
        sched.tick(0); sched.tick(250);
        expect(restView(book)).toEqual({ index: 0, leaf: 'none' });
    });

    test('drag: the corner follows the pointer; a release past the threshold completes the turn', () => {
        const { book, sched } = makeIx();
        pe(book, 'pointerdown', 2 * W - 10, 10, 1);
        pe(book, 'pointermove', 500, 100, 1);
        expect(book._ix.corner).toEqual({ x: 500 - W, y: 100 });
        expect(book.next()).toBeNull();                       // refused during a drag
        pe(book, 'pointermove', 150, 200, 1);
        pe(book, 'pointerup', 150, 200);
        sched.tick(0); sched.tick(100);
        expect(book.index).toBe(1);
        expect(book._leaf.getAttribute('display')).toBe('none');
        expect(sched.active.size).toBe(0);
    });

    test('a press that starts a drag prevents its default (no text selection); elsewhere it does not', () => {
        const { book } = makeIx();
        const press = (x, y) => {
            const ev = new PointerEvent('pointerdown', { clientX: x, clientY: y, buttons: 1, pointerId: 1, bubbles: true, cancelable: true });
            book.el.dispatchEvent(ev);
            return ev.defaultPrevented;
        };
        expect(press(W, H / 2)).toBe(false);
        expect(press(2 * W - 10, 10)).toBe(true);
    });

    test('drag: a release before the threshold goes back', () => {
        const { book, sched } = makeIx();
        pe(book, 'pointerdown', 2 * W - 10, 10, 1);
        pe(book, 'pointermove', 1.3 * W, 50, 1);
        pe(book, 'pointerup', 1.3 * W, 50);
        sched.tick(0); sched.tick(100);
        expect(restView(book)).toEqual({ index: 0, leaf: 'none' });
    });

    test('drag from a left corner: past 0.75 w the turn completes backward', () => {
        const { book, sched } = makeIx();
        book.next(); sched.tick(0); sched.tick(100);        // [p2|p3]
        pe(book, 'pointerdown', 10, H - 10, 1);              // BL
        expect(book._ix.bottom).toBe(true);
        pe(book, 'pointermove', 0.9 * W, H - 40, 1);
        pe(book, 'pointerup', 0.9 * W, H - 40);
        sched.tick(200); sched.tick(300);
        expect(book.index).toBe(0);
        expect(sched.active.size).toBe(0);
    });

    test('click: a press and release within 5 px runs the two-leg turn from that corner', () => {
        const { book, sched } = makeIx();
        pe(book, 'pointerdown', 2 * W - 10, H - 10, 1);
        pe(book, 'pointerup', 2 * W - 8, H - 11);
        sched.tick(0); sched.tick(50);
        expect(book._leaf.getAttribute('display')).toBe('inline');
        sched.tick(100);
        expect(book.index).toBe(1);
    });

    test('next() during a peel cancels the peel and turns', () => {
        const { book, sched } = makeIx();
        pe(book, 'pointermove', 2 * W - 10, 10);
        sched.tick(0); sched.tick(100);                      // mid-peel
        const tl = book.next();
        expect(tl).not.toBeNull();
        sched.tick(200); sched.tick(300);
        expect(book.index).toBe(1);
        expect(sched.active.size).toBe(0);
    });

    test('pointer input is ignored while a turn is in flight', () => {
        const { book, sched } = makeIx();
        book.next(); sched.tick(0);
        pe(book, 'pointerdown', 2 * W - 10, 10, 1);
        expect(book._ix.mode).not.toBe('drag');
        sched.tick(100);
        expect(book.index).toBe(1);
    });

    test('dispose removes the listeners and leaves the scheduler empty', () => {
        const { book, sched } = makeIx();
        pe(book, 'pointermove', 2 * W - 10, 10);
        sched.tick(0);
        const el = book.el;
        book.dispose();
        expect(sched.active.size).toBe(0);
        el.dispatchEvent(new PointerEvent('pointermove', { clientX: 2 * W - 10, clientY: 10, bubbles: true }));
        expect(sched.active.size).toBe(0);
    });

    test('without events (or with pointer: false) the spread registers no pointer behaviour', () => {
        for (const extra of [{ events: undefined }, { pointer: false }]) {
            const { book, sched } = makeIx(extra);
            pe(book, 'pointermove', 2 * W - 10, 10);
            sched.tick(0); sched.tick(250);
            expect(restView(book)).toEqual({ index: 0, leaf: 'none' });
            expect(book._pointerScope).toBeNull();
        }
    });
});

// ── Image pages and the preload window ──────────────────────────────────────
// The old aJSFlip `cache`: a window of pages around the current one is
// preloaded, a bounded number at a time, and an image gets its href only once
// its bytes are decoded. A page gives `src` instead of `template`.

describe('image pages and preload window', () => {
    /** A controllable loader: records calls, tracks the loads in flight. */
    function fakeLoader() {
        const calls = [];
        let inflight = 0;
        let max = 0;
        const loadImage = (src) => {
            inflight += 1;
            max = Math.max(max, inflight);
            let res; let rej;
            const p = new Promise((a, b) => { res = a; rej = b; });
            calls.push({
                src,
                resolve() { inflight -= 1; res(); },
                reject() { inflight -= 1; rej(new Error('nope')); },
            });
            return p;
        };
        return { loadImage, calls, get max() { return max; }, get inflight() { return inflight; } };
    }
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const pagesN = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, src: `img${i}.png` }));
    const imageOf = (book, i) => book._pageEls[i].querySelector('image');
    /** Resolve every call in order until no new call comes; return the srcs. */
    async function drain(loader) {
        const done = [];
        for (let k = 0; k < loader.calls.length; k += 1) {
            loader.calls[k].resolve();
            done.push(loader.calls[k].src);
            await flush();
        }
        return done;
    }

    test('a src page holds a white placeholder under an image with no href', () => {
        const loader = fakeLoader();
        const book = new Pageflip({ pages: [{ id: 'a', src: 'a.png' }, { id: 'b' }], ...DIMS, loadImage: loader.loadImage });
        const g = book._pageEls[0];
        expect(g.querySelector('rect').getAttribute('fill')).toBe('#ffffff');
        const img = imageOf(book, 0);
        expect(img.getAttribute('href')).toBeNull();
        expect(img.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice');
        expect(book.imageState('a')).toBe('loading');
        expect(book.imageState('b')).toBe('none');
    });

    test('a book without src pages issues no load', () => {
        const loader = fakeLoader();
        makeBook({ loadImage: loader.loadImage });
        expect(loader.calls.length).toBe(0);
    });

    test('the window: cache 8 over 20 pages loads pages 0 to 7, none beyond', async () => {
        const loader = fakeLoader();
        new Pageflip({ pages: pagesN(20), ...DIMS, loadImage: loader.loadImage, preloadConcurrency: 3 });
        const done = await drain(loader);
        expect(done.sort()).toEqual(['img0.png', 'img1.png', 'img2.png', 'img3.png', 'img4.png', 'img5.png', 'img6.png', 'img7.png'].sort());
    });

    test('at most preloadConcurrency loads in flight, nearest first', async () => {
        const loader = fakeLoader();
        new Pageflip({ pages: pagesN(20), ...DIMS, loadImage: loader.loadImage, preloadConcurrency: 2 });
        expect(loader.calls.length).toBe(2);
        const done = await drain(loader);
        expect(loader.max).toBe(2);
        expect(done).toEqual(['img0.png', 'img1.png', 'img2.png', 'img3.png', 'img4.png', 'img5.png', 'img6.png', 'img7.png']);
    });

    test('the default concurrency is 1 (the old sequential load)', async () => {
        const loader = fakeLoader();
        new Pageflip({ pages: pagesN(6), ...DIMS, loadImage: loader.loadImage });
        await drain(loader);
        expect(loader.max).toBe(1);
    });

    test('the href is set only after the load resolves; a rejection leaves none', async () => {
        const loader = fakeLoader();
        const book = new Pageflip({ pages: pagesN(3), ...DIMS, loadImage: loader.loadImage });
        expect(imageOf(book, 0).getAttribute('href')).toBeNull();
        loader.calls[0].resolve();
        await flush();
        expect(imageOf(book, 0).getAttribute('href')).toBe('img0.png');
        expect(book.imageState('p0')).toBe('ready');
        loader.calls[1].reject();
        await flush();
        expect(imageOf(book, 1).getAttribute('href')).toBeNull();
        expect(book.imageState('p1')).toBe('error');
    });

    test('after dispose a late resolution writes nothing', async () => {
        const loader = fakeLoader();
        const book = new Pageflip({ pages: pagesN(3), ...DIMS, loadImage: loader.loadImage });
        const img = imageOf(book, 0);
        book.dispose();
        loader.calls[0].resolve();
        await flush();
        expect(img.getAttribute('href')).toBeNull();
    });

    test('a turn puts its target page first; the window moves when the turn settles', async () => {
        const sched = manualScheduler();
        const loader = fakeLoader();
        const book = new Pageflip({ pages: pagesN(20), ...DIMS, duration: 100, scheduler: sched, loadImage: loader.loadImage });
        loader.calls[0].resolve();                 // p0
        await flush();
        expect(loader.calls[1].src).toBe('img1.png');
        book.goTo('p15');                          // target jumps the queue
        loader.calls[1].resolve();                 // p1 done
        await flush();
        expect(loader.calls[2].src).toBe('img15.png');
        sched.tick(0); sched.tick(100);            // settles on p15
        const rest = await drain(loader);
        // Window after the turn: [11, 19).
        for (const i of [11, 12, 13, 14, 16, 17, 18]) expect(rest).toContain(`img${i}.png`);
        expect(rest).not.toContain('img19.png');
    });

    test('spread mode: page images live in defs and get their href after the load', async () => {
        const loader = fakeLoader();
        const book = new Pageflip({ pages: pagesN(4), ...DIMS, spread: true, loadImage: loader.loadImage });
        const img = imageOf(book, 0);
        expect(img.closest('defs')).not.toBeNull();
        loader.calls[0].resolve();
        await flush();
        expect(img.getAttribute('href')).toBe('img0.png');
    });

    test('the default loader resolves at once where there is no Image', async () => {
        const saved = globalThis.Image;
        try {
            delete globalThis.Image;
            const book = new Pageflip({ pages: pagesN(2), ...DIMS });
            await flush(); await flush();
            expect(book.imageState('p0')).toBe('ready');
            expect(imageOf(book, 0).getAttribute('href')).toBe('img0.png');
        } finally {
            globalThis.Image = saved;
        }
    });
});

// ── Programmatic navigation (bounds-safe) ─────────────────────────────────────

describe('next / previous / goTo navigation', () => {
    /** Drive a returned turn timeline to completion on a manual scheduler. */
    function complete(sched, tl, duration) {
        sched.tick(0);
        sched.tick(duration);
    }

    test('next advances the visible page after the turn completes', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        const tl = book.next();
        expect(tl).not.toBeNull();
        complete(sched, tl, 100);
        expect(book.index).toBe(1);
        expect(book.currentId).toBe('b');
        expect(book._pageEls[1].getAttribute('display')).toBe('inline');
        expect(book._pageEls[0].getAttribute('display')).toBe('none');
    });

    test('previous retreats the visible page after the turn completes', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        complete(sched, book.next(), 100);   // → index 1
        complete(sched, book.previous(), 100); // → index 0
        expect(book.index).toBe(0);
        expect(book.currentId).toBe('a');
    });

    test('next is bounds-safe at the last page (no-op, returns null)', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        complete(sched, book.next(), 100);   // → 1
        complete(sched, book.next(), 100);   // → 2 (last)
        expect(book.index).toBe(2);
        expect(book.next()).toBeNull();      // no-op
        expect(book.index).toBe(2);
    });

    test('previous is bounds-safe at the first page (no-op, returns null)', () => {
        const book = makeBook({ duration: 100, scheduler: manualScheduler() });
        expect(book.previous()).toBeNull();
        expect(book.index).toBe(0);
    });

    test('goTo(id) turns to the page with that id', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        complete(sched, book.goTo('c'), 100);
        expect(book.index).toBe(2);
        expect(book.currentId).toBe('c');
    });

    test('goTo the current page is a no-op (returns null)', () => {
        const book = makeBook({ duration: 100, scheduler: manualScheduler() });
        expect(book.goTo('a')).toBeNull();
        expect(book.index).toBe(0);
    });

    test('goTo an unknown id throws', () => {
        const book = makeBook({ duration: 100, scheduler: manualScheduler() });
        expect(() => book.goTo('zzz')).toThrow('unknown page');
    });
});

// ── Turn concurrency guard (ignore-while-in-flight) ──────────────────────────
// BACKLOG P2 (source graphic/BATCH_14/01, `ai/archives/packages/graphic/anim/demos-GAPS.md` item 7): next()/previous()/
// goTo() started a new turn with no guard against an already-in-flight one —
// the new turn overwrote the tracked timeline and the earlier one leaked on
// the scheduler (dispose()/stop() only ever saw the LAST tracked turn).

describe('turn concurrency guard (ignore-while-in-flight)', () => {
    test('an overlapping next() while a turn is in flight is ignored; the first Timeline stays tracked, not leaked', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        const tl1 = book.next();
        sched.tick(0); // fixes start time — the turn is now in flight
        expect(sched.active.has(tl1)).toBe(true);

        const tl2 = book.next(); // overlapping call while tl1 is in flight
        expect(tl2).toBeNull();               // ignored — no second turn started
        expect(sched.active.has(tl1)).toBe(true); // tl1 is STILL tracked/stoppable
        expect(sched.active.size).toBe(1);        // no second tickable was added

        // The leak, as the BACKLOG describes it: dispose() must not leave the
        // scheduler holding the orphaned in-flight timeline.
        book.dispose();
        expect(sched.active.has(tl1)).toBe(false);
        expect(sched.active.size).toBe(0);
    });

    test('previous() and goTo() are likewise ignored while a turn is in flight', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        const tl1 = book.next();
        sched.tick(0);

        expect(book.previous()).toBeNull();
        expect(book.goTo('c')).toBeNull();
        expect(sched.active.size).toBe(1);
        expect(sched.active.has(tl1)).toBe(true);
    });

    test('dispose() after >= 2 attempted overlapping turns leaves the scheduler holding ZERO pageflip timelines', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        book.next();
        sched.tick(0);
        book.next();     // ignored — in flight
        book.goTo('c');  // ignored — in flight
        expect(sched.active.size).toBe(1);

        book.dispose();
        expect(sched.active.size).toBe(0);
    });

    test('next() resumes once the in-flight turn completes', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        book.next();
        sched.tick(0);
        expect(book.next()).toBeNull();   // ignored mid-flight
        sched.tick(100);                  // completes -> index 1
        expect(book.index).toBe(1);

        const tl2 = book.next();          // now allowed again
        expect(tl2).not.toBeNull();
        expect(sched.active.size).toBe(1);
    });

    test('a caller cancelling the returned Timeline directly (tl.stop(), bypassing dispose()) still releases the guard', () => {
        // Conformance finding: `onComplete` is skipped by `Timeline#stop()` by
        // contract, so a release hung on `onComplete` alone never fires here —
        // `_active` would stay non-empty forever and every future next()/
        // previous()/goTo() would be a permanent no-op. The release must hang on
        // `onSettle` (fired on BOTH natural completion and `stop()`).
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        const tl = book.next();
        sched.tick(0); // turn is in flight

        tl.stop(); // caller-side cancellation, NOT book.dispose()

        expect(sched.active.has(tl)).toBe(false); // Timeline#stop() itself unregisters it
        expect(book._active.size).toBe(0);        // the guard was released too

        const resumed = book.next(); // must be allowed again, not permanently stuck
        expect(resumed).not.toBeNull();
        expect(sched.active.size).toBe(1);
    });
});

// ── mountInto ───────────────────────────────────────────────────────────────

describe('Pageflip#mountInto', () => {
    test('mounts this.el as the sole child of the target and returns this', () => {
        const book = makeBook({ scheduler: manualScheduler() });
        const stage = document.createElement('div');
        stage.appendChild(document.createElement('span')); // pre-existing child

        const ret = book.mountInto(stage);

        expect(ret).toBe(book);
        expect(stage.childNodes.length).toBe(1);
        expect(stage.firstChild).toBe(book.el);
    });

    test('replaces a previously mounted book on a second call', () => {
        const book = makeBook({ scheduler: manualScheduler() });
        const stage = document.createElement('div');
        book.mountInto(stage);
        const other = makeBook({ scheduler: manualScheduler() });
        other.mountInto(stage);
        expect(stage.childNodes.length).toBe(1);
        expect(stage.firstChild).toBe(other.el);
    });
});

// ── dispose ───────────────────────────────────────────────────────────────────

describe('Pageflip#dispose', () => {
    test('cancels an in-flight turn: scheduler no longer holds the turn timeline', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        const tl = book.next();
        sched.tick(0);
        expect(sched.active.has(tl)).toBe(true);

        book.dispose();
        expect(sched.active.has(tl)).toBe(false);
    });

    test('no further frame writes reach the turn path after dispose', () => {
        const sched = manualScheduler();
        const { book, writes } = spyBook(sched);

        book.next();
        sched.tick(0); // fixes start; one write
        book.dispose();
        writes.length = 0;
        sched.tick(50); // would have been a mid-frame write if still active
        expect(writes.length).toBe(0);
    });

    test('detaches el from its parent and drops the reference', () => {
        const book = makeBook({ scheduler: manualScheduler() });
        const stage = document.createElement('div');
        const el = book.el;
        book.mountInto(stage);
        expect(stage.contains(el)).toBe(true);

        book.dispose();

        expect(stage.contains(el)).toBe(false);
        expect(el.parentNode).toBeNull();
        expect(book.el).toBeNull();
    });

    test('is a no-op when el was never attached to a parent', () => {
        const book = makeBook({ scheduler: manualScheduler() });
        expect(() => book.dispose()).not.toThrow();
        expect(book.el).toBeNull();
    });

    test('is idempotent — calling twice never throws', () => {
        const sched = manualScheduler();
        const book = makeBook({ duration: 100, scheduler: sched });
        book.next();
        sched.tick(0);
        book.dispose();
        expect(() => book.dispose()).not.toThrow();
    });

    test('post-dispose: next/previous/goTo all return null (no-op)', () => {
        const book = makeBook({ duration: 100, scheduler: manualScheduler() });
        book.dispose();
        expect(book.next()).toBeNull();
        expect(book.previous()).toBeNull();
        expect(book.goTo('b')).toBeNull();       // no-op, does NOT throw despite a valid id
        expect(book.goTo('zzz')).toBeNull();      // no-op, does NOT throw despite an unknown id
    });
});
