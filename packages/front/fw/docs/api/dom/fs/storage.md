---
module: storage
category: dom/fs
dependencies: ['broadcastChannel']
returns: object
worker-safe: false
status: complete
---

# storage

> `localStorage` / `sessionStorage` wrapper with JSON API, named change listeners, and cross-tab broadcasting via BroadcastChannel.

**Module** `storage` | **Source** `packages/front/fw/src/dom/fs/storage.js` | **Deps** `broadcastChannel` | **Worker-safe** no

## Resolve

```js
const storage = runtime.resolve('storage');
// Returns: { local, session, isSupported, configure }
// local / session : StorageNamespace | null
```

`local` and `session` are `null` when storage is unavailable (private browsing, sandboxed iframe, quota exceeded).

## API

### `storage.isSupported() → boolean`

Returns `true` if at least one backend is available.

---

### `storage.configure({ crossTab?, namespace? })`

Configures cross-tab broadcasting for `storage.local`. Must be called **before** the first `listen.add`. Idempotent as long as no callback is registered.

**Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|--------|-------------|
| `crossTab` | `boolean` | `true` | `false` disables all cross-tab broadcasting (BroadcastChannel and native listener). |
| `namespace` | `string` | `''` | BroadcastChannel name prefix. Must be a string without `:`. |

**Throws**:
- `'storage: configure must be called before any listen.add'` if callbacks are already registered.
- `'storage: namespace must be a string without ":"'` if `namespace` contains `:` or is not a string.
- `'storage: crossTab must be a boolean'` if `crossTab` is not a strict boolean.

**Does not affect** `storage.session` (always same-tab only).

---

### StorageNamespace — common interface for `local` and `session`

| Method | Signature | Description |
|---------|-----------|-------------|
| `set` | `(key, value)` | Stores the value (JSON serialized) |
| `get` | `(key) → * \| null` | Reads the value (deserialized) — `null` if absent |
| `has` | `(key) → boolean` | Checks key existence |
| `del` | `(key)` | Removes the entry |
| `clear` | `()` | Clears the namespace |
| `keys` | `() → string[]` | Lists the keys |
| `length` | `number` (getter) | Number of entries |

```js
// Persistent storage
storage.local.set('user', { id: 1, name: 'Alice', role: 'admin' });
const user = storage.local.get('user');   // → { id: 1, name: 'Alice', role: 'admin' }

storage.local.has('user');    // → true
storage.local.keys();         // → ['user']
storage.local.length;         // → 1

storage.local.del('user');
storage.local.has('user');    // → false

// Session storage
storage.session.set('token', 'Bearer abc123');
const token = storage.session.get('token');   // → 'Bearer abc123'
```

### `get` behaviors

- Absent key → `null`
- Stored non-valid JSON value → returned as-is (raw string, backward compatibility)

---

### `listen` — change notifications

Named listeners. For `localStorage`, other tabs receive mutations via BroadcastChannel (or native fallback).

```js
storage.local.listen.add('myListener', ({ type, key, value, cross }) => {
    // type  : 'set' | 'del' | 'clear'
    // key   : string | null (null for 'clear')
    // value : stored value (for 'set')
    // cross : true if the event comes from another tab
    console.log(type, key);
});

storage.local.listen.del('myListener');
```

### Resulting cross-tab policy (`storage.local.listen`)

| `crossTab` | `broadcastChannel.isSupported()` | Cross-tab transport |
|------------|----------------------------------|---------------------|
| `true` (default) | `true` | **BroadcastChannel** (namespaced). Native `storage` listener **not activated**. |
| `true` | `false` | Fallback: native `storage` event listener (no namespace isolation — see warning below). |
| `false` | n/a | No cross-tab. Same-tab only. |

`storage.session.listen` **never** uses BroadcastChannel or `storage` event (same behavior: same-tab only).

### Channel name construction (internal)

```js
const channelName = namespace
    ? `storage:${namespace}:local`
    : 'storage:local';
```

> **Multi-session warning**: For two authenticated users cohabiting in two tabs of the same browser, provide a distinct `namespace` per session **AND** prefix `localStorage` keys at a higher level to isolate data — `namespace` only isolates BroadcastChannel broadcasting.

---

### Listener / channel behaviors

- Activated lazily on the first `listen.add` (no ambient overhead before use)
- BC closed (or native listener removed) when the last callback is removed
- `sessionStorage`: never cross-tab notifications

## Examples

### User preferences

```js
const storage = runtime.resolve('storage');

if (!storage.local) {
    console.warn('localStorage unavailable');
} else {
    const theme = storage.local.get('theme') ?? 'light';
    applyTheme(theme);

    function savePrefs({ theme, lang }) {
        storage.local.set('theme', theme);
        storage.local.set('lang',  lang);
    }

    storage.local.listen.add('themeSync', ({ type, key, cross }) => {
        if (cross && key === 'theme') {
            applyTheme(storage.local.get('theme'));
        }
    });
}
```

### Multi-session with namespace

```js
const storage = runtime.resolve('storage');

// Isolate BroadcastChannel broadcasting for the current user.
// Also prefix keys to isolate data.
storage.configure({ namespace: `user-${currentUserId}` });

storage.local.listen.add('sync', ({ type, key, value, cross }) => {
    if (cross) console.log('Another tab modified:', key, value);
});
```

### Opt-out cross-tab

```js
const storage = runtime.resolve('storage');
storage.configure({ crossTab: false });

// Callbacks now only receive same-tab mutations.
storage.local.listen.add('localOnly', (evt) => {
    console.assert(evt.cross === false);
});
```

## Notes

- `storage.local` uses BroadcastChannel for cross-tab broadcasting when available, which is more reliable than the native `storage` event listener and allows namespace isolation.
- The fallback on the native `storage` event listener does not support `namespace` isolation: all tabs of the same origin receive events.
- `storage.session` is isolated by native design (each tab has its own sessionStorage); `cross` will always be `false` for `session` callbacks.
- `configure` must be called before any `listen.add`; once a callback is registered, the configuration is frozen until all callbacks are removed.

## See also

- [indexedDB](./indexedDB.md) — structured data, large volumes, or requiring queries
- [download](./download.md) — client-side file download
- [broadcastChannel](../net/broadcastChannel.md) — direct cross-tab / cross-context broadcasting
