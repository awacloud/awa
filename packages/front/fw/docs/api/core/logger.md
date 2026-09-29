---
module: logger
category: core
dependencies: []
returns: object
worker-safe: partial
status: complete
---

# logger

> Circular in-memory buffer + `console` proxy. Two variants: main thread and worker.

**Module** `logger` | **Source** `packages/front/fw/src/core/logger.js` | **Deps** none | **Worker-safe** partial (main: no, worker: yes via `logger.worker`)

`fw.log` is the main-thread instance, created automatically in `main.js` if `ENV.LOG = true`. This component is not resolved via `runtime.resolve()` — it is instantiated directly by the framework bootstrap.

## Resolve

```js
// Not resolved via runtime — direct access from the fw object:
import fw from './fw/main.js';
const log = fw.log;
// Returns: { get, setLen, clear, __push, subscribe }
```

## API

### `logger.main(dev)` — main thread variant

Creates the main-thread logger and replaces `window.console` with a non-modifiable Proxy.

| Param | Type | Description |
|-------|------|-------------|
| `dev` | `boolean` | If `true`, also forwards to the native `console` |

Returns: `{ get, setLen, clear, __push, subscribe }`

### `logger.worker(dev, port)` — worker variant

Creates the worker-side logger. Proxies `self.console`, forwards entries via `port.postMessage`. Used internally by `worker-helper.js`. Worker logs appear in `fw.log.get()` on the main thread.

| Param | Type | Description |
|-------|------|-------------|
| `dev` | `boolean` | If `true`, also forwards to the native worker `console` |
| `port` | `MessagePort` | Channel to the main thread |

Returns: `{ get, setLen, clear, subscribe }`

### Common methods

| Method | Signature | Returns |
|---------|-----------|---------|
| `get()` | `() => LogEntry[]` | Snapshot of the current buffer |
| `setLen(n)` | `(n: number) => void` | Max buffer size (1–65536, default 1024) |
| `clear()` | `() => void` | Empties the buffer |
| `subscribe(fn)` | `(fn: (LogEntry) => void) => () => void` | Registers a single listener; returns `unsubscribe` |
| `__push(entry)` *(main only)* | `(LogEntry) => void` | Internal use — receives worker logs |

### `log.subscribe(fn)`

Registers a listener called synchronously after each push.

- **Single slot**: if a listener is already active, `subscribe(fn2)` throws `'logger: subscriber already registered'`. Call `unsubscribe()` first.
- **No replay**: previous entries are not replayed. Combine with `get()` to bootstrap a store.
- **Silenced errors**: if the listener throws an exception, it is caught silently.
- **`__push` also notifies** (main only): any addition via `__push` (receiving worker logs) triggers the listener.

Returns `unsubscribe: () => void` — idempotent.

## Examples

### Read and clear the buffer

```js
import fw from './fw/main.js';
const { log } = fw;

const entries = log.get();
entries.forEach(e => console.log(e.ts, e.lvl, e.data));

log.setLen(4096); // max 65536
log.clear();
```

### Persist each entry to IndexedDB

```js
import fw from './fw/main.js';
const { log } = fw;

// Bootstrap: persist entries already present
log.get().forEach(entry => idb.put('logs', entry));

// Subscribe for future entries
const unsubscribe = log.subscribe(function (entry) {
    idb.put('logs', entry).catch(function (_) {
        // do not re-log here to avoid a loop
    });
});

// Later
// unsubscribe();
```

## Worker Usage

`logger.worker` is injected automatically into each worker by `worker-helper.js` when `ENV.LOG = true`. Worker logs appear in `fw.log.get()` on the main thread via `log.__push`.

```js
const worker = fw.createWorker(
    function({ libs }) {
        // console.log/warn/error inside the worker are intercepted
        // and forwarded to the main thread automatically
        console.log('from the worker', libs.hex.fromBytes(new Uint8Array([255])));
    },
    { dependencies: ['hex'] }
);
```

## Typedef: LogEntry

```js
{
    ts:    number,   // timestamp Date.now()
    lvl:   string,   // 'log' | 'info' | 'warn' | 'error' | ...
    data:  any[],    // logged arguments (serialised on the worker side)
    stack: string    // stack trace (formatted as an array of lines)
}
```

## Notes

- `window.console` is replaced by a non-modifiable Proxy (`configurable: false, writable: false`).
- **Node / worker-shaped realm fallback**: `logger.main(dev)` resolves the
  console holder environment-aware — when `typeof window === 'undefined'` (bare
  Node, or a worker-shaped global with no `window`), it operates on
  `globalThis.console` and **skips the Proxy install entirely**. Node's console
  is non-configurable territory and is never seized; logging works as a plain
  passthrough and `@awacloud/fw`'s entry point (`main.js`, which unconditionally
  calls `logger.main(ENV.DEV)` at import time) can be imported under bare Node
  without throwing. The browser path (`window` defined) is unchanged — same
  non-writable, non-configurable Proxy install as before.
- Worker logs are serialised (Error, Map, Set, Function, circular → JSON-safe representation via `JSON.stringify` with a custom replacer).
- `Date.now` in the logger is affected by the granularity imposed by `sanity/base.js` (rounded to 100 ms).
- `logger.worker` is stringified via `.toString()` before injection into the Worker — the function must remain self-contained (no closure over external variables).

## See also

- [worker-helper](./worker-helper.md) — automatic logger injection into workers
- [sanity/base](../sanity/base.md) — impact on `Date.now` temporal resolution
