---
module: permissions
category: dom/utils
dependencies: []
returns: object
worker-safe: false
status: complete
---

# permissions

> Unified wrapper around `navigator.permissions` — query and observe permission statuses.

**Module** `permissions` | **Source** `packages/front/fw/src/dom/utils/permissions.js` | **Deps** none | **Worker-safe** no

Unified interface to query and observe browser permissions. Normalises browser-specific errors. No generic `request()` (the spec does not provide one — each API has its own trigger).

## Resolve

```js
const permissions = runtime.resolve('permissions');
// Returns: { isSupported, query, watch }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isSupported` | `() => boolean` | `'permissions' in navigator` |
| `query` | `(name: string) => Promise<State>` | `'granted'` / `'denied'` / `'prompt'` |
| `watch` | `(name, callback) => stop` | stop fn |

`State` = `'granted' | 'denied' | 'prompt'`

## Examples

### Single query

```js
const permissions = runtime.resolve('permissions');

const state = await permissions.query('geolocation');
if (state === 'granted') {
    const pos = await geolocation.current();
} else if (state === 'prompt') {
    showPermissionBanner();
}
```

### Observing changes

```js
const stop = permissions.watch('notifications', state => {
    updateNotificationBadge(state);
});

// Later:
stop();
```

### Supported names (examples)

```
geolocation, notifications, camera, microphone,
persistent-storage, clipboard-read, clipboard-write,
midi, accelerometer, gyroscope, magnetometer
```

> The exact list varies by browser. See the MDN Permissions API for the full reference.

## Notes

- **No generic `request()`**: the spec does not provide one. Each API triggers its own permission UI at the time of use (e.g. `getCurrentPosition` for geolocation, `getUserMedia` for camera).
- `prompt` ≠ `denied`: `prompt` means "not yet asked", the app can attempt the operation and the permission UI will appear.
- `query()` throws `Error('permissions: unsupported name "..."')` if the browser does not recognise the name.
- HTTPS required (or localhost) for sensitive permissions.

## See also

- [geolocation](../sensors/geolocation.md) — uses this API for permission status
- [sensors](../sensors/sensors.md) — iOS: `requestPermission()` specific to sensors
- [notifications](./notifications.md) — `Notification.requestPermission()` specific
