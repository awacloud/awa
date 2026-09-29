---
module: ua
category: dom/utils
dependencies: []
returns: object
worker-safe: false
status: complete
---

# ua

> User agent detection — mobile, touch, and OS platform. All values computed once at init.

**Module** `ua` | **Source** `packages/front/fw/src/dom/utils/ua.js` | **Deps** none | **Worker-safe** no

## Resolve

```js
const ua = runtime.resolve('ua');
// Returns: { string, mobile, touch, platform }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `string` | `() => string` | Raw `navigator.userAgent` (computed at init) |
| `mobile` | `() => boolean` | `true` on iOS/Android (pattern match at init) |
| `touch` | `() => boolean` | Touch support (evaluated on each call) |
| `platform` | `() => 'ios' \| 'android' \| 'windows' \| 'mac' \| 'linux' \| 'unknown'` | Normalized OS (computed at init) |

### `ua.string() → string`

Raw UA string (`navigator.userAgent`). Computed at init.

```js
ua.string();
// e.g.: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0...) AppleWebKit/605.1.15...'
```

### `ua.mobile() → boolean`

Detects a mobile device via pattern matching on the UA string.

```js
ua.mobile();  // → true on iOS, Android, etc.
```

Pattern-list detection (two regexes: full UA + 4-character prefix), computed once at init. Behaviour is pinned by the module's test table.

### `ua.touch() → boolean`

Detects touch support at call time (runtime check).

```js
ua.touch();  // → true if the device supports touch
```

Checks `'ontouchstart' in window` AND `navigator.maxTouchPoints > 0`. May change on hybrid devices (touch laptops).

### `ua.platform() → string`

Normalized OS — value computed at init.

| Returns | System |
|--------|---------|
| `'ios'` | iPhone, iPad |
| `'android'` | Android |
| `'windows'` | Windows |
| `'mac'` | macOS |
| `'linux'` | Linux |
| `'unknown'` | Unrecognized |

```js
switch (ua.platform()) {
    case 'ios':     enableIOSFeatures(); break;
    case 'android': enableAndroidFeatures(); break;
    default:        enableDesktopLayout(); break;
}
```

## Examples

### Interface adaptation

```js
const ua = runtime.resolve('ua');
const dom = runtime.resolve('dom');

// Adapt layout based on context
if (ua.mobile()) {
    dom.attr(document.body, 'data-layout', 'mobile');
} else {
    dom.attr(document.body, 'data-layout', 'desktop');
}

// Enable touch interactions if available
if (ua.touch()) {
    enableSwipeGestures();
}

// iOS-specific feature
if (ua.platform() === 'ios') {
    // Handle notch, safe-area, navigation overlay...
    dom.style(document.body, 'padding-bottom', 'env(safe-area-inset-bottom)');
}
```

## Notes

- `mobile()`, `platform()`, and `string()` return values computed once at init — no per-call overhead.
- `touch()` is evaluated on each call because it may change on hybrid devices.
- UA detection is **heuristic** and can be spoofed. Prefer feature detection (`ua.touch()`, `media.isSupported()`) when possible.
- Returns empty strings in non-browser environments.

## See also

- [media](../query/media.md) — multimedia capabilities (feature detection)
- [events](../query/events.md) — for touch/pointer events
