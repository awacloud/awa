---
module: mutex
category: io/sync
dependencies: []
returns: object
worker-safe: true
status: complete
---

# mutex

> Async binary FIFO intra-context lock — exclude a critical section.

**Module** `mutex` | **Source** `packages/front/fw/src/io/sync/mutex.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const mutex = runtime.resolve('mutex');
const m = mutex.create();
// Returns: { acquire, release, tryAcquire, runExclusive, locked }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `() => MutexInstance` | New instance |
| `m.acquire` | `() => Promise<void>` | Waits for the lock |
| `m.release` | `() => void` | Releases the lock |
| `m.tryAcquire` | `() => boolean` | Acquires if free (sync) |
| `m.runExclusive` | `(fn: () => Promise<T>) => Promise<T>` | acquire → fn → release |
| `m.locked` | getter `boolean` | Lock state |

### Semantics

- `acquire`: if `locked === false`, acquires immediately (microtask); otherwise FIFO queue.
- `release` without a prior `acquire` → throws `Error('mutex: release on unlocked')`.
- `runExclusive`: guaranteed try/finally — releases even if `fn` throws.
- **Not reentrant**: an `acquire` from inside `runExclusive` → deadlock.

## Examples

### Basic critical section

```js
const mutex = runtime.resolve('mutex');
const m = mutex.create();

async function criticalOp() {
    await m.acquire();
    try {
        await updateSharedState();
    } finally {
        m.release();
    }
}
```

### With runExclusive (recommended pattern)

```js
const result = await m.runExclusive(async () => {
    const data = await readAndUpdate();
    return data;
});
```

## Worker Usage

```js
const worker = fw.createWorker(
    async function ({ libs }) {
        const m = libs.mutex.create();
        await m.runExclusive(async () => {
            // critical section in the worker
        });
    },
    { dependencies: ['mutex'] }
);
```

## Notes

- Strict FIFO queue — waiters are served in arrival order.
- Not reentrant: attempting `acquire` from inside → deadlock.
- A semaphore with 1 permit = mutex, but prefer `mutex` for clarity of intent.

## See also

- [semaphore](./semaphore.md) — N permits
- [channel](./channel.md) — producer/consumer communication
- [cancellable](./cancellable.md) — task cancellation
