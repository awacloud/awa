---
module: processRPC
category: process
dependencies: []
returns: object
worker-safe: true
status: complete
---

# processRPC

> Promise-based RPC over `MessageChannel`. Exposes a complete cross-worker JS object with a transparent proxy.

**Module** `processRPC` | **Source** `packages/front/fw/src/process/rpc.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const rpc = runtime.resolve('processRPC');
// Returns: { create, open }
```

## API

### `rpc.create(target)` — host side (main thread)

Introspects `target`, sends the descriptor on `port1`, returns `port2` for transfer to the worker.

```js
const api = {
    add: (a, b) => a + b,
    utils: {
        encode: (bytes) => hex.fromBytes(bytes)
    }
};

const { port, close } = rpc.create(api);
// port → [MessagePort] — to transfer to the worker via postMessage
//   (Transferable: do NOT pass in `options.args` of createWorker,
//    args are JSON-serialised and the port would be lost)
// close() → closes port1
```

Returns: `{ port: MessagePort[], close: Function }`

---

### `rpc.open(port, options?)` → Promise\<Proxy\>

Consumer side (worker or other context): receives the descriptor, returns a Proxy.

```js
// Inside the worker
const proxy = await rpc.open(port);

const sum = await proxy.add(10, 32);          // → 42
const str = await proxy.utils.encode([255]);   // → "ff"
```

| Param | Type | Description |
|-------|------|-------------|
| `port` | `MessagePort` | Port received by transfer (`event.ports[0]`) |
| `options.timeout` | `number` | Per-call timeout in ms (default 30000) |

Returns: `Promise<Proxy>` — each property access returns a `Promise`.

## Examples

### Basic — accessing remote methods

```js
const rpc = runtime.resolve('processRPC');

const api = { add: (a, b) => a + b };
const { port, close } = rpc.create(api);

// Consumer side (worker or other context)
const proxy = await rpc.open(port[0]);
const result = await proxy.add(3, 4); // → 7
close();
```

### Complete pattern

A `MessagePort` is a `Transferable`: it **cannot** transit via
`options.args` of `createWorker` (the args are JSON-serialised in the worker
code — see `core/worker-helper.js`). The port must be explicitly transferred
via `postMessage`.

```js
import fw from './fw/main.js';
const { runtime, createWorker } = fw;
const rpc = runtime.resolve('processRPC');
const hex = runtime.resolve('hex');

// Object to expose
const api = {
    hex: {
        encode: (arr) => hex.fromBytes(new Uint8Array(arr))
    },
    math: {
        add: (a, b) => a + b,
        multiply: async (a, b) => a * b  // async supported
    }
};

const { port, close } = rpc.create(api);

const worker = createWorker(
    function({ libs }) {
        // The port arrives by explicit transfer — not via `args`.
        self.onmessage = async (event) => {
            const proxy = await libs.processRPC.open(event.ports[0]);

            const encoded = await proxy.hex.encode([0xde, 0xad]);
            const sum     = await proxy.math.add(10, 32);
            const product = await proxy.math.multiply(6, 7);

            self.postMessage({ encoded, sum, product });
        };
    },
    {
        dependencies: ['processRPC']
    }
);

// Transfer the port to the worker (2nd argument = list of Transferables)
worker.postMessage(null, [port[0]]);

worker.onmessage = ({ data }) => {
    console.log(data); // { encoded: "dead", sum: 42, product: 42 }
    close();
};
```

The reverse direction also works: the **worker** exposes the API via
`libs.processRPC.create(api)` then sends the port to the main thread with
`self.postMessage({ rpcReady: true }, [port[0]])`; the main thread
receives it in `event.ports[0]` and calls `rpc.open(port)`.

## Characteristics

| Aspect | Value |
|--------|--------|
| Max introspection depth | 8 levels |
| Forbidden properties | `__proto__`, `constructor`, `prototype` |
| JS internal properties (`then`, `toJSON`, ...) | Return `undefined` (no throw) |
| Default timeout | 30 seconds |
| Error handling | Errors serialised as string via `String(err)` |

## Notes

- `rpc.create` sends the descriptor immediately on `port1` — it is queued until `port2` becomes active.
- Async functions on the host object are `await`-ed before the response is sent.
- The proxy returned by `open` intercepts **every** property — `await proxy.nonExistent()` returns a rejected Promise after timeout.
- `port` is a `Transferable` — it must be transferred via the 2nd argument of `postMessage` (zero-copy transfer). Do **not** pass it in `options.args` of `createWorker`: the args are JSON-serialised and the port would become `{}`.

## See also

- [processMessage](./message.md) — messaging without Promises
- [Workers guide](../../guide/workers.md) — RPC pattern examples
