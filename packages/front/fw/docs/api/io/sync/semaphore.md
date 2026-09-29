---
module: semaphore
category: io/sync
dependencies: []
returns: object
worker-safe: true
status: complete
---

# semaphore

> Async N-permit FIFO semaphore — limit concurrency to a resource pool.

**Module** `semaphore` | **Source** `packages/front/fw/src/io/sync/semaphore.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const semaphore = runtime.resolve('semaphore');
const s = semaphore.create(3);
// Returns: { acquire, release, tryAcquire, runExclusive, permits, capacity }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `(n: number) => SemaphoreInstance` | New instance (n ≥ 1, integer) |
| `s.acquire` | `() => Promise<void>` | Waits for a permit |
| `s.release` | `() => void` | Releases a permit |
| `s.tryAcquire` | `() => boolean` | Acquires if permit available (sync) |
| `s.runExclusive` | `(fn: () => Promise<T>) => Promise<T>` | acquire → fn → release |
| `s.permits` | getter `number` | Currently available permits |
| `s.capacity` | getter `number` | Maximum capacity (N) |

### Semantics

- `create(n)`: throws `Error('semaphore: capacity must be an integer >= 1')` if `n < 1` or non-integer.
- `acquire`: decrements `permits` if available (microtask); otherwise FIFO queue.
- `release`: increments `permits` or passes to the next waiter. Throws `Error('semaphore: release exceeds capacity')` if `permits >= capacity`.
- `runExclusive`: guaranteed try/finally — releases even if `fn` throws.

## Examples

### Pool of 3 simultaneous connections

```js
const semaphore = runtime.resolve('semaphore');
const s = semaphore.create(3);

async function withConnection(task) {
    await s.acquire();
    try {
        return await task();
    } finally {
        s.release();
    }
}
```

### With runExclusive (recommended pattern)

```js
const result = await s.runExclusive(async () => {
    return await fetchFromPool();
});
```

### Concurrency control over a batch

```js
const semaphore = runtime.resolve('semaphore');
const s = semaphore.create(5); // max 5 requests in parallel

await Promise.all(items.map(item =>
    s.runExclusive(() => processItem(item))
));
```

## Worker Usage

```js
const worker = fw.createWorker(
    async function ({ libs }) {
        const s = libs.semaphore.create(2);
        await Promise.all([
            s.runExclusive(async () => { /* task 1 */ }),
            s.runExclusive(async () => { /* task 2 */ }),
            s.runExclusive(async () => { /* task 3 — will wait */ }),
        ]);
    },
    { dependencies: ['semaphore'] }
);
```

## Notes

- Strict FIFO queue — waiters are served in arrival order.
- `release` without a corresponding `acquire` → throws to detect imbalances.
- A semaphore with 1 permit is functionally equivalent to a mutex, but prefer [`mutex`](./mutex.md) for clarity of intent.

## See also

- [mutex](./mutex.md) — binary lock (1 permit)
- [channel](./channel.md) — producer/consumer communication
- [tokenBucket](./tokenBucket.md) — token-based rate limiting
