---
module: clock
category: io/timing
dependencies: []
returns: object
worker-safe: true
status: complete
---

# clock

> Horloge monotonique + wall-clock — replacement de `performance.now()`.

**Module** `clock` | **Source** `packages/front/fw/src/io/timing/clock.js` | **Deps** none | **Worker-safe** yes

`performance.now()` is blocked by `sanity/base.js` in this framework. `clock` provides the same use cases: timestamping, interval measurement and human-readable formatting, at 1 ms resolution (`Date.now()`).

## Resolve

```js
const clock = runtime.resolve('clock');
// Returns: { now, monotonic, since, iso, format }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `now` | `() => number` | Milliseconds since epoch (wall-clock, may jump on NTP/DST) |
| `monotonic` | `() => number` | Non-decreasing milliseconds (flattened if wall-clock goes backward) |
| `since` | `(t0: number) => number` | `Math.max(0, monotonic() - t0)` — elapsed time in ms |
| `iso` | `() => string` | Snapshot `new Date().toISOString()` |
| `format` | `(ms: number) => string` | Human-readable duration: `'0.123 ms'` / `'12.3 ms'` / `'1.234 s'` / `'2.50 min'` / `'1.25 h'` |

### `clock.format(ms)` — thresholds

| Absolute value | Format | Example |
|----------------|--------|---------|
| < 1 ms | `N.NNN ms` | `'0.500 ms'` |
| 1 – 999 ms | `N.N ms` | `'12.3 ms'` |
| 1 s – 59 s | `N.NNN s` | `'1.234 s'` |
| 1 min – 59 min | `N.NN min` | `'2.50 min'` |
| ≥ 1 h | `N.NN h` | `'1.25 h'` |

`ms` non-finite (NaN, Infinity) → returns `String(ms)`.

## Examples

### Basic duration measurement

```js
const clock = runtime.resolve('clock');

const t0 = clock.monotonic();
await doWork();
console.log('Duration:', clock.format(clock.since(t0)));
// e.g. "Duration: 42.3 ms"
```

### ISO timestamp for logs

```js
console.log(clock.iso(), 'operation complete');
// "2024-01-15T10:30:00.123Z operation complete"
```

### Monotonic vs wall-clock

```js
// For absolute timestamps (logs, events)
const wallTs = clock.now();   // may jump if NTP adjusts

// For measuring intervals (performance, timers)
const mono = clock.monotonic(); // never decreases
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const t0 = libs.clock.monotonic();
        // processing...
        const elapsed = libs.clock.since(t0);
        self.postMessage({ elapsed, formatted: libs.clock.format(elapsed) });
    },
    { dependencies: ['clock'] }
);
```

## Notes

- **1 ms resolution** (`Date.now()`) — lower precision than `performance.now()` (sub-ms) but consistent across all runtimes (browser, Node, Bun, Worker).
- `monotonic()` flattened if wall-clock goes backward (NTP, DST): the returned value stays stable until the wall-clock catches up.
- `since(t0)` returns `0` if `t0` is after the call (guard against accidental future `t0`).
- `format` is designed for human display, not algorithmic comparisons.

## See also

- [rateLimit](./rateLimit.md) — time-based debounce/throttle
- [scheduler](./scheduler.md) — cron + interval + job scheduler
- [atomics](../sync/atomics.md) — cross-worker synchronization with `SharedArrayBuffer`
