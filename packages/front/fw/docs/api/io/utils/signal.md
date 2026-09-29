---
module: signal
category: io/utils
dependencies: []
returns: object
worker-safe: true
status: complete
---

# signal

> Lightweight reactive signals — mutable cells with subscriptions, derived values, auto-tracking effects, and opt-in async coalescing.

**Module** `signal` | **Source** `packages/front/fw/src/io/utils/signal.js` | **Deps** none | **Worker-safe** yes

A `signal` is a mutable cell that notifies subscribers on change. `derived` recomputes from explicit dependencies. `effect` re-runs automatically via auto-tracking. `computed` is an auto-tracked, memoized, lazy read-only derived. `resource` wraps an async fetcher in a `{status, value, error}` signal. `derivedAsync` combines explicit deps with async fetching.

Notifications are **synchronous by default**. Opt-in async coalescing is available via [`scheduleNotify`](#schedulenotify--flushsync). No DOM coupling (DOM binding is delegated to `uiSession.bind`).

## Resolve

```js
const signal = runtime.resolve('signal');
// Returns: { create, derived, batch, untrack, effect, resource, derivedAsync, computed, scheduleNotify, flushSync, inspectGraph }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `(initial: T, opts?: {eq?}) => Signal<T>` | Writable signal |
| `derived` | `(deps: Signal[], fn: (...values) => T, opts?) => DisposableReadonlySignal<T>` | Explicit-deps read-only signal, disposable |
| `computed` | `(fn: () => T, opts?: {eq?}) => ComputedSignal<T>` | Auto-tracked memoized read-only signal, disposable |
| `batch` | `(fn: () => void) => void` | Defer notifications until end of batch |
| `untrack` | `(fn: () => T) => T` | Run `fn` without registering reads in any active effect |
| `effect` | `(fn: () => void) => stop` | Run `fn`, auto-track reads; returns a stop function |
| `resource` | `(fetcher: () => Promise<T>, opts?) => ResourceSignal<T>` | Async `{status, value, error}` signal |
| `derivedAsync` | `(deps: Signal[], fn: (...values) => Promise<T>, opts?) => ResourceSignal<T>` | Resource re-triggered by explicit deps |
| `scheduleNotify` | `(mode: 'sync'\|'microtask'\|'raf') => () => void` | Enable opt-in async coalescing; returns a disposer |
| `flushSync` | `() => void` | Force immediate flush of pending coalesced notifications |
| `inspectGraph` | `() => SignalGraphSnapshot` | Frozen read-only snapshot of this instance's dependency graph |

### Writable signal — methods

| Method/Prop | Signature | Description |
|-------------|-----------|-------------|
| `get` | `() => T` | Read value (registers as dependency in any active effect) |
| `peek` | `() => T` | Read value without registering as a dependency |
| `set` | `(next: T) => void` | Write; notifies if `!eq(current, next)` |
| `update` | `(fn: (v: T) => T) => void` | `set(fn(current))` |
| `subscribe` | `(fn: (v: T) => void) => () => void` | Manual subscription; returns unsubscribe |
| `size` | getter `number` | Current subscriber count |

### computed — auto-tracked memoized derived

`computed(fn, opts?)` is the auto-tracking counterpart of [`derived`](#api). The key difference:

| | `derived` | `computed` |
|---|---|---|
| Dependency declaration | Explicit array of signals | Automatic (collected by running `fn`) |
| Evaluation | Eager (re-runs on any dep change) | Lazy (re-computes only on next read after a dep changes) |
| Conditional deps | Not supported (fixed dep list) | Supported (deps re-collected on each run) |
| Composition | Can be used inside `effect` | Can be used inside `effect` or another `computed` |

`computed` returns a frozen read-only interface `{ get, peek, subscribe, dispose }`. It has no `set` or `update` method.

**Behavior**:
- Lazy: the first computation is deferred until the first `get()` or `peek()` call.
- Memoized: subsequent `get()` calls return the cached value without re-running `fn` unless a tracked source changed.
- `peek()` returns the memoized value without registering this computed as a dependency in any outer effect or computed.
- `untrack(fn)` inside the compute function excludes a read from dependency collection.
- Honors `opts.eq` (default `Object.is`) to suppress notifications when the recomputed value is equal to the previous one.
- `dispose()` detaches its tracked-source subscriptions (idempotent) — see [derived / computed — dispose()](#derived--computed--dispose).

See also: [`effect`](#api) for side-effects with auto-tracking; [`derived`](#api) for explicit-dep derived signals.

### derived / computed — dispose()

Both `derived` and `computed` subscribe internally to the signals they depend
on (explicit deps for `derived`, auto-collected tracked sources for
`computed`). Discarding one of these signals without detaching that
subscription — e.g. a component unmount, a list-row churn, a short-lived
derived value built for one render — otherwise leaves it recomputing on
**every** dep/source write, forever: a subscription leak.

Both return objects expose `dispose()` (mirroring [`derivedAsync`](#resource--statuses)) to close it:

| Signal | `dispose()` detaches |
|--------|----------------------|
| `derived([...deps], fn)` | the `subscribe()` call registered on each dep in `deps` |
| `computed(fn)` | the `subscribe()` call registered on each auto-tracked source of the last run |

`dispose()` is **idempotent** — calling it more than once is a no-op past the
first call. After `dispose()`:
- `get()` / `peek()` keep returning the **last computed value** (the value
  before disposal — `undefined` if `dispose()` was called before any read of
  a lazy `computed`).
- A subsequent dep/source `set()` never triggers a recompute and never
  resubscribes.

```js
const query = signal.create('a');
const upper = signal.derived([query], (q) => q.toUpperCase());
// ... component unmounts, or upper is discarded before the next render ...
upper.dispose();
query.set('b');       // no-op for `upper` — no stale recompute, no leak
upper.get();           // still 'A' — the last value before dispose()
```

### Resource — statuses

| Status | Description |
|--------|-------------|
| `'idle'` | Not started (when `autoStart: false`) |
| `'pending'` | Fetch in progress |
| `'resolved'` | Fetch succeeded — `value` available |
| `'rejected'` | Fetch failed — `error` available |

A resource also exposes `refresh()` to trigger a new fetch, and `derivedAsync` additionally exposes `dispose()` to detach dep subscriptions.

### Scheduling / coalescing

By default notifications are **synchronous** — `set()` calls subscribers in the same stack frame, immediately. Async coalescing is **opt-in** and **off by default**.

`scheduleNotify(mode)` activates coalescing for the current factory instance:

| Mode | Flush mechanism |
|------|----------------|
| `'sync'` | Default — no coalescing, immediate notification |
| `'microtask'` | Flush via `Promise.resolve().then(…)` (one flush per tick) |
| `'raf'` | Flush via `requestAnimationFrame` (falls back to microtask in workers where `rAF` is absent) |

Returns a **disposer** `() => void` that restores the previous mode. This enables scoped coalescing:

```js
const restore = signal.scheduleNotify('microtask');
// ... multiple set() calls coalesced into one notification per tick
restore(); // back to sync
```

`flushSync()` forces an immediate drain of any pending coalesced notifications. It is a no-op when nothing is pending or coalescing is not active.

**`batch` interaction**: `batch(fn)` always flushes synchronously at the end of the outermost batch, regardless of the active coalescing mode. This means:
- Inside a batch, `set()` accumulates as usual (no coalescing bypass).
- At batch exit, subscribers are notified synchronously (one notification per signal with its latest value).
- No double-fire occurs: the synchronous batch flush does not also enqueue a coalesced flush.

See also: [`batch`](#api) for synchronous multi-update grouping; [`effect`](#api) for reactive side-effects.

### inspectGraph — read-only dependency graph

```
inspectGraph(): SignalGraphSnapshot
```

`inspectGraph()` returns a **frozen snapshot** of the calling factory instance's effect dependency graph. It lives on the factory instance, not on the module, because the tracking state it reads is per-instance closure state (see the last bullet of [Notes](#notes)).

| Field | Type | Content |
|-------|------|---------|
| `signals` | `ReadonlyArray<{ id, kind }>` | Signals at least one live effect depends on. `kind` is `'signal'` (from `create`) or `'computed'` (from `computed`) |
| `effects` | `ReadonlyArray<{ id, deps }>` | Live (non-stopped) effects; `deps` is that effect's current dependency count |
| `edges` | `ReadonlyArray<{ effect, signal }>` | Directed edges — the effect re-runs when the signal changes |

Node ids (`s<n>`, `c<n>`, `e<n>`) are minted at creation, are stable for the lifetime of the node, and are **scoped to one factory instance** — two instances both start at `s1`/`e1` and their ids must never be compared across graphs.

**Reading the graph never creates a dependency.** This is the guarantee the accessor exists for: calling `inspectGraph()` from inside an active `effect` (or `computed`) leaves the graph byte-identical and adds no edge. The snapshot is built from the private tracking records alone — no signal value is read through `get()` — and the build additionally runs inside `untrack`. An accessor that reported the graph by walking it through the normal read path would change the graph it reports.

**The snapshot is a copy, never a live handle.** The returned object, its three arrays and every node/edge are frozen: mutating them throws (ESM is strict mode) and can never reach the real tracking structures. Two calls return two independent objects.

**Scope — what is and is not a node.** The graph is the *effect* dependency graph:

- A signal becomes a node once at least one live effect depends on it, and stops being one when the last such effect drops it or is stopped. A signal nobody observes is not a node.
- `stop()` removes the effect and all its edges immediately.
- Dependencies are re-collected on every effect run, so conditional reads are reflected edge-for-edge.
- A `computed` read by an effect appears as a node of kind `'computed'`; the sources the `computed` itself tracks are **not** edges of this graph. A `computed` has no `stop()` handle, so registering it as a dependent node would retain state past its usefulness.
- Nothing outside the live effects is retained: dependencies are recorded as plain id strings, never as references to signal objects, so introspection cannot extend any signal's lifetime.

## Examples

### Basic signal and effect

```js
const signal = runtime.resolve('signal');

const count  = signal.create(0);
const double = signal.derived([count], (n) => n * 2);

const stop = signal.effect(() => {
    console.log('count =', count.get(), '/ double =', double.get());
});
// Immediate run: count = 0 / double = 0

count.set(3);
// count = 3 / double = 6

stop(); // detach the effect
```

### computed — auto-tracked memoized derived

```js
const signal = runtime.resolve('signal');

const count  = signal.create(0);
// Contrast with derived: no explicit deps array; fn is auto-tracked on each run.
const triple = signal.computed(() => count.get() * 3);

console.log(triple.get()); // 0 (lazy: computed on first read)
count.set(4);
console.log(triple.get()); // 12 (recomputed because count changed)
console.log(triple.get()); // 12 (memoized: fn did not re-run)
```

### computed inside an effect (composition)

```js
const flag    = signal.create(true);
const nameA   = signal.create('Alice');
const nameB   = signal.create('Bob');

// Conditional auto-tracking: deps change at runtime.
const display = signal.computed(() => flag.get() ? nameA.get() : nameB.get());

signal.effect(() => console.log('display:', display.get()));
// Immediate: display: Alice

flag.set(false);
// Recomputes and effect re-runs: display: Bob

nameA.set('Charlie'); // no longer tracked — no re-run
```

### batch — single notification

```js
const x = signal.create(1);
const y = signal.create(2);

signal.batch(() => {
    x.set(10);
    y.set(20);
});
// Subscribers of x and y each receive one notification at batch exit.
```

### scheduleNotify — opt-in async coalescing

```js
// Enable microtask coalescing for this factory.
const restore = signal.scheduleNotify('microtask');

const a = signal.create(0);
a.subscribe(v => console.log('a =', v));

a.set(1);
a.set(2);
a.set(3);
// → nothing logged yet (queued)

await Promise.resolve();
// → a = 3 (one notification with the latest value)

restore(); // back to synchronous
```

### flushSync — force immediate delivery

```js
const restore = signal.scheduleNotify('microtask');
const a = signal.create(0);
a.subscribe(v => console.log('a =', v));

a.set(1); a.set(2);
signal.flushSync(); // → a = 2 (flushed synchronously right now)
restore();
```

### Async resource

```js
const users = signal.resource(() => fetch('/api/users').then(r => r.json()));

users.subscribe(s => {
    if (s.status === 'resolved') renderList(s.value);
    if (s.status === 'rejected') showError(s.error.message);
});

// Re-fetch manually
users.refresh();
```

### derivedAsync — explicit deps

```js
const query = signal.create('');
const page  = signal.create(1);

const results = signal.derivedAsync([query, page], (q, p) =>
    fetch(`/api/search?q=${q}&p=${p}`).then(r => r.json())
);

results.subscribe(s => console.log(s.status, s.value));
query.set('foo'); // automatically triggers a new fetch
```

### inspectGraph — inspect the dependency graph

```js
const signal = runtime.resolve('signal');

const count = signal.create(0);
const label = signal.create('hits');
const stop  = signal.effect(() => console.log(label.get(), count.get()));

console.log(signal.inspectGraph());
// {
//   signals: [ { id: 's2', kind: 'signal' }, { id: 's1', kind: 'signal' } ],
//   effects: [ { id: 'e1', deps: 2 } ],
//   edges:   [ { effect: 'e1', signal: 's2' }, { effect: 'e1', signal: 's1' } ]
// }

// Safe from inside a tracking context: this read registers no dependency.
signal.effect(() => {
    count.get();
    report(signal.inspectGraph());   // does not make this effect depend on s2
});

stop();
signal.inspectGraph().effects;       // e1 is gone
```

### untrack — write without re-running the effect

```js
const a = signal.create(0);
const b = signal.create(0);

signal.effect(() => {
    const val = a.get();
    signal.untrack(() => b.set(val * 2)); // b is mutated but its read is not tracked
});
```

## Worker Usage

`signal` is fully worker-safe. The `raf` coalescing mode automatically degrades to microtask when `requestAnimationFrame` is absent.

```js
const worker = fw.createWorker(
    function ({ libs }) {
        const sig   = libs.signal;
        const count = sig.create(0);

        const stop = sig.effect(() => {
            self.postMessage({ count: count.get() });
        });

        count.set(1);
        count.set(2);
        stop();
    },
    { dependencies: ['signal'] }
);
```

## Notes

- Notifications are **synchronous by default** — `set()` calls all subscribers in the same stack frame. To defer, use `batch` or `scheduleNotify('microtask')`.
- `derived` is intentionally **not auto-tracking** — its deps are explicit, making it predictable. Use `computed` when deps are conditional or dynamic.
- `computed` is **lazy**: the compute function does not run until the first `get()` or `peek()` call. Subsequent reads return the cached value until a tracked source changes.
- Each `subscribe` returns an unsubscribe function — always call it to avoid memory leaks in long-lived components.
- `effect` re-collects dependencies on every run — conditional reads are fully supported.
- `derived`, `computed` and `derivedAsync` all expose `dispose()` to detach the dep/source subscriptions they hold internally (essential on component unmount or list-row churn) — see [derived / computed — dispose()](#derived--computed--dispose). Without it, a discarded `derived`/`computed` keeps recomputing on every dep/source write forever.
- `resource` preserves the previous `value` during `'pending'` status — enables stale-while-revalidate UI patterns.
- `inspectGraph()` is a **pure read**: it registers no dependency, mutates no tracking state and returns a frozen copy — safe to call from inside an `effect`, from a devtools panel, or on a hot path. Its node ids are per-factory-instance and meaningless across instances.
- Async coalescing (`scheduleNotify`) is **opt-in and off by default**. Never enable it globally for a shared factory without understanding downstream subscribers.
- **Auto-tracking is per-factory-instance.** The active-tracker, batch-depth and coalescing state all live in the `factory()` closure, so a signal created by one `signal.factory()` instance read inside an `effect` registered on **another** instance is never tracked — the effect simply never re-runs, with no error and no warning. Resolve `signal` once and thread that instance everywhere; a second `factory()` call is a separate reactivity world. `batch()` likewise groups only the signals of its own instance, and always flushes synchronously at the end of the outermost batch.

## See also

- [`effect`](#api) — auto-tracking side effects; re-runs when tracked signals change
- [`derived`](#api) — explicit-deps read-only signal (contrast with `computed`)
- [derived / computed — dispose()](#derived--computed--dispose) — detaching dep/source subscriptions to avoid a recompute-forever leak
- [`batch`](#api) — synchronous multi-update grouping
- [`inspectGraph`](#inspectgraph--read-only-dependency-graph) — frozen read-only view of the effect dependency graph
- [eventBus](./eventBus.md) — pub/sub by topic (no read-reactivity)
- [errors](./errors.md) — error handling for guards and boundaries
- [cancellable](../sync/cancellable.md) — explicit async task cancellation
