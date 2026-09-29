---
module: tokenBucket
category: io/sync
dependencies: []
returns: object
worker-safe: true
status: complete
---

# tokenBucket

> Token bucket rate limiter — async FIFO, lazy refill, no active timer.

**Module** `tokenBucket` | **Source** `packages/front/fw/src/io/sync/tokenBucket.js` | **Deps** none | **Worker-safe** yes

Rate limiting primitive. A bucket has a maximum capacity and refills at a configurable rate. Consumers take tokens (`tryTake` sync or `take` async). The refill is computed on demand (lazy) — no active internal timer.

Distinct from [`rateLimit`](../timing/rateLimit.md) (debounce/throttle UX on functions). `tokenBucket` is a logical primitive: available resource quantity, burst management, backpressure.

## Resolve

```js
const tokenBucket = runtime.resolve('tokenBucket');
// Returns: { create }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `(options) => Bucket` | Bucket instance |

### `create` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `capacity` | `integer >= 1` | — | Max simultaneous tokens |
| `refillRate` | `number >= 0` | — | Tokens added per `refillInterval` |
| `refillInterval` | `number` | `1000` | Refill interval (ms) |
| `initial` | `number` | `capacity` | Initial tokens |

### `Bucket` object

| Method / Property | Signature | Description |
|-------------------|-----------|-------------|
| `tryTake` | `(n?: number = 1) => boolean` | Sync — takes if available, `false` otherwise |
| `take` | `(n?: number = 1) => Promise<void>` | Async — waits until tokens are available |
| `available` | `getter: number` | Tokens available computed on demand |
| `capacity` | `getter: number` | Max capacity (immutable) |
| `refillRate` | `getter: number` | Refill rate (immutable) |
| `refillInterval` | `getter: number` | Interval (ms) (immutable) |
| `reset` | `() => void` | Resets to `capacity` |
| `cancel` | `() => void` | Rejects all async waiters |

**Semantics**:
- `take(n)` if `n > capacity` → immediate rejection (impossible to satisfy).
- FIFO queue: if multiple waiters, they are resolved in call order.
- `cancel()` rejects all waiters with `Error('tokenBucket: cancelled')`.
- `refillRate: 0` → fixed bucket with no refill (useful for burst limited by reset or external trigger).

## Examples

### HTTP rate limiting (max 10 req/s)

```js
const tokenBucket = runtime.resolve('tokenBucket');

const bucket = tokenBucket.create({
    capacity: 10,
    refillRate: 10,
    refillInterval: 1000,
});

async function rateLimitedFetch(url) {
    await bucket.take();       // waits if rate exceeded
    return fetch(url);
}
```

### Backpressure with channel

```js
const channel = runtime.resolve('channel');
const tokenBucket = runtime.resolve('tokenBucket');

const ch = channel.create({ capacity: 100 });
const bucket = tokenBucket.create({ capacity: 5, refillRate: 5, refillInterval: 1000 });

async function consumer() {
    while (true) {
        await bucket.take();           // max 5 items/s
        const item = await ch.recv();
        process(item);
    }
}
```

### Fixed bucket (burst control)

```js
const bucket = tokenBucket.create({ capacity: 3, refillRate: 0, initial: 3 });

// Allow 3 fast actions, block afterwards until reset()
if (bucket.tryTake()) doAction();

// Later
bucket.reset(); // Recharges
```

## Worker Usage

No DOM dependency — usable directly in workers.

```js
const worker = fw.createWorker(
    async function ({ libs, args }) {
        const bucket = libs.tokenBucket.create({ capacity: 5, refillRate: 5, refillInterval: 1000 });
        for (const url of args.urls) {
            await bucket.take();
            const resp = await fetch(url);
            self.postMessage(await resp.json());
        }
    },
    { dependencies: ['tokenBucket'], args: { urls: [...] } }
);
```

## Notes

- **Lazy** refill: no `setInterval` — tokens computed on each `tryTake`/`take`/`available`. No memory leak when idle.
- `available` returns `Math.floor(_tokens)` — the available integer quantity.
- After `cancel()`, subsequent `take()` calls reject immediately.
- For more complex patterns (retry, backoff): combine `tokenBucket` with [`abort`](./abort.md).

## See also

- [rateLimit](../timing/rateLimit.md) — debounce/throttle on functions (UX)
- [channel](./channel.md) — CSP-style channel for producer/consumer backpressure
- [semaphore](./semaphore.md) — limits the number of concurrent tasks
