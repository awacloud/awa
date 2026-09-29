---
module: atomics
category: io/sync
dependencies: []
returns: object
worker-safe: true
status: complete
---

# atomics

> Low-level wrapper around `SharedArrayBuffer` and `Atomics` — atomic ops + cross-worker lock.

**Module** `atomics` | **Source** `packages/front/fw/src/io/sync/atomics.js` | **Deps** none | **Worker-safe** yes

In a web environment, `SharedArrayBuffer` can only be instantiated in a **cross-origin isolated** context (see [Notes](#notes) for required COOP/COEP HTTP headers).

## Resolve

```js
const atomics = runtime.resolve('atomics');
// Returns: {
//   isSupported, shared,
//   int32, uint32, uint16, uint8,
//   load, store, add, sub, and, or, xor, exchange, compareExchange,
//   waitAsync, notify, sabLock
// }
```

## API

### Support and creation

| Method | Signature | Returns |
|--------|-----------|---------|
| `isSupported` | `() => boolean` | SAB + Atomics + isolation available |
| `shared` | `(byteLength: number) => SharedArrayBuffer \| null` | New SAB, or `null` if unsupported |
| `int32` | `(sab, byteOffset?, length?) => Int32Array` | Typed view on SAB |
| `uint32` | `(sab, byteOffset?, length?) => Uint32Array` | Typed view on SAB |
| `uint16` | `(sab, byteOffset?, length?) => Uint16Array` | Typed view on SAB |
| `uint8` | `(sab, byteOffset?, length?) => Uint8Array` | Typed view on SAB |

### Atomic operations

All delegate to `Atomics.*` with bounds validation.

| Method | Signature | Returns |
|--------|-----------|---------|
| `load` | `(typed, index)` | Current value |
| `store` | `(typed, index, value)` | Stored value |
| `add` | `(typed, index, value)` | **Previous** value |
| `sub` | `(typed, index, value)` | Previous value |
| `and` | `(typed, index, value)` | Previous value |
| `or` | `(typed, index, value)` | Previous value |
| `xor` | `(typed, index, value)` | Previous value |
| `exchange` | `(typed, index, value)` | Previous value |
| `compareExchange` | `(typed, index, expected, replacement)` | Previous value |

All throw `RangeError('atomics: index out of bounds')` if the index is out of bounds.

### Wait / Notify

| Method | Signature | Returns |
|--------|-----------|---------|
| `waitAsync` | `(int32Array, index, expectedValue, timeoutMs?) => { async, value }` | Result or Promise |
| `notify` | `(int32Array, index, count?) => number` | Number of waiters woken up |

- `waitAsync`: if native `Atomics.waitAsync` is available (Chrome 87+, recent Firefox, Bun), delegates. Otherwise returns `{ async: false, value: 'not-equal' }`.
- Possible values: `'ok'`, `'not-equal'`, `'timed-out'`.
- `notify`: `count` defaults to `Infinity`.

### Cross-worker lock

#### `atomics.sabLock(int32Array, index)` → `{ acquire, release, tryAcquire }`

Minimal spinlock/futex on an Int32 slot (0 = free, 1 = held).

| Method | Description |
|--------|-------------|
| `acquire()` | async — waits until the slot is free (waitAsync + retry) |
| `release()` | sync — releases and notifies 1 waiter |
| `tryAcquire()` | sync — acquires if free, returns `boolean` |

Not reentrant, no fairness guarantee, no built-in timeout (combine with `abort.race` if needed).

**Degraded**: if `Atomics.waitAsync` is unavailable, `acquire` uses `await Promise.resolve()` in a loop (spin-wait — acceptable under low contention).

## Examples

### Check support

```js
const atomics = runtime.resolve('atomics');
if (!atomics.isSupported()) {
    throw new Error('SharedArrayBuffer not available in this context');
}
```

### Shared counter between workers

```js
// Main thread
const atomics = runtime.resolve('atomics');
const sab = atomics.shared(16);
const counter = atomics.int32(sab);

worker.postMessage({ sab }); // transfer the SAB to the worker

// Atomic increment in the worker or main thread
const prev = atomics.add(counter, 0, 1);
```

### Cross-worker lock

```js
const sab = atomics.shared(16);
const lockSlot = atomics.int32(sab);
const lock = atomics.sabLock(lockSlot, 0);

// In each worker (after receiving the SAB via postMessage)
await lock.acquire();
try {
    // critical section
} finally {
    lock.release();
}
```

## Worker Usage

```js
// Main thread: create the SAB and pass it along
const sab = atomics.shared(64);
worker.postMessage({ sab });

// In the worker:
const worker = fw.createWorker(
    async function ({ libs, data }) {
        const a = libs.atomics;
        const arr = a.int32(data.sab);
        a.add(arr, 0, 1); // atomic increment
    },
    { dependencies: ['atomics'] }
);
```

## Notes

- This module exposes **operations**, not structures (MPMC queue, atomic ring, etc.) — those belong in `lib/`.
- No silent fallback for unavailable SAB — `isSupported()` must be checked upfront.
- `waitAsync` always returns an object `{ async, value }` — never assume `async: true`.
- **Web prerequisites (COOP/COEP)**: `SharedArrayBuffer` requires a cross-origin isolated context. Headers: `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-origin` (sub-resources). Without these headers, `isSupported()` returns `false` via `crossOriginIsolated === false`. In non-web environments (Bun/Node), the condition is not tested.
- **Security**: SAB opens Spectre vectors — COOP/COEP are precisely required to mitigate.

## See also

- [mutex](./mutex.md) — async intra-context lock
- [semaphore](./semaphore.md) — N permits intra-context
- [channel](./channel.md) — intra-context FIFO communication
