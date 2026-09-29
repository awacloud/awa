---
module: eventBus
category: io/utils
dependencies: []
returns: object
worker-safe: true
status: complete
---

# eventBus

> Topic-typed application pub/sub with sticky values, wildcards, and scopes.

**Module** `eventBus` | **Source** `packages/front/fw/src/io/utils/eventBus.js` | **Deps** none | **Worker-safe** yes

Each thread instantiates its own bus via `eventBus.create()`. Cross-tab / cross-worker routing is delegated to `broadcastChannel` / `processMessage`. Distinct from `fw.events` (DOM events): this event bus is purely application-level.

## Resolve

```js
const eventBus = runtime.resolve('eventBus');
const bus = eventBus.create();
// Returns: { on, off, emit, sticky, set, clear, scope, topics }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `() => Bus` | New isolated bus instance |
| `on` | `(topic: string, fn: Function, opts?: {replay?: boolean}) => off` | Subscribes. Returns an unsubscribe function. Topic may be a wildcard `'a:*'`. With `{replay: true}`, equivalent to `sticky(topic, fn)`. |
| `off` | `(topic: string, fn: Function) => void` | Unsubscribes (alternative to the unsubscribe returned by `on`). |
| `emit` | `(topic: string, data: any) => void` | Synchronous dispatch to all subscribers (including matching wildcards). |
| `sticky` | `(topic: string, fn: Function) => off` | Subscribes AND immediately replays the last value published via `set` if it exists. |
| `set` | `(topic: string, value: any) => void` | Publishes AND stores the value; future `sticky(topic)` calls will receive it. |
| `clear` | `(topic?: string) => void` | Clears the sticky value of a topic, or all if `topic` is omitted. |
| `scope` | `() => { on, sticky, dispose }` | Subscription group; `dispose()` unsubscribes all `on`/`sticky` in the scope. |
| `topics` | `() => string[]` | List of active topics (subscribers + sticky). Debug use. |

### `bus.on(topic, fn)`

Subscribes `fn` to the topic. The topic may be a wildcard pattern `'namespace:*'`. Returns an `off()` function.

Wildcard rules:
- `'a:*'` matches `'a:b'`, `'a:b:c'`; not `'a'` nor `'b:a'`.
- Only one star allowed, required at the end of the pattern (`'a:*:b'` → throws).
- No global `'*'` pattern (throws).

### `bus.emit(topic, data)`

**Synchronous** dispatch. If a handler throws, the error is captured via `console.error` and the other handlers still run. Calling `emit` on a topic with no subscriber is a no-op.

### `bus.sticky(topic, fn)`, `bus.on(topic, fn, {replay:true})` and `bus.set(topic, value)`

Three primitives that form the **sticky / replay model**:

- **`set(topic, value)`** — *stores* the latest value of the topic AND *publishes* it to all current subscribers (exact + wildcards). The sticky store is internal and persists until `clear(topic)` or `clear()`.
- **`sticky(topic, fn)`** — *subscribes* to the topic AND *immediately replays* the last value published via `set` if it exists (otherwise only delivered on the next `set`/`emit`).
- **`on(topic, fn, {replay: true})`** — **additive alias** of `sticky(topic, fn)` (N.41). Unifies the subscription API: a single `on()` whose sticky replay is controlled by options. `{replay: false}` or omitted option = classic behavior without replay.

`sticky()` remains exposed for backward compatibility; both forms are strictly equivalent from the observable side.

### `bus.scope()`

Returns an object `{ on, sticky, dispose }` with the same signature as the bus methods. All subscriptions created via this scope are atomically unsubscribed by `dispose()`, without affecting subscriptions outside the scope.

## Examples

### Log streaming

```js
const eventBus = runtime.resolve('eventBus');
const bus = eventBus.create();

// Producer
function logError(msg) {
    bus.emit('log:error', { msg, ts: Date.now() });
}

// Consumer
const off = bus.on('log:*', (entry) => {
    console.error('[LOG]', entry.msg);
});

logError('something went wrong');
// → [LOG] something went wrong

off(); // unsubscribe
```

### Sticky — shared configuration

```js
const bus = eventBus.create();

// Publish config as soon as it's available
bus.set('app:config', { theme: 'dark', lang: 'fr' });

// Module loaded later receives the value immediately
bus.sticky('app:config', (cfg) => {
    applyTheme(cfg.theme);
});

// Equivalent form via `on` + option (J2 #00 / N.41)
bus.on('app:config', (cfg) => applyTheme(cfg.theme), { replay: true });
```

### Scope — automatic cleanup on module teardown

```js
const bus = eventBus.create();

function mountWidget(el) {
    const s = bus.scope();

    s.on('window:resize', () => layoutWidget(el));
    s.sticky('app:config', (cfg) => applyConfig(el, cfg));

    return {
        destroy() {
            s.dispose(); // all subscriptions unsubscribed in one line
        }
    };
}

const widget = mountWidget(document.getElementById('my-widget'));
// ... later
widget.destroy();
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs }) {
        const bus = libs.eventBus.create();

        bus.on('task:progress', (pct) => {
            self.postMessage({ type: 'progress', pct });
        });

        // Run a long task and emit progress
        for (let i = 0; i <= 100; i++) {
            bus.emit('task:progress', i);
        }
    },
    { dependencies: ['eventBus'] }
);
```

## Notes

- Dispatch is **synchronous** — no microtask, no `Promise`. This guarantees ordered cleanup when an `emit` is immediately followed by an assertion in unit tests.
- Wildcards are indexed separately from exact topics to avoid scanning all subscribers on every `emit`.
- Each `create()` instance is completely isolated: no shared state between instances, compatible with multi-Worker usage.
- `topics()` is a debug API; do not use in critical application logic (may include phantom patterns if `off` has not yet been called).

## See also

- [events](../../dom/query/events.md) — named DOM event handler
- [broadcastChannel](../../dom/net/broadcastChannel.md) — cross-tab / cross-worker communication
- [scope pattern](../../../guide/module-pattern.md) — fw module pattern
