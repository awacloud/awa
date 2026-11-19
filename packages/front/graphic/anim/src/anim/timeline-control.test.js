// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Timeline control: its own clock (`time`, `duration`), `seek`, `pause` /
// `resume`, `timeScale`, and the `stagger` options form.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { timelineModule } from './timeline.js';

const runtime = new ModuleRuntime();
runtime.registerDeep(timelineModule);
const { Timeline } = runtime.resolve('graphic.timeline');
const { Scheduler } = runtime.resolve('graphic.scheduler');

/** A scheduler with a no-op schedule so frames are driven by tick(). */
function manualScheduler() {
    return new Scheduler({ now: () => 0, schedule: () => 1, cancel: () => {} });
}

/** A recording track: `apply` writes the value into `track.v`, and logs it. */
function track() {
    return { v: undefined, writes: 0 };
}
function opts(tr, from, to, duration, extra) {
    return {
        target: tr, property: 'v', from, to, duration,
        apply: (v, t) => { t.v = v; t.writes += 1; },
        ...extra,
    };
}

describe('Timeline clock: time and duration', () => {
    test('duration is the latest child end; time follows the frames', () => {
        const s = manualScheduler();
        const a = track();
        const b = track();
        const tl = new Timeline({ scheduler: s })
            .add(opts(a, 0, 100, 1000), 0)
            .add(opts(b, 0, 100, 500), 800);
        expect(tl.duration).toBe(1300);
        expect(tl.time).toBe(0);
        tl.play();
        s.tick(5000);
        s.tick(5400);
        expect(tl.time).toBe(400);
        expect(a.v).toBe(40);
    });

    test('an empty timeline has duration 0', () => {
        expect(new Timeline({ scheduler: manualScheduler() }).duration).toBe(0);
    });
});

describe('Timeline.seek', () => {
    test('writes every opened child at its progress', () => {
        const s = manualScheduler();
        const a = track();
        const b = track();
        const tl = new Timeline({ scheduler: s })
            .add(opts(a, 0, 100, 1000), 0)
            .add(opts(b, 0, 100, 500), 800);
        tl.seek(900);
        expect(a.v).toBe(90);
        expect(b.v).toBe(20);
        expect(tl.time).toBe(900);
    });

    test('a track holds its first child\'s from before it starts, and the live winner after', () => {
        const s = manualScheduler();
        const x = track();
        const tl = new Timeline({ scheduler: s })
            .add(opts(x, 0, 100, 1000), 0)
            .add(opts(x, 100, 200, 1000), 1000)
            .add(opts(x, 500, 600, 100), 3000);
        tl.seek(500);
        expect(x.v).toBe(50);
        tl.seek(1500);
        expect(x.v).toBe(150);
        tl.seek(2500);
        expect(x.v).toBe(200);
        tl.seek(0);
        expect(x.v).toBe(0);
    });

    test('clamps to [0, duration] and throws on a non-finite time', () => {
        const s = manualScheduler();
        const a = track();
        const tl = new Timeline({ scheduler: s }).add(opts(a, 0, 100, 1000), 0);
        tl.seek(5000);
        expect(tl.time).toBe(1000);
        expect(a.v).toBe(100);
        tl.seek(-20);
        expect(tl.time).toBe(0);
        expect(a.v).toBe(0);
        expect(() => tl.seek(NaN)).toThrow(/finite/);
        expect(() => tl.seek(Infinity)).toThrow(/finite/);
        expect(() => tl.seek('10')).toThrow(/finite/);
    });

    test('fires apply and onUpdate, never onComplete, and registers nothing', () => {
        const s = manualScheduler();
        const a = track();
        let updates = 0;
        let childDone = 0;
        let tlDone = 0;
        let settled = 0;
        const tl = new Timeline({ scheduler: s, onComplete: () => { tlDone += 1; }, onSettle: () => { settled += 1; } })
            .add(opts(a, 0, 100, 1000, { onUpdate: () => { updates += 1; }, onComplete: () => { childDone += 1; } }), 0);
        tl.seek(1000);
        expect(a.v).toBe(100);
        expect(updates).toBe(1);
        expect(childDone).toBe(0);
        expect(tlDone).toBe(0);
        expect(settled).toBe(0);
        expect(s.active.size).toBe(0);
    });

    test('agrees with live play stopped at a frame at the same time', () => {
        const build = () => {
            const s = manualScheduler();
            const tr = { x: track(), y: track(), z: track() };
            const tl = new Timeline({ scheduler: s })
                .add(opts(tr.x, 0, 100, 600, { easing: 'easeOutCubic' }), 0)
                .add(opts(tr.x, 100, 40, 300), 600)
                .add(opts(tr.y, 10, 20, 1000), 200)
                .add(opts(tr.z, 0, 1, 50), 900)
                .stagger([opts(track(), 0, 1, 100), opts(tr.z, 5, 6, 400)], 250);
            return { s, tl, tr };
        };
        for (const t of [0, 16, 333, 600, 750, 900, 1100, 1250]) {
            const live = build();
            live.tl.play();
            for (let f = 0; f <= t; f += 16) live.s.tick(10000 + f);
            live.s.tick(10000 + t);
            const seeked = build();
            seeked.tl.seek(t);
            for (const k of ['x', 'y', 'z']) {
                // A live track a child has not reached yet is untouched; seek writes the from.
                if (live.tr[k].writes > 0) expect(seeked.tr[k].v).toBeCloseTo(live.tr[k].v, 9);
            }
        }
    });
});

describe('Timeline seek while playing', () => {
    test('a forward seek to the end completes on the next frame, once', () => {
        const s = manualScheduler();
        const a = track();
        let done = 0;
        const tl = new Timeline({ scheduler: s, onComplete: () => { done += 1; } }).add(opts(a, 0, 100, 1000), 0);
        tl.play();
        s.tick(0);
        tl.seek(1000);
        s.tick(10);
        expect(tl.done).toBe(true);
        expect(done).toBe(1);
        expect(s.active.size).toBe(0);
    });

    test('a backward seek re-opens finished children and play continues from there', () => {
        const s = manualScheduler();
        const a = track();
        const b = track();
        const tl = new Timeline({ scheduler: s })
            .add(opts(a, 0, 300, 3000), 0)
            .add(opts(b, 0, 100, 200), 0);
        tl.play();
        s.tick(0);
        s.tick(1500);
        expect(b.v).toBe(100);
        tl.seek(100);
        expect(b.v).toBe(50);
        s.tick(1600);
        s.tick(1700);
        expect(tl.time).toBe(200);
        expect(a.v).toBe(20);
        expect(b.v).toBe(100);
        expect(tl.done).toBe(false);
    });
});

describe('Timeline.pause and resume', () => {
    test('pause leaves the scheduler, keeps the time, and does not settle', () => {
        const s = manualScheduler();
        const a = track();
        let settled = 0;
        const tl = new Timeline({ scheduler: s, onSettle: () => { settled += 1; } }).add(opts(a, 0, 100, 1000), 0);
        tl.play();
        s.tick(0);
        s.tick(300);
        tl.pause();
        expect(tl.paused).toBe(true);
        expect(s.active.size).toBe(0);
        expect(tl.time).toBe(300);
        expect(settled).toBe(0);
        s.tick(900);
        expect(a.v).toBe(30);
        tl.resume();
        expect(tl.paused).toBe(false);
        s.tick(5000);
        s.tick(5200);
        expect(tl.time).toBe(500);
        expect(a.v).toBe(50);
    });

    test('resume after a seek on an idle timeline plays from there', () => {
        const s = manualScheduler();
        const a = track();
        const tl = new Timeline({ scheduler: s }).add(opts(a, 0, 100, 1000), 0);
        tl.seek(700);
        tl.resume();
        s.tick(5000);
        s.tick(5100);
        expect(tl.time).toBe(800);
        expect(a.v).toBe(80);
    });

    test('play still restarts at 0', () => {
        const s = manualScheduler();
        const a = track();
        const tl = new Timeline({ scheduler: s }).add(opts(a, 0, 100, 1000), 0);
        tl.seek(700);
        tl.play();
        s.tick(5000);
        expect(tl.time).toBe(0);
        expect(a.v).toBe(0);
    });

    test('stop on a paused timeline settles once', () => {
        const s = manualScheduler();
        let settled = 0;
        const tl = new Timeline({ scheduler: s, onSettle: () => { settled += 1; } }).add(opts(track(), 0, 1, 1000), 0);
        tl.play();
        s.tick(0);
        tl.pause();
        tl.stop();
        tl.stop();
        expect(settled).toBe(1);
    });
});

describe('Timeline.timeScale', () => {
    test('0.5 plays at half speed; 1 is the default', () => {
        const s = manualScheduler();
        const a = track();
        const tl = new Timeline({ scheduler: s }).add(opts(a, 0, 100, 1000), 0);
        expect(tl.timeScale).toBe(1);
        tl.timeScale = 0.5;
        tl.play();
        s.tick(0);
        s.tick(1000);
        expect(tl.time).toBe(500);
        expect(a.v).toBe(50);
    });

    test('a change while playing keeps the position continuous', () => {
        const s = manualScheduler();
        const a = track();
        const tl = new Timeline({ scheduler: s }).add(opts(a, 0, 100, 1000), 0);
        tl.play();
        s.tick(0);
        s.tick(400);
        tl.timeScale = 2;
        expect(tl.time).toBe(400);
        s.tick(500);
        expect(tl.time).toBe(600);
        tl.timeScale = 0;
        s.tick(900);
        expect(tl.time).toBe(600);
    });

    test('rejects anything but a finite number >= 0', () => {
        const tl = new Timeline({ scheduler: manualScheduler() });
        for (const bad of [-1, NaN, Infinity, '1', null]) {
            expect(() => { tl.timeScale = /** @type {any} */ (bad); }).toThrow(/timeScale/);
        }
        expect(tl.timeScale).toBe(1);
    });
});

describe('Timeline.stagger options', () => {
    const offsets = (tl) => tl._children.map((c) => c.offset);
    const items = (n) => Array.from({ length: n }, () => opts(track(), 0, 1, 100));

    test('the number form is unchanged', () => {
        const tl = new Timeline({ scheduler: manualScheduler() }).stagger(items(3), 100);
        expect(offsets(tl)).toEqual([0, 100, 200]);
    });

    test('from: start, end, center, edges, an index; at is a base offset', () => {
        const mk = (o) => offsets(new Timeline({ scheduler: manualScheduler() }).stagger(items(5), o));
        expect(mk({ each: 100 })).toEqual([0, 100, 200, 300, 400]);
        expect(mk({ each: 100, from: 'end' })).toEqual([400, 300, 200, 100, 0]);
        expect(mk({ each: 100, from: 'center' })).toEqual([200, 100, 0, 100, 200]);
        expect(mk({ each: 100, from: 'edges' })).toEqual([0, 100, 200, 100, 0]);
        expect(mk({ each: 100, from: 1 })).toEqual([100, 0, 100, 200, 300]);
        expect(mk({ each: 100, from: 'center', at: 50 })).toEqual([250, 150, 50, 150, 250]);
        const even = offsets(new Timeline({ scheduler: manualScheduler() }).stagger(items(4), { each: 100, from: 'center' }));
        expect(even).toEqual([150, 50, 50, 150]);
    });

    test('ease distributes the offsets over the same span', () => {
        const tl = new Timeline({ scheduler: manualScheduler() }).stagger(items(3), { each: 100, ease: (t) => t * t });
        expect(offsets(tl)).toEqual([0, 50, 200]);
        const named = new Timeline({ scheduler: manualScheduler() }).stagger(items(3), { each: 100, ease: 'steps(1, end)' });
        expect(offsets(named)).toEqual([0, 0, 200]);
    });

    test('rejects an unknown origin', () => {
        const tl = new Timeline({ scheduler: manualScheduler() });
        expect(() => tl.stagger(items(2), { each: 10, from: 'middle' })).toThrow(/from/);
        expect(() => tl.stagger(items(2), { each: 10, from: 7 })).toThrow(/from/);
    });
});
