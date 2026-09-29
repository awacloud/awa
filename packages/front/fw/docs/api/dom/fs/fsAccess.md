---
module: fsAccess
category: dom/fs
dependencies: []
returns: object
worker-safe: partial
status: complete
---

# fsAccess

> File System Access API + OPFS — pick, read, write, list files and directories.

**Module** `fsAccess` | **Source** `packages/front/fw/src/dom/fs/fsAccess.js` | **Deps** none | **Worker-safe** partial (OPFS yes — pickers no, DOM-bound)

`fsAccess` unifies two complementary browser APIs: the **File System Access API** (pickers triggered by a user gesture, main thread only) and the **Origin Private File System / OPFS** (`navigator.storage.getDirectory()`, origin-isolated sandbox, accessible from Workers). Both families expose the same `read` / `write` / handle helpers, making migration between contexts straightforward.

## Resolve

```js
const fs = runtime.resolve('fsAccess');
// Returns: { pickFile, pickFiles, pickDirectory, pickSave,
//              read, write, opfs, support,
//              getFile, getFileHandle, getDirectoryHandle, list, remove }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `support` | `() => SupportInfo` | `{fsa, opfs, writableStreams}` |
| `pickFile` | `(opts?) => Promise<FileSystemFileHandle \| null>` | null if cancelled |
| `pickFiles` | `(opts?) => Promise<FileSystemFileHandle[]>` | `[]` if cancelled |
| `pickDirectory` | `(opts?) => Promise<FileSystemDirectoryHandle \| null>` | null if cancelled |
| `pickSave` | `(opts?) => Promise<FileSystemFileHandle \| null>` | null if cancelled |
| `read` | `(handle, opts?) => Promise<Uint8Array \| string \| ReadableStream>` | based on `as` |
| `write` | `(handle, data, opts?) => Promise<void>` | — |
| `opfs` | `() => Promise<FileSystemDirectoryHandle>` | OPFS root |
| `getFile` | `(handle) => Promise<File>` | native File object |
| `getFileHandle` | `(dirHandle, name, opts?) => Promise<FileSystemFileHandle>` | — |
| `getDirectoryHandle` | `(dirHandle, name, opts?) => Promise<FileSystemDirectoryHandle>` | — |
| `list` | `(dirHandle) => AsyncGenerator<Entry>` | `{name, kind, handle}` |
| `remove` | `(dirHandle, name, opts?) => Promise<void>` | — |

### `support()`

Returns the capabilities available in the current context (main thread or worker):

```ts
{ fsa: boolean, opfs: boolean, writableStreams: boolean }
```

`fsa`: `showOpenFilePicker` available. `opfs`: `navigator.storage.getDirectory` available. `writableStreams`: `FileSystemWritableFileStream` or OPFS available.

### `pickFile(opts?)` / `pickFiles(opts?)` / `pickDirectory(opts?)` / `pickSave(opts?)`

Delegate directly to native APIs (`showOpenFilePicker`, `showSaveFilePicker`, `showDirectoryPicker`). All throw `Error('fsAccess: File System Access API not supported')` if `support().fsa === false`. They return `null` / `[]` if the user cancels (traps native `AbortError`); any other error is rethrown as-is (including `SecurityError` if called without a user gesture).

**Options `pickFile` / `pickFiles`:**

| Option | Type | Description |
|--------|------|-------------|
| `types` | `FilePickerAcceptType[]` | MIME / extension filters |
| `excludeAcceptAllOption` | `boolean` | Hides the "All files" filter |

**Options `pickDirectory`:**

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `mode` | `'read' \| 'readwrite'` | `'read'` | Requested access level |

**Options `pickSave`:**

| Option | Type | Description |
|--------|------|-------------|
| `suggestedName` | `string` | Pre-filled file name |
| `types` | `FilePickerAcceptType[]` | MIME / extension filters |

### `read(handle, opts?)`

| `as` option | Returned value |
|-------------|-----------------|
| `'bytes'` (default) | `Uint8Array` — raw contents |
| `'text'` | `string` — UTF-8 decoded |
| `'stream'` | `ReadableStream` — streaming access |

Throws `TypeError` if `handle` is invalid (null, object without `getFile`).

### `write(handle, data, opts?)`

`data` accepts: `Uint8Array`, `string`, `Blob`, `ReadableStream`. Creates a `FileSystemWritableFileStream`, writes the data, then closes the stream.

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `append` | `boolean` | `false` | Append at the end instead of overwriting |

Throws `TypeError` if `handle` is invalid.

### `opfs()`

Returns the `FileSystemDirectoryHandle` root of the OPFS (Origin Private File System). The promise is cached at instance level — successive calls return the same value without re-querying the browser.

Throws `Error('fsAccess: OPFS not supported')` if `support().opfs === false`.

### `list(dirHandle)`

Async generator that iterates `dirHandle.entries()` and returns `{ name: string, kind: 'file'|'directory', handle }` objects.

## Examples

### Open a user file (main thread)

```js
const fs = runtime.resolve('fsAccess');

const handle = await fs.pickFile({
    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
});
if (handle) {
    const text = await fs.read(handle, { as: 'text' });
    console.log(JSON.parse(text));
}
```

### Save an export (main thread)

```js
const fs = runtime.resolve('fsAccess');

const handle = await fs.pickSave({
    suggestedName: 'export.csv',
    types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }]
});
if (handle) {
    await fs.write(handle, 'col1,col2\n1,2\n');
}
```

### Use OPFS as application storage (worker-safe)

```js
const fs = runtime.resolve('fsAccess');

const root = await fs.opfs();
const fh = await fs.getFileHandle(root, 'cache.bin', { create: true });
await fs.write(fh, new Uint8Array([0x01, 0x02, 0x03]));
const data = await fs.read(fh); // Uint8Array
```

### Iterate an OPFS directory

```js
const fs = runtime.resolve('fsAccess');
const root = await fs.opfs();

for await (const entry of fs.list(root)) {
    console.log(entry.name, entry.kind); // 'cache.bin' 'file'
}
```

### Read an OPFS subdirectory

```js
const fs = runtime.resolve('fsAccess');
const root = await fs.opfs();
const subdir = await fs.getDirectoryHandle(root, 'myapp', { create: true });
const fh = await fs.getFileHandle(subdir, 'settings.json', { create: true });
await fs.write(fh, JSON.stringify({ theme: 'dark' }));
```

## Worker Usage

The OPFS part of the module is worker-safe. Pickers (`pick*`) require the main thread.

```js
// Inside a Worker:
const fs = runtime.resolve('fsAccess');
const { opfs } = fs;

const root = await opfs();
const fh = await fs.getFileHandle(root, 'worker-output.bin', { create: true });
await fs.write(fh, new Uint8Array(self.processedData));
```

For OPFS from a dedicated worker, `FileSystemSyncAccessHandle` (synchronous API) is accessible via `handle.createSyncAccessHandle()` — not wrapped by this module (direct access to the native handle).

## Notes

- Pickers (`pick*`) require a **user gesture** (click, keypress…) — a programmatic call triggers a native `SecurityError` not caught by the `AbortError` wrapper.
- `opfs()` caches the root per factory instance. With multi-instance (isolation: true), each instance has its own cache but points to the same origin OPFS.
- `write` with `append: true` positions the cursor at `file.size` before writing — this operation is not atomic and may produce corrupted data if multiple writers compete without a lock (see the `mutex` module).
- Pickers require an E2E test (real browser, J3+); unit tests cover `support()`, OPFS and error branches.
- Compatibility: FSA since Chrome 86+, Edge 86+, Opera 72+. OPFS since Chrome 86+, Firefox 111+, Safari 15.2+. Firefox < 111: OPFS unavailable.

## See also

- [indexedDB](./indexedDB.md) — structured key-value persistence (IndexedDB)
- [storage](./storage.md) — localStorage / sessionStorage cross-tab
- [download](./download.md) — file export without a picker
- [mutex](../../io/sync/mutex.md) — async lock for concurrent OPFS writers
