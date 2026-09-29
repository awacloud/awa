# DOM / Net — Network

Modules for HTTP, WebSocket, SSE, WebRTC and BroadcastChannel network communication.

## Modules

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [ajax](./ajax.md) | `function` (factory) | none | HTTP requests via Fetch API |
| [ws](./ws.md) | `function` (factory) | none | WebSocket with reconnection |
| [sse](./sse.md) | `{connect}` | none | EventSource (Server-Sent Events) with exponential retry |
| [webrtc](./webrtc.md) | `{peer}` | none | RTCPeerConnection wrapper (signaling-agnostic) |
| [broadcastChannel](./broadcastChannel.md) | `{create, isSupported}` | none | BroadcastChannel cross-tab/worker |
| [network](./network.md) | `{isOnline, onOnline, onOffline, onChange, ping, off}` | none | Online/offline detection + heuristic ping |

## Common pattern

```js
const ajax = runtime.resolve('ajax');
const ws   = runtime.resolve('ws');

// HTTP
const client = ajax('/api', { headers: { 'Authorization': 'Bearer ...' } });
const users = await client.get('/users');
await client.post('/users', { name: 'Alice' });

// WebSocket
const socket = ws('wss://example.com/ws');
socket.on('message', (data) => console.log(data));
socket.send({ type: 'hello' });
```
