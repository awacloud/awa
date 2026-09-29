# DOM / Lifecycle

Observing app state: visibility, inactivity, wake lock.

## Modules

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [visibility](./visibility.md) | `{isSupported, state, onChange, ...}` | none | Page visibility (visible/hidden) |
| [idle](./idle.md) | `{isSupported, create, fallback, ...}` | none | IdleDetector + fallback timer |
| [wakeLock](./wakeLock.md) | `{isSupported, acquire}` | `visibility` | Wake Lock API (prevents sleep) |
