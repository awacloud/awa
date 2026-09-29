---
module: leaderElection
category: dom/utils
dependencies: [broadcastChannel]
returns: object
worker-safe: false
status: complete
---

# leaderElection

> Elects a unique leader among multiple tabs/clients of the same origin.

**Module** `leaderElection` | **Source** `packages/front/fw/src/dom/utils/leaderElection.js` | **Deps** `broadcastChannel` | **Worker-safe** no

Used to centralise a WebSocket connection, relay cross-tab via a single writer, avoid job duplication (remote sync, cron), or as a fallback when SharedWorker is unavailable.

Two automatic strategies:

- **Primary — Web Locks API**: `navigator.locks.request(name, {mode: 'exclusive'}, callback)`. The client holding the lock is the leader as long as it lives; closing the tab releases the lock automatically, triggering the next election without delay.
- **Fallback — BroadcastChannel + heartbeat**: if Web Locks is unavailable, probabilistic election. The lowest id wins. Each client emits a heartbeat every `heartbeatMs` ms; if no heartbeat from a lower id is received within `takeoverMs` ms, the client self-promotes and notifies the others.

## Resolve

```js
const leaderElection = runtime.resolve('leaderElection');
// Returns: { create, support }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `create` | `(opts: CreateOpts) => Election` | Election instance |
| `support` | `() => SupportInfo` | Environment capabilities |

### `leaderElection.create(opts)`

#### Options `create`

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `channel` | `string` | — | **Required.** Web Locks lock name and BroadcastChannel name (must be consistent). |
| `id` | `string` | UUID v4 | Unique client identifier. |
| `heartbeatMs` | `number` | `1000` | Heartbeat interval (fallback only). |
| `takeoverMs` | `number` | `3000` | Delay before takeover without lower heartbeat (fallback only). |

#### Returned `Election` object

| Member | Signature | Description |
|--------|-----------|-------------|
| `id` | `string` | Identifier of this instance. |
| `onLeader` | `(fn: () => void) => unsubscribe` | Called when this instance becomes leader. |
| `onFollower` | `(fn: () => void) => unsubscribe` | Called when this instance loses leadership. |
| `isLeader` | `() => boolean` | `true` if this instance is leader. |
| `leader` | `() => {id, since, isMe} \| null` | Information about the current leader. |
| `dispose` | `() => void` | Releases all resources. Idempotent. |

### `leaderElection.support()`

```js
// { webLocks: boolean, broadcastChannel: boolean }
leaderElection.support();
```

Returns capabilities available in the current environment. `webLocks: true` indicates the primary strategy will be used.

## Examples

### Singleton WebSocket connection

```js
const leaderElection = runtime.resolve('leaderElection');

const election = leaderElection.create({ channel: 'ws-leader' });

election.onLeader(() => {
    const socket = new WebSocket('wss://api.example.com/stream');
    socket.onmessage = (e) => broadcastToAllTabs(e.data);
});

election.onFollower(() => {
    // Close the connection if leadership is lost
    socket?.close();
});
```

### SharedWorker fallback

```js
const leaderElection = runtime.resolve('leaderElection');
const { webLocks, broadcastChannel } = leaderElection.support();

if (!sharedWorkerAvailable && broadcastChannel) {
    const election = leaderElection.create({
        channel: 'sync-leader',
        heartbeatMs: 500,
        takeoverMs: 1500,
    });
    election.onLeader(() => startSyncJob());
    election.onFollower(() => stopSyncJob());
}
```

### Singleton sync

```js
const election = leaderElection.create({ channel: 'cron-sync' });

election.onLeader(async () => {
    while (election.isLeader()) {
        await runSyncTask();
        await sleep(30_000);
    }
});
```

## Notes

- In Web Locks mode, the leadership transition is instantaneous (atomic lock release) — no heartbeat required.
- In fallback mode, the maximum delay before taking leadership is `takeoverMs + heartbeatMs`. Decreasing these values reduces latency but increases BroadcastChannel traffic.
- `dispose()` is idempotent: calling it multiple times produces no error.
- The `_forceFallback: true` option is reserved for tests; it forces BroadcastChannel mode even when Web Locks is available.
- `leader()` may return `null` briefly during the initial election phase.

## See also

- [broadcastChannel](../net/broadcastChannel.md) — BroadcastChannel transport used in fallback
- [fsAccess](../fs/fsAccess.md) — shared cross-tab storage (OPFS)
- [Guide module-pattern](../../../guide/module-pattern.md)
