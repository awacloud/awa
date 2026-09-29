---
module: networkInfo
category: dom/sensors
dependencies: []
returns: object
worker-safe: false
status: complete
---

# networkInfo

> Wrapper around `navigator.connection` (Network Information API).

**Module** `networkInfo` | **Source** `packages/front/fw/src/dom/sensors/networkInfo.js` | **Deps** none | **Worker-safe** no

> **Variable support**: Network Information API is in draft / origin-trial depending on the browser. Chrome/Android supports most fields; Safari does not. Test `isSupported()` and use `effectiveType` as the most stable field.

## Resolve

```js
const networkInfo = runtime.resolve('networkInfo');
// Returns: { isSupported, current, watch }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isSupported` | `() => boolean` | `'connection' in navigator` |
| `current` | `() => NetworkInfo` | Current state (synchronous) or throw |
| `watch` | `(callback) => stop` | stop fn |

### Type `NetworkInfo`

```js
{
    downlink: number,                              // estimated Mbit/s (downlink)
    downlinkMax: number | undefined,               // theoretical maximum (physical type)
    effectiveType: 'slow-2g' | '2g' | '3g' | '4g',  // most stable field
    rtt: number,                                   // estimated latency ms (rounded to 25ms)
    saveData: boolean,                             // data saver mode active
    type: string | undefined,                      // 'wifi' | 'cellular' | 'ethernet' | ...
}
```

## Examples

```js
const networkInfo = runtime.resolve('networkInfo');

if (networkInfo.isSupported()) {
    const info = networkInfo.current();
    if (info.effectiveType === 'slow-2g' || info.saveData) {
        loadLowResImages();
    }
}

// Watch for changes
const stop = networkInfo.watch(info => {
    console.log('Connection:', info.effectiveType, info.downlink, 'Mbit/s');
});
```

## Notes

- `effectiveType` is the most stable cross-browser field for adapting the UI.
- `current()` is **synchronous** (unlike `battery.current()` which is async).
- The `change` event fires on every connection change (wifi → 4g, etc.).

## See also

- [battery](./battery.md) — battery state
- [network](../net/network.md) — online/offline detection (more reliable)
