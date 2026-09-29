---
module: sensors
category: dom/sensors
dependencies: []
returns: object
worker-safe: false
status: complete
---

# sensors

> Inertial sensors — orientation, motion, gyroscope, accelerometer. Generic Sensor API preferred, fallback DeviceMotionEvent.

**Module** `sensors` | **Source** `packages/front/fw/src/dom/sensors/sensors.js` | **Deps** none | **Worker-safe** no

Wraps browser APIs for device inertial sensors. Prefers the **Generic Sensor API** (`Gyroscope`, `Accelerometer`) when available; falls back to `DeviceMotionEvent`/`DeviceOrientationEvent`. `requestPermission()` helper for iOS 13+.

## Resolve

```js
const sensors = runtime.resolve('sensors');
// Returns: { orientation, motion, gyroscope, accelerometer, requestPermission }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `orientation.isSupported` | `() => boolean` | `DeviceOrientationEvent` support |
| `orientation.watch` | `(cb, opts?: { absolute? }) => () => void` | `stop` fn; callback `{alpha, beta, gamma, absolute, timestamp}` |
| `motion.isSupported` | `() => boolean` | `DeviceMotionEvent` support |
| `motion.watch` | `(cb) => () => void` | `stop` fn; full motion callback |
| `gyroscope.isSupported` | `() => boolean` | Generic Sensor `Gyroscope` or fallback support |
| `gyroscope.watch` | `(cb, opts?: { frequency? }) => () => void` | `stop` fn; callback `{x, y, z, timestamp}` |
| `accelerometer.isSupported` | `() => boolean` | Generic Sensor `Accelerometer` support |
| `accelerometer.watch` | `(cb, opts?: { frequency?, includeGravity? }) => () => void` | `stop` fn; callback `{x, y, z, timestamp}` |
| `requestPermission` | `() => Promise<'granted' \| 'denied' \| 'unsupported'>` | iOS 13+ permission |

### `sensors.orientation`

```js
sensors.orientation.isSupported()             // boolean
const stop = sensors.orientation.watch(callback, options?)
// options : { absolute?: false }
// callback({ alpha, beta, gamma, absolute, timestamp })
```

Wraps `DeviceOrientationEvent`. `alpha` = rotation around Z (compass), `beta` = X (front-back), `gamma` = Y (left-right).

### `sensors.motion`

```js
sensors.motion.isSupported()
const stop = sensors.motion.watch(callback)
// callback({ acceleration: {x,y,z}, accelerationIncludingGravity: {...}, rotationRate: {alpha,beta,gamma}, interval, timestamp })
```

### `sensors.gyroscope`

```js
sensors.gyroscope.isSupported()
const stop = sensors.gyroscope.watch(callback, options?)
// options : { frequency: 60 }
// callback({ x, y, z, timestamp })
```

Prefers `new Gyroscope(options)`. Fallback: extracts `rotationRate` from `DeviceMotionEvent`.

### `sensors.accelerometer`

```js
sensors.accelerometer.isSupported()
const stop = sensors.accelerometer.watch(callback, options?)
// options : { frequency: 60, includeGravity: false }
// callback({ x, y, z, timestamp })
```

### `sensors.requestPermission()`

```js
const status = await sensors.requestPermission()
// 'granted' | 'denied' | 'unsupported'
```

iOS 13+ requires explicit permission. On Android/desktop where `requestPermission` is not exposed, returns `'granted'` directly.

## Examples

### iOS — permission request

```js
const sensors = runtime.resolve('sensors');

// Must be triggered from a user gesture (click)
const status = await sensors.requestPermission();
if (status === 'granted') {
    const stop = sensors.motion.watch(data => {
        console.log(data.acceleration);
    });
}
```

### Gyroscope (Generic Sensor)

```js
const stop = sensors.gyroscope.watch(({ x, y, z }) => {
    updateGyroDisplay(x, y, z);
}, { frequency: 30 });
```

## Notes

- **Generic Sensor API** (Chrome 67+, HTTPS required) is preferred: configurable frequency, clear permissions.
- **iOS 13+**: `DeviceMotionEvent.requestPermission()` required — call from a user gesture, not at load time.
- **HTTPS required** for Generic Sensor (Permissions Policy).
- `watch` always returns a `stop` fn directly.
- **Axis conventions**: `gyroscope` and `accelerometer` expose `{x, y, z}`. With `Gyroscope` (Generic Sensor) the axes follow the screen coordinate system; with the `DeviceMotionEvent.rotationRate` fallback, the mapping is `beta → x`, `gamma → y`, `alpha → z` — values may differ in sign and magnitude. Consumers switching between the two paths must recalibrate.
- `isSupported()` for `gyroscope`/`accelerometer` detects API presence, not hardware — on desktop `DeviceMotionEvent` may be defined without ever firing events.

## See also

- [geolocation](./geolocation.md) — GPS position
- [permissions](../utils/permissions.md) — Permissions API
