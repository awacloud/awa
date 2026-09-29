# IO / Sync

Synchronisation and cancellation primitives. All worker-safe.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [abort](./abort.md) | `{timeout, any, wait, race, throwIfAborted, error}` | none | AbortController helpers |
| [mutex](./mutex.md) | `{create}` | none | Async binary lock (FIFO) |
| [semaphore](./semaphore.md) | `{create}` | none | Counting semaphore with N permits |
| [channel](./channel.md) | `{create}` | none | Buffered CSP-style channel |
| [atomics](./atomics.md) | object | none | SharedArrayBuffer + Atomics helpers (cross-worker) |
| [cancellable](./cancellable.md) | `{create, race, all, pool}` | `abort` | Cancellable tasks with cleanup hooks |
| [tokenBucket](./tokenBucket.md) | `{create}` | none | Token bucket rate limiter |

## Common pattern

```js
const abort = runtime.resolve('abort');

// Timeout
const { signal } = abort.timeout(5000);
await fetch(url, { signal });

// Combine signals
const combined = abort.any(signal1, signal2);

// Race promise vs cancellation
const result = await abort.race(fetchData(), signal);
```
