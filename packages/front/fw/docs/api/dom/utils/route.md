---
module: route
category: dom/utils
dependencies: [events]
returns: object
worker-safe: false
status: complete
---

# route

> Hash-based router — `sanity/base.js` blocks `history.pushState`, so hash (`#/path?key=val`) is the only client-side navigation strategy. `:param` / `*wildcard` patterns, query parsing, managed lifecycle.

**Module** `route` | **Source** `packages/front/fw/src/dom/utils/route.js` | **Deps** `events` | **Worker-safe** no

## Resolve

```js
const route = runtime.resolve('route');
```

## API

| Method | Signature | Description |
|---|---|---|
| `on` | `(name, pattern, fn, opts?)` | Register a route handler. Re-registering the same `name` replaces it. |
| `off` | `(name)` | Remove a handler. |
| `go` | `(path, query?)` | Navigate (update `location.hash`) and fire matching handlers. |
| `replace` | `(path, query?)` | Same as `go` but without a history entry (uses `location.replace`). |
| `current` | `() → {path, query, hash}` | Snapshot of the current state. |
| `refresh` | `()` | Re-dispatch on the current hash. |
| `start` | `()` | Install the `hashchange` listener + initial dispatch. Idempotent. |
| `dispose` | `()` | Detach + clear all routes. |
| `size` | getter `number` | Number of registered routes. |

### Options `on(name, pattern, fn, opts?)`

| Option | Type | Description |
|--------|------|-------------|
| `beforeEnter` | `(params, query, info) => boolean \| Promise<boolean>` | Entry guard. Returning `false` or `Promise<false>` cancels navigation and restores the previous hash. |
| `beforeLeave` | `(params, query, info) => boolean \| Promise<boolean>` | Leave guard. Same semantics. |
| `parent` | `string` | Name of a parent route — the effective pattern is `parentPattern + childPattern`. All ancestors fire parent → child. |

#### Nested routes

```js
route.on('app',   '/app',    layoutHandler);
route.on('users', '/users',  listHandler,   { parent: 'app' });
route.on('user',  '/:id',    detailHandler, { parent: 'users' });
// 'user' matches /app/users/:id ; fire order : layoutHandler → listHandler → detailHandler
```

#### Async guards

```js
route.on('account', '/account', handler, {
    beforeEnter: async (p, q) => {
        const ok = await isLoggedIn();
        if (!ok) { route.go('/login'); return false; }
    },
    beforeLeave: (p, q) => confirm('Leave without saving?'),
});
```

Returning `false` (or a `Promise` resolving to `false`) cancels navigation — the hash is restored.

### Pattern syntax

| Form | Description |
|---|---|
| `/literal` | Exact match (regex chars auto-escaped) |
| `/users/:id` | Captures `params.id` ; segment cannot contain `/` |
| `/files/*rest` | Greedy capture at tail ; may contain `/` |
| `/list/` ↔ `/list` | Trailing slash tolerated (except for root `/`) |

The handler receives `(params, query, info)`:
- `params` : `{...captures}` (string per segment, full string for `*`)
- `query`  : decoded object from `?key=val&…`
- `info`   : `{ path, hash, name }`

## Examples

```js
const route = runtime.resolve('route');

route.on('home',  '/',              () => mount(HomePage));
route.on('user',  '/users/:id',     ({ id }) => mount(UserPage, id));
route.on('files', '/files/*path',   ({ path }) => mount(FilesPage, path));
route.on('list',  '/list',          (_, { page = '1' }) => mount(ListPage, +page));

route.start();   // initial dispatch on the current URL

// Programmatic navigation
route.go('/users/42');
route.go('/list', { page: 3 });   // → #/list?page=3
route.replace('/login');           // without a new history entry
```

## Notes

- **Re-entry guard**: if a handler calls `route.go(...)`, the chained dispatch accumulates cleanly — no infinite recursion or double-fire.
- **`go()` on the same hash** still forces a dispatch (equivalent to clicking the active link).
- **Multiple routes match** (without parent/child relationship): handlers are invoked in **registration order** — all match independently. For "unique match", use a single route per canonical path.
- **Downstream chain invalidation**: when a parent route guard returns `false`, all children in the chain are short-circuited — dispatch stops at the first refusal.
- Native `pushState`/`replaceState` are blocked by sanity. `replace` uses `location.replace(url)`, which bypasses this limitation but triggers a full reload **if the URL changes outside the fragment** — `replace` here only acts on the hash, without reload.
- No out-of-the-box support for `<a href="#/x">` → click binding. Add an `events.delegate` at the application level if needed.
- Outlets (multiple display zones) are not natively managed — compose multiple `route.on` at the "page-controller" level or use `component`.

## See also

- [events](../query/events.md) — `route` uses `events.on` for the managed `hashchange` listener.
- [Security — sanity](../../../guide/security.md) — explains why `pushState` is blocked.
