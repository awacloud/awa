---
module: zlib
category: io/compress
dependencies: [deflate, adler32]
returns: object
worker-safe: true
status: complete
---

# zlib

> Zlib compression/decompression (RFC 1950) — DEFLATE + 2-byte header + Adler32. Used by PNG, HTTP, and many binary formats.

**Module** `zlib` | **Source** `packages/front/fw/src/io/compress/zlib.js` | **Deps** `deflate`, `adler32` | **Worker-safe** yes

## Resolve

```js
const zlib = runtime.resolve('zlib');
// Returns: { zlibSync, unzlibSync, zlib, unzlib, ZlibStream, UnzlibStream }
```

## API

### Synchrone

```js
const compressed   = zlib.zlibSync(uint8Array, opts?);    // → Uint8Array
const decompressed = zlib.unzlibSync(compressed, opts?);  // → Uint8Array
```

### Asynchrone

```js
const compressed   = await zlib.zlib(uint8Array, opts?);
const decompressed = await zlib.unzlib(compressed, opts?);
```

### Streaming

```js
// Compression
const parts = [];
const comp = new zlib.ZlibStream(opts?, (chunk) => parts.push(chunk));
comp.push(data1);
comp.push(lastChunk, true);

// Decompression
const output = [];
const decomp = new zlib.UnzlibStream(opts?, (chunk) => output.push(chunk));
decomp.push(zlibChunk);
decomp.push(lastZlibChunk, true);
```

## Options

### Compression (`zlibSync`, `zlib`, `ZlibStream`)

| Option | Type | Description |
|--------|------|-------------|
| `level` | `0–9` | Compression level (default: 6) |
| `dictionary` | `Uint8Array` | Pre-compression dictionary |

### Decompression (`unzlibSync`, `unzlib`, `UnzlibStream`)

| Option | Type | Description |
|--------|------|-------------|
| `out` | `Uint8Array` | Pre-allocated output buffer |
| `dictionary` | `Uint8Array` | Matching dictionary |

## Internal format (RFC 1950)

```
[CMF 1B][FLG 1B] [DICTID 4B optional] [DEFLATE payload] [Adler32 4B big-endian]
```

CMF = `0x78` (CM=8 DEFLATE, CINFO=7 window 32K). FCHECK ensures `(CMF×256 + FLG) % 31 === 0`.

## Error codes

| Code | Meaning |
|------|---------|
| 6 | Invalid zlib data |

## Example

```js
const zlib = runtime.resolve('zlib');

const data = new TextEncoder().encode('<svg>...</svg>'.repeat(200));

const compressed   = zlib.zlibSync(data, { level: 9 });
const decompressed = zlib.unzlibSync(compressed);

// With dictionary (optimized compression for similar data)
const dict = new TextEncoder().encode('<svg><path d="');
const c = zlib.zlibSync(data, { level: 9, dictionary: dict });
const d = zlib.unzlibSync(c, { dictionary: dict });
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const zlib = libs.zlib;
        const compressed = zlib.zlibSync(args.data, { level: 6 });
        self.postMessage(compressed, [compressed.buffer]);
    },
    { dependencies: ['zlib'], args: { data: new Uint8Array(rawData) } }
);
```

## Notes

- Integrity checksum: Adler-32 (RFC 1950) computed on the uncompressed data — distinct from `gzip` which uses CRC-32.
- The zlib dictionary must be identical on both the compressor and decompressor sides — a mismatch produces a checksum error during decompression.
- The zlib format (CMF+FLG header) is not the same as gzip (magic bytes `1f 8b`) or raw deflate (no header) — use the correct module for the target format.

## See also

- [deflate](./deflate.md) — underlying engine
- [gzip](./gzip.md) — gzip format (CRC32 instead of Adler32)
- [zip](./zip.md) — multi-file archiving
- [adler32](../calc/adler32.md)
