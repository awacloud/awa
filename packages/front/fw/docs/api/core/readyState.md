---
module: readyState
category: core
dependencies: []
returns: object
worker-safe: false
status: complete
---

# readyState

> DOM ready-state helper: callbacks enqueued for `interactive` (DOMContentLoaded) and `complete` (load).

**Module** `readyState` | **Source** `packages/front/fw/src/core/readyState.js` | **Deps** none | **Worker-safe** no

This component is not resolved via `runtime.resolve()` — it is instantiated directly by the framework bootstrap and exposed as `fw.domReady`. Not worker-safe: it accesses `document.readyState` and registers `readystatechange` listeners on `document`.

## Resolve

```js
// Not resolved via runtime — direct access from the fw object:
import fw from './fw/main.js';
const domReady = fw.domReady;
// Returns: { loaded, complete }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `loaded` | `(fn: Function, argArray?: any[]) => void` | — (enqueues or executes immediately) |
| `complete` | `(fn: Function, argArray?: any[]) => void` | — (enqueues or executes immediately) |

### `domReady.loaded(fn, argArray?)`

Executes `fn` as soon as the DOM is interactive (`document.readyState === 'interactive'`). If the state is already reached, executes immediately (synchronously).

| Param | Type | Description |
|-------|------|-------------|
| `fn` | `Function` | Callback to execute |
| `argArray` | `any[]` | Arguments passed to `fn.apply({}, argArray)` (default `[]`) |

### `domReady.complete(fn, argArray?)`

Executes `fn` when all assets are loaded (`document.readyState === 'complete'`). If the state is already reached, executes immediately.

## Examples

### DOM interactive — initialise templates

```js
import fw from './fw/main.js';

fw.domReady.loaded(() => {
    const tpl = fw.runtime.resolve('template');
    tpl.init('main', { to: '#app' });
});
```

### Full page load — with arguments

```js
fw.domReady.complete((msg) => {
    console.log(msg); // 'Page ready'
}, ['Page ready']);
```

### Combining loaded + complete

```js
fw.domReady.loaded(() => {
    // DOM parsed — initialise rendering
    fw.runtime.resolve('render').mount('#root');
});

fw.domReady.complete(() => {
    // Assets loaded — start heavy resources
    fw.runtime.resolve('indexedDB').open('appdb', 1);
});
```

## Notes

- **Lazy listener**: no `readystatechange` listener is registered until at least one callback has been registered. If the state is already `complete` on the first call, no listener is registered.
- **Idempotency**: a single `readystatechange` listener is registered, regardless of the number of registered callbacks.
- **`interactive` skip**: a direct `loading` → `complete` transition (cache navigation) flushes both queues in one iteration.
- **Execution order**: `loaded` queue flushed before `complete` queue; within a queue, registration order is preserved.
- **Silenced errors**: exceptions inside callbacks are caught silently (`fn.apply` wrapped in try/catch).
- **Not worker-safe**: depends on `document.readyState` and the `readystatechange` event, both absent in Worker contexts.

## See also

- [worker-helper](./worker-helper.md) — spawn framework-aware workers
- [Getting started guide](../../guide/getting-started.md)
