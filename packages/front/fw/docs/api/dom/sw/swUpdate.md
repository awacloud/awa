---
module: swUpdate
category: dom/sw
dependencies: [serviceWorker]
returns: object
worker-safe: false
status: complete
---

# swUpdate

> Waiting-release update flow: report once, check, apply, version (page side).

**Module** `swUpdate` | **Source** `packages/front/fw/src/dom/sw/swUpdate.js` | **Deps** `serviceWorker` | **Worker-safe** no

Registers a service worker and drives its updates the safe way: a new release installs beside the running one and **waits**. The page is told once that a release is ready, checks on demand, and lets the waiting release take over only when the user accepts — then reloads on the next `controllerchange`. Pairs with the worker-side [`precache`](./precache.md), which answers the same message protocol.

## Resolve

```js
const swUpdate = runtime.resolve('swUpdate');
// Returns: { create, DEFAULT_MESSAGES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `create` | `(opts: SwUpdateOptions) => Promise<SwUpdateController>` | The update controller |
| `DEFAULT_MESSAGES` | `Readonly<{ skipWaiting: string, version: string }>` | The default wire protocol |

### `create(opts)`

Throws `TypeError('swUpdate.create: swUrl must be a non-empty string')` synchronously, before any await. Without service workers it resolves a controller in state `'unsupported'`; when `register` rejects, state `'failed'` — in both cases every member answers (`false`, `null`, `'unavailable'`).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `swUrl` | `string` | — | Worker script URL (required) |
| `registerOptions` | `RegistrationOptions` | `{ type: 'module', updateViaCache: 'none' }` | Forwarded to `serviceWorker.register` |
| `win` | `Window` | `globalThis` | The page window |
| `onUpdateReady` | `() => void` | — | Called once when a newer release waits on a controlled page |
| `onControlled` | `() => void` | — | Called at creation when a worker controls the page, and on every `controllerchange` |
| `messages` | `{ skipWaiting, version }` | `DEFAULT_MESSAGES` | Message types posted to the worker |
| `installWait` | `number` | `30000` | ms a check waits for a found release to finish installing |
| `versionWait` | `number` | `2000` | ms `version()` waits for the worker's answer |

### `SwUpdateController`

| Member | Signature | Description |
|--------|-----------|-------------|
| `state` | `'registered' \| 'unsupported' \| 'failed'` | Registration outcome |
| `updateReady` | `() => boolean` | A release waits and a worker controls the page |
| `checkForUpdates` | `() => Promise<CheckResult>` | Asks the server for a newer release |
| `applyUpdate` | `() => boolean` | Posts the skip-waiting message to the waiting worker and reloads on the next `controllerchange`; `false` when none waits |
| `version` | `() => Promise<string \| null>` | The release the active worker serves, over a `MessageChannel`; `null` without a worker, without `MessageChannel`, on a non-string answer or after `versionWait` |
| `controlled` | `() => boolean` | A worker controls the page |
| `dispose` | `() => void` | Removes the `updatefound`, `statechange` and `controllerchange` listeners it added |

### `CheckResult`

| Value | Meaning |
|-------|---------|
| `'current'` | No newer release |
| `'ready'` | A newer release is installed and waits (also reported through `onUpdateReady`, once) |
| `'offline'` | `navigator.onLine` is `false` or `registration.update()` rejected |
| `'unavailable'` | No service worker on this page |

### Message protocol (`DEFAULT_MESSAGES`)

Shared with [`precache`](./precache.md); override both sides with the same `messages` object.

| Key | Default type | Posted to | Worker answer |
|-----|--------------|-----------|---------------|
| `skipWaiting` | `'awa-sw-skip-waiting'` | the waiting worker | calls `skipWaiting()` |
| `version` | `'awa-sw-version'` | the controller (or the active worker), with a transferred port | `{ version }` on that port |

## Examples

### Banner with Update now / Later

```js
const swUpdate = runtime.resolve('swUpdate');
const banner = document.getElementById('update-banner');

const updates = await swUpdate.create({
    swUrl: './sw.js',
    onUpdateReady: () => { banner.hidden = false; },
});

document.getElementById('update-now').addEventListener('click', () => {
    updates.applyUpdate(); // the page reloads once the new release controls it
});
document.getElementById('update-later').addEventListener('click', () => {
    banner.hidden = true;  // the release keeps waiting; it is not reported again
});

// An About panel
const result = await updates.checkForUpdates(); // 'current' | 'ready' | 'offline' | 'unavailable'
const release = await updates.version();        // e.g. 'a1b2c3', or null
```

## Notes

- **Reported once, to a controlled page**: `onUpdateReady` fires at most once per `create()`, and only when a release waits AND a worker already controls the page — the first install of an uncontrolled page is not an update.
- Nothing reloads on its own: a `controllerchange` caused elsewhere (another tab accepting) does not reload this page; only a `controllerchange` after this page's `applyUpdate()` does.
- The default `updateViaCache: 'none'` makes every update check ask the server for the worker script.
- Requires a secure context (HTTPS or localhost), like every service worker API.

## See also

- [serviceWorker](./serviceWorker.md) — the registration primitive this module drives
- [precache](./precache.md) — the worker side answering the same protocol
