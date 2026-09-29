# DOM — Browser interface layer

Modules for DOM manipulation, events, rendering, storage, and network communication.

## Categories

| Category | Content |
|-----------|---------|
| [rendering](./rendering/README.md) | Pipeline parser → render → template → uiSession |
| [query](./query/README.md) | Selection, attributes, styles, events, media |
| [display](./display/README.md) | Animations, fullscreen |
| [fs](./fs/README.md) | IndexedDB, localStorage, download |
| [net](./net/README.md) | AJAX, WebSocket, SSE, WebRTC, BroadcastChannel |
| [sw](./sw/README.md) | Service Worker lifecycle, Cache API |
| [utils](./utils/README.md) | Entropy, clipboard, user agent, permissions, notifications |
| [sensors](./sensors/README.md) | Geolocation, battery, network, inertial sensors |
| [lifecycle](./lifecycle/README.md) | Visibility, idle detection, wake lock |

## Modules by category

### rendering

| Module | Deps | Worker-safe | Description |
|--------|------|-------------|-------------|
| [parser](./rendering/parser.md) | none | yes | HTML → ElmNode[] |
| [render](./rendering/render.md) | none | yes | ElmNode[] → bound ElmNode[] |
| [sanitize](./rendering/sanitize.md) | none | yes | Allowlist-based HTML sanitiser (XSS) |
| [template](./rendering/template.md) | none | no | ElmNode[] → DOM nodes |
| [themeTokens](./rendering/themeTokens.md) | dom | no | CSS Custom Properties design tokens |
| [uiSession](./rendering/uiSession.md) | template, render, parser, dom | no | High-level facade |
| [component](./rendering/component.md) | none | no | Reusable component (template + state + lifecycle) |
| [reactiveBind](./rendering/reactiveBind.md) | signal | no | Explicit signal→DOM binding controller (patch via uiSession, no re-render) |
| [virtualScroll](./rendering/virtualScroll.md) | dom, events | no | Virtualised list for 10⁴–10⁶ items |
| [chart](./rendering/chart.md) | dom, animate, stats, linalg | no | Canvas 2D charts — line, area, bar, sparkline |
| [devtools](./rendering/devtools.md) | clock | no | uiSession introspection + profiler + elm-array dump |
| [devtoolsUI](./rendering/devtools-ui.md) | devtools | no | Opt-in read-only inspector — session, module-registry and signal-graph views |

### query

| Module | Deps | Worker-safe | Description |
|--------|------|-------------|-------------|
| [dnd](./query/dnd.md) | none | no | SDE-internal Drag & Drop via Pointer Events |
| [dom](./query/dom.md) | `secPolicy` | no | Selection, styles, attributes, scroll (CSS filtering via `secPolicy`) |
| [events](./query/events.md) | none | no | Named event management |
| [gesture](./query/gesture.md) | `events` | no | Touch/pointer gestures: tap, swipe, pan, pinch |
| [media](./query/media.md) | none | no | JS media queries |

### display

| Module | Deps | Worker-safe | Description |
|--------|------|-------------|-------------|
| [animate](./display/animate.md) | none | no | CSS/JS animations |
| [fullscreen](./display/fullscreen.md) | none | no | Fullscreen API |

### fs

| Module | Deps | Worker-safe | Description |
|--------|------|-------------|-------------|
| [download](./fs/download.md) | none | no | File download |
| [fsAccess](./fs/fsAccess.md) | none | partial | File System Access API + OPFS (DOM-bound pickers, OPFS worker-safe) |
| [indexedDB](./fs/indexedDB.md) | none | no | IndexedDB wrapper |
| [remoteStore](./fs/remoteStore.md) | `ajax`, `ws`, `eventBus` | yes | Remote key-value store HTTP/WS + watch + batch |
| [storage](./fs/storage.md) | none | no | localStorage / sessionStorage |

### net

| Module | Deps | Worker-safe | Description |
|--------|------|-------------|-------------|
| [ajax](./net/ajax.md) | none | no | HTTP requests |
| [ws](./net/ws.md) | none | no | WebSocket |
| [sse](./net/sse.md) | none | no | EventSource (SSE) + exponential retry |
| [webrtc](./net/webrtc.md) | none | no | RTCPeerConnection wrapper |
| [broadcastChannel](./net/broadcastChannel.md) | none | yes | BroadcastChannel cross-tab/worker |
| [network](./net/network.md) | none | partial | Online/offline detection + ping + Network Information API |

### sw

| Module | Deps | Worker-safe | Description |
|--------|------|-------------|-------------|
| [backgroundSync](./sw/backgroundSync.md) | `serviceWorker` | no | Background Sync API — offline replay via SyncManager (Chrome only) |
| [cache](./sw/cache.md) | none | yes | Cache API wrapper |
| [push](./sw/push.md) | `serviceWorker`, `b64` | no | PushManager wrapper — VAPID subscription, subscription, permission |
| [serviceWorker](./sw/serviceWorker.md) | none | no | SW lifecycle (window-side) |
| [sharedWorker](./sw/sharedWorker.md) | `processRPC` | no | SharedWorker cross-tab connection + bidirectional RPC |

### utils

| Module | Deps | Worker-safe | Description |
|--------|------|-------------|-------------|
| [a11y](./utils/a11y.md) | none | no | ARIA live regions, `aria-*` attributes, `role`, `prefers-reduced-motion` |
| [entropyCollector](./utils/entropyCollector.md) | none | no | Entropy collector |
| [clipboard](./utils/clipboard.md) | none | no | Clipboard |
| [ua](./utils/ua.md) | none | no | User agent detection |
| [permissions](./utils/permissions.md) | none | no | Permissions API query + watch |
| [notifications](./utils/notifications.md) | none | partial | Web Notifications API wrapper |
| [focus](./utils/focus.md) | `dom`, `events` | no | Focus trap, tab order, stash/restore |
| [keybindings](./utils/keybindings.md) | `events`, `eventBus` | no | Keyboard shortcuts (bindings, chords, contexts, priority) |
| [leaderElection](./utils/leaderElection.md) | `broadcastChannel` | no | Single-leader cross-tab election |
| [webauthn](./utils/webauthn.md) | `random`, `b64` | no | WebAuthn Level 3 — Passkeys / FIDO2 |
| [formKit](./utils/formKit.md) | `form`, `valid`, `reactiveBind`, `signal` | no | RHF-like ergonomic layer over `form` (register/watch/array/submit) |

### sensors

| Module | Deps | Worker-safe | Description |
|--------|------|-------------|-------------|
| [geolocation](./sensors/geolocation.md) | none | no | GPS / wifi position |
| [battery](./sensors/battery.md) | none | no | Battery Status API |
| [networkInfo](./sensors/networkInfo.md) | none | no | Network Information API |
| [sensors](./sensors/sensors.md) | none | no | Gyro/accel/orientation |

### lifecycle

| Module | Deps | Worker-safe | Description |
|--------|------|-------------|-------------|
| [visibility](./lifecycle/visibility.md) | none | no | Page Visibility API |
| [idle](./lifecycle/idle.md) | none | no | IdleDetector + fallback timer |
| [wakeLock](./lifecycle/wakeLock.md) | visibility | no | Wake Lock API |
