---
module: indexedDB
category: dom/fs
dependencies: ['broadcastChannel']
returns: object
worker-safe: false
status: complete
---

# indexedDB

> IndexedDB wrapper with Promise API per store, named change listeners, and cross-tab notifications via BroadcastChannel.

**Module** `indexedDB` | **Source** `packages/front/fw/src/dom/fs/indexedDB.js` | **Deps** `broadcastChannel` | **Worker-safe** no

## Resolve

```js
const idb = runtime.resolve('indexedDB');
// Returns: { isSupported, open, drop }
```

## API

### `idb.isSupported() → boolean`

### `idb.open(name, version, upgrade?, options?) → Promise<DB>`

Opens or creates/migrates an IndexedDB database.

```js
const db = await idb.open('myApp', 1, (db, oldVersion, newVersion) => {
    // Called if version changes
    if (oldVersion < 1) {
        db.createObjectStore('cache');
        db.createObjectStore('users', { keyPath: 'id' });
    }
});
```

| Param | Type | Description |
|-------|------|-------------|
| `name` | `string` | Database name |
| `version` | `number` | Version (integer ≥ 1) |
| `upgrade` | `(db, oldVersion, newVersion) → void` | Migration callback (optional) |
| `options` | `{ crossTab?, namespace? }` | Cross-tab options (optional, see below) |

#### Options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `crossTab` | `boolean` | `true` | If `false`, disables all cross-tab broadcasting. `listen` events stay same-tab only. |
| `namespace` | `string` | `''` | BroadcastChannel name prefix to isolate events between user sessions sharing the same browser. Must not contain `:`. |

**Channel name construction**:

```js
// With namespace:
const channelName = `idb:${namespace}:${name}`;   // e.g.: 'idb:user-42:myApp'

// Without namespace:
const channelName = `idb:${name}`;                 // e.g.: 'idb:myApp'
```

**Validation**:
- `crossTab` must be a boolean if provided, otherwise `throw 'indexedDB: crossTab must be a boolean'`.
- `namespace` must be a string without `:`, otherwise `throw 'indexedDB: namespace must be a string without ":"'`.

### `idb.drop(name) → Promise<void>`

Permanently deletes the database.

---

### `DB` — database handle

```js
db.name          // → string
db.version       // → number
db.storeNames    // → string[]
db.close()       // closes the connection and the broadcastChannel (if active)
```

### `db.store(storeName) → IDBStoreAccessor`

Returns an accessor for the named store.

### `db.listen` — change notifications

Fires after each `set`, `del`, and `clear` on any store.

```js
db.listen.add('myListener', ({ type, store, key, cross }) => {
    // type : 'set' | 'del' | 'clear'
    // store : store name
    // key : IDBValidKey | null (null for 'clear')
    // cross : true if event came from another tab
    console.log(type, store, key);
});

db.listen.del('myListener');
```

---

### `IDBStoreAccessor` — CRUD methods

```js
const s = db.store('cache');

// Read
const val    = await s.get(key);           // → * | undefined
const exists = await s.has(key);           // → boolean
const all    = await s.getAll();           // → *[]
const allKeys = await s.getAllKeys();      // → IDBValidKey[]
const count  = await s.count();            // → number

// Write
const stored = await s.set(key, value);   // → IDBValidKey (stored key)
await s.del(key);
await s.clear();

// Iteration
await s.each((value, key) => {
    // Return false to stop iteration
    if (key === 'stop') return false;
    console.log(key, value);
});
```

All `set`, `del`, `clear` methods emit a notification to registered listeners.

### Query filtering

`getAll`, `getAllKeys`, and `count` accept a `query` (key or `IDBKeyRange`) and an optional max `count`:

```js
await s.getAll(IDBKeyRange.bound('a', 'z'), 10);
await s.count(IDBKeyRange.lowerBound('prefix_'));
```

### Cross-tab change notification

Listeners receive `cross: false` for changes in the same tab, `cross: true` for changes from other tabs (via the `broadcastChannel` module).

Compatibility: Chrome 54+, Firefox 38+, Safari 15.4+. Silent degradation if `BroadcastChannel` is not available (same-tab only).

### Multi-user isolation with `namespace`

Use the `namespace` option to isolate BroadcastChannel events between multiple user sessions sharing the same browser (e.g. two authenticated accounts in two tabs):

```js
// Tab A — user 42
const dbA = await idb.open('myApp', 1, undefined, { namespace: 'user-42' });
// Channel: 'idb:user-42:myApp'

// Tab B — user 99
const dbB = await idb.open('myApp', 1, undefined, { namespace: 'user-99' });
// Channel: 'idb:user-99:myApp'

// Mutations in A trigger NO callback in B (separate channels)
```

> **Warning**: `namespace` isolates **only** BroadcastChannel broadcasting. IndexedDB store contents share the same database if `name` is identical — data separation between users must be done at a higher level (prefix on `name` or on keys).

### Opt-out cross-tab with `crossTab: false`

```js
// No BroadcastChannel created — same-tab events only
const db = await idb.open('myApp', 1, undefined, { crossTab: false });
```

## Examples

### Complete — config + listener

```js
const idb = runtime.resolve('indexedDB');

// Open with migration and user namespace
const db = await idb.open('app', 2,
    (db, oldVersion) => {
        if (oldVersion < 1) db.createObjectStore('config');
        if (oldVersion < 2) db.createObjectStore('logs');
    },
    { namespace: 'user-42' }
);

const config = db.store('config');

// CRUD
await config.set('theme', 'dark');
await config.set('lang',  'fr');

const theme = await config.get('theme');   // 'dark'
const keys  = await config.getAllKeys();    // ['theme', 'lang']

// Iterate
await config.each((val, key) => console.log(key, '=', val));

// Listen to changes (including cross-tab, same namespace only)
db.listen.add('sync', ({ type, store, key, cross }) => {
    if (store === 'config') refreshUI();
});

db.close();
```

## Notes

- The `broadcastChannel` module is declared as a dependency: no native `new BroadcastChannel(...)` in this module.
- If `broadcastChannel.isSupported()` returns `false`, degradation is silent (same-tab only, no error).
- `namespace` resolves the multi-session BroadcastChannel ambiguity, but does not replace a prefix on `name` or on keys for data separation in the database.

## See also

- [storage](./storage.md) — localStorage / sessionStorage (synchronous, simple)
- [broadcastChannel](../net/broadcastChannel.md) — underlying module for cross-tab broadcasting
- [download](./download.md)
