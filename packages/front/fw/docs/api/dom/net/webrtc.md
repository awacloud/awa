---
module: webrtc
category: dom/net
dependencies: []
returns: object
worker-safe: false
status: complete
---

# webrtc

> RTCPeerConnection wrapper minimal — signaling-agnostic, offer/answer/ICE + data channels.

**Module** `webrtc` | **Source** `packages/front/fw/src/dom/net/webrtc.js` | **Deps** none | **Worker-safe** no

Thin wrapper around `RTCPeerConnection` and `RTCDataChannel`. Provides helpers for offer/answer SDP, ICE candidate management with **automatic queue** before `setRemoteDescription`, data channels with a **send queue** before opening, and structured `WebRTCError` errors. **Signaling is out of scope** — the caller manages SDP/ICE transport (WS, REST, BroadcastChannel, etc.).

## Resolve

```js
const webrtc = runtime.resolve('webrtc');
// Returns: { peer, WebRTCError }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `peer` | `(config?: RTCConfiguration) => Peer` | WebRTC Peer instance |
| `WebRTCError` | Constructor on the resolved API | Structured error (see below) |

### `WebRTCError`

Structured error wrapping all WebRTC rejections. Fields: `kind` (stable string), `message`, `cause` (underlying DOMException).

> Defined **inside the factory** (worker-safe) and exposed on the resolved API, not as a top-level export. For `instanceof`, use the class from the resolved module: `const { WebRTCError } = runtime.resolve('webrtc'); err instanceof WebRTCError`. `name` is set via `Object.defineProperty` to survive `Error.prototype` freezing by sanity.

| `kind` | Origin |
|--------|---------|
| `'setLocal'` | `setLocalDescription` failed |
| `'setRemote'` | `setRemoteDescription` failed |
| `'addIceCandidate'` | ICE ingestion failed (after flush) |
| `'createOffer'` | SDP negotiation failed |
| `'createAnswer'` | SDP negotiation failed |
| `'sendOverflow'` | DataChannel send queue exceeded (`sendQueueMax`) |
| `'sendClosed'` | `send()` called after channel close |

### `Peer` object

| Method / Property | Signature | Description |
|---------------------|-----------|-------------|
| `createOffer` | `(opts?) => Promise<RTCSessionDescriptionInit>` | Creates an SDP offer |
| `createAnswer` | `(opts?) => Promise<RTCSessionDescriptionInit>` | Creates an SDP answer |
| `setLocal` | `(desc) => Promise<void>` | `setLocalDescription` |
| `setRemote` | `(desc) => Promise<void>` | `setRemoteDescription` + flush ICE queue |
| `addIceCandidate` | `(candidate) => Promise<void>` | Candidate queued before `setRemote`, applied after |
| `dataChannel` | `(label: string, opts?) => DataChannelWrapper` | Creates a data channel |
| `addTrack` | `(track, ...streams) => RTCRtpSender` | Adds a media track |
| `removeTrack` | `(sender) => void` | Removes a track |
| `on` | `(event: string, cb: Function) => () => void` | Adds a listener (returns unsubscribe) |
| `off` | `(event: string, cb: Function) => void` | Removes a listener |
| `close` | `() => void` | Closes the connection, all data channels, and removes listeners |
| `connectionState` | `getter: string` | Connection state |
| `iceConnectionState` | `getter: string` | ICE state |
| `pendingIce` | `getter: number` | Number of ICE candidates pending flush |
| `raw` | `getter: RTCPeerConnection` | Native instance |

**Events**: `'icecandidate'`, `'track'`, `'datachannel'`, `'connectionstatechange'`, `'icegatheringstatechange'`, `'iceconnectionstatechange'`, `'icecandidateerror'`

### `DataChannelWrapper` object

| Property / Method | Description |
|---------------------|-------------|
| `onopen` | Setter — callback on open; automatic flush of the send queue |
| `onmessage` | Setter — callback on receive `(data, event)` |
| `onclose` | Setter — callback on close; clears the send queue |
| `onerror` | Setter — callback on error (receives `WebRTCError` on overflow/sendClosed) |
| `send(data)` | Sends or queues until open. Throws `WebRTCError` if closed/overflow |
| `close()` | Closes the channel and removes all listeners |
| `readyState` | `getter: 'connecting' \| 'open' \| 'closing' \| 'closed'` |
| `queuedAmount` | `getter: number` — messages pending flush |
| `raw` | `getter: RTCDataChannel` — native channel |

#### `dataChannel(label, opts)` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `sendQueueMax` | `number` | `1024` | Max send queue size before `sendOverflow` |
| (others) | — | — | All native `RTCDataChannelInit` fields passed through |

## Examples

### P2P connection (data channel)

```js
const webrtc = runtime.resolve('webrtc');

// Offerer side
const localPeer = webrtc.peer({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
const ch = localPeer.dataChannel('chat', { ordered: true });

ch.onopen = () => ch.send('Hello!');
ch.onmessage = (data) => console.log('Got:', data);

localPeer.on('icecandidate', (candidate) => {
    // Send candidate to remote via signaling (WS, REST...)
    signalingSocket.send(JSON.stringify({ type: 'ice', candidate }));
});

const offer = await localPeer.createOffer();
await localPeer.setLocal(offer);
// Send the offer via signaling
signalingSocket.send(JSON.stringify({ type: 'offer', sdp: offer }));

// Receive answer via signaling
signalingSocket.on('answer', async (sdp) => {
    await localPeer.setRemote(sdp);
});
```

### Receiving a data channel (answerer side)

```js
const remotePeer = webrtc.peer();

remotePeer.on('datachannel', (event) => {
    const ch = event.channel;
    ch.onmessage = (data) => console.log('Remote says:', data);
});

// Receive offer, create answer
const answer = await remotePeer.createAnswer();
await remotePeer.setLocal(answer);
```

### Access to native API

```js
// For any functionality not exposed by the wrapper
const rtc = peer.raw; // native RTCPeerConnection
rtc.getStats().then(stats => console.log(stats));
```

## Notes

- **Signaling out of scope** — this module provides no transport for SDP/ICE exchange. Use [`ws`](./ws.md), [`ajax`](./ajax.md), or [`broadcastChannel`](./broadcastChannel.md) as appropriate.
- Not available in Web Workers — `RTCPeerConnection` is main-thread only.
- **ICE queue**: `addIceCandidate()` before `setRemoteDescription` buffers candidates, flushed in order after `setRemote()`. Individual flush errors are emitted via `'icecandidateerror'` but do not interrupt the flush.
- **Send queue**: `dc.send()` before the `'open'` state buffers messages. `sendQueueMax` controls the limit; exceeding it → `WebRTCError('sendOverflow')` via `onerror` + throw.
- `close()` also closes all `DataChannelWrapper` instances created by this peer, releasing their listener arrays.
- **Error handling**: switch on `err.kind` to distinguish cases (`'sendOverflow'`, `'setRemote'`, etc.) in a stable way across versions.
- For camera/microphone, obtain tracks via [`media`](../query/media.md) then `peer.addTrack(track)`.

## See also

- [ws](./ws.md) — possible signaling transport
- [broadcastChannel](./broadcastChannel.md) — local signaling (same origin, multi-tab)
- [media](../query/media.md) — obtain getUserMedia tracks
