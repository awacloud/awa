---
module: processMessage
category: process
dependencies: []
returns: object
worker-safe: true
status: complete
---

# processMessage

> Named message routing between the main thread and Web Workers via a Proxy system. Separates "framework" messages (`__fw`) from user messages.

**Module** `processMessage` | **Source** `packages/front/fw/src/process/message.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const pm = runtime.resolve('processMessage');
// Returns: { sync, worker, workerCommand, workerFramework }
```

## API

### `pm.sync()` — In-memory channel (testing)

Creates two ends of a synchronous in-memory channel (no real Worker).

```js
const { process, manager } = pm.sync();

// Register a command handler on the "process" side
process.myHandler = function(data, ports) {
    console.log('received:', data);
    process.postMessage({ result: 'ok' });
};

// Send a command from the "manager"
manager.postMessage({ __fw: true, __type: 'cmd', name: 'myHandler', msg: { x: 1 } });

// Regular messages
manager.addEventListener('message', (event) => console.log('response:', event.data));
process.postMessage({ type: 'hello' }); // → manager receives
```

Returns: `{ process: Proxy, manager: MessageStore }`

---

### `pm.worker()` — Proxy inside a worker

Creates a process proxy **inside a worker**. Binds to `self`.

```js
// In workerFn — worker side
function myWorker({ libs, process }) {
    // process is already a proxy if workerFw = processMessage.workerFramework
    // Or create manually:
    const process = libs.processMessage.worker();

    process.doSomething = function(data) {
        // Command handler
        const result = libs.hex.fromBytes(data);
        process.postMessage({ result });
    };
}
```

Returns: `Proxy`

---

### `pm.workerCommand(workerRef)` — Send commands to the worker

Creates a proxy to **send commands** to a worker from the main thread.

```js
const worker = fw.createWorker(workerFn, { dependencies: ['processMessage', 'hex'] });
const cmd = pm.workerCommand(worker);

// cmd.commandName(message) → sends the command to the worker
cmd.doSomething(new Uint8Array([255, 0]).buffer);
```

Returns: `Proxy` (get → command-sending function)

---

### `pm.workerFramework(runtime, modules, args)` — Standard worker bootstrap

Ready-to-use `workerFw` that initialises `libs` and creates a `process.worker()` proxy.

```js
const worker = fw.createWorker(
    function({ libs, process, args }) {
        process.hello = function(msg) {
            console.log('command received:', msg);
        };
    },
    {
        dependencies: ['processMessage', 'hex'],
        workerFw: pm.workerFramework   // ← replaces the default workerFw
    }
);

// Main thread
const cmd = pm.workerCommand(worker);
cmd.hello('hello there'); // → worker.process.hello('hello there')
```

Returns: `{ libs, process, args }`

## Proxy semantics

The `process` Proxy has particular semantics:

| Operation | Effect |
|-----------|-------|
| `process.name = fn` | Registers `fn` as the handler for command `'name'` |
| `process.name = false` | Removes the `'name'` handler |
| `process.name` (get) | Returns the handler or `false` |
| `process.postMessage(data)` | Sends a regular message |
| `process.addEventListener('message', fn)` | Adds a regular listener |

Commands are wrapped as `{ __fw: true, __type: 'cmd', name, msg }` — invisible to ordinary `onmessage` handlers.

## Examples

### Complete main ↔ worker pattern

```js
import fw from './fw/main.js';
const pm = fw.runtime.resolve('processMessage');

// Worker side
const workerFn = function({ libs, process }) {
    process.compute = function(data) {
        const result = libs.hex.fromBytes(new Uint8Array(data));
        process.postMessage({ result });
    };
};

// Main side
const worker = fw.createWorker(workerFn, {
    dependencies: ['processMessage', 'hex'],
    workerFw: pm.workerFramework
});

const cmd = pm.workerCommand(worker);
worker.onmessage = ({ data }) => console.log('result:', data.result);

cmd.compute([255, 0, 128]); // → worker.process.compute([255,0,128])
```

## Notes

- Framework commands (`{ __fw: true, __type: 'cmd', ... }`) are intercepted by `isFwMessage` and never bubble up to ordinary `onmessage` handlers or `addEventListener('message', ...)` listeners.
- The `process` Proxy has particular semantics: assigning `false` to a handler removes it (`process.name = false`), no exception.
- `workerFramework` is used as the value of `options.workerFw` in `createWorker` — it substitutes the default bootstrap and automatically creates the `process` proxy on the worker side.
- `sync()` creates a synchronous in-memory channel ideal for tests — dispatch is immediate, no asynchronous message transfer.

## See also

- [processRPC](./rpc.md) — RPC with Promises
- [createWorker](../core/worker-helper.md)
- [Workers guide](../../guide/workers.md)
