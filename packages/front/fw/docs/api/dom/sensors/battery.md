---
module: battery
category: dom/sensors
dependencies: []
returns: object
worker-safe: false
status: complete
---

# battery

> Wrapper around the Battery Status API (`navigator.getBattery()`).

**Module** `battery` | **Source** `packages/front/fw/src/dom/sensors/battery.js` | **Deps** none | **Worker-safe** no

> **Deprecation note**: The Battery Status API is **deprecated in Firefox and Safari** for privacy reasons (fingerprinting). It remains available in Chrome/Edge but may disappear. Use `isSupported()` before any usage, and do not base critical features on it.

## Resolve

```js
const battery = runtime.resolve('battery');
// Returns: { isSupported, current, watch }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isSupported` | `() => boolean` | `'getBattery' in navigator` |
| `current` | `() => Promise<BatteryInfo>` | Current state or throw |
| `watch` | `(callback) => stop` | stop fn |

### Type `BatteryInfo`

```js
{
    level: number,            // 0..1 (0% to 100%)
    charging: boolean,
    chargingTime: number,     // seconds until 100%; Infinity if not measurable
    dischargingTime: number,  // seconds until 0%; Infinity if charging
}
```

## Examples

```js
const battery = runtime.resolve('battery');

if (battery.isSupported()) {
    const info = await battery.current();
    console.log(`${Math.round(info.level * 100)}% — ${info.charging ? 'charging' : 'on battery'}`);
}

// Real-time observation
const stop = battery.watch(info => {
    if (info.level < 0.1 && !info.charging) alert('Low battery!');
});
// stop() when done
```

## Notes

- `isSupported()` must be checked — most modern browsers have removed or frozen this API.
- `watch()` is async internally (getBattery() is a Promise). The initial callback is called as soon as the Promise resolves.
- Observed events: `levelchange`, `chargingchange`, `chargingtimechange`, `dischargingtimechange`.

## See also

- [networkInfo](./networkInfo.md) — network connection information
- [permissions](../utils/permissions.md) — Permissions API (not required for battery)
