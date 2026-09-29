---
module: sse
category: dom/net
dependencies: []
returns: object
worker-safe: false
status: complete
---

# sse

> EventSource (Server-Sent Events) — unidirectional server connection with exponential retry and Last-Event-ID tracking.

**Module** `sse` | **Source** `packages/front/fw/src/dom/net/sse.js` | **Deps** none | **Worker-safe** no

Wrapper around the native `EventSource` API. Adds configurable exponential backoff, `Last-Event-ID` tracking (replay-on-reconnect via query parameter), `reconnect` events for telemetry, and guaranteed native bridge cleanup on each reconnection (zero listener leak). For bidirectional communication, use [`ws`](./ws.md).

## Resolve

```js
const sse = runtime.resolve('sse');
// Returns: { connect }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `connect` | `(url: string, options?) => Connection` | SSE connection object |

### `connect` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `withCredentials` | `boolean` | `false` | Send credentials (cookies, auth headers) |
| `retry.initial` | `number` | `1000` | Initial reconnection delay (ms) |
| `retry.max` | `number` | `30000` | Max reconnection delay (ms) |
| `retry.factor` | `number` | `2` | Exponential multiplier factor |
| `autoConnect` | `boolean` | `true` | Connect immediately; `false` = manual call |
| `lastEventIdParam` | `string` | `'lastEventId'` | Query-param name for the Last-Event-ID on reconnection |
| `initialLastEventId` | `string\|null` | `null` | Initial Last-Event-ID (e.g. restored from localStorage) |

### `Connection` object

| Property / Method | Signature | Description |
|---------------------|-----------|-------------|
| `on` | `(eventName: string, cb: Function) => void` | Adds a listener |
| `off` | `(eventName: string, cb: Function) => void` | Removes a listener |
| `onError` | `(cb: (event, readyState: number) => void) => () => void` | Error listener with `readyState`; returns unsubscribe |
| `onReconnect` | `(cb: ({ attempt, delay }) => void) => () => void` | Reconnection telemetry listener; returns unsubscribe |
| `close` | `() => void` | Closes the connection + stops retries |
| `readyState` | `getter: number` | `0` connecting, `1` open, `2` closed |
| `url` | `getter: string` | Base URL (without query string mutation) |
| `lastEventId` | `getter: string\|null` | Last observed `Last-Event-ID` |

**Special event names**:
- `'message'` — default SSE event (no `event:` field)
- `'open'` — connection established
- `'error'` — error / connection loss (triggers retry)
- `'reconnect'` — telemetry before each reconnection (`{ attempt, delay }`)
- any other name — matches the `event:` field on the server side

## Examples

### Server data stream

```js
const sse = runtime.resolve('sse');

const conn = sse.connect('/api/events');

conn.on('open', () => console.log('Connected'));
conn.on('message', (data) => console.log('Received:', data));
conn.on('error', (err) => console.warn('Error, retrying...', err));

// Close after 60 seconds
setTimeout(() => conn.close(), 60_000);
```

### Named events

```js
const conn = sse.connect('/api/stream', {
    retry: { initial: 500, max: 10000, factor: 1.5 },
});

conn.on('user-joined', (data) => renderUser(JSON.parse(data)));
conn.on('user-left', (data) => removeUser(JSON.parse(data)));
conn.on('message', (data) => addMessage(data));
```

### Deferred connection

```js
const conn = sse.connect('/api/feed', { autoConnect: false });

// Connect later (e.g. after login)
authDone.then(() => conn.connect());
```

### Replay from the last known event (LEI)

```js
// Restore the lastEventId saved between sessions
const conn = sse.connect('/api/events', {
    initialLastEventId: localStorage.getItem('lastEventId'),
    lastEventIdParam: 'since',          // server reads ?since=…
});

conn.on('message', (data, event) => {
    if (event.lastEventId) localStorage.setItem('lastEventId', event.lastEventId);
    processEvent(JSON.parse(data));
});
```

### Reconnection telemetry

```js
const conn = sse.connect('/api/feed');
conn.onReconnect(({ attempt, delay }) => {
    ui.text('status', 'status', `Reconnecting #${attempt} in ${delay}ms…`);
});
conn.onError((event, readyState) => {
    console.warn('SSE error, readyState=', readyState);
});
```

## Notes

- `EventSource` is **unidirectional** (server → client). To send data, use [`ajax`](./ajax.md) or [`ws`](./ws.md).
- Not available in Web Workers — use `processMessage` to relay events to the worker from the main thread.
- Last-Event-ID tracking is client-side: the server must read the query param (`lastEventIdParam`) and resume the stream from the corresponding ID for replay to work.
- Only one native bridge per `eventName` is attached on the active `EventSource` — no listener leak on reconnections.
- `close()` permanently stops retries and clears listeners. To reconnect, create a new connection.
- `onError` / `onReconnect` return an unsubscribe function — prefer these helpers over `on('error', …)` / `on('reconnect', …)` for cleanup.

## See also

- [ws](./ws.md) — bidirectional WebSocket
- [ajax](./ajax.md) — HTTP requests
- [broadcastChannel](./broadcastChannel.md) — cross-tab/worker communication
