---
module: rateLimit
category: io/timing
dependencies: []
returns: object
worker-safe: true
status: complete
---

# rateLimit

> Lodash-compatible debounce and throttle — limits the call frequency of a function.

**Module** `rateLimit` | **Source** `packages/front/fw/src/io/timing/rateLimit.js` | **Deps** none | **Worker-safe** yes

Groups two classic time-based primitives: `debounce` (delay the call until calls stop) and `throttle` (at most one call per window). API close to lodash for common options.

## Resolve

```js
const rateLimit = runtime.resolve('rateLimit');
// Returns: { debounce, throttle }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `debounce` | `(fn, delay, options?) => DebouncedFn` | Wrapped function |
| `throttle` | `(fn, interval, options?) => ThrottledFn` | Wrapped function |

All wrapped functions expose:

| Method | Signature | Returns |
|--------|-----------|---------|
| `.cancel()` | `() => void` | Cancels the pending call |
| `.flush()` | `() => any` | Executes immediately if pending |
| `.pending()` | `() => boolean` | `true` if a call is pending |

### `rateLimit.debounce(fn, delay, options?)`

Delays execution of `fn` until `delay` ms have elapsed with no new call.

- `delay`: number **> 0**; throws otherwise.
- `fn` non-function: throws.
- Return value of the wrapped call: `undefined` (asynchronous). To retrieve the result, use `.flush()`.
- `this` is preserved.

### Options `debounce`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `leading` | `boolean` | `false` | Call on the rising edge (first call immediate) |
| `trailing` | `boolean` | `true` | Call after the quiet period |
| `maxWait` | `number` | `undefined` | Max duration before forcing the call (continuous streams) |

### `rateLimit.throttle(fn, interval, options?)`

Guarantees at most one call per `interval` ms window.

- `interval`: number **> 0**; throws otherwise.
- `leading: false, trailing: false` is invalid → throws.
- Implemented via `debounce` with `maxWait = interval`.

### Options `throttle`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `leading` | `boolean` | `true` | Fire at the start of the window |
| `trailing` | `boolean` | `true` | Fire at the end of the window if calls were missed |

## Examples

### Debounce an input (wait for typing to stop)

```js
const rateLimit = runtime.resolve('rateLimit');

const search = rateLimit.debounce((query) => {
    fetchResults(query);
}, 300);

inputEl.addEventListener('input', e => search(e.target.value));
```

### Throttle a scroll handler (at most 1 call / 100 ms)

```js
const updateUI = rateLimit.throttle(() => {
    const y = window.scrollY;
    headerEl.classList.toggle('scrolled', y > 50);
}, 100);

window.addEventListener('scroll', updateUI, { passive: true });
```

### Cancel and flush in a cleanup

```js
const debouncedSave = rateLimit.debounce(saveToServer, 1000);

// In a component destroy:
function cleanup() {
    debouncedSave.flush(); // immediate save if pending
    debouncedSave.cancel(); // cancel all future calls
}
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const throttled = libs.rateLimit.throttle(
            (msg) => self.postMessage({ processed: msg }),
            50
        );
        // Throttle postMessage calls from a high-frequency worker
        for (const item of args) throttled(item);
        throttled.flush();
    },
    { dependencies: ['rateLimit'], args: dataStream }
);
```

## Notes

- Uses `setTimeout`/`clearTimeout` only — no `setImmediate`, no `requestAnimationFrame`.
- The return value of the wrapped call is always `undefined` except via `.flush()`.
- `this` is preserved: `obj.method = debounce(fn, 100); obj.method()` → `fn` sees `this === obj`.
- Difference vs lodash: `.pending()` returns `boolean` (lodash does not expose `.pending()`).
- For logical backpressure (HTTP rate limiting) → prefer [`tokenBucket`](../sync/tokenBucket.md).

## See also

- [scheduler](./scheduler.md) — cron + interval + job scheduler
- [tokenBucket](../sync/tokenBucket.md) — token bucket rate limiter (HTTP, backpressure)
