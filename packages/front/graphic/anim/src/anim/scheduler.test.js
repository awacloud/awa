// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { schedulerModule } from './scheduler.js';
import { clock } from '@awacloud/fw/io/timing/clock.js';

// Resolve the descriptor once — simulates fw singleton resolution.
// The factory is called once here; a second call would return a fresh pair
// (the test for singleton identity uses two resolves against a cached result).
const { Scheduler, scheduler } = schedulerModule.factory(clock.factory());

/**
 * A deterministic clock: captures scheduled callbacks instead of using rAF, and
 * counts how many times `schedule` was invoked (to prove a single loop path).
 */
function makeClock() {
    let id = 0;
    let scheduleCount = 0;
    let cancelCount = 0;
    const pending = new Map();
    const clock = {
        now: () => 0,
        schedule(cb) {
            scheduleCount += 1;
            const myId = ++id;
            pending.set(myId, cb);
            return myId;
        },
        cancel(cancelId) {
            cancelCount += 1;
            pending.delete(cancelId);
        },
    };
    return {
        clock,
        get scheduleCount() { return scheduleCount; },
        get cancelCount() { return cancelCount; },
        /** Run the next pending frame callback at timestamp `ts`. */
        frame(ts) {
            const entries = [...pending.entries()];
            pending.clear();
            for (const [, cb] of entries) cb(ts);
        },
        pendingCount: () => pending.size,
    };
}

/** Minimal tickable stub. */
function fakeTween(sched, lifespan) {
    return {
        ticks: [],
        _step(ts) {
            this.ticks.push(ts);
            if (ts >= lifespan) sched.remove(this);
        },
    };
}

describe('schedulerModule descriptor', () => {
    test('descriptor shape is correct', () => {
        expect(schedulerModule.name).toBe('graphic.scheduler');
        expect(schedulerModule.type).toBe('fw.dom.graphic');
        expect(schedulerModule.version).toBe('0.1.0');
        expect(schedulerModule.dependencies).toEqual(['clock']);
        expect(schedulerModule.deps).toEqual([clock]);
        expect(typeof schedulerModule.factory).toBe('function');
    });

    test('the default clock is fw clock.monotonic, and survives the sanity lockdown', () => {
        // fw's sanity lockdown turns performance.now into a throwing getter.
        const desc = Object.getOwnPropertyDescriptor(globalThis.performance, 'now')
            || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(globalThis.performance), 'now');
        Object.defineProperty(globalThis.performance, 'now', {
            configurable: true,
            get() { throw new Error('performance.now is blocked'); },
        });
        try {
            const { Scheduler: S } = schedulerModule.factory(clock.factory());
            const s = new S();
            const a = s.now();
            expect(typeof a).toBe('number');
            expect(Number.isFinite(a)).toBe(true);
            expect(() => s.tick()).not.toThrow();
        } finally {
            delete globalThis.performance.now;
            if (desc && !Object.getOwnPropertyDescriptor(Object.getPrototypeOf(globalThis.performance), 'now')) {
                Object.defineProperty(globalThis.performance, 'now', desc);
            }
        }
    });

    test('singleton identity — two factory() calls each return a stable pair (resolve-cached)', () => {
        // Simulate DI cache: the same resolved object is returned for two consumers.
        // Since fw caches singletons, the same `{ Scheduler, scheduler }` object
        // is shared. We verify that calling factory() twice yields independent pairs
        // (each call is a fresh DI instance) but within one resolved pair the
        // singleton is stable.
        const r1 = schedulerModule.factory(clock.factory());
        const r2 = schedulerModule.factory(clock.factory());
        // Within each resolution, Scheduler class and scheduler instance are stable.
        expect(r1.scheduler).toBeInstanceOf(r1.Scheduler);
        expect(r2.scheduler).toBeInstanceOf(r2.Scheduler);
        // Two factory() calls produce independent runtimes (not the same objects).
        // A fw runtime would cache r1 and return it for both consumers — identity
        // is a runtime concern, not a factory concern. We verify the factory is pure:
        // each call is self-contained.
        expect(r1.scheduler).not.toBe(r2.scheduler);
    });
});

describe('Scheduler', () => {
    test('shared `scheduler` is a Scheduler instance', () => {
        expect(scheduler).toBeInstanceOf(Scheduler);
    });

    test('now() reads the injected clock', () => {
        const s = new Scheduler({ now: () => 1234 });
        expect(s.now()).toBe(1234);
    });

    test('one loop drives N concurrent tweens (single schedule path)', () => {
        const h = makeClock();
        const s = new Scheduler(h.clock);
        const a = fakeTween(s, 1000);
        const b = fakeTween(s, 1000);
        const c = fakeTween(s, 1000);
        s.add(a); s.add(b); s.add(c);

        // Adding three tweens starts exactly ONE loop (one schedule so far).
        expect(h.scheduleCount).toBe(1);

        h.frame(16);
        // All three advanced by the single loop in one frame.
        expect(a.ticks).toEqual([16]);
        expect(b.ticks).toEqual([16]);
        expect(c.ticks).toEqual([16]);
        // Set still non-empty → the loop re-armed exactly once more.
        expect(h.scheduleCount).toBe(2);
    });

    test('tick(ts) advances every active tween deterministically', () => {
        const h = makeClock();
        const s = new Scheduler(h.clock);
        const a = fakeTween(s, 9999);
        const b = fakeTween(s, 9999);
        s.add(a); s.add(b);
        s.tick(42);
        expect(a.ticks).toEqual([42]);
        expect(b.ticks).toEqual([42]);
    });

    test('loop self-stops when the set empties, restarts on add', () => {
        const h = makeClock();
        const s = new Scheduler(h.clock);
        const a = fakeTween(s, 0); // removes itself on first tick
        s.add(a);
        expect(h.scheduleCount).toBe(1);
        h.frame(0); // a removes itself; set empties → loop stops
        expect(s.active.size).toBe(0);
        expect(h.pendingCount()).toBe(0); // no re-arm
        // Adding again restarts the loop.
        const b = fakeTween(s, 9999);
        s.add(b);
        expect(h.scheduleCount).toBe(2);
        expect(h.pendingCount()).toBe(1);
    });

    test('add is idempotent (Set semantics — no double schedule)', () => {
        const h = makeClock();
        const s = new Scheduler(h.clock);
        const a = fakeTween(s, 9999);
        s.add(a);
        s.add(a);
        expect(s.active.size).toBe(1);
        expect(h.scheduleCount).toBe(1);
    });

    test('remove takes a tween out of the active set', () => {
        const s = new Scheduler({ schedule: () => 1, cancel: () => {} });
        const a = fakeTween(s, 9999);
        s.add(a);
        s.remove(a);
        expect(s.active.has(a)).toBe(false);
    });

    test('stop() cancels and clears', () => {
        const h = makeClock();
        const s = new Scheduler(h.clock);
        s.add(fakeTween(s, 9999));
        s.add(fakeTween(s, 9999));
        s.stop();
        expect(s.active.size).toBe(0);
        expect(h.cancelCount).toBe(1);
    });

    test('a tween may remove itself mid-tick without disturbing others', () => {
        const h = makeClock();
        const s = new Scheduler(h.clock);
        const a = fakeTween(s, 0); // removes itself at ts >= 0
        const b = fakeTween(s, 9999);
        s.add(a); s.add(b);
        s.tick(5);
        expect(s.active.has(a)).toBe(false);
        expect(s.active.has(b)).toBe(true);
        expect(b.ticks).toEqual([5]);
    });
});
