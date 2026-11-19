---
module: ua
category: dom/utils
dependencies: []
returns: object
worker-safe: false
status: complete
---

# ua

> Client detection — mobile, touch and platform, from UA Client Hints first and the UA string only where they say nothing.

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
| `mobile` | `() => boolean` | `true` on a phone-class device: UA-CH `mobile`, else "Mobi" in the UA (computed at init) |
| `touch` | `() => boolean` | Touch support (evaluated on each call) |
| `platform` | `() => 'ios' \| 'android' \| 'windows' \| 'mac' \| 'linux' \| 'unknown'` | Normalized OS: UA-CH `platform`, else the UA string (computed at init) |

### `ua.string() → string`

Raw UA string (`navigator.userAgent`). Computed at init.

```js
ua.string();
// e.g.: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0...) AppleWebKit/605.1.15...'
```

### `ua.mobile() → boolean`

`true` on a phone-class device, following MDN's "Browser detection using the user
agent": `navigator.userAgentData.mobile` (User-Agent Client Hints, Chromium-based
browsers) when it exists, else the string "Mobi" anywhere in the UA. Tablets are not
mobile (an Android tablet UA has no "Mobile" token); an iPad in Safari's mobile mode
sends "Mobile/…" and is. Computed once at init.

```js
ua.mobile();  // → true on a phone
```

### `ua.touch() → boolean`

Detects touch support at call time (runtime check).

```js
ua.touch();  // → true if the device supports touch
```

`true` when `'ontouchstart' in window` OR `navigator.maxTouchPoints > 0`. May change on hybrid devices (touch laptops).

### `ua.platform() → string`

Normalized OS — value computed at init. `navigator.userAgentData.platform` first (`Windows`, `macOS`, `Linux`,
`Android`, `iOS`, and `Chrome OS` → `'linux'`; any other hint → `'unknown'`), else a few UA tokens. A `Macintosh`
UA on a device with more than one touch point is iPadOS asking for desktop sites, so it reads `'ios'`.

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
- Detection is **heuristic** and both the UA string and the hints can be spoofed (an emulator that overrides the UA string also derives the hints from it). Prefer feature detection (`ua.touch()`, `media.isSupported()`) when a capability is what you need.
- Measured in headless Chromium 148: `userAgentData` `{ platform: 'Windows', mobile: false }` → `platform()` `'windows'`, `mobile()` `false`.
- Returns empty strings in non-browser environments.

## See also

- [media](../query/media.md) — multimedia capabilities (feature detection)
- [events](../query/events.md) — for touch/pointer events
