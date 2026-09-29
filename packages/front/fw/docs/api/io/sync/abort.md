---
module: abort
category: io/sync
dependencies: []
returns: object
worker-safe: true
status: complete
---

# abort

> AbortController helpers — auto-abort timeout, signal composition, Promise integration.

**Module** `abort` | **Source** `packages/front/fw/src/io/sync/abort.js` | **Deps** none | **Worker-safe** yes

Facilitates usage of native `AbortController`/`AbortSignal` without reimplementing the standard. For higher-level cancellation patterns (cleanup hooks, task pools), see [`cancellable`](./cancellable.md).

## Resolve

```js
const abort = runtime.resolve('abort');
// Returns: { timeout, any, wait, race, throwIfAborted, error }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `timeout` | `(ms: number) => { signal, controller, abort }` | Object with signal auto-aborted after `ms` |
| `any` | `(...signals: AbortSignal[]) => AbortSignal` | Combined signal (aborts on the first) |
| `wait` | `(signal: AbortSignal) => Promise<never>` | Promise that rejects when the signal aborts |
| `race` | `(promise, signal?) => Promise` | Short-circuits promise if signal aborts |
| `throwIfAborted` | `(signal?) => void` | Throws if signal already aborted |
| `error` | `(reason?: string) => DOMException` | Creates a standard AbortError |

### `abort.timeout(ms)`

Creates an `AbortController` that auto-aborts after `ms` ms. The timer is cleaned up if `abort()` is called manually.

- `ms <= 0` or non-numeric → throws.
- The returned `abort(reason?)` function also cancels the timer (no leak).

### `abort.any(...signals)`

Polyfill of `AbortSignal.any(signals)` — delegates to the native if available (Chrome 116+, Firefox 124+).

- Signal already aborted at call time → returns an already-aborted signal.
- 0 arguments or non-`AbortSignal` argument → throws.

### `abort.wait(signal)`

Returns a `Promise<never>` that rejects as soon as `signal` aborts. Listener is automatically cleaned up.

### `abort.race(promise, signal)`

Short-circuits `promise` with an `AbortError` rejection if `signal` aborts first.

> **Important**: does not cancel the underlying promise — the call site must also pass `signal` to the consuming API (e.g. `fetch(url, { signal })`).

`signal` undefined/null → `promise` returned as-is (practical no-op for optional parameter).

### `abort.throwIfAborted(signal)`

No-op if `signal` is undefined/null or not aborted. Throws `signal.reason` otherwise.

### `abort.error(reason?)`

Creates a `DOMException { name: 'AbortError' }`. Falls back to a plain object if `DOMException` is unavailable.

## Examples

### Timeout on a fetch

```js
const abort = runtime.resolve('abort');

async function fetchWithTimeout(url) {
    const { signal } = abort.timeout(5000);
    const data = await abort.race(fetch(url, { signal }), signal);
    return data.json();
}
```

### Signal composition (external cancellation + timeout)

```js
const userSignal = userController.signal;
const { signal: timedSignal } = abort.timeout(10_000);
const combined = abort.any(userSignal, timedSignal);

await fetch(url, { signal: combined });
```

### Wait for cancellation (gate pattern)

```js
async function worker(signal) {
    const workPromise = doLongWork();
    await abort.race(workPromise, signal);
    // If signal aborts, the following line does not execute
    uploadResult();
}
```

## Worker Usage

`AbortController` is available in Web Workers. Example: cancelling a cross-thread fetch.

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const { signal } = libs.abort.timeout(args.timeoutMs);
        return fetch(args.url, { signal }).then(r => r.json());
    },
    { dependencies: ['abort'], args: { url: '/api/data', timeoutMs: 3000 } }
);
```

## Notes

- `race(promise, signal)` does not cancel the underlying promise — pass `signal` to the API for true cancellation.
- Native `AbortSignal.any` is preferred (Chrome 116+, Firefox 124+); otherwise lightweight polyfill.
- No reimplementation of `AbortController` — everything relies on the native standard.
- For cleanup orchestration (LIFO hooks, pools) → [`cancellable`](./cancellable.md).

## See also

- [cancellable](./cancellable.md) — cancellable tasks with cleanup hooks
- [mutex](./mutex.md) — intra-context synchronization
