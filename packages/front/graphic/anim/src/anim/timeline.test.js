// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { timelineModule } from './timeline.js';

// Resolve the timeline descriptor transitively (pulls tween + scheduler +
// easing + interpolate + svgApply + fw dom/secPolicy via deps). The Tween and
// Scheduler the tests use come from the SAME runtime the timeline was wired with.
const runtime = new ModuleRuntime();
runtime.registerDeep(timelineModule);
const { Timeline } = runtime.resolve('graphic.timeline');
const { Tween } = runtime.resolve('graphic.tween');
const { Scheduler } = runtime.resolve('graphic.scheduler');

/** A scheduler with a no-op schedule so we drive frames manually via tick(). */
function manualScheduler() {
    return new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
}

/** Build a tween whose `apply` records (label, value) pairs into `log`. */
function loggingTween(s, label, log, duration = 1000) {
    return new Tween({
        target: { setAttribute() {} },
        property: 'x', from: 0, to: 100, duration,
        apply: (v) => log.push([label, v]),
        scheduler: s,
    });
}

// ── Descriptor shape ─────────────────────────────────────────────────────────

describe('timelineModule descriptor', () => {
    test('has the frozen name / type / version', () => {
        expect(timelineModule.name).toBe('graphic.timeline');
        expect(timelineModule.type).toBe('fw.dom.graphic');
        expect(timelineModule.version).toBe('0.1.0');
    });

    test('dependencies are exactly the frozen tuple in order', () => {
        expect(timelineModule.dependencies).toEqual(['graphic.scheduler', 'graphic.tween']);
    });

    test('deps names mirror dependencies in the same order', () => {
        expect(timelineModule.deps.map(d => d.name)).toEqual(timelineModule.dependencies);
    });
});

describe('Timeline.sequence', () => {
    test('child B starts only after child A ends', () => {
        const s = manualScheduler();
        const log = [];
        const a = loggingTween(s, 'A', log, 1000);
        const b = loggingTween(s, 'B', log, 1000);
        const tl = new Timeline({ scheduler: s }).sequence([a, b]);
        tl.play();

        s.tick(0);     // A starts (offset 0); B offset is 1000, not yet
        expect(log.some(([l]) => l === 'B')).toBe(false);
        expect(a.value).toBe(0);

        s.tick(1000);  // A completes; B opens its window at elapsed 1000
        expect(a.done).toBe(true);
        // B has just started (its first tick → raw 0 → value 0).
        expect(b.value).toBe(0);
        expect(b.done).toBe(false);

        s.tick(2000);  // B completes
        expect(b.done).toBe(true);
        expect(b.value).toBe(100);
    });
});

describe('Timeline.parallel', () => {
    test('all children start together at offset 0', () => {
        const s = manualScheduler();
        const log = [];
        const a = loggingTween(s, 'A', log, 1000);
        const b = loggingTween(s, 'B', log, 1000);
        const tl = new Timeline({ scheduler: s }).parallel([a, b]);
        tl.play();

        s.tick(0);   // timeline anchors at ts 0
        s.tick(500); // both at raw 0.5
        expect(a.value).toBe(50);
        expect(b.value).toBe(50);

        s.tick(1000);
        expect(a.done).toBe(true);
        expect(b.done).toBe(true);
    });
});

describe('Timeline.stagger', () => {
    test('child i starts at i * stepMs', () => {
        const s = manualScheduler();
        const log = [];
        const a = loggingTween(s, 'A', log, 1000);
        const b = loggingTween(s, 'B', log, 1000);
        const c = loggingTween(s, 'C', log, 1000);
        const tl = new Timeline({ scheduler: s }).stagger([a, b, c], 200);
        tl.play();

        s.tick(0);   // only A (offset 0) has opened
        expect(a.value).toBe(0);
        expect(log.some(([l]) => l === 'B')).toBe(false);
        expect(log.some(([l]) => l === 'C')).toBe(false);

        s.tick(200); // B (offset 200) opens; C (offset 400) not yet
        expect(b.value).toBe(0);
        expect(log.some(([l]) => l === 'C')).toBe(false);

        s.tick(400); // C opens
        expect(c.value).toBe(0);
    });
});

describe('Timeline.add', () => {
    test('places a child at an absolute offset', () => {
        const s = manualScheduler();
        const log = [];
        const a = loggingTween(s, 'A', log, 500);
        const tl = new Timeline({ scheduler: s }).add(a, 300);
        tl.play();
        s.tick(0);   // timeline anchors at ts 0
        s.tick(200); // before the 300ms offset
        expect(log.length).toBe(0);
        s.tick(300); // window opens → first tick raw 0
        expect(a.value).toBe(0);
        s.tick(800); // offset 300 + duration 500 → done
        expect(a.done).toBe(true);
    });

    test('accepts plain TweenOptions and binds to the timeline scheduler', () => {
        const s = manualScheduler();
        const seen = [];
        const tl = new Timeline({ scheduler: s }).add({
            target: { setAttribute() {} },
            property: 'x', from: 0, to: 10, duration: 100,
            apply: (v) => seen.push(v),
        });
        tl.play();
        s.tick(0);
        s.tick(100);
        expect(seen[seen.length - 1]).toBe(10);
    });
});

describe('Timeline completion + single scheduler', () => {
    test('onComplete fires once when the last child finishes', () => {
        const s = manualScheduler();
        const log = [];
        let completes = 0;
        const a = loggingTween(s, 'A', log, 1000);
        const b = loggingTween(s, 'B', log, 1000);
        const tl = new Timeline({ scheduler: s, onComplete: () => { completes += 1; } })
            .sequence([a, b]);
        tl.play();
        s.tick(0);
        s.tick(1000);
        s.tick(2000); // last child done
        s.tick(2500); // already done — no re-fire
        expect(completes).toBe(1);
        expect(tl.done).toBe(true);
    });

    test('uses the shared scheduler — only the timeline is registered, not children', () => {
        const s = manualScheduler();
        const log = [];
        const a = loggingTween(s, 'A', log, 1000);
        const b = loggingTween(s, 'B', log, 1000);
        const tl = new Timeline({ scheduler: s }).parallel([a, b]);
        tl.play();
        // Exactly one tickable (the timeline) is on the scheduler — no second loop.
        expect(s.active.size).toBe(1);
        expect(s.active.has(tl)).toBe(true);
        expect(s.active.has(a)).toBe(false);
        expect(s.active.has(b)).toBe(false);
    });

    test('removes itself from the scheduler when complete', () => {
        const s = manualScheduler();
        const log = [];
        const a = loggingTween(s, 'A', log, 1000);
        const tl = new Timeline({ scheduler: s }).parallel([a]);
        tl.play();
        s.tick(0);
        s.tick(1000);
        expect(s.active.has(tl)).toBe(false);
    });
});

describe('Timeline#stop', () => {
    test('mid-flight: unregisters from the scheduler and further ticks do not advance children', () => {
        const s = manualScheduler();
        const log = [];
        const a = loggingTween(s, 'A', log, 1000);
        const tl = new Timeline({ scheduler: s }).parallel([a]);
        tl.play();
        s.tick(0);
        s.tick(500);
        expect(a.value).toBe(50);
        expect(s.active.has(tl)).toBe(true);

        const ret = tl.stop();
        expect(ret).toBe(tl); // chainable
        expect(s.active.has(tl)).toBe(false);

        s.tick(1000); // the timeline is no longer ticked — value stays frozen
        expect(a.value).toBe(50);
        expect(a.done).toBe(false);
    });

    test('does NOT invoke onComplete', () => {
        const s = manualScheduler();
        const log = [];
        let completes = 0;
        const a = loggingTween(s, 'A', log, 1000);
        const tl = new Timeline({ scheduler: s, onComplete: () => { completes += 1; } })
            .parallel([a]);
        tl.play();
        s.tick(0);
        s.tick(500);
        tl.stop();
        s.tick(1000);
        expect(completes).toBe(0);
        expect(tl.done).toBe(false);
    });

    test('is a no-op before play()', () => {
        const s = manualScheduler();
        const tl = new Timeline({ scheduler: s });
        expect(() => tl.stop()).not.toThrow();
        expect(s.active.has(tl)).toBe(false);
    });

    test('is a no-op (idempotent) after natural completion', () => {
        const s = manualScheduler();
        const log = [];
        let completes = 0;
        const a = loggingTween(s, 'A', log, 1000);
        const tl = new Timeline({ scheduler: s, onComplete: () => { completes += 1; } })
            .parallel([a]);
        tl.play();
        s.tick(0);
        s.tick(1000); // natural completion — self-removed, onComplete fired once
        expect(tl.done).toBe(true);
        expect(completes).toBe(1);

        tl.stop(); // idempotent no-op
        tl.stop(); // calling twice never throws
        expect(completes).toBe(1); // no re-fire
        expect(s.active.has(tl)).toBe(false);
    });

    test('calling stop() twice mid-flight is safe', () => {
        const s = manualScheduler();
        const log = [];
        const a = loggingTween(s, 'A', log, 1000);
        const tl = new Timeline({ scheduler: s }).parallel([a]);
        tl.play();
        s.tick(0);
        tl.stop();
        expect(() => tl.stop()).not.toThrow();
        expect(s.active.has(tl)).toBe(false);
    });
});

// ── onSettle: the terminal-transition hook (BATCH_15/02) ─────────────────────
//
// `onComplete` keeps its completion-ONLY contract. `onSettle` is the additive
// cleanup channel that fires on EVERY terminal transition of a play cycle —
// natural completion AND `stop()` — exactly once, and never for a timeline that
// was never played.

describe('Timeline#onSettle', () => {
    test('fires once on natural completion, BEFORE onComplete', () => {
        const s = manualScheduler();
        const log = [];
        const order = [];
        const a = loggingTween(s, 'A', log, 1000);
        const tl = new Timeline({
            scheduler: s,
            onSettle: () => order.push('settle'),
            onComplete: () => order.push('complete'),
        }).parallel([a]);
        tl.play();
        s.tick(0);
        s.tick(1000);   // terminal
        s.tick(1500);   // already done — no re-fire
        expect(order).toEqual(['settle', 'complete']);
    });

    test('fires on stop() mid-flight — the path onComplete deliberately skips', () => {
        const s = manualScheduler();
        const log = [];
        const order = [];
        const a = loggingTween(s, 'A', log, 1000);
        const tl = new Timeline({
            scheduler: s,
            onSettle: () => order.push('settle'),
            onComplete: () => order.push('complete'),
        }).parallel([a]);
        tl.play();
        s.tick(0);
        s.tick(500);
        tl.stop();
        s.tick(1000);
        expect(order).toEqual(['settle']);   // settled, NOT completed
        expect(tl.done).toBe(false);
    });

    test('stop() fires it exactly once, however many times it is called', () => {
        const s = manualScheduler();
        const log = [];
        let settles = 0;
        const a = loggingTween(s, 'A', log, 1000);
        const tl = new Timeline({ scheduler: s, onSettle: () => { settles += 1; } })
            .parallel([a]);
        tl.play();
        s.tick(0);
        tl.stop();
        tl.stop();
        tl.stop();
        expect(settles).toBe(1);
    });

    test('stop() before play() never settles (the timeline never went live)', () => {
        const s = manualScheduler();
        const log = [];
        let settles = 0;
        const a = loggingTween(s, 'A', log, 1000);
        const tl = new Timeline({ scheduler: s, onSettle: () => { settles += 1; } })
            .parallel([a]);
        tl.stop();
        expect(settles).toBe(0);
    });

    test('stop() after natural completion does not re-settle', () => {
        const s = manualScheduler();
        const log = [];
        let settles = 0;
        const a = loggingTween(s, 'A', log, 1000);
        const tl = new Timeline({ scheduler: s, onSettle: () => { settles += 1; } })
            .parallel([a]);
        tl.play();
        s.tick(0);
        s.tick(1000);
        expect(settles).toBe(1);
        tl.stop();
        tl.stop();
        expect(settles).toBe(1);
    });

    test('re-playing re-arms the hook (one settle per play cycle)', () => {
        const s = manualScheduler();
        const log = [];
        let settles = 0;
        const a = loggingTween(s, 'A', log, 1000);
        const tl = new Timeline({ scheduler: s, onSettle: () => { settles += 1; } })
            .parallel([a]);
        tl.play();
        s.tick(0);
        tl.stop();
        expect(settles).toBe(1);
        tl.play();
        s.tick(2000);
        s.tick(3000);   // natural completion of the second cycle
        expect(settles).toBe(2);
    });

    test('when it runs the timeline is already unregistered (both paths)', () => {
        const s = manualScheduler();
        const log = [];
        const seen = [];
        const mk = () => {
            const a = loggingTween(s, 'A', log, 1000);
            const tl = new Timeline({
                scheduler: s,
                onSettle: () => seen.push(s.active.has(tl)),
            }).parallel([a]);
            return tl;
        };
        const stopped = mk();
        stopped.play();
        s.tick(0);
        stopped.stop();
        const completed = mk();
        completed.play();
        s.tick(5000);
        s.tick(6000);
        expect(seen).toEqual([false, false]);
    });

    test('a timeline without onSettle behaves exactly as before', () => {
        const s = manualScheduler();
        const log = [];
        let completes = 0;
        const a = loggingTween(s, 'A', log, 1000);
        const tl = new Timeline({ scheduler: s, onComplete: () => { completes += 1; } })
            .parallel([a]);
        tl.play();
        s.tick(0);
        expect(() => { s.tick(1000); }).not.toThrow();
        expect(completes).toBe(1);
        expect(tl.done).toBe(true);
    });
});
