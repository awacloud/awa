# DOM / FS — Storage and files

Modules for local persistence and file download.

## Modules

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [download](./download.md) | `object` | none | Client-side file download |
| [fsAccess](./fsAccess.md) | `object` | none | File System Access API + OPFS — pick, read, write, list (partial worker-safe) |
| [indexedDB](./indexedDB.md) | `object` | `broadcastChannel` | Local key-value database with cross-tab notifications (`namespace`, `crossTab`) |
| [remoteStore](./remoteStore.md) | `object` | `ajax`, `ws`, `eventBus` | Remote key-value store — HTTP/WS transport, WS watch, batch, auto-reconnect |
| [storage](./storage.md) | `object` | `broadcastChannel` | localStorage / sessionStorage with BroadcastChannel cross-tab broadcast and `namespace` option |

## Common pattern

```js
const idb     = runtime.resolve('indexedDB');
const storage = runtime.resolve('storage');
const dl      = runtime.resolve('download');

// IndexedDB
const db = await idb.open('myApp', 1, (db) => {
    db.createObjectStore('cache');
});
await db.store('cache').set('key', { data: 'value' });
const val = await db.store('cache').get('key');

// localStorage
storage.local.set('token', 'abc123');
const token = storage.local.get('token');

// Download
dl.text('File contents', 'export.txt');
dl.bytes(uint8Array, 'image.png', 'image/png');
```
