// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { signal } from './signal.js';

describe('signal module', () => {
    test('has correct module metadata', () => {
        expect(signal.name).toBe('signal');
        expect(signal.version).toBe('1.2.0');
        expect(signal.type).toBe('fw.io.utils');
        expect(signal.dependencies).toEqual([]);
    });

    describe('create', () => {
        let s;

        test('initial value', () => {
            s = signal.factory().create(42);
            expect(s.get()).toBe(42);
        });

        test('set updates value and notifies subscribers', () => {
            s = signal.factory().create(0);
            let seen = null;
            s.subscribe((v) => { seen = v; });
            s.set(7);
            expect(s.get()).toBe(7);
            expect(seen).toBe(7);
        });

        test('set is no-op when value is equal (Object.is)', () => {
            s = signal.factory().create(1);
            let calls = 0;
            s.subscribe(() => { calls++; });
            s.set(1);
            expect(calls).toBe(0);
        });

        test('update applies a function to the current value', () => {
            s = signal.factory().create(10);
            s.update((n) => n + 5);
            expect(s.get()).toBe(15);
        });

        test('subscribe returns unsubscribe function', () => {
            s = signal.factory().create('a');
            let n = 0;
            const unsub = s.subscribe(() => { n++; });
            s.set('b');
            unsub();
            s.set('c');
            expect(n).toBe(1);
        });

        test('multiple subscribers all fire', () => {
            s = signal.factory().create(0);
            let a = 0, b = 0;
            s.subscribe(() => { a++; });
            s.subscribe(() => { b++; });
            s.set(1);
            expect(a).toBe(1);
            expect(b).toBe(1);
        });

        test('subscriber errors do not break other subscribers', () => {
            s = signal.factory().create(0);
            let b = 0;
            s.subscribe(() => { throw new Error('boom'); });
            s.subscribe(() => { b++; });
            s.set(1);
            expect(b).toBe(1);
        });

        test('custom eqFn skips when values are equivalent', () => {
            s = signal.factory().create({ n: 1 }, {
                eq: (a, b) => a.n === b.n,
            });
            let calls = 0;
            s.subscribe(() => { calls++; });
            s.set({ n: 1 });
            expect(calls).toBe(0);
            s.set({ n: 2 });
            expect(calls).toBe(1);
        });

        test('peek returns value without subscribing in derived', () => {
            const api = signal.factory();
            const a = api.create(2);
            // peek is identical to get for direct access ; the no-tracking
            // distinction only matters when used inside a derived compute().
            expect(a.peek()).toBe(2);
        });
    });

    describe('derived', () => {
        let api;
        beforeEach(() => { api = signal.factory(); });

        test('initial value is computed from deps', () => {
            const a = api.create(3);
            const d = api.derived([a], (n) => n * 2);
            expect(d.get()).toBe(6);
        });

        test('updates when a dep changes', () => {
            const a = api.create(3);
            const d = api.derived([a], (n) => n + 1);
            a.set(10);
            expect(d.get()).toBe(11);
        });

        test('multi-dep aggregates correctly', () => {
            const x = api.create(1);
            const y = api.create(2);
            const sum = api.derived([x, y], (a, b) => a + b);
            expect(sum.get()).toBe(3);
            x.set(10);
            expect(sum.get()).toBe(12);
            y.set(20);
            expect(sum.get()).toBe(30);
        });

        test('subscribers on derived fire on dep change', () => {
            const a = api.create(0);
            const d = api.derived([a], (n) => n * 10);
            let seen = null;
            d.subscribe((v) => { seen = v; });
            a.set(5);
            expect(seen).toBe(50);
        });

        test('derived is read-only (no set)', () => {
            const a = api.create(0);
            const d = api.derived([a], (n) => n);
            expect(d.set).toBeUndefined();
            expect(d.update).toBeUndefined();
        });

        test('throws on invalid deps', () => {
            expect(() => api.derived([], (x) => x)).not.toThrow();
            expect(() => api.derived([null], (x) => x)).toThrow(/deps/);
        });

        // ── dispose (BL-471) ────────────────────────────────────────────────

        test('dispose() detaches dep subscriptions (no leak)', () => {
            const a = api.create(1);
            expect(a.size).toBe(0);

            const d = api.derived([a], (n) => n * 2);
            // One subscription registered on the dep.
            expect(a.size).toBe(1);

            d.dispose();
            // Subscription detached after dispose.
            expect(a.size).toBe(0);
        });

        test('after dispose(), writing a dep does NOT invoke the stale compute', () => {
            const a = api.create(1);
            let runs = 0;
            const d = api.derived([a], (n) => { runs++; return n * 2; });
            expect(runs).toBe(1);   // initial compute
            expect(d.get()).toBe(2);

            d.dispose();
            a.set(10);               // dep write after discard
            expect(runs).toBe(1);    // compute NOT invoked again
            expect(d.get()).toBe(2); // stale last value, never recomputed
        });

        test('dispose() is idempotent', () => {
            const a = api.create(1);
            const d = api.derived([a], (n) => n);
            d.dispose();
            expect(() => d.dispose()).not.toThrow();
            // Still no subscribers after a second dispose call.
            expect(a.size).toBe(0);
        });

        test('post-dispose get()/peek() return the last computed value, never resubscribe', () => {
            const a = api.create(5);
            const d = api.derived([a], (n) => n + 1);
            expect(d.get()).toBe(6);

            d.dispose();
            expect(d.get()).toBe(6);
            expect(d.peek()).toBe(6);

            a.set(100);
            expect(d.get()).toBe(6);
            expect(d.peek()).toBe(6);
            expect(a.size).toBe(0);   // still detached — no resubscribe
        });
    });

    describe('batch', () => {
        let api;
        beforeEach(() => { api = signal.factory(); });

        test('multiple set inside batch fire subscribers ONCE with final value', () => {
            const a = api.create(0);
            let seen = [];
            a.subscribe((v) => seen.push(v));
            api.batch(() => {
                a.set(1);
                a.set(2);
                a.set(3);
            });
            // Only the final value reaches subscribers, single notification.
            expect(seen).toEqual([3]);
        });

        test('nested batch flushes only at outermost', () => {
            const a = api.create(0);
            let calls = 0;
            a.subscribe(() => { calls++; });
            api.batch(() => {
                a.set(1);
                api.batch(() => { a.set(2); });
                a.set(3);
            });
            expect(a.get()).toBe(3);
        });
    });

    // ── effect / untrack ────────────────────────────────────────────────────

    describe('effect', () => {
        test('runs immediately and re-runs on tracked changes', () => {
            const api = signal.factory();
            const a = api.create(1);
            const seen = [];
            const stop = api.effect(() => { seen.push(a.get()); });
            expect(seen).toEqual([1]);
            a.set(2);
            a.set(3);
            expect(seen).toEqual([1, 2, 3]);
            stop();
            a.set(4);
            expect(seen).toEqual([1, 2, 3]);  // detached
        });

        test('untracked reads do not subscribe', () => {
            const api = signal.factory();
            const a = api.create(1);
            const b = api.create(10);
            const seen = [];
            api.effect(() => {
                seen.push([a.get(), api.untrack(() => b.get())]);
            });
            expect(seen).toHaveLength(1);
            b.set(20);                     // not tracked
            expect(seen).toHaveLength(1);
            a.set(2);                      // tracked → re-run reads fresh b
            expect(seen).toEqual([[1, 10], [2, 20]]);
        });

        test('deps re-collected on each run (conditional reads)', () => {
            const api = signal.factory();
            const show = api.create(true);
            const name = api.create('alice');
            const seen = [];
            api.effect(() => {
                if (show.get()) seen.push(name.get());
                else            seen.push('-');
            });
            expect(seen).toEqual(['alice']);
            name.set('bob');               // tracked → re-run
            expect(seen).toEqual(['alice', 'bob']);
            show.set(false);               // re-run drops `name` from deps
            expect(seen).toEqual(['alice', 'bob', '-']);
            name.set('eve');               // not tracked anymore
            expect(seen).toEqual(['alice', 'bob', '-']);
        });

        test('handler error is swallowed (other effects keep running)', () => {
            const api = signal.factory();
            const a = api.create(0);
            api.effect(() => { if (a.get() === 1) throw new Error('boom'); });
            const seen = [];
            api.effect(() => { seen.push(a.get()); });
            a.set(1);                      // first effect throws, second still runs
            expect(seen).toEqual([0, 1]);
        });

        test('derived is NOT auto-tracking (deps stay explicit)', () => {
            // derived does not register itself as a dep of an enclosing effect
            // via its inputs ; only signals read by `effect` directly (or via
            // the derived's `get`) count.
            const api = signal.factory();
            const a = api.create(1);
            const d = api.derived([a], (n) => n * 2);
            const seen = [];
            api.effect(() => { seen.push(d.get()); });
            expect(seen).toEqual([2]);
            a.set(5);                      // derived updates → notifies → effect re-runs
            expect(seen).toEqual([2, 10]);
        });
    });

    // ── resource ────────────────────────────────────────────────────────────

    describe('resource', () => {
        test('idle → pending → resolved on success', async () => {
            const api = signal.factory();
            const r = api.resource(() => Promise.resolve('ok'));
            // After construction, autoStart triggers immediate refresh →
            // state is already 'pending' (the inner `idle` set is followed
            // synchronously by `set(pending, ...)`).
            expect(r.get().status).toBe('pending');
            await new Promise(r0 => setTimeout(r0, 0));
            expect(r.get()).toEqual({ status: 'resolved', value: 'ok', error: null });
        });

        test('rejected on throw', async () => {
            const api = signal.factory();
            const r = api.resource(() => Promise.reject(new Error('nope')));
            await new Promise(r0 => setTimeout(r0, 0));
            const s = r.get();
            expect(s.status).toBe('rejected');
            expect(s.error.message).toBe('nope');
        });

        test('refresh() re-fetches', async () => {
            const api = signal.factory();
            let n = 0;
            const r = api.resource(() => Promise.resolve(++n));
            await new Promise(r0 => setTimeout(r0, 0));
            expect(r.get().value).toBe(1);
            r.refresh();
            await new Promise(r0 => setTimeout(r0, 0));
            expect(r.get().value).toBe(2);
        });

        test('autoStart:false leaves state idle until refresh()', async () => {
            const api = signal.factory();
            const r = api.resource(() => Promise.resolve('lazy'), { autoStart: false });
            expect(r.get().status).toBe('idle');
            r.refresh();
            expect(r.get().status).toBe('pending');
            await new Promise(r0 => setTimeout(r0, 0));
            expect(r.get().status).toBe('resolved');
        });

        test('derivedAsync re-fetches when deps change', async () => {
            const api = signal.factory();
            const q = api.create('foo');
            const r = api.derivedAsync([q], (v) => Promise.resolve('hit:' + v));
            await new Promise(r0 => setTimeout(r0, 0));
            expect(r.get().value).toBe('hit:foo');

            q.set('bar');
            await new Promise(r0 => setTimeout(r0, 0));
            expect(r.get().value).toBe('hit:bar');
        });

        test('derivedAsync supersedes stale results', async () => {
            const api = signal.factory();
            const q = api.create('a');
            let n = 0;
            const r = api.derivedAsync([q], (v) => {
                n++;
                if (n === 1) return new Promise(res => setTimeout(() => res('slow:' + v), 20));
                return Promise.resolve('fast:' + v);
            });
            q.set('b');
            await new Promise(r0 => setTimeout(r0, 30));
            expect(r.get().value).toBe('fast:b');
        });

        test('derivedAsync.dispose() detaches dep subscriptions (no leak)', async () => {
            const api = signal.factory();
            const q = api.create('a');
            expect(q.size).toBe(0);

            const r = api.derivedAsync([q], (v) => Promise.resolve('hit:' + v));
            // One subscription registered on the dep.
            expect(q.size).toBe(1);

            r.dispose();
            // Subscription detached after dispose.
            expect(q.size).toBe(0);

            // Further dep changes do not trigger refresh on the disposed resource.
            await new Promise(r0 => setTimeout(r0, 0));
            const before = r.get();
            q.set('b');
            await new Promise(r0 => setTimeout(r0, 0));
            expect(r.get()).toEqual(before);
        });

        test('derivedAsync.dispose() is idempotent', () => {
            const api = signal.factory();
            const q = api.create('a');
            const r = api.derivedAsync([q], (v) => Promise.resolve(v));
            r.dispose();
            expect(() => r.dispose()).not.toThrow();
        });

        test('superseded fetch is ignored', async () => {
            const api = signal.factory();
            let calls = 0;
            // First call : slow. Second call : fast. Second should win.
            const r = api.resource(() => {
                calls++;
                if (calls === 1) return new Promise(res => setTimeout(() => res('slow'), 20));
                return Promise.resolve('fast');
            });
            r.refresh();                   // triggers second
            await new Promise(r0 => setTimeout(r0, 30));
            expect(r.get().value).toBe('fast');
        });
    });

    // ── computed ─────────────────────────────────────────────────────────────

    describe('computed', () => {
        let api;
        beforeEach(() => { api = signal.factory(); });

        test('memoization: fn runs once for N reads with no change', () => {
            const a = api.create(2);
            let runs = 0;
            const c = api.computed(() => { runs++; return a.get() * 3; });
            expect(c.get()).toBe(6);
            expect(c.get()).toBe(6);
            expect(c.get()).toBe(6);
            expect(runs).toBe(1);   // computed once, memoized thereafter
        });

        test('recomputes after a tracked source changes', () => {
            const a = api.create(1);
            let runs = 0;
            const c = api.computed(() => { runs++; return a.get() * 10; });
            expect(c.get()).toBe(10);
            expect(runs).toBe(1);
            a.set(5);
            expect(c.get()).toBe(50);
            expect(runs).toBe(2);
        });

        test('auto-tracking picks up only sources actually read (conditional dep)', () => {
            const flag = api.create(true);
            const x    = api.create(10);
            const y    = api.create(20);
            let runs = 0;
            const c = api.computed(() => {
                runs++;
                return flag.get() ? x.get() : y.get();
            });

            expect(c.get()).toBe(10);
            expect(runs).toBe(1);

            // y is not tracked; changing it does not trigger recompute.
            y.set(99);
            expect(c.get()).toBe(10);
            expect(runs).toBe(1);   // no recompute

            // Flip flag — now y is tracked, x is not.
            flag.set(false);
            expect(c.get()).toBe(99);
            expect(runs).toBe(2);

            // x is no longer tracked.
            x.set(99);
            expect(runs).toBe(2);
        });

        test('nested computed/derived/effect composition', () => {
            const a = api.create(1);
            const b = api.derived([a], n => n + 1);
            const c = api.computed(() => b.get() * 2);    // computed wraps a derived
            const seen = [];
            api.effect(() => { seen.push(c.get()); });    // effect wraps computed

            expect(seen).toEqual([4]);   // (1+1)*2 = 4
            a.set(4);
            expect(seen).toEqual([4, 10]); // (4+1)*2 = 10
        });

        test('eq suppresses equal-value notifications', () => {
            const a = api.create({ n: 1 });
            const c = api.computed(
                () => ({ n: a.get().n }),
                { eq: (x, y) => x.n === y.n }
            );
            const seen = [];
            c.subscribe(v => seen.push(v));
            c.get(); // prime

            a.set({ n: 1 });   // same n → no notification
            expect(seen).toHaveLength(0);

            a.set({ n: 2 });   // changed n → notification
            expect(seen).toHaveLength(1);
            expect(seen[0].n).toBe(2);
        });

        test('untrack excludes a source from dep collection', () => {
            const a = api.create(1);
            const b = api.create(100);
            let runs = 0;
            const c = api.computed(() => {
                runs++;
                return a.get() + api.untrack(() => b.get());
            });

            expect(c.get()).toBe(101);
            expect(runs).toBe(1);

            b.set(200);   // b is untracked — no recompute
            expect(c.get()).toBe(101);
            expect(runs).toBe(1);

            a.set(2);     // a is tracked — recompute (reads fresh b=200)
            expect(c.get()).toBe(202);
            expect(runs).toBe(2);
        });

        test('peek() returns value without registering in outer tracker', () => {
            const outer = api.create(0);
            const inner = api.create(5);
            const c = api.computed(() => inner.get() * 2);
            let runs = 0;
            // effect uses c.peek() — should NOT register c as a dep of the effect
            api.effect(() => {
                runs++;
                outer.get(); // only outer is tracked
                c.peek();    // c.peek does not register c as a dep
            });
            expect(runs).toBe(1);
            inner.set(10);  // c changes but effect did not subscribe to c
            expect(runs).toBe(1);
            outer.set(1);   // outer changes → effect re-runs
            expect(runs).toBe(2);
        });

        test('returns read-only interface (no set, no update)', () => {
            const c = api.computed(() => 42);
            expect(c.set).toBeUndefined();
            expect(c.update).toBeUndefined();
        });

        test('throws if fn is not a function', () => {
            expect(() => api.computed(42)).toThrow(/fn must be a function/);
        });

        // ── dispose (BL-471) ────────────────────────────────────────────────

        test('dispose() detaches tracked-source subscriptions (no leak)', () => {
            const a = api.create(1);
            expect(a.size).toBe(0);

            const c = api.computed(() => a.get() * 2);
            c.get();   // trigger the (lazy) initial compute + subscribe
            expect(a.size).toBe(1);

            c.dispose();
            expect(a.size).toBe(0);
        });

        test('after dispose(), writing a tracked source does NOT invoke the stale compute', () => {
            const a = api.create(1);
            let runs = 0;
            const c = api.computed(() => { runs++; return a.get() * 2; });
            expect(c.get()).toBe(2);
            expect(runs).toBe(1);

            c.dispose();
            a.set(10);                // source write after discard
            expect(runs).toBe(1);     // compute NOT invoked again
            expect(c.get()).toBe(2);  // stale last value, never recomputed
        });

        test('dispose() before the first read still prevents any later compute', () => {
            let runs = 0;
            const a = api.create(1);
            const c = api.computed(() => { runs++; return a.get(); });
            c.dispose();               // never read before dispose
            expect(runs).toBe(0);
            expect(c.get()).toBeUndefined();
            expect(c.peek()).toBeUndefined();
            expect(runs).toBe(0);      // still never computed
            expect(a.size).toBe(0);    // no subscription was ever registered
        });

        test('dispose() is idempotent', () => {
            const a = api.create(1);
            const c = api.computed(() => a.get());
            c.get();
            c.dispose();
            expect(() => c.dispose()).not.toThrow();
            expect(a.size).toBe(0);
        });

        test('post-dispose get()/peek() return the last computed value, never resubscribe', () => {
            const a = api.create(5);
            const c = api.computed(() => a.get() + 1);
            expect(c.get()).toBe(6);

            c.dispose();
            expect(c.get()).toBe(6);
            expect(c.peek()).toBe(6);

            a.set(100);
            expect(c.get()).toBe(6);
            expect(c.peek()).toBe(6);
            expect(a.size).toBe(0);    // still detached — no resubscribe
        });
    });

    // ── coalescing / scheduleNotify / flushSync ───────────────────────────────

    describe('coalescing', () => {
        let api;
        beforeEach(() => { api = signal.factory(); });

        test('sync (default): set() notifies immediately', () => {
            const a = api.create(0);
            const seen = [];
            a.subscribe(v => seen.push(v));
            a.set(1);
            a.set(2);
            expect(seen).toEqual([1, 2]);   // two immediate notifications
        });

        test('microtask mode collapses multiple set() to one notification per tick', async () => {
            const a = api.create(0);
            const seen = [];
            a.subscribe(v => seen.push(v));

            const restore = api.scheduleNotify('microtask');
            a.set(1);
            a.set(2);
            a.set(3);
            // Not yet notified — queued.
            expect(seen).toHaveLength(0);

            await Promise.resolve();
            // One notification with the latest value.
            expect(seen).toEqual([3]);
            restore();
        });

        test('flushSync() forces immediate delivery', () => {
            const a = api.create(0);
            const seen = [];
            a.subscribe(v => seen.push(v));

            const restore = api.scheduleNotify('microtask');
            a.set(1);
            a.set(2);
            expect(seen).toHaveLength(0);

            api.flushSync();
            expect(seen).toEqual([2]);   // flushed synchronously with latest value
            restore();
        });

        test('flushSync() is a no-op when nothing is pending', () => {
            expect(() => api.flushSync()).not.toThrow();
        });

        test('disposer restores previous mode', async () => {
            const a = api.create(0);
            const seen = [];
            a.subscribe(v => seen.push(v));

            const restore = api.scheduleNotify('microtask');
            restore();   // restore to sync immediately

            a.set(1);   // should be synchronous again
            expect(seen).toEqual([1]);
        });

        test('raf falls back to microtask when requestAnimationFrame is absent', async () => {
            // Bun/Node has no rAF; falling back to microtask is the expected behavior.
            // Force rAF absent for this test so it is deterministic regardless of
            // sibling test files that may register a DOM env (happy-dom) providing it.
            const hadRaf = 'requestAnimationFrame' in globalThis;
            const prevRaf = globalThis.requestAnimationFrame;
            if (hadRaf) delete globalThis.requestAnimationFrame;
            try {
                const a = api.create(0);
                const seen = [];
                a.subscribe(v => seen.push(v));

                const restore = api.scheduleNotify('raf');
                a.set(7);
                expect(seen).toHaveLength(0);  // deferred

                await Promise.resolve();
                expect(seen).toEqual([7]);     // flushed via microtask fallback
                restore();
            } finally {
                if (hadRaf) globalThis.requestAnimationFrame = prevRaf;
            }
        });

        test('batch interplay: batch flushes synchronously, no double-fire with coalescing', async () => {
            const a = api.create(0);
            const seen = [];
            a.subscribe(v => seen.push(v));

            const restore = api.scheduleNotify('microtask');
            api.batch(() => {
                a.set(1);
                a.set(2);
            });
            // batch() bypasses coalescing: its flush calls subscribers directly.
            // One synchronous notification with the final batch value.
            expect(seen).toEqual([2]);

            // Await microtask to confirm no second (coalesced) notification fires.
            await Promise.resolve();
            expect(seen).toEqual([2]);   // still just one notification
            restore();
        });

        test('multiple signals each notified once after microtask flush', async () => {
            const a = api.create(0);
            const b = api.create(0);
            const seenA = [], seenB = [];
            a.subscribe(v => seenA.push(v));
            b.subscribe(v => seenB.push(v));

            const restore = api.scheduleNotify('microtask');
            a.set(1); a.set(2);
            b.set(10); b.set(20);
            expect(seenA).toHaveLength(0);
            expect(seenB).toHaveLength(0);

            await Promise.resolve();
            expect(seenA).toEqual([2]);
            expect(seenB).toEqual([20]);
            restore();
        });
    });

    describe('inspectGraph', () => {
        let api;
        beforeEach(() => { api = signal.factory(); });

        test('is exposed on the factory instance (where the tracking state lives)', () => {
            expect(typeof api.inspectGraph).toBe('function');
            // Not a module-level export: the closure state it reads is per-instance.
            expect(signal.inspectGraph).toBeUndefined();
        });

        test('a fresh instance reports an empty graph', () => {
            const g = api.inspectGraph();
            expect(g.signals).toEqual([]);
            expect(g.effects).toEqual([]);
            expect(g.edges).toEqual([]);
        });

        test('reports exactly the known signals, effects and edges', () => {
            const a = api.create(1);
            const b = api.create(2);
            const unread = api.create(3);   // no effect depends on it

            const stopA = api.effect(() => { a.get(); });
            const stopAB = api.effect(() => { a.get(); b.get(); });

            const g = api.inspectGraph();
            expect(g.signals).toEqual([
                { id: a._graphId, kind: 'signal' },
                { id: b._graphId, kind: 'signal' },
            ]);
            expect(g.effects).toEqual([
                { id: 'e1', deps: 1 },
                { id: 'e2', deps: 2 },
            ]);
            expect(g.edges).toEqual([
                { effect: 'e1', signal: a._graphId },
                { effect: 'e2', signal: a._graphId },
                { effect: 'e2', signal: b._graphId },
            ]);
            // An unobserved signal is not a node of the EFFECT dependency graph.
            expect(g.signals.some(n => n.id === unread._graphId)).toBe(false);

            stopA();
            stopAB();
        });

        test('a computed read by an effect is reported with kind "computed"', () => {
            const n = api.create(2);
            const triple = api.computed(() => n.get() * 3);

            const stop = api.effect(() => { triple.get(); });

            const g = api.inspectGraph();
            expect(g.signals).toEqual([{ id: triple._graphId, kind: 'computed' }]);
            expect(g.signals[0].id[0]).toBe('c');
            // The computed's OWN source is tracked by the computed, not by the
            // effect — so `n` is not an edge of this effect.
            expect(g.edges).toEqual([{ effect: 'e1', signal: triple._graphId }]);

            stop();
        });

        test('the snapshot is frozen and not live: mutating it leaves the real graph intact', () => {
            const a = api.create(0);
            const stop = api.effect(() => { a.get(); });

            const g = api.inspectGraph();
            expect(Object.isFrozen(g)).toBe(true);
            expect(Object.isFrozen(g.signals)).toBe(true);
            expect(Object.isFrozen(g.effects)).toBe(true);
            expect(Object.isFrozen(g.edges)).toBe(true);
            expect(Object.isFrozen(g.signals[0])).toBe(true);
            expect(Object.isFrozen(g.edges[0])).toBe(true);

            expect(() => g.signals.push({ id: 'sX', kind: 'signal' })).toThrow();
            expect(() => g.edges.pop()).toThrow();
            expect(() => { g.signals[0].id = 'tampered'; }).toThrow();
            expect(() => { g.effects[0].deps = 99; }).toThrow();

            const again = api.inspectGraph();
            expect(again.signals).toEqual([{ id: a._graphId, kind: 'signal' }]);
            expect(again.effects).toEqual([{ id: 'e1', deps: 1 }]);
            expect(again.edges).toEqual([{ effect: 'e1', signal: a._graphId }]);
            // Two reads are independent objects, not a shared live handle.
            expect(again).not.toBe(g);
            expect(again.signals).not.toBe(g.signals);

            stop();
        });

        test('reading the graph inside an active effect adds no dependency (Heisenberg)', () => {
            const a = api.create(0);
            const b = api.create(0);

            let runsA = 0;
            let runsB = 0;
            let readInsideTracking = 0;

            const stopA = api.effect(() => { runsA++; a.get(); });
            const stopB = api.effect(() => {
                runsB++;
                b.get();
                // Read the WHOLE graph from inside a tracking context. `a` is a
                // node of that graph: an accessor walking node values through
                // the normal `get()` path would register `a` as a dep of THIS
                // effect and so change the graph it is reporting.
                api.inspectGraph();
                readInsideTracking++;
            });

            expect(runsA).toBe(1);
            expect(runsB).toBe(1);
            expect(readInsideTracking).toBe(1);   // non-vacuity: the read happened

            const before = JSON.stringify(api.inspectGraph());

            // Re-run the effect that reads the graph while tracking is active.
            b.set(1);
            expect(runsB).toBe(2);
            expect(readInsideTracking).toBe(2);

            const after = JSON.stringify(api.inspectGraph());
            expect(after).toBe(before);           // byte-identical graph

            // Topology is still exactly two disjoint edges.
            expect(JSON.parse(after).edges).toEqual([
                { effect: 'e1', signal: a._graphId },
                { effect: 'e2', signal: b._graphId },
            ]);

            // Behavioural falsification: had the graph read registered `a`,
            // this would re-run the graph-reading effect too.
            a.set(1);
            expect(runsA).toBe(2);
            expect(runsB).toBe(2);
            expect(JSON.stringify(api.inspectGraph())).toBe(before);

            stopA();
            stopB();
        });

        test('edges follow conditional re-collection on each effect run', () => {
            const flag = api.create(true);
            const x = api.create('x');
            const y = api.create('y');

            const stop = api.effect(() => { flag.get() ? x.get() : y.get(); });

            expect(api.inspectGraph().edges).toEqual([
                { effect: 'e1', signal: flag._graphId },
                { effect: 'e1', signal: x._graphId },
            ]);

            flag.set(false);
            expect(api.inspectGraph().edges).toEqual([
                { effect: 'e1', signal: flag._graphId },
                { effect: 'e1', signal: y._graphId },
            ]);

            stop();
        });

        test('stop() removes the effect and its edges from the graph', () => {
            const a = api.create(0);
            const stop1 = api.effect(() => { a.get(); });
            const stop2 = api.effect(() => { a.get(); });

            expect(api.inspectGraph().effects).toHaveLength(2);
            expect(api.inspectGraph().edges).toHaveLength(2);

            stop1();
            const g = api.inspectGraph();
            expect(g.effects).toEqual([{ id: 'e2', deps: 1 }]);
            expect(g.edges).toEqual([{ effect: 'e2', signal: a._graphId }]);
            // The signal is still a node: another live effect depends on it.
            expect(g.signals).toEqual([{ id: a._graphId, kind: 'signal' }]);

            stop2();
            const empty = api.inspectGraph();
            expect(empty.effects).toEqual([]);
            expect(empty.edges).toEqual([]);
            expect(empty.signals).toEqual([]);
        });

        test('two factory instances report independent graphs (per-instance state)', () => {
            const one = signal.factory();
            const two = signal.factory();

            const a = one.create(0);
            const stopOne = one.effect(() => { a.get(); });

            const p = two.create(0);
            const q = two.create(0);
            const stopTwo = two.effect(() => { p.get(); q.get(); });

            const gOne = one.inspectGraph();
            const gTwo = two.inspectGraph();

            expect(gOne.effects).toEqual([{ id: 'e1', deps: 1 }]);
            expect(gTwo.effects).toEqual([{ id: 'e1', deps: 2 }]);
            expect(gOne.edges).toHaveLength(1);
            expect(gTwo.edges).toHaveLength(2);
            // Ids restart per instance — they are only meaningful within one graph.
            expect(a._graphId).toBe('s1');
            expect(p._graphId).toBe('s1');
            expect(gOne.signals.map(n => n.id)).toEqual(['s1']);
            expect(gTwo.signals.map(n => n.id)).toEqual(['s1', 's2']);

            // Stopping an effect in one instance leaves the other untouched.
            stopOne();
            expect(one.inspectGraph().effects).toEqual([]);
            expect(two.inspectGraph().effects).toEqual([{ id: 'e1', deps: 2 }]);

            stopTwo();
        });
    });
});
