# Web Workers

The framework allows spawning Workers from inline functions, with automatic injection of the required modules.

> The examples below assume that the cited modules (`hex`, `lz4`,
> `b64`, `processMessage`, `processRPC`, …) have been registered beforehand
> via `fw.runtime.registerAll(modules)` or by manual composition. `main.js`
> registers **nothing** automatically — see [Quick start](./getting-started.md).

## Principle

```
main.js → createWorker(fn, options)
              ↓
          serialize modules → Blob URL → new Worker(blobUrl)
              ↓ (inside the worker)
          ModuleRuntime + registered modules
          workerFw(runtime, modules, args) → context
          workerFn(context)
```

## Full signature

```js
const worker = fw.createWorker(workerFn, {
    dependencies: ['hex', 'lz4'],     // required modules
    workerFw:     myFrameworkFn,      // optional — custom bootstrap
    args:         ['param1', 42],     // optional — JSON-serialisable
    terminate:    () => cleanup()     // optional — cleanup callback
});
```

See [createWorker API](../api/core/worker-helper.md) for the full reference.

## Typical use cases

### 1. Data processing

```js
const worker = fw.createWorker(
    function({ libs, args }) {
        const [data] = args;
        const compressed = libs.lz4.compress(new Uint8Array(data));
        self.postMessage({ compressed: Array.from(compressed[1]) });
    },
    {
        dependencies: ['lz4'],
        args: [largeArrayBuffer]
    }
);

worker.onmessage = ({ data }) => {
    console.log('compressed:', data.compressed.length, 'bytes');
};
```

### 2. Inline parallel execution

Same logic, without a worker — useful for debugging and testing:

```js
const workerFn = function({ libs, args }) {
    return libs.hex.fromBytes(args[0]);
};

// Inline
const libs = fw.runtime.resolveAll(['hex'], { instances: new Map() });
const result = workerFn({ libs, process: {}, args: [new Uint8Array([255])] });

// Worker (same function)
const worker = fw.createWorker(workerFn, {
    dependencies: ['hex'],
    args: [Array.from(new Uint8Array([255]))]  // JSON-serialisable
});
```

### 3. Bidirectional messages with processMessage

```js
// Main thread
const { processMessage } = fw.runtime.resolveAll(['processMessage']);
const workerRef = fw.createWorker(
    function({ libs, process }) {
        // Register a command handler
        process.doWork = function(data) {
            const result = libs.b64.fromBytes(new Uint8Array(data));
            process.postMessage({ result });
        };
    },
    {
        dependencies: ['processMessage', 'b64'],
        workerFw: processMessage.workerFramework
    }
);

const cmd = processMessage.workerCommand(workerRef);
cmd.doWork([72, 101, 108]);  // sends the command

workerRef.onmessage = ({ data }) => console.log(data.result);
```

### 4. RPC (Remote Procedure Call)

A `MessagePort` is a `Transferable`, **not** a JSON-serialisable value:
it cannot therefore pass through `options.args` (see Constraints). It must be
transferred explicitly via `postMessage`.

```js
// Object to expose from the main thread
const api = {
    add: (a, b) => a + b,
    format: { hex: (bytes) => fw.runtime.resolve('hex').fromBytes(bytes) }
};

const { processRPC } = fw.runtime.resolveAll(['processRPC']);
const { port } = processRPC.create(api);

const worker = fw.createWorker(
    function({ libs }) {
        // The port arrives by explicit transfer — not via `args`.
        self.onmessage = async (event) => {
            const rpc = await libs.processRPC.open(event.ports[0]);

            const sum = await rpc.add(10, 32);           // → 42
            const str = await rpc.format.hex([255, 0]);  // → "ff00"
            self.postMessage({ sum, str });
        };
    },
    {
        dependencies: ['processRPC']
    }
);

// Transfer the port to the worker (2nd argument = list of Transferables)
worker.postMessage(null, [port[0]]);
```

The reverse direction (worker exposes the API, main thread consumes) also works:
the worker calls `libs.processRPC.create(api)` then
`self.postMessage({ rpcReady: true }, [port[0]])`, and the main thread opens
`event.ports[0]` with `processRPC.open(...)`.

## Constraints

| Constraint | Reason |
|-----------|--------|
| `workerFn` must be self-contained | Converted to string via `.toString()` |
| `args` must be JSON-serialisable | Transmitted via `JSON.stringify/parse` |
| No closures over main-thread variables | Not serialisable |
| No `document`/`window` in the factory | Not available inside workers |

## Cleanup

```js
worker.terminate(); // patched → revokeObjectURL + callback + native terminate
```

Idempotent — multiple calls are no-ops.

## Worker logs

If `ENV.LOG = true`, `console.log/warn/error` calls inside the worker are automatically forwarded to `fw.log`. They appear in `fw.log.get()` with the appropriate `lvl`.

## See also

- [createWorker API](../api/core/worker-helper.md)
- [processMessage](../api/process/message.md)
- [processRPC](../api/process/rpc.md)
