# DOM / Utils — Browser utilities

Utility modules for accessibility, entropy collection, clipboard, user agent detection, and various browser helpers.

## Modules

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [a11y](./a11y.md) | `object` | none | ARIA live regions, `aria-*` attributes, `role`, `prefers-reduced-motion` |
| [entropyCollector](./entropyCollector.md) | `function` (factory) | `sensors` | Entropy collection from user events (motion via `sensors`) |
| [clipboard](./clipboard.md) | `object` | none | Clipboard read/write |
| [form](./form.md) | `{bind, create}` | `dom`, `events` | Input ↔ state binding + full form state machine |
| [formKit](./formKit.md) | `{create}` | `form`, `valid`, `reactiveBind`, `signal` | RHF-like ergonomic layer over `form` (register/watch/array/submit), resolver = `valid.compile` |
| [route](./route.md) | `object` | `events` | Hash-based router with `:param` / `*wildcard` patterns |
| [ua](./ua.md) | `object` | none | User agent and platform detection |
| [permissions](./permissions.md) | `{isSupported, query, watch}` | none | Unified Permissions API query |
| [notifications](./notifications.md) | `{isSupported, show, requestPermission, ...}` | none | Web Notifications API wrapper |
| [focus](./focus.md) | `{trap, tabOrder, next, previous, stash, current, onChange}` | `dom`, `events` | Focus trap, tab order and stash/restore |
| [keybindings](./keybindings.md) | `{create, parse}` | `events`, `eventBus` | Keyboard shortcuts: simple bindings, chords, contexts, priority |
| [leaderElection](./leaderElection.md) | `{create, support}` | `broadcastChannel` | Single-leader cross-tab election (Web Locks + BC fallback) |
| [webauthn](./webauthn.md) | `{register, authenticate, support}` | `random`, `b64` | WebAuthn Level 3 — Passkeys / FIDO2 registration and authentication |

## Notes

- `sanity/base.js` blocks `Math.random` and `crypto.randomUUID` — use `random` or the `uuid` module instead.
