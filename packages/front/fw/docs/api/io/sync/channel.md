---
module: channel
category: io/sync
dependencies: []
returns: object
worker-safe: true
status: complete
---

# channel

> Buffered CSP-style FIFO channel — synchronized producer/consumer communication.

**Module** `channel` | **Source** `packages/front/fw/src/io/sync/channel.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const channel = runtime.resolve('channel');
const ch = channel.create({ capacity: 10 });
// Returns: { send, recv, trySend, tryRecv, close, closed, capacity, size }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `({ capacity?: number }) => ChannelInstance` | New instance (capacity ≥ 0) |
| `ch.send` | `(value: T) => Promise<void>` | Sends, blocks if buffer full |
| `ch.recv` | `() => Promise<{ value: T, done: boolean }>` | Receives, blocks if empty |
| `ch.trySend` | `(value: T) => boolean` | Sends if possible (sync) |
| `ch.tryRecv` | `() => RecvResult` | Receives if possible (sync) |
| `ch.close` | `() => void` | Closes the channel (idempotent) |
| `ch.closed` | getter `boolean` | Closed state |
| `ch.capacity` | getter `number` | Buffer capacity |
| `ch.size` | getter `number` | Number of elements waiting |

### recv / tryRecv results

| Result | Meaning |
|--------|---------|
| `{ value, done: false }` | Normal value received |
| `{ value: undefined, done: true }` | Channel closed and empty |
| `{ empty: true }` | `tryRecv` only — buffer empty and channel open |

### Semantics

- `create({ capacity: 0 })`: **rendezvous** mode — sender blocks until a receiver arrives and vice versa.
- `create({ capacity: N })` (N > 0): FIFO buffer of size N. `send` blocks only when buffer is full.
- `send` on a closed channel → `Promise.reject(Error('channel: send on closed'))`.
- `trySend` on a closed channel → synchronous throw.
- `close` with pending senders → rejects all with `Error('channel: closed during send')`.
- `close` with pending receivers → resolves all with `{ value: undefined, done: true }`.
- `close` is idempotent — multiple calls have no effect.
- Intra-context only — not cross-worker.

## Examples

### Producer/consumer pattern

```js
const channel = runtime.resolve('channel');
const ch = channel.create({ capacity: 5 });

// Producer
(async () => {
    for (const item of items) await ch.send(item);
    ch.close();
})();

// Consumer
(async () => {
    let r;
    while (!(r = await ch.recv()).done) {
        process(r.value);
    }
})();
```

### Rendezvous (unbuffered)

```js
const ch = channel.create({ capacity: 0 });

// Side A — waits until B is ready
await ch.send(signal);

// Side B — waits until A sends
const { value } = await ch.recv();
```

### Drain with tryRecv

```js
let r;
while ((r = ch.tryRecv()).value !== undefined || !r.done) {
    if (r.empty) break;
    handle(r.value);
}
```

## Worker Usage

```js
const worker = fw.createWorker(
    async function ({ libs }) {
        const ch = libs.channel.create({ capacity: 3 });
        await ch.send('msg');
        const { value } = await ch.recv();
    },
    { dependencies: ['channel'] }
);
```

## Notes

- Strict FIFO — send order is preserved on receive.
- Intra-context only — for cross-worker communication, use `postMessage`.
- Model inspired by Go channels and Communicating Sequential Processes (CSP).

## See also

- [mutex](./mutex.md) — binary mutual exclusion
- [semaphore](./semaphore.md) — N concurrent permits
- [cancellable](./cancellable.md) — async task cancellation
