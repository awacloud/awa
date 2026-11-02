---
module: installPrompt
category: dom/sw
dependencies: []
returns: object
worker-safe: false
status: complete
---

# installPrompt

> PWA install prompt deferral and File Handling launch queue consumer (page side).

**Module** `installPrompt` | **Source** `packages/front/fw/src/dom/sw/installPrompt.js` | **Deps** none | **Worker-safe** no

Two feature-detected page helpers for an installable app. `install()` keeps the browser's `beforeinstallprompt` offer until the page prompts it, and follows `appinstalled`. `launchQueue()` hands the files an installed app was opened with (File Handling API) to a callback, as `FileSystemFileHandle`s.

## Resolve

```js
const installPrompt = runtime.resolve('installPrompt');
// Returns: { install, launchQueue }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `install` | `(opts?: InstallOptions) => InstallOffer` | The deferred install offer |
| `launchQueue` | `(opts: LaunchQueueOptions) => LaunchQueueConsumer` | The launch-queue consumer |

### `install(opts)`

Listens for `beforeinstallprompt` (calls `preventDefault()` and keeps the event) and `appinstalled` (drops it). Throws `TypeError('installPrompt.install: win must be an EventTarget')` when `win.addEventListener` is not a function.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `win` | `EventTarget` | `globalThis` | The window the events fire on |
| `onAvailable` | `() => void` | — | Called when the browser offers installation |
| `onInstalled` | `() => void` | — | Called once the app is installed |

**Returned offer:**

| Member | Signature | Description |
|--------|-----------|-------------|
| `available` | `() => boolean` | An offer is deferred and can be prompted |
| `prompt` | `() => Promise<'accepted' \| 'dismissed' \| 'unavailable'>` | Shows the deferred offer once; `'unavailable'` when nothing is deferred; a rejected `prompt()` or `userChoice`, or a missing `userChoice`, resolves `'dismissed'` — never rejects |
| `dispose` | `() => void` | Removes both listeners and drops the deferred offer |

### `launchQueue(opts)`

Registers a `launchQueue.setConsumer` consumer that calls `onFiles(handles)` with the launched files' handles (never an empty list). Throws `TypeError('installPrompt.launchQueue: onFiles must be a function')`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `win` | `object` | `globalThis` | The window carrying `launchQueue` |
| `onFiles` | `(handles: FileSystemFileHandle[]) => void` | — | Receives the launched handles (required) |

**Returned consumer:**

| Member | Type | Description |
|--------|------|-------------|
| `supported` | `boolean` | `win.launchQueue.setConsumer` exists; when `false`, nothing was touched |
| `dispose` | `() => void` | Replaces the consumer with a no-op (a consumer cannot be removed) |

## Examples

### An install button shown only when installation is offered

```js
const installPrompt = runtime.resolve('installPrompt');
const button = document.getElementById('install');

const offer = installPrompt.install({
    onAvailable: () => { button.hidden = false; },
    onInstalled: () => { button.hidden = true; },
});

button.addEventListener('click', async () => {
    button.hidden = true;
    const outcome = await offer.prompt(); // 'accepted' | 'dismissed' | 'unavailable'
    console.log('install:', outcome);
});
```

### Open the files the system launched the app with

```js
const installPrompt = runtime.resolve('installPrompt');

installPrompt.launchQueue({
    onFiles: async (handles) => {
        const [first] = handles;
        const file = await first.getFile();
        openDocument(file, first); // keep the handle to write back later
    },
});
```

## Notes

- `beforeinstallprompt`, `appinstalled` and `launchQueue` are Chromium-only today; elsewhere `onAvailable` never fires and `launchQueue()` returns `supported: false`.
- Never a nag: call `prompt()` only from a user gesture (a click); the browser ignores or refuses an unprompted call, and the offer can be shown only once.
- The launch queue hands `FileSystemFileHandle`s, not `File`s: call `handle.getFile()` to read, keep the handle to save back (see `fsAccess`).
- The File Handling launch queue needs a `file_handlers` entry in the web app manifest; this module does not write the manifest.

## See also

- [serviceWorker](./serviceWorker.md) — registration, the other half of an installable app
- [swUpdate](./swUpdate.md) — waiting-release update flow for the installed app
- [fsAccess](../fs/fsAccess.md) — reading and writing through `FileSystemFileHandle`s
