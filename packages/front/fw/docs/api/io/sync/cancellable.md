---
module: cancellable
category: io/sync
dependencies: [abort]
returns: object
worker-safe: true
status: complete
---

# cancellable

> Cancellable async tasks with LIFO cleanup hooks, race, all, and task pool.

**Module** `cancellable` | **Source** `packages/front/fw/src/io/sync/cancellable.js` | **Deps** `abort` | **Worker-safe** yes

## Resolve

```js
const cancellable = runtime.resolve('cancellable');
// Returns: { create, race, all, pool }
```

## API

### `cancellable.create(asyncFn)` → TaskInstance

Creates a cancellable task.

```js
const task = cancellable.create(async (ctx) => {
    const conn = await openConnection();
    ctx.onCancel(() => conn.close()); // LIFO cleanup

    const data = await fetchData(url, { signal: ctx.signal });
    ctx.throwIfAborted(); // explicit cooperation point
    return process(data);
});
```

**Context `ctx`:**

| Property | Type | Description |
|----------|------|-------------|
| `ctx.signal` | `AbortSignal` | Cancellation signal |
| `ctx.onCancel(fn)` | `(fn) => void` | Registers a cleanup hook |
| `ctx.throwIfAborted()` | `() => void` | Throws AbortError if the task is cancelled |

**Task instance:**

| Method/Prop | Description |
|-------------|-------------|
| `task.run()` | `async` — executes the task. Throws if called twice |
| `task.cancel(reason?)` | `→ Promise` — cancels and runs the hooks. Idempotent |
| `task.cancelled` | getter `boolean` |
| `task.done` | getter `boolean` (resolved, rejected, or cancelled) |
| `task.signal` | getter `AbortSignal` |

**Hook semantics:**
- `onCancel`: LIFO (last registered = first called)
- Hook that throws: error logged via `console.error`, other hooks continue
- `cancel()` before `run()`: `run()` rejects immediately with AbortError, hooks **not executed**
- `onCancel` after cancel already triggered: `fn` runs at the next microtask

### `cancellable.race(...tasks)` → Promise

Runs all tasks. The first to complete (resolve or reject) wins. The others receive `cancel('cancellable: race lost')`.

### `cancellable.all(tasks)` → Promise

Runs all tasks. Resolves with `[r1, r2, …]` if all succeed. If one fails, cancels all others and rejects with the first error.

### `cancellable.pool()` → PoolInstance

| Method/Prop | Description |
|-------------|-------------|
| `pool.add(task)` | Registers and starts the task |
| `pool.cancelAll(reason?)` | `→ Promise` — cancels all, waits for cleanups |
| `pool.size` | getter `number` — tasks still active |
| `pool.cleared` | getter `boolean` — true after `cancelAll` |

Auto-cleanup: a task that finishes on its own is automatically removed from the pool.

### Cooperative cancellation

> **Important**: this module cannot force-interrupt an async function. The task must **cooperate** with `ctx.signal`.

Cooperation patterns:
1. **Pass the signal** to network APIs: `fetch(url, { signal: ctx.signal })`
2. **Check explicitly**: `ctx.throwIfAborted()` at critical logical points
3. **Wait with abort**: `await abort.race(myOperation, ctx.signal)`

### Difference from raw `abort`

| | `abort` | `cancellable` |
|--|---------|---------------|
| Signal | ✓ | via `ctx.signal` |
| Cleanup hooks | ✗ | ✓ LIFO |
| race/all composition | ✗ | ✓ |
| Pool | ✗ | ✓ |

`abort` exposes **signals**; `cancellable` adds **cleanup orchestration**.

## Examples

### Task with cleanup

```js
const cancellable = runtime.resolve('cancellable');

const task = cancellable.create(async (ctx) => {
    const ws = new WebSocket(url);
    ctx.onCancel(() => ws.close());

    const result = await new Promise((resolve, reject) => {
        ws.onmessage = e => resolve(e.data);
        ws.onerror = reject;
    });
    return result;
});

task.run().then(console.log).catch(console.error);
setTimeout(() => task.cancel(), 5000);
```

### race — first result wins

```js
const primary = cancellable.create(() => fetchPrimary(signal));
const fallback = cancellable.create(() => new Promise(r => setTimeout(() => r(cached), 100)));

const result = await cancellable.race(primary, fallback);
```

### Request pool

```js
const pool = cancellable.pool();

for (const url of urls) {
    pool.add(cancellable.create(async (ctx) => {
        return await fetch(url, { signal: ctx.signal }).then(r => r.json());
    }));
}

// Cancel everything on error or navigation
onUnload(() => pool.cancelAll('page unload'));
```

## Worker Usage

```js
const worker = fw.createWorker(
    async function ({ libs }) {
        const task = libs.cancellable.create(async (ctx) => {
            // heavy computation in worker
            ctx.throwIfAborted();
            return result;
        });
        await task.run();
    },
    { dependencies: ['cancellable'] }
);
// Note: pool is intra-context only. For cross-worker, use processRPC + serialized abort signal.
```

## Notes

- `cancel()` returns a `Promise` that resolves when all hooks have finished (useful for `pool.cancelAll`).
- Async hooks (returning a Promise) are awaited by `pool.cancelAll()` but not by standalone `task.cancel()`.
- `pool.add(task)` starts the task — do not call `task.run()` separately.

## See also

- [abort](./abort.md) — AbortSignal helpers
- [mutex](./mutex.md) — mutual exclusion
- [channel](./channel.md) — producer/consumer communication
