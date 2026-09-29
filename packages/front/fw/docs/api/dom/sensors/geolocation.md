---
module: geolocation
category: dom/sensors
dependencies: []
returns: object
worker-safe: false
status: complete
---

# geolocation

> Promise-based and observable wrapper around `navigator.geolocation`.

**Module** `geolocation` | **Source** `packages/front/fw/src/dom/sensors/geolocation.js` | **Deps** none | **Worker-safe** no

Wraps the browser Geolocation API with a simplified interface. `current()` returns a Promise, `watch()` returns a `stop` fn. Normalized payload `{lat, lon}` (not `coords.latitude`).

## Resolve

```js
const geolocation = runtime.resolve('geolocation');
// Returns: { isSupported, current, watch }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isSupported` | `() => boolean` | `'geolocation' in navigator` |
| `current` | `(options?) => Promise<Position>` | Normalized position or throw |
| `watch` | `(callback, options?) => stop` | stop fn (clearWatch) |

### Type `Position`

```js
{
    lat: number,
    lon: number,
    accuracy: number,          // metres
    altitude: number | null,
    altitudeAccuracy: number | null,
    heading: number | null,    // degrees 0-360 from north
    speed: number | null,      // m/s
    timestamp: number,         // ms Unix
}
```

### Options (forwarded to the native API)

```js
{
    enableHighAccuracy: boolean,  // GPS if available (slower, more accurate)
    timeout: number,              // ms before PositionError.TIMEOUT
    maximumAge: number,           // ms — accept cached position
}
```

## Examples

### Single position

```js
const geolocation = runtime.resolve('geolocation');

try {
    const pos = await geolocation.current({ enableHighAccuracy: true });
    console.log(`${pos.lat}, ${pos.lon} ± ${pos.accuracy}m`);
} catch (err) {
    if (err.code === 1) console.log('Permission denied');
    if (err.code === 2) console.log('Position unavailable');
    if (err.code === 3) console.log('Timeout');
}
```

### Real-time tracking

```js
const stop = geolocation.watch(pos => {
    updateMap(pos.lat, pos.lon);
}, { enableHighAccuracy: true });

// Later:
stop();
```

### Combined with `permissions` (plan 29)

```js
const permissions = runtime.resolve('permissions');
const status = await permissions.query('geolocation');
if (status === 'granted') {
    const pos = await geolocation.current();
}
```

## Error codes

| Code | Constant | Description |
|------|-----------|-------------|
| 1 | `PERMISSION_DENIED` | User denied access |
| 2 | `POSITION_UNAVAILABLE` | Sensor unavailable |
| 3 | `TIMEOUT` | `timeout` option exceeded |

## Notes

- **HTTPS required** except `localhost` — the Geolocation API is blocked on HTTP.
- **Explicit user permission** required — combine with [`permissions.query('geolocation')`](../utils/permissions.md) for proactive UX.
- Accuracy depends on the device: GPS (accurate), wifi (medium), IP (low).
- `watch` returns the `stop` fn directly (not an object).
- `current()` throws with `err.code` accessible to distinguish cases.

## See also

- [permissions](../utils/permissions.md) — permission status query before the call
- [sensors](./sensors.md) — inertial sensors (gyro, accelerometer)
