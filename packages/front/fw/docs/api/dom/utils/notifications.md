---
module: notifications
category: dom/utils
dependencies: []
returns: object
worker-safe: partial
status: complete
---

# notifications

> Wrapper around the Web Notifications API. Permission, show, autoClose, closeAll, showFromSW.

**Module** `notifications` | **Source** `packages/front/fw/src/dom/utils/notifications.js` | **Deps** none | **Worker-safe** partial

- `show()`: window context only (`Notification` constructor).
- `showFromSW()`: Service Worker context (via `registration.showNotification`).

## Resolve

```js
const notifications = runtime.resolve('notifications');
// Returns: { isSupported, permission, requestPermission, show, close, closeAll, showFromSW }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isSupported` | `() => boolean` | `typeof Notification !== 'undefined'` |
| `permission` | `() => string` | `'default'` / `'granted'` / `'denied'` |
| `requestPermission` | `() => Promise<'granted'|'denied'>` | Status after request |
| `show` | `(title, options?) => handle` | Handle `{close, notification}` |
| `close` | `(handle) => void` | Closes and cleans up |
| `closeAll` | `() => void` | Closes all tracked notifications |
| `showFromSW` | `(registration, title, options?) => Promise` | Notification via SW |

### Options `show()`

```js
{
    // Native NotificationOptions
    body: string,
    icon: string,
    tag: string,          // replaces an existing notification with the same tag
    badge: string,
    image: string,
    actions: [...],
    // Module options
    onclick: Function,
    onclose: Function,
    onerror: Function,
    onshow: Function,
    autoCloseMs: number,  // automatically closes after N ms
}
```

## Examples

### Standard flow

```js
const notifications = runtime.resolve('notifications');

// 1. Request permission (once, from a user gesture)
const perm = await notifications.requestPermission();
if (perm !== 'granted') return;

// 2. Show
const handle = notifications.show('New message', {
    body: 'Alice: Hi!',
    icon: '/icons/message.png',
    tag: 'chat',           // replaces the previous notification with this tag
    autoCloseMs: 5000,
    onclick: () => { window.focus(); handle.close(); },
});

// 3. Manual close if needed
handle.close();
notifications.closeAll(); // closes all module notifications
```

### Via Service Worker

```js
const swModule = runtime.resolve('serviceWorker');
const reg = await swModule.register('/sw.js');

await notifications.showFromSW(reg, 'Update available', {
    body: 'Reload to update.',
    actions: [{ action: 'reload', title: 'Reload' }],
});
```

## Notes

- `show()` throws if `permission()` ≠ `'granted'`. Call `requestPermission()` beforehand.
- `tag`: native semantics — a new notification with the same tag replaces the old one in the notification tray.
- `autoCloseMs` is managed by the module via `setTimeout`; if a manual close precedes expiration, the timer is cancelled.
- `closeAll` only closes notifications tracked by this module (not those from other scripts or the SW).
- HTTPS required except on localhost.

## See also

- [permissions](./permissions.md) — `permissions.query('notifications')` for prior status
- [serviceWorker](../sw/serviceWorker.md) — for `showFromSW`
