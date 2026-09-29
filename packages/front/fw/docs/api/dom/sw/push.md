---
module: push
category: dom/sw
dependencies: [serviceWorker, b64]
returns: object
worker-safe: false
status: complete
---

# push

> PushManager wrapper — VAPID subscribe/unsubscribe, current subscription, permission state.

**Module** `push` | **Source** `packages/front/fw/src/dom/sw/push.js` | **Deps** `serviceWorker`, `b64` | **Worker-safe** no

Wrapper around `PushManager` (**window side only**). Manages server push notification subscriptions with a VAPID public key. Payload encryption (RFC 8291) is **out of scope** — delegated to Bun/Node libs on the SDE server side.

References: Web Push Protocol RFC 8030, VAPID RFC 8292.

## Resolve

```js
const push = runtime.resolve('push');
// Returns: { subscribe, unsubscribe, current, permission, support }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `subscribe` | `(opts: SubscribeOpts) => Promise<PushSubResult>` | Serialized subscription |
| `unsubscribe` | `() => Promise<boolean>` | `true` if unsubscribed |
| `current` | `() => Promise<PushSubResult \| null>` | Active subscription or `null` |
| `permission` | `() => Promise<'granted' \| 'denied' \| 'prompt'>` | Push permission state |
| `support` | `() => { available: boolean, sw: boolean }` | Available capabilities |

### Options `subscribe`

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `applicationServerKey` | `Uint8Array \| string` | — | VAPID public key (Uint8Array or base64url). **Required.** |
| `userVisibleOnly` | `boolean` | `true` | Required `true` by Chrome (always). |

### Type `PushSubResult`

```js
{
    endpoint: string,          // push endpoint URL
    expirationTime: number | null,
    keys: {
        p256dh: string | null, // DH public key (base64)
        auth: string | null,   // authentication secret (base64)
    },
    raw: PushSubscription,     // original native object
}
```

## Examples

### Initial subscription

```js
const push = runtime.resolve('push');

if (push.support().available) {
    const vapidPublicKey = 'BEl62iUYgUivxIkv...'; // base64url VAPID
    const sub = await push.subscribe({ applicationServerKey: vapidPublicKey });

    // Send sub.endpoint + sub.keys to the server
    await fetch('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }),
        headers: { 'Content-Type': 'application/json' },
    });
}
```

### Inspection and unsubscription

```js
const push = runtime.resolve('push');

const current = await push.current();
if (current) {
    console.log('Subscribed to:', current.endpoint);
    const ok = await push.unsubscribe();
    console.log('Unsubscribed:', ok);
}
```

### Permission check

```js
const push = runtime.resolve('push');
const state = await push.permission();
// 'granted' | 'denied' | 'prompt'
if (state === 'denied') {
    console.warn('Push notifications blocked by the user');
}
```

## Notes

- **Payload encryption not managed client-side.** Building the encrypted message (RFC 8291 / ECDH P-256 + AES-GCM) is delegated to server libs (`web-push` npm, `web_push` Rust, etc.).
- `PushManager` requires **HTTPS** (or `localhost`) — the subscription will silently fail on HTTP.
- `userVisibleOnly: true` is enforced by Chrome; setting `false` may raise an exception on some browsers.
- The `applicationServerKey` in base64url (RFC 4648 §5) is automatically converted via `b64`.
- The `raw` property of `PushSubResult` contains the native `PushSubscription` — not cross-worker serializable.

## See also

- [serviceWorker](./serviceWorker.md) — SW lifecycle (basis for `push.ready()`)
- [cache](./cache.md) — Cache API (often combined with SW push)
- [notifications](../utils/notifications.md) — Web Notifications API (displaying received notifications)
