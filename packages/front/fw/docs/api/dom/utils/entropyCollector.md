---
module: entropyCollector
category: dom/utils
dependencies: ['sensors']
returns: function
worker-safe: false
status: complete
---

# entropyCollector

> Entropy collection from user interactions — mouse, keyboard, touch, accelerometer via `sensors`. Complement to `entropy` for high-security applications.

**Module** `entropyCollector` | **Source** `packages/front/fw/src/dom/utils/entropyCollector.js` | **Deps** `sensors` | **Worker-safe** no

## Resolve

```js
const entropyCollector = runtime.resolve('entropyCollector');
// Returns: function create(onEntropy, opts?) → EntropyCollector
```

## API

### `entropyCollector(onEntropy, opts?) → EntropyCollector`

```js
const collector = entropyCollector(
    (data, bits, source) => {
        // data   : number | number[] — collected value(s)
        // bits   : number — estimated entropy in bits
        // source : string — source name ('mouse', 'keyboard', ...)
        mixEntropy(data, bits);
    },
    {
        target: window   // EventTarget — default: window (see note below)
    }
);
```

---

### Methods of `EntropyCollector`

#### `collector.start(event?) → Promise<{ motionGranted: boolean | null }>`

Starts collection. Without an argument, attaches all listeners immediately.

```js
// Simple start
const { motionGranted } = await collector.start();

// From a click handler (recommended on iOS)
btn.addEventListener('click', async (e) => {
    const { motionGranted } = await collector.start(e);
    // motionGranted : true/false on iOS 13+ (permission requested)
    //                 null if no permission required
});
```

No-op if already active.

#### `collector.stop() → void`

Stops collection and detaches all listeners (DOM and motion). No-op if inactive.

#### `collector.requestMotionPermission() → Promise<boolean>`

Manually requests motion permission on iOS 13+ via `sensors.requestPermission()`.

```js
const granted = await collector.requestMotionPermission();
```

Must be called from a user gesture handler (click, touchstart).

#### `collector.isActive → boolean`

Getter — `true` if collection is in progress.

---

## Entropy sources

| Source | Event | Estimated bits | Details |
|--------|-----------|-------------|---------|
| Mouse | `mousemove` | 2 | `[clientX, clientY]` — throttled to 1/100 ms |
| Keyboard | `keydown` | 32* | Timing × crypto supplement |
| Touch | `touchmove` | 1 | `[clientX, clientY]` of first contact |
| Accelerometer | `sensors.motion` | 32* | Acceleration via `sensors.motion.watch()` + timing |
| Timing supplement | (per event) | 32* | XOR with `getRandomValues` |

*32 bits with `crypto.getRandomValues` available, ~3 bits otherwise.*

DOM listeners (`mousemove`, `keydown`, `touchmove`) are attached with `{ passive: true }` on the provided `target`.
Accelerometer data is collected via `sensors.motion.watch()` — always on `window` (constraint of the native API).

## Internal implementation

- A shared `Uint32Array(8)` buffer is allocated once at factory level.
- `getRandomValues` is called once for every 8 timing events — conserves calls.
- Timing values are XORed with crypto words to remain unpredictable even if `performance.now` is reduced in precision.
- Motion permission is delegated to `sensors.requestPermission()`, which covers motion **and** orientation in a single call.

## iOS 13+ motion permission

On iOS 13+, motion permission is handled by `sensors.requestPermission()`. Passing the native `Event` to `start()` automatically triggers the request:

```js
// Automatic — pass the click Event to start()
button.addEventListener('click', e => collector.start(e));

// Manual — request permission yourself, then start without event
button.addEventListener('click', async () => {
    await collector.requestMotionPermission();
    collector.start();
});
```

## Note — `target` and motion events

The `target` option only affects DOM listeners (`mousemove`, `keydown`, `touchmove`). Accelerometer data is collected via `sensors.motion.watch()`, which always attaches to `window` internally — aligned with the native constraint: `DeviceMotionEvent` is only delivered to `window`.

## Example — entropy accumulation before key generation

```js
const entropyCollector = runtime.resolve('entropyCollector');
const random          = runtime.resolve('random');

let pool = [];
let collected = 0;
const TARGET_BITS = 256;

const collector = entropyCollector((data, bits, source) => {
    const arr = Array.isArray(data) ? data : [data];
    pool.push(...arr);
    collected += bits;

    if (collected >= TARGET_BITS) {
        collector.stop();
        generateKey();
    }
});

// Start from a click (iOS requires a gesture)
document.querySelector('#generate').addEventListener('click', async (e) => {
    const { motionGranted } = await collector.start(e);
    if (!motionGranted) {
        console.log('Accelerometer unavailable — other sources active');
    }
    showCollectionUI();
});

function generateKey() {
    // Combine collected entropy with crypto
    const keyBytes = random.bytes(32);
    // Mix with pool to reinforce
    for (let i = 0; i < pool.length && i < keyBytes.length; i++) {
        keyBytes[i] ^= pool[i] & 0xFF;
    }
    return keyBytes;
}
```

## Notes

- On iOS 13+, motion permission is required from a gesture handler — which is why `start(event)` takes the optional event. Permission is delegated to `sensors.requestPermission()`.
- In the absence of accelerometer support (`sensors.motion.isSupported() === false`), the other sources (mouse, keyboard, touch) remain active.
- Refactored: replaces direct `devicemotion` listening and the internal `askMotionPermission` helper with `sensors.motion.watch()` and `sensors.requestPermission()`.

## See also

- [sensors](../sensors/sensors.md) — sensors module (motion, orientation, gyroscope, accelerometer)
- [random](../../crypto/utils/random.md) — direct cryptographic generator
- [uuid](../../crypto/utils/uuid.md) — random identifiers
