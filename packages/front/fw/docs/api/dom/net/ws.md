---
module: ws
category: dom/net
dependencies: []
returns: function
worker-safe: false
status: complete
---

# ws

> WebSocket client with automatic reconnection (exponential backoff), message queue, and chainable event API.

**Module** `ws` | **Source** `packages/front/fw/src/dom/net/ws.js` | **Deps** none | **Worker-safe** no

## Resolve

```js
const ws = runtime.resolve('ws');
// ws is a factory: ws(url | opts) → WsConnection
```

## API

### `ws(url | opts) → WsConnection`

```js
// Direct URL (all options at their defaults)
const socket = ws('wss://example.com/socket');

// With options
const socket = ws({
    url: 'wss://example.com/socket',
    retry: 5,         // 5 max reconnection attempts (default: 0 = no retry)
    retryDelay: 1000, // base delay in ms (default: 1000)
    maxDelay: 30000,  // maximum delay (default: 30000)
    binary: 'arraybuffer'  // binary type: 'arraybuffer' (default) or 'blob'
});
```

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `url` | `string` | — | WebSocket URL |
| `retry` | `number` | `0` | Max number of reconnections (0 = none) |
| `retryDelay` | `number` | `1000` | Base delay for backoff (ms) |
| `maxDelay` | `number` | `30000` | Maximum delay between attempts (ms) |
| `binary` | `string` | `'arraybuffer'` | Type of received binary messages |

---

### Events — `on(event, fn) → this`

```js
socket
    .on('open',    (event) => console.log('connected'))
    .on('message', (data, event) => console.log('received:', data))
    .on('close',   (event, ctx) => {
        // ctx.reconnecting : boolean
        // ctx.attempt : number of attempts made
        // ctx.remaining : remaining attempts
        console.log('closed, reconnecting:', ctx.reconnecting);
    })
    .on('error',   (event) => console.error('error'));
```

### `off(event) → this`

Removes the handler (replaced with a no-op).

---

### `send(data) → this`

Sends data. If the connection is not open, messages are queued and sent on reconnection.

```js
socket.send('Hello');
socket.send(JSON.stringify({ type: 'ping' }));
socket.send(arrayBuffer);
socket.send(new Uint8Array([1, 2, 3]));
```

Messages sent after a permanent `close()` are silently ignored.

### `close(code?, reason?) → void`

Permanently closes the connection (cancels reconnections, clears the queue).

```js
socket.close(1000, 'Goodbye');
socket.close();  // code 1000, empty reason
```

---

### Getters

| Getter | Type | Description |
|--------|------|-------------|
| `isOpen` | `boolean` | `true` when `readyState === OPEN` |
| `readyState` | `number` | Raw WebSocket state (0–3) |
| `bufferedAmount` | `number` | Bytes pending in the native send buffer |

---

### URL resolution

| Form | Resolution |
|-------|-----------|
| `ws://...` / `wss://...` | Used as-is |
| Relative path | Prefixed with the page protocol (`https:` → `wss://`, `http:` → `ws://`) + current host |

---

### Reconnection — exponential backoff with full jitter

Computed delay: `random(0, min(maxDelay, retryDelay × 2^attempt))`

Full jitter avoids the "thundering herd" effect (simultaneous reconnections from many clients).

## Examples

### Complete — subscribe + reconnect

```js
const ws = runtime.resolve('ws');

const socket = ws({
    url: 'wss://api.example.com/events',
    retry: 10,
    retryDelay: 500,
    maxDelay: 15000
});

socket
    .on('open', () => {
        console.log('connected');
        socket.send(JSON.stringify({ type: 'subscribe', channel: 'updates' }));
    })
    .on('message', (data) => {
        const msg = JSON.parse(data);
        handleEvent(msg);
    })
    .on('close', (ev, { reconnecting, attempt, remaining }) => {
        if (reconnecting) {
            console.log(`reconnection ${attempt}, ${remaining} remaining`);
        } else {
            console.log('permanently disconnected');
        }
    })
    .on('error', (ev) => {
        console.error('WebSocket error');
    });

// Close cleanly on exit
window.addEventListener('beforeunload', () => socket.close(1001, 'Page closed'));
```

## Notes

- `onerror` is always followed by `onclose` — update the UI in `close`.
- The queue is flushed automatically on reconnection.
- The attempt counter is reset to zero after a successful connection.

## See also

- [ajax](./ajax.md) — HTTP requests
- [processMessage](../../process/message.md) — inter-thread communication
