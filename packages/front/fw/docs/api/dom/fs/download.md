---
module: download
category: dom/fs
dependencies: []
returns: object
worker-safe: false
status: complete
---

# download

> Client-side file download — triggers a save prompt without navigation.

**Module** `download` | **Source** `packages/front/fw/src/dom/fs/download.js` | **Deps** none | **Worker-safe** no

## Resolve

```js
const dl = runtime.resolve('download');
// Returns: { url, blob, bytes, text }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `url` | `(href: string, name: string) => void` | Download from an existing URL (`data:` or `blob:`) |
| `blob` | `(blob: Blob, name: string) => void` | Download a `Blob` (Object URL auto-revoked) |
| `bytes` | `(data: Uint8Array, name: string, type?: string) => void` | Download a `Uint8Array` (default `application/octet-stream`) |
| `text` | `(content: string, name: string, type?: string) => void` | Download a string (default `text/plain;charset=utf-8`) |

### `dl.url(href, name)`

Download from an existing URL (`data:` or `blob:`). The caller is responsible for revoking Object URLs.

```js
dl.url('data:text/plain;base64,SGVsbG8=', 'hello.txt');
dl.url(blobUrl, 'export.bin');
// ⚠ if blobUrl is an Object URL, revoke manually after
```

### `dl.blob(blob, name)`

Download a `Blob`. Creates and revokes the Object URL automatically.

```js
const blob = new Blob(['Hello World'], { type: 'text/plain' });
dl.blob(blob, 'hello.txt');
```

### `dl.bytes(data, name, type?)`

Download a `Uint8Array`. Default MIME type: `'application/octet-stream'`.

```js
dl.bytes(uint8Array, 'image.png', 'image/png');
dl.bytes(csvBytes, 'export.csv', 'text/csv;charset=utf-8');
dl.bytes(binaryData, 'data.bin');  // application/octet-stream
```

### `dl.text(content, name, type?)`

Download a string. Default MIME type: `'text/plain;charset=utf-8'`.

```js
dl.text('Line 1\nLine 2', 'export.txt');
dl.text(JSON.stringify(data, null, 2), 'data.json', 'application/json');
dl.text(csvContent, 'report.csv', 'text/csv;charset=utf-8');
```

## Examples

### Export of processed data

```js
const dl   = runtime.resolve('download');
const gzip = runtime.resolve('gzip');
const utf8 = runtime.resolve('utf8');

// Compressed JSON export
const json       = JSON.stringify(dataset, null, 2);
const compressed = gzip.gzipSync(utf8.toBytes(json));
dl.bytes(compressed, 'dataset.json.gz', 'application/gzip');

// Plain text export
dl.text(json, 'dataset.json', 'application/json');
```

### Export from a canvas

```js
const canvas = document.querySelector('canvas');
canvas.toBlob((blob) => {
    dl.blob(blob, 'screenshot.png');
}, 'image/png');
```

## Notes

- No navigation — the page stays in place.
- The browser shows a "Save as" prompt or saves automatically to the Downloads folder.
- Requires `document` and `URL.createObjectURL` (not available in workers).
- `dl.blob` and `dl.bytes` automatically revoke the Object URL after triggering.

## See also

- [ajax](../net/ajax.md) — fetch data to download
- [storage](./storage.md), [indexedDB](./indexedDB.md) — local data sources
