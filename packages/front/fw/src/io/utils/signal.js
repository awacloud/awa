// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Lightweight reactive signals.
 *
 * A `signal` is a mutable cell of value that notifies subscribers whenever
 * its value changes. A `derived` signal recomputes from one or more source
 * signals automatically. An `effect` runs a side-effect whenever any signal
 * read inside it changes (auto-tracking). A `resource` wraps an async
 * fetcher into a signal carrying `{status, value, error}`.
 * `computed` is an auto-tracked, memoized, lazy read-only derived signal.
 * `scheduleNotify` / `flushSync` provide opt-in async coalescing.
 *
 * Design goals :
 *   - **Tiny** : ~350 lines, dependencies-explicit by default ; auto-tracking
 *     only inside `effect` / `computed` (never inside `derived` to keep that
 *     primitive predictable).
 *   - **Sync notifications** : `set()` fires subscribers synchronously by
 *     default. Opt-in async coalescing via `scheduleNotify(mode)`.
 *   - **No memory leaks** : every subscription returns an unsubscribe.
 *   - **No DOM coupling** : usable in workers ; `raf` mode degrades to
 *     microtask when `requestAnimationFrame` is absent.
 *
 * @example
 *   const sig    = runtime.resolve('signal');
 *   const count  = sig.create(0);
 *   const double = sig.derived([count], (n) => n * 2);
 *   const triple = sig.computed(() => count.get() * 3);
 *
 *   const stop = sig.effect(() => console.log('count =', count.get()));
 *   count.set(3);            // logs: count = 3
 *   stop();                  // detaches the effect
 *
 *   const users = sig.resource(() => fetch('/api/users').then(r => r.json()));
 *   users.subscribe(s => console.log(s.status, s.value));
 *
 */

/**
 * A writable reactive cell holding a value of type `T`.
 * @template T
 * @typedef {object} Signal
 * @property {() => T} get Read the value, registering as a dependency of any active effect.
 * @property {() => T} peek Read the value without registering a dependency.
 * @property {(next: T) => void} set Replace the value and notify subscribers (unless equal per `eq`).
 * @property {(fn: (current: T) => T) => void} update Set the value from a function of the current value.
 * @property {(fn: (value: T) => void) => (() => void)} subscribe Subscribe to changes; returns an unsubscribe.
 * @property {number} size Current subscriber count.
 * @property {boolean} _isSignal Internal marker.
 * @property {Set<Function>} _subs Internal subscriber set.
 * @property {string} _graphId Internal dependency-graph node id (`s<n>`).
 */

/**
 * A read-only reactive cell of type `T` (e.g. from `resource`).
 * @template T
 * @typedef {object} ReadonlySignal
 * @property {() => T} get Read the value, registering as a dependency of any active effect.
 * @property {() => T} peek Read the value without registering a dependency.
 * @property {(fn: (value: T) => void) => (() => void)} subscribe Subscribe to changes; returns an unsubscribe.
 * @property {number} size Current subscriber count.
 * @property {boolean} _isSignal Internal marker.
 * @property {Set<Function>} _subs Internal subscriber set.
 */

/**
 * A read-only reactive cell of type `T` returned by `derived`, additionally
 * disposable to detach its dependency subscriptions.
 * @template T
 * @typedef {object} DisposableReadonlySignal
 * @property {() => T} get Read the value, registering as a dependency of any active effect.
 * @property {() => T} peek Read the value without registering a dependency.
 * @property {(fn: (value: T) => void) => (() => void)} subscribe Subscribe to changes; returns an unsubscribe.
 * @property {() => void} dispose Detach all dependency subscriptions (idempotent). After
 *   `dispose()`, `get()`/`peek()` keep returning the last computed value and a dep write
 *   never recomputes it again.
 * @property {number} size Current subscriber count.
 * @property {boolean} _isSignal Internal marker.
 * @property {Set<Function>} _subs Internal subscriber set.
 */

/**
 * State carried by a `resource` / `derivedAsync` signal.
 * @template T
 * @typedef {object} ResourceState
 * @property {'idle'|'pending'|'resolved'|'rejected'} status Current fetch status.
 * @property {T|null} value Last resolved value (preserved while pending/rejected).
 * @property {Error|null} error Error from the latest rejected fetch, else null.
 */

/**
 * Read-only resource signal returned by `resource`.
 * @template T
 * @typedef {object} ResourceSignal
 * @property {() => ResourceState<T>} get Read the resource state, registering as a dependency.
 * @property {() => ResourceState<T>} peek Read the resource state without registering.
 * @property {(fn: (state: ResourceState<T>) => void) => (() => void)} subscribe Subscribe to state changes.
 * @property {() => void} refresh Trigger a new fetch (re-using this signal).
 * @property {number} size Current subscriber count.
 * @property {boolean} _isSignal Internal marker.
 * @property {Set<Function>} _subs Internal subscriber set.
 */

/**
 * Read-only async-derived resource signal returned by `derivedAsync`.
 * @template T
 * @typedef {object} DerivedAsyncSignal
 * @property {() => ResourceState<T>} get Read the resource state, registering as a dependency.
 * @property {() => ResourceState<T>} peek Read the resource state without registering.
 * @property {(fn: (state: ResourceState<T>) => void) => (() => void)} subscribe Subscribe to state changes.
 * @property {() => void} refresh Trigger a new fetch.
 * @property {() => void} dispose Detach all dependency subscriptions (idempotent).
 * @property {number} size Current subscriber count.
 * @property {boolean} _isSignal Internal marker.
 * @property {Set<Function>} _subs Internal subscriber set.
 */

/**
 * A read-only auto-tracked memoized derived signal returned by `computed`.
 * @template T
 * @typedef {object} ComputedSignal
 * @property {() => T} get Read the computed value, registering as a dependency of any active effect.
 * @property {() => T} peek Read the computed value without registering a dependency.
 * @property {(fn: (value: T) => void) => (() => void)} subscribe Subscribe to changes; returns an unsubscribe.
 * @property {() => void} dispose Detach all tracked-source subscriptions (idempotent). After
 *   `dispose()`, `get()`/`peek()` keep returning the last computed value and a source write
 *   never recomputes it again.
 * @property {number} size Current subscriber count.
 * @property {boolean} _isSignal Internal marker.
 * @property {Set<Function>} _subs Internal subscriber set.
 * @property {string} _graphId Internal dependency-graph node id (`c<n>`).
 */

/**
 * A signal node of the snapshot returned by `inspectGraph()`.
 * @typedef {object} GraphSignalNode
 * @property {string} id Stable per-factory node id — `s<n>` (`create`) or `c<n>` (`computed`).
 * @property {'signal'|'computed'} kind Which primitive minted the node.
 */

/**
 * An effect node of the snapshot returned by `inspectGraph()`.
 * @typedef {object} GraphEffectNode
 * @property {string} id Stable per-factory effect id (`e<n>`).
 * @property {number} deps Number of signals this effect currently depends on.
 */

/**
 * A directed dependency edge: the effect re-runs when the signal changes.
 * @typedef {object} GraphEdge
 * @property {string} effect Effect node id.
 * @property {string} signal Signal node id.
 */

/**
 * Frozen, defensively-copied view of one factory instance's dependency graph.
 * @typedef {object} SignalGraphSnapshot
 * @property {ReadonlyArray<GraphSignalNode>} signals Signals at least one live effect depends on.
 * @property {ReadonlyArray<GraphEffectNode>} effects Live (non-stopped) effects.
 * @property {ReadonlyArray<GraphEdge>} edges Effect → signal dependency edges.
 */

/**
 * Public shape returned by `signal.factory()` — the reactivity core.
 * @typedef {object} SignalAPI
 * @property {<T>(initial: T, opts?: { eq?: (a: T, b: T) => boolean }) => Signal<T>} create Create a writable signal.
 * @property {<T>(deps: Array<Signal<any>|ReadonlySignal<any>>, fn: (...values: any[]) => T, opts?: { eq?: (a: T, b: T) => boolean }) => DisposableReadonlySignal<T>} derived Create a read-only signal derived from explicit deps.
 * @property {(fn: () => void) => void} batch Batch multiple `set()` calls so subscribers fire once at the end.
 * @property {<T>(fn: () => T) => T} untrack Read signals without registering in the active effect.
 * @property {(fn: () => void) => (() => void)} effect Run `fn`, auto-tracking reads; returns a `stop()`.
 * @property {<T>(fetcher: () => Promise<T>, opts?: { autoStart?: boolean, eq?: (a: ResourceState<T>, b: ResourceState<T>) => boolean }) => ResourceSignal<T>} resource Wrap an async fetcher into a resource signal.
 * @property {<T>(deps: Array<Signal<any>|ReadonlySignal<any>>, fn: (...values: any[]) => T | Promise<T>, opts?: { autoStart?: boolean }) => DerivedAsyncSignal<T>} derivedAsync Async-derived resource signal.
 * @property {<T>(fn: () => T, opts?: { eq?: (a: T, b: T) => boolean }) => ComputedSignal<T>} computed Auto-tracked memoized read-only derived signal.
 * @property {(mode: 'sync'|'microtask'|'raf') => (() => void)} scheduleNotify Enable opt-in async coalescing; returns a disposer restoring the previous mode.
 * @property {() => void} flushSync Force immediate flush of any pending coalesced notifications.
 * @property {() => SignalGraphSnapshot} inspectGraph Read-only snapshot of this instance's dependency graph.
 */

export const signal = {
    name: 'signal',
    version: '1.2.0',
    type: 'fw.io.utils',
    dependencies: [],

    /** @returns {SignalAPI} */
    factory() {

        // ── Batch state (per-factory closure) ───────────────────────────────
        let _batchDepth   = 0;
        let _batchPending = null;  // Map<signal, latestValue>

        // ── Auto-tracking state (per-factory closure) ───────────────────────
        // When an effect runs, the currently-active tracker collects every
        // signal whose `get()` is called. `derived` is intentionally NOT
        // auto-tracking - its deps are explicit (predictable, no surprise
        // re-runs).
        let _currentTracker = null;   // Set<signal> | null

        // ── Async coalescing state (per-factory closure) ─────────────────────
        // Default mode is 'sync' (no coalescing). When changed via
        // `scheduleNotify(mode)`, set() records pending signals instead of
        // firing immediately. A single flush is scheduled per tick.
        let _notifyMode    = 'sync';          // 'sync' | 'microtask' | 'raf'
        let _coalescePending = null;          // Map<signal, latestValue> | null
        let _flushScheduled  = false;         // guard: only one scheduled flush per tick

        // ── Dependency-graph state (per-factory closure) ────────────────────
        // Node identity is minted at creation (`_graphId`, a plain string) and
        // the graph itself is kept ONLY on the live effects, as sets of those
        // strings — never as references to signal objects. That is deliberate:
        // an effect already retains its deps' subscriber sets, and holding the
        // signal objects too would extend their lifetime for the sake of
        // introspection. Stopped effects are removed, so this state is bounded
        // by the same lifecycle contract `effect()` already has.
        let _nodeSeq   = 0;                   // shared by create() and computed()
        let _effectSeq = 0;
        const _liveEffects = new Set();       // Set<{ id: string, deps: Set<string> }>

        /**
         * Drain the coalesce-pending map: notify each signal's subscribers
         * exactly once with its latest value. Called by the scheduled flush
         * or imperatively via `flushSync()`.
         */
        function drainCoalesced() {
            _flushScheduled = false;
            const queue = _coalescePending;
            _coalescePending = null;
            if (!queue) return;
            for (const [sig, v] of queue) {
                for (const sub of [...sig._subs]) {
                    try { sub(v); } catch { /* subscriber error never breaks others */ }
                }
            }
        }

        /**
         * Schedule a single async drain according to the current `_notifyMode`.
         * 'raf' falls back to microtask when `requestAnimationFrame` is absent
         * (e.g. workers).
         */
        function scheduleFlush() {
            if (_notifyMode === 'raf' && typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(drainCoalesced);
            } else {
                Promise.resolve().then(drainCoalesced);
            }
        }

        /**
         * Create a writable signal.
         *
         * @template T
         * @param {T} initial - Initial value.
         * @param {Object} [opts]
         * @param {(a:T,b:T)=>boolean} [opts.eq=Object.is]
         * @returns {object} signal
         */
        function create(initial, opts) {
            let value = initial;
            const eq = (opts && typeof opts.eq === 'function') ? opts.eq : Object.is;
            const subs = new Set();

            const api = {
                get() {
                    // Auto-tracking : if an effect is currently running, register
                    // this signal as one of its dependencies.
                    if (_currentTracker !== null) _currentTracker.add(api);
                    return value;
                },
                /** Read without registering a subscription in an active effect. */
                peek() { return value; },
                set(next) {
                    if (eq(value, next)) return;
                    value = next;
                    if (_batchDepth > 0) {
                        _batchPending.set(api, value);
                        return;
                    }
                    // Opt-in async coalescing: record pending; schedule one flush.
                    if (_notifyMode !== 'sync') {
                        if (_coalescePending === null) _coalescePending = new Map();
                        _coalescePending.set(api, value);
                        if (!_flushScheduled) {
                            _flushScheduled = true;
                            scheduleFlush();
                        }
                        return;
                    }
                    for (const fn of [...subs]) {
                        try { fn(value); }
                        catch { /* subscriber error never breaks others */ }
                    }
                },
                update(fn) { api.set(fn(value)); },
                subscribe(fn) {
                    if (typeof fn !== 'function') return () => {};
                    subs.add(fn);
                    return () => subs.delete(fn);
                },
                get size() { return subs.size; },
                _isSignal: true,
                _subs: subs,
                _graphId: 's' + (++_nodeSeq),
            };
            return api;
        }

        /**
         * Create a read-only signal derived from explicit deps. Recomputes
         * whenever any dep changes ; subscribers fire when the result differs
         * (per `opts.eq`).
         *
         * The returned signal exposes `dispose()` to detach the dep
         * subscriptions it holds internally (mirrors `derivedAsync`) — call it
         * when the derived signal is discarded (e.g. component unmount,
         * list-row churn) to avoid it recomputing forever on every dep write.
         * After `dispose()`, `get()`/`peek()` keep returning the last computed
         * value and never resubscribe.
         */
        function derived(deps, fn, opts) {
            if (!Array.isArray(deps) || deps.some(d => !d || !d._isSignal))
                throw new Error('signal.derived: deps must be an array of signals');
            if (typeof fn !== 'function')
                throw new Error('signal.derived: fn must be a function');

            const compute = () => fn(...deps.map(d => d.peek()));
            const inner = create(compute(), opts);

            let _disposed = false;
            const _unsubs = deps.map(d => d.subscribe(() => {
                if (_disposed) return;
                inner.set(compute());
            }));

            /**
             * Detach all dep subscriptions so the derived signal can be
             * garbage-collected. Idempotent.
             */
            function dispose() {
                if (_disposed) return;
                _disposed = true;
                for (const off of _unsubs) {
                    try { off(); } catch { /* swallow */ }
                }
                _unsubs.length = 0;
            }

            return {
                get:       inner.get,
                peek:      inner.peek,
                subscribe: inner.subscribe,
                dispose,
                get size() { return inner.size; },
                _isSignal: true,
                _subs:     inner._subs,
            };
        }

        /**
         * Batch multiple `set()` calls so subscribers fire **once** at the end.
         */
        function batch(fn) {
            if (typeof fn !== 'function') return;
            if (_batchDepth === 0) _batchPending = new Map();
            _batchDepth++;
            try { fn(); }
            finally {
                _batchDepth--;
                if (_batchDepth === 0) {
                    const queue = _batchPending;
                    _batchPending = null;
                    for (const [sig, v] of queue) {
                        for (const sub of [...sig._subs]) {
                            try { sub(v); } catch { /* swallow */ }
                        }
                    }
                }
            }
        }

        /**
         * Read a signal **without** registering as a dependency in the
         * currently-active effect. The wrapper temporarily nulls the tracker,
         * runs `fn`, then restores it.
         *
         * @template T
         * @param {() => T} fn
         * @returns {T}
         */
        function untrack(fn) {
            const prev = _currentTracker;
            _currentTracker = null;
            try { return fn(); }
            finally { _currentTracker = prev; }
        }

        /**
         * Run `fn` once, tracking every signal it reads. Re-run `fn` whenever
         * any of those signals change. Returns a `stop()` function that
         * unsubscribes from all tracked signals.
         *
         * Dependencies are **re-collected** on each run, so conditional reads
         * work correctly :
         *
         *   effect(() => {
         *     if (showName.get()) console.log(name.get());
         *     // ↑ `name` is only tracked while `showName` is true.
         *   });
         *
         * Reads done inside `untrack(...)` do NOT register.
         *
         * Errors thrown by `fn` are caught and printed via `console.error`
         * so a faulty effect cannot break unrelated effects.
         *
         * **Recursion contract.** Subscriptions to freshly-collected deps are
         * wired only AFTER `fn` returns, so a synchronous `signal.set(...)`
         * inside `fn` that targets a tracked signal does NOT re-enter the
         * effect immediately ; the value change is visible to the next read
         * via `get()`. Indirect recursion (a microtask scheduled by `fn` that
         * later mutates a tracked dep) is supported and re-runs the effect.
         * If a write must mutate a tracked signal without scheduling a
         * re-run, wrap it in `untrack(() => sig.set(v))`. There is no
         * runtime recursion guard ; consumers are responsible for avoiding
         * unbounded loops between effects and the signals they mutate.
         *
         * @param {() => void} fn
         * @returns {() => void} stop
         */
        function effect(fn) {
            if (typeof fn !== 'function')
                throw new Error('signal.effect: fn must be a function');

            const unsubscribers = new Set();
            let stopped = false;
            // Graph record for this effect: id + the ids of its current deps.
            // Registered up front so an effect is visible while its first run
            // is still in flight; removed by `stop()`.
            const record = { id: 'e' + (++_effectSeq), deps: new Set() };
            _liveEffects.add(record);

            function detach() {
                for (const off of unsubscribers) {
                    try { off(); } catch { /* swallow */ }
                }
                unsubscribers.clear();
            }

            function run() {
                if (stopped) return;
                detach();
                const deps = new Set();
                const prev = _currentTracker;
                _currentTracker = deps;
                try { fn(); }
                catch (e) {
                    try { console.error('signal.effect: handler threw', e); }
                    catch { /* swallow */ }
                }
                finally { _currentTracker = prev; }
                // Subscribe to each dep ; on any change, re-run. The graph
                // record is rebuilt from the same freshly-collected set, so
                // conditional reads are reflected edge-for-edge.
                record.deps.clear();
                for (const sig of deps) {
                    record.deps.add(sig._graphId);
                    const off = sig.subscribe(run);
                    unsubscribers.add(off);
                }
            }

            run();

            return function stop() {
                stopped = true;
                detach();
                record.deps.clear();
                _liveEffects.delete(record);
            };
        }

        /**
         * Wrap an async `fetcher` into a read-only signal carrying
         * `{ status: 'idle' | 'pending' | 'resolved' | 'rejected',
         *    value: T | null, error: Error | null }`.
         *
         * Starts in `'idle'`, calls `refresh()` to fetch. The returned signal
         * also exposes `refresh()` which triggers a new fetch (re-using the
         * same signal, so subscribers see the transition `pending → resolved`).
         *
         * Use case : SSR `<initialData>`, list refresh button, polling.
         *
         * @template T
         * @param {() => Promise<T>} fetcher
         * @param {Object} [opts]
         * @param {boolean}  [opts.autoStart=true] - Trigger the first fetch
         *   immediately on creation.
         * @param {(prev:any, next:any)=>boolean} [opts.eq] - Equality on the
         *   wrapped state (default : reference compare on `value`).
         * @returns {object} `{ get, peek, subscribe, refresh, _isSignal }`
         */
        function resource(fetcher, opts) {
            if (typeof fetcher !== 'function')
                throw new Error('signal.resource: fetcher must be a function');

            const autoStart = !(opts && opts.autoStart === false);
            // Custom eq : compare on { status, value, error } shape - a
            // setState that produces the same triple is a no-op.
            const eq = (opts && typeof opts.eq === 'function')
                ? opts.eq
                : (a, b) => a.status === b.status && a.value === b.value && a.error === b.error;

            const inner = create(
                { status: 'idle', value: null, error: null },
                { eq }
            );

            // Token to invalidate in-flight fetches when `refresh()` is called
            // again before the previous one resolves.
            let _token = 0;

            function refresh() {
                const token = ++_token;
                inner.set({
                    status: 'pending',
                    value:  inner.peek().value,  // preserve last value during loading
                    error:  null,
                });
                Promise.resolve()
                    .then(() => fetcher())
                    .then(
                        (v) => {
                            if (token !== _token) return;  // superseded
                            inner.set({ status: 'resolved', value: v, error: null });
                        },
                        (err) => {
                            if (token !== _token) return;
                            inner.set({
                                status: 'rejected',
                                value:  inner.peek().value,
                                error:  err instanceof Error ? err : new Error(String(err)),
                            });
                        }
                    );
            }

            if (autoStart) refresh();

            return {
                get:       inner.get,
                peek:      inner.peek,
                subscribe: inner.subscribe,
                refresh,
                get size() { return inner.size; },
                _isSignal: true,
                _subs:     inner._subs,
            };
        }

        /**
         * Async-derived resource - like `derived` but the compute function
         * may return a Promise. Returns a resource-shaped signal carrying
         * `{ status, value, error }`. Re-runs `fn(...deps)` whenever any dep
         * changes, with the same stale-token guard as `resource`.
         *
         * Use case : a list `query` signal + a `page` signal → a derived
         * resource that fetches the matching page.
         *
         *   const query = signal.create('foo');
         *   const page  = signal.create(1);
         *   const data  = signal.derivedAsync([query, page], (q, p) =>
         *       fetch(`/api/search?q=${q}&p=${p}`).then(r => r.json())
         *   );
         *   data.subscribe(s => console.log(s.status, s.value));
         *
         * @template T
         * @param {Array} deps - Source signals (explicit, like `derived`).
         * @param {(...values:any[]) => T | Promise<T>} fn
         * @param {Object} [opts]
         * @param {boolean} [opts.autoStart=true]
         * @returns {object} resource-shaped read-only signal with `refresh()`.
         */
        function derivedAsync(deps, fn, opts) {
            if (!Array.isArray(deps) || deps.some(d => !d || !d._isSignal))
                throw new Error('signal.derivedAsync: deps must be an array of signals');
            if (typeof fn !== 'function')
                throw new Error('signal.derivedAsync: fn must be a function');

            const r = resource(
                () => Promise.resolve().then(() => fn(...deps.map(d => d.peek()))),
                opts,
            );

            // Track every dep subscription so we can release them on dispose,
            // avoiding the leak when the resource is discarded by the caller
            // (e.g. component unmount, list-row churn).
            const _unsubs = [];
            let _disposed = false;

            for (const d of deps) {
                const off = d.subscribe(() => {
                    if (_disposed) return;
                    r.refresh();
                });
                _unsubs.push(off);
            }

            /**
             * Detach all dep subscriptions so the resource can be garbage-
             * collected. Subsequent `refresh()` calls become no-ops via the
             * `_disposed` guard. Idempotent.
             */
            function dispose() {
                if (_disposed) return;
                _disposed = true;
                for (const off of _unsubs) {
                    try { off(); } catch { /* swallow */ }
                }
                _unsubs.length = 0;
            }

            return {
                get:       r.get,
                peek:      r.peek,
                subscribe: r.subscribe,
                refresh:   r.refresh,
                dispose,
                get size() { return r.size; },
                _isSignal: true,
                _subs:     r._subs,
            };
        }

        /**
         * Auto-tracked, memoized, read-only derived signal.
         *
         * Dependencies are collected automatically (like `effect`) on each run —
         * no explicit deps array (contrast `derived`, which keeps explicit deps).
         * Lazy: recomputes on read after any tracked source changed.
         * Reading a `computed` inside an `effect` or another `computed` registers
         * it as a dependency (composable). `untrack(fn)` suppresses tracking
         * inside the compute function.
         *
         * @template T
         * @param {() => T} fn
         * @param {{ eq?: (a: T, b: T) => boolean }} [opts]
         * @returns {ComputedSignal<T>}
         */
        function computed(fn, opts) {
            if (typeof fn !== 'function')
                throw new Error('signal.computed: fn must be a function');

            const eq = (opts && typeof opts.eq === 'function') ? opts.eq : Object.is;
            /** Subscribers of this computed signal (effects / other computeds). */
            const subs = new Set();

            let _dirty = true;  // always recompute on the first read
            let _value;         // last memoized value (undefined before first run)
            let _unsubs = [];   // unsubscribers for currently-tracked deps
            let _disposed = false;

            /** Release all dep subscriptions; called before each recompute. */
            function detachDeps() {
                for (const off of _unsubs) {
                    try { off(); } catch { /* swallow */ }
                }
                _unsubs = [];
            }

            /**
             * Called by any tracked dep when it changes.
             * Eagerly recomputes so subscribers receive the fresh value, and
             * re-collects deps (supporting conditional reads).
             */
            function onDepChanged() {
                if (_disposed) return;
                if (!_dirty) _dirty = true; // guard: avoid re-entry below
                detachDeps();

                // Re-collect deps.
                const deps = new Set();
                const prevTracker = _currentTracker;
                _currentTracker = deps;
                let next;
                try { next = fn(); }
                finally { _currentTracker = prevTracker; }

                const prevVal = _value;
                _value = next;
                _dirty = false;

                // Re-subscribe with fresh dep set.
                for (const sig of deps) {
                    _unsubs.push(sig.subscribe(onDepChanged));
                }

                // Propagate to this computed's subscribers only if value changed.
                if (!eq(prevVal, next)) {
                    for (const sub of [...subs]) {
                        try { sub(next); } catch { /* swallow */ }
                    }
                }
            }

            /**
             * Perform the initial (lazy) computation: collect deps, compute value,
             * subscribe to each dep with `onDepChanged`.
             * Must be called only when `_dirty === true`.
             */
            function initialCompute() {
                detachDeps();
                const deps = new Set();
                const prevTracker = _currentTracker;
                _currentTracker = deps;
                try { _value = fn(); }
                finally { _currentTracker = prevTracker; }
                _dirty = false;
                for (const sig of deps) {
                    _unsubs.push(sig.subscribe(onDepChanged));
                }
            }

            const api = {
                get() {
                    // Register this computed as a dep of any active outer tracker.
                    if (_currentTracker !== null) _currentTracker.add(api);
                    // Post-dispose: never recompute, keep returning the last value.
                    if (_dirty && !_disposed) initialCompute();
                    return _value;
                },
                peek() {
                    // Compute without registering in any outer tracker.
                    if (_dirty && !_disposed) {
                        const prevTracker = _currentTracker;
                        _currentTracker = null;
                        initialCompute();
                        _currentTracker = prevTracker;
                    }
                    return _value;
                },
                subscribe(cb) {
                    if (typeof cb !== 'function') return () => {};
                    subs.add(cb);
                    return () => subs.delete(cb);
                },
                /**
                 * Detach all tracked-source subscriptions so this computed can
                 * be garbage-collected instead of recomputing forever on every
                 * source write. Idempotent. After `dispose()`, `get()`/`peek()`
                 * keep returning the last computed value and never resubscribe.
                 */
                dispose() {
                    if (_disposed) return;
                    _disposed = true;
                    detachDeps();
                },
                get size() { return subs.size; },
                _isSignal: true,
                _subs: subs,
                _graphId: 'c' + (++_nodeSeq),
            };

            return Object.freeze(api);
        }

        /**
         * Enable opt-in async coalescing for subsequent notifications.
         * `'microtask'` → flush via `Promise.resolve().then(…)`;
         * `'raf'` → `requestAnimationFrame` (falls back to microtask when rAF
         *   is absent, e.g. workers);
         * `'sync'` → restore default synchronous notifications.
         *
         * Returns a disposer that restores the previous mode.
         *
         * @param {'sync'|'microtask'|'raf'} mode
         * @returns {() => void}
         */
        function scheduleNotify(mode) {
            const prev = _notifyMode;
            _notifyMode = mode;
            // If switching back to sync, flush anything pending immediately.
            if (mode === 'sync' && _coalescePending !== null) {
                drainCoalesced();
            }
            return function disposer() {
                _notifyMode = prev;
                // If restoring sync, flush pending notifications immediately.
                if (prev === 'sync' && _coalescePending !== null) {
                    drainCoalesced();
                }
            };
        }

        /**
         * Force an immediate flush of any pending coalesced notifications.
         * No-op when coalescing is not active or there is nothing pending.
         */
        function flushSync() {
            drainCoalesced();
        }

        /**
         * Read-only snapshot of **this factory instance's** effect dependency
         * graph: the live effects, the signals they currently depend on, and
         * the edges between them.
         *
         * Reading the graph is **not** a reactive read. The snapshot is built
         * from the private tracking records only — no signal value is read
         * through `get()` — and the whole build additionally runs inside
         * `untrack`, so calling this from within an active `effect` or
         * `computed` can never register a dependency. An accessor that reported
         * the graph by walking it through the normal read path would change the
         * graph it reports; this one does not.
         *
         * The returned object, its arrays and every node/edge are frozen copies:
         * mutating them throws and never reaches the real tracking state.
         *
         * Scope, stated rather than implied: the graph is the **effect**
         * dependency graph. A signal appears once at least one live effect
         * depends on it, and disappears when the last one drops it or stops.
         * Signals nobody observes, and the internal deps of a `computed` (which
         * has no `stop()` handle, so registering it would outlive its usefulness
         * and retain state), are deliberately not nodes; a `computed` read by an
         * effect does appear, as a node of kind `'computed'`.
         *
         * @returns {SignalGraphSnapshot} Frozen snapshot; never a live handle.
         */
        function inspectGraph() {
            return untrack(() => {
                const signals = [];
                const effects = [];
                const edges   = [];
                const seen    = new Set();
                for (const rec of _liveEffects) {
                    effects.push(Object.freeze({ id: rec.id, deps: rec.deps.size }));
                    for (const sid of rec.deps) {
                        if (!seen.has(sid)) {
                            seen.add(sid);
                            signals.push(Object.freeze({
                                id:   sid,
                                kind: sid[0] === 'c' ? 'computed' : 'signal',
                            }));
                        }
                        edges.push(Object.freeze({ effect: rec.id, signal: sid }));
                    }
                }
                return Object.freeze({
                    signals: Object.freeze(signals),
                    effects: Object.freeze(effects),
                    edges:   Object.freeze(edges),
                });
            });
        }

        return { create, derived, batch, untrack, effect, resource, derivedAsync, computed, scheduleNotify, flushSync, inspectGraph };
    },
};
