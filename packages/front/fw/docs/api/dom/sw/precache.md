---
module: precache
category: dom/sw
dependencies: [cache]
returns: object
worker-safe: true
status: complete
---

# precache

> Worker-side release precache with cache-first / network-first strategies.

**Module** `precache` | **Source** `packages/front/fw/src/dom/sw/precache.js` | **Deps** `cache` | **Worker-safe** yes

The service-worker half of a versioned offline app. `install` pre-caches the release's files into a cache named `prefix + version`; `activate` deletes this prefix's older caches and claims the pages; `fetch` serves same-origin GET requests cache-first or network-first, chosen per request; `message` answers the page-side [`swUpdate`](./swUpdate.md) protocol. The worker scope is passed explicitly (`scope: self`).

## Resolve

```js
const precache = runtime.resolve('precache');
// Returns: { create, DEFAULT_MESSAGES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `create` | `(opts: PrecacheOptions) => PrecacheInstance` | A release precache for one scope |
| `DEFAULT_MESSAGES` | `Readonly<{ skipWaiting: string, version: string }>` | The default wire protocol (shared with `swUpdate`) |

### `create(opts)`

Throws `TypeError` (`precache.create: …`) when `scope` has no `addEventListener`, `prefix` or `version` is not a non-empty string, `urls` is not an array of strings, `strategy` is not a function, or `takeOver` is not one of `'first-install'`, `'always'`, `'never'`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `ServiceWorkerGlobalScope` | — | The worker scope (`self`); required, never defaulted |
| `prefix` | `string` | — | Cache-name prefix owned by this app |
| `version` | `string` | — | The release; the cache is `prefix + version` |
| `urls` | `string[]` | — | The release's files, relative to the worker |
| `strategy` | `(request, url) => 'cache-first' \| 'network-first' \| 'pass'` | `() => 'cache-first'` | Per-request strategy |
| `navigationFallback` | `string \| null` | `'./'` | Served for a navigation miss in cache-first; `null` goes to the network |
| `cacheRuntime` | `boolean` | `true` | Keep a copy of each 200 network response |
| `takeOver` | `'first-install' \| 'always' \| 'never'` | `'first-install'` | When install calls `skipWaiting()` |
| `claim` | `boolean` | `true` | `clients.claim()` on activate |
| `messages` | `{ skipWaiting, version } \| null` | `DEFAULT_MESSAGES` | Message protocol; `null` installs no `message` listener |

### `PrecacheInstance`

| Member | Signature | Description |
|--------|-----------|-------------|
| `cacheName` | `string` | `prefix + version` |
| `handlers` | `{ install, activate, fetch, message }` | The event handlers, callable directly |
| `cacheFirst` | `(request) => Promise<Response>` | The release's copy first (a navigation ignores the query, then falls back to `navigationFallback`), else the network (kept when 200 and `cacheRuntime`), else `Response.error()` |
| `networkFirst` | `(request) => Promise<Response>` | The network first (kept when 200 and `cacheRuntime`), else the last copy, else `Response.error()` |
| `listen` | `() => PrecacheInstance` | Attaches `install`, `activate`, `fetch` and (with `messages`) `message` to the scope; idempotent |

### Strategy function contract

`strategy(request, url)` runs only for same-origin GET requests (others are left to the browser, no `respondWith`). It returns:

| Value | Effect |
|-------|--------|
| `'cache-first'` | `respondWith(cacheFirst(request))` — the default, for a versioned shell |
| `'network-first'` | `respondWith(networkFirst(request))` — e.g. for a development build |
| `'pass'` | no `respondWith`: the browser handles the request |

### First-install take-over

With the default `takeOver: 'first-install'`, install calls `skipWaiting()` only when the registration has no active worker yet — the first visit works offline at once — while every later release installs and **waits** until the page sends the skip-waiting message. `'always'` skips waiting on every install; `'never'` always waits.

### Message protocol

| Message `type` (default) | Effect |
|--------------------------|--------|
| `'awa-sw-skip-waiting'` | `event.waitUntil(scope.skipWaiting())` |
| `'awa-sw-version'` | `event.ports[0].postMessage({ version })` when a port is transferred |

Any other type is ignored. Pass the same `messages` object to `swUpdate` to change the strings.

## Examples

### A development build stays network-first

```js
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
precache.factory(cache.factory()).create({
    scope: self,
    prefix: 'my-app-',
    version: VERSION,
    urls: ['./'],
    strategy: () => (VERSION === 'dev' ? 'network-first' : 'cache-first'),
}).listen();
```

## Worker Usage

The service-worker script itself (a module worker, registered with `{ type: 'module' }`):

```js
// sw.js
import { cache } from '@awacloud/fw/dom/sw/cache.js';
import { precache } from '@awacloud/fw/dom/sw/precache.js';

precache.factory(cache.factory()).create({
    scope: self,
    prefix: 'my-app-',
    version: 'v42',
    urls: ['./', 'main.js', 'app.css', 'icon-192.png'],
}).listen();
```

## Notes

- Only this prefix's caches are deleted on activate — never another app's caches on the same origin, never other storage.
- `cacheRuntime` keeps runtime responses only when the status is 200; cache write errors are swallowed, never surfaced to the page.
- The factory captures nothing: `scope`, `caches`, `fetch` and `Response` are read at call time, so the module evaluates in any realm and tests pass a fake scope.

## See also

- [cache](./cache.md) — the CacheStorage wrapper this module opens and deletes through
- [serviceWorker](./serviceWorker.md) — page-side registration
- [swUpdate](./swUpdate.md) — the page side of the update and version protocol
