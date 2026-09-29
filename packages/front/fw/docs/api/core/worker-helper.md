---
module: worker-helper
category: core
dependencies: []
returns: function
worker-safe: false
status: complete
---

# createWorker

> Spawns a framework-aware Web Worker from an inline function. Required modules are serialised automatically.

**Module** `worker-helper` | **Source** `packages/front/fw/src/core/worker-helper.js` | **Deps** none | **Worker-safe** no

## Resolve

```js
// Not resolved via runtime — directly accessible from the fw object:
import fw from './fw/main.js';
const createWorker = fw.createWorker;
// Usage: fw.createWorker(workerFn, options?)
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `createWorker` | `(workerFn: Function, options?: WorkerOptions) => Worker` | `Worker` with patched `terminate()` |

### `createWorker` options

| Param | Type | Default | Description |
|-------|------|--------|-------------|
| `workerFn` | `Function` | **required** | Function executed in the worker. Receives `runtime.context`. Must be self-contained. |
| `options.dependencies` | `string[]` | `[]` | Modules to serialise and register in the worker |
| `options.workerFw` | `Function` | DEFAULT_WORKER_FRAMEWORK | Worker bootstrap: `(runtime, modules, args) => context` |
| `options.args` | `any[]` | `[]` | JSON-serialisable arguments passed to `workerFw` |
| `options.terminate` | `Function` | no-op | Cleanup callback before native `Worker.terminate()` |

## Examples

### Minimal

```js
const worker = fw.createWorker(
    function({ libs }) {
        console.log(libs.hex.fromBytes(new Uint8Array([255, 0, 1])));
    },
    { dependencies: ['hex'] }
);
```

### With arguments

```js
const worker = fw.createWorker(
    function({ libs, args }) {
        const [url, maxRetries] = args;
        // processing...
    },
    {
        dependencies: ['hex', 'b64'],
        args: ['https://api.example.com', 3]
    }
);
```

### Listening to messages

```js
const worker = fw.createWorker(
    function({ process }) {
        // Send a message to the main thread
        process.postMessage({ type: 'result', value: 42 });
    },
    { dependencies: ['processMessage'], workerFw: processMessage.workerFramework }
);

worker.onmessage = function(event) {
    console.log('received:', event.data); // { type: 'result', value: 42 }
};
```

### Inline (same API, no worker)

```js
// Identical execution without worker — useful for debugging
const libs = fw.runtime.resolveAll(['hex', 'b64'], { instances: new Map() });
myWorkerFn({ libs, process: {}, args: ['arg1'] });
```

## Initialisation sequence inside the worker

```
1. Logger bootstrap (if ENV.LOG)
2. runtimeSource (constants + private helpers + ModuleRuntime class)
3. new ModuleRuntime()
4. Registration of ALL modules in the graph (entry + transitive dependencies)
5. workerFw(runtime, dependenciesUserSpecs, args)  → runtime.context
6. workerFn(runtime.context)
```

> **Note (since semver introduction)**: the injected code includes
> `runtimeSource` which combines the `ModuleRuntime` class AND its private helpers
> (`semverCompare`, `parseSpec`, `canonical`, `SEMVER_RE`, …). Without this grouping,
> `ModuleRuntime.toString()` alone is insufficient — the class would reference
> symbols absent from the worker context → `ReferenceError`.

## Default `workerFw`

```js
function DEFAULT_WORKER_FRAMEWORK(runtime, modules, args) {
    const libs = runtime.resolveAll(modules);
    const process = {};
    return { libs, process, args };
}
```

`workerFn` therefore receives `{ libs, process, args }` unless `workerFw` is customised.

### `libs` keys — keyed by user specs, not canonical

The keys of `libs` correspond **textually** to the strings passed in
`options.dependencies`. No automatic canonicalisation (no `@version` suffix added):

```js
fw.createWorker(({ libs }) => {
    libs.hex.fromBytes(...);          // ✓ keyed on 'hex'
    libs['utf8@1.0.0'].decode(...);   // ✓ keyed on 'utf8@1.0.0'
}, {
    dependencies: ['hex', 'utf8@1.0.0']
});
```

Behaviour aligned with main thread:
`runtime.resolveAll(['hex'])` → `{ hex: <hex> }`.

**Transitive dependencies** are registered in the worker's runtime
(and thus resolvable via `runtime.resolve(...)`) but are **not exposed**
in `libs` by default. To access them, either declare them explicitly in
`dependencies`, or use a custom `workerFw`.

## Framework messages (`__fw: true`)

Internal messages (logs, commands) are intercepted by `worker-helper.js`
via `event.stopImmediatePropagation()` and **never** bubble up to user
`onmessage` handlers. When `ENV.LOG=true`, messages `{ __fw: true,
__type: 'log', msg }` are also pushed to the main-thread log (`log.__push(msg)`).

## Cleanup

```js
const worker = fw.createWorker(fn, {
    terminate: () => console.log('worker terminated')
});

worker.terminate(); // → cleanup() → URL.revokeObjectURL + callback + native terminate
```

`worker.terminate()` is **idempotent** — subsequent calls are no-ops
(URL not re-revoked, callback not re-invoked, listener not re-removed).

If `new Worker(...)` fails (constructor throws), the Blob URL is
revoked before rethrowing — no leak.

## Notes

- `workerFn` and `workerFw` are converted to string via `.toString()` — they must not capture variables from the main scope (closures), reference `document`/`window`, or use ES module imports.
- Transitive dependencies are registered in the worker runtime but are not exposed in `libs` by default — declare them explicitly in `dependencies` to access them.
- `worker.terminate()` is idempotent — subsequent calls are no-ops (URL not re-revoked, callback not re-invoked).
- If `new Worker(blobUrl)` fails, the Blob URL is revoked before rethrowing — no leak.

## See also

- [Workers guide](../../guide/workers.md)
- [processMessage](../process/message.md)
- [processRPC](../process/rpc.md)
- [ModuleRuntime.serialize](./runtime.md)
- [`src/core/worker-helper.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/core/worker-helper.test.js) — unit tests (code generation, sandbox round-trip, idempotent terminate, `__fw` messages).
