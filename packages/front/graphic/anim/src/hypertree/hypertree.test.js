// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit tests for the ADDITIVE consumer-feedback surface of
 * `graphic.hypertree` (BATCH_14 W1): the `onNodeClick(id, event)` pre-focus hook,
 * the opt-in `ignoreWhileFocusing` re-entrancy guard, and the second `info`
 * argument of `onFocus(id, info)`.
 *
 * Every assertion here is about BACK-COMPATIBILITY as much as about the new
 * behaviour: the default-option path is pinned (including today's click
 * *stacking* while a focus is in flight) so a future guard can never become the
 * default silently. The build/render/focus-seam contract itself is covered by
 * `tests/hypertree.integration.test.js`.
 *
 * happy-dom registers the DOM globals the resolved fw `dom` writer needs — the
 * `NodeList` global is referenced at first TICK (W2 lesson), so it MUST be
 * registered at the top of the file. Timelines are driven through a MANUAL-clock
 * scheduler passed as `opts.scheduler`, never the shared singleton.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { hypertreeModule } from './hypertree.js';

const runtime = new ModuleRuntime();
runtime.registerDeep(hypertreeModule);
const { Hypertree } = runtime.resolve('graphic.hypertree');
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

/** Dispatch a real DOM click on a node group, by AUTHOR id. */
function click(t, id) {
    t._nodeEls.get(id).dispatchEvent(new Event('click', { bubbles: true }));
}

/** Snapshot every node group's transform attribute, keyed by node id. */
function transforms(t) {
    const out = {};
    for (const [id, el] of t._nodeEls) out[id] = el.getAttribute('transform');
    return out;
}

// ── onNodeClick(id, event) ───────────────────────────────────────────────────

describe('onNodeClick pre-focus hook', () => {
    test('receives the AUTHOR id and the DOM event, not the scoped DOM id', () => {
        const sched = manualScheduler();
        const seen = [];
        const t = new Hypertree(svgRoot(), { id: 'root', children: [{ id: 'a.1:x' }] }, {
            duration: 100, scheduler: sched, onNodeClick: (id, ev) => { seen.push([id, ev]); },
        });
        click(t, 'a.1:x');
        expect(seen.length).toBe(1);
        expect(seen[0][0]).toBe('a.1:x');
        expect(seen[0][1].type).toBe('click');
        // The DOM id is scoped — the callback must NOT leak it.
        const domId = t._nodeEls.get('a.1:x').getAttribute('id');
        expect(domId).not.toBe('a.1:x');
        expect(domId).toContain(t.prefix);
    });

    test('runs BEFORE the internal focus, and a non-false return lets it proceed', () => {
        const sched = manualScheduler();
        const order = [];
        const t = makeTree({
            scheduler: sched,
            onNodeClick: () => { order.push(`click:${sched.active.size}`); },
            onFocus: (id) => order.push(`focus:${id}`),
        });
        click(t, 'a1');
        // The hook saw an idle scheduler → it ran before focus() registered anything.
        expect(order).toEqual(['click:0']);
        expect(sched.active.size).toBe(1);
        sched.tick(0);
        sched.tick(100);
        expect(order).toEqual(['click:0', 'focus:a1']);
        expect(t.focusId).toBe('a1');
    });

    test('returning false cancels the internal focus — layout unchanged', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched, onNodeClick: () => false });
        const before = transforms(t);
        click(t, 'a1');
        expect(sched.active.size).toBe(0);
        expect(transforms(t)).toEqual(before);
        expect(t.focusId).toBe('root');
    });

    test('a falsy-but-not-false return (undefined / null / 0) still focuses', () => {
        for (const ret of [undefined, null, 0, '']) {
            const sched = manualScheduler();
            const t = makeTree({ scheduler: sched, onNodeClick: () => ret });
            click(t, 'a1');
            expect(sched.active.size).toBe(1);
        }
    });

    test('absent onNodeClick reproduces today\'s click-to-focus exactly', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched });
        click(t, 'a1');
        expect(sched.active.size).toBe(1);
        sched.tick(0);
        sched.tick(100);
        expect(t.focusId).toBe('a1');
    });

    test('a disposed tree never invokes onNodeClick', () => {
        const sched = manualScheduler();
        let calls = 0;
        const t = makeTree({ scheduler: sched, onNodeClick: () => { calls += 1; } });
        t.dispose();
        click(t, 'a1');
        expect(calls).toBe(0);
        expect(sched.active.size).toBe(0);
    });
});

// ── ignoreWhileFocusing re-entrancy guard ────────────────────────────────────

describe('ignoreWhileFocusing re-entrancy guard', () => {
    test('REGRESSION PIN — default (false) still STACKS a mid-flight click', () => {
        const sched = manualScheduler();
        const calls = [];
        const t = makeTree({ scheduler: sched, onNodeClick: (id) => calls.push(id) });
        click(t, 'a1');
        sched.tick(0);
        sched.tick(50);                 // mid-flight
        expect(sched.active.size).toBe(1);
        click(t, 'b1');                 // lands while the first focus is running
        expect(calls).toEqual(['a1', 'b1']);
        expect(sched.active.size).toBe(2);   // today's behaviour: a SECOND timeline
    });

    test('true drops a mid-flight click: no 2nd timeline, no onNodeClick call', () => {
        const sched = manualScheduler();
        const calls = [];
        const t = makeTree({
            scheduler: sched, ignoreWhileFocusing: true, onNodeClick: (id) => calls.push(id),
        });
        click(t, 'a1');
        sched.tick(0);
        sched.tick(50);                 // mid-flight
        click(t, 'b1');                 // ignored entirely
        expect(calls).toEqual(['a1']);
        expect(sched.active.size).toBe(1);
        sched.tick(100);                // the first focus completes
        expect(t.focusId).toBe('a1');
    });

    test('the guard lifts once the focus completes — the next click focuses', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched, ignoreWhileFocusing: true });
        click(t, 'a1');
        sched.tick(0);
        sched.tick(100);                // completes → guard released
        expect(sched.active.size).toBe(0);
        click(t, 'b1');
        expect(sched.active.size).toBe(1);
        sched.tick(0);
        sched.tick(100);
        expect(t.focusId).toBe('b1');
    });

    test('dispose() releases the guard state (no latched focusing flag)', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched, ignoreWhileFocusing: true });
        t.focus('a1');
        expect(t._focusing).toBe(true);
        t.dispose();
        expect(t._focusing).toBe(false);
    });

    test('a programmatic focus() also arms the guard', () => {
        const sched = manualScheduler();
        const calls = [];
        const t = makeTree({
            scheduler: sched, ignoreWhileFocusing: true, onNodeClick: (id) => calls.push(id),
        });
        t.focus('a1');                  // programmatic, no click
        click(t, 'b1');
        expect(calls).toEqual([]);
        expect(sched.active.size).toBe(1);
    });
});

// ── guard lifecycle: release on EVERY timeline termination (BATCH_15/02) ─────
//
// The guard (and the `_active` bookkeeping behind it) is released through the
// timeline's `onSettle` hook, so it is structurally tied to termination —
// natural completion, `stop()` and `dispose()` alike.

describe('guard release on every focus-timeline termination', () => {
    test('stop() on the returned Timeline releases the guard — the next click focuses', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched, ignoreWhileFocusing: true });
        const tl = t.focus('a1');
        sched.tick(0);
        sched.tick(50);                 // mid-flight
        expect(t._focusing).toBe(true);
        expect(t._active.size).toBe(1);

        tl.stop();                      // direct cancellation — bypasses onComplete

        expect(t._focusing).toBe(false);
        expect(t._active.size).toBe(0);
        expect(sched.active.has(tl)).toBe(false);

        click(t, 'b1');                 // pre-fix: ignored forever
        expect(sched.active.size).toBe(1);
        sched.tick(0);
        sched.tick(100);
        expect(t.focusId).toBe('b1');
    });

    test('natural completion releases the guard and empties _active', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched, ignoreWhileFocusing: true });
        t.focus('a1');
        expect(t._active.size).toBe(1);
        sched.tick(0);
        sched.tick(100);
        expect(t._focusing).toBe(false);
        expect(t._active.size).toBe(0);
        expect(t.focusId).toBe('a1');
    });

    test('dispose() releases the guard and empties _active', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched, ignoreWhileFocusing: true });
        const tl = t.focus('a1');
        sched.tick(0);
        sched.tick(50);
        t.dispose();
        expect(t._focusing).toBe(false);
        expect(t._active.size).toBe(0);
        expect(sched.active.has(tl)).toBe(false);
    });

    test('stopping ONE of two stacked focuses keeps the guard armed for the other', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched });   // default: clicks stack
        const first = t.focus('a1');
        const second = t.focus('b1');
        expect(t._active.size).toBe(2);
        first.stop();
        expect(t._active.size).toBe(1);
        expect(t._active.has(second)).toBe(true);
        expect(t._focusing).toBe(true);             // the second is still in flight
        second.stop();
        expect(t._focusing).toBe(false);
        expect(t._active.size).toBe(0);
    });

    test('a stopped focus never restores its _focusId', () => {
        const sched = manualScheduler();
        const seen = [];
        const t = makeTree({ scheduler: sched, onFocus: (id) => seen.push(id) });
        const tl = t.focus('a1');
        sched.tick(0);
        sched.tick(50);
        tl.stop();
        sched.tick(100);
        sched.tick(200);
        expect(t.focusId).toBe('root');   // never settled onto 'a1'
        expect(seen).toEqual([]);
    });
});

// ── focusSync precedence over an in-flight focus() ───────────────────────────

describe('focusSync precedence', () => {
    test('focusSync() during an in-flight focus() WINS — final state is its target', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched });
        t.focus('a1');
        sched.tick(0);
        sched.tick(50);                 // mid-flight
        expect(sched.active.size).toBe(1);

        t.focusSync('c');

        expect(t.focusId).toBe('c');
        expect(t._active.size).toBe(0);
        expect(t._focusing).toBe(false);
        expect(sched.active.size).toBe(0);

        const snap = transforms(t);
        sched.tick(100);                // the superseded timeline must not resurrect
        sched.tick(200);
        expect(t.focusId).toBe('c');
        expect(transforms(t)).toEqual(snap);
    });

    test('the superseded focus never fires onFocus; focusSync fires it once', () => {
        const sched = manualScheduler();
        const seen = [];
        const t = makeTree({ scheduler: sched, onFocus: (id, info) => seen.push([id, info]) });
        t.focus('a1');
        sched.tick(0);
        sched.tick(50);
        t.focusSync('c');
        sched.tick(100);
        sched.tick(200);
        expect(seen).toEqual([['c', { previous: null, refocus: false }]]);
    });

    test('focusSync end-state equals an undisturbed focusSync from the same start', () => {
        const sched = manualScheduler();
        const disturbed = makeTree({ scheduler: sched });
        disturbed.focus('a1');
        sched.tick(0);
        sched.tick(50);
        disturbed.focusSync('b1');

        const clean = makeTree({ scheduler: manualScheduler() });
        clean.focusSync('b1');

        expect(transforms(disturbed)).toEqual(transforms(clean));
    });

    test('focusSync supersedes EVERY stacked in-flight focus', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched });
        t.focus('a1');
        t.focus('b1');
        expect(t._active.size).toBe(2);
        t.focusSync('c');
        expect(t._active.size).toBe(0);
        expect(sched.active.size).toBe(0);
        expect(t.focusId).toBe('c');
    });

    test('focusSync releases the ignoreWhileFocusing guard it supersedes', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched, ignoreWhileFocusing: true });
        t.focus('a1');
        sched.tick(0);
        sched.tick(50);
        t.focusSync('c');
        click(t, 'b1');                 // must not be dropped
        expect(sched.active.size).toBe(1);
    });

    test('focusSync on an unknown id throws WITHOUT cancelling the in-flight focus', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched });
        t.focus('a1');
        sched.tick(0);
        sched.tick(50);
        expect(() => t.focusSync('nope')).toThrow();
        expect(t._active.size).toBe(1);
        expect(sched.active.size).toBe(1);
        sched.tick(100);
        expect(t.focusId).toBe('a1');
    });
});

// ── onFocus(id, info) ────────────────────────────────────────────────────────

describe('onFocus second argument', () => {
    test('first focus reports { previous: null, refocus: false }', () => {
        const sched = manualScheduler();
        const seen = [];
        const t = makeTree({ scheduler: sched, onFocus: (id, info) => seen.push([id, info]) });
        t.focus('c');
        sched.tick(0);
        sched.tick(100);
        expect(seen).toEqual([['c', { previous: null, refocus: false }]]);
    });

    test('a second, different node reports the previous id with refocus false', () => {
        const sched = manualScheduler();
        const seen = [];
        const t = makeTree({ scheduler: sched, onFocus: (id, info) => seen.push([id, info]) });
        t.focus('c');
        sched.tick(0); sched.tick(100);
        t.focus('b1');
        sched.tick(0); sched.tick(100);
        expect(seen[1]).toEqual(['b1', { previous: 'c', refocus: false }]);
    });

    test('re-clicking the focused node reports refocus: true', () => {
        const sched = manualScheduler();
        const seen = [];
        const t = makeTree({ scheduler: sched, onFocus: (id, info) => seen.push([id, info]) });
        click(t, 'a1');
        sched.tick(0); sched.tick(100);
        click(t, 'a1');                 // re-click of the node that already holds focus
        sched.tick(0); sched.tick(100);
        expect(seen).toEqual([
            ['a1', { previous: null, refocus: false }],
            ['a1', { previous: 'a1', refocus: true }],
        ]);
    });

    test('focusSync reports the same info shape, immediately', () => {
        const seen = [];
        const t = makeTree({ scheduler: manualScheduler(), onFocus: (id, info) => seen.push([id, info]) });
        t.focusSync('b');
        expect(seen[0]).toEqual(['b', { previous: null, refocus: false }]);
        t.focusSync('b');
        expect(seen[1]).toEqual(['b', { previous: 'b', refocus: true }]);
    });

    test('a single-arity consumer is unaffected (no throw, same id argument)', () => {
        const sched = manualScheduler();
        const seen = [];
        /** Deliberately 1-arity — the pre-BATCH_14 consumer shape. */
        const legacy = (id) => { seen.push(id); };
        expect(legacy.length).toBe(1);
        const t = makeTree({ scheduler: sched, onFocus: legacy });
        expect(() => {
            t.focus('c');
            sched.tick(0);
            sched.tick(100);
        }).not.toThrow();
        expect(seen).toEqual(['c']);
    });
});

// ── Focus geometry: links and label depth ───────────────────────────────────
// Links follow the old rule: the control point on the angle of the end farther
// from the centre, at the mean of the two ends' distances (never pulled toward
// the centre). Labels deeper than `labelDepth` from the focus are hidden.

describe('focus geometry: link controls', () => {
    /** Parse `M ax ay Q qx qy bx by`. */
    function parse(d) {
        const n = d.replace(/[MQ]/g, ' ').trim().split(/\s+/).map(Number);
        return { a: { x: n[0], y: n[1] }, q: { x: n[2], y: n[3] }, b: { x: n[4], y: n[5] } };
    }
    function checkLinks(t) {
        const c = t._center;
        const dist = (p) => Math.hypot(p.x - c, p.y - c);
        for (const el of t._linkEls.values()) {
            const { a, q, b } = parse(el.getAttribute('d'));
            const far = dist(b) >= dist(a) ? b : a;
            expect(dist(q)).toBeCloseTo((dist(a) + dist(b)) / 2, 6);
            const dAng = Math.atan2(q.y - c, q.x - c) - Math.atan2(far.y - c, far.x - c);
            expect(Math.atan2(Math.sin(dAng), Math.cos(dAng))).toBeCloseTo(0, 6);
        }
    }

    test('at rest and after focusSync, every control point follows the radial rule', () => {
        const t = makeTree({ scheduler: manualScheduler() });
        checkLinks(t);
        t.focusSync('a1');
        checkLinks(t);
    });

    test('every frame of a focus transition follows the radial rule', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched });
        t.focus('a');
        for (const ts of [0, 25, 50, 75, 100]) {
            sched.tick(ts);
            checkLinks(t);
        }
    });
});

describe('focus geometry: labelDepth', () => {
    const shown = (t) => [...t._labelEls.entries()]
        .filter(([, el]) => el.getAttribute('display') !== 'none')
        .map(([id]) => id).sort();

    test('default: every label is shown, before and after a focus', () => {
        const t = makeTree({ scheduler: manualScheduler() });
        expect(shown(t)).toEqual(['a', 'a1', 'a2', 'b', 'b1', 'c', 'root']);
        t.focusSync('a1');
        expect(shown(t)).toEqual(['a', 'a1', 'a2', 'b', 'b1', 'c', 'root']);
    });

    test('labelDepth 1: only the focus and its neighbours are labelled', () => {
        const t = makeTree({ scheduler: manualScheduler(), labelDepth: 1 });
        expect(shown(t)).toEqual(['a', 'b', 'c', 'root']);
        t.focusSync('a1');
        expect(shown(t)).toEqual(['a', 'a1']);
    });

    test('an animated focus hides leaving labels at once and shows entering ones on completion', () => {
        const sched = manualScheduler();
        const t = makeTree({ scheduler: sched, labelDepth: 1 });
        t.focus('a');
        // Leaving the window (depth from a > 1): b, c. Entering: a1, a2.
        expect(shown(t)).toEqual(['a', 'root']);
        sched.tick(0);
        sched.tick(50);
        expect(shown(t)).toEqual(['a', 'root']);
        sched.tick(100);
        expect(shown(t)).toEqual(['a', 'a1', 'a2', 'root']);
    });
});

// ── Styling model (opt-in `styled`) ─────────────────────────────────────────
// The old towardsHyperTree look: a colour per branch inherited down the tree,
// links and dots in that colour, dot radius 7.5 shrinking by 1.5 per ring from
// the focus, labels on coloured pills under the dot, and a root glyph slot.

describe('styling model', () => {
    const makeStyled = (extra) => new Hypertree(svgRoot(), sampleTree(), {
        duration: 100, styled: true, scheduler: manualScheduler(), ...extra,
    });
    const fill = (t, id) => t._dotEls.get(id).getAttribute('fill');
    const r = (t, id) => Number(t._dotEls.get(id).getAttribute('r'));
    const R = (d) => (d <= 1 ? 7.5 : 7.5 / 1.5 ** (d - 1));

    test('colours: palette on the root children, inherited down, neutral root', () => {
        const t = makeStyled();
        expect(fill(t, 'root')).toBe('#5f6368');
        expect(['a', 'a1', 'a2'].map((id) => fill(t, id))).toEqual(['#3b6ea8', '#3b6ea8', '#3b6ea8']);
        expect(['b', 'b1'].map((id) => fill(t, id))).toEqual(['#d9822b', '#d9822b']);
        expect(fill(t, 'c')).toBe('#3a9e6f');
    });

    test('a node colour wins and is inherited; a coloured root is inherited, no palette', () => {
        const tree = sampleTree();
        tree.children[1].children[0].color = '#123456';
        const t1 = new Hypertree(svgRoot(), tree, { styled: true });
        expect(fill(t1, 'b1')).toBe('#123456');
        expect(fill(t1, 'b')).toBe('#d9822b');
        const tree2 = sampleTree();
        tree2.color = '#111111';
        const t2 = new Hypertree(svgRoot(), tree2, { styled: true });
        expect(['a', 'b1', 'c'].map((id) => fill(t2, id))).toEqual(['#111111', '#111111', '#111111']);
    });

    test('nodeStyle overrides a node colour before its children inherit it', () => {
        const seen = [];
        const t = makeStyled({
            nodeStyle(node, info) {
                seen.push([node.id, info.depth]);
                return node.id === 'a' ? { color: '#abcdef' } : undefined;
            },
        });
        expect(['a', 'a1', 'a2'].map((id) => fill(t, id))).toEqual(['#abcdef', '#abcdef', '#abcdef']);
        expect(seen).toContainEqual(['a1', 2]);
    });

    test('links are stroked with their child colour, width 1.5', () => {
        const t = makeStyled();
        const link = t._linkEls.get('a>a1');
        expect(link.getAttribute('stroke')).toBe('#3b6ea8');
        expect(link.getAttribute('stroke-width')).toBe('1.5');
    });

    test('dot radii: 7.5 at distance 0 and 1, then 1.5 times smaller per ring, after every focus', () => {
        const t = makeStyled();
        expect(['root', 'a', 'a1'].map((id) => r(t, id))).toEqual([R(0), R(1), R(2)]);
        t.focusSync('a1');
        const want = { a1: 0, a: 1, a2: 2, root: 2, b: 3, c: 3, b1: 4 };
        for (const [id, d] of Object.entries(want)) expect(r(t, id)).toBeCloseTo(R(d), 9);
    });

    test('radii and label offsets are lerped in every frame of a focus', () => {
        const sched = manualScheduler();
        const t = makeStyled({ scheduler: sched, easing: 'linear' });
        t.focus('a1');
        sched.tick(0); sched.tick(50);
        // b1: base distance 2 (radius 5) → distance 4 (radius 2.22).
        const mid = r(t, 'b1');
        expect(mid).toBeLessThan(R(2));
        expect(mid).toBeGreaterThan(R(4));
        expect(t._labelEls.get('b1').getAttribute('transform')).toBe(`translate(0 ${2 * mid + 15})`);
        sched.tick(100);
        expect(r(t, 'b1')).toBeCloseTo(R(4), 9);
    });

    test('labels are coloured pills with white single-line text, under the dot', () => {
        const t = makeStyled();
        const g = t._labelEls.get('a');
        const rect = g.querySelector('rect');
        const text = g.querySelector('text');
        expect(g.getAttribute('transform')).toBe('translate(0 30)');
        expect(rect.getAttribute('rx')).toBe('5');
        expect(rect.getAttribute('fill')).toBe('#3b6ea8');
        expect(Number(rect.getAttribute('height'))).toBe(22);
        expect(Number(rect.getAttribute('y'))).toBeCloseTo(-(22 - 14) / 3 - 14, 9);
        // happy-dom measures no text: the estimate is 0.55 · 14 px per character.
        const width = 'Alpha'.length * 14 * 0.55 + 10;
        expect(Number(rect.getAttribute('width'))).toBeCloseTo(width, 9);
        expect(Number(rect.getAttribute('x'))).toBeCloseTo(-width / 2, 9);
        expect(text.getAttribute('fill')).toBe('#ffffff');
        expect(text.getAttribute('font-size')).toBe('14');
        expect(text.querySelectorAll('tspan').length).toBe(0);
        expect(text.textContent).toBe('Alpha');
    });

    test('neutral defaults: the palette order and a system font', () => {
        const t = makeStyled();
        expect(t._style.palette).toEqual(['#3b6ea8', '#d9822b', '#3a9e6f', '#a4508b', '#c9a227', '#5a6b7b']);
        const text = t._labelEls.get('a').querySelector('text');
        expect(text.getAttribute('font-family')).toBe('system-ui, sans-serif');
    });

    test('a consumer palette and font replace the defaults', () => {
        const t = makeStyled({ styled: { palette: ['#010203'], fontFamily: 'Serif Face' } });
        expect(fill(t, 'a')).toBe('#010203');
        expect(fill(t, 'b')).toBe('#010203');
        expect(t._labelEls.get('a').querySelector('text').getAttribute('font-family')).toBe('Serif Face');
    });

    test('rootGlyph replaces the root dot with the given template', () => {
        const t = makeStyled({ rootGlyph: { tag: 'circle', attrs: { r: 40, fill: '#ffffff' } } });
        expect(t._dotEls.has('root')).toBe(false);
        const g = t._nodeEls.get('root');
        expect([...g.querySelectorAll('circle')].some((c) => c.getAttribute('r') === '40')).toBe(true);
    });

    test('with a rootGlyph the root has no label, whatever the focus or the label window', () => {
        for (const extra of [{}, { labelDepth: 1 }]) {
            const t = makeStyled({ rootGlyph: { tag: 'circle', attrs: { r: 40 } }, ...extra });
            expect(t._labelEls.get('root').getAttribute('display')).toBe('none');
            t.focusSync('a1');
            t.focusSync('root');
            expect(t._labelEls.get('root').getAttribute('display')).toBe('none');
        }
    });

    test('the root glyph shrinks with its distance from the focus, lerped through a focus', () => {
        const sched = manualScheduler();
        const glyph = { tag: 'circle', attrs: { r: 40 } };
        const t = makeStyled({ scheduler: sched, easing: 'linear', rootGlyph: glyph });
        const scale = () => Number(/^scale\((\S+)\)$/.exec(t._glyphEl.getAttribute('transform'))[1]);
        expect(scale()).toBe(1);                             // at the centre
        t.focus('a1');                                       // root: distance 2, R(2) = 5
        sched.tick(0); sched.tick(50);
        const mid = scale();
        expect(mid).toBeLessThan(1);
        expect(mid).toBeGreaterThan((2 * R(2)) / 100);
        sched.tick(100);
        expect(scale()).toBeCloseTo((2 * R(2)) / 100, 9);    // default rootGlyphRadius 100
        t.focusSync('root');
        expect(scale()).toBe(1);
        const t2 = makeStyled({ rootGlyph: glyph, rootGlyphRadius: 40 });
        t2.focusSync('a');                                   // root: distance 1, R(1) = 7.5
        expect(Number(/^scale\((\S+)\)$/.exec(t2._glyphEl.getAttribute('transform'))[1])).toBeCloseTo((2 * 7.5) / 40, 9);
    });

    test('labelDepth still hides whole pill groups', () => {
        const t = makeStyled({ labelDepth: 1 });
        t.focusSync('a1');
        const shown = [...t._labelEls.entries()]
            .filter(([, el]) => el.getAttribute('display') !== 'none').map(([id]) => id).sort();
        expect(shown).toEqual(['a', 'a1']);
    });

    test('the default look is unchanged', () => {
        const t = new Hypertree(svgRoot(), sampleTree(), {});
        const dot = t._nodeEls.get('a').querySelector('circle');
        expect(dot.getAttribute('fill')).toBe('#4488cc');
        expect(t._linkEls.get('a>a1').getAttribute('stroke')).toBe('#9aa0a6');
    });
});

// ── Forest input (an array of roots) ────────────────────────────────────────
// The towards carto has three roots. An array is wrapped in an internal origin
// (the old page's logo centre): it is not content, draws no dot and no label,
// carries the rootGlyph when there is one, and focusing it returns to the
// initial view.

describe('forest input', () => {
    const forest = () => [
        { id: 'x', label: 'X', children: [{ id: 'x1' }, { id: 'x2' }] },
        { id: 'y', label: 'Y', children: [{ id: 'y1' }] },
        { id: 'z', label: 'Z' },
    ];
    const ORIGIN = () => Hypertree.FOREST_ORIGIN;

    test('positions equal the synthetic-root build, at rest and after a focus', () => {
        const a = new Hypertree(svgRoot(), forest(), {});
        const b = new Hypertree(svgRoot(), { id: ORIGIN(), children: forest() }, {});
        expect(transforms(a)).toEqual(transforms(b));
        a.focusSync('x1');
        b.focusSync('x1');
        expect(transforms(a)).toEqual(transforms(b));
    });

    test('the origin: rootId, forest flag, no dot, hidden label in both looks', () => {
        for (const extra of [{}, { styled: true }, { styled: true, labelDepth: 1 }]) {
            const t = new Hypertree(svgRoot(), forest(), extra);
            expect(t.rootId).toBe('hypertree-origin');
            expect(t.forest).toBe(true);
            const g = t._nodeEls.get(ORIGIN());
            expect(g.querySelector('circle')).toBeNull();
            expect(t._labelEls.get(ORIGIN()).getAttribute('display')).toBe('none');
            t.focusSync('x1');
            t.focusSync(ORIGIN());
            expect(t._labelEls.get(ORIGIN()).getAttribute('display')).toBe('none');
        }
    });

    test('with a rootGlyph the origin carries it, scaled off-centre', () => {
        const t = new Hypertree(svgRoot(), forest(), { styled: true, rootGlyph: { tag: 'circle', attrs: { r: 40 } } });
        expect(t._glyphEl).not.toBeNull();
        t.focusSync('x');
        expect(t._glyphEl.getAttribute('transform')).not.toBe('scale(1)');
    });

    test('focus(rootId) returns to the initial view; a click on the origin focuses it', () => {
        const sched = manualScheduler();
        const t = new Hypertree(svgRoot(), forest(), { duration: 100, scheduler: sched });
        const initial = transforms(t);
        t.focusSync('y1');
        expect(transforms(t)).not.toEqual(initial);
        click(t, ORIGIN());
        sched.tick(0); sched.tick(100);
        expect(t.focusId).toBe(ORIGIN());
        expect(transforms(t)).toEqual(initial);
    });

    test('errors: an empty forest, a reserved id, a root without an id', () => {
        expect(() => new Hypertree(svgRoot(), [], {})).toThrow('forest must have at least one root');
        expect(() => new Hypertree(svgRoot(), [{ id: 'hypertree-origin' }], {})).toThrow('reserved');
        expect(() => new Hypertree(svgRoot(), [{ id: 'a', children: [{ id: 'hypertree-origin' }] }], {})).toThrow('reserved');
        expect(() => new Hypertree(svgRoot(), [{ label: 'no id' }], {})).toThrow();
    });

    test('styled: the forest roots take their own colour or the palette', () => {
        const f = forest();
        f[1].color = '#123456';
        const t = new Hypertree(svgRoot(), f, { styled: true });
        const fill = (id) => t._dotEls.get(id).getAttribute('fill');
        expect([fill('x'), fill('x1'), fill('y'), fill('y1'), fill('z')])
            .toEqual(['#3b6ea8', '#3b6ea8', '#123456', '#123456', '#3a9e6f']);
    });

    test('the object form is unchanged: forest is false, rootId is the root id', () => {
        const t = new Hypertree(svgRoot(), sampleTree(), {});
        expect(t.forest).toBe(false);
        expect(t.rootId).toBe('root');
    });
});

// ── Node detail badges (styled) ─────────────────────────────────────────────
// The old towards page drew a link badge (`action`) and an info badge (`info`)
// right of a node's pill. A badge click reaches `onNodeDetail` and never
// focuses the node; the library never navigates.

describe('node detail badges', () => {
    function detailTree() {
        const tree = sampleTree();
        tree.children[0].action = '#page-a';
        tree.children[0].info = 'About Alpha';
        tree.children[1].info = 'About b';
        return tree;
    }
    const makeDetail = (extra) => new Hypertree(svgRoot(), detailTree(), {
        duration: 100, styled: true, scheduler: manualScheduler(), ...extra,
    });
    const badges = (t, id) => (t._detailEls.has(id) ? [...t._detailEls.get(id).childNodes] : []);

    test('styled: a link badge for action, an info badge for info, in that order', () => {
        const t = makeDetail();
        expect(badges(t, 'a').map((g) => g.getAttribute('data-kind'))).toEqual(['action', 'info']);
        expect(badges(t, 'b').map((g) => g.getAttribute('data-kind'))).toEqual(['info']);
        expect(badges(t, 'c')).toEqual([]);
        for (const g of badges(t, 'a')) {
            const circle = g.querySelector('circle');
            expect(circle.getAttribute('r')).toBe('10');
            expect(circle.getAttribute('fill')).toBe('#3b6ea8');
            const glyph = g.querySelector('[data-glyph]');
            expect(glyph.getAttribute('fill')).toBe('#ffffff');
            expect(glyph.getAttribute('transform')).toBe('translate(-10 -10)');
            expect(glyph.querySelector('path')).not.toBeNull();
            expect(g.getAttribute('cursor')).toBe('pointer');
        }
    });

    test('badgeGlyphs: a consumer glyph replaces the built-in one, per kind', () => {
        const mine = { tag: 'rect', attrs: { 'data-mine': 'yes', x: 2, y: 2, width: 16, height: 16 } };
        const t = makeDetail({ badgeGlyphs: { action: mine } });
        const [action, info] = badges(t, 'a');
        expect(action.querySelector('[data-glyph] [data-mine="yes"]')).not.toBeNull();
        // The kind left out keeps the built-in glyph.
        expect(info.querySelector('[data-glyph] [data-mine]')).toBeNull();
        expect(info.querySelector('[data-glyph] path')).not.toBeNull();
        // One template object serves every node that shows the badge.
        const t2 = makeDetail({ badgeGlyphs: { info: mine } });
        expect(badges(t2, 'a')[1].querySelector('[data-mine="yes"]')).not.toBeNull();
        expect(badges(t2, 'b')[0].querySelector('[data-mine="yes"]')).not.toBeNull();
    });

    test('the built-in glyphs differ per kind', () => {
        const t = makeDetail();
        const [action, info] = badges(t, 'a');
        const d = (g) => g.querySelector('[data-glyph] path').getAttribute('d');
        expect(d(action)).not.toBe(d(info));
    });

    test('the default look draws no badge', () => {
        const t = new Hypertree(svgRoot(), detailTree(), {});
        expect(t._detailEls.size).toBe(0);
    });

    test('badges sit right of the pill, inside the label group', () => {
        const t = makeDetail();
        const width = 'Alpha'.length * 14 * 0.55 + 10;
        const group = t._detailEls.get('a');
        expect(group.parentNode).toBe(t._labelEls.get('a'));
        expect(group.getAttribute('transform')).toBe(`translate(${width / 2 + 15} -7.5)`);
        const [first, second] = badges(t, 'a');
        expect(first.getAttribute('transform')).toBe('translate(0 0)');
        expect(second.getAttribute('transform')).toBe('translate(25 0)');
    });

    test('a badge click calls onNodeDetail, and neither focuses nor reaches onNodeClick', () => {
        const sched = manualScheduler();
        const seen = [];
        const clicks = [];
        const t = makeDetail({
            scheduler: sched,
            onNodeDetail: (id, kind, value) => seen.push([id, kind, value]),
            onNodeClick: (id) => { clicks.push(id); },
        });
        const [action, info] = badges(t, 'a');
        action.dispatchEvent(new Event('click', { bubbles: true }));
        info.dispatchEvent(new Event('click', { bubbles: true }));
        expect(seen).toEqual([['a', 'action', '#page-a'], ['a', 'info', 'About Alpha']]);
        expect(clicks).toEqual([]);
        expect(sched.active.size).toBe(0);
        expect(t.focusId).toBe('root');
    });

    test('without the hook a badge click is inert', () => {
        const sched = manualScheduler();
        const t = makeDetail({ scheduler: sched });
        badges(t, 'b')[0].dispatchEvent(new Event('click', { bubbles: true }));
        expect(sched.active.size).toBe(0);
        expect(t.focusId).toBe('root');
    });

    test('dispose removes the badge listeners', () => {
        const seen = [];
        const t = makeDetail({ onNodeDetail: (id) => seen.push(id) });
        const [action] = badges(t, 'a');
        t.dispose();
        action.dispatchEvent(new Event('click', { bubbles: true }));
        expect(seen).toEqual([]);
    });
});

// ── Lifecycle: dispose detaches what the constructor appended ────────────────

describe('dispose detaches the built subtree', () => {
    test('the built group leaves svgRoot; the reference stays readable; idempotent', () => {
        const root = svgRoot();
        const t = new Hypertree(root, sampleTree(), { scheduler: manualScheduler() });
        expect(t.el.parentNode).toBe(root);
        t.dispose();
        expect(t.el).not.toBeNull();
        expect(t.el.parentNode).toBeNull();
        expect(root.childNodes.length).toBe(0);
        expect(() => t.dispose()).not.toThrow();
    });
});
