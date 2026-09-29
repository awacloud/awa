---
module: workerPool
category: process
dependencies: []
returns: object
worker-safe: partial
status: complete
---

# workerPool

> Homogeneous pool of N workers — distributes jobs FIFO, respawns on crash, cancellable.

**Module** `workerPool` | **Source** `packages/front/fw/src/process/workerPool.js` | **Deps** none | **Worker-safe** partial

The pool runs on the main thread and manages N identical workers created by a supplied factory. Each job is dispatched to the first idle worker; if none is available, the job is queued. An `AbortSignal` allows cancelling a queued or in-progress job. On worker crash (`onerror`), the current job is rejected and a replacement is created if `respawnOnCrash` is active.

## Resolve

```js
const workerPool = runtime.resolve('workerPool');
// Returns: { create }
```

## API

### `workerPool.create(opts)`

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `factory` | `() => Worker\|WorkerLike` | **required** | Function called to create each pool worker |
| `size` | `number` | `navigator.hardwareConcurrency \|\| 4` | Initial number of workers |
| `maxQueue` | `number` | `Infinity` | Max queue size — `run()` throws beyond this |
| `respawnOnCrash` | `boolean` | `true` | Re-creates a replacement worker after a crash |

Returns a pool object:

| Method | Signature | Description |
|---------|-----------|-------------|
| `run` | `(job: any, opts?: {transfer?, signal?}) => Promise<any>` | Submits a job. `transfer` = Transferables. `signal` = AbortSignal |
| `size` | `() => number` | Effective pool size |
| `idle` | `() => number` | Idle workers |
| `pending` | `() => number` | Queued jobs |
| `resize` | `(n: number) => void` | Adjusts the pool up or down |
| `terminate` | `() => void` | Terminates all workers; queued jobs are rejected |

### `pool.run(job, opts?)`

Returns a `Promise` resolved with the value of `event.data` from the worker's response message.

- If all workers are busy, the job is queued (FIFO).
- If `maxQueue` is reached: throws `'workerPool: queue is full'`.
- If the signal is already aborted: immediate rejection with `AbortError`.

**Abort behaviour during execution:** if `signal.abort()` is called while a job is already dispatched to a worker, that worker is `terminate()`d immediately (it is impossible to cancel a worker without killing it). If `respawnOnCrash` is active, a replacement is created. The job is rejected with `AbortError`.

### `pool.resize(n)`

- Increase: creates missing workers immediately and drains the queue.
- Decrease: removes idle workers first. Busy workers are removed from the pool but finish their current job before being destroyed (no respawn).

## Examples

### Basic usage

```js
const workerPool = runtime.resolve('workerPool');

const pool = workerPool.create({
    factory: () => fw.createWorker(
        function({ libs, args }) {
            const [data] = args;
            self.postMessage(libs.hex.fromBytes(new Uint8Array(data)));
        },
        { dependencies: ['hex'] }
    ),
    size: 4
});

const result = await pool.run([72, 101, 108]);
// → "48656c"

pool.terminate();
```

### Cancelling a job

```js
const ctrl = new AbortController();

// Cancel if the result doesn't arrive within 500 ms
setTimeout(() => ctrl.abort(), 500);

try {
    const result = await pool.run(heavyPayload, { signal: ctrl.signal });
} catch (e) {
    if (e.name === 'AbortError') console.log('Job cancelled');
}
```

### Transferables (ArrayBuffer)

```js
const buffer = new ArrayBuffer(1024 * 1024);
const result = await pool.run(buffer, { transfer: [buffer] });
// buffer is transferred to the worker (zero-copy)
```

### Dynamic resizing

```js
// Reduce during idle
pool.resize(1);

// Resume at full capacity
pool.resize(navigator.hardwareConcurrency || 4);
```

## Notes

- A worker is considered "busy" from the moment a job is dispatched to it until its `onmessage` is received.
- Communication with the worker is unconstrained: the pool simply relays `postMessage` and waits for the response via `onmessage`. Compatible with `processRPC` or `processMessage.workerFramework`.
- `terminate()` is idempotent.
- Aborting an in-progress job terminates the worker (documented behaviour) — size the pool accordingly for use cases with frequent cancellations.

## See also

- [processMessage](./message.md) — inter-worker message routing
- [processRPC](./rpc.md) — Promise-based RPC over MessageChannel
- [workers](../../guide/workers.md) — Web Workers usage guide
